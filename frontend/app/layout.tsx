import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import Backdrop from '@/components/Backdrop'
import GlowTracker from '@/components/GlowTracker'

export const metadata: Metadata = {
  title: 'Arcana',
  description: 'Token launches, wallets and a command center for Solana — powered by Spectre Link',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Backdrop />
        <GlowTracker />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
