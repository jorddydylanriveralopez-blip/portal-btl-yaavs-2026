import type { FileAsset, Solicitud } from './types'
import type { TableroRow } from './tablero'

const COLUMNS: { key: keyof Solicitud | 'fotos' | 'evidencias'; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'fechaBtl', label: 'Fecha BTL' },
  { key: 'horaDeInicio', label: 'Hora de inicio' },
  { key: 'ejecutivoDeVentas', label: 'Ejecutivo de Ventas' },
  { key: 'nombreYaavser', label: 'Nombre YAAVSER' },
  { key: 'claveYaavser', label: 'Clave YAAVSER' },
  { key: 'telefonoDeContacto', label: 'Teléfono' },
  { key: 'puntoDeVenta', label: 'Punto de Venta' },
  { key: 'estado', label: 'Estado' },
  { key: 'municipioAlcaldia', label: 'Municipio / Alcaldía' },
  { key: 'ubicacionGoogleMaps', label: 'Google Maps' },
  { key: 'tipoDeZona', label: 'Tipo de Zona' },
  { key: 'flujoDePersonas', label: 'Flujo de Personas' },
  { key: 'serviciosActuales', label: 'Servicios Actuales' },
  { key: 'otroServicio', label: 'Otro Servicio' },
  { key: 'permisoConfirmado', label: 'Permiso Confirmado' },
  { key: 'medidasDelEspacio', label: 'Medidas del Espacio' },
  { key: 'materialesRequeridos', label: 'Materiales Requeridos' },
  { key: 'entregaDePromocionales', label: 'Entrega de Promocionales' },
  { key: 'aportacionDelYaavser', label: 'Aportación del YAAVSER' },
  { key: 'detalleDeAportacion', label: 'Detalle de Aportación' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'fotos', label: 'URLs Foto Exterior' },
  { key: 'evidencias', label: 'URLs Evidencia Permiso' },
]

function cellValue(s: Solicitud, key: (typeof COLUMNS)[number]['key']): string {
  if (key === 'fotos') return fileUrls(s.fotoExterior)
  if (key === 'evidencias') return fileUrls(s.evidenciaDePermiso)
  if (key === 'horaDeInicio') return formatHora(s.horaDeInicio)
  if (key === 'fechaBtl') return formatFecha(s.fechaBtl)
  const v = s[key as keyof Solicitud]
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object') return fileUrls(v as FileAsset[])
    return (v as string[]).join('; ')
  }
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fileUrls(files?: FileAsset[]): string {
  return (files || []).map((f) => f.url).join(' | ')
}

/** Misma origen → evita CORS de S3 al embeber fotos en el PDF */
function proxiedImageUrl(url: string): string {
  const qs = `url=${encodeURIComponent(url)}`
  if (import.meta.env.DEV) return `/image-proxy.php?${qs}`
  try {
    return new URL(`image-proxy.php?${qs}`, window.location.href).href
  } catch {
    return `image-proxy.php?${qs}`
  }
}

async function blobToJpegDataUrl(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const maxW = 1400
  const scale = Math.min(1, maxW / Math.max(naturalWidth, 1))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.84),
    width,
    height,
  }
}

async function loadImageForPdf(
  url: string,
): Promise<{ dataUrl: string; format: 'JPEG'; width: number; height: number } | null> {
  const candidates = [proxiedImageUrl(url), url]

  for (const src of candidates) {
    try {
      const res = await fetch(src, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) continue
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image()
          el.onload = () => resolve(el)
          el.onerror = () => reject(new Error('img'))
          el.src = objectUrl
        })
        const jpeg = await blobToJpegDataUrl(img, img.naturalWidth, img.naturalHeight)
        return { ...jpeg, format: 'JPEG' }
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch {
      // siguiente candidato
    }
  }

  // Último intento: Image + crossOrigin (por si el CDN ya manda CORS)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('img'))
      el.src = url
    })
    const jpeg = await blobToJpegDataUrl(img, img.naturalWidth, img.naturalHeight)
    return { ...jpeg, format: 'JPEG' }
  } catch {
    return null
  }
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function solicitudesToCsv(records: Solicitud[]): string {
  const header = COLUMNS.map((c) => escapeCsv(c.label)).join(',')
  const rows = records.map((s) =>
    COLUMNS.map((c) => escapeCsv(cellValue(s, c.key))).join(','),
  )
  return [header, ...rows].join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const bom = mime.includes('csv') ? '\uFEFF' : ''
  const blob = new Blob([bom + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(records: Solicitud[], filename?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    filename || `solicitudes-btl-yaavs-${stamp}.csv`,
    solicitudesToCsv(records),
    'text/csv;charset=utf-8',
  )
}

export function tableroToCsv(rows: TableroRow[]): string {
  const header = [
    'NO',
    'FECHA',
    'ESTADO',
    'MUNICIPIO/ALCALDIA',
    'PDV',
    'CLAVE YAAVSER',
    'NOMBRE DEL YAAV',
    'HORAS',
    'FLUJO',
    'ESTATUS',
    'PORTABILIDA',
    'RECARGAS',
    'POSPAG',
    'e-SIM',
    'SIM - LÍNEA NUEVA',
  ]
    .map(escapeCsv)
    .join(',')
  const body = rows.map((r) =>
    [
      r.no,
      r.fecha,
      r.estado,
      r.municipio,
      r.pdv,
      r.clave,
      r.nombre,
      r.horas,
      r.flujo,
      r.estatus,
      r.metrics.portabilidad,
      r.metrics.recargas,
      r.metrics.pospago,
      r.metrics.esim,
      r.metrics.sim,
    ]
      .map((v) => escapeCsv(String(v ?? '')))
      .join(','),
  )
  return [header, ...body].join('\r\n')
}

export function downloadTableroCsv(rows: TableroRow[], filename?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    filename || `ACTIVACION_BTL_${stamp}.csv`,
    tableroToCsv(rows),
    'text/csv;charset=utf-8',
  )
}

export function downloadJson(records: Solicitud[], filename?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    filename || `solicitudes-btl-yaavs-${stamp}.json`,
    JSON.stringify(records, null, 2),
    'application/json;charset=utf-8',
  )
}

