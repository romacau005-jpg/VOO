'use client'

import type { ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'

export type FieldSpec = {
  label: string
  min: number
  max: number
  step: number
  format: (v: number) => string
  /** 渲染為數字輸入框而非拉桿, 值為右側單位 */
  inputSuffix?: string
  wide?: boolean
}

export function ParamField({
  spec,
  value,
  onChange,
  disabled,
  children,
}: {
  spec: FieldSpec
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  children?: ReactNode
}) {
  const id = `field-${spec.label}`
  return (
    <div
      className={`space-y-2.5 ${spec.wide ? 'md:col-span-2' : ''} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor={id} className="text-muted-foreground">
          {spec.label}
        </label>
        {!spec.inputSuffix && (
          <span className="font-mono font-bold text-primary">
            {spec.format(value)}
          </span>
        )}
      </div>
      {spec.inputSuffix ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.valueAsNumber
              onChange(
                Number.isNaN(raw)
                  ? spec.min
                  : Math.min(spec.max, Math.max(spec.min, raw)),
              )
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm font-bold text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <span className="font-mono text-sm text-muted-foreground">
            {spec.inputSuffix}
          </span>
        </div>
      ) : (
        <Slider
          id={id}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          disabled={disabled}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          aria-label={spec.label}
        />
      )}
      {children}
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold md:text-lg">{title}</h2>
          {description && (
            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
