'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'

export default function DocumentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('indicators')
  
  if (status === 'loading') {
    return <div className={styles.loading}>Loading...</div>
  }
  
  if (!session) {
    router.push('/login')
    return null
  }

  const sections = [
    { id: 'indicators', label: 'Indicators', icon: 'show_chart' },
    { id: 'backtest', label: 'Backtest Engine', icon: 'analytics' },
    { id: 'strategy', label: 'Strategy & Signals', icon: 'psychology' },
    { id: 'optimization', label: 'Optimization', icon: 'tune' },
    { id: 'resampling', label: 'Bootstrap Resampling', icon: 'shuffle' },
    { id: 'montecarlo', label: 'Monte Carlo', icon: 'casino' },
    { id: 'metrics', label: 'Performance Metrics', icon: 'assessment' },
    { id: 'dsl', label: 'DSL Evaluation', icon: 'code' },
  ]

  return (
    <div className={styles.container}>
      <Sidebar />
      <div className={styles.mainContent}>
        <TopBar />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>
              <span className="material-icons">menu_book</span>
              Technical Documentation
            </h1>
            <p>Complete logic and calculation reference for AlphaLabs backtesting system</p>
          </div>

          <div className={styles.layout}>
            {/* Navigation Sidebar */}
            <nav className={styles.navSidebar}>
              {sections.map(section => (
                <button
                  key={section.id}
                  className={`${styles.navItem} ${activeSection === section.id ? styles.active : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="material-icons">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </nav>

            {/* Content Area */}
            <div className={styles.docContent}>
              {activeSection === 'indicators' && <IndicatorsSection />}
              {activeSection === 'backtest' && <BacktestSection />}
              {activeSection === 'strategy' && <StrategySection />}
              {activeSection === 'optimization' && <OptimizationSection />}
              {activeSection === 'resampling' && <ResamplingSection />}
              {activeSection === 'montecarlo' && <MonteCarloSection />}
              {activeSection === 'metrics' && <MetricsSection />}
              {activeSection === 'dsl' && <DSLSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function IndicatorsSection() {
  return (
    <div className={styles.section}>
      <h2>Technical Indicators</h2>
      <p className={styles.intro}>
        All indicators are calculated on the Close price by default. Results are cached by data hash and parameters for performance.
      </p>

      {/* EMA */}
      <div className={styles.indicator}>
        <h3>EMA (Exponential Moving Average)</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            EMA[t] = Close[t] × multiplier + EMA[t-1] × (1 - multiplier)<br/>
            where multiplier = 2 / (period + 1)
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_ema(data, period):
    return data['Close'].ewm(span=period, adjust=False).mean()`}</pre>
        </div>
        <div className={styles.params}>
          <strong>Parameters:</strong>
          <ul>
            <li><code>period</code>: Lookback window (e.g., 12, 26)</li>
          </ul>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Uses pandas <code>ewm()</code> with <code>adjust=False</code> for true recursive EMA</li>
            <li>First value uses initial close as seed</li>
          </ul>
        </div>
      </div>

      {/* MA */}
      <div className={styles.indicator}>
        <h3>MA (Simple Moving Average)</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            MA[t] = (Close[t] + Close[t-1] + ... + Close[t-period+1]) / period
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_ma(data, period):
    return data['Close'].rolling(window=period).mean()`}</pre>
        </div>
        <div className={styles.params}>
          <strong>Parameters:</strong>
          <ul>
            <li><code>period</code>: Lookback window</li>
          </ul>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>First <code>period - 1</code> values are NaN</li>
            <li>Equal weighting for all periods</li>
          </ul>
        </div>
      </div>

      {/* DEMA */}
      <div className={styles.indicator}>
        <h3>DEMA (Double Exponential Moving Average)</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            EMA1 = EMA(Close, period)<br/>
            EMA2 = EMA(EMA1, period)<br/>
            DEMA = 2 × EMA1 - EMA2
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_dema(data, period):
    ema1 = data['Close'].ewm(span=period, adjust=False).mean()
    ema2 = ema1.ewm(span=period, adjust=False).mean()
    return 2 * ema1 - ema2`}</pre>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Reduces lag compared to single EMA</li>
            <li>More responsive to price changes</li>
          </ul>
        </div>
      </div>

      {/* RSI */}
      <div className={styles.indicator}>
        <h3>RSI (Relative Strength Index)</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            delta = Close[t] - Close[t-1]<br/>
            gain = max(delta, 0)<br/>
            loss = max(-delta, 0)<br/>
            avg_gain = rolling_mean(gain, period)<br/>
            avg_loss = rolling_mean(loss, period)<br/>
            RS = avg_gain / avg_loss<br/>
            RSI = 100 - (100 / (1 + RS))
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_rsi(data, period=14):
    delta = data['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))`}</pre>
        </div>
        <div className={styles.params}>
          <strong>Parameters:</strong>
          <ul>
            <li><code>period</code>: Lookback window (default: 14)</li>
            <li><code>top</code>: Overbought threshold (default: 70)</li>
            <li><code>bottom</code>: Oversold threshold (default: 30)</li>
          </ul>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Output range: 0-100</li>
            <li>Uses SMA for averaging gains/losses (Wilder's original method uses EMA)</li>
          </ul>
        </div>
      </div>

      {/* CCI */}
      <div className={styles.indicator}>
        <h3>CCI (Commodity Channel Index)</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            TP (Typical Price) = (High + Low + Close) / 3<br/>
            SMA_TP = SMA(TP, period)<br/>
            Mean_Deviation = mean(|TP - SMA_TP|) over period<br/>
            CCI = (TP - SMA_TP) / (0.015 × Mean_Deviation)
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_cci(data, period=20):
    tp = (data['High'] + data['Low'] + data['Close']) / 3
    sma_tp = tp.rolling(window=period).mean()
    mean_deviation = tp.rolling(window=period).apply(
        lambda x: (x - x.mean()).abs().mean()
    )
    return (tp - sma_tp) / (0.015 * mean_deviation)`}</pre>
        </div>
        <div className={styles.params}>
          <strong>Parameters:</strong>
          <ul>
            <li><code>period</code>: Lookback window (default: 20)</li>
            <li><code>top</code>: Overbought threshold (default: 100)</li>
            <li><code>bottom</code>: Oversold threshold (default: -100)</li>
          </ul>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>0.015 constant scales ~70-80% of values to fall within ±100</li>
            <li>No fixed range - can exceed ±200 in volatile markets</li>
          </ul>
        </div>
      </div>

      {/* Z-Score */}
      <div className={styles.indicator}>
        <h3>Z-Score</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            mean = SMA(Close, period)<br/>
            std = Rolling_StdDev(Close, period)<br/>
            Z-Score = (Close - mean) / std
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_zscore(data, period=20):
    close = data['Close']
    mean = close.rolling(window=period).mean()
    std = close.rolling(window=period).std()
    return (close - mean) / std`}</pre>
        </div>
        <div className={styles.params}>
          <strong>Parameters:</strong>
          <ul>
            <li><code>period</code>: Lookback window (default: 20)</li>
            <li><code>top</code>: Upper threshold (default: 2)</li>
            <li><code>bottom</code>: Lower threshold (default: -2)</li>
          </ul>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Measures standard deviations from rolling mean</li>
            <li>Assumes normal distribution; ~95% values within ±2</li>
          </ul>
        </div>
      </div>

      {/* Rolling Std */}
      <div className={styles.indicator}>
        <h3>Rolling Standard Deviation</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            Roll_Std = sqrt( Σ(Close[i] - mean)² / n ) over period
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_roll_std(data, period=20):
    return data['Close'].rolling(window=period).std()`}</pre>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Uses sample standard deviation (ddof=1 by default in pandas)</li>
            <li>Measures price volatility over window</li>
          </ul>
        </div>
      </div>

      {/* Rolling Median */}
      <div className={styles.indicator}>
        <h3>Rolling Median</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            Roll_Median = Median of Close prices over period
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_roll_median(data, period=20):
    return data['Close'].rolling(window=period).median()`}</pre>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>More robust to outliers than mean</li>
            <li>Used for price cross signals</li>
          </ul>
        </div>
      </div>

      {/* Rolling Percentile */}
      <div className={styles.indicator}>
        <h3>Rolling Percentile</h3>
        <div className={styles.formula}>
          <strong>Formula:</strong>
          <code>
            Position = (Current_Close - Min) / (Max - Min) × 100<br/>
            where Min, Max are over the rolling period
          </code>
        </div>
        <div className={styles.implementation}>
          <strong>Implementation:</strong>
          <pre>{`def calculate_roll_percentile(data, period=20, percentile=50):
    return data['Close'].rolling(window=period).apply(
        lambda x: (x.iloc[-1] - x.min()) / (x.max() - x.min()) * 100 
        if x.max() != x.min() else 50
    )`}</pre>
        </div>
        <div className={styles.notes}>
          <strong>Notes:</strong>
          <ul>
            <li>Output range: 0-100</li>
            <li>100 = at period high, 0 = at period low</li>
            <li>Returns 50 if range is zero (flat market)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function BacktestSection() {
  return (
    <div className={styles.section}>
      <h2>Backtest Engine</h2>
      <p className={styles.intro}>
        The backtest engine simulates trading based on indicator signals, handling position management, stop losses, and P&L calculation.
      </p>

      <div className={styles.subsection}>
        <h3>Function Signature</h3>
        <pre>{`run_backtest(
    data,                    # DataFrame with OHLC data
    initial_capital=10000,   # Starting capital
    enable_short=True,       # Allow short positions
    interval='1d',           # Data interval
    strategy_mode='reversal', # Trading mode
    ema_fast=12,             # Fast EMA period (legacy)
    ema_slow=26,             # Slow EMA period (legacy)
    indicator_type='ema',    # Indicator type
    indicator_params=None,   # Indicator-specific parameters
    entry_delay=1,           # Bars to wait before entry
    exit_delay=1,            # Bars to wait before exit
    use_stop_loss=True,      # Enable stop loss
    dsl=None                 # DSL for saved strategies
)`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Strategy Modes</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Code</th>
              <th>Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>A: Reversal</strong></td>
              <td><code>reversal</code></td>
              <td>Always in market. Exit + immediately enter opposite on signal.</td>
            </tr>
            <tr>
              <td><strong>B: Wait for Next</strong></td>
              <td><code>wait_for_next</code></td>
              <td>Exit on signal, wait for NEXT signal to re-enter. Allows flat periods.</td>
            </tr>
            <tr>
              <td><strong>C: Long Only</strong></td>
              <td><code>long_only</code></td>
              <td>Only enter long positions on Golden Cross signals.</td>
            </tr>
            <tr>
              <td><strong>D: Short Only</strong></td>
              <td><code>short_only</code></td>
              <td>Only enter short positions on Death Cross signals.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.subsection}>
        <h3>Main Loop Logic (Per Bar)</h3>
        <pre>{`for i in range(1, len(data)):
    current_row = data.iloc[i]
    prev_row = data.iloc[i-1]
    
    # 1. Get signal from DSL or indicator
    if use_dsl:
        dsl_entry_met = evaluate_dsl_condition(dsl['entry'], current_row, ...)
        dsl_exit_met = evaluate_dsl_condition(dsl['exit'], current_row, ...)
        
        # Detect TRANSITION (first bar where condition becomes true)
        entry_transition = dsl_entry_met and not prev_dsl_entry_met
        
        if entry_transition and position is None:
            has_crossover = True
            crossover_type = 'long'
    else:
        has_crossover, crossover_type, reason = check_entry_signal_indicator(...)
    
    # 2. Check pending exit (if delay > 1)
    if pending_exit and i >= pending_exit['execute_at'] and position:
        # Close position at current price
        # Calculate P&L
        # Record trade
    
    # 3. Check exit conditions (if position exists)
    elif position and no pending_exit:
        # Check stop loss first
        if use_stop_loss and position['stop_loss']:
            if long: stop_hit = current_low <= stop_loss
            if short: stop_hit = current_high >= stop_loss
        
        # Check for exit signal
        if dsl: exit_signal = dsl_exit_met
        else: exit_signal = opposite crossover detected
        
        if stop_hit or exit_signal:
            if exit_delay <= 1 or stop_hit:
                # Immediate exit
            else:
                # Schedule delayed exit
    
    # 4. Execute pending entry (if delay > 1)
    if pending_entry and i >= pending_entry['execute_at'] and not position:
        # Enter position at current price
        # Calculate stop loss
    
    # 5. Check entry signal (if no position)
    if not position and not pending_entry and has_crossover:
        # Check strategy mode rules
        if should_enter:
            if entry_delay <= 1:
                # Immediate entry
            else:
                # Schedule delayed entry`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>P&L Calculation</h3>
        <pre>{`# For LONG positions:
exit_value = shares × exit_price
pnl = exit_value - entry_capital
pnl_pct = (pnl / entry_capital) × 100
new_capital = exit_value

# For SHORT positions:
entry_value = shares × entry_price
exit_value = shares × exit_price
pnl = entry_value - exit_value  # Profit when exit < entry
pnl_pct = (pnl / entry_capital) × 100
new_capital = entry_capital + pnl`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Position Sizing</h3>
        <pre>{`shares = capital / entry_price
# Full capital is used for each position
# No partial sizing or risk-based position sizing`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Entry/Exit Delay</h3>
        <ul>
          <li><code>delay = 0</code>: Enter/exit at signal bar's close</li>
          <li><code>delay = 1</code>: Enter/exit at next bar's close (default)</li>
          <li><code>delay = N</code>: Enter/exit N bars after signal</li>
          <li>Stop loss always triggers immediately (ignores delay)</li>
        </ul>
      </div>
    </div>
  )
}

function StrategySection() {
  return (
    <div className={styles.section}>
      <h2>Strategy & Signal Detection</h2>
      <p className={styles.intro}>
        Entry and exit signals are generated based on indicator crossovers or threshold breaches.
      </p>

      <div className={styles.subsection}>
        <h3>Crossover Signals (EMA, MA, DEMA)</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Condition</th>
              <th>Entry Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Golden Cross</strong></td>
              <td>Fast MA crosses ABOVE Slow MA<br/>
                <code>prev_fast ≤ prev_slow AND current_fast &gt; current_slow</code>
              </td>
              <td>LONG</td>
            </tr>
            <tr>
              <td><strong>Death Cross</strong></td>
              <td>Fast MA crosses BELOW Slow MA<br/>
                <code>prev_fast ≥ prev_slow AND current_fast &lt; current_slow</code>
              </td>
              <td>SHORT</td>
            </tr>
          </tbody>
        </table>
        <pre>{`def check_entry_signal_ema(data_row, prev_row, params):
    fast_period = params.get('fast', 12)
    slow_period = params.get('slow', 26)
    
    ema_fast_current = data_row[f'EMA{fast_period}']
    ema_slow_current = data_row[f'EMA{slow_period}']
    ema_fast_prev = prev_row[f'EMA{fast_period}']
    ema_slow_prev = prev_row[f'EMA{slow_period}']
    
    # Long: Fast crosses above Slow
    if ema_fast_prev <= ema_slow_prev and ema_fast_current > ema_slow_current:
        return True, 'Long', 'Golden Cross'
    
    # Short: Fast crosses below Slow
    elif ema_fast_prev >= ema_slow_prev and ema_fast_current < ema_slow_current:
        return True, 'Short', 'Death Cross'
    
    return False, None, None`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Threshold Signals (RSI, CCI, Z-Score)</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Condition</th>
              <th>Entry Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Oversold Recovery</strong></td>
              <td>Indicator crosses ABOVE bottom threshold<br/>
                <code>prev_value ≤ bottom AND current_value &gt; bottom</code>
              </td>
              <td>LONG</td>
            </tr>
            <tr>
              <td><strong>Overbought Rejection</strong></td>
              <td>Indicator crosses BELOW top threshold<br/>
                <code>prev_value ≥ top AND current_value &lt; top</code>
              </td>
              <td>SHORT</td>
            </tr>
          </tbody>
        </table>
        <pre>{`def check_entry_signal_rsi(data_row, prev_row, params):
    period = params.get('length', 14)
    overbought = params.get('top', 70)
    oversold = params.get('bottom', 30)
    
    rsi_current = data_row[f'RSI{period}']
    rsi_prev = prev_row[f'RSI{period}']
    
    # Long: RSI crosses above oversold
    if rsi_prev <= oversold and rsi_current > oversold:
        return True, 'Long', f'RSI crossed above {oversold}'
    
    # Short: RSI crosses below overbought
    elif rsi_prev >= overbought and rsi_current < overbought:
        return True, 'Short', f'RSI crossed below {overbought}'
    
    return False, None, None`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Stop Loss Calculation</h3>
        <pre>{`def calculate_support_resistance(data, current_idx, lookback=50):
    """Calculate support/resistance from recent price action"""
    lookback_data = data.iloc[max(0, current_idx - lookback):current_idx + 1]
    support = lookback_data['Low'].min()
    resistance = lookback_data['High'].max()
    return support, resistance

def calculate_stop_loss(signal_type, entry_price, support, resistance):
    """Set stop loss based on support/resistance"""
    if signal_type == 'Long':
        # Use support level, or 5% below entry
        if support and support < entry_price:
            return support
        else:
            return entry_price * 0.95
    else:  # Short
        # Use resistance level, or 5% above entry
        if resistance and resistance > entry_price:
            return resistance
        else:
            return entry_price * 1.05`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Exit Conditions</h3>
        <ol>
          <li><strong>Stop Loss Hit</strong> (checked first)
            <ul>
              <li>Long: <code>current_low ≤ stop_loss</code></li>
              <li>Short: <code>current_high ≥ stop_loss</code></li>
            </ul>
          </li>
          <li><strong>Opposite Signal</strong>
            <ul>
              <li>Exit Long when Short signal appears</li>
              <li>Exit Short when Long signal appears</li>
            </ul>
          </li>
          <li><strong>DSL Exit Condition</strong> (if using saved strategy)</li>
        </ol>
      </div>
    </div>
  )
}

function OptimizationSection() {
  return (
    <div className={styles.section}>
      <h2>Parameter Optimization</h2>
      <p className={styles.intro}>
        The optimization engine tests parameter combinations to find optimal settings using grid search.
      </p>

      <div className={styles.subsection}>
        <h3>Crossover Indicator Optimization (EMA, MA, DEMA)</h3>
        <pre>{`def run_optimization_backtest(data, ema_short, ema_long, 
                               initial_capital, position_type, 
                               risk_free_rate, indicator_type):
    """
    Run simplified backtest for optimization heatmap
    """
    # Calculate indicators
    if indicator_type == 'ma':
        data['EMA_Short'] = calculate_ma(data, ema_short)
        data['EMA_Long'] = calculate_ma(data, ema_long)
    elif indicator_type == 'dema':
        data['EMA_Short'] = calculate_dema(data, ema_short)
        data['EMA_Long'] = calculate_dema(data, ema_long)
    else:  # EMA
        data['EMA_Short'] = calculate_ema(data, ema_short)
        data['EMA_Long'] = calculate_ema(data, ema_long)
    
    # Generate signals
    data['Signal'] = 0
    if position_type == 'long_only':
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
    elif position_type == 'short_only':
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    else:  # both
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    
    # Calculate strategy returns
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Signal'].shift(1) * data['Returns']
    
    # Compute metrics
    equity = initial_capital * (1 + strategy_returns).cumprod()
    total_return = (equity[-1] / initial_capital) - 1
    sharpe = calculate_sharpe_ratio(strategy_returns, risk_free_rate)
    max_dd = calculate_max_drawdown(equity)
    
    return {
        'sharpe_ratio': sharpe,
        'total_return': total_return,
        'max_drawdown': max_dd,
        'win_rate': win_rate,
        'total_trades': trades
    }`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Threshold Indicator Optimization (RSI, CCI, Z-Score)</h3>
        <pre>{`def run_indicator_optimization_backtest(data, indicator_type, 
                                         indicator_length, 
                                         indicator_top, indicator_bottom,
                                         initial_capital, position_type):
    """
    Optimize threshold-based indicators
    """
    # Calculate indicator
    if indicator_type == 'rsi':
        data[f'RSI{indicator_length}'] = calculate_rsi(data, indicator_length)
    elif indicator_type == 'cci':
        data[f'CCI{indicator_length}'] = calculate_cci(data, indicator_length)
    elif indicator_type == 'zscore':
        data[f'ZScore{indicator_length}'] = calculate_zscore(data, indicator_length)
    
    # Generate signals on threshold crossovers
    for idx in range(indicator_length + 1, len(data)):
        current_val = data.loc[data.index[idx], indicator_col]
        prev_val = data.loc[data.index[idx - 1], indicator_col]
        
        # Long signal: crosses above bottom threshold
        if prev_val <= indicator_bottom and current_val > indicator_bottom:
            if position_type in ['both', 'long_only']:
                data.loc[data.index[idx], 'Signal'] = 1
        
        # Short signal: crosses below top threshold
        elif prev_val >= indicator_top and current_val < indicator_top:
            if position_type in ['both', 'short_only']:
                data.loc[data.index[idx], 'Signal'] = -1
    
    # Use forward-fill for position tracking (reversal mode)
    data['Position'] = data['Signal'].replace(0, np.nan).ffill().fillna(0)
    
    # Calculate returns and metrics
    ...`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Heatmap Generation</h3>
        <p>The optimization creates a 2D heatmap showing performance across parameter combinations:</p>
        <ul>
          <li><strong>X-axis:</strong> First parameter range (e.g., Fast EMA or Bottom threshold)</li>
          <li><strong>Y-axis:</strong> Second parameter range (e.g., Slow EMA or Top threshold)</li>
          <li><strong>Color:</strong> Performance metric (Sharpe, Return, Max DD, Win Rate)</li>
        </ul>
        <pre>{`// Grid search over parameter ranges
for (let short = shortRange.min; short <= shortRange.max; short += shortRange.step) {
    for (let long = longRange.min; long <= longRange.max; long += longRange.step) {
        if (short >= long) continue; // Fast must be less than slow
        
        const result = await runOptimization(data, short, long, ...);
        results.push({
            short_period: short,
            long_period: long,
            ...result
        });
    }
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>In-Sample / Out-of-Sample Testing</h3>
        <pre>{`def run_combined_equity_backtest(data, ema_short, ema_long, 
                                  initial_capital, 
                                  in_sample_years, out_sample_years):
    """
    Run backtest and split metrics by sample period
    """
    # Mark each row as in-sample or out-of-sample
    data['Sample_Type'] = data['Year'].apply(
        lambda y: 'in_sample' if y in in_sample_years 
                  else ('out_sample' if y in out_sample_years else 'none')
    )
    
    # Calculate full equity curve
    equity = initial_capital * (1 + data['Strategy_Returns']).cumprod()
    
    # Split metrics by sample type
    in_sample_mask = data['Sample_Type'] == 'in_sample'
    out_sample_mask = data['Sample_Type'] == 'out_sample'
    
    in_sample_metrics = calculate_metrics(data[in_sample_mask])
    out_sample_metrics = calculate_metrics(data[out_sample_mask])
    
    return in_sample_metrics, out_sample_metrics, equity_curve`}</pre>
      </div>
    </div>
  )
}

function ResamplingSection() {
  return (
    <div className={styles.section}>
      <h2>Bootstrap Resampling</h2>
      <p className={styles.intro}>
        Bootstrap resampling by volatility regimes shuffles market data while preserving statistical properties 
        to test strategy robustness.
      </p>

      <div className={styles.subsection}>
        <h3>Process Overview</h3>
        <ol>
          <li><strong>Compute Returns:</strong> <code>r[t] = (Close[t] / Close[t-1]) - 1</code></li>
          <li><strong>Calculate Rolling Volatility:</strong> 30-day rolling standard deviation of returns</li>
          <li><strong>Assign Percentile Ranks:</strong> Convert volatility to 0-100 percentile</li>
          <li><strong>Bucketize:</strong> Group percentiles into volatility regimes (e.g., 5 buckets × 20%)</li>
          <li><strong>Build Blocks:</strong> Contiguous candles sharing same bucket form blocks</li>
          <li><strong>Shuffle Blocks:</strong> Randomly reorder blocks within each bucket</li>
          <li><strong>Reconstruct:</strong> Build synthetic price series from shuffled returns</li>
        </ol>
      </div>

      <div className={styles.subsection}>
        <h3>Return Calculation</h3>
        <pre>{`function computeReturns(candles) {
    const returns = [null]; // First element has no return
    for (let i = 1; i < candles.length; i++) {
        const prevClose = candles[i - 1].close;
        const currClose = candles[i].close;
        const ret = (currClose / prevClose) - 1;
        // Clamp extreme returns to avoid numerical issues
        returns.push(Math.max(-0.99, Math.min(10, ret)));
    }
    return returns;
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Rolling Volatility</h3>
        <pre>{`function rollingStd(returns, window = 30) {
    const result = [];
    for (let i = 0; i < returns.length; i++) {
        if (i < window - 1) {
            result.push(null);
            continue;
        }
        
        // Get window of returns
        const windowReturns = returns.slice(i - window + 1, i + 1)
            .filter(r => r !== null);
        
        // Calculate standard deviation
        const mean = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
        const variance = windowReturns.reduce(
            (sum, r) => sum + Math.pow(r - mean, 2), 0
        ) / windowReturns.length;
        result.push(Math.sqrt(variance));
    }
    return result;
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Bucketization</h3>
        <pre>{`function bucketizeByPercentile(ranks, bucketSizePercent) {
    // e.g., bucketSizePercent = 20 creates 5 buckets
    return ranks.map(rank => {
        if (rank === null) return null;
        return Math.floor(rank / bucketSizePercent);
    });
}

// Example with 20% buckets:
// Percentile 0-19   -> Bucket 0 (Low volatility)
// Percentile 20-39  -> Bucket 1
// Percentile 40-59  -> Bucket 2
// Percentile 60-79  -> Bucket 3
// Percentile 80-100 -> Bucket 4 (High volatility)`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Block Shuffling</h3>
        <pre>{`function shuffleBlocksByBucket(blocks, seed) {
    // Group blocks by bucket
    const bucketGroups = {};
    for (const block of blocks) {
        if (!bucketGroups[block.bucket]) bucketGroups[block.bucket] = [];
        bucketGroups[block.bucket].push(block);
    }
    
    // Shuffle within each bucket (Fisher-Yates)
    for (const bucket of Object.keys(bucketGroups)) {
        bucketGroups[bucket] = shuffleArray(bucketGroups[bucket], random);
    }
    
    // Reconstruct: maintain original bucket PATTERN but use shuffled blocks
    const result = [];
    const usedIndices = {};
    for (const block of blocks) {
        const bucket = block.bucket;
        if (!usedIndices[bucket]) usedIndices[bucket] = 0;
        result.push(shuffledGroups[bucket][usedIndices[bucket]++]);
    }
    return result;
}`}</pre>
        <p className={styles.important}>
          <strong>Key Property:</strong> The number of blocks in each volatility bucket is preserved. 
          If original data had 3 low-volatility periods and 5 high-volatility periods, 
          resampled data will have the same distribution.
        </p>
      </div>

      <div className={styles.subsection}>
        <h3>Series Reconstruction</h3>
        <pre>{`function reconstructSeriesFromBlocks(initialClose, shuffledBlocks) {
    const syntheticCandles = [];
    let currentClose = initialClose;
    
    for (const block of shuffledBlocks) {
        for (let i = 0; i < block.candles.length; i++) {
            const originalCandle = block.candles[i];
            
            // Apply return to get new close
            if (syntheticCandles.length > 0 && block.returns[i] !== null) {
                currentClose = currentClose * (1 + block.returns[i]);
            }
            
            // Preserve OHLC ratios from original candle
            const origClose = originalCandle.close;
            const openRatio = originalCandle.open / origClose;
            const highRatio = originalCandle.high / origClose;
            const lowRatio = originalCandle.low / origClose;
            
            syntheticCandles.push({
                date: originalDate,
                open: currentClose * openRatio,
                high: currentClose * highRatio,
                low: currentClose * lowRatio,
                close: currentClose
            });
        }
    }
    return syntheticCandles;
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Distribution Summary Metrics</h3>
        <p>
          The "Resampling Distribution Summary" shows the <strong>average</strong> of metrics 
          across all resampled paths:
        </p>
        <ul>
          <li><strong>Avg Total Return:</strong> Mean final return across all resamples</li>
          <li><strong>Avg Max Drawdown:</strong> Mean maximum drawdown across all resamples</li>
          <li><strong>Avg Volatility:</strong> Mean annualized volatility (√252 × daily std)</li>
        </ul>
      </div>
    </div>
  )
}

function MonteCarloSection() {
  return (
    <div className={styles.section}>
      <h2>Monte Carlo Simulation</h2>
      <p className={styles.intro}>
        Monte Carlo simulation shuffles the order of trades to show different possible equity paths 
        from the same set of trades.
      </p>

      <div className={styles.subsection}>
        <h3>Process</h3>
        <ol>
          <li>Extract returns from each completed trade</li>
          <li>For each simulation (N times):
            <ul>
              <li>Shuffle trade order randomly (Fisher-Yates)</li>
              <li>Calculate equity curve from shuffled returns</li>
              <li>Record final equity, total return, max drawdown</li>
            </ul>
          </li>
          <li>Calculate percentile distributions</li>
        </ol>
      </div>

      <div className={styles.subsection}>
        <h3>Trade Return Extraction</h3>
        <pre>{`// Extract percentage returns from each trade
const tradeReturns = trades.map(trade => trade.PnL_Pct / 100);
// e.g., [0.05, -0.02, 0.12, -0.08, 0.03, ...]`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Equity Curve Calculation</h3>
        <pre>{`function calculateEquityFromReturns(tradeReturns, initialCapital = 10000) {
    const equity = [initialCapital];
    let current = initialCapital;
    
    for (const ret of tradeReturns) {
        current = current * (1 + ret);  // Compound returns
        equity.push(current);
    }
    
    return equity;
}

// Example:
// Initial: $10,000
// Trade 1: +5% -> $10,000 × 1.05 = $10,500
// Trade 2: -2% -> $10,500 × 0.98 = $10,290
// Trade 3: +8% -> $10,290 × 1.08 = $11,113.20`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Why All Paths End at Same Point</h3>
        <div className={styles.important}>
          <p>
            <strong>Important:</strong> All Monte Carlo paths end at the same final equity because 
            multiplication is commutative. Shuffling the order of returns doesn't change the product:
          </p>
          <pre>{`1.05 × 0.98 × 1.08 = 1.08 × 0.98 × 1.05 = 1.11006

// The PATH is different, but the DESTINATION is the same.
// What varies is:
// - Maximum drawdown experienced
// - When the worst/best periods occurred
// - Psychological journey (smooth vs volatile)`}</pre>
        </div>
      </div>

      <div className={styles.subsection}>
        <h3>Max Drawdown Calculation</h3>
        <pre>{`function calculateMaxDrawdown(equity) {
    let peak = equity[0];
    let maxDD = 0;
    
    for (const value of equity) {
        if (value > peak) peak = value;
        const dd = (peak - value) / peak;  // Drawdown from peak
        if (dd > maxDD) maxDD = dd;
    }
    
    return maxDD;  // Returns as decimal (0.15 = 15% drawdown)
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Percentile Calculation</h3>
        <pre>{`function calculatePercentile(sortedArray, percentile) {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sortedArray[lower];
    
    // Linear interpolation
    const fraction = index - lower;
    return sortedArray[lower] * (1 - fraction) + sortedArray[upper] * fraction;
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Statistics Output</h3>
        <ul>
          <li><strong>P5, P25, P50, P75, P95:</strong> Percentile values for final equity, return, and drawdown</li>
          <li><strong>Mean:</strong> Average across all simulations</li>
          <li><strong>Probability of Loss:</strong> % of simulations ending with negative return</li>
          <li><strong>Probability of Profit:</strong> % of simulations ending with positive return</li>
        </ul>
      </div>
    </div>
  )
}

function MetricsSection() {
  return (
    <div className={styles.section}>
      <h2>Performance Metrics</h2>
      <p className={styles.intro}>
        Standard metrics used to evaluate strategy performance.
      </p>

      <div className={styles.subsection}>
        <h3>Sharpe Ratio</h3>
        <pre>{`def calculate_sharpe_ratio(returns, risk_free_rate=0):
    """
    Annualized Sharpe Ratio
    
    Formula:
    excess_returns = daily_returns - (risk_free_rate / 365)
    sharpe = sqrt(365) × mean(excess_returns) / std(returns)
    """
    if len(returns) == 0 or returns.std() == 0:
        return 0.0
    
    excess_returns = returns - (risk_free_rate / 365)
    return float(np.sqrt(365) * excess_returns.mean() / returns.std())`}</pre>
        <p>
          <strong>Interpretation:</strong> Sharpe &gt; 1 is good, &gt; 2 is very good, &gt; 3 is excellent.
          Measures risk-adjusted return.
        </p>
      </div>

      <div className={styles.subsection}>
        <h3>Maximum Drawdown</h3>
        <pre>{`def calculate_max_drawdown(equity_curve):
    """
    Maximum peak-to-trough decline
    
    Formula:
    peak = rolling maximum of equity
    drawdown = (equity - peak) / peak
    max_dd = abs(min(drawdown))
    """
    peak = equity_curve.expanding(min_periods=1).max()
    drawdown = (equity_curve - peak) / peak
    return float(abs(drawdown.min()))`}</pre>
        <p>
          <strong>Interpretation:</strong> A 20% max drawdown means the worst decline from peak was 20%.
          Lower is better.
        </p>
      </div>

      <div className={styles.subsection}>
        <h3>Win Rate</h3>
        <pre>{`Win Rate = (Number of Winning Trades / Total Trades) × 100

# A winning trade is one where PnL > 0
winning_trades = len([t for t in trades if t['PnL'] > 0])
win_rate = (winning_trades / total_trades) × 100`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Expected Value (EV)</h3>
        <pre>{`EV = (Win Rate × Average Win) + ((1 - Win Rate) × Average Loss)

# Example:
# Win Rate: 55%
# Average Win: $150
# Average Loss: -$100

EV = (0.55 × 150) + (0.45 × -100)
EV = 82.5 - 45 = $37.50 per trade`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>MAE & MFE</h3>
        <pre>{`// MAE (Maximum Adverse Excursion)
// The worst unrealized loss during a trade
MAE = min(price during trade) - entry_price  // For long
MAE = entry_price - max(price during trade)  // For short

// MFE (Maximum Favorable Excursion)
// The best unrealized profit during a trade
MFE = max(price during trade) - entry_price  // For long
MFE = entry_price - min(price during trade)  // For short`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Average Time in Trade</h3>
        <pre>{`Avg Time = Σ(Exit_Date - Entry_Date) / Number of Trades

// Holding Days is stored per trade:
trade['Holding_Days'] = (exit_date - entry_date).days`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Total Return</h3>
        <pre>{`Total Return ($) = Final Capital - Initial Capital
Total Return (%) = ((Final Capital - Initial Capital) / Initial Capital) × 100`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Profit Factor</h3>
        <pre>{`Profit Factor = Total Gross Profit / Total Gross Loss

// Profit Factor > 1 means profitable
// Profit Factor > 2 is generally considered good`}</pre>
      </div>
    </div>
  )
}

function DSLSection() {
  return (
    <div className={styles.section}>
      <h2>DSL (Domain Specific Language) Evaluation</h2>
      <p className={styles.intro}>
        The DSL allows saved strategies to define custom entry/exit conditions using a JSON-based structure.
      </p>

      <div className={styles.subsection}>
        <h3>DSL Structure</h3>
        <pre>{`{
    "indicators": {
        "ema_fast": { "type": "EMA", "length": 20, "source": "close" },
        "ema_slow": { "type": "EMA", "length": 50, "source": "close" },
        "rsi_main": { "type": "RSI", "length": 14, "source": "close" }
    },
    "entry": {
        "all": [
            { "op": "crossesAbove", "left": "ema_fast", "right": "ema_slow" },
            { "op": "<", "left": "rsi_main", "right": 60 }
        ]
    },
    "exit": {
        "any": [
            { "op": ">", "left": "rsi_main", "right": 70 },
            { "op": "stopLossPct", "value": 2 }
        ]
    }
}`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Condition Types</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Structure</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>all</code></td>
              <td><code>{`{"all": [cond1, cond2, ...]}`}</code></td>
              <td>AND: All conditions must be true</td>
            </tr>
            <tr>
              <td><code>any</code></td>
              <td><code>{`{"any": [cond1, cond2, ...]}`}</code></td>
              <td>OR: Any condition can be true</td>
            </tr>
            <tr>
              <td>Comparison</td>
              <td><code>{`{"op": "<", "left": "rsi", "right": 30}`}</code></td>
              <td>Compare indicator to value or another indicator</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.subsection}>
        <h3>Supported Operators</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Operator</th>
              <th>Aliases</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code>&gt;</code></td><td><code>gt</code></td><td>Greater than</td></tr>
            <tr><td><code>&lt;</code></td><td><code>lt</code></td><td>Less than</td></tr>
            <tr><td><code>&gt;=</code></td><td><code>gte</code></td><td>Greater or equal</td></tr>
            <tr><td><code>&lt;=</code></td><td><code>lte</code></td><td>Less or equal</td></tr>
            <tr><td><code>==</code></td><td><code>equals, eq</code></td><td>Equal</td></tr>
            <tr><td><code>crossesAbove</code></td><td>-</td><td>Crosses from below to above</td></tr>
            <tr><td><code>crossesBelow</code></td><td>-</td><td>Crosses from above to below</td></tr>
          </tbody>
        </table>
      </div>

      <div className={styles.subsection}>
        <h3>Evaluation Function</h3>
        <pre>{`def evaluate_dsl_condition(condition, row, dsl_indicator_cols, prev_row=None):
    """
    Recursively evaluate DSL condition for current bar
    """
    if condition is None:
        return False
    
    # Handle AND group
    if 'all' in condition:
        return all(
            evaluate_dsl_condition(c, row, dsl_indicator_cols, prev_row) 
            for c in condition['all']
        )
    
    # Handle OR group
    if 'any' in condition:
        return any(
            evaluate_dsl_condition(c, row, dsl_indicator_cols, prev_row) 
            for c in condition['any']
        )
    
    # Get operator and operands
    op = condition.get('op')
    left = condition.get('left')
    right = condition.get('right')
    
    # Resolve values (indicator column or constant)
    if left in dsl_indicator_cols:
        left_val = row[dsl_indicator_cols[left]]
    else:
        left_val = left  # Numeric constant
    
    if right in dsl_indicator_cols:
        right_val = row[dsl_indicator_cols[right]]
    else:
        right_val = right  # Numeric constant
    
    # Evaluate comparison
    if op == '>':
        return bool(left_val > right_val)
    elif op == '<':
        return bool(left_val < right_val)
    elif op == 'crossesAbove':
        # Was below/equal, now above
        prev_left = prev_row[dsl_indicator_cols[left]]
        prev_right = prev_row[dsl_indicator_cols[right]]
        return bool(prev_left <= prev_right and left_val > right_val)
    elif op == 'crossesBelow':
        # Was above/equal, now below
        prev_left = prev_row[dsl_indicator_cols[left]]
        prev_right = prev_row[dsl_indicator_cols[right]]
        return bool(prev_left >= prev_right and left_val < right_val)
    
    return False`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Transition Detection</h3>
        <p className={styles.important}>
          <strong>Critical:</strong> Entry signals only trigger on TRANSITION - the first bar where 
          the condition becomes true after being false. This prevents repeated entries while 
          condition remains true.
        </p>
        <pre>{`# Track previous states
prev_dsl_entry_met = False
prev_dsl_exit_met = False

for each bar:
    dsl_entry_met = evaluate_dsl_condition(dsl['entry'], ...)
    
    # TRANSITION: condition was False, now True
    entry_transition = dsl_entry_met and not prev_dsl_entry_met
    
    # Only enter on transition when not in position
    if entry_transition and position is None:
        # Enter trade
    
    # Update state for next iteration
    prev_dsl_entry_met = dsl_entry_met`}</pre>
      </div>

      <div className={styles.subsection}>
        <h3>Indicator Calculation from DSL</h3>
        <pre>{`# Calculate all DSL indicators before backtest loop
for alias, config in dsl['indicators'].items():
    ind_type = config['type'].lower()
    length = config['length']
    
    if ind_type == 'ema':
        data[f'DSL_EMA_{alias}_{length}'] = calculate_ema(data, length)
        dsl_indicator_cols[alias] = f'DSL_EMA_{alias}_{length}'
    elif ind_type == 'rsi':
        data[f'DSL_RSI_{alias}_{length}'] = calculate_rsi(data, length)
        dsl_indicator_cols[alias] = f'DSL_RSI_{alias}_{length}'
    # ... other indicator types

# Now indicator values are accessible by alias during evaluation
row[dsl_indicator_cols['ema_fast']]  # Returns EMA value for this bar`}</pre>
      </div>
    </div>
  )
}
