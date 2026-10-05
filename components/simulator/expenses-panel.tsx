'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtCurrency, type OneTimeExpense } from '@/lib/voo-simulation'
import { Panel } from './param-field'

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary'

export function ExpensesPanel({
  expenses,
  onChange,
  totalYears,
}: {
  expenses: OneTimeExpense[]
  onChange: (next: OneTimeExpense[]) => void
  totalYears: number
}) {
  const update = (id: string, patch: Partial<OneTimeExpense>) =>
    onChange(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const add = () =>
    onChange([
      ...expenses,
      {
        id: crypto.randomUUID(),
        name: '',
        year: Math.max(1, Math.min(totalYears || 1, 5)),
        amount: 500_000,
      },
    ])

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  return (
    <Panel
      title="一次性大額支出"
      description="試算走到該年份時,會於年初先扣除支出。三桶水模式下優先從股票桶扣除,不足再由債券 / 現金桶補足。"
      action={
        <Button size="sm" onClick={add}>
          <Plus aria-hidden="true" />
          新增一次性支出
        </Button>
      }
    >
      {expenses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          暫無一次性支出
        </p>
      ) : (
        <ul className="space-y-3">
          {expenses.map((e, idx) => {
            const outOfRange = totalYears > 0 && e.year > totalYears
            return (
              <li
                key={e.id}
                className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/40 p-3 md:grid-cols-[1fr_7rem_10rem_auto] md:items-end"
              >
                <div className="col-span-2 space-y-1 md:col-span-1">
                  <label htmlFor={`exp-name-${e.id}`} className="text-xs text-muted-foreground">
                    支出項目 #{idx + 1}
                  </label>
                  <input
                    id={`exp-name-${e.id}`}
                    type="text"
                    value={e.name}
                    placeholder="例如:換車、子女留學"
                    onChange={(ev) => update(e.id, { name: ev.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`exp-year-${e.id}`} className="text-xs text-muted-foreground">
                    發生年份 (第幾年)
                  </label>
                  <input
                    id={`exp-year-${e.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    value={e.year}
                    onChange={(ev) => {
                      const v = ev.target.valueAsNumber
                      update(e.id, {
                        year: Number.isNaN(v) ? 1 : Math.min(100, Math.max(1, Math.round(v))),
                      })
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`exp-amt-${e.id}`} className="text-xs text-muted-foreground">
                    金額
                  </label>
                  <input
                    id={`exp-amt-${e.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={10_000}
                    value={e.amount}
                    onChange={(ev) => {
                      const v = ev.target.valueAsNumber
                      update(e.id, { amount: Number.isNaN(v) ? 0 : Math.max(0, v) })
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
                  {outOfRange && (
                    <span className="text-xs text-[var(--chart-4)] md:hidden">超出滾存時間</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(expenses.filter((x) => x.id !== e.id))}
                    aria-label={`刪除支出 ${e.name || idx + 1}`}
                    className="ml-auto text-muted-foreground hover:text-destructive md:ml-0"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                {outOfRange && (
                  <p className="col-span-full hidden text-xs text-[var(--chart-4)] md:block">
                    此支出年份超出總滾存時間 ({totalYears} 年),不會計入試算。
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {expenses.length > 0 && (
        <p className="mt-4 text-right font-mono text-xs text-muted-foreground">
          支出合計:<span className="text-foreground">{fmtCurrency(total)}</span>
        </p>
      )}
    </Panel>
  )
}