export function formatFecha(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Convierte horas raras (Excel / segundos / 1200) a texto legible, ej. 12:00 p.m. */
export function formatHora(raw?: string | number | null): string {
  if (raw == null || raw === '') return '—'
  const text = String(raw).trim()
  if (!text || text === '—' || text.toLowerCase() === 'null') return '—'

  // Ya viene como hora legible
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)?$/i)
  if (ampm) {
    let h = Number(ampm[1])
    const m = Number(ampm[2])
    const suffix = (ampm[4] || '').toLowerCase()
    if (suffix) {
      const isPm = suffix.startsWith('p')
      if (isPm && h < 12) h += 12
      if (!isPm && h === 12) h = 0
    }
    return formatClock(h, m)
  }

  // Solo número
  const normalized = text.replace(',', '.')
  const num = Number(normalized)
  if (!Number.isFinite(num)) return text

  // 0 suele venir vacío / sin captura
  if (num === 0) return '—'

  let totalSeconds: number | null = null

  // Fracción de día Excel (0–1), ej. 0.5 = 12:00
  if (num >= 0 && num < 1) {
    totalSeconds = Math.round(num * 86400)
  }
  // Horas decimales 1–24, ej. 12.5 = 12:30
  else if (num >= 1 && num <= 24) {
    const h = Math.floor(num)
    const m = Math.round((num - h) * 60)
    return formatClock(h, m >= 60 ? 59 : m)
  }
  // Militar compacto 700–2359, ej. 1200 = 12:00
  else if (num >= 100 && num <= 2359 && Number.isInteger(num)) {
    const h = Math.floor(num / 100)
    const m = num % 100
    if (h <= 23 && m <= 59) return formatClock(h, m)
  }
  // Segundos desde medianoche (lo más común cuando sale 42200 ≈ 11:43)
  else if (num > 24 && num <= 86400) {
    totalSeconds = Math.round(num)
  }
  // Serial Excel con hora en la parte decimal
  else if (num > 20000 && num < 100000) {
    const fraction = num - Math.floor(num)
    if (fraction > 0) totalSeconds = Math.round(fraction * 86400)
    else if (num <= 86400) totalSeconds = Math.round(num)
    else {
      // Entero tipo 42200: casi siempre segundos mal exportados
      totalSeconds = Math.round(num % 86400)
    }
  }

  if (totalSeconds == null) return text
  totalSeconds = ((totalSeconds % 86400) + 86400) % 86400
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return formatClock(h, m)
}

