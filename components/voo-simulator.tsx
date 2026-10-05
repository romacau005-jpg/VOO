'use client'

import { useMemo, useState } from 'react'
import { Shield, TrendingUp } from 'lucide-react'
import { ExpensesPanel } from '@/components/simulator/expenses-panel'
import { ReportDownload } from '@/components/simulator/report-download'
import { Panel, ParamField, type FieldSpec } from '@/components/simulator/param-field'
import { SimulationChart } from '@/components/simulator/simulation-chart'
import {
  fmtCurrency,
  runSimulation,
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
  { key: 'inflation', spec: { label: '預計年通脹率 (%)', min: 0, max: 20, step: 0.1, format: pct, inputSuffix: '%' } },
  { key: 'rate', spec: { label: '預計年化回報率 (%) · 股票 VOO', min: 0, max: 12, step: 0.5, format: pct } },
  { key: 'totalYears', spec: { label: '總滾存時間 (年)', min: 0, max: 100, step: 1, format: years, wide: true } },
]

const bucketSpecs: { key: Exclude<keyof BucketParams, 'strategy'>; spec: FieldSpec; bucketOnly?: boolean }[] = [
  { key: 'cashYears', bucketOnly: true, spec: { label: '第 1 桶 現金:預留提領年數', min: 0, max: 10, step: 1, format: years } },
  { key: 'cashRate', bucketOnly: true, spec: { label: '現金桶年化回報 (%)', min: 0, max: 8, step: 0.5, format: pct } },
  { key: 'bondYears', bucketOnly: true, spec: { label: '第 2 桶 債券:預留提領年數', min: 0, max: 15, step: 1, format: years } },
  { key: 'bondRate', bucketOnly: true, spec: { label: '債券桶年化回報 (%)', min: 0, max: 10, step: 0.5, format: pct } },
  { key: 'bearInterval', spec: { label: '熊市回檔週期 (每 N 年一次)', min: 0, max: 10, step: 1, format: (v) => (v === 0 ? '不模擬' : `每 ${v} 年`) } },
  { key: 'bearDrop', spec: { label: '熊市年度跌幅 (%)', min: 0, max: 50, step: 5, format: (v) => `-${v}%` } },
]

const defaultParams: SimulationParams = {
  initial: 0,
  monthly: 0,
  stopYears: 0,
  withdrawStartYears: 0,
  withdrawPercent: 0,
  rate: 0,
  inflation: 3,
  totalYears: 0,
  startAge: 30,
}

const defaultBuckets: BucketParams = {
  strategy: 'buckets',
  cashYears: 2,
  cashRate: 2.5,
  bondYears: 5,
  bondRate: 4.5,
  bearInterval: 4,
  bearDrop: 20,
}

