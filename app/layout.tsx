import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Noto_Sans_HK, Geist_Mono } from 'next/font/google'
import './globals.css'

const notoSansHK = Noto_Sans_HK({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '700', '900'],
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'VOO Simulator',
  description: '注資、停供與 4% 提領全流程模擬 — 100 年極限時間軸',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-HK" className={`${notoSansHK.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
