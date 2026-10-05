import type { jsPDF } from 'jspdf'
import {
  fmtCurrency,
  type BucketParams,
  type SimulationParams,
  type SimulationResult,
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

const COLOR = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  primary: [37, 99, 235] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  soft: [241, 245, 249] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const signedCurrency = (n: number) =>
  `${n < 0 ? '-' : n > 0 ? '+' : ''}${fmtCurrency(Math.abs(n))}`

export async function generateRetirementReport({
  params,
  buckets,
  result,
}: {
  params: SimulationParams
  buckets: BucketParams
  result: SimulationResult
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
  const useBuckets = buckets.strategy === 'buckets'

  // Header band
  doc.setFillColor(...COLOR.ink)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text('VOO 退休模擬器 年度詳細變化報告', margin, 12)
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `策略模式:${useBuckets ? '三桶水防禦模式' : '100% VOO 模式'}`,
    margin,
    18,
  )
  doc.text(`生成時間:${stamp}`, pageW - margin, 18, { align: 'right' })

  // Parameter summary
  const withdrawLabel =
    params.withdrawStartYears > 0 ? `第 ${params.withdrawStartYears} 年` : '不提領'
  const bearLabel =
    buckets.bearInterval > 0 && buckets.bearDrop > 0
      ? `每 ${buckets.bearInterval} 年 / -${buckets.bearDrop}%`
      : '不模擬'
  const paramRows: [string, string, string, string, string, string][] = [
    [
      '起始本金', fmtCurrency(params.initial),
      '每月供款', fmtCurrency(params.monthly),
      '供款停止', `${params.stopYears} 年`,
    ],
    [
      '提領起始', withdrawLabel,
      '每年提領比例', `${params.withdrawPercent}%`,
      '總滾存年數', `${params.totalYears} 年`,
    ],
    [
      'VOO 年化回報', `${params.rate}%`,
      '年通脹率', `${params.inflation}%`,
      '起始年齡', `${params.startAge} 歲`,
    ],
    useBuckets
      ? [
          '現金桶', `${buckets.cashYears} 年 @ ${buckets.cashRate}%`,
          '債券桶', `${buckets.bondYears} 年 @ ${buckets.bondRate}%`,
          '熊市設定', bearLabel,
        ]
      : ['熊市設定', bearLabel, '', '', '', ''],
  ]

  doc.setTextColor(...COLOR.ink)
  doc.setFontSize(11)
  doc.text('初始參數摘要', margin, 30)

  autoTable(doc, {
    startY: 33,
    margin: { left: margin, right: margin },
    body: paramRows,
    theme: 'grid',
    styles: {
      font: FONT_NAME,
      fontSize: 8.5,
      cellPadding: 1.8,
      lineColor: COLOR.border,
      lineWidth: 0.2,
      textColor: COLOR.ink,
    },
    columnStyles: {
      0: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
      2: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
      4: { fillColor: COLOR.soft, textColor: COLOR.muted, cellWidth: 30 },
    },
  })

  // Summary cards
  let y = lastY(doc) + 8
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.ink)
  doc.text('第一部分:總結', margin, y)
  y += 3

  const cards: { label: string; value: string; accent?: boolean }[] = [
    { label: '預期最終總資產 (名目值)', value: fmtCurrency(result.finalBalance), accent: true },
    { label: '實質終端購買力 (折現至第 1 年)', value: fmtCurrency(result.finalRealBalance), accent: true },
    { label: '累積提領總額', value: fmtCurrency(result.totalWithdrawn) },
    { label: '一次性支出總計', value: fmtCurrency(result.totalExpenses) },
  ]
  const gap = 4
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length
  const cardH = 20
  cards.forEach((card, i) => {
    const x = margin + i * (cardW + gap)
    doc.setDrawColor(...(card.accent ? COLOR.primary : COLOR.border))
    doc.setLineWidth(card.accent ? 0.5 : 0.25)
    doc.setFillColor(card.accent ? 239 : 248, card.accent ? 246 : 250, card.accent ? 255 : 252)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.muted)
    doc.text(card.label, x + 4, y + 7)
    doc.setFontSize(14)
    doc.setTextColor(...(card.accent ? COLOR.primary : COLOR.ink))
    doc.text(card.value, x + 4, y + 15.5)
  })
  y += cardH + 4

  doc.setFontSize(8)
  doc.setTextColor(...COLOR.muted)
  const notes = [
    `注資期總投入本金:${fmtCurrency(result.totalInvested)}`,
    result.firstYearWithdraw > 0
      ? `首年提領:${fmtCurrency(result.firstYearWithdraw)} / 年 (之後每年按 ${params.inflation}% 通脹遞增)`
      : '',
    result.depletedYear !== null ? `注意:資產於第 ${result.depletedYear} 年耗盡` : '',
  ].filter(Boolean)
  doc.text(notes.join('    '), margin, y + 2)

  // Detailed annual table
  doc.addPage()
  doc.setFontSize(11)
  doc.setTextColor(...COLOR.ink)
  doc.text('第二部分:年度詳細表格', margin, 14)

  const head = [
    '年份',
    '年齡',
    '年初總資產',
    '當年供款',
    '退休提領',
    '一次性支出',
    '熊市?',
    'VOO 回報',
    '名目投資收益',
    '年底總資產 (名目)',
    '年底實質購買力',
    ...(useBuckets ? ['第 1 桶 現金', '第 2 桶 債券', '第 3 桶 股票'] : []),
  ]

  const body = result.points
    .filter((p) => p.year > 0)
    .map((p) => {
      const expenseText =
        p.expenseItems.length > 0
          ? p.expenseItems.map((e) => `${e.name} ${fmtCurrency(e.amount)}`).join('\n')
          : '-'
      return [
        String(p.year),
        String(params.startAge + p.year - 1),
        fmtCurrency(p.startBalance),
        p.yearContribution > 0 ? fmtCurrency(p.yearContribution) : '-',
        p.yearWithdrawal > 0 ? fmtCurrency(p.yearWithdrawal) : '-',
        expenseText,
        p.isBear ? 'Yes' : 'No',
        `${p.stockReturn > 0 ? '+' : ''}${p.stockReturn}%`,
        signedCurrency(p.gain),
        fmtCurrency(p.balance),
        fmtCurrency(p.realBalance),
        ...(useBuckets
          ? [fmtCurrency(p.cash), fmtCurrency(p.bond), fmtCurrency(p.stock)]
          : []),
      ]
    })

  const rightAligned = new Set([2, 3, 4, 8, 9, 10, 11, 12, 13])

  autoTable(doc, {
    startY: 18,
    margin: { left: margin, right: margin, top: 14, bottom: 14 },
    head: [head],
    body: body.length > 0 ? body : [[{ content: '總滾存時間為 0 年,無年度資料。', colSpan: head.length }]],
    showHead: 'everyPage',
    theme: 'striped',
    styles: {
      font: FONT_NAME,
      fontSize: useBuckets ? 6.4 : 7.2,
      cellPadding: 1.3,
      textColor: COLOR.ink,
      lineColor: COLOR.border,
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLOR.ink,
      textColor: [255, 255, 255],
      halign: 'center',
      fontStyle: 'normal',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const col = data.column.index
      if (rightAligned.has(col)) data.cell.styles.halign = 'right'
      const raw = String(data.cell.raw ?? '')
      if ((col === 6 && raw === 'Yes') || ((col === 7 || col === 8) && raw.startsWith('-'))) {
        data.cell.styles.textColor = COLOR.red
      } else if (col === 8 && raw.startsWith('+')) {
        data.cell.styles.textColor = COLOR.green
      } else if (col === 10) {
        data.cell.styles.textColor = COLOR.primary
      }
    },
  })

  // Footer page numbers
  const pageCount = doc.getNumberOfPages()
  const pageH = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...COLOR.muted)
    doc.text(
      '本報告為假設性模擬結果,不構成投資建議。實質購買力 = 名目資產 ÷ (1 + 年通脹率)^年份。',
      margin,
      pageH - 6,
    )
    doc.text(`第 ${i} / ${pageCount} 頁`, pageW - margin, pageH - 6, { align: 'right' })
  }

  const fileDate = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  doc.save(`VOO_Retirement_Report_${fileDate}.pdf`)
}

function lastY(doc: jsPDF) {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
}
