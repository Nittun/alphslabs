# Traffic Smoothing System Configuration

This document describes the environment variables for configuring the traffic smoothing system.

## Overview

The traffic smoothing system provides:
- **Rate Limiting**: Prevents abuse with per-user/IP request limits
- **Job Queue**: Decouples request handling from execution with backpressure
- **Jitter**: Randomized delays to smooth traffic spikes
- **Observability**: Metrics endpoint for monitoring

## Why This Approach is Better Than Fixed Delays

A naive fixed delay (e.g., `sleep(3000)` on every request) has problems:

1. **UNFAIR** - Light users get the same delay as heavy users
2. **DOESN'T PREVENT OVERLOAD** - 1000 requests sleep then execute together (thundering herd)
3. **WASTES RESOURCES** - Server threads held during sleep
4. **NOT ADAPTIVE** - Can't respond to actual load

Our approach instead uses:
- **Rate limiting**: Stops abuse immediately with 429 response
- **Queue + backpressure**: Fast 202 Accepted, async processing
- **Small randomized jitter**: Spreads load without blocking
- **Concurrency limits**: Controls actual resource usage

## Environment Variables

Add these to your `.env.local` file:

### Rate Limiting

```bash
# Maximum requests per minute per user/IP
# Default: 30
RATE_LIMIT_MAX_REQUESTS_PER_MINUTE=30

# Maximum concurrent jobs per user
# Default: 3
RATE_LIMIT_MAX_CONCURRENT_JOBS_PER_USER=3
```

### Job Queue

```bash
# Maximum concurrent jobs globally (across all users)
# Controls backend resource usage
# Default: 5
QUEUE_MAX_CONCURRENT_JOBS_GLOBAL=5

# Maximum queue size before rejecting new jobs
# Prevents memory growth and provides backpressure
# Default: 100
QUEUE_MAX_SIZE=100

# Job expiration time in milliseconds
# Old completed/failed jobs are cleaned up after this
# Default: 3600000 (1 hour)
QUEUE_JOB_EXPIRATION_MS=3600000
```

### Traffic Smoothing / Jitter

```bash
# Enable/disable jitter (randomized delays)
# Set to 'false' to disable, any other value enables
# Default: true
QUEUE_JITTER_ENABLED=true

# Maximum jitter delay in milliseconds
# Actual delay is random between 0 and this value, plus queue-based delay
# Default: 500
QUEUE_MAX_JITTER_MS=500
```

## Recommended Settings by Use Case

### Development (fast, minimal throttling)

```bash
RATE_LIMIT_MAX_REQUESTS_PER_MINUTE=100
RATE_LIMIT_MAX_CONCURRENT_JOBS_PER_USER=5
QUEUE_MAX_CONCURRENT_JOBS_GLOBAL=10
QUEUE_JITTER_ENABLED=false
```

### Production (balanced)

```bash
RATE_LIMIT_MAX_REQUESTS_PER_MINUTE=30
RATE_LIMIT_MAX_CONCURRENT_JOBS_PER_USER=3
QUEUE_MAX_CONCURRENT_JOBS_GLOBAL=5
QUEUE_JITTER_ENABLED=true
QUEUE_MAX_JITTER_MS=500
```

### High Load / Cost-Sensitive (aggressive throttling)

```bash
RATE_LIMIT_MAX_REQUESTS_PER_MINUTE=10
RATE_LIMIT_MAX_CONCURRENT_JOBS_PER_USER=1
QUEUE_MAX_CONCURRENT_JOBS_GLOBAL=3
QUEUE_MAX_SIZE=50
QUEUE_JITTER_ENABLED=true
QUEUE_MAX_JITTER_MS=1000
```

## API Endpoints

### POST /api/jobs
Enqueue a new job.

**Request:**
```json
{
  "type": "backtest",
  "payload": { /* job-specific parameters */ }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "job": {
    "id": "job_abc123",
    "status": "queued",
    "queuePosition": 3,
    "estimatedWaitMs": 15000
  }
}
```

**Response (429 Too Many Requests):**
```json
{
  "error": "Too Many Requests",
  "message": "You've made too many requests. Please wait 30 seconds.",
  "retryAfterSeconds": 30
}
```

### GET /api/jobs/:id
Get job status.

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job_abc123",
    "status": "running",
    "progress": 45,
    "queuePosition": 0,
    "estimatedWaitMs": 0
  },
  "shouldPoll": true,
  "pollIntervalMs": 1000
}
```

### DELETE /api/jobs/:id
Cancel a queued job.

### GET /api/admin/metrics
Get system metrics.

**Response:**
```json
{
  "queue": {
    "queueLength": 5,
    "runningCount": 3,
    "totalCompleted": 150,
    "avgRuntimeMs": 4500
  },
  "rateLimit": {
    "activeUsers": 12,
    "rateLimitHits": 3
  },
  "health": {
    "status": "healthy",
    "queueUsagePercent": 5
  }
}
```

## Usage in React

```jsx
import { useJobQueue, JobStatus } from '@/hooks/useJobQueue'
import JobStatusIndicator from '@/components/JobStatusIndicator'

function MyComponent() {
  const {
    status,
    progress,
    queuePosition,
    estimatedWaitMs,
    error,
    retryAfter,
    isLoading,
    canSubmit,
    result,
    submitJob,
    cancelJob,
  } = useJobQueue({
    onComplete: (result) => {
      console.log('Job completed:', result)
    },
    onError: (error) => {
      console.error('Job failed:', error)
    },
  })

  const handleRunBacktest = async () => {
    await submitJob('backtest', {
      symbol: 'BTC-USD',
      // ... other params
    })
  }

  return (
    <div>
      <button onClick={handleRunBacktest} disabled={!canSubmit}>
        {isLoading ? 'Processing...' : 'Run Backtest'}
      </button>
      
      {status !== 'idle' && (
        <JobStatusIndicator
          status={status}
          progress={progress}
          queuePosition={queuePosition}
          estimatedWaitMs={estimatedWaitMs}
          error={error}
          retryAfter={retryAfter}
          onCancel={status === 'queued' ? cancelJob : undefined}
        />
      )}
      
      {result && (
        <div>Result: {JSON.stringify(result)}</div>
      )}
    </div>
  )
}
```

## Registering Custom Job Processors

```javascript
import { registerJobProcessor } from '@/lib/jobQueue'

// Register a processor for 'backtest' job type
registerJobProcessor('backtest', async (job) => {
  const { symbol, interval, years } = job.payload
  
  // Update progress
  updateJobProgress(job.id, 10)
  
  // Do work...
  const result = await runBacktest(symbol, interval, years)
  
  updateJobProgress(job.id, 100)
  
  return result
})
```

## Architecture

```
[Client Request]
       |
       v
[Rate Limiter] -----> [429 Response]
       |
       v
[Concurrent Check] --> [429 Response]
       |
       v
[Jitter Delay] (small, random)
       |
       v
[Enqueue Job] -------> [202 Accepted + jobId]
       |
       v
[Worker Loop] 
       |
   (concurrent limit)
       |
       v
[Process Job] -------> [Update Status]
       |
       v
[Client Polls] ------> [Job Result]
```
