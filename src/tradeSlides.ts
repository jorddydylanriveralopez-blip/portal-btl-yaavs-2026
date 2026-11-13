import {
  formatMoneyMx,
  monthLabel,
  parseMoney,
  parseSatisfactionScore,
  summarizeMonth,
  tradeImageUrl,
  type TradeEntry,
} from './tradeMarketing'

type Img = { dataUrl: string; width: number; height: number }
type RGB = { r: number; g: number; b: number }

function fmtFecha(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

function wrap(doc: import('jspdf').jsPDF, text: string, maxW: number): string[] {
  const t = (text || '').trim() || '—'
  return doc.splitTextToSize(t, maxW) as string[]
}

async function loadTradeImg(rel: string): Promise<Img | null> {
  const url = tradeImageUrl(rel)
  if (!url) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('img'))
        el.src = objectUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)
      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.88),
        width: canvas.width,
        height: canvas.height,
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

async function loadLogo(): Promise<Img | null> {
  try {
    const href = `${import.meta.env.BASE_URL}logo-yaavs-blanco.png`
    const res = await fetch(href, { cache: 'force-cache' })
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('logo'))
        el.src = objectUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)
      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

function fitImage(
  img: Img,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const ratio = img.width / Math.max(img.height, 1)
  let w = maxW
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return { w, h }
}

function drawCoverDecor(
  doc: import('jspdf').jsPDF,
  W: number,
  H: number,
  cyan: RGB,
  gold: RGB,
) {
  doc.setFillColor(cyan.r, cyan.g, cyan.b)
  doc.circle(W + 40, -20, 180, 'F')
  doc.setFillColor(0, 70, 100)
  doc.circle(-60, H + 40, 160, 'F')
  doc.setFillColor(gold.r, gold.g, gold.b)
  doc.roundedRect(48, H - 56, 120, 4, 2, 2, 'F')
}

function drawSoftBg(doc: import('jspdf').jsPDF, W: number, H: number) {
  doc.setFillColor(243, 247, 250)
  doc.rect(0, 0, W, H, 'F')
  doc.setFillColor(234, 243, 248)
  doc.rect(0, 0, W, 88, 'F')
}

function drawTopBar(
  doc: import('jspdf').jsPDF,
  W: number,
  navy: RGB,
  cyan: RGB,
  title: string,
  subtitle?: string,
) {
  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.rect(0, 0, W, 72, 'F')
  doc.setFillColor(cyan.r, cyan.g, cyan.b)
  doc.rect(0, 72, W, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(title, 40, 38)
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(180, 220, 235)
    doc.text(subtitle, 40, 58)
  }
}

