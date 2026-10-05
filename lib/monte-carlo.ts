import {
  HISTORY,
  HIST_BILL,
  HIST_BOND,
  HIST_CPI,
  HIST_MEAN_INFLATION,
  HIST_STOCK,
  HIST_YEAR,
} from '@/lib/historical-returns'
import type {
  BucketParams,
  OneTimeExpense,
  SimulationParams,
  Strategy,
  YearPoint,
} from '@/lib/voo-simulation'

export const SIMULATION_COUNT = 5000
/** 股票桶當年回報低於此值 (%) 即視為熊市 */
export const BEAR_THRESHOLD = -5
/** 區塊抽樣平均長度 (年):保留連續多年熊市/牛市的歷史聚集特性 */
const MEAN_BLOCK_YEARS = 5
const DEFAULT_SEED = 20260510

export type FanPoint = {
  year: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  real10: number
  real25: number
  real50: number
  real75: number
  real90: number
}

export type ExtremePath = {
  points: YearPoint[]
  depletedYear: number | null
  finalBalance: number
  finalReal: number
  firstWithdraw: number
  /** 提領期 (或第 1 年起) 頭 5 年的股市回報,用於展示回報次序風險 */
  earlyReturns: { year: number; histYear: number; stockReturn: number }[]
}

export type MonteCarloResult = {
  simulations: number
  years: number
  strategy: Strategy
  fan: FanPoint[]
  /** 未耗盡的模擬比例 (0–100) */
  successRate: number
  failureCount: number
  /** 失敗情境中資產耗盡年份的中位數 */
  depletionMedianYear: number | null
  /** 成功情境:終端實質購買力分佈 */
  successReal: { p10: number; p50: number; p90: number } | null
  successNominalMedian: number | null
  medianFirstWithdraw: number
  compare: { strategy: Strategy; successRate: number; medianFinalReal: number }
  best: ExtremePath
  worst: ExtremePath
  inflationShift: number
  seed: number
}

type Buckets = { cash: number; bond: number; stock: number }
type BucketKey = keyof Buckets

const ORDER_STOCK_FIRST: BucketKey[] = ['stock', 'bond', 'cash']
const ORDER_CASH_FIRST: BucketKey[] = ['cash', 'bond', 'stock']
const ORDER_STOCK_ONLY: BucketKey[] = ['stock']

function drain(amount: number, b: Buckets, order: BucketKey[]) {
  let remaining = amount
  for (const key of order) {
    if (remaining <= 0) break
    const take = Math.min(b[key], remaining)
    b[key] -= take
    remaining -= take
  }
  return amount - remaining
}

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 平穩區塊自助抽樣:隨機起點,每年以 1/MEAN_BLOCK_YEARS 機率跳到新的隨機歷史年份 */
function sampleSequence(simIndex: number, seed: number, years: number) {
  const rng = mulberry32(seed + simIndex * 7919)
  const n = HISTORY.length
  const out = new Int32Array(years)
  let idx = Math.floor(rng() * n)
  for (let i = 0; i < years; i++) {
    if (i > 0) {
      idx = rng() < 1 / MEAN_BLOCK_YEARS ? Math.floor(rng() * n) : (idx + 1) % n
    }
    out[i] = idx
  }
  return out
}

type PathContext = {
  params: SimulationParams
  cashYears: number
  bondYears: number
  expensesByYear: Map<number, OneTimeExpense[]>
  inflationShift: number
}

type PathOutcome = {
  depletedYear: number | null
  finalBalance: number
  finalReal: number
  firstWithdraw: number
  points?: YearPoint[]
}

