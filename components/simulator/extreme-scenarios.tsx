import { TrendingDown, TrendingUp } from 'lucide-react'
import type { ExtremePath } from '@/lib/monte-carlo'
import { BEAR_THRESHOLD } from '@/lib/monte-carlo'
import { fmtCurrency, fmtPct } from '@/lib/voo-simulation'

export function ExtremeScenarios({
  best,
  worst,
  withdrawStartYears,
}: {
  best: ExtremePath
  worst: ExtremePath
  withdrawStartYears: number
}) {
  const fromLabel = withdrawStartYears > 0 ? `提領首 5 年 (第 ${withdrawStartYears} 年起)` : '首 5 年'
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <ScenarioCard
        tone="good"
        title="最幸運組合"
        subtitle="終端實質購買力最高的序列"
        path={best}
        fromLabel={fromLabel}
      />
      <ScenarioCard
        tone="bad"
        title="最倒霉組合"
        subtitle="最早耗盡 / 終端資產最低的序列"
        path={worst}
        fromLabel={fromLabel}
      />
    </div>
  )
}

function ScenarioCard({
  tone,
  title,
  subtitle,
  path,
  fromLabel,
}: {
  tone: 'good' | 'bad'
  title: string
  subtitle: string
  path: ExtremePath
  fromLabel: string
}) {
  const Icon = tone === 'good' ? TrendingUp : TrendingDown
  const accent = tone === 'good' ? 'var(--chart-3)' : 'var(--chart-5)'
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex items-start gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`, color: accent }}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">終端實質購買力</dt>
          <dd className="font-mono text-sm font-bold text-foreground">{fmtCurrency(path.finalReal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">結果</dt>
          <dd className="font-mono text-sm font-bold" style={{ color: path.depletedYear ? 'var(--chart-5)' : 'var(--chart-3)' }}>
            {path.depletedYear ? `第 ${path.depletedYear} 年耗盡` : '全程未耗盡'}
          </dd>
        </div>
      </dl>
      {path.earlyReturns.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{fromLabel} S&amp;P 500 回報</p>
          <ul className="flex flex-wrap gap-1.5">
            {path.earlyReturns.map((r) => {
              const bear = r.stockReturn < BEAR_THRESHOLD
              return (
                <li
                  key={r.year}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                    bear ? 'bg-destructive/15 text-destructive' : 'bg-muted text-foreground'
                  }`}
                  title={`第 ${r.year} 年 = 歷史 ${r.histYear} 年`}
                >
                  {r.histYear} {fmtPct(r.stockReturn, 0)}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