function drawFooter(
  doc: import('jspdf').jsPDF,
  W: number,
  H: number,
  page: number,
  total: number,
  muted: RGB,
  navy: RGB,
) {
  doc.setDrawColor(210, 222, 232)
  doc.setLineWidth(0.6)
  doc.line(40, H - 34, W - 40, H - 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(muted.r, muted.g, muted.b)
  doc.text('YAAVS · Portal BTL 2026 · Trade Marketing', 40, H - 18)
  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.roundedRect(W - 78, H - 30, 38, 16, 8, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(`${page}/${total}`, W - 59, H - 19, { align: 'center' })
}

function drawKpiCard(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  accent: RGB,
  ink: RGB,
  muted: RGB,
) {
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(220, 232, 240)
  doc.roundedRect(x, y, w, h, 14, 14, 'FD')
  doc.setFillColor(accent.r, accent.g, accent.b)
  doc.roundedRect(x, y, 6, h, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(muted.r, muted.g, muted.b)
  doc.text(label.toUpperCase(), x + 22, y + 28)
  doc.setFontSize(22)
  doc.setTextColor(ink.r, ink.g, ink.b)
  const lines = wrap(doc, value, w - 36)
  doc.text(lines.slice(0, 2), x + 22, y + 58)
}

function drawPanelFrame(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  navy: RGB,
  cyan: RGB,
  filledHeader: boolean,
) {
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(210, 222, 232)
  doc.setLineWidth(1)
  doc.roundedRect(x, y, w, h, 12, 12, 'FD')
  if (filledHeader) {
    doc.setFillColor(navy.r, navy.g, navy.b)
    doc.roundedRect(x, y, w, 34, 12, 12, 'F')
    doc.rect(x, y + 18, w, 16, 'F')
    doc.setTextColor(255, 255, 255)
  } else {
    doc.setFillColor(236, 245, 250)
    doc.roundedRect(x, y, w, 34, 12, 12, 'F')
    doc.rect(x, y + 18, w, 16, 'F')
    doc.setFillColor(cyan.r, cyan.g, cyan.b)
    doc.rect(x, y, 5, 34, 'F')
    doc.setTextColor(navy.r, navy.g, navy.b)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(title, x + 14, y + 22)
}

function monthInProgress(monthKey: string): boolean {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return monthKey === cur
}

function triggerDownload(filename: string, dataUrl: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Vista previa PNG (16:9) — útil aunque el mes aún no cierre. */
export async function downloadTradeMonthPreviewImage(
  entries: TradeEntry[],
  monthKey: string,
): Promise<void> {
  const summary = summarizeMonth(entries, monthKey)
  if (!summary.entries.length) {
    throw new Error('No hay capturas Trade Marketing en ese mes')
  }

  const W = 1920
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  const navy = '#002b44'
  const cyan = '#00a0c8'
  const gold = '#e8c547'
  const ink = '#071824'
  const muted = '#6b8296'
  const inProgress = monthInProgress(monthKey)
  const label = monthLabel(monthKey)

  // fondo
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, navy)
  grad.addColorStop(1, '#01405f')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(0,160,200,0.12)'
  ctx.beginPath()
  ctx.arc(W - 120, 80, 280, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(232,197,71,0.08)'
  ctx.beginPath()
  ctx.arc(100, H - 40, 220, 0, Math.PI * 2)
  ctx.fill()

  const logo = await loadLogo()
  if (logo) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('logo'))
      el.src = logo.dataUrl
    }).catch(() => null)
    if (img) {
      const { w, h } = fitImage(logo, 280, 90)
      ctx.drawImage(img, 80, 70, w, h)
    }
  }

  ctx.fillStyle = 'rgba(180,220,235,0.95)'
  ctx.font = '700 28px Helvetica, Arial, sans-serif'
  ctx.fillText('TRADE MARKETING  ·  PORTAL BTL 2026', 80, 220)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 72px Helvetica, Arial, sans-serif'
  ctx.fillText(inProgress ? 'Avance del mes' : 'Resultados del mes', 80, 310)
  ctx.fillStyle = cyan
  ctx.font = '600 42px Helvetica, Arial, sans-serif'
  ctx.fillText(label, 80, 375)
  ctx.fillStyle = 'rgba(200,220,235,0.9)'
  ctx.font = '400 28px Helvetica, Arial, sans-serif'
  ctx.fillText(
    inProgress
      ? `${summary.total} captura(s) hasta hoy · vista previa (mes en curso)`
      : `${summary.total} activaciones documentadas`,
    80,
    430,
  )

  const cards = [
    { label: 'Capturas', value: String(summary.total) },
    {
      label: 'Satisfacción',
      value: summary.avgSatisfaccion != null ? summary.avgSatisfaccion.toFixed(1) : '—',
    },
    { label: 'Ventas X-Ray', value: formatMoneyMx(summary.totalXray) },
    { label: 'Ventas encuesta', value: formatMoneyMx(summary.totalEncuesta) },
  ]
  const cardW = 400
  const cardH = 160
  const gap = 28
  const startX = 80
  const startY = 500
  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gap)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    const r = 16
    ctx.beginPath()
    ctx.moveTo(x + r, startY)
    ctx.arcTo(x + cardW, startY, x + cardW, startY + cardH, r)
    ctx.arcTo(x + cardW, startY + cardH, x, startY + cardH, r)
    ctx.arcTo(x, startY + cardH, x, startY, r)
    ctx.arcTo(x, startY, x + cardW, startY, r)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(200,220,235,0.85)'
    ctx.font = '600 22px Helvetica, Arial, sans-serif'
    ctx.fillText(c.label.toUpperCase(), x + 28, startY + 48)
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 48px Helvetica, Arial, sans-serif'
    ctx.fillText(c.value, x + 28, startY + 115)
  })

  ctx.fillStyle = gold
  ctx.font = '700 24px Helvetica, Arial, sans-serif'
  ctx.fillText('YAAVS · Siempre ganas más', 80, H - 60)
  ctx.fillStyle = muted
  ctx.font = '400 20px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(inProgress ? 'Vista previa · mes abierto' : 'Cierre de mes', W - 80, H - 60)
  ctx.textAlign = 'left'
  void ink

  triggerDownload(`trade-marketing-${monthKey}-vista.png`, canvas.toDataURL('image/png'))
}

