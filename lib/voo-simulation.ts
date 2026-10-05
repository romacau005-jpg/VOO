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
  /** 預計長期平均年通脹率 (%) — 用於平移歷史通脹序列的平均值 */
  inflation: number
  /** 總滾存時間 (年) */
  totalYears: number
  /** 起始年齡 (僅用於報告顯示) */
  startAge: number
}

export type BucketParams = {
  strategy: Strategy
  /** 現金桶預留年數 */
  cashYears: number
  /** 債券桶預留年數 */
  bondYears: number
}

export type YearPoint = {
  year: number
  /** 該年抽樣所用的歷史年份 */
  histYear: number
  startBalance: number
  yearContribution: number
  yearWithdrawal: number
  expense: number
  expenseItems: { name: string; amount: number }[]
  /** 股票桶當年回報低於 -5% */
  isBear: boolean
  /** 股票 (S&P 500) 當年回報 % */
  stockReturn: number
  /** 債券當年回報 % */
  bondReturn: number
  /** 當年通脹 % (已平移) */
  inflation: number
  gain: number
  balance: number
  /** 以累積實際通脹折現回第 0 年購買力 */
  realBalance: number
  cash: number
  bond: number
  stock: number
}

export const fmtCurrency = (num: number) =>
  '$' + Math.round(num).toLocaleString('en-US')

export const fmtCompact = (num: number) => {
  if (Math.abs(num) >= 1e9) return '$' + (num / 1e9).toFixed(1) + 'B'
  if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M'
  if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(num)
}

export const fmtPct = (num: number, digits = 1) =>
  `${num > 0 ? '+' : ''}${num.toFixed(digits)}%`
