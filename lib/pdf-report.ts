import type { jsPDF } from 'jspdf'
import { HIST_FIRST_YEAR, HIST_LAST_YEAR } from '@/lib/historical-returns'
import { BEAR_THRESHOLD, type ExtremePath, type MonteCarloResult } from '@/lib/monte-carlo'
import {
  fmtCurrency,
  fmtPct,
  type BucketParams,
  type SimulationParams,
} from '@/lib/voo-simulation'

const FONT_URL = '/fonts/NotoSansTC-Regular.ttf'
const FONT_NAME = 'NotoSansTC'

let fontBase64Promise: Promise<string> | null = null

function loadFontBase64() {
  fontBase64Promise ??= fetch(FONT_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Font load failed: ${res.status}`)
      return res.arrayBuffer()
    })
    .then((buf) => {
      const bytes = new Uint8Array(buf)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    })
    .catch((err) => {
      fontBase64Promise = null
      throw err
    })
  return fontBase64Promise
}

type RGB = [number, number, number]
const COLOR = {
  ink: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  primary: [37, 99, 235] as RGB,
  border: [226, 232, 240] as RGB,
  soft: [241, 245, 249] as RGB,
  red: [220, 38, 38] as RGB,
  green: [22, 163, 74] as RGB,
  amber: [217, 119, 6] as RGB,
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const signedCurrency = (n: number) =>
  `${n < 0 ? '-' : n > 0 ? '+' : ''}${fmtCurrency(Math.abs(n))}`

const tableStyles = {
  font: FONT_NAME,
  textColor: COLOR.ink,
  lineColor: COLOR.border,
  lineWidth: 0.1,
  valign: 'middle' as const,
}

export async function generateRetirementReport({
  params,
  buckets,
  result,
  includeExtremes,
}: {
  params: SimulationParams
  buckets: BucketParams
  result: MonteCarloResult
  includeExtremes: boolean
}) {
  const [{ jsPDF }, { autoTable }, fontBase64] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadFontBase64(),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('NotoSansTC-Regular.ttf', fontBase64)
  doc.addFont('NotoSansTC-Regular.ttf', FONT_NAME, 'normal')
  doc.addFont('NotoSansTC-Regular.ttf', FONT_NAME, 'bold')
  doc.setFont(FONT_NAME, 'normal')

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 10
  const contentW = pageW - margin * 2
  const now = new Date()
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const useBuckets = result.strategy === 'buckets'

  // Header band
  doc.setFillColor(...COLOR.ink)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text('VOO 退休模擬器 蒙地卡羅風險報告', margin, 12)
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `策略模式:${useBuckets ? '三桶水防禦模式' : '100% VOO 模式'}  ·  ${result.simulations.toLocaleString()} 次模擬  ·  ${result.years} 年`,
    margin,
    18,
  )
  doc.text(`生成時間:${stamp}`, pageW - margin, 18, { align: 'right' })

  // Parameters
  const withdrawLabel =
    params.withdrawStartYears > 0 ? `第 ${params.withdrawStartYears} 年` : '不提領'
  const paramRows = [
    ['起始本金', fmtCurrency(params.initial), '每月供款', fmtCurrency(params.monthly), '供款停止', `${params.stopYears} 年`],
    ['提領起始', withdrawLabel, '每年提領比例', `${params.withdrawPercent}%`, '總滾存年數', `${params.totalYears} 年`],
    [
      '平均通脹假設', `${params.inflation}%`,
      '起始年齡', `${params.startAge} 歲`,
      '三桶水配置', useBuckets ? `現金 ${buckets.cashYears} 年 / 債券 ${buckets.bondYears} 年` : '不適用',
    ],
  ]
  doc.setTextColor(...COLOR.ink)
  doc.setFontSize(11)
  doc.text('初始參數摘要', margin, 30)
  autoTable(doc, {
    startY: 33,
    margin: { left: margin, right: margin },
    body: paramRows,
    theme: 'grid',
    styles: { ...tableStyles, fontSize: 8.5, cellPadding: 1.8, lineWidth: 0.2 },
    columnStyles: {
      0: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
      2: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
      4: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
    },
  })

  // Risk metric cards
  let y = lastY(doc) + 8
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.ink)
  doc.text('第一部分:核心風險指標', margin, y)
  y += 3

  const rate = result.successRate
  const rateColor = rate >= 90 ? COLOR.green : rate >= 75 ? COLOR.amber : COLOR.red
  const cards: { label: string; value: string; note: string; color?: RGB; accent?: boolean }[] = [
    {
      label: '策略成功率',
      value: `${rate.toFixed(1)}%`,
      note: `${(result.simulations - result.failureCount).toLocaleString()} / ${result.simulations.toLocaleString()} 次活過 ${result.years} 年`,
      color: rateColor,
      accent: true,
    },
    {
      label: '資產耗盡中位數年份',
      value: result.depletionMedianYear !== null ? `第 ${Math.round(result.depletionMedianYear)} 年` : '無失敗',
      note: result.failureCount > 0 ? `失敗情境共 ${result.failureCount.toLocaleString()} 次` : '所有路徑均未耗盡',
    },
    {
      label: '成功情境 · 終端實質購買力 (中位數)',
      value: result.successReal ? fmtCurrency(result.successReal.p50) : '-',
      note: result.successReal
        ? `10%–90%:${fmtCurrency(result.successReal.p10)} – ${fmtCurrency(result.successReal.p90)}`
        : '無成功路徑',
      accent: true,
    },
    {
      label: `對比 ${result.compare.strategy === 'buckets' ? '三桶水' : '100% VOO'} 成功率`,
      value: `${result.compare.successRate.toFixed(1)}%`,
      note: `終端實質購買力中位數 ${fmtCurrency(result.compare.medianFinalReal)}`,
    },
  ]
  const gap = 4
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length
  const cardH = 25
  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap)
    doc.setDrawColor(...(card.accent ? COLOR.primary : COLOR.border))
    doc.setLineWidth(card.accent ? 0.5 : 0.25)
    doc.setFillColor(card.accent ? 239 : 248, card.accent ? 246 : 250, card.accent ? 255 : 252)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.muted)
    doc.text(card.label, x + 4, y + 6.5)
    doc.setFontSize(15)
    doc.setTextColor(...(card.color ?? (card.accent ? COLOR.primary : COLOR.ink)))
    doc.text(card.value, x + 4, y + 15)
    doc.setFontSize(7)
    doc.setTextColor(...COLOR.muted)
    doc.text(card.note, x + 4, y + 21, { maxWidth: cardW - 8 })
  })
  y += cardH + 8

  // Percentile milestones
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.ink)
  doc.text('第二部分:資產分位數路徑 (扇形圖數據)', margin, y)

  const milestones = result.fan.filter(
    (f) => f.year > 0 && (f.year % 5 === 0 || f.year === result.years),
  )
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        { content: '年份', rowSpan: 2 },
        { content: '年齡', rowSpan: 2 },
        { content: '名目資產', colSpan: 3 },
        { content: '實質購買力 (折現至第 0 年)', colSpan: 3 },
      ],
      ['後 10% (最倒霉)', '中位數', '前 10% (最幸運)', '後 10%', '中位數', '前 10%'],
    ],
    body:
      milestones.length > 0
        ? milestones.map((f) => [
            String(f.year),
            String(params.startAge + f.year),
            fmtCurrency(f.p10),
            fmtCurrency(f.p50),
            fmtCurrency(f.p90),
            fmtCurrency(f.real10),
            fmtCurrency(f.real50),
            fmtCurrency(f.real90),
          ])
        : [[{ content: '總滾存時間為 0 年,無資料。', colSpan: 8 }]],
    theme: 'striped',
    styles: { ...tableStyles, fontSize: 7.8, cellPadding: 1.3 },
    headStyles: { fillColor: COLOR.ink, textColor: [255, 255, 255], halign: 'center', fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'right', textColor: COLOR.red },
      3: { halign: 'right' },
      4: { halign: 'right', textColor: COLOR.green },
      5: { halign: 'right', textColor: COLOR.red },
      6: { halign: 'right', textColor: COLOR.primary },
      7: { halign: 'right', textColor: COLOR.green },
    },
  })

  y = lastY(doc) + 6
  const methodology = [
    `模擬方法:以 ${HIST_FIRST_YEAR}–${HIST_LAST_YEAR} 年美國 S&P 500 (含股息)、10 年期美國國債、3 個月國庫券及 CPI 通脹的真實年度數據,`,
    `以平穩區塊自助抽樣 (平均區塊 5 年,保留連續熊市特性) 隨機組合出 ${result.simulations.toLocaleString()} 條 ${result.years} 年市場序列。同一年的股、債、通脹整行取用,保留其相關性。`,
    `通脹序列平移 ${fmtPct(result.inflationShift, 2)} 使長期平均等於假設值 ${params.inflation}%。熊市定義:股票當年回報低於 ${BEAR_THRESHOLD}%,此時鎖定股票桶,優先消耗現金與債券桶。`,
    '成功定義:整個滾存期內每年提領與一次性支出均能足額支付,資產從未歸零。',
  ]
  doc.setFontSize(7.5)
  doc.setTextColor(...COLOR.muted)
  const pageH = doc.internal.pageSize.getHeight()
  if (y + methodology.length * 4 > pageH - 14) {
    doc.addPage()
    y = 16
  }
  methodology.forEach((line, i) => doc.text(line, margin, y + i * 4))

  if (includeExtremes) {
    addExtremeTable(doc, autoTable, {
      title: '極端風險演示 A:最幸運的組合 (終端實質購買力最高)',
      path: result.best,
      params,
      useBuckets,
      margin,
    })
    addExtremeTable(doc, autoTable, {
      title: '極端風險演示 B:最倒霉的組合 (最早耗盡 / 終端資產最低)',
      path: result.worst,
      params,
      useBuckets,
      margin,
    })
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR.muted)
    doc.text('本報告為基於歷史數據的假設性模擬,過往表現不代表未來回報,不構成投資建議。', margin, pageH - 6)
    doc.text(`第 ${i} / ${pageCount} 頁`, pageW - margin, pageH - 6, { align: 'right' })
  }

  const fileDate = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  doc.save(`VOO_MonteCarlo_Report_${fileDate}.pdf`)
}

type AutoTableFn = (typeof import('jspdf-autotable'))['autoTable']

function addExtremeTable(
  doc: jsPDF,
  autoTable: AutoTableFn,
  {
    title,
    path,
    params,
    useBuckets,
    margin,
  }: { title: string; path: ExtremePath; params: SimulationParams; useBuckets: boolean; margin: number },
) {
  doc.addPage()
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.ink)
  doc.text(title, margin, 14)
  doc.setFontSize(8)
  doc.setTextColor(...COLOR.muted)
  const outcome = path.depletedYear ? `資產於第 ${path.depletedYear} 年耗盡` : '全程未耗盡'
  const early = path.earlyReturns.map((r) => `${r.histYear} ${fmtPct(r.stockReturn, 0)}`).join('、')
  doc.text(
    `結果:${outcome}  ·  終端名目資產 ${fmtCurrency(path.finalBalance)}  ·  終端實質購買力 ${fmtCurrency(path.finalReal)}${early ? `  ·  前 5 年股市:${early}` : ''}`,
    margin,
    19,
  )

  const head = [
    '年份', '年齡', '歷史年份', 'S&P 回報', '通脹', '熊市?',
    '年初總資產', '當年供款', '退休提領', '一次性支出', '投資收益',
    '年底總資產', '實質購買力',
    ...(useBuckets ? ['現金桶', '債券桶', '股票桶'] : []),
  ]
  const body = path.points
    .filter((p) => p.year > 0)
    .map((p) => [
      String(p.year),
      String(params.startAge + p.year),
      String(p.histYear),
      fmtPct(p.stockReturn),
      fmtPct(p.inflation),
      p.isBear ? 'Yes' : 'No',
      fmtCurrency(p.startBalance),
      p.yearContribution > 0 ? fmtCurrency(p.yearContribution) : '-',
      p.yearWithdrawal > 0 ? fmtCurrency(p.yearWithdrawal) : '-',
      p.expenseItems.length > 0 ? p.expenseItems.map((e) => `${e.name} ${fmtCurrency(e.amount)}`).join('\n') : '-',
      signedCurrency(p.gain),
      fmtCurrency(p.balance),
      fmtCurrency(p.realBalance),
      ...(useBuckets ? [fmtCurrency(p.cash), fmtCurrency(p.bond), fmtCurrency(p.stock)] : []),
    ])

  const leftCols = new Set([0, 1, 2, 5, 9])
  autoTable(doc, {
    startY: 23,
    margin: { left: margin, right: margin, top: 14, bottom: 14 },
    head: [head],
    body: body.length > 0 ? body : [[{ content: '無年度資料。', colSpan: head.length }]],
    showHead: 'everyPage',
    theme: 'striped',
    styles: { ...tableStyles, fontSize: useBuckets ? 6.2 : 7, cellPadding: 1.2 },
    headStyles: { fillColor: COLOR.ink, textColor: [255, 255, 255], halign: 'center', fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const col = data.column.index
      data.cell.styles.halign = leftCols.has(col) ? (col === 9 ? 'left' : 'center') : 'right'
      const raw = String(data.cell.raw ?? '')
      if ((col === 5 && raw === 'Yes') || ((col === 3 || col === 10) && raw.startsWith('-'))) {
        data.cell.styles.textColor = COLOR.red
      } else if ((col === 3 || col === 10) && raw.startsWith('+')) {
        data.cell.styles.textColor = COLOR.green
      } else if (col === 12) {
        data.cell.styles.textColor = COLOR.primary
      }
    },
  })
}

function lastY(doc: jsPDF) {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
}
