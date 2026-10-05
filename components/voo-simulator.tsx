'use client'

import { useMemo, useRef, useState } from 'react'
import { Dices, Loader2, Shield, TrendingUp } from 'lucide-react'
import { ExpensesPanel } from '@/components/simulator/expenses-panel'
import { ExtremeScenarios } from '@/components/simulator/extreme-scenarios'
import { FanChart, type FanMode } from '@/components/simulator/fan-chart'
import { Panel, ParamField, type FieldSpec } from '@/components/simulator/param-field'
import { ReportDownload } from '@/components/simulator/report-download'
import { HIST_FIRST_YEAR, HIST_LAST_YEAR } from '@/lib/historical-returns'
import {
  BEAR_THRESHOLD,
  SIMULATION_COUNT,
  runMonteCarlo,
  type MonteCarloResult,
} from '@/lib/monte-carlo'
import {
  fmtCurrency,
  type BucketParams,
  type OneTimeExpense,
  type SimulationParams,
  type Strategy,
} from '@/lib/voo-simulation'

const pct = (v: number) => `${v}%`
const years = (v: number) => `${v} 年`

const basicSpecs: { key: keyof SimulationParams; spec: FieldSpec }[] = [
  { key: 'startAge', spec: { label: '起始年齡', min: 0, max: 100, step: 1, format: (v) => `${v} 歲`, inputSuffix: '歲' } },
  { key: 'initial', spec: { label: '現時 VOO 總資產', min: 0, max: 5_000_000, step: 100_000, format: fmtCurrency } },
  { key: 'monthly', spec: { label: '每月額外投入', min: 0, max: 50_000, step: 1_000, format: fmtCurrency } },
  { key: 'stopYears', spec: { label: '每月投入停止時間 (年)', min: 0, max: 50, step: 1, format: years } },
  { key: 'withdrawStartYears', spec: { label: '開始提領時間 (第幾年)', min: 0, max: 50, step: 1, format: (v) => `第 ${v} 年` } },
  { key: 'withdrawPercent', spec: { label: '每年提領比例 (%)', min: 0, max: 10, step: 0.5, format: pct } },
  { key: 'inflation', spec: { label: '預計長期平均通脹率 (%)', min: 0, max: 20, step: 0.1, format: pct, inputSuffix: '%' } },
  { key: 'totalYears', spec: { label: '總滾存時間 (年)', min: 0, max: 100, step: 1, format: years } },
]

const bucketSpecs: { key: Exclude<keyof BucketParams, 'strategy'>; spec: FieldSpec }[] = [
  { key: 'cashYears', spec: { label: '第 1 桶 現金:預留提領年數', min: 0, max: 10, step: 1, format: years } },
  { key: 'bondYears', spec: { label: '第 2 桶 債券:預留提領年數', min: 0, max: 15, step: 1, format: years } },
]

const defaultParams: SimulationParams = {
  initial: 0,
  monthly: 0,
  stopYears: 0,
  withdrawStartYears: 0,
  withdrawPercent: 0,
  inflation: 3,
  totalYears: 55,
  startAge: 30,
}

const defaultBuckets: BucketParams = {
  strategy: 'buckets',
  cashYears: 2,
  bondYears: 5,
}

const strategyName = (s: Strategy) => (s === 'buckets' ? '三桶水' : '100% VOO')

