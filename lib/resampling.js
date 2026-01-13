/**
 * Bootstrap Resampling by Volatility Regimes
 * 
 * This module implements regime-based block bootstrap resampling where:
 * - Daily returns are computed using Rate of Change (ROC)
 * - Rolling volatility is calculated and bucketed into percentile regimes
 * - Contiguous blocks within each regime are shuffled while preserving regime proportions
 * - Synthetic price series are reconstructed from shuffled returns
 * 
 * Assumptions:
 * - Volatility is NOT annualized (uses raw 30-day rolling std of daily returns)
 * - OHLC reconstruction uses original candle body proportions relative to close
 * - First close is anchored to original series for comparability
 */

/**
 * Compute daily returns using Rate of Change (ROC)
 * r[t] = (close[t] / close[t-1]) - 1
 * 
 * @param {Array<{close: number}>} candles - Array of candle objects with close prices
 * @returns {Array<number|null>} - Array of returns (null for first element)
 */
export function computeReturns(candles) {
  if (!candles || candles.length < 2) return []
  
  const returns = [null] // First element has no return
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1]?.close
    const currClose = candles[i]?.close
    if (prevClose && prevClose !== 0 && currClose && isFinite(prevClose) && isFinite(currClose)) {
      const ret = (currClose / prevClose) - 1
      // Clamp extreme returns to avoid numerical issues
      if (isFinite(ret) && !isNaN(ret)) {
        returns.push(Math.max(-0.99, Math.min(10, ret))) // Clamp between -99% and +1000%
      } else {
        returns.push(null)
      }
    } else {
      returns.push(null)
    }
  }
  return returns
}

/**
 * Compute rolling standard deviation of returns
 * 
 * @param {Array<number|null>} returns - Array of daily returns
 * @param {number} window - Rolling window size (default 30)
 * @returns {Array<number|null>} - Array of rolling std values (null for first window-1 elements)
 */
export function rollingStd(returns, window = 30) {
  if (!returns || returns.length < window) return returns.map(() => null)
  
  const result = []
  
  for (let i = 0; i < returns.length; i++) {
    if (i < window - 1) {
      result.push(null)
      continue
    }
    
    // Get window of returns, filtering out nulls
    const windowReturns = returns.slice(i - window + 1, i + 1).filter(r => r !== null)
    
    if (windowReturns.length < window * 0.5) {
      // If less than half of window has valid data, skip
      result.push(null)
      continue
    }
    
    // Calculate standard deviation
    const mean = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length
    const variance = windowReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / windowReturns.length
    result.push(Math.sqrt(variance))
  }
  
  return result
}

/**
 * Compute percentile ranks for an array of values
 * Returns values between 0 and 100
 * 
 * @param {Array<number|null>} values - Array of values
 * @returns {Array<number|null>} - Percentile ranks (0-100), null for null inputs
 */
export function percentileRanks(values) {
  if (!values || values.length === 0) return []
  
  // Get valid (non-null) values and sort them
  const validValues = values.filter(v => v !== null)
  if (validValues.length === 0) return values.map(() => null)
  
  const sorted = [...validValues].sort((a, b) => a - b)
  
  return values.map(v => {
    if (v === null) return null
    
    // Find position in sorted array (use average position for ties)
    let lower = 0
    let upper = 0
    for (const sv of sorted) {
      if (sv < v) lower++
      if (sv <= v) upper++
    }
    
    // Percentile rank: percentage of values that fall below or equal
    const rank = ((lower + upper) / 2) / sorted.length * 100
    return Math.min(99.99, rank) // Cap at 99.99 to avoid bucket overflow
  })
}

/**
 * Assign bucket indices based on percentile ranks and bucket size
 * 
 * @param {Array<number|null>} ranks - Percentile ranks (0-100)
 * @param {number} bucketSizePercent - Size of each bucket in percentiles (e.g., 20 = 5 buckets)
 * @returns {Array<number|null>} - Bucket indices (0-based), null for null inputs
 */
