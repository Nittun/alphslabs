'use client'

import styles from './InfoTooltip.module.css'

/**
 * InfoTooltip - A reusable info icon with hover tooltip
 * 
 * @param {string} title - The tooltip title
 * @param {string} description - The main description text
 * @param {string[]} items - Optional list of bullet points
 * @param {function} onClick - Optional click handler to stop propagation
 */
export default function InfoTooltip({ title, description, items = [], onClick }) {
  const handleClick = (e) => {
    e.stopPropagation()
    if (onClick) onClick(e)
  }

  return (
    <span className={styles.infoIcon} onClick={handleClick}>
      <span className="material-icons">info_outline</span>
      <div className={styles.tooltip}>
        <h5>{title}</h5>
        <p>{description}</p>
        {items.length > 0 && (
          <ul>
            {items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </span>
  )
}
