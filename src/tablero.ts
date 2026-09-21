import type { Solicitud } from './types'
import type { TableroMetaMap } from './tableroMeta'

export type TableroMetrics = {
  portabilidad: number | ''
  recargas: number | ''
  pospago: number | ''
  esim: number | ''
  sim: number | ''
}

export type TableroEstatus =
  | 'REALIZADA'
  | 'PROGRAMADA'
  | 'CANCELADA'
  | 'REAGENDADA'

export type TableroRow = {
  no: number
  fecha: string
  estado: string
  municipio: string
  colonia: string
  pdv: string
  clave: string
  nombre: string
  horas: string
  flujo: string
  estatus: TableroEstatus
  fechaReagendada: string
  comentario: string
  metrics: TableroMetrics
  tieneReporte: boolean
  solicitudId: string
}

export type ReporteEntry = {
  id?: string
  answers?: {
    claveYaavser?: string
    puntoDeVenta?: string
    fecha?: string
    horarioInicio?: string
    horarioFin?: string
    comerciales?: { servicio?: string; ventasPorProducto?: string | number }[]
  }
}

export type TableroChartCounts = {
  realizada: number
  cancelada: number
  reagendada: number
  programada: number
}

export type TableroEstadoCount = {
  label: string
  value: number
}

const ESTADO_CHART_COLORS = [
  '#1a7a3c',
  '#1f4e79',
  '#c41e2a',
  '#0f766e',
  '#b45309',
  '#4338ca',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#7c2d12',
  '#6b7280',
]

const PDV_ALIASES: Record<string, string> = {
  cachiny: 'kachili',
  ahorramovil: 'ahorramovi',
  electronicabosques: 'electronica bosques',
}

export function normalizeClaveTablero(raw?: string | null): string {
  if (!raw) return ''
  const t = raw.trim().toUpperCase().replace(/[\s\-–—]+/g, '')
  const m = t.match(/([0-9]{2}[A-Z]{2}[A-Z0-9]{6,})/)
  if (m) return m[1].slice(0, 14)
  return t.split(/\s+-\s+/)[0]?.trim() || t
}

function normKey(s?: string | null): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (!longer.length) return 1
  let matches = 0
  for (let i = 0; i < shorter.length; i += 1) {
    if (shorter[i] === longer[i]) matches += 1
  }
  return matches / longer.length
}

export function formatFechaTablero(iso?: string): string {
  if (!iso) return ''
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function horasFromReport(answers: ReporteEntry['answers']): string {
  const ini = answers?.horarioInicio
  const fin = answers?.horarioFin
  if (!ini || !fin) return ''
  const parse = (t: string) => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  const a = parse(ini)
  const b = parse(fin)
  if (a == null || b == null || b <= a) return ''
  const mins = b - a
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return String(h)
  if (m === 30) return `${h} hrs 30`
  return `${h}:${String(m).padStart(2, '0')}`
}

function extractComerciales(answers: ReporteEntry['answers']): TableroMetrics {
  const out: TableroMetrics = {
    portabilidad: '',
    recargas: '',
    pospago: '',
    esim: '',
    sim: '',
  }
  for (const row of answers?.comerciales || []) {
    const s = String(row?.servicio || '').toLowerCase()
    const v = Number.parseInt(String(row?.ventasPorProducto ?? ''), 10)
    if (!Number.isFinite(v) || v <= 0) continue
    if (s.includes('portabil')) out.portabilidad = v
    else if (s.includes('recarga')) out.recargas = v
    else if (s.includes('pospago')) out.pospago = v
    else if (s.includes('esim')) out.esim = v
    else if (s.includes('línea nueva') || s.includes('linea nueva')) out.sim = v
  }
  return out
}

export function findReportForSolicitud(
  sol: Solicitud,
  rawList: ReporteEntry[],
): ReporteEntry | null {
  const cb = normalizeClaveTablero(sol.claveYaavser)
  const nk = normKey(sol.puntoDeVenta)
  const alias = PDV_ALIASES[nk]
  let best: ReporteEntry | null = null
  let bestScore = 0

  for (const entry of rawList) {
    const a = entry?.answers || {}
    let score = 0
    const rb = normalizeClaveTablero(a.claveYaavser)
    if (cb && rb && (cb.startsWith(rb.slice(0, 10)) || rb.startsWith(cb.slice(0, 10)))) {
      score = 100
    }
    const rp = normKey(a.puntoDeVenta)
    if (alias && rp.includes(alias.replace(/\s+/g, ''))) score = Math.max(score, 90)
    else if (nk && (nk.includes(rp) || rp.includes(nk))) score = Math.max(score, 75)
    else if (nk && ratio(nk, rp) >= 0.72) score = Math.max(score, 60)
    if (a.fecha && sol.fechaBtl && a.fecha === sol.fechaBtl) score += 5
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }
  return bestScore >= 60 ? best : null
}

function autoEstatus(
  sol: Solicitud,
  report: ReporteEntry | null,
  activaIds: Set<string>,
): TableroEstatus {
  const obs = String(sol.observaciones || '').toLowerCase()
  if (activaIds.has(sol.id) || obs.includes('reagend')) return 'REAGENDADA'
  if (report) return 'REALIZADA'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fechaBtl = sol.fechaBtl ? new Date(`${sol.fechaBtl.slice(0, 10)}T12:00:00`) : null
  if (fechaBtl && fechaBtl < today) return 'REALIZADA'
  return 'PROGRAMADA'
}

export function buildTableroRows(
  solicitudes: Solicitud[],
  rawList: ReporteEntry[],
  activaIds: Iterable<string> = [],
  meta: TableroMetaMap = {},
): TableroRow[] {
  const restored = activaIds instanceof Set ? activaIds : new Set(activaIds)

  const sorted = [...solicitudes].sort((a, b) =>
    String(a.fechaBtl || '').localeCompare(String(b.fechaBtl || '')),
  )

  return sorted.map((sol, idx) => {
    const report = findReportForSolicitud(sol, rawList)
    const answers = report?.answers
    const metrics: TableroMetrics = answers
      ? extractComerciales(answers)
      : { portabilidad: '', recargas: '', pospago: '', esim: '', sim: '' }
    const horas = horasFromReport(answers) || '5'
    const rowMeta = meta[sol.id] || {}
    let estatus: TableroEstatus = autoEstatus(sol, report, restored)
    if (rowMeta.estatus) estatus = rowMeta.estatus
    else if (rowMeta.fechaReagendada) estatus = 'REAGENDADA'

    const flujo = String(sol.flujoDePersonas || 'MEDIO').toUpperCase()

    return {
      no: idx + 1,
      fecha: formatFechaTablero(sol.fechaBtl),
      estado: String(sol.estado || '').trim(),
      municipio: sol.municipioAlcaldia || '',
      colonia: sol.colonia || '',
      pdv: sol.puntoDeVenta || '',
      clave: normalizeClaveTablero(sol.claveYaavser) || String(sol.claveYaavser || '').trim(),
      nombre: sol.nombreYaavser || '',
      horas,
      flujo: flujo.includes('ALTO') ? 'ALTO' : 'MEDIO',
      estatus,
      fechaReagendada: rowMeta.fechaReagendada || '',
      comentario: rowMeta.comentario || '',
      metrics,
      tieneReporte: Boolean(report),
      solicitudId: sol.id,
    }
  })
}

export function countTableroEstatus(rows: TableroRow[]): TableroChartCounts {
  const counts: TableroChartCounts = {
    realizada: 0,
    cancelada: 0,
    reagendada: 0,
    programada: 0,
  }
  for (const row of rows) {
    if (row.estatus === 'REALIZADA') counts.realizada += 1
    else if (row.estatus === 'CANCELADA') counts.cancelada += 1
    else if (row.estatus === 'REAGENDADA') counts.reagendada += 1
    else counts.programada += 1
  }
  return counts
}

/** Conteo de activaciones por estado (entidad federativa) en el periodo filtrado. */
export function countTableroEstados(rows: TableroRow[]): TableroEstadoCount[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const label = String(row.estado || '').trim() || 'SIN ESTADO'
    map.set(label, (map.get(label) || 0) + 1)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))
}