export function bucketizeByPercentile(ranks, bucketSizePercent) {
  if (!ranks || ranks.length === 0) return []
  if (bucketSizePercent <= 0 || bucketSizePercent > 100) {
    throw new Error('bucketSizePercent must be between 1 and 100')
  }
  
  return ranks.map(rank => {
    if (rank === null) return null
    return Math.floor(rank / bucketSizePercent)
  })
}

/**
 * Build contiguous blocks of candles with the same bucket
 * Each block contains candles that share the same volatility regime
 * 
 * @param {Array<Object>} candles - Array of candle objects
 * @param {Array<number|null>} buckets - Bucket indices for each candle
 * @returns {Array<{bucket: number, startIdx: number, endIdx: number, candles: Array, returns: Array}>}
 */
export function buildBlocks(candles, buckets) {
  if (!candles || candles.length === 0) return []
  if (candles.length !== buckets.length) {
    throw new Error('candles and buckets must have the same length')
  }
  
  const blocks = []
  let currentBlock = null
  
  for (let i = 0; i < candles.length; i++) {
    const bucket = buckets[i]
    
    // Skip null buckets (first window-1 days)
    if (bucket === null) {
      if (currentBlock) {
        blocks.push(currentBlock)
        currentBlock = null
      }
      continue
    }
    
    if (currentBlock === null || currentBlock.bucket !== bucket) {
      // Start new block
      if (currentBlock) {
        blocks.push(currentBlock)
      }
      currentBlock = {
        bucket,
        startIdx: i,
        endIdx: i,
        candles: [candles[i]],
        returns: []
      }
    } else {
      // Extend current block
      currentBlock.endIdx = i
      currentBlock.candles.push(candles[i])
    }
  }
  
  // Don't forget the last block
  if (currentBlock) {
    blocks.push(currentBlock)
  }
  
  // Compute returns for each block
  for (const block of blocks) {
    block.returns = computeReturns(block.candles)
  }
  
  return blocks
}

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * 
 * @param {number} seed - Integer seed
 * @returns {function} - Function that returns next random number in [0, 1)
 */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates shuffle with seeded random
 * 
 * @param {Array} array - Array to shuffle
 * @param {function} random - Random function returning [0, 1)
 * @returns {Array} - Shuffled copy of array
 */
function shuffleArray(array, random) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Shuffle blocks within each bucket, preserving bucket counts
 * Blocks with the same bucket are randomly permuted
 * 
 * @param {Array<Object>} blocks - Array of block objects
 * @param {number} seed - Random seed for reproducibility
 * @returns {Array<Object>} - New array of blocks with shuffled order within buckets
 */
export function shuffleBlocksByBucket(blocks, seed = 42) {
  if (!blocks || blocks.length === 0) return []
  
  const random = mulberry32(seed)
  
  // Group blocks by bucket
  const bucketGroups = {}
  for (const block of blocks) {
    if (!bucketGroups[block.bucket]) {
      bucketGroups[block.bucket] = []
    }
    bucketGroups[block.bucket].push(block)
  }
  
  // Shuffle within each bucket
  const shuffledGroups = {}
  for (const [bucket, group] of Object.entries(bucketGroups)) {
    shuffledGroups[bucket] = shuffleArray(group, random)
  }
  
  // Reconstruct the block sequence: maintain original bucket pattern but use shuffled blocks
  const result = []
  const usedIndices = {}
  
  for (const block of blocks) {
    const bucket = block.bucket
    if (!usedIndices[bucket]) usedIndices[bucket] = 0
    
    // Take the next shuffled block from this bucket
    const shuffledBlock = shuffledGroups[bucket][usedIndices[bucket]]
    usedIndices[bucket]++
    
    result.push({
      ...shuffledBlock,
      originalBucket: bucket
    })
  }
  
  return result
}

/**
 * Reconstruct a synthetic price series from shuffled blocks
 * Anchors first close to the original and applies shuffled returns
 * 
 * OHLC Reconstruction approach:
 * - For each candle, we store its original ratios: open/close, high/close, low/close
 * - When reconstructing, we apply these ratios to the new synthetic close
 * 
 * @param {number} initialClose - Starting close price (anchor point)
 * @param {Array<Object>} shuffledBlocks - Blocks after shuffling
 * @param {Array<Object>} originalCandles - Original candle data for ratio reference
 * @returns {Array<Object>} - Reconstructed synthetic candles with date, open, high, low, close
 */
