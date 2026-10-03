'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import ArcanaMark from '@/components/ArcanaMark'
import Footer from '@/components/Footer'

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

  return (
    <div className="auth">
      <main className="auth-main">
        <form onSubmit={handleSubmit} className="glass glass-accent glow auth-card stack" style={{ gap: 18 }}>
          <div className="auth-brand"><ArcanaMark /></div>

          <div>
            <h1 style={{ fontSize: 22 }}>Sign in</h1>
            <p className="hint" style={{ marginTop: 6 }}>Launchpad, wallets and command center in one place.</p>
          </div>

          <div className="field">
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          <button type="submit" className="btn btn-accent btn-block" disabled={loading}>
            {loading ? 'Authenticating…' : 'Enter →'}
          </button>

          <p className="hint" style={{ textAlign: 'center' }}>
            No account? <Link href="/register">Register</Link>
          </p>
        </form>
      </main>
      <Footer />
    </div>
  )
}
