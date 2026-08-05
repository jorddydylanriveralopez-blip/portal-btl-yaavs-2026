import type { FileAsset, Solicitud } from './types'

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

export function downloadJson(records: Solicitud[], filename?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    filename || `solicitudes-btl-yaavs-${stamp}.json`,
    JSON.stringify(records, null, 2),
    'application/json;charset=utf-8',
  )
}

export function solicitudToPlainText(s: Solicitud): string {
  const lines: string[] = [
    'SOLICITUD BTL YAAVS 2026',
    '========================',
    `ID: ${s.id}`,
    `Fecha BTL: ${formatFecha(s.fechaBtl)}`,
    `Hora de inicio: ${s.horaDeInicio || '—'}`,
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
  const margin = 48
  const pageW = doc.internal.pageSize.getWidth()
  const maxW = pageW - margin * 2
  let y = margin

  const ensure = (need = 18) => {
    if (y + need > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
  }

  const title = (text: string) => {
    ensure(28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 43, 68)
    doc.text(text, margin, y)
    y += 18
  }

  const line = (label: string, value?: string) => {
    const val = value?.trim() ? value : '—'
    const wrapped = doc.splitTextToSize(`${label}: ${val}`, maxW)
    ensure(wrapped.length * 14 + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(30, 40, 50)
    doc.text(wrapped, margin, y)
    y += wrapped.length * 13 + 4
  }

  doc.setFillColor(0, 43, 68)
  doc.rect(0, 0, pageW, 72, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('YAAVS · Solicitud BTL 2026', margin, 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(s.puntoDeVenta || s.nombreYaavser || 'Solicitud', margin, 54)
  y = 96

  title('YAAVSER')
  line('Ejecutivo', s.ejecutivoDeVentas)
  line('Nombre', s.nombreYaavser)
  line('Clave', s.claveYaavser)
  line('Teléfono', s.telefonoDeContacto)
  line('Punto de venta', s.puntoDeVenta)

  title('Ubicación')
  line('Estado', s.estado)
  line('Municipio / Alcaldía', s.municipioAlcaldia)
  line('Tipo de zona', s.tipoDeZona)
  line('Flujo', s.flujoDePersonas)
  line('Google Maps', s.ubicacionGoogleMaps)

  title('Evento')
  line('Fecha BTL', formatFecha(s.fechaBtl))
  line('Hora de inicio', s.horaDeInicio)
  line('Servicios', (s.serviciosActuales || []).join(', '))
  line('Otro servicio', s.otroServicio)
  line('Permiso', s.permisoConfirmado)
  line('Medidas', s.medidasDelEspacio)
  line('Materiales', (s.materialesRequeridos || []).join(', '))
  line('Promocionales', (s.entregaDePromocionales || []).join(', '))
  line('Aportación', s.aportacionDelYaavser)
  line('Detalle aportación', s.detalleDeAportacion)
  line('Observaciones', s.observaciones)

  title('Archivos')
  line('Fotos', fileUrls(s.fotoExterior))
  line('Evidencias', fileUrls(s.evidenciaDePermiso))

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
