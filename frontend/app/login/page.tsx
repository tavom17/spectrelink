'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (res.ok) {
      router.push('/transit')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Login failed')
    }
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 72px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          border: '1px solid var(--glass-border)',
          background: 'var(--glass)',
          padding: '48px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          minWidth: '360px',
        }}
      >
        <div className="section-label">SpectreLink Access</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em' }}>
            USERNAME
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            style={{
              background: 'transparent',
              border: '1px solid var(--glass-border)',
              color: 'var(--white)',
              padding: '10px 14px',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '14px',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.08em' }}>
            PASSWORD
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              background: 'transparent',
              border: '1px solid var(--glass-border)',
              color: 'var(--white)',
              padding: '10px 14px',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '14px',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>

        {error && (
          <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: 'rgba(255,80,80,0.8)', margin: 0 }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          Enter
          <span className="btn-arrow">→</span>
        </button>
      </form>
    </div>
  )
}