export function colorForEstado(label: string, index: number): string {
  if (/sin estado/i.test(label)) return '#6b7280'
  return ESTADO_CHART_COLORS[index % ESTADO_CHART_COLORS.length]
}

/** Sucursales distintas (PDV) en el tablero filtrado. */
export function countUniqueSucursales(rows: TableroRow[]): number {
  const set = new Set<string>()
  for (const row of rows) {
    const key = normKey(row.pdv)
    if (key) set.add(key)
  }
  return set.size
}

export function solicitudInFechaRange(
  sol: Pick<Solicitud, 'fechaBtl'>,
  fechaFrom?: string,
  fechaTo?: string,
): boolean {
  const from = String(fechaFrom || '').slice(0, 10)
  const to = String(fechaTo || '').slice(0, 10)
  if (!from && !to) return true
  const d = String(sol.fechaBtl || '').slice(0, 10)
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function foldText(s?: string | null): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function solicitudMatchesEstado(
  sol: Pick<Solicitud, 'estado'>,
  estado?: string,
): boolean {
  const want = foldText(estado)
  if (!want) return true
  return foldText(sol.estado) === want
}

export function solicitudMatchesMunicipio(
  sol: Pick<Solicitud, 'municipioAlcaldia'>,
  municipio?: string,
): boolean {
  const want = foldText(municipio)
  if (!want) return true
  return foldText(sol.municipioAlcaldia) === want
}

/** Búsqueda libre: PDV, nombre, clave, estado, municipio, colonia. */
export function solicitudMatchesSearch(
  sol: Pick<
    Solicitud,
    | 'puntoDeVenta'
    | 'nombreYaavser'
    | 'claveYaavser'
    | 'ejecutivoDeVentas'
    | 'estado'
    | 'municipioAlcaldia'
    | 'colonia'
  >,
  search?: string,
): boolean {
  const q = foldText(search)
  if (!q) return true
  const hay = [
    sol.puntoDeVenta,
    sol.nombreYaavser,
    sol.claveYaavser,
    sol.ejecutivoDeVentas,
    sol.estado,
    sol.municipioAlcaldia,
    sol.colonia,
  ]
    .map(foldText)
    .join(' ')
  return hay.includes(q)
}

export function filterSolicitudesForTablero(
  list: Solicitud[],
  filters: {
    fechaFrom?: string
    fechaTo?: string
    estado?: string
    municipio?: string
    search?: string
  },
): Solicitud[] {
  return list.filter(
    (s) =>
      solicitudInFechaRange(s, filters.fechaFrom, filters.fechaTo) &&
      solicitudMatchesEstado(s, filters.estado) &&
      solicitudMatchesMunicipio(s, filters.municipio) &&
      solicitudMatchesSearch(s, filters.search),
  )
}

export function sumTableroMetrics(rows: TableroRow[]): TableroMetrics {
  const keys = ['portabilidad', 'recargas', 'pospago', 'esim', 'sim'] as const
  const tot: TableroMetrics = {
    portabilidad: 0,
    recargas: 0,
    pospago: 0,
    esim: 0,
    sim: 0,
  }
  for (const row of rows) {
    for (const k of keys) {
      const v = row.metrics[k]
      if (v !== '' && v != null) tot[k] = (Number(tot[k]) || 0) + Number(v)
    }
  }
  return tot
}
