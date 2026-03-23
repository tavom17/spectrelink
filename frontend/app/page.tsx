'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { useEffect } from 'react'
import spectreLink from '../images/spectreLinkOfficial.png'

const featureBlocks = [
  {
    num: '01',
    title: 'TOKEN LAUNCHPAD',
    body: 'SPL Token Program integration via Helius private RPC. Mint creation, metadata management, and deployment orchestration. Real-time transaction monitoring via Helius webhooks pushed to WebSocket.',
    details: [],
    icon: (
      <svg className="w-10 h-10 opacity-70 flex-shrink-0" viewBox="0 0 40 40" fill="none">
        <polygon points="20,4 36,12 36,28 20,36 4,28 4,12" stroke="white" strokeWidth="1" fill="none"/>
        <polygon points="20,12 28,16 28,24 20,28 12,24 12,16" stroke="white" strokeWidth="0.5" fill="none" opacity="0.5"/>
        <circle cx="20" cy="20" r="3" fill="white"/>
      </svg>
    ),
  },
  {
    num: '02',
    title: 'WALLET GENERATOR & MANAGER',
    body: 'Full-spectrum wallet infrastructure with military-grade key management and stateless architecture.',
    details: [
      'HD wallet creation using BIP-39 key derivation',
      'Mnemonic phrase for user recovery',
      'Encrypted storage with AES',
      'Stateless architecture',
      'Keys reconstructed from encrypted mnemonic on demand',
      'Private keys live in memory only during active operations',
    ],
    icon: (
      <svg className="w-10 h-10 opacity-70 flex-shrink-0" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="2" stroke="white" strokeWidth="1" fill="none"/>
        <circle cx="20" cy="20" r="6" stroke="white" strokeWidth="1" fill="none"/>
        <line x1="20" y1="4" x2="20" y2="14" stroke="white" strokeWidth="0.5"/>
        <line x1="20" y1="26" x2="20" y2="36" stroke="white" strokeWidth="0.5"/>
        <line x1="4" y1="20" x2="14" y2="20" stroke="white" strokeWidth="0.5"/>
        <line x1="26" y1="20" x2="36" y2="20" stroke="white" strokeWidth="0.5"/>
      </svg>
    ),
  },
  {
    num: '03',
    title: 'LIQUIDITY MANAGER',
    body: 'Meteora DEX pool management and position tracking with off-chain orchestration of on-chain programs.',
    details: [
      'Real-time PnL tracking',
      'Full order history',
      'Automated buys and sells',
      'Bundling and sniping capabilities',
    ],
    icon: (
      <svg className="w-10 h-10 opacity-70 flex-shrink-0" viewBox="0 0 40 40" fill="none">
        <path d="M8 32 L20 8 L32 32" stroke="white" strokeWidth="1" fill="none"/>
        <path d="M12 24 L28 24" stroke="white" strokeWidth="0.5"/>
        <circle cx="20" cy="8" r="3" fill="none" stroke="white" strokeWidth="1"/>
        <circle cx="8" cy="32" r="3" fill="none" stroke="white" strokeWidth="1"/>
        <circle cx="32" cy="32" r="3" fill="none" stroke="white" strokeWidth="1"/>
      </svg>
    ),
  },
  {
    num: '04',
    title: 'ALL IN ONE OR À LA CARTE',
    body: 'Deploy the full SpectreLink suite or use individual modules independently. Each system operates in isolation — combine them for unified launch orchestration, or run standalone for targeted operations.',
    details: [],
    icon: (
      <svg className="w-10 h-10 opacity-70 flex-shrink-0" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="14" height="14" stroke="white" strokeWidth="1" fill="none"/>
        <rect x="22" y="4" width="14" height="14" stroke="white" strokeWidth="1" fill="none"/>
        <rect x="4" y="22" width="14" height="14" stroke="white" strokeWidth="1" fill="none"/>
        <rect x="22" y="22" width="14" height="14" stroke="white" strokeWidth="0.5" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
]

export default function Home() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('block-visible')
          } else if (
            entry.rootBounds &&
            entry.boundingClientRect.top > entry.rootBounds.bottom
          ) {
            // Element is below the viewport — user scrolled back up
            entry.target.classList.remove('block-visible')
          }
        })
      },
      { threshold: [0, 0.35] }
    )

    document.querySelectorAll('.feature-block').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shimmer-text {
          background: linear-gradient(
            90deg,
            rgba(240,240,240,0.35) 0%,
            rgba(240,240,240,0.35) 35%,
            rgba(255,255,255,1)    50%,
            rgba(240,240,240,0.35) 65%,
            rgba(240,240,240,0.35) 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3.5s linear infinite;
        }
        .feature-block {
          transform: translateX(80px);
          opacity: 0;
          transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 1s ease;
          transition-delay: var(--slide-delay, 0ms);
        }
        .feature-block.block-visible {
          transform: translateX(0);
          opacity: 1;
        }
      `}</style>

      {/* Hero */}
      <section
        className="relative flex flex-col justify-center items-center text-center overflow-hidden"
        style={{ height: 'calc(100vh - 72px)', padding: '0 40px' }}
      >
        {/* Perspective grid */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
            transform: 'perspective(800px) rotateX(20deg) translateY(10%) scale(1.4)',
            transformOrigin: 'bottom',
          }} />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 20%, rgba(1,1,1,0.9) 80%)',
          }} />
        </div>

        {/* Scan lines */}
        {[25, 50, 75].map((left, i) => (
          <div key={left} className="absolute top-0 bottom-0 w-px" style={{
            left: `${left}%`,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)',
            animation: `lineScan 4s ease-in-out ${i * 1.5}s infinite`,
            opacity: i === 1 ? 0.5 : 1,
          }} />
        ))}

        {/* Hero content — centered, ~70% wide */}
        <div
          className="relative z-10 flex flex-col items-center"
          style={{ width: '94%', maxWidth: '1280px' }}
        >
          <div className="section-label fade-up fade-up-1 shimmer-text" style={{ marginBottom: '24px' }}>
            Off-Chain Orchestration Platform
          </div>

          <div className="fade-up fade-up-2" style={{ width: '100%', marginBottom: '14px' }}>
            <Image
              src={spectreLink}
              alt="SpectreLink"
              style={{ width: '100%', height: 'auto', maxHeight: '58vh', objectFit: 'contain' }}
              priority
            />
          </div>

          <p className="fade-up fade-up-3" style={{
            fontSize: '16px',
            fontWeight: 300,
            color: 'var(--dim)',
            lineHeight: '1.7',
            maxWidth: '520px',
            marginBottom: '32px',
            letterSpacing: '0.02em',
          }}>
            An off-chain orchestration platform unifying wallet operations, token deployment,
            and liquidity management on Solana. Built for precision. Engineered for control.
          </p>

          <div className="flex gap-4 flex-wrap justify-center fade-up fade-up-4">
            <Link href="/transit" className="btn btn-primary">
              Launch App
              <span className="btn-arrow">→</span>
            </Link>
            <Link href="/overview" className="btn btn-ghost">
              Architecture
              <span className="btn-arrow">→</span>
            </Link>
          </div>
        </div>


      </section>

      {/* Divider */}
      <div className="mx-20" style={{ height: '1px', background: 'var(--glass-border)' }} />

      {/* Feature blocks */}
      <section className="px-20 py-28">
        <div className="section-label">Platform Modules</div>
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(40px, 5vw, 72px)',
          letterSpacing: '0.05em',
          color: 'var(--white)',
          lineHeight: 1.05,
          marginBottom: '64px',
          textAlign: 'center',
        }}>
          <span style={{ display: 'block' }}>THREE SYSTEMS.</span>
          <span style={{ display: 'block', marginLeft: '6%' }}>ONE INTERFACE.</span>
        </h2>

        <div style={{ border: '1px solid var(--glass-border)' }}>
          {featureBlocks.map((block, i) => (
            <div
              key={block.num}
              className="feature-block card-hover"
              style={{
                '--slide-delay': `${i * 160}ms`,
                display: 'flex',
                gap: '48px',
                padding: '48px',
                background: 'var(--glass)',
                borderBottom: i < featureBlocks.length - 1
                  ? '1px solid var(--glass-border)'
                  : 'none',
                alignItems: 'flex-start',
                position: 'relative',
              } as React.CSSProperties}
            >
              {/* Ghost number */}
              <div style={{
                position: 'absolute',
                top: '16px',
                right: '48px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '100px',
                color: 'rgba(255,255,255,0.04)',
                lineHeight: 1,
                letterSpacing: '0.05em',
                userSelect: 'none',
                pointerEvents: 'none',
              }}>
                {block.num}
              </div>

              {/* Icon */}
              <div style={{ paddingTop: '4px' }}>
                {block.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '28px',
                  letterSpacing: '0.08em',
                  color: 'var(--white)',
                  marginBottom: '12px',
                }}>
                  {block.title}
                </div>

                <p style={{
                  fontSize: '16px',
                  fontWeight: 300,
                  color: 'rgba(240,240,240,0.72)',
                  lineHeight: 1.75,
                  maxWidth: '680px',
                  marginBottom: block.details.length > 0 ? '20px' : 0,
                }}>
                  {block.body}
                </p>

                {block.details.length > 0 && (
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {block.details.map((detail, j) => (
                      <li key={j} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: '13px',
                        color: 'rgba(240,240,240,0.5)',
                        letterSpacing: '0.05em',
                      }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '8px' }}>▸</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  )
}
