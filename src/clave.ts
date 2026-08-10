export const FORMULARIO_BTL_URL = 'https://form.fillout.com/fQqFawkbBhus'

/** Normaliza clave para comparar (ej. "25CL03213725 - NOMBRE" → "25CL03213725") */
export function normalizeClave(raw?: string | null): string {
  if (!raw) return ''
  const t = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  const code = t.match(/([0-9]{2}CL[A-Z0-9]+)/)
  if (code) return code[1]
  const beforeDash = t.split(/\s+-\s+/)[0]?.trim() || t
  return beforeDash.split(/\s{2,}/)[0]?.trim() || beforeDash
}

export type ClaveCheckResult = {
  ok: boolean
  exists: boolean
  clave?: string
  message?: string
  solicitud?: {
    id?: string
    puntoDeVenta?: string
    nombreYaavser?: string
    fechaBtl?: string
  } | null
}

function checkClaveEndpoint(clave: string): string {
  const qs = `clave=${encodeURIComponent(clave)}`
  if (import.meta.env.DEV) return `/check-clave.php?${qs}`
  try {
    return new URL(`check-clave.php?${qs}`, window.location.href).href
  } catch {
    return `check-clave.php?${qs}`
  }
}

export async function checkClaveYaavser(claveRaw: string): Promise<ClaveCheckResult> {
  const clave = normalizeClave(claveRaw)
  if (!clave) {
    return { ok: false, exists: false, message: 'Escribe una clave YAAVSER' }
  }

  const res = await fetch(checkClaveEndpoint(clave), {
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as ClaveCheckResult
  if (!res.ok && !data.message) {
    return { ok: false, exists: false, message: 'No se pudo validar la clave' }
  }
  return data
}

export function buildFormularioUrl(clave: string): string {
  const normalized = normalizeClave(clave)
  const url = new URL(FORMULARIO_BTL_URL)
  // Prefill común en Fillout (si el campo tiene URL parameter)
  url.searchParams.set('claveYaavser', normalized)
  url.searchParams.set('clave', normalized)
  return url.toString()
}