/** Diapositivas PDF (16:9) del mes — se puede generar aunque el mes aún no cierre. */
export async function downloadTradeMonthSlides(
  entries: TradeEntry[],
  monthKey: string,
): Promise<void> {
  const summary = summarizeMonth(entries, monthKey)
  if (!summary.entries.length) {
    throw new Error('No hay capturas Trade Marketing en ese mes')
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  const navy = { r: 0, g: 43, b: 68 }
  const cyan = { r: 0, g: 160, b: 200 }
  const gold = { r: 232, g: 197, b: 71 }
  const ink = { r: 7, g: 24, b: 36 }
  const muted = { r: 107, g: 130, b: 150 }
  const mint = { r: 16, g: 150, b: 120 }
  const coral = { r: 210, g: 90, b: 70 }

  const logo = await loadLogo()
  const label = monthLabel(monthKey)
  const inProgress = monthInProgress(monthKey)
  const delta = summary.totalXray - summary.totalEncuesta
  const heroTitle = inProgress ? 'Avance del mes' : 'Resultados del mes'
  const heroNote = inProgress
    ? `${summary.total} captura(s) hasta hoy · vista previa (mes en curso)`
    : `${summary.total} activación${summary.total === 1 ? '' : 'es'} · satisfacción, ventas X-Ray y encuesta`

  // ========== 1. PORTADA ==========
  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.rect(0, 0, W, H, 'F')
  drawCoverDecor(doc, W, H, cyan, gold)
  if (logo) {
    const { w, h } = fitImage(logo, 150, 48)
    doc.addImage(logo.dataUrl, 'PNG', 48, 40, w, h)
  }
  doc.setTextColor(180, 220, 235)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TRADE MARKETING  ·  PORTAL BTL 2026', 48, 120)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(42)
  doc.text(heroTitle, 48, 175)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(26)
  doc.setTextColor(cyan.r, cyan.g, cyan.b)
  doc.text(label, 48, 215)
  doc.setFontSize(13)
  doc.setTextColor(200, 220, 235)
  doc.text(heroNote, 48, 255)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(48, 300, 280, 56, 12, 12, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(muted.r, muted.g, muted.b)
  doc.text('VENTAS X-RAY DEL MES', 64, 322)
  doc.setFontSize(18)
  doc.setTextColor(navy.r, navy.g, navy.b)
  doc.text(formatMoneyMx(summary.totalXray), 64, 346)

  // ========== 2. HIGHLIGHTS ==========
  doc.addPage()
  drawSoftBg(doc, W, H)
  drawTopBar(doc, W, navy, cyan, 'Lo más relevante', label)

  const kpis = [
    { label: 'Activaciones', value: String(summary.total), accent: cyan },
    {
      label: 'Satisfacción',
      value: summary.avgSatisfaccion != null ? summary.avgSatisfaccion.toFixed(1) : '—',
      accent: gold,
    },
    { label: 'Ventas X-Ray', value: formatMoneyMx(summary.totalXray), accent: mint },
    { label: 'Ventas encuesta', value: formatMoneyMx(summary.totalEncuesta), accent: coral },
  ]
  const gap = 16
  const cardW = (W - 80 - gap * 3) / 4
  kpis.forEach((k, i) => {
    drawKpiCard(doc, 40 + i * (cardW + gap), 110, cardW, 110, k.label, k.value, k.accent, ink, muted)
  })

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(220, 232, 240)
  doc.roundedRect(40, 250, W - 80, 220, 16, 16, 'FD')
  doc.setFillColor(cyan.r, cyan.g, cyan.b)
  doc.roundedRect(40, 250, 8, 220, 4, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(navy.r, navy.g, navy.b)
  doc.text('Lectura del mes', 64, 280)

  const insights = [
    `${summary.conSatisfaccion} de ${summary.total} capturas traen nota de satisfacción.`,
    `${summary.conAnalisis} de ${summary.total} incluyen análisis de campo.`,
    summary.totalXray || summary.totalEncuesta
      ? `Brecha X-Ray vs encuesta: ${formatMoneyMx(delta)}${delta > 0 ? ' (X-Ray arriba)' : delta < 0 ? ' (encuesta arriba)' : ''}.`
      : 'Aún faltan montos numéricos de ventas para cerrar el comparativo.',
    summary.entries.filter((e) => e.ventasXrayImagen).length
      ? `${summary.entries.filter((e) => e.ventasXrayImagen).length} captura(s) X-Ray con evidencia visual.`
      : 'Sube capturas X-Ray para enriquecer el reporte con evidencia.',
  ]
  let iy = 310
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(ink.r, ink.g, ink.b)
  for (const line of insights) {
    doc.setFillColor(cyan.r, cyan.g, cyan.b)
    doc.circle(72, iy - 3, 3.5, 'F')
    doc.text(wrap(doc, line, W - 140), 88, iy)
    iy += 36
  }

  // ========== 3. VENTAS ==========
  doc.addPage()
  drawSoftBg(doc, W, H)
  drawTopBar(doc, W, navy, cyan, 'Ventas del mes', 'X-Ray vs encuesta')

  const half = (W - 80 - 20) / 2
  // X-Ray card
  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.roundedRect(40, 110, half, 280, 18, 18, 'F')
  doc.setFillColor(cyan.r, cyan.g, cyan.b)
  doc.roundedRect(40, 110, half, 6, 3, 3, 'F')
  doc.setTextColor(180, 220, 235)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('RESULTADO X-RAY', 64, 150)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(32)
  doc.text(formatMoneyMx(summary.totalXray), 64, 200)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(180, 220, 235)
  doc.text('Suma de montos detectados en capturas', 64, 230)

  // Encuesta card
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(220, 232, 240)
  doc.roundedRect(40 + half + 20, 110, half, 280, 18, 18, 'FD')
  doc.setFillColor(gold.r, gold.g, gold.b)
  doc.roundedRect(40 + half + 20, 110, half, 6, 3, 3, 'F')
  doc.setTextColor(muted.r, muted.g, muted.b)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('VENTAS ENCUESTA', 64 + half + 20, 150)
  doc.setTextColor(navy.r, navy.g, navy.b)
  doc.setFontSize(32)
  doc.text(formatMoneyMx(summary.totalEncuesta), 64 + half + 20, 200)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(ink.r, ink.g, ink.b)
  doc.text('Reportadas por Trade Marketing', 64 + half + 20, 230)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(navy.r, navy.g, navy.b)
  const deltaLabel =
    delta === 0
      ? 'Empate entre X-Ray y encuesta'
      : `Diferencia: ${formatMoneyMx(Math.abs(delta))} a favor de ${delta > 0 ? 'X-Ray' : 'encuesta'}`
  doc.text(deltaLabel, 64 + half + 20, 280)

  // ========== 4. ROSTER ==========
  doc.addPage()
  drawSoftBg(doc, W, H)
  drawTopBar(doc, W, navy, cyan, 'Activaciones del mes', `${summary.total} registros · ${label}`)

  const cols = [
    { label: 'Fecha', w: 72 },
    { label: 'Clave', w: 108 },
    { label: 'Ubicación', w: 200 },
    { label: 'Sat.', w: 48 },
    { label: 'X-Ray', w: 120 },
    { label: 'Encuesta', w: 120 },
  ]
  let ty = 108
  const tableX = 40
  const tableW = W - 80

  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.roundedRect(tableX, ty, tableW, 32, 10, 10, 'F')
  let tx = tableX + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  for (const c of cols) {
    doc.text(c.label.toUpperCase(), tx, ty + 20)
    tx += c.w
  }
  ty += 40

  for (let i = 0; i < summary.entries.length; i++) {
    const e = summary.entries[i]
    if (ty > H - 56) {
      doc.addPage()
      drawSoftBg(doc, W, H)
      drawTopBar(doc, W, navy, cyan, 'Activaciones (cont.)', label)
      ty = 108
      doc.setFillColor(navy.r, navy.g, navy.b)
      doc.roundedRect(tableX, ty, tableW, 32, 10, 10, 'F')
      tx = tableX + 14
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      for (const c of cols) {
        doc.text(c.label.toUpperCase(), tx, ty + 20)
        tx += c.w
      }
      ty += 40
    }

    if (i % 2 === 0) {
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(tableX, ty - 12, tableW, 28, 8, 8, 'F')
    }

    const sat = parseSatisfactionScore(e.satisfaccion)
    const row = [
      fmtFecha(e.fecha),
      e.clave || '—',
      e.municipioEstado || '—',
      sat != null ? sat.toFixed(1) : '—',
      e.ventasXray
        ? formatMoneyMx(parseMoney(e.ventasXray) || Number(e.ventasXray) || 0) === '$0'
          ? e.ventasXray
          : formatMoneyMx(parseMoney(e.ventasXray) || Number(e.ventasXray) || 0)
        : '—',
      e.ventasEncuesta
        ? formatMoneyMx(parseMoney(e.ventasEncuesta) || Number(e.ventasEncuesta) || 0) === '$0'
          ? e.ventasEncuesta
          : formatMoneyMx(parseMoney(e.ventasEncuesta) || Number(e.ventasEncuesta) || 0)
        : '—',
    ]
    tx = tableX + 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(ink.r, ink.g, ink.b)
    row.forEach((cell, ci) => {
      const lines = wrap(doc, cell, cols[ci].w - 10)
      doc.text(lines[0] || '—', tx, ty + 6)
      tx += cols[ci].w
    })
    ty += 30
  }

  // ========== 5+. FICHAS POR ACTIVACIÓN ==========
  for (let idx = 0; idx < summary.entries.length; idx++) {
    const e = summary.entries[idx]
    const satImgs = (
      await Promise.all(
        (e.satisfaccionImagenes || []).slice(0, 2).map((rel) => (rel ? loadTradeImg(rel) : null)),
      )
    ).filter(Boolean) as Img[]
    const xrayImg = e.ventasXrayImagen ? await loadTradeImg(e.ventasXrayImagen) : null

    doc.addPage()
    drawSoftBg(doc, W, H)
    drawTopBar(
      doc,
      W,
      navy,
      cyan,
      e.clave || e.municipioEstado || `Activación ${idx + 1}`,
      `${fmtFecha(e.fecha)} · ${e.ejecutivo || 'Sin ejecutivo'} · ${idx + 1}/${summary.entries.length}`,
    )

    const pad = 28
    const gap = 14
    const top = 92
    const halfW = (W - pad * 2 - gap) / 2
    const halfH = (H - top - pad - 28 - gap) / 2

    // SOLICITUD
    drawPanelFrame(doc, pad, top, halfW, halfH, 'SOLICITUD BTL', navy, cyan, true)
    const fields = [
      ['Fecha', fmtFecha(e.fecha)],
      ['Clave', e.clave || '—'],
      ['Ejecutivo/a', e.ejecutivo || '—'],
      ['Gerente', e.gerente || '—'],
      ['Ubicación', e.municipioEstado || '—'],
    ]
    let fy = top + 52
    for (const [k, v] of fields) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(muted.r, muted.g, muted.b)
      doc.text(k.toUpperCase(), pad + 16, fy)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(ink.r, ink.g, ink.b)
      doc.text(wrap(doc, v, halfW - 32).slice(0, 2), pad + 16, fy + 14)
      fy += 34
    }

    // SATISFACCIÓN
    drawPanelFrame(doc, pad + halfW + gap, top, halfW, halfH, 'SATISFACCIÓN', navy, cyan, true)
    let sy = top + 50
    const sx = pad + halfW + gap + 16
    const satScore = parseSatisfactionScore(e.satisfaccion)
    if (satScore != null) {
      doc.setFillColor(gold.r, gold.g, gold.b)
      doc.roundedRect(sx, sy - 4, 54, 28, 14, 14, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(navy.r, navy.g, navy.b)
      doc.text(satScore.toFixed(1), sx + 27, sy + 15, { align: 'center' })
      sy += 36
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(ink.r, ink.g, ink.b)
    const satLines = wrap(doc, e.satisfaccion || 'Sin comentarios', halfW - 32)
    doc.text(satLines.slice(0, satImgs.length ? 3 : 8), sx, sy)
    sy += satLines.slice(0, satImgs.length ? 3 : 8).length * 12 + 10
    if (satImgs.length) {
      const imgW = (halfW - 40 - 8) / satImgs.length
      const imgH = Math.min(95, halfH - (sy - top) - 20)
      satImgs.forEach((img, i) => {
        const { w, h } = fitImage(img, imgW, imgH)
        const ix = sx + i * (imgW + 8)
        doc.setFillColor(236, 245, 250)
        doc.roundedRect(ix - 2, sy - 2, w + 4, h + 4, 6, 6, 'F')
        doc.addImage(img.dataUrl, 'JPEG', ix, sy, w, h, undefined, 'FAST')
      })
    }

    // ANÁLISIS
    drawPanelFrame(doc, pad, top + halfH + gap, halfW, halfH, 'ANÁLISIS', navy, cyan, false)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(ink.r, ink.g, ink.b)
    doc.text(
      wrap(doc, e.analisis || 'Sin análisis registrado', halfW - 32).slice(0, 11),
      pad + 16,
      top + halfH + gap + 54,
    )

    // VENTAS
    drawPanelFrame(
      doc,
      pad + halfW + gap,
      top + halfH + gap,
      halfW,
      halfH,
      'RESULTADO DE VENTAS',
      navy,
      cyan,
      false,
    )
    const vx = pad + halfW + gap + 16
    let vy = top + halfH + gap + 50
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(cyan.r, cyan.g, cyan.b)
    doc.text('X-RAY', vx, vy)
    vy += 12
    if (xrayImg) {
      const { w, h } = fitImage(xrayImg, halfW - 36, 70)
      doc.addImage(xrayImg.dataUrl, 'JPEG', vx, vy, w, h, undefined, 'FAST')
      vy += h + 8
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(navy.r, navy.g, navy.b)
    const xrayAmt = parseMoney(e.ventasXray)
    doc.text(
      e.ventasXray ? (xrayAmt > 0 ? formatMoneyMx(xrayAmt) : e.ventasXray) : '—',
      vx,
      vy + 4,
    )
    vy += 18
    if (e.ventasXrayAnalisis) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(muted.r, muted.g, muted.b)
      doc.text(wrap(doc, e.ventasXrayAnalisis, halfW - 32).slice(0, 2), vx, vy)
      vy += 28
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(muted.r, muted.g, muted.b)
    doc.text('ENCUESTA', vx, vy)
    vy += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(ink.r, ink.g, ink.b)
    const encAmt = parseMoney(e.ventasEncuesta)
    doc.text(
      e.ventasEncuesta ? (encAmt > 0 ? formatMoneyMx(encAmt) : e.ventasEncuesta) : '—',
      vx,
      vy,
    )
  }

  // ========== CIERRE ==========
  doc.addPage()
  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.rect(0, 0, W, H, 'F')
  drawCoverDecor(doc, W, H, cyan, gold)
  if (logo) {
    const { w, h } = fitImage(logo, 140, 44)
    doc.addImage(logo.dataUrl, 'PNG', 48, 48, w, h)
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(34)
  doc.text(inProgress ? 'Avance del mes' : 'Cierre del mes', 48, 170)
  doc.setFontSize(22)
  doc.setTextColor(cyan.r, cyan.g, cyan.b)
  doc.text(label, 48, 210)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(14)
  doc.setTextColor(200, 220, 235)
  doc.text(
    [
      inProgress
        ? `${summary.total} captura(s) hasta hoy (mes aún abierto)`
        : `${summary.total} activaciones documentadas`,
      `X-Ray ${formatMoneyMx(summary.totalXray)}  ·  Encuesta ${formatMoneyMx(summary.totalEncuesta)}`,
      summary.avgSatisfaccion != null
        ? `Satisfacción promedio ${summary.avgSatisfaccion.toFixed(1)}`
        : 'Satisfacción pendiente de capturar',
    ],
    48,
    260,
  )
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(gold.r, gold.g, gold.b)
  doc.text('YAAVS · Siempre ganas más', 48, H - 48)

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const isDark = i === 1 || i === totalPages
    if (isDark) {
      doc.setTextColor(160, 190, 205)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(`${i} / ${totalPages}`, W - 40, H - 18, { align: 'right' })
    } else {
      drawFooter(doc, W, H, i, totalPages, muted, navy)
    }
  }

  doc.save(`trade-marketing-${monthKey}.pdf`)
}
