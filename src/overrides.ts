import type { Solicitud } from './types'

const STORAGE_KEY = 'portal-btl-address-overrides-v1'
export const ADDRESS_EDIT_PASSWORD = 'orlando01'

export type AddressOverride = {
  puntoDeVenta?: string
  estado?: string
  municipioAlcaldia?: string
  ubicacionGoogleMaps?: string
  tipoDeZona?: string
}

type OverrideMap = Record<string, AddressOverride>

function readAll(): OverrideMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as OverrideMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: OverrideMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getAddressOverride(id: string): AddressOverride {
  return readAll()[id] || {}
}

export function saveAddressOverride(id: string, data: AddressOverride) {
  const all = readAll()
  all[id] = {
    puntoDeVenta: data.puntoDeVenta?.trim() || undefined,
    estado: data.estado?.trim() || undefined,
    municipioAlcaldia: data.municipioAlcaldia?.trim() || undefined,
    ubicacionGoogleMaps: data.ubicacionGoogleMaps?.trim() || undefined,
    tipoDeZona: data.tipoDeZona?.trim() || undefined,
  }
  writeAll(all)
}

export function applyAddressOverride(s: Solicitud): Solicitud {
  const o = getAddressOverride(s.id)
  if (!o || !Object.keys(o).length) return s
  return {
    ...s,
    puntoDeVenta: o.puntoDeVenta ?? s.puntoDeVenta,
    estado: o.estado ?? s.estado,
    municipioAlcaldia: o.municipioAlcaldia ?? s.municipioAlcaldia,
    ubicacionGoogleMaps: o.ubicacionGoogleMaps ?? s.ubicacionGoogleMaps,
    tipoDeZona: o.tipoDeZona ?? s.tipoDeZona,
  }
}

export function applyAddressOverrides(records: Solicitud[]): Solicitud[] {
  return records.map(applyAddressOverride)
}
