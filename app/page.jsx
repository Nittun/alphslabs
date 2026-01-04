'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function Home() {
  const router = useRouter()
  const { data: session, status } = useSession()
  
  useEffect(() => {
    if (status === 'loading') return
    
    if (status === 'authenticated') {
      // Redirect authenticated users to backtest page
      router.push('/backtest')
    } else {
      // Redirect unauthenticated users to login page
      router.push('/login')
    }
  }, [status, router])
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: '#0a0a0a',
      color: '#fff'
    }}>
      <div>Loading...</div>
    </div>
  )
}