export function reconstructSeriesFromBlocks(initialClose, shuffledBlocks, originalCandles) {
  if (!shuffledBlocks || shuffledBlocks.length === 0) return []
  
  const syntheticCandles = []
  let currentClose = initialClose || 1
  let dateIdx = 0
  
  for (const block of shuffledBlocks) {
    for (let i = 0; i < block.candles.length; i++) {
      const originalCandle = block.candles[i]
      
      // Apply return to get new close (skip first candle of first block)
      if (syntheticCandles.length > 0 && block.returns[i] !== null && !isNaN(block.returns[i]) && isFinite(block.returns[i])) {
        const newClose = currentClose * (1 + block.returns[i])
        // Validate the new close is a valid positive number
        if (isFinite(newClose) && !isNaN(newClose) && newClose > 0) {
          currentClose = newClose
        }
        // If invalid, keep the previous close (skip this return)
      }
      
      // Compute OHLC ratios from original candle
      const origClose = originalCandle.close || 1
      const openRatio = origClose !== 0 && isFinite(originalCandle.open / origClose) ? originalCandle.open / origClose : 1
      const highRatio = origClose !== 0 && isFinite(originalCandle.high / origClose) ? originalCandle.high / origClose : 1
      const lowRatio = origClose !== 0 && isFinite(originalCandle.low / origClose) ? originalCandle.low / origClose : 1
      
      // Apply ratios to synthetic close
      const syntheticOpen = currentClose * openRatio
      const syntheticHigh = currentClose * highRatio
      const syntheticLow = currentClose * lowRatio
      
      // Use original dates but in new order
      const originalDate = originalCandles[dateIdx]?.date || originalCandle.date || `point-${dateIdx}`
      
      syntheticCandles.push({
        date: originalDate,
        open: isFinite(syntheticOpen) ? syntheticOpen : currentClose,
        high: Math.max(syntheticHigh, syntheticOpen, currentClose),
        low: Math.min(syntheticLow, syntheticOpen, currentClose),
        close: currentClose,
        bucket: block.bucket
      })
      
      dateIdx++
    }
  }
  
  return syntheticCandles
}

/**
 * Calculate key metrics for a candle series
 * 
 * @param {Array<Object>} candles - Array of candle objects
 * @returns {Object} - Metrics: totalReturn, maxDrawdown, realizedVolatility
 */
export function calculateSeriesMetrics(candles) {
  if (!candles || candles.length < 2) {
    return { totalReturn: 0, maxDrawdown: 0, realizedVolatility: 0 }
  }
  
  // Filter valid candles
  const validCandles = candles.filter(c => c && typeof c.close === 'number' && isFinite(c.close) && c.close > 0)
  if (validCandles.length < 2) {
    return { totalReturn: 0, maxDrawdown: 0, realizedVolatility: 0 }
  }
  
  const returns = computeReturns(validCandles).filter(r => r !== null && isFinite(r))
  
  // Total return
  const firstClose = validCandles[0].close
  const lastClose = validCandles[validCandles.length - 1].close
  let totalReturn = (lastClose - firstClose) / firstClose
  if (!isFinite(totalReturn)) totalReturn = 0
  
  // Max drawdown
  let peak = validCandles[0].close
  let maxDrawdown = 0
  for (const candle of validCandles) {
    if (candle.close > peak) peak = candle.close
    const drawdown = peak > 0 ? (peak - candle.close) / peak : 0
    if (isFinite(drawdown) && drawdown > maxDrawdown) maxDrawdown = drawdown
  }
  
  // Realized volatility (annualized: sqrt(252) * daily std)
  if (returns.length > 0) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    const dailyStd = Math.sqrt(variance)
    let annualizedVol = dailyStd * Math.sqrt(252)
    if (!isFinite(annualizedVol)) annualizedVol = 0
    
    return { totalReturn, maxDrawdown, realizedVolatility: annualizedVol }
  }
  
  return { totalReturn, maxDrawdown, realizedVolatility: 0 }
}

