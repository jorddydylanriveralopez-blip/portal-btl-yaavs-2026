import type { Filters, Solicitud, SolicitudesResponse } from './types'

const APP_ID = 'sy3akaxkpf'
const WORKFLOW_URL = `https://workflows.fillout.com/public/${APP_ID}/workflow/execute`

/** Correcciones de estado mal capturado en Fillout. */
const ESTADO_FIXES: Record<string, string> = {
  '2aab727e-7cca-4b50-86d4-954b4e1ae3ce': 'Ciudad de México', // Refacciones Elizabeth (venía Guerrero)
}

/** Fillout a veces manda colonia con id interno. */
function normalizeSolicitud(raw: Solicitud & Record<string, unknown>): Solicitud {
  const coloniaRaw =
    raw.colonia ||
    raw.faksUxeti98 ||
    raw.coloniaAsentamiento ||
    raw.asentamiento
  const colonia =
    typeof coloniaRaw === 'string' && coloniaRaw.trim() ? coloniaRaw.trim() : undefined
  const estadoFix = ESTADO_FIXES[String(raw.id || '')]
  return {
    ...raw,
    colonia: colonia || raw.colonia,
    municipioAlcaldia:
      (typeof raw.municipioAlcaldia === 'string' && raw.municipioAlcaldia.trim()) ||
      undefined,
    estado:
      estadoFix ||
      ((typeof raw.estado === 'string' && raw.estado.trim()) || undefined),
  }
}

export async function getSolicitudes(filters: Filters): Promise<SolicitudesResponse> {
  // Si filtramos por un estado corregido, no mandar el filtro a Fillout
  // (el dato crudo sigue mal) y filtrar en cliente tras normalizar.
  const wantsFixedEstado =
    !!filters.estado &&
    Object.values(ESTADO_FIXES).some(
      (e) => e.toLowerCase() === filters.estado.trim().toLowerCase(),
    )
  const inputs: Record<string, string | number | undefined> = {
    search: filters.search.trim() || undefined,
    estado: wantsFixedEstado ? undefined : filters.estado || undefined,
    flujoDePersonas: filters.flujo || undefined,
    fechaBtlFrom: filters.fechaFrom || undefined,
    fechaBtlTo: filters.fechaTo || undefined,
    limit: 500,
  }

  const res = await fetch(WORKFLOW_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      inputs,
      mode: 'live',
      workflowId: 'getSolicitudes',
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Error ${res.status}`)
  }

  const data = (await res.json()) as SolicitudesResponse
  let records = (data.records || []).map((r) =>
    normalizeSolicitud(r as Solicitud & Record<string, unknown>),
  )
  if (filters.estado) {
    const want = filters.estado.trim().toLowerCase()
    records = records.filter((r) => (r.estado || '').trim().toLowerCase() === want)
  }
  return { ...data, records, total: records.length }
}
