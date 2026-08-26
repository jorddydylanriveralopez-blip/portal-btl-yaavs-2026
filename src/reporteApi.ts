import type { ReporteEntry } from './tablero'

const REPORTE_API =
  'https://lightslategrey-deer-478072.hostingersite.com/api/responses'

export const REPORTE_TABLERO_XLSX =
  'https://lightslategrey-deer-478072.hostingersite.com/api/tablero-activacion.xlsx'

function reporteEndpoint(): string {
  if (import.meta.env.DEV) return '/reporte-proxy.php'
  try {
    return new URL('reporte-proxy.php', window.location.href).href
  } catch {
    return 'reporte-proxy.php'
  }
}

export async function fetchReporteResponses(): Promise<ReporteEntry[]> {
  const res = await fetch(reporteEndpoint(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Reportes BTL: error ${res.status}`)
  const data = (await res.json()) as { raw?: ReporteEntry[] }
  return Array.isArray(data.raw) ? data.raw : []
}

export { REPORTE_API }
