export type TradeEntry = {
  id: string
  solicitudId?: string
  fecha: string
  clave: string
  ejecutivo: string
  gerente: string
  municipioEstado: string
  satisfaccion: string
  /** Hasta 2 rutas relativas `trade-uploads/...` */
  satisfaccionImagenes: [string, string]
  analisis: string
  /** Captura X-Ray (única imagen). */
  ventasXrayImagen: string
  /** Monto / resultado extraído al analizar la captura. */
  ventasXray: string
  /** Resumen automático de la captura X-Ray. */
  ventasXrayAnalisis: string
  ventasEncuesta: string
  createdAt?: string
  updatedAt?: string
}

export type TradeEntryInput = Omit<TradeEntry, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type TradeResult = {
  ok: boolean
  entries: TradeEntry[]
  entry?: TradeEntry
  message?: string
}

export type MonthlyTradeSummary = {
  monthKey: string
  label: string
  entries: TradeEntry[]
  total: number
  conSatisfaccion: number
  conAnalisis: number
  totalXray: number
  totalEncuesta: number
  avgSatisfaccion: number | null
}

function endpoint(path = 'trade-marketing.php'): string {
  if (import.meta.env.DEV) return `/${path}`
  try {
    return new URL(path, window.location.href).href
  } catch {
    return path
  }
}

function normalizeImages(raw: unknown): [string, string] {
  const out: [string, string] = ['', '']
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < 2; i++) {
    const v = raw[i]
    if (typeof v === 'string' && v.trim()) out[i] = v.trim()
  }
  return out
}

function asEntries(data: TradeResult | null): TradeEntry[] {
  if (!data?.entries || !Array.isArray(data.entries)) return []
  return data.entries
    .filter((e) => e && typeof e.id === 'string' && e.id)
    .map((e) => ({
      ...e,
      satisfaccionImagenes: normalizeImages(e.satisfaccionImagenes),
      ventasXrayImagen:
        typeof e.ventasXrayImagen === 'string' && !e.ventasXrayImagen.startsWith('data:')
          ? e.ventasXrayImagen
          : '',
      ventasXrayAnalisis: typeof e.ventasXrayAnalisis === 'string' ? e.ventasXrayAnalisis : '',
    }))
}

export function tradeImageUrl(rel?: string): string {
  const v = (rel || '').trim()
  if (!v) return ''
  if (v.startsWith('data:') || v.startsWith('http://') || v.startsWith('https://')) return v
  if (import.meta.env.DEV) return `/${v}`
  try {
    return new URL(v, window.location.href).href
  } catch {
    return v
  }
}

/** Comprime a JPEG data URL para subir evidencia. */
export async function fileToJpegDataUrl(file: File, maxSide = 1100): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes')
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo leer la imagen'))
      el.src = objectUrl
    })
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const scale = Math.min(1, maxSide / Math.max(w, h, 1))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(img, 0, 0, cw, ch)
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function fetchTradeEntries(): Promise<TradeEntry[]> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as TradeResult
    return asEntries(data)
  } catch {
    return []
  }
}

function newTradeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return `tm${Date.now().toString(16)}`
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** Sube una imagen al servidor y devuelve la ruta `trade-uploads/...`. */
export async function uploadTradeImage(
  source: string,
  tag: string,
  entryId: string,
): Promise<string> {
  const value = (source || '').trim()
  if (!value) return ''
  if (value.startsWith('trade-uploads/')) return value
  if (!value.startsWith('data:image/')) return value

  const blob = await dataUrlToBlob(value)
  const form = new FormData()
  form.append('action', 'upload')
  form.append('tag', tag)
  form.append('id', entryId)
  form.append('file', blob, `${tag}.jpg`)

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  })
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean
    path?: string
    message?: string
  } | null
  if (!data?.ok || !data.path) {
    throw new Error(data?.message || 'No se pudo subir la imagen')
  }
  return data.path
}

