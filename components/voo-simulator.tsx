'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Slider } from '@/components/ui/slider'
import {
  fmtCompact,
  fmtCurrency,
  runSimulation,
  type SimulationParams,
} from '@/lib/voo-simulation'

const chartConfig = {
  balance: { label: '資產價值', color: 'var(--chart-1)' },
} satisfies ChartConfig

type SliderKey = keyof SimulationParams

type SliderSpec = {
  key: SliderKey
  label: string
  min: number
  max: number
  step: number
  format: (v: number) => string
  wide?: boolean
  /** 渲染為數字輸入框而非拉桿 */
  input?: boolean
}

const sliderSpecs: SliderSpec[] = [
  {
    key: 'initial',
    label: '現時 VOO 總資產',
    min: 0,
    max: 5_000_000,
    step: 100_000,
    format: fmtCurrency,
  },
  {
    key: 'monthly',
    label: '每月額外投入',
    min: 0,
    max: 50_000,
    step: 1_000,
    format: fmtCurrency,
  },
  {
    key: 'stopYears',
    label: '每月投入停止時間 (年)',
    min: 0,
    max: 50,
    step: 1,
    format: (v) => `${v} 年`,
  },
  {
    key: 'withdrawStartYears',
    label: '開始提領時間 (第幾年)',
    min: 0,
    max: 50,
    step: 1,
    format: (v) => `第 ${v} 年`,
  },
  {
    key: 'withdrawPercent',
    label: '每年提領比例 (%)',
    min: 0,
    max: 10,
    step: 0.5,
    format: (v) => `${v}%`,
  },
  {
    key: 'inflation',
    label: '預計年通脹率 (%)',
    min: 0,
    max: 20,
    step: 0.1,
    format: (v) => `${v}%`,
    input: true,
  },
  {
    key: 'rate',
    label: '預計年化回報率 (%)',
    min: 0,
    max: 12,
    step: 0.5,
    format: (v) => `${v}%`,
  },
  {
    key: 'totalYears',
    label: '總滾存時間 (年)',
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v} 年`,
    wide: true,
  },
]

const defaults: SimulationParams = {
  initial: 0,
  monthly: 0,
  stopYears: 0,
  withdrawStartYears: 0,
  withdrawPercent: 0,
  rate: 0,
  inflation: 3,
  totalYears: 0,
}

export function VooSimulator() {
  const [params, setParams] = useState<SimulationParams>(defaults)

  const result = useMemo(() => runSimulation(params), [params])

  // 開始提領當年年初總資產 = 開始提領前一年年底的資產 (points[withdrawStartYears - 1])
  const firstYearWithdraw = useMemo(() => {
    if (params.withdrawStartYears <= 0 || params.withdrawPercent <= 0) return 0
    const startIndex = params.withdrawStartYears - 1
    const startPoint = result.points[startIndex]
    if (!startPoint) return 0
    return startPoint.balance * (params.withdrawPercent / 100)
  }, [result.points, params.withdrawStartYears, params.withdrawPercent])

  const setParam = (key: SliderKey, value: number) =>
    setParams((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-8 md:py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-balance text-2xl font-black tracking-wide text-primary md:text-3xl">
          VOO Simulator
        </h1>
        <p className="text-sm text-muted-foreground">
          注資、停供與 4% 提領全流程模擬 · 100 年極限時間軸
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="起步本金" value={fmtCurrency(params.initial)} />
        <SummaryCard
          label="注資期總投入本金"
          value={fmtCurrency(result.totalInvested)}
        />
        <SummaryCard
          label="預期最終總資產"
          value={fmtCurrency(result.finalBalance)}
          highlight
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-2.5 rounded-full bg-[var(--chart-1)]" />
            VOO 滾存與提領後資產
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            累計提領:{' '}
            <span className="text-foreground">
              {fmtCurrency(result.totalWithdrawn)}
            </span>
          </p>
        </div>

        <ChartContainer
          config={chartConfig}
          className="h-[320px] w-full md:h-[400px]"
        >
          <AreaChart data={result.points} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillBalance" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-balance)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-balance)"
                  stopOpacity={0.03}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={52}
              tickFormatter={(v) => fmtCompact(v)}
            />
            {params.stopYears <= params.totalYears && (
              <ReferenceLine
                x={params.stopYears}
                stroke="var(--chart-4)"
                strokeDasharray="4 4"
                label={{
                  value: '停供',
                  position: 'top',
                  fill: 'var(--chart-4)',
                  fontSize: 11,
                }}
              />
            )}
            {params.withdrawStartYears <= params.totalYears && (
              <ReferenceLine
                x={params.withdrawStartYears}
                stroke="var(--chart-5)"
                strokeDasharray="4 4"
                label={{
                  value: '提領',
                  position: 'top',
                  fill: 'var(--chart-5)',
                  fontSize: 11,
                }}
              />
            )}
            <ChartTooltip
              cursor={{ stroke: 'var(--border)' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `第 ${label} 年`}
                  formatter={(value) => (
                    <span className="font-mono">
                      {fmtCurrency(value as number)}
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="balance"
              type="monotone"
              stroke="var(--color-balance)"
              strokeWidth={2}
              fill="url(#fillBalance)"
            />
          </AreaChart>
        </ChartContainer>
      </section>

      <section className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
        <h2 className="border-b border-border pb-2 text-lg font-semibold">
          調整投資與提領參數
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          {sliderSpecs.map((spec) => (
            <div
              key={spec.key}
              className={`space-y-2 ${spec.wide ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center justify-between text-sm">
                <label className="text-muted-foreground">{spec.label}</label>
                {!spec.input && (
                  <span className="font-mono font-bold text-primary">
                    {spec.format(params[spec.key])}
                  </span>
                )}
              </div>
              {spec.input ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={params[spec.key]}
                    onChange={(e) => {
                      const raw = e.target.valueAsNumber
                      const next = Number.isNaN(raw)
                        ? spec.min
                        : Math.min(spec.max, Math.max(spec.min, raw))
                      setParam(spec.key, next)
                    }}
                    aria-label={spec.label}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm font-bold text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <span className="font-mono text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              ) : (
                <Slider
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={params[spec.key]}
                  onValueChange={(v) =>
                    setParam(spec.key, Array.isArray(v) ? v[0] : v)
                  }
                  aria-label={spec.label}
                />
              )}
              {spec.key === 'withdrawPercent' && (
                <p className="font-mono text-xs text-muted-foreground">
                  首年提領:每年{' '}
                  <span className="text-foreground">
                    {fmtCurrency(firstYearWithdraw)}
                  </span>{' '}
                  (每月{' '}
                  <span className="text-foreground">
                    {fmtCurrency(firstYearWithdraw / 12)}
                  </span>
                  )
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
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
      className={`rounded-xl border bg-card p-4 shadow-sm ${
        highlight ? 'border-primary/50' : 'border-border'
      }`}
    >
      <p
        className={`text-xs ${highlight ? 'font-medium text-primary' : 'text-muted-foreground'}`}
      >
        {label}
      </p>
      <p
        className={`font-mono font-bold ${
          highlight
            ? 'text-2xl font-extrabold text-primary'
            : 'text-xl text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