function formatClock(hours24: number, minutes: number): string {
  const h = ((hours24 % 24) + 24) % 24
  const m = Math.min(59, Math.max(0, minutes))
  const suffix = h >= 12 ? 'p.m.' : 'a.m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function solicitudToPlainText(s: Solicitud): string {
  const lines: string[] = [
    'SOLICITUD BTL 2026',
    '========================',
    `ID: ${s.id}`,
    `Fecha BTL: ${formatFecha(s.fechaBtl)}`,
    `Hora de inicio: ${formatHora(s.horaDeInicio)}`,
    '',
    '— YAAVSER —',
    `Ejecutivo: ${s.ejecutivoDeVentas || '—'}`,
    `Nombre: ${s.nombreYaavser || '—'}`,
    `Clave: ${s.claveYaavser || '—'}`,
    `Teléfono: ${s.telefonoDeContacto || '—'}`,
    `Punto de venta: ${s.puntoDeVenta || '—'}`,
    '',
    '— Ubicación —',
    `Estado: ${s.estado || '—'}`,
    `Municipio: ${s.municipioAlcaldia || '—'}`,
    `Zona: ${s.tipoDeZona || '—'}`,
    `Flujo: ${s.flujoDePersonas || '—'}`,
    `Maps: ${s.ubicacionGoogleMaps || '—'}`,
    '',
    '— Evento —',
    `Servicios: ${(s.serviciosActuales || []).join(', ') || '—'}`,
    `Otro: ${s.otroServicio || '—'}`,
    `Permiso: ${s.permisoConfirmado || '—'}`,
    `Medidas: ${s.medidasDelEspacio || '—'}`,
    `Materiales: ${(s.materialesRequeridos || []).join(', ') || '—'}`,
    `Promocionales: ${(s.entregaDePromocionales || []).join(', ') || '—'}`,
    `Aportación: ${s.aportacionDelYaavser || '—'}`,
    `Detalle aportación: ${s.detalleDeAportacion || '—'}`,
    `Observaciones: ${s.observaciones || '—'}`,
    '',
    '— Archivos —',
    `Fotos: ${fileUrls(s.fotoExterior) || '—'}`,
    `Evidencias: ${fileUrls(s.evidenciaDePermiso) || '—'}`,
  ]
  return lines.join('\n')
}

export function downloadSolicitud(s: Solicitud) {
  const name = (s.claveYaavser || s.nombreYaavser || s.id).replace(/\s+/g, '-')
  downloadTextFile(
    `solicitud-${name}.txt`,
    solicitudToPlainText(s),
    'text/plain;charset=utf-8',
  )
}

