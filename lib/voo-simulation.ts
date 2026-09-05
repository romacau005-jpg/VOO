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
  /** 預計年化回報率 (%) */
  rate: number
  /** 預計年通脹率 (%) */
  inflation: number
  /** 總滾存時間 (年) */
  totalYears: number
}

export type YearPoint = {
  year: number
  balance: number
  /** 累計投入本金 (起步 + 每月投入) */
  invested: number
  /** 累計提領金額 */
  withdrawn: number
}

export type SimulationResult = {
  points: YearPoint[]
  totalInvested: number
  totalWithdrawn: number
  finalBalance: number
  /** 資產跌至 0 的年份, 若一直維持則為 null */
  depletedYear: number | null
}

/**
 * 逐月模擬:每月先計回報,再按階段注資,提領期則按比例提取。
 * 與原始模型一致,但額外追蹤累計投入與提領金額。
 */
export function runSimulation(params: SimulationParams): SimulationResult {
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

  const monthlyReturn = rate / 100 / 12

  let balance = initial
  let invested = initial
  let withdrawn = 0
  let depletedYear: number | null = null

  // 通脹調整提領法:首年金額固定,之後每年按通脹遞增
  let annualWithdraw = 0

  const points: YearPoint[] = [
    { year: 0, balance: initial, invested, withdrawn: 0 },
  ]

  for (let yr = 1; yr <= totalYears; yr++) {
    // 在提領階段每年年初決定當年提領金額
    if (withdrawStartYears > 0 && yr >= withdrawStartYears) {
      if (yr === withdrawStartYears) {
        // 第 1 年:開始提領當年年初總資產 × 提領比例
        annualWithdraw = balance * (withdrawPercent / 100)
      } else {
        // 第 2 年及以後:上一年金額 × (1 + 通脹率)
        annualWithdraw = annualWithdraw * (1 + inflation / 100)
      }
    }
    const monthlyWithdraw = annualWithdraw / 12

    for (let m = 1; m <= 12; m++) {
      const totalMonth = (yr - 1) * 12 + m

      // 每月回報 + 注資階段
      balance = balance * (1 + monthlyReturn)
      if (totalMonth <= stopYears * 12) {
        balance += monthly
        invested += monthly
      }

      // 提領階段:每年金額均勻分攤至 12 個月
      if (withdrawStartYears > 0 && yr >= withdrawStartYears) {
        const take = Math.min(balance, monthlyWithdraw)
        balance = Math.max(0, balance - take)
        withdrawn += take
      }
    }

    if (balance <= 0 && depletedYear === null) {
      depletedYear = yr
    }

    points.push({ year: yr, balance, invested, withdrawn })
  }

  return {
    points,
    totalInvested: invested,
    totalWithdrawn: withdrawn,
    finalBalance: balance,
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
