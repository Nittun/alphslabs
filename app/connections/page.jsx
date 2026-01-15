'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useDatabase } from '@/hooks/useDatabase'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import styles from './page.module.css'

export default function ConnectionsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('history')
  const [backtestRuns, setBacktestRuns] = useState([])
  const [savedConfigs, setSavedConfigs] = useState([])
  const [loginHistory, setLoginHistory] = useState([])
  const [userStats, setUserStats] = useState(null)
  const [dbConnected, setDbConnected] = useState(null) // null = loading, true/false = connected/not
  
  const { 
    loading, 
    getBacktestRuns, 
    getConfigs, 
    getLoginHistory, 
    getUser,
    deleteBacktestRun,
    deleteConfig,
    updateConfig 
  } = useDatabase()
  
  const { updateConfig: updateLocalConfig } = useBacktestConfig()

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      // Test database connection
      const userResult = await getUser()
      if (userResult.success) {
        setDbConnected(true)
        setUserStats(userResult.user)
        
        // Load all data
        const [runsResult, configsResult, loginResult] = await Promise.all([
          getBacktestRuns(50),
          getConfigs(),
          getLoginHistory()
        ])
        
        if (runsResult.success) setBacktestRuns(runsResult.runs || [])
        if (configsResult.success) setSavedConfigs(configsResult.configs || [])
        if (loginResult.success) setLoginHistory(loginResult.loginHistory || [])
      } else {
        setDbConnected(false)
      }
    }
    
    loadData()
  }, [])

  const handleDeleteRun = async (id) => {
    if (confirm('Delete this backtest run?')) {
      const result = await deleteBacktestRun(id)
      if (result.success) {
        setBacktestRuns(runs => runs.filter(r => r.id !== id))
      }
    }
  }

  const handleDeleteConfig = async (id) => {
    if (confirm('Delete this saved configuration?')) {
      const result = await deleteConfig(id)
      if (result.success) {
        setSavedConfigs(configs => configs.filter(c => c.id !== id))
      }
    }
  }

  const handleToggleFavorite = async (config) => {
    const result = await updateConfig(config.id, { isFavorite: !config.isFavorite })
    if (result.success) {
      setSavedConfigs(configs => 
        configs.map(c => c.id === config.id ? { ...c, isFavorite: !c.isFavorite } : c)
      )
    }
  }

  const handleLoadConfig = (config) => {
    updateLocalConfig({
      asset: config.asset,
      daysBack: config.daysBack,
      interval: config.interval,
      initialCapital: config.initialCapital,
      enableShort: config.enableShort,
      strategyMode: config.strategyMode,
      emaFast: config.emaFast,
      emaSlow: config.emaSlow
    })
    alert(`Configuration "${config.name}" loaded! Go to Backtest page to run it.`)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatPct = (value) => {
    if (value === null || value === undefined) return 'N/A'
    const pct = parseFloat(value)
    const color = pct >= 0 ? '#00ff88' : '#ff4444'
    return <span style={{ color }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
  }

  // Database not connected - show setup instructions
  if (dbConnected === false) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.setupContainer}>
              <div className={styles.setupIcon}>
                <span className="material-icons">cloud_off</span>
              </div>
              <h1 className={styles.setupTitle}>Database Not Connected</h1>
              <p className={styles.setupText}>
                Connect to your AWS database to enable data persistence.
              </p>
              
              <div className={styles.setupSteps}>
                <h3>Setup Instructions</h3>
                <ol>
                  <li>
                    <strong>Create an AWS RDS PostgreSQL instance</strong>
                    <p>Go to AWS Console → RDS → Create Database → PostgreSQL</p>
                  </li>
                  <li>
                    <strong>Get your database connection URL</strong>
                    <p>Format: <code>postgresql://user:password@host:5432/dbname</code></p>
                  </li>
                  <li>
                    <strong>Add DATABASE_URL to your .env file</strong>
                    <pre>DATABASE_URL=&quot;postgresql://username:password@your-rds-endpoint.amazonaws.com:5432/alphalabs&quot;</pre>
                  </li>
                  <li>
                    <strong>Run Prisma migrations</strong>
                    <pre>npx prisma migrate dev --name init</pre>
                  </li>
                  <li>
                    <strong>Generate Prisma client</strong>
                    <pre>npx prisma generate</pre>
                  </li>
                  <li>
                    <strong>Restart the Next.js server</strong>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (dbConnected === null) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.loadingContainer}>
              <span className={`material-icons ${styles.loadingIcon}`}>sync</span>
              <p>Connecting to database...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          <div className={styles.header}>
            <h1>Connections & Data</h1>
            <div className={styles.dbStatus}>
              <span className={`material-icons ${styles.connectedIcon}`}>cloud_done</span>
              <span>Database Connected</span>
            </div>
          </div>

          {/* Stats Cards */}
          {userStats && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className="material-icons">analytics</span>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{userStats._count?.backtestRuns || 0}</span>
                  <span className={styles.statLabel}>Backtest Runs</span>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">bookmark</span>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{savedConfigs.length}</span>
                  <span className={styles.statLabel}>Saved Configs</span>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">login</span>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{userStats._count?.loginHistory || 0}</span>
                  <span className={styles.statLabel}>Total Logins</span>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">calendar_today</span>
                <div className={styles.statInfo}>
                  <span className={styles.statValue}>{userStats.createdAt ? formatDate(userStats.createdAt).split(',')[0] : 'N/A'}</span>
                  <span className={styles.statLabel}>Member Since</span>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <span className="material-icons">history</span>
              Backtest History
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'configs' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('configs')}
            >
              <span className="material-icons">settings_suggest</span>
              Saved Configurations
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'logins' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('logins')}
            >
              <span className="material-icons">schedule</span>
              Login History
            </button>
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'history' && (
              <div className={styles.tableContainer}>
                {backtestRuns.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className="material-icons">inbox</span>
                    <p>No backtest runs yet. Run a backtest to see it here!</p>
                  </div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Asset</th>
                        <th>Interval</th>
                        <th>EMA</th>
                        <th>Strategy</th>
                        <th>Return</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtestRuns.map(run => (
                        <tr key={run.id}>
                          <td>{formatDate(run.runAt)}</td>
                          <td><strong>{run.asset}</strong></td>
                          <td>{run.interval}</td>
                          <td>{run.emaFast}/{run.emaSlow}</td>
                          <td>{run.strategyMode}</td>
                          <td>{formatPct(run.totalReturnPct)}</td>
                          <td>{run.totalTrades || 0}</td>
                          <td>{run.winRate?.toFixed(1) || 0}%</td>
                          <td>
                            <button 
                              className={styles.iconBtn}
                              onClick={() => handleDeleteRun(run.id)}
                              title="Delete"
                            >
                              <span className="material-icons">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'configs' && (
              <div className={styles.configsGrid}>
                {savedConfigs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className="material-icons">bookmark_border</span>
                    <p>No saved configurations yet. Save a config from the Backtest page!</p>
                  </div>
                ) : (
                  savedConfigs.map(config => (
                    <div key={config.id} className={styles.configCard}>
                      <div className={styles.configHeader}>
                        <h3>{config.name}</h3>
                        <button 
                          className={`${styles.favoriteBtn} ${config.isFavorite ? styles.isFavorite : ''}`}
                          onClick={() => handleToggleFavorite(config)}
                        >
                          <span className="material-icons">
                            {config.isFavorite ? 'star' : 'star_border'}
                          </span>
                        </button>
                      </div>
                      <div className={styles.configDetails}>
                        <div><strong>Asset:</strong> {config.asset}</div>
                        <div><strong>Interval:</strong> {config.interval}</div>
                        <div><strong>EMA:</strong> {config.emaFast}/{config.emaSlow}</div>
                        <div><strong>Strategy:</strong> {config.strategyMode}</div>
                        <div><strong>Capital:</strong> ${config.initialCapital?.toLocaleString()}</div>
                        <div><strong>Days:</strong> {config.daysBack}</div>
                      </div>
                      <div className={styles.configActions}>
                        <button 
                          className={styles.loadBtn}
                          onClick={() => handleLoadConfig(config)}
                        >
                          <span className="material-icons">play_arrow</span>
                          Load Config
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteConfig(config.id)}
                        >
                          <span className="material-icons">delete</span>
                        </button>
                      </div>
                      <div className={styles.configMeta}>
                        <span>{config._count?.backtestRuns || 0} runs</span>
                        <span>Updated {formatDate(config.updatedAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'logins' && (
              <div className={styles.tableContainer}>
                {loginHistory.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className="material-icons">login</span>
                    <p>No login history recorded yet.</p>
                  </div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Provider</th>
                        <th>User Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginHistory.map(login => (
                        <tr key={login.id}>
                          <td>{formatDate(login.loginAt)}</td>
                          <td>
                            <span className={styles.providerBadge}>
                              {login.provider || 'google'}
                            </span>
                          </td>
                          <td className={styles.userAgentCell}>
                            {login.userAgent?.substring(0, 60) || 'Unknown'}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