export async function downloadSolicitudPdf(s: Solicitud) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 42
  const contentW = pageW - margin * 2
  let y = 0

  const navy = { r: 0, g: 43, b: 68 }
  const cyan = { r: 0, g: 160, b: 200 }
  const muted = { r: 90, g: 110, b: 128 }
  const ink = { r: 20, g: 32, b: 42 }

  const ensure = (need: number) => {
    if (y + need > pageH - 48) {
      doc.addPage()
      doc.setFillColor(cyan.r, cyan.g, cyan.b)
      doc.rect(0, 0, pageW, 4, 'F')
      y = 36
    }
  }

  const section = (label: string) => {
    ensure(36)
    y += 10
    doc.setFillColor(navy.r, navy.g, navy.b)
    doc.roundedRect(margin, y, contentW, 22, 4, 4, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label.toUpperCase(), margin + 10, y + 14)
    y += 34
  }

  type Field = { label: string; value?: string; wide?: boolean }
  const drawFields = (fields: Field[]) => {
    const gap = 10
    const colW = (contentW - gap) / 2
    let col = 0
    let rowY = y

    for (const f of fields) {
      const val = f.value?.trim()
      if (!val) continue

      const boxW = f.wide ? contentW : colW
      if (f.wide && col === 1) {
        y = rowY
        col = 0
      }

      const x = margin + (col === 1 && !f.wide ? colW + gap : 0)
      const lines = doc.splitTextToSize(val, boxW - 16) as string[]
      const boxH = Math.max(40, 18 + 12 + lines.length * 12)

      ensure(boxH + 8)
      if (col === 0) rowY = y

      doc.setFillColor(245, 249, 252)
      doc.setDrawColor(220, 230, 238)
      doc.roundedRect(x, y, boxW, boxH, 5, 5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(muted.r, muted.g, muted.b)
      doc.text(f.label.toUpperCase(), x + 8, y + 14)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(ink.r, ink.g, ink.b)
      doc.text(lines, x + 8, y + 28)

      if (f.wide || col === 1) {
        y = Math.max(rowY, y) + boxH + 8
        col = 0
        rowY = y
      } else {
        col = 1
        rowY = Math.max(rowY, y + boxH + 8)
      }
    }
    if (col === 1) y = rowY
  }

  doc.setFillColor(navy.r, navy.g, navy.b)
  doc.rect(0, 0, pageW, 88, 'F')
  doc.setFillColor(cyan.r, cyan.g, cyan.b)
  doc.rect(0, 88, pageW, 4, 'F')

  doc.setTextColor(180, 220, 235)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('PORTAL BTL 2026', margin, 28)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Solicitud de activación BTL', margin, 50)

  const subtitle = s.puntoDeVenta || s.nombreYaavser || 'Sin punto de venta'
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(210, 230, 240)
  doc.text(doc.splitTextToSize(subtitle, contentW) as string[], margin, 70)

  y = 112

  doc.setFillColor(236, 245, 250)
  doc.roundedRect(margin, y, contentW, 44, 6, 6, 'F')
  const summary = [
    { k: 'Fecha', v: formatFecha(s.fechaBtl) },
    { k: 'Clave', v: s.claveYaavser || '—' },
    { k: 'Flujo', v: s.flujoDePersonas || '—' },
    { k: 'Estado', v: s.estado || '—' },
  ]
  summary.forEach((item, i) => {
    const x = margin + 12 + i * (contentW / 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(muted.r, muted.g, muted.b)
    doc.text(item.k.toUpperCase(), x, y + 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(ink.r, ink.g, ink.b)
    doc.text(doc.splitTextToSize(item.v, contentW / 4 - 16) as string[], x, y + 30)
  })
  y += 60

  const fotosList = s.fotoExterior || []
  let embedded = 0
  if (fotosList.length) {
    section('Foto exterior')
    for (const [idx, file] of fotosList.entries()) {
      if (idx > 2) break
      const img = await loadImageForPdf(file.url)
      if (!img) continue

      const maxH = idx === 0 ? 240 : 170
      const ratio = img.width / Math.max(img.height, 1)
      let drawW = contentW
      let drawH = drawW / ratio
      if (drawH > maxH) {
        drawH = maxH
        drawW = drawH * ratio
      }

      ensure(drawH + 16)
      const x = margin + (contentW - drawW) / 2
      doc.setDrawColor(220, 230, 238)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(x - 4, y - 4, drawW + 8, drawH + 8, 6, 6, 'FD')
      doc.addImage(img.dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST')
      y += drawH + 14
      embedded += 1
    }

    if (!embedded) {
      ensure(28)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(muted.r, muted.g, muted.b)
      doc.text(
        'No se pudo incrustar la foto (sube image-proxy.php al hosting o revisa la URL).',
        margin,
        y,
      )
      y += 18
      drawFields([
        {
          label: 'Enlace de la foto',
          value: fileUrls(fotosList) || undefined,
          wide: true,
        },
      ])
    }
  }

  section('YAAVSER')
  drawFields([
    { label: 'Ejecutivo', value: s.ejecutivoDeVentas },
    { label: 'Nombre', value: s.nombreYaavser },
    { label: 'Clave', value: s.claveYaavser },
    { label: 'Teléfono', value: s.telefonoDeContacto },
    { label: 'Punto de venta', value: s.puntoDeVenta, wide: true },
  ])

  section('Ubicación')
  drawFields([
    { label: 'Estado', value: s.estado },
    { label: 'Municipio / Alcaldía', value: s.municipioAlcaldia },
    { label: 'Tipo de zona', value: s.tipoDeZona },
    { label: 'Flujo de personas', value: s.flujoDePersonas },
    { label: 'Google Maps', value: s.ubicacionGoogleMaps, wide: true },
  ])

  section('Evento BTL')
  drawFields([
    { label: 'Fecha BTL', value: formatFecha(s.fechaBtl) },
    { label: 'Hora de inicio', value: formatHora(s.horaDeInicio) },
    { label: 'Permiso', value: s.permisoConfirmado },
    { label: 'Medidas', value: s.medidasDelEspacio },
    { label: 'Servicios', value: (s.serviciosActuales || []).join(', '), wide: true },
    { label: 'Otro servicio', value: s.otroServicio, wide: true },
    { label: 'Materiales', value: (s.materialesRequeridos || []).join(', '), wide: true },
    {
      label: 'Promocionales',
      value: (s.entregaDePromocionales || []).join(', '),
      wide: true,
    },
    { label: 'Aportación', value: s.aportacionDelYaavser },
    { label: 'Detalle aportación', value: s.detalleDeAportacion },
    { label: 'Observaciones', value: s.observaciones, wide: true },
  ])

  const evidencias = fileUrls(s.evidenciaDePermiso)
  if (evidencias) {
    section('Evidencia de permiso')
    drawFields([{ label: 'Enlace / archivo', value: evidencias, wide: true }])
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 230, 238)
    doc.line(margin, pageH - 32, pageW - margin, pageH - 32)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(muted.r, muted.g, muted.b)
    doc.text('Portal BTL 2026 · Documento generado automáticamente', margin, pageH - 18)
    doc.text(`${i} / ${pages}`, pageW - margin, pageH - 18, { align: 'right' })
  }

  const name = (s.claveYaavser || s.nombreYaavser || s.id).replace(/\s+/g, '-')
  doc.save(`solicitud-${name}.pdf`)
}

export async function downloadFileAsset(file: FileAsset, fallbackName: string) {
  try {
    const res = await fetch(file.url)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename || fallbackName
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    window.open(file.url, '_blank', 'noopener,noreferrer')
  }
}
