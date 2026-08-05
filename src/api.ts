import type { Filters, SolicitudesResponse } from './types'

const APP_ID = 'sy3akaxkpf'
const WORKFLOW_URL = `https://workflows.fillout.com/public/${APP_ID}/workflow/execute`

export async function getSolicitudes(filters: Filters): Promise<SolicitudesResponse> {
  const inputs: Record<string, string | number | undefined> = {
    search: filters.search.trim() || undefined,
    estado: filters.estado || undefined,
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

  return (await res.json()) as SolicitudesResponse
}
