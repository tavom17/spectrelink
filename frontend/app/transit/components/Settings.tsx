'use client'

/**
 * Settings — the account block reads the live session; every other group is
 * placeholder (lib/placeholders) until a settings endpoint exists.
 */

import { useAuth } from '@/lib/auth'
import { PreviewTag } from '@/components/ui'
import { SETTING_GROUPS, type SettingRow } from '@/lib/placeholders'

function Row({ r, last }: { r: SettingRow; last: boolean }) {
  return (
    <div className="row-flex" style={{ justifyContent: 'space-between', gap: 20, padding: '14px 0', flexWrap: 'nowrap', borderBottom: last ? 0 : '1px solid rgba(233,233,237,.05)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>{r.k}</span>
        <span className="hint">{r.note}</span>
      </div>
      {r.action
        ? <button type="button" className="btn btn-sm" disabled title="Not wired to the API yet">{r.v}</button>
        : <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)', whiteSpace: 'nowrap' }}>{r.v}</span>}
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()

  const account: SettingRow[] = [
    { k: 'Signed in as', note: 'Account email', v: user?.user_email ?? '—' },
    { k: 'Session', note: 'Refreshed automatically while active', v: 'Active' },
  ]

  return (
    <div>
      <div className="page-head">
        <div className="page-kicker">Network, execution and session</div>
        <PreviewTag />
      </div>

      <div className="grid-auto" style={{ '--min': '330px', alignItems: 'start' } as React.CSSProperties}>
        <div className="glass glow">
          <div className="card-head"><span className="step-title">Account</span></div>
          <div style={{ padding: '6px 20px 16px' }}>
            {account.map((r, i) => <Row key={r.k} r={r} last={i === account.length - 1} />)}
          </div>
        </div>

        {SETTING_GROUPS.map(g => (
          <div key={g.title} className="glass glow">
            <div className="card-head"><span className="step-title">{g.title}</span></div>
            <div style={{ padding: '6px 20px 16px' }}>
              {g.rows.map((r, i) => <Row key={r.k} r={r} last={i === g.rows.length - 1} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
