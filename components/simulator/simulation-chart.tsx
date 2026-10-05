'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  fmtCompact,
  fmtCurrency,
  type Strategy,
  type YearPoint,
} from '@/lib/voo-simulation'

const chartConfig = {
  stock: { label: '股票桶 (VOO)', color: 'var(--chart-1)' },
  bond: { label: '債券桶', color: 'var(--chart-3)' },
  cash: { label: '現金桶', color: 'var(--chart-4)' },
  balance: { label: '總資產', color: 'var(--chart-1)' },
  compare: { label: '對比策略', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

type ChartRow = YearPoint & { compare: number }

export function SimulationChart({
  data,
  strategy,
  stopYears,
  withdrawStartYears,
  totalYears,
}: {
  data: ChartRow[]
  strategy: Strategy
  stopYears: number
  withdrawStartYears: number
  totalYears: number
}) {
  const compareLabel = strategy === 'buckets' ? '100% VOO 對比' : '三桶水對比'
  const expensePoints = data.filter((p) => p.expense > 0)

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full md:h-[400px]">
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 20 }}>
        <defs>
          {(['stock', 'bond', 'cash', 'balance'] as const).map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.45} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={52}
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
        {expensePoints.map((p) => (
          <ReferenceLine
            key={`exp-line-${p.year}`}
            x={p.year}
            stroke="var(--chart-5)"
            strokeWidth={1.5}
            label={{ value: '支出', position: 'insideTopRight', fill: 'var(--chart-5)', fontSize: 11 }}
          />
        ))}

        <ChartTooltip
          cursor={{ stroke: 'var(--border)' }}
          content={<ChartTooltipBody strategy={strategy} compareLabel={compareLabel} />}
        />

        {strategy === 'buckets' ? (
          <>
            <Area dataKey="cash" stackId="b" type="monotone" stroke="var(--color-cash)" strokeWidth={1.5} fill="url(#fill-cash)" />
            <Area dataKey="bond" stackId="b" type="monotone" stroke="var(--color-bond)" strokeWidth={1.5} fill="url(#fill-bond)" />
            <Area dataKey="stock" stackId="b" type="monotone" stroke="var(--color-stock)" strokeWidth={2} fill="url(#fill-stock)" />
          </>
        ) : (
          <Area dataKey="balance" type="monotone" stroke="var(--color-balance)" strokeWidth={2} fill="url(#fill-balance)" />
        )}
        <Line
          dataKey="compare"
          type="monotone"
          stroke="var(--color-compare)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={false}
        />

        {expensePoints.map((p) => (
          <ReferenceDot
            key={`exp-dot-${p.year}`}
            x={p.year}
            y={p.balance}
            r={5}
            fill="var(--chart-5)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        ))}
      </ComposedChart>
    </ChartContainer>
  )
}

function ChartTooltipBody({
  active,
  payload,
  strategy,
  compareLabel,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
  strategy: Strategy
  compareLabel: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload

  return (
    <div className="min-w-48 space-y-2 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-foreground">第 {row.year} 年</span>
        {row.isBear && (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            熊市年
          </span>
        )}
      </div>
      <div className="space-y-1">
        <TooltipRow label="總資產" value={row.balance} color="var(--chart-1)" bold />
        {strategy === 'buckets' && (
          <>
            <TooltipRow label="股票桶" value={row.stock} color="var(--chart-1)" />
            <TooltipRow label="債券桶" value={row.bond} color="var(--chart-3)" />
            <TooltipRow label="現金桶" value={row.cash} color="var(--chart-4)" />
          </>
        )}
        <TooltipRow label={compareLabel} value={row.compare} color="var(--muted-foreground)" />
      </div>
      {row.expenseItems.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="font-medium text-[var(--chart-5)]">一次性支出</p>
          {row.expenseItems.map((item, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-mono text-foreground">-{fmtCurrency(item.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TooltipRow({
  label,
  value,
  color,
  bold,
}: {
  label: string
  value: number
  color: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className={`font-mono ${bold ? 'font-bold text-foreground' : 'text-foreground'}`}>
        {fmtCurrency(value)}
      </span>
    </div>
  )
}