export async function saveTradeEntry(input: TradeEntryInput): Promise<TradeResult> {
  const entryId = (input.id || '').trim() || newTradeId()
  let sat0 = input.satisfaccionImagenes?.[0] || ''
  let sat1 = input.satisfaccionImagenes?.[1] || ''
  let xray = input.ventasXrayImagen || ''

  try {
    sat0 = await uploadTradeImage(sat0, 'sat-1', entryId)
    sat1 = await uploadTradeImage(sat1, 'sat-2', entryId)
    xray = await uploadTradeImage(xray, 'xray', entryId)
  } catch (err) {
    return {
      ok: false,
      entries: [],
      message: err instanceof Error ? err.message : 'Error al subir evidencias',
    }
  }

  const payload = {
    action: 'save',
    ...input,
    id: entryId,
    satisfaccionImagenes: normalizeImages([sat0, sat1]),
    ventasXrayImagen: xray,
    ventasXrayAnalisis: input.ventasXrayAnalisis || '',
  }
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => null)) as TradeResult | null
  if (!data) {
    return { ok: false, entries: [], message: 'No se pudo guardar' }
  }
  return {
    ok: !!data.ok,
    entries: asEntries(data),
    entry: data.entry
      ? {
          ...data.entry,
          satisfaccionImagenes: normalizeImages(data.entry.satisfaccionImagenes),
          ventasXrayImagen:
            typeof data.entry.ventasXrayImagen === 'string' ? data.entry.ventasXrayImagen : '',
          ventasXrayAnalisis:
            typeof data.entry.ventasXrayAnalisis === 'string'
              ? data.entry.ventasXrayAnalisis
              : '',
        }
      : undefined,
    message: data.message,
  }
}

export async function deleteTradeEntry(id: string): Promise<TradeResult> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({ action: 'delete', id }),
  })
  const data = (await res.json().catch(() => null)) as TradeResult | null
  if (!data) {
    return { ok: false, entries: [], message: 'No se pudo eliminar' }
  }
  return {
    ok: !!data.ok,
    entries: asEntries(data),
    message: data.message,
  }
}

export function parseMoney(raw?: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** Extrae promedio 1–5 si el texto empieza o contiene un número. */
export function parseSatisfactionScore(raw?: string): number | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 10) return null
  return n
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export function monthKeyFromFecha(fecha: string): string {
  return fecha.slice(0, 7)
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return `${MONTH_NAMES[m - 1] || m} ${y}`
}

export function filterByMonth(entries: TradeEntry[], monthKey: string): TradeEntry[] {
  return entries
    .filter((e) => e.fecha && monthKeyFromFecha(e.fecha) === monthKey)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function summarizeMonth(entries: TradeEntry[], monthKey: string): MonthlyTradeSummary {
  const monthEntries = filterByMonth(entries, monthKey)
  const scores = monthEntries
    .map((e) => parseSatisfactionScore(e.satisfaccion))
    .filter((n): n is number => n != null)
  const avg =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  return {
    monthKey,
    label: monthLabel(monthKey),
    entries: monthEntries,
    total: monthEntries.length,
    conSatisfaccion: monthEntries.filter((e) => e.satisfaccion.trim()).length,
    conAnalisis: monthEntries.filter((e) => e.analisis.trim()).length,
    totalXray: monthEntries.reduce((sum, e) => sum + parseMoney(e.ventasXray), 0),
    totalEncuesta: monthEntries.reduce((sum, e) => sum + parseMoney(e.ventasEncuesta), 0),
    avgSatisfaccion: avg,
  }
}

export function availableMonths(entries: TradeEntry[]): string[] {
  const keys = new Set<string>()
  for (const e of entries) {
    if (e.fecha && /^\d{4}-\d{2}/.test(e.fecha)) {
      keys.add(monthKeyFromFecha(e.fecha))
    }
  }
  return [...keys].sort((a, b) => b.localeCompare(a))
}

export function emptyTradeForm(fecha = ''): TradeEntryInput {
  return {
    fecha,
    clave: '',
    ejecutivo: '',
    gerente: '',
    municipioEstado: '',
    satisfaccion: '',
    satisfaccionImagenes: ['', ''],
    analisis: '',
    ventasXrayImagen: '',
    ventasXray: '',
    ventasXrayAnalisis: '',
    ventasEncuesta: '',
    solicitudId: '',
  }
}

export function formatMoneyMx(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)
}
