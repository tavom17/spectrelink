'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import ArcanaMark from '@/components/ArcanaMark'
import Footer from '@/components/Footer'

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

  if (step === 'seed') {
    const words = seedPhrase.trim().split(/\s+/).filter(Boolean)
    return (
      <div className="auth">
        <main className="auth-main">
          <div className="glass glass-accent glow auth-card stack" style={{ maxWidth: 560, gap: 18 }}>
            <div>
              <div className="kicker kicker-accent">Shown once</div>
              <h1 style={{ fontSize: 22, marginTop: 8 }}>Save your seed phrase</h1>
              <p className="hint" style={{ marginTop: 6 }}>
                It cannot be recovered. Write it down and store it offline before you continue.
              </p>
            </div>

            <ol className="seed-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {words.map((w, i) => (
                <li key={i} className="seed-word"><span>{i + 1}</span>{w}</li>
              ))}
            </ol>

            <label className="row-flex" style={{ alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <span className="hint" style={{ color: 'var(--ink-2)' }}>
                I have saved my seed phrase in a secure offline location
              </span>
            </label>

            <button
              onClick={() => router.push('/transit')}
              disabled={!confirmed}
              className="btn btn-accent btn-block"
            >
              Enter dashboard →
            </button>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="auth">
      <main className="auth-main">
        <form onSubmit={handleSubmit} className="glass glass-accent glow auth-card stack" style={{ gap: 18 }}>
          <div className="auth-brand"><ArcanaMark /></div>

          <div>
            <h1 style={{ fontSize: 22 }}>Create account</h1>
            <p className="hint" style={{ marginTop: 6 }}>Registration needs an invite secret.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="reg-email">Email</label>
            <input id="reg-email" className="input" type="email" autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} />
          </div>

          <div className="field">
            <label className="label" htmlFor="reg-password">Password</label>
            <input id="reg-password" className="input" type="password" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} required disabled={loading} />
          </div>

          <div className="field">
            <label className="label" htmlFor="reg-secret">Registration secret</label>
            <input id="reg-secret" className="input" type="password"
              value={secret} onChange={e => setSecret(e.target.value)} required disabled={loading} />
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          <button type="submit" className="btn btn-accent btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Register →'}
          </button>

          <p className="hint" style={{ textAlign: 'center' }}>
            Have an account? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </main>
      <Footer />
    </div>
  )
}
