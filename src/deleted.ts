export type TrashItem = {
  id: string
  deletedAt?: string | null
  puntoDeVenta?: string | null
  nombreYaavser?: string | null
  claveYaavser?: string | null
  estado?: string | null
  municipioAlcaldia?: string | null
  fechaBtl?: string | null
  flujoDePersonas?: string | null
  fotoUrl?: string | null
}

export type DeletedStoreResult = {
  ok: boolean
  ids: string[]
  items: TrashItem[]
  message?: string
}

export type SolicitudSnapshot = {
  puntoDeVenta?: string
  nombreYaavser?: string
  claveYaavser?: string
  estado?: string
  municipioAlcaldia?: string
  fechaBtl?: string
  flujoDePersonas?: string
  fotoUrl?: string
}

function endpoint(path = 'delete-solicitud.php'): string {
  if (import.meta.env.DEV) return `/${path}`
  try {
    return new URL(path, window.location.href).href
  } catch {
    return path
  }
}

export async function fetchDeletedStore(): Promise<DeletedStoreResult> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, ids: [], items: [] }
    const data = (await res.json()) as DeletedStoreResult
    return {
      ok: !!data.ok,
      ids: Array.isArray(data.ids) ? data.ids : [],
      items: Array.isArray(data.items) ? data.items : [],
    }
  } catch {
    return { ok: false, ids: [], items: [] }
  }
}

/** @deprecated use fetchDeletedStore */
export async function fetchDeletedIds(): Promise<string[]> {
  const store = await fetchDeletedStore()
  return store.ids
}

async function postAction(
  body: Record<string, unknown>,
): Promise<DeletedStoreResult> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as DeletedStoreResult | null
  if (!data) {
    return { ok: false, ids: [], items: [], message: 'No se pudo completar la acción' }
  }
  if (!res.ok && !data.message) {
    return {
      ok: false,
      ids: data.ids || [],
      items: data.items || [],
      message: `Error ${res.status}`,
    }
  }
  return {
    ok: !!data.ok,
    ids: Array.isArray(data.ids) ? data.ids : [],
    items: Array.isArray(data.items) ? data.items : [],
    message: data.message,
  }
}

export async function deleteSolicitud(
  id: string,
  password: string,
  snapshot?: SolicitudSnapshot,
): Promise<DeletedStoreResult> {
  return postAction({ id, password, action: 'delete', snapshot })
}

export async function restoreSolicitud(
  id: string,
  password: string,
): Promise<DeletedStoreResult> {
  return postAction({ id, password, action: 'restore' })
}

export async function purgeFromTrash(
  id: string,
  password: string,
): Promise<DeletedStoreResult> {
  return postAction({ id, password, action: 'purge' })
}

export async function emptyTrash(password: string): Promise<DeletedStoreResult> {
  return postAction({ id: '_', password, action: 'purge_all' })
}

export function filterDeleted<T extends { id: string }>(
  records: T[],
  deletedIds: string[],
): T[] {
  if (!deletedIds.length) return records
  const set = new Set(deletedIds)
  return records.filter((r) => !set.has(r.id))
}

export function snapshotFromSolicitud(s: {
  id: string
  puntoDeVenta?: string
  nombreYaavser?: string
  claveYaavser?: string
  estado?: string
  municipioAlcaldia?: string
  fechaBtl?: string
  flujoDePersonas?: string
  fotoExterior?: { url?: string }[]
}): SolicitudSnapshot {
  return {
    puntoDeVenta: s.puntoDeVenta,
    nombreYaavser: s.nombreYaavser,
    claveYaavser: s.claveYaavser,
    estado: s.estado,
    municipioAlcaldia: s.municipioAlcaldia,
    fechaBtl: s.fechaBtl,
    flujoDePersonas: s.flujoDePersonas,
    fotoUrl: s.fotoExterior?.[0]?.url,
  }
}
