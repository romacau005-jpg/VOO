'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import type { FanPoint } from '@/lib/monte-carlo'
import { fmtCompact, fmtCurrency } from '@/lib/voo-simulation'

const chartConfig = {
  p90: { label: '前 10% (最幸運)', color: 'var(--chart-3)' },
  p50: { label: '中位數', color: 'var(--chart-1)' },
  p10: { label: '後 10% (最倒霉)', color: 'var(--chart-5)' },
  band: { label: '10–90% 區間', color: 'var(--chart-1)' },
} satisfies ChartConfig

type Row = {
  year: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  outer: [number, number]
  inner: [number, number]
}

export type FanMode = 'nominal' | 'real'

export function FanChart({
  fan,
  mode,
  stopYears,
  withdrawStartYears,
  expenseYears,
}: {
  fan: FanPoint[]
  mode: FanMode
  stopYears: number
  withdrawStartYears: number
  expenseYears: number[]
}) {
  const totalYears = fan.length - 1
  const data: Row[] = fan.map((f) => {
    const v =
      mode === 'real'
        ? { p10: f.real10, p25: f.real25, p50: f.real50, p75: f.real75, p90: f.real90 }
        : { p10: f.p10, p25: f.p25, p50: f.p50, p75: f.p75, p90: f.p90 }
    return { year: f.year, ...v, outer: [v.p10, v.p90], inner: [v.p25, v.p75] }
  })

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full md:h-[400px]">
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 20 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={56}
          tickFormatter={(v) => fmtCompact(v)}
        />

        {stopYears > 0 && stopYears <= totalYears && (
          <ReferenceLine
            x={stopYears}
            stroke="var(--chart-4)"
            strokeDasharray="4 4"
            label={{ value: '停供', position: 'top', fill: 'var(--chart-4)', fontSize: 11 }}
          />
        )}
        {withdrawStartYears > 0 && withdrawStartYears <= totalYears && (
          <ReferenceLine
            x={withdrawStartYears}
            stroke="var(--chart-2)"
            strokeDasharray="4 4"
            label={{ value: '提領', position: 'top', fill: 'var(--chart-2)', fontSize: 11 }}
          />
        )}
        {expenseYears.map((y) => (
          <ReferenceLine key={`exp-${y}`} x={y} stroke="var(--chart-5)" strokeOpacity={0.6} />
        ))}

        <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<FanTooltip mode={mode} />} />

        <Area
          dataKey="outer"
          type="monotone"
          stroke="none"
          fill="var(--color-band)"
          fillOpacity={0.14}
          isAnimationActive={false}
          activeDot={false}
        />
        <Area
          dataKey="inner"
          type="monotone"
          stroke="none"
          fill="var(--color-band)"
          fillOpacity={0.22}
          isAnimationActive={false}
          activeDot={false}
        />
        <Line dataKey="p90" type="monotone" stroke="var(--color-p90)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="p10" type="monotone" stroke="var(--color-p10)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="p50" type="monotone" stroke="var(--color-p50)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  )
}

function FanTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean
  payload?: { payload: Row }[]
  mode: FanMode
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const rows = [
    { label: '前 10% (最幸運)', value: row.p90, color: 'var(--chart-3)' },
    { label: '前 25%', value: row.p75, color: 'var(--chart-1)', faint: true },
    { label: '中位數', value: row.p50, color: 'var(--chart-1)', bold: true },
    { label: '後 25%', value: row.p25, color: 'var(--chart-1)', faint: true },
    { label: '後 10% (最倒霉)', value: row.p10, color: 'var(--chart-5)' },
  ]
  return (
    <div className="min-w-52 space-y-2 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-foreground">第 {row.year} 年</span>
        <span className="text-muted-foreground">{mode === 'real' ? '實質購買力' : '名目資產'}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className={`flex items-center gap-1.5 ${r.faint ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
              <span className="size-2 rounded-sm" style={{ backgroundColor: r.color, opacity: r.faint ? 0.5 : 1 }} />
              {r.label}
            </span>
            <span className={`font-mono text-foreground ${r.bold ? 'font-bold' : ''}`}>
              {fmtCurrency(r.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
