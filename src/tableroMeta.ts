export type TableroEstatusManual =
  | 'REALIZADA'
  | 'PROGRAMADA'
  | 'CANCELADA'
  | 'REAGENDADA'

export type TableroMetaRow = {
  estatus?: TableroEstatusManual
  fechaReagendada?: string
  comentario?: string
}

export type TableroMetaMap = Record<string, TableroMetaRow>

export type TableroMetaResult = {
  ok: boolean
  rows: TableroMetaMap
  message?: string
}

function endpoint(path = 'tablero-meta.php'): string {
  if (import.meta.env.DEV) return `/${path}`
  try {
    return new URL(path, window.location.href).href
  } catch {
    return path
  }
}

export async function fetchTableroMeta(): Promise<TableroMetaMap> {
  try {
    const res = await fetch(endpoint(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return {}
    const data = (await res.json()) as TableroMetaResult
    if (!data.rows || typeof data.rows !== 'object' || Array.isArray(data.rows)) return {}
    return data.rows
  } catch {
    return {}
  }
}

export async function saveTableroMeta(
  id: string,
  patch: TableroMetaRow,
): Promise<TableroMetaResult> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({ id, ...patch }),
  })
  const data = (await res.json().catch(() => null)) as TableroMetaResult | null
  if (!data) {
    return { ok: false, rows: {}, message: 'No se pudo guardar' }
  }
  const rows =
    data.rows && typeof data.rows === 'object' && !Array.isArray(data.rows) ? data.rows : {}
  return {
    ok: !!data.ok,
    rows,
    message: data.message,
  }
}
