export type DeletedListResult = {
  ok: boolean
  ids: string[]
  message?: string
}

function endpoint(path = 'delete-solicitud.php'): string {
  if (import.meta.env.DEV) return `/${path}`
  try {
    return new URL(path, window.location.href).href
  } catch {
    return path
  }
}

export async function fetchDeletedIds(): Promise<string[]> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as DeletedListResult
    return Array.isArray(data.ids) ? data.ids : []
  } catch {
    return []
  }
}

export async function deleteSolicitud(
  id: string,
  password: string,
): Promise<DeletedListResult> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({ id, password, action: 'delete' }),
  })
  const data = (await res.json().catch(() => null)) as DeletedListResult | null
  if (!data) {
    return { ok: false, ids: [], message: 'No se pudo eliminar' }
  }
  if (!res.ok && !data.message) {
    return { ok: false, ids: data.ids || [], message: `Error ${res.status}` }
  }
  return {
    ok: !!data.ok,
    ids: Array.isArray(data.ids) ? data.ids : [],
    message: data.message,
  }
}

export function filterDeleted<T extends { id: string }>(
  records: T[],
  deletedIds: string[],
): T[] {
  if (!deletedIds.length) return records
  const set = new Set(deletedIds)
  return records.filter((r) => !set.has(r.id))
}