function simulatePath(
  seq: Int32Array,
  ctx: PathContext,
  strategy: Strategy,
  sink?: { nominal: Float64Array; real: Float64Array; offset: number },
  detail = false,
): PathOutcome {
  const { params, cashYears, bondYears, expensesByYear, inflationShift } = ctx
  const { initial, monthly, stopYears, withdrawStartYears, withdrawPercent, totalYears } = params
  const useBuckets = strategy === 'buckets'
  const withdrawOrder = useBuckets ? ORDER_CASH_FIRST : ORDER_STOCK_ONLY

  const b: Buckets = { cash: 0, bond: 0, stock: initial }
  let annualWithdraw = 0
  let firstWithdraw = 0
  let deflator = 1
  let prevInflation = 0
  let depletedYear: number | null = null
  let balance = initial

  const points: YearPoint[] | undefined = detail
    ? [
        {
          year: 0,
          histYear: 0,
          startBalance: initial,
          yearContribution: initial,
          yearWithdrawal: 0,
          expense: 0,
          expenseItems: [],
          isBear: false,
          stockReturn: 0,
          bondReturn: 0,
          inflation: 0,
          gain: 0,
          balance: initial,
          realBalance: initial,
          cash: 0,
          bond: 0,
          stock: initial,
        },
      ]
    : undefined

  if (sink) {
    sink.nominal[sink.offset] = initial
    sink.real[sink.offset] = initial
  }

  for (let yr = 1; yr <= totalYears; yr++) {
    const h = seq[yr - 1]
    const stockR = HIST_STOCK[h]
    const bondR = HIST_BOND[h]
    const cashR = HIST_BILL[h]
    const inflation = Math.max(-0.15, HIST_CPI[h] + inflationShift)
    const isBear = stockR * 100 < BEAR_THRESHOLD
    const inWithdrawal = withdrawStartYears > 0 && yr >= withdrawStartYears
    const startBalance = b.cash + b.bond + b.stock

    // 1. 一次性支出:熊市時避開股票桶,優先動用現金 → 債券
    const yearExpenses = expensesByYear.get(yr)
    let expenseTaken = 0
    let expensePlanned = 0
    if (yearExpenses) {
      const order = !useBuckets ? ORDER_STOCK_FIRST : isBear ? ORDER_CASH_FIRST : ORDER_STOCK_FIRST
      for (const e of yearExpenses) {
        expensePlanned += e.amount
        expenseTaken += drain(e.amount, b, order)
      }
    }

    // 2. 通脹調整提領:首年按比例,其後按上一年實際通脹遞增
    if (inWithdrawal) {
      if (yr === withdrawStartYears) {
        annualWithdraw = (b.cash + b.bond + b.stock) * (withdrawPercent / 100)
        firstWithdraw = annualWithdraw
        if (useBuckets) {
          b.cash += drain(Math.max(0, annualWithdraw * cashYears - b.cash), b, ['stock'])
          b.bond += drain(Math.max(0, annualWithdraw * bondYears - b.bond), b, ['stock'])
        }
      } else {
        annualWithdraw *= 1 + prevInflation
      }
    }
    const monthlyWithdraw = annualWithdraw / 12

    // 3. 逐月:回報 → 注資 → 提領
    const sm = Math.pow(1 + stockR, 1 / 12)
    const bm = Math.pow(1 + bondR, 1 / 12)
    const cm = Math.pow(1 + cashR, 1 / 12)
    let yearContribution = 0
    let yearWithdrawal = 0
    for (let m = 1; m <= 12; m++) {
      b.stock *= sm
      b.bond *= bm
      b.cash *= cm
      if ((yr - 1) * 12 + m <= stopYears * 12 && monthly > 0) {
        b.stock += monthly
        yearContribution += monthly
      }
      if (inWithdrawal && monthlyWithdraw > 0) {
        yearWithdrawal += drain(monthlyWithdraw, b, withdrawOrder)
      }
    }

    // 4. 年底:牛市/平市由股票桶補足現金與債券桶;熊市鎖定股票桶不賣出
    if (useBuckets && inWithdrawal && !isBear && annualWithdraw > 0) {
      const next = annualWithdraw * (1 + inflation)
      b.bond += drain(Math.max(0, next * bondYears - b.bond), b, ['stock'])
      b.cash += drain(Math.max(0, next * cashYears - b.cash), b, ['stock'])
    }

    deflator *= 1 + inflation
    prevInflation = inflation
    balance = b.cash + b.bond + b.stock

    const shortfall =
      (inWithdrawal && annualWithdraw - yearWithdrawal > 1) || expensePlanned - expenseTaken > 1
    if (depletedYear === null && (shortfall || (balance <= 0.5 && (annualWithdraw > 0 || expensePlanned > 0)))) {
      depletedYear = yr
    }
    if (balance <= 0.5) {
      b.cash = b.bond = b.stock = 0
      balance = 0
    }

    const realBalance = balance / deflator

    if (sink) {
      sink.nominal[sink.offset + yr] = balance
      sink.real[sink.offset + yr] = realBalance
    }

    if (points) {
      points.push({
        year: yr,
        histYear: HIST_YEAR[h],
        startBalance,
        yearContribution,
        yearWithdrawal,
        expense: expenseTaken,
        expenseItems: (yearExpenses ?? []).map((e) => ({
          name: e.name || '未命名支出',
          amount: e.amount,
        })),
        isBear,
        stockReturn: stockR * 100,
        bondReturn: bondR * 100,
        inflation: inflation * 100,
        gain: balance - startBalance - yearContribution + yearWithdrawal + expenseTaken,
        balance,
        realBalance,
        cash: b.cash,
        bond: b.bond,
        stock: b.stock,
      })
    } else if (depletedYear !== null && balance === 0 && !(monthly > 0 && yr < stopYears)) {
      if (sink) {
        sink.nominal.fill(0, sink.offset + yr + 1, sink.offset + totalYears + 1)
        sink.real.fill(0, sink.offset + yr + 1, sink.offset + totalYears + 1)
      }
      return { depletedYear, finalBalance: 0, finalReal: 0, firstWithdraw }
    }
  }

  return {
    depletedYear,
    finalBalance: balance,
    finalReal: balance / deflator,
    firstWithdraw,
    points,
  }
}

function quantile(sorted: Float64Array, q: number) {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const s = Float64Array.from(values).sort()
  return quantile(s, 0.5)
}

