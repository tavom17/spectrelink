'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

type Step = 'form' | 'seed'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState('')
  const [seedPhrase, setSeedPhrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await register(email, password, secret)
      setSeedPhrase(result.seedPhrase)
      setStep('seed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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

  if (step === 'seed') {
    return (
      <div style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          border: '1px solid var(--glass-border)',
          background: 'var(--glass)',
          padding: '48px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '520px',
          width: '100%',
        }}>
          <div className="section-label">Save Your Seed Phrase</div>

          <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: 'rgba(255,200,80,0.9)', margin: 0, lineHeight: 1.7 }}>
            This is shown once and cannot be recovered. Write it down and store it offline.
          </p>

          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.12)',
            padding: '20px',
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '13px',
            color: 'var(--white)',
            lineHeight: 2,
            letterSpacing: '0.04em',
            wordBreak: 'break-word',
          }}>
            {seedPhrase}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: 'var(--white)' }}
            />
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '11px', color: 'var(--dim)', lineHeight: 1.7 }}>
              I have saved my seed phrase in a secure offline location
            </span>
          </label>

          <button
            onClick={() => router.push('/transit')}
            disabled={!confirmed}
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              opacity: confirmed ? 1 : 0.35,
              cursor: confirmed ? 'pointer' : 'not-allowed',
            }}
          >
            Enter Dashboard
            <span className="btn-arrow">→</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <div className="section-label">Create Account</div>

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>REGISTRATION SECRET</label>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
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
          {loading ? 'Creating Account...' : 'Register'}
          {!loading && <span className="btn-arrow">→</span>}
        </button>

        <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '11px', color: 'var(--dim)', margin: 0, textAlign: 'center' }}>
          Have an account?{' '}
          <Link href="/login" style={{ color: 'var(--white)', textDecoration: 'none' }}>
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}