export function VooSimulator() {
  const [params, setParams] = useState(defaultParams)
  const [buckets, setBuckets] = useState(defaultBuckets)
  const [expenses, setExpenses] = useState<OneTimeExpense[]>([])

  const result = useMemo(
    () => runSimulation(params, buckets, expenses),
    [params, buckets, expenses],
  )
  const otherStrategy: Strategy = buckets.strategy === 'buckets' ? 'voo' : 'buckets'
  const compareResult = useMemo(
    () => runSimulation(params, { ...buckets, strategy: otherStrategy }, expenses),
    [params, buckets, expenses, otherStrategy],
  )

  const chartData = useMemo(
    () =>
      result.points.map((p, i) => ({
        ...p,
        compare: compareResult.points[i]?.balance ?? 0,
      })),
    [result.points, compareResult.points],
  )

  const showWithdraw =
    params.withdrawStartYears > 0 && params.withdrawStartYears <= params.totalYears
  const firstWithdraw = showWithdraw ? result.firstYearWithdraw : 0
  const lastWithdraw = showWithdraw
    ? firstWithdraw *
      Math.pow(1 + params.inflation / 100, params.totalYears - params.withdrawStartYears)
    : 0

  const delta = result.finalBalance - compareResult.finalBalance

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8 md:py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-balance text-2xl font-black tracking-wide text-primary md:text-3xl">
          VOO Simulator
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          注資、提領、三桶水防禦與一次性大額支出 · 100 年極限時間軸
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SummaryCard label="注資期總投入本金" value={fmtCurrency(result.totalInvested)} />
        <SummaryCard label="累計提領金額" value={fmtCurrency(result.totalWithdrawn)} />
        <SummaryCard label="一次性支出合計" value={fmtCurrency(result.totalExpenses)} />
        <SummaryCard label="預期最終總資產" value={fmtCurrency(result.finalBalance)} highlight />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <StrategyToggle
            value={buckets.strategy}
            onChange={(strategy) => setBuckets((b) => ({ ...b, strategy }))}
          />
          <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground md:items-end">
            <span>
              對比{otherStrategy === 'voo' ? ' 100% VOO' : '三桶水'}最終資產:{' '}
              <span className="text-foreground">{fmtCurrency(compareResult.finalBalance)}</span>
            </span>
            <span>
              差額:{' '}
              <span className={delta >= 0 ? 'text-[var(--chart-3)]' : 'text-[var(--chart-5)]'}>
                {delta >= 0 ? '+' : '-'}
                {fmtCurrency(Math.abs(delta))}
              </span>
            </span>
          </div>
        </div>

        <SimulationChart
          data={chartData}
          strategy={buckets.strategy}
          stopYears={params.stopYears}
          withdrawStartYears={params.withdrawStartYears}
          totalYears={params.totalYears}
        />

        <ChartLegend strategy={buckets.strategy} />

        {result.depletedYear !== null && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            資產於第 {result.depletedYear} 年耗盡。
          </p>
        )}
      </section>

      <Panel title="基本參數" description="注資、提領與回報設定。提領採通脹調整法:首年按比例,其後每年按通脹遞增。">
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
                    首年提領(第 {showWithdraw ? params.withdrawStartYears : '-'} 年):每年{' '}
                    <span className="text-foreground">{fmtCurrency(firstWithdraw)}</span> (每月{' '}
                    <span className="text-foreground">{fmtCurrency(firstWithdraw / 12)}</span>)
                  </p>
                  <p>
                    末年提領(第 {showWithdraw ? params.totalYears : '-'} 年):每年{' '}
                    <span className="text-foreground">{fmtCurrency(lastWithdraw)}</span> (每月{' '}
                    <span className="text-foreground">{fmtCurrency(lastWithdraw / 12)}</span>)
                  </p>
                </div>
              )}
            </ParamField>
          ))}
        </div>
      </Panel>

      <Panel
        title="三桶水防禦參數"
        description="進入提領期時建立現金與債券桶。牛市年底由股票桶補充至目標水位;熊市年鎖定股票桶,優先消耗現金與債券。熊市設定兩種模式皆適用。"
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          {bucketSpecs.map(({ key, spec, bucketOnly }) => (
            <ParamField
              key={key}
              spec={spec}
              value={buckets[key]}
              disabled={bucketOnly && buckets.strategy === 'voo'}
              onChange={(v) => setBuckets((b) => ({ ...b, [key]: v }))}
            />
          ))}
        </div>
      </Panel>

      <ExpensesPanel
        expenses={expenses}
        onChange={setExpenses}
        totalYears={params.totalYears}
      />

      <ReportDownload params={params} buckets={buckets} result={result} />
    </div>
  )
}

function StrategyToggle({
  value,
  onChange,
}: {
  value: Strategy
  onChange: (s: Strategy) => void
}) {
  const options: { value: Strategy; label: string; Icon: typeof Shield }[] = [
    { value: 'voo', label: '100% VOO 模式', Icon: TrendingUp },
    { value: 'buckets', label: '三桶水防禦模式', Icon: Shield },
  ]
  return (
    <div role="radiogroup" aria-label="投資策略" className="inline-flex rounded-lg border border-border bg-background p-1">
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
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
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

function ChartLegend({ strategy }: { strategy: Strategy }) {
  const items =
    strategy === 'buckets'
      ? [
          { label: '股票桶', color: 'var(--chart-1)' },
          { label: '債券桶', color: 'var(--chart-3)' },
          { label: '現金桶', color: 'var(--chart-4)' },
        ]
      : [{ label: '總資產', color: 'var(--chart-1)' }]
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
        對比策略
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-[var(--chart-5)]" />
        一次性支出
      </span>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-sm md:p-4 ${
        highlight ? 'border-primary/50' : 'border-border'
      }`}
    >
      <p className={`text-xs ${highlight ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
        {label}
      </p>
      <p
        className={`truncate font-mono font-bold ${
          highlight ? 'text-lg text-primary md:text-2xl' : 'text-base text-foreground md:text-xl'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