export function VooSimulator() {
  const [params, setParams] = useState(defaultParams)
  const [buckets, setBuckets] = useState(defaultBuckets)
  const [expenses, setExpenses] = useState<OneTimeExpense[]>([])
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [resultParams, setResultParams] = useState<SimulationParams>(defaultParams)
  const [runKey, setRunKey] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [mode, setMode] = useState<FanMode>('nominal')
  const resultsRef = useRef<HTMLElement>(null)

  const inputKey = useMemo(
    () => JSON.stringify({ params, buckets, expenses }),
    [params, buckets, expenses],
  )
  const stale = result !== null && runKey !== inputKey

  const handleRun = () => {
    setRunning(true)
    const snapshot = { params, buckets, expenses, key: inputKey }
    setTimeout(() => {
      const r = runMonteCarlo(snapshot.params, snapshot.buckets, snapshot.expenses)
      setResult(r)
      setResultParams(snapshot.params)
      setRunKey(snapshot.key)
      setRunning(false)
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 30)
  }

  const showWithdraw =
    result !== null &&
    resultParams.withdrawStartYears > 0 &&
    resultParams.withdrawStartYears <= resultParams.totalYears
  const firstWithdraw = showWithdraw ? result.medianFirstWithdraw : 0
  const lastWithdraw = showWithdraw
    ? firstWithdraw *
      Math.pow(
        1 + resultParams.inflation / 100,
        resultParams.totalYears - resultParams.withdrawStartYears,
      )
    : 0

  const expenseYears = useMemo(
    () =>
      [...new Set(expenses.filter((e) => e.amount > 0).map((e) => e.year))].filter(
        (y) => y <= (result?.years ?? 0),
      ),
    [expenses, result?.years],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-28 pt-8 md:px-8 md:pt-12">
      <header className="space-y-2 text-center">
        <h1 className="text-balance text-2xl font-black tracking-wide text-primary md:text-3xl">
          VOO Simulator
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          蒙地卡羅 {SIMULATION_COUNT.toLocaleString()} 次歷史抽樣 · 三桶水防禦 · {HIST_FIRST_YEAR}–{HIST_LAST_YEAR} 美股、美債與通脹真實數據
        </p>
      </header>

      <section ref={resultsRef} aria-labelledby="results-heading" className="scroll-mt-4 space-y-4">
        <h2 id="results-heading" className="sr-only">
          模擬結果
        </h2>
        {result ? (
          <>
            {stale && (
              <p role="status" className="rounded-md border border-[var(--chart-4)]/40 bg-[var(--chart-4)]/10 px-3 py-2 text-xs text-foreground">
                參數已變更,以下為上次模擬結果。請重新點擊「運行模擬」。
              </p>
            )}
            <ResultMetrics result={result} />
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground md:text-base">
                    蒙地卡羅扇形圖 (Cone of Probability)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {strategyName(result.strategy)}策略 · {result.simulations.toLocaleString()} 條路徑 · {result.years} 年
                  </p>
                </div>
                <ModeToggle value={mode} onChange={setMode} />
              </div>
              <FanChart
                fan={result.fan}
                mode={mode}
                stopYears={resultParams.stopYears}
                withdrawStartYears={resultParams.withdrawStartYears}
                expenseYears={expenseYears}
              />
              <FanLegend />
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm md:p-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground md:text-base">極端風險演示</h3>
                <p className="text-xs text-muted-foreground">
                  回報次序風險:同樣的平均回報,熊市出現的時間點決定成敗。紅色為熊市年 (股票回報低於 {BEAR_THRESHOLD}%)。
                </p>
              </div>
              <ExtremeScenarios
                best={result.best}
                worst={result.worst}
                withdrawStartYears={resultParams.withdrawStartYears}
              />
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </section>

      <Panel
        title="基本參數"
        description="提領採通脹調整法:首年 = 開始提領時總資產 × 提領比例,其後每年按該路徑上一年的實際通脹遞增。"
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          {basicSpecs.map(({ key, spec }) => (
            <ParamField
              key={key}
              spec={spec}
              value={params[key]}
              onChange={(v) => setParams((p) => ({ ...p, [key]: v }))}
            >
              {key === 'withdrawPercent' && (
                <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                  <p>
                    首年提領(第 {showWithdraw ? resultParams.withdrawStartYears : '-'} 年 · 中位數):每年{' '}
                    <span className="text-foreground">{fmtCurrency(firstWithdraw)}</span> (每月{' '}
                    <span className="text-foreground">{fmtCurrency(firstWithdraw / 12)}</span>)
                  </p>
                  <p>
                    末年提領(第 {showWithdraw ? resultParams.totalYears : '-'} 年):每年{' '}
                    <span className="text-foreground">{fmtCurrency(lastWithdraw)}</span> (每月{' '}
                    <span className="text-foreground">{fmtCurrency(lastWithdraw / 12)}</span>)
                  </p>
                  {!result && <p className="text-muted-foreground/70">運行模擬後顯示。</p>}
                </div>
              )}
              {key === 'inflation' && (
                <p className="text-xs text-muted-foreground">
                  每條路徑使用抽樣年份的真實通脹,並平移至此平均值。
                </p>
              )}
            </ParamField>
          ))}
        </div>
      </Panel>

      <Panel
        title="三桶水防禦參數"
        description={`牛市/平市年底由股票桶補足現金與債券桶至目標水位;熊市 (股票當年回報低於 ${BEAR_THRESHOLD}%) 徹底鎖定股票桶,優先消耗現金與債券支付生活費。現金桶回報 = 3 個月美國國庫券,債券桶 = 10 年期美國國債。`}
      >
        <div className="space-y-6">
          <StrategyToggle
            value={buckets.strategy}
            onChange={(strategy) => setBuckets((b) => ({ ...b, strategy }))}
          />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            {bucketSpecs.map(({ key, spec }) => (
              <ParamField
                key={key}
                spec={spec}
                value={buckets[key]}
                disabled={buckets.strategy === 'voo'}
                onChange={(v) => setBuckets((b) => ({ ...b, [key]: v }))}
              />
            ))}
          </div>
        </div>
      </Panel>

      <ExpensesPanel expenses={expenses} onChange={setExpenses} totalYears={params.totalYears} />

      {result && !stale && (
        <ReportDownload params={resultParams} buckets={buckets} result={result} />
      )}

      <div className="sticky bottom-4 z-10">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {running
              ? `正在運行 ${SIMULATION_COUNT.toLocaleString()} 次模擬…`
              : stale || !result
                ? '參數已就緒'
                : `成功率 ${result.successRate.toFixed(1)}%`}
          </p>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70"
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Dices className="size-4" aria-hidden="true" />
            )}
            運行模擬
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultMetrics({ result }: { result: MonteCarloResult }) {
  const rate = result.successRate
  const rateColor = rate >= 90 ? 'var(--chart-3)' : rate >= 75 ? 'var(--chart-4)' : 'var(--chart-5)'
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <div className="col-span-2 rounded-xl border border-primary/50 bg-card p-4 shadow-sm md:col-span-1">
        <p className="text-xs font-medium text-primary">策略成功率</p>
        <p className="font-mono text-3xl font-black" style={{ color: rateColor }}>
          {rate.toFixed(1)}%
        </p>
        <p className="text-[11px] text-muted-foreground">
          {(result.simulations - result.failureCount).toLocaleString()} / {result.simulations.toLocaleString()} 次活過 {result.years} 年
        </p>
      </div>
      <Metric
        label="資產耗盡中位數年份"
        value={result.depletionMedianYear !== null ? `第 ${Math.round(result.depletionMedianYear)} 年` : '無失敗'}
        note={result.failureCount > 0 ? `失敗 ${result.failureCount.toLocaleString()} 次` : '所有路徑均未耗盡'}
      />
      <Metric
        label="成功情境 · 終端實質購買力"
        value={result.successReal ? fmtCurrency(result.successReal.p50) : '-'}
        note={
          result.successReal
            ? `中位數 · 10–90%: ${fmtCurrency(result.successReal.p10)} – ${fmtCurrency(result.successReal.p90)}`
            : '無成功路徑'
        }
      />
      <Metric
        label={`對比 ${strategyName(result.compare.strategy)} 成功率`}
        value={`${result.compare.successRate.toFixed(1)}%`}
        note={`相同 ${result.simulations.toLocaleString()} 條市場序列`}
      />
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm md:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-base font-bold text-foreground md:text-xl">{value}</p>
      <p className="text-pretty text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Dices className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">尚未運行模擬</p>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          設定下方參數後點擊「運行模擬」,系統將以 {HIST_FIRST_YEAR}–{HIST_LAST_YEAR} 年真實市場數據隨機組合出 {SIMULATION_COUNT.toLocaleString()} 條牛熊序列。
        </p>
      </div>
    </div>
  )
}

function ModeToggle({ value, onChange }: { value: FanMode; onChange: (m: FanMode) => void }) {
  const options: { value: FanMode; label: string }[] = [
    { value: 'nominal', label: '名目資產' },
    { value: 'real', label: '實質購買力' },
  ]
  return (
    <div role="radiogroup" aria-label="顯示模式" className="inline-flex self-start rounded-lg border border-border bg-background p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function StrategyToggle({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  const options: { value: Strategy; label: string; Icon: typeof Shield }[] = [
    { value: 'voo', label: '100% VOO 模式', Icon: TrendingUp },
    { value: 'buckets', label: '三桶水防禦模式', Icon: Shield },
  ]
  return (
    <div role="radiogroup" aria-label="投資策略" className="inline-flex w-full rounded-lg border border-border bg-background p-1 md:w-auto">
      {options.map(({ value: v, label, Icon }) => {
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function FanLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-[var(--chart-1)]" />
        中位數
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-3)]" />
        前 10% (最幸運)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-[var(--chart-5)]" />
        後 10% (最倒霉)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--chart-1)] opacity-40" />
        25–75% / 10–90% 區間
      </span>
    </div>
  )
}
