'use client'

import { useState } from 'react'
import styles from './AnalysisCard.module.css'
import InfoTooltip from './InfoTooltip'

/**
 * AnalysisCard - A collapsible card component for analysis sections
 * 
 * @param {string} title - Card title
 * @param {string} icon - Material icon name
 * @param {boolean} defaultExpanded - Whether to start expanded (default: true)
 * @param {boolean} completed - Show completed badge
 * @param {object} tooltip - Tooltip config { title, description, items }
 * @param {React.ReactNode} children - Card content
 * @param {string} className - Additional class name
 */
export default function AnalysisCard({
  title,
  icon = 'analytics',
  defaultExpanded = true,
  completed = false,
  tooltip,
  children,
  className = ''
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={`${styles.card} ${className}`}>
      <div 
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
      >
        <h2>
          <span className="material-icons">{icon}</span>
          {title}
          {tooltip && (
            <InfoTooltip 
              title={tooltip.title}
              description={tooltip.description}
              items={tooltip.items}
            />
          )}
          {completed && (
            <span className={styles.completedBadge} title="Section completed">
              <span className="material-icons">check_circle</span>
            </span>
          )}
        </h2>
        <span className={`material-icons ${styles.chevron} ${expanded ? styles.expanded : ''}`}>
          expand_more
        </span>
      </div>
      
      {expanded && (
        <div className={styles.content}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * AnalysisSubCard - A sub-card for nested sections
 */
export function AnalysisSubCard({
  title,
  icon,
  tooltip,
  variant = 'default', // 'default' | 'success' | 'warning'
  children,
  className = ''
}) {
  return (
    <div className={`${styles.subCard} ${styles[variant]} ${className}`}>
      <div className={styles.subHeader}>
        <h3>
          {icon && <span className="material-icons">{icon}</span>}
          {title}
          {tooltip && (
            <InfoTooltip 
              title={tooltip.title}
              description={tooltip.description}
              items={tooltip.items}
            />
          )}
        </h3>
      </div>
      <div className={styles.subContent}>
        {children}
      </div>
    </div>
  )
}

/**
 * AnalysisControlsCard - A card for configuration controls
 */
export function AnalysisControlsCard({
  title,
  icon = 'tune',
  tooltip,
  description,
  children,
  className = ''
}) {
  return (
    <div className={`${styles.controlsCard} ${className}`}>
      <h4>
        <span className="material-icons">{icon}</span>
        {title}
        {tooltip && (
          <InfoTooltip 
            title={tooltip.title}
            description={tooltip.description}
            items={tooltip.items}
          />
        )}
      </h4>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.controlsContent}>
        {children}
      </div>
    </div>
  )
}
