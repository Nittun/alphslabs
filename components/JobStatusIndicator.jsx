'use client'

/**
 * JobStatusIndicator Component
 * 
 * Displays job queue status with:
 * - Progress bar
 * - Queue position
 * - Estimated wait time
 * - Status messages
 */

import { useMemo } from 'react'
import styles from './JobStatusIndicator.module.css'

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return 'calculating...'
  if (ms < 1000) return 'a moment'
  if (ms < 60000) return `${Math.ceil(ms / 1000)}s`
  if (ms < 3600000) return `${Math.ceil(ms / 60000)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

/**
 * Status configurations
 */
const STATUS_CONFIG = {
  idle: {
    icon: 'play_circle',
    text: 'Ready to run',
    color: 'gray',
  },
  submitting: {
    icon: 'hourglass_top',
    text: 'Submitting...',
    color: 'blue',
    animate: true,
  },
  queued: {
    icon: 'schedule',
    text: 'Queued',
    color: 'yellow',
    animate: true,
  },
  running: {
    icon: 'sync',
    text: 'Running',
    color: 'blue',
    animate: true,
  },
  completed: {
    icon: 'check_circle',
    text: 'Completed',
    color: 'green',
  },
  failed: {
    icon: 'error',
    text: 'Failed',
    color: 'red',
  },
  cancelled: {
    icon: 'cancel',
    text: 'Cancelled',
    color: 'gray',
  },
  rate_limited: {
    icon: 'block',
    text: 'Rate Limited',
    color: 'red',
  },
}

/**
 * JobStatusIndicator Component
 * 
 * @param {Object} props
 * @param {string} props.status - Current job status
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {number} props.queuePosition - Position in queue
 * @param {number} props.estimatedWaitMs - Estimated wait time in ms
 * @param {string} props.error - Error message if failed
 * @param {number} props.retryAfter - Seconds until retry allowed (rate limited)
 * @param {Function} props.onCancel - Cancel callback (for queued jobs)
 * @param {boolean} props.showDetails - Show detailed info
 */
export default function JobStatusIndicator({
  status = 'idle',
  progress = 0,
  queuePosition = 0,
  estimatedWaitMs = 0,
  error = null,
  retryAfter = null,
  onCancel,
  showDetails = true,
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle
  
  const statusText = useMemo(() => {
    if (status === 'queued' && queuePosition > 0) {
      return `Queued (Position: ${queuePosition})`
    }
    if (status === 'running' && progress > 0) {
      return `Running (${progress}%)`
    }
    if (status === 'rate_limited' && retryAfter) {
      return `Rate Limited (retry in ${retryAfter}s)`
    }
    return config.text
  }, [status, queuePosition, progress, retryAfter, config.text])
  
  const showProgress = status === 'running' || status === 'queued' || status === 'submitting'
  const showCancel = status === 'queued' && onCancel
  
  return (
    <div className={`${styles.container} ${styles[config.color]}`}>
      <div className={styles.header}>
        <span className={`material-icons ${styles.icon} ${config.animate ? styles.animate : ''}`}>
          {config.icon}
        </span>
        <span className={styles.statusText}>{statusText}</span>
        
        {showCancel && (
          <button className={styles.cancelBtn} onClick={onCancel} title="Cancel job">
            <span className="material-icons">close</span>
          </button>
        )}
      </div>
      
      {showProgress && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${status === 'queued' ? 0 : progress}%` }}
            />
          </div>
          {status === 'running' && (
            <span className={styles.progressText}>{progress}%</span>
          )}
        </div>
      )}
      
      {showDetails && (
        <div className={styles.details}>
          {status === 'queued' && estimatedWaitMs > 0 && (
            <span className={styles.detail}>
              <span className="material-icons">timer</span>
              Est. wait: {formatDuration(estimatedWaitMs)}
            </span>
          )}
          
          {status === 'failed' && error && (
            <span className={styles.error}>
              <span className="material-icons">error_outline</span>
              {error}
            </span>
          )}
          
          {status === 'rate_limited' && (
            <span className={styles.error}>
              <span className="material-icons">warning</span>
              Please wait before submitting another job
            </span>
          )}
        </div>
      )}
    </div>
  )
}
