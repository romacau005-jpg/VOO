export type Strategy = 'voo' | 'buckets'

export type OneTimeExpense = {
  id: string
  name: string
  /** 發生年份 (第幾年) */
  year: number
  amount: number
}

export type SimulationParams = {
  /** 現時 VOO 總資產 (起步本金) */
  initial: number
  /** 每月額外投入 */
  monthly: number
  /** 每月投入停止時間 (年) */
  stopYears: number
  /** 開始提領時間 (第幾年) */
  withdrawStartYears: number
  /** 每年提領比例 (%) */
  withdrawPercent: number
  /** 預計年化回報率 (%) — 股票桶 / VOO */
  rate: number
  /** 預計年通脹率 (%) */
  inflation: number
  /** 總滾存時間 (年) */
  totalYears: number
}

export type BucketParams = {
  strategy: Strategy
  /** 現金桶預留年數 */
  cashYears: number
  /** 現金桶年化回報 (%) */
  cashRate: number
  /** 債券桶預留年數 */
  bondYears: number
  /** 債券桶年化回報 (%) */
  bondRate: number
  /** 熊市週期 (每 N 年一次, 0 = 不模擬) */
  bearInterval: number
  /** 熊市年度跌幅 (%) */
  bearDrop: number
}

export type YearPoint = {
  year: number
  balance: number
  cash: number
  bond: number
  stock: number
  invested: number
  withdrawn: number
  /** 當年扣除的一次性支出總額 */
  expense: number
  expenseItems: { name: string; amount: number }[]
  isBear: boolean
}

export type SimulationResult = {
  points: YearPoint[]
  totalInvested: number
  totalWithdrawn: number
  totalExpenses: number
  finalBalance: number
  firstYearWithdraw: number
  depletedYear: number | null
}

const monthlyRateOf = (annualPercent: number) =>
  Math.pow(1 + annualPercent / 100, 1 / 12) - 1

/** 依序從各來源扣除金額,回傳實際扣到的總額 */
function drain(
  amount: number,
  buckets: { cash: number; bond: number; stock: number },
  order: ('cash' | 'bond' | 'stock')[],
) {
  let remaining = amount
  for (const key of order) {
    if (remaining <= 0) break
    const take = Math.min(buckets[key], remaining)
    buckets[key] -= take
    remaining -= take
  }
  return amount - remaining
}

export function runSimulation(
  params: SimulationParams,
  bucketParams: BucketParams,
  expenses: OneTimeExpense[],
): SimulationResult {
  const {
    initial,
    monthly,
    stopYears,
    withdrawStartYears,
    withdrawPercent,
    rate,
    inflation,
    totalYears,
  } = params
  const { strategy, cashYears, cashRate, bondYears, bondRate, bearInterval, bearDrop } =
    bucketParams

  const useBuckets = strategy === 'buckets'
  const stockMonthly = monthlyRateOf(rate)
  const bearMonthly = monthlyRateOf(-Math.min(bearDrop, 99))
  const cashMonthly = monthlyRateOf(cashRate)
  const bondMonthly = monthlyRateOf(bondRate)

  // 累積期全數放於股票桶;進入提領期才建立現金/債券桶
  const b = { cash: 0, bond: 0, stock: initial }
  let invested = initial
  let withdrawn = 0
  let totalExpenses = 0
  let annualWithdraw = 0
  let firstYearWithdraw = 0
  let depletedYear: number | null = null

  const total = () => b.cash + b.bond + b.stock

  const points: YearPoint[] = [
    {
      year: 0,
      balance: initial,
      cash: 0,
      bond: 0,
      stock: initial,
      invested,
      withdrawn: 0,
      expense: 0,
      expenseItems: [],
      isBear: false,
    },
  ]

  for (let yr = 1; yr <= totalYears; yr++) {
    const isBear = bearInterval > 0 && bearDrop > 0 && yr % bearInterval === 0
    const inWithdrawal = withdrawStartYears > 0 && yr >= withdrawStartYears

    // 1. 年初先扣除一次性大額支出 (三桶水:股票 → 債券 → 現金)
    const yearExpenses = expenses.filter((e) => e.year === yr && e.amount > 0)
    let expenseTaken = 0
    for (const e of yearExpenses) {
      expenseTaken += drain(e.amount, b, ['stock', 'bond', 'cash'])
    }
    totalExpenses += expenseTaken

    // 2. 決定當年提領金額 (通脹調整提領法)
    if (inWithdrawal) {
      if (yr === withdrawStartYears) {
        annualWithdraw = total() * (withdrawPercent / 100)
        firstYearWithdraw = annualWithdraw
        // 建立現金桶與債券桶
        if (useBuckets) {
          const cashTarget = annualWithdraw * cashYears
          const bondTarget = annualWithdraw * bondYears
          b.cash += drain(Math.max(0, cashTarget - b.cash), b, ['stock'])
          b.bond += drain(Math.max(0, bondTarget - b.bond), b, ['stock'])
        }
      } else {
        annualWithdraw *= 1 + inflation / 100
      }
    }
    const monthlyWithdraw = annualWithdraw / 12

    // 3. 逐月:回報 → 注資 → 提領
    for (let m = 1; m <= 12; m++) {
      const totalMonth = (yr - 1) * 12 + m

      b.stock *= 1 + (isBear ? bearMonthly : stockMonthly)
      b.bond *= 1 + bondMonthly
      b.cash *= 1 + cashMonthly

      if (totalMonth <= stopYears * 12) {
        b.stock += monthly
        invested += monthly
      }

      if (inWithdrawal && monthlyWithdraw > 0) {
        // 三桶水:先用現金,再用債券,最後才動股票 (熊市時鎖定股票直至前兩桶耗盡)
        const order: ('cash' | 'bond' | 'stock')[] = useBuckets
          ? ['cash', 'bond', 'stock']
          : ['stock', 'bond', 'cash']
        withdrawn += drain(monthlyWithdraw, b, order)
      }
    }

    // 4. 年底再平衡:牛市時由股票桶補充債券與現金至目標水位;熊市則鎖定股票
    if (useBuckets && inWithdrawal && !isBear) {
      const nextWithdraw = annualWithdraw * (1 + inflation / 100)
      const bondTarget = nextWithdraw * bondYears
      const cashTarget = nextWithdraw * cashYears
      b.bond += drain(Math.max(0, bondTarget - b.bond), b, ['stock'])
      b.cash += drain(Math.max(0, cashTarget - b.cash), b, ['stock'])
    }

    const balance = total()
    if (balance <= 0.5 && depletedYear === null && totalYears > 0) {
      depletedYear = yr
    }

    points.push({
      year: yr,
      balance,
      cash: b.cash,
      bond: b.bond,
      stock: b.stock,
      invested,
      withdrawn,
      expense: expenseTaken,
      expenseItems: yearExpenses.map((e) => ({ name: e.name || '未命名支出', amount: e.amount })),
      isBear,
    })
  }

  return {
    points,
    totalInvested: invested,
    totalWithdrawn: withdrawn,
    totalExpenses,
    finalBalance: total(),
    firstYearWithdraw,
    depletedYear,
  }
}

export const fmtCurrency = (num: number) =>
  '$' + Math.round(num).toLocaleString('en-US')

export const fmtCompact = (num: number) => {
  if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M'
  if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(num)
}
