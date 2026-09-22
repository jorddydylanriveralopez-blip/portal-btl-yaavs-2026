export type StatusStoreResult = {
  ok: boolean
  activaIds: string[]
  terminadaIds: string[]
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

export async function fetchStatusStore(): Promise<{
  activaIds: string[]
  terminadaIds: string[]
}> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { activaIds: [], terminadaIds: [] }
    const data = (await res.json()) as StatusStoreResult
    return {
      activaIds: Array.isArray(data.activaIds) ? data.activaIds : [],
      terminadaIds: Array.isArray(data.terminadaIds) ? data.terminadaIds : [],
    }
  } catch {
    return { activaIds: [], terminadaIds: [] }
  }
}

/** @deprecated Prefer fetchStatusStore */
export async function fetchActivaIds(): Promise<string[]> {
  const store = await fetchStatusStore()
  return store.activaIds
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
    return {
      ok: false,
      activaIds: [],
      terminadaIds: [],
      message: 'No se pudo completar la acción',
    }
  }
  return {
    ok: !!data.ok,
    activaIds: Array.isArray(data.activaIds) ? data.activaIds : [],
    terminadaIds: Array.isArray(data.terminadaIds) ? data.terminadaIds : [],
    message: data.message,
  }
}

export async function restoreToActivas(id: string): Promise<StatusStoreResult> {
  return postStatus(id, 'activa')
}

export async function markAsTerminada(id: string): Promise<StatusStoreResult> {
  return postStatus(id, 'terminada')
}