/**
 * Main function to perform bootstrap resampling
 * 
 * @param {Array<Object>} candles - Original candle data
 * @param {number} volatilityPercent - Bucket size in percentiles (e.g., 20 = 5 buckets)
 * @param {number} numShuffles - Number of shuffle iterations to generate
 * @param {number} baseSeed - Base random seed
 * @returns {Object} - { original, resamples, bucketInfo }
 */
export function performBootstrapResampling(candles, volatilityPercent = 20, numShuffles = 10, baseSeed = 42) {
  if (!candles || candles.length < 31) {
    throw new Error('Need at least 31 candles for 30-day rolling volatility')
  }
  
  // Step 1: Compute returns
  const returns = computeReturns(candles)
  
  // Step 2: Compute rolling 30-day volatility
  const vol30 = rollingStd(returns, 30)
  
  // Step 3: Convert to percentile ranks and bucketize
  const ranks = percentileRanks(vol30)
  const buckets = bucketizeByPercentile(ranks, volatilityPercent)
  
  // Count buckets for verification
  const bucketCounts = {}
  buckets.forEach(b => {
    if (b !== null) {
      bucketCounts[b] = (bucketCounts[b] || 0) + 1
    }
  })
  
  // Step 4: Build blocks
  const blocks = buildBlocks(candles, buckets)
  
  // Original metrics
  const originalMetrics = calculateSeriesMetrics(candles)
  
  // Step 5: Generate shuffled resamples
  const resamples = []
  for (let i = 0; i < numShuffles; i++) {
    const seed = baseSeed + i * 1000
    const shuffledBlocks = shuffleBlocksByBucket(blocks, seed)
    
    // Step 6: Reconstruct synthetic series
    const syntheticCandles = reconstructSeriesFromBlocks(candles[0].close, shuffledBlocks, candles)
    const metrics = calculateSeriesMetrics(syntheticCandles)
    
    resamples.push({
      index: i,
      seed,
      candles: syntheticCandles,
      metrics
    })
  }
  
  return {
    original: {
      candles,
      metrics: originalMetrics
    },
    resamples,
    bucketInfo: {
      volatilityPercent,
      numBuckets: Math.ceil(100 / volatilityPercent),
      bucketCounts,
      totalBlocks: blocks.length
    }
  }
}

// ============ TESTS ============

/**
 * Test that bucket counts are preserved after shuffling
 */
export function testBucketCountsPreserved() {
  // Create mock data
  const candles = Array.from({ length: 100 }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99 + i * 0.5,
    close: 100 + i * 0.5 + Math.sin(i * 0.3) * 2
  }))
  
  const returns = computeReturns(candles)
  const vol30 = rollingStd(returns, 30)
  const ranks = percentileRanks(vol30)
  const buckets = bucketizeByPercentile(ranks, 20)
  const blocks = buildBlocks(candles, buckets)
  
  // Count buckets in original blocks
  const originalCounts = {}
  blocks.forEach(b => {
    originalCounts[b.bucket] = (originalCounts[b.bucket] || 0) + 1
  })
  
  // Shuffle and count
  const shuffled = shuffleBlocksByBucket(blocks, 12345)
  const shuffledCounts = {}
  shuffled.forEach(b => {
    shuffledCounts[b.bucket] = (shuffledCounts[b.bucket] || 0) + 1
  })
  
  // Verify counts match
  const passed = JSON.stringify(originalCounts) === JSON.stringify(shuffledCounts)
  
  return {
    passed,
    originalCounts,
    shuffledCounts
  }
}

/**
 * Test bucketization with various bucket sizes
 */
export function testBucketization() {
  const ranks = [0, 10, 25, 50, 75, 90, 99]
  
  const tests = [
    { bucketSize: 20, expected: [0, 0, 1, 2, 3, 4, 4] },
    { bucketSize: 25, expected: [0, 0, 1, 2, 3, 3, 3] },
    { bucketSize: 50, expected: [0, 0, 0, 1, 1, 1, 1] }
  ]
  
  const results = tests.map(({ bucketSize, expected }) => {
    const result = bucketizeByPercentile(ranks, bucketSize)
    const passed = JSON.stringify(result) === JSON.stringify(expected)
    return { bucketSize, expected, result, passed }
  })
  
  return results
}
