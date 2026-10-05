'use client'

import { useState } from 'react'
import { FileDown, FileText, Loader2 } from 'lucide-react'
import type { BucketParams, SimulationParams, SimulationResult } from '@/lib/voo-simulation'

export function ReportDownload({
  params,
  buckets,
  result,
}: {
  params: SimulationParams
  buckets: BucketParams
  result: SimulationResult
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const handleDownload = async () => {
    setStatus('loading')
    try {
      const { generateRetirementReport } = await import('@/lib/pdf-report')
      await generateRetirementReport({ params, buckets, result })
      setStatus('idle')
    } catch (err) {
      console.error('PDF generation failed', err)
      setStatus('error')
    }
  }

  const loading = status === 'loading'

  return (
    <section
      aria-labelledby="report-heading"
      className="flex flex-col gap-4 rounded-xl border border-red-500/40 bg-red-500/5 p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 id="report-heading" className="text-base font-semibold md:text-lg">
            年度詳細 PDF 報告
          </h2>
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            依目前參數匯出 {params.totalYears} 年逐年明細:年初/年底資產、供款、提領、一次性支出、熊市、投資收益、實質購買力
            {buckets.strategy === 'buckets' ? '及三桶水各桶餘額' : ''}。
          </p>
          {status === 'error' && (
            <p role="alert" className="text-xs text-destructive">
              報告生成失敗,請稍後再試。
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="size-4" aria-hidden="true" />
        )}
        {loading ? '正在生成報告…' : '生成並下載詳細年度 PDF 報告'}
      </button>
    </section>
  )
}
