'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useDatabase } from '@/hooks/useDatabase'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function ProfilePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  
  // Profile form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [bio, setBio] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  
  // Saved data
  const [savedConfigs, setSavedConfigs] = useState([])
  const [backtestRuns, setBacktestRuns] = useState([])
  const [userStats, setUserStats] = useState(null)
  const [defaultConfig, setDefaultConfig] = useState(null)
  
  const { getUser, getConfigs, getBacktestRuns, deleteConfig, deleteBacktestRun, getDefaultConfig, setDefaultConfig: setDefaultConfigApi, clearDefaultConfig } = useDatabase()
  const { updateConfig: updateLocalConfig } = useBacktestConfig()

  // Load user data on mount
  useEffect(() => {
    const loadData = async () => {
      const userResult = await getUser()
      if (userResult.success && userResult.user) {
        const user = userResult.user
        setFirstName(user.firstName || '')
        setLastName(user.lastName || '')
        setEmail(user.email || '')
        setBio(user.bio || '')
        setUserStats(user)
      }
      
      const configsResult = await getConfigs()
      if (configsResult.success) {
        setSavedConfigs(configsResult.configs || [])
      }
      
      const runsResult = await getBacktestRuns(20)
      if (runsResult.success) {
        setBacktestRuns(runsResult.runs || [])
      }
      
      const defaultConfigResult = await getDefaultConfig()
      if (defaultConfigResult.success && defaultConfigResult.defaultConfig) {
        setDefaultConfig(defaultConfigResult.defaultConfig)
      }
    }
    
    if (session?.user) {
      loadData()
    }
  }, [session])

  const handleSaveProfile = async () => {
    setIsSaving(true)
    setSaveMessage('')
    
    try {
      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          bio,
          name: `${firstName} ${lastName}`.trim() || session?.user?.name
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setSaveMessage('Profile updated successfully!')
        setTimeout(() => setSaveMessage(''), 3000)
      } else {
        setSaveMessage('Failed to update profile')
      }
    } catch (error) {
      setSaveMessage('Error saving profile')
    } finally {
      setIsSaving(false)
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
    router.push('/backtest')
  }

  const handleDeleteConfig = async (id) => {
    const result = await Swal.fire({
      title: 'Delete configuration?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#666',
      confirmButtonText: 'Yes, delete it'
    })
    
    if (result.isConfirmed) {
      const apiResult = await deleteConfig(id)
      if (apiResult.success) {
        setSavedConfigs(configs => configs.filter(c => c.id !== id))
      }
    }
  }

  const handleDeleteRun = async (id) => {
    const result = await Swal.fire({
      title: 'Delete backtest run?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#666',
      confirmButtonText: 'Yes, delete it'
    })
    
    if (result.isConfirmed) {
      const apiResult = await deleteBacktestRun(id)
      if (apiResult.success) {
        setBacktestRuns(runs => runs.filter(r => r.id !== id))
      }
    }
  }

  const handleClearDefaultConfig = async () => {
    const result = await Swal.fire({
      title: 'Clear default configuration?',
      text: 'This will remove your pinned trading configuration.',
      icon: 'warning',
      showCancelButton: true,
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#666',
      confirmButtonText: 'Yes, clear it'
    })
    
    if (result.isConfirmed) {
      const apiResult = await clearDefaultConfig()
      if (apiResult.success) {
        setDefaultConfig(null)
        Swal.fire({
          icon: 'success',
          title: 'Cleared!',
          text: 'Default configuration has been removed.',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#00ff88',
          timer: 1500
        })
      }
    }
  }

  const handleSetConfigAsDefault = async (config) => {
    const apiResult = await setDefaultConfigApi({
      asset: config.asset,
      interval: config.interval,
      daysBack: config.daysBack,
      initialCapital: config.initialCapital,
      enableShort: config.enableShort,
      strategyMode: config.strategyMode,
      emaFast: config.emaFast,
      emaSlow: config.emaSlow
    })
    
    if (apiResult.success) {
      setDefaultConfig(apiResult.defaultConfig)
      Swal.fire({
        icon: 'success',
        title: 'Default Set!',
        html: `<strong>${config.asset}</strong> with EMA ${config.emaFast}/${config.emaSlow} will be used on Current Position page`,
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#00ff88',
        timer: 2000,
        timerProgressBar: true
      })
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Failed',
        text: apiResult.error || 'Could not set default configuration.',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatPct = (value) => {
    if (value === null || value === undefined) return 'N/A'
    const pct = parseFloat(value)
    const color = pct >= 0 ? '#00ff88' : '#ff4444'
    return <span style={{ color }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.profileHeader}>
              <div className={styles.avatarLarge}>
                {session?.user?.image ? (
                  <img src={session.user.image} alt={session.user.name} />
                ) : (
                  <span>{session?.user?.name?.charAt(0) || 'U'}</span>
                )}
              </div>
              <div className={styles.headerInfo}>
                <h1>{firstName || lastName ? `${firstName} ${lastName}` : session?.user?.name}</h1>
                <p>{email || session?.user?.email}</p>
                {userStats && (
                  <div className={styles.quickStats}>
                    <span><strong>{userStats._count?.backtestRuns || 0}</strong> Backtests</span>
                    <span><strong>{savedConfigs.length}</strong> Saved Configs</span>
                    <span>Member since <strong>{formatDate(userStats.createdAt)}</strong></span>
                    {userStats.role && (
                      <span className={styles.roleBadge}>
                        <span className="material-icons" style={{ fontSize: '0.9rem', marginRight: '0.25rem' }}>
                          {userStats.role === 'admin' ? 'admin_panel_settings' : 'person'}
                        </span>
                        <strong style={{ textTransform: 'capitalize' }}>{userStats.role}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === 'profile' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <span className="material-icons">person</span>
              Edit Profile
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'configs' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('configs')}
            >
              <span className="material-icons">bookmark</span>
              Saved Configurations ({savedConfigs.length})
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <span className="material-icons">history</span>
              Backtest History ({backtestRuns.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'profile' && (
              <div className={styles.profileForm}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter last name"
                    />
                  </div>
                </div>
                
                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className={styles.disabledInput}
                  />
                  <span className={styles.inputHint}>Email cannot be changed (linked to Google account)</span>
                </div>
                
                <div className={styles.formGroup}>
                  <label>Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                  />
                </div>
                
                <div className={styles.formActions}>
                  <button 
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className={styles.saveButton}
                  >
                    <span className="material-icons">
                      {isSaving ? 'hourglass_empty' : 'save'}
                    </span>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {saveMessage && (
                    <span className={`${styles.saveMessage} ${saveMessage.includes('success') ? styles.success : styles.error}`}>
                      {saveMessage}
                    </span>
                  )}
                </div>
                
                {/* Default Trading Configuration */}
                <div className={styles.defaultConfigSection}>
                  <h4>
                    <span className="material-icons" style={{ marginRight: '0.5rem', fontSize: '1.1rem' }}>push_pin</span>
                    Default Trading Configuration
                  </h4>
                  {defaultConfig ? (
                    <div className={styles.defaultConfigCard}>
                      <div className={styles.defaultConfigInfo}>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Asset</span>
                          <span className={styles.configValue}>{defaultConfig.asset}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Interval</span>
                          <span className={styles.configValue}>{defaultConfig.interval}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>EMA</span>
                          <span className={styles.configValue}>{defaultConfig.emaFast}/{defaultConfig.emaSlow}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Strategy</span>
                          <span className={styles.configValue}>{defaultConfig.strategyMode}</span>
                        </div>
                        {defaultConfig.setAt && (
                          <div className={styles.configRow}>
                            <span className={styles.configLabel}>Set On</span>
                            <span className={styles.configValue}>{formatDate(defaultConfig.setAt)}</span>
                          </div>
                        )}
                      </div>
                      <button 
                        className={styles.clearDefaultBtn}
                        onClick={handleClearDefaultConfig}
                      >
                        <span className="material-icons">close</span>
                        Clear Default
                      </button>
                    </div>
                  ) : (
                    <div className={styles.noDefaultConfig}>
                      <span className="material-icons" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>push_pin</span>
                      <p>No default configuration set</p>
                      <p className={styles.emptyHint}>Run a backtest and click "Use for Current Position" to set your default</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'configs' && (
              <div className={styles.configsGrid}>
                {savedConfigs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className="material-icons">bookmark_border</span>
                    <p>No saved configurations yet</p>
                    <p className={styles.emptyHint}>Save a configuration from the Backtest page to see it here</p>
                  </div>
                ) : (
                  savedConfigs.map(config => (
                    <div key={config.id} className={styles.configCard}>
                      <div className={styles.configHeader}>
                        <h3>{config.name}</h3>
                        {config.isFavorite && (
                          <span className="material-icons" style={{ color: '#ffcc00' }}>star</span>
                        )}
                      </div>
                      <div className={styles.configDetails}>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Asset</span>
                          <span className={styles.configValue}>{config.asset}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Interval</span>
                          <span className={styles.configValue}>{config.interval}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>EMA</span>
                          <span className={styles.configValue}>{config.emaFast}/{config.emaSlow}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Strategy</span>
                          <span className={styles.configValue}>{config.strategyMode}</span>
                        </div>
                        <div className={styles.configRow}>
                          <span className={styles.configLabel}>Capital</span>
                          <span className={styles.configValue}>${config.initialCapital?.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className={styles.configActions}>
                        <button 
                          className={styles.loadBtn}
                          onClick={() => handleLoadConfig(config)}
                        >
                          <span className="material-icons">play_arrow</span>
                          Run
                        </button>
                        <button 
                          className={styles.setDefaultBtn}
                          onClick={() => handleSetConfigAsDefault(config)}
                          title="Use for Current Position"
                        >
                          <span className="material-icons">push_pin</span>
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteConfig(config.id)}
                        >
                          <span className="material-icons">delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className={styles.historyList}>
                {backtestRuns.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span className="material-icons">inbox</span>
                    <p>No backtest history yet</p>
                    <p className={styles.emptyHint}>Run a backtest to see your history here</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}

