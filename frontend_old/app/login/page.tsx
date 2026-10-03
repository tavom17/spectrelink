'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/transit')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--glass-border)',
    color: 'var(--white)',
    padding: '10px 14px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: '14px',
    outline: 'none',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: '11px',
    color: 'var(--dim)',
    letterSpacing: '0.08em',
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
          <label style={labelStyle}>EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={loading}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
            style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: 'rgba(255,80,80,0.8)', margin: 0 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {loading ? 'Authenticating...' : 'Enter'}
          {!loading && <span className="btn-arrow">→</span>}
        </button>

        <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '11px', color: 'var(--dim)', margin: 0, textAlign: 'center' }}>
          No account?{' '}
          <Link href="/register" style={{ color: 'var(--white)', textDecoration: 'none' }}>
            Register
          </Link>
        </p>
      </form>
    </div>
  )
}