export function runMonteCarlo(
  params: SimulationParams,
  buckets: BucketParams,
  expenses: OneTimeExpense[],
  seed = DEFAULT_SEED,
): MonteCarloResult {
  const years = Math.max(0, Math.round(params.totalYears))
  const S = SIMULATION_COUNT
  const width = years + 1
  const strategy = buckets.strategy
  const compareStrategy: Strategy = strategy === 'buckets' ? 'voo' : 'buckets'

  const expensesByYear = new Map<number, OneTimeExpense[]>()
  for (const e of expenses) {
    if (e.amount > 0 && e.year >= 1 && e.year <= years) {
      expensesByYear.set(e.year, [...(expensesByYear.get(e.year) ?? []), e])
    }
  }

  const ctx: PathContext = {
    params: { ...params, totalYears: years },
    cashYears: buckets.cashYears,
    bondYears: buckets.bondYears,
    expensesByYear,
    inflationShift: (params.inflation - HIST_MEAN_INFLATION) / 100,
  }

  const nominal = new Float64Array(S * width)
  const real = new Float64Array(S * width)
  const depleted = new Int32Array(S)
  const finalReal = new Float64Array(S)
  const finalNominal = new Float64Array(S)
  const firstWithdraws = new Float64Array(S)
  const compareFinalReal = new Float64Array(S)
  let compareFailures = 0

  for (let i = 0; i < S; i++) {
    const seq = sampleSequence(i, seed, years)
    const out = simulatePath(seq, ctx, strategy, { nominal, real, offset: i * width })
    depleted[i] = out.depletedYear ?? 0
    finalReal[i] = out.finalReal
    finalNominal[i] = out.finalBalance
    firstWithdraws[i] = out.firstWithdraw

    const cmp = simulatePath(seq, ctx, compareStrategy)
    compareFinalReal[i] = cmp.finalReal
    if (cmp.depletedYear !== null) compareFailures++
  }

  const fan: FanPoint[] = []
  const col = new Float64Array(S)
  const colReal = new Float64Array(S)
  for (let y = 0; y <= years; y++) {
    for (let i = 0; i < S; i++) {
      col[i] = nominal[i * width + y]
      colReal[i] = real[i * width + y]
    }
    col.sort()
    colReal.sort()
    fan.push({
      year: y,
      p10: quantile(col, 0.1),
      p25: quantile(col, 0.25),
      p50: quantile(col, 0.5),
      p75: quantile(col, 0.75),
      p90: quantile(col, 0.9),
      real10: quantile(colReal, 0.1),
      real25: quantile(colReal, 0.25),
      real50: quantile(colReal, 0.5),
      real75: quantile(colReal, 0.75),
      real90: quantile(colReal, 0.9),
    })
  }

  const failedYears: number[] = []
  const successReals: number[] = []
  const successNominals: number[] = []
  let bestIdx = 0
  let worstIdx = 0
  for (let i = 0; i < S; i++) {
    if (depleted[i] > 0) failedYears.push(depleted[i])
    else {
      successReals.push(finalReal[i])
      successNominals.push(finalNominal[i])
    }
    if (finalReal[i] > finalReal[bestIdx]) bestIdx = i
    const wi = depleted[worstIdx]
    const di = depleted[i]
    const worse =
      di > 0 && wi > 0
        ? di < wi
        : di > 0 && wi === 0
          ? true
          : di === 0 && wi === 0 && finalReal[i] < finalReal[worstIdx]
    if (worse) worstIdx = i
  }

  const successSorted = Float64Array.from(successReals).sort()
  const compareSorted = compareFinalReal.slice().sort()
  const firstSorted = firstWithdraws.slice().sort()

  const extreme = (idx: number): ExtremePath => {
    const seq = sampleSequence(idx, seed, years)
    const out = simulatePath(seq, ctx, strategy, undefined, true)
    const points = out.points ?? []
    const from = params.withdrawStartYears > 0 && params.withdrawStartYears <= years ? params.withdrawStartYears : 1
    return {
      points,
      depletedYear: out.depletedYear,
      finalBalance: out.finalBalance,
      finalReal: out.finalReal,
      firstWithdraw: out.firstWithdraw,
      earlyReturns: points
        .filter((p) => p.year >= from && p.year < from + 5)
        .map((p) => ({ year: p.year, histYear: p.histYear, stockReturn: p.stockReturn })),
    }
  }

  return {
    simulations: S,
    years,
    strategy,
    fan,
    successRate: ((S - failedYears.length) / S) * 100,
    failureCount: failedYears.length,
    depletionMedianYear: median(failedYears),
    successReal:
      successSorted.length > 0
        ? {
            p10: quantile(successSorted, 0.1),
            p50: quantile(successSorted, 0.5),
            p90: quantile(successSorted, 0.9),
          }
        : null,
    successNominalMedian: median(successNominals),
    medianFirstWithdraw: quantile(firstSorted, 0.5),
    compare: {
      strategy: compareStrategy,
      successRate: ((S - compareFailures) / S) * 100,
      medianFinalReal: quantile(compareSorted, 0.5),
    },
    best: extreme(bestIdx),
    worst: extreme(worstIdx),
    inflationShift: ctx.inflationShift * 100,
    seed,
  }
}
