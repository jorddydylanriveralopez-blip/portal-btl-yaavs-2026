export type StatusStoreResult = {
  ok: boolean
  activaIds: string[]
  message?: string
}

function endpoint(path = 'status-solicitud.php'): string {
  if (import.meta.env.DEV) return `/${path}`
  try {
    return new URL(path, window.location.href).href
  } catch {
    return path
  }
}

export async function fetchActivaIds(): Promise<string[]> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as StatusStoreResult
    return Array.isArray(data.activaIds) ? data.activaIds : []
  } catch {
    return []
  }
}

async function postStatus(
  id: string,
  action: 'activa' | 'terminada',
): Promise<StatusStoreResult> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({ id, action }),
  })
  const data = (await res.json().catch(() => null)) as StatusStoreResult | null
  if (!data) {
    return { ok: false, activaIds: [], message: 'No se pudo completar la acción' }
  }
  return {
    ok: !!data.ok,
    activaIds: Array.isArray(data.activaIds) ? data.activaIds : [],
    message: data.message,
  }
}

export async function restoreToActivas(id: string): Promise<StatusStoreResult> {
  return postStatus(id, 'activa')
}

export async function markAsTerminada(id: string): Promise<StatusStoreResult> {
  return postStatus(id, 'terminada')
}
