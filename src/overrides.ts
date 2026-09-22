import type { Solicitud } from './types'

const STORAGE_KEY = 'portal-btl-address-overrides-v1'
export const ADDRESS_EDIT_PASSWORD = 'orlando01'

/** Contraseñas válidas para eliminar / papelera (Orlando + Noemí). */
export const DELETE_PASSWORDS = ['orlando01', 'Noemi2026'] as const

export function isDeletePassword(password: string): boolean {
  const normalized = password.trim()
  return (DELETE_PASSWORDS as readonly string[]).includes(normalized)
}

export type AddressOverride = {
  puntoDeVenta?: string
  estado?: string
  municipioAlcaldia?: string
  colonia?: string
  ubicacionGoogleMaps?: string
  tipoDeZona?: string
}

type OverrideMap = Record<string, AddressOverride>

/** Correcciones permanentes (Fillout mal capturado). */
const SEEDED_OVERRIDES: OverrideMap = {
  // Refacciones Elizabeth — venía como Guerrero; es CDMX
  '2aab727e-7cca-4b50-86d4-954b4e1ae3ce': {
    estado: 'Ciudad de México',
  },
}

function readAll(): OverrideMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...SEEDED_OVERRIDES }
    const parsed = JSON.parse(raw) as OverrideMap
    if (!parsed || typeof parsed !== 'object') return { ...SEEDED_OVERRIDES }
    return { ...SEEDED_OVERRIDES, ...parsed }
  } catch {
    return { ...SEEDED_OVERRIDES }
  }
}

function writeAll(map: OverrideMap) {
  // No persistir semillas en localStorage: solo overrides manuales
  const manual: OverrideMap = { ...map }
  for (const id of Object.keys(SEEDED_OVERRIDES)) {
    const seed = SEEDED_OVERRIDES[id]
    const cur = manual[id]
    if (
      cur &&
      cur.estado === seed.estado &&
      !cur.puntoDeVenta &&
      !cur.municipioAlcaldia &&
      !cur.colonia &&
      !cur.ubicacionGoogleMaps &&
      !cur.tipoDeZona
    ) {
      delete manual[id]
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(manual))
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
    colonia: data.colonia?.trim() || undefined,
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
    colonia: o.colonia ?? s.colonia,
    ubicacionGoogleMaps: o.ubicacionGoogleMaps ?? s.ubicacionGoogleMaps,
    tipoDeZona: o.tipoDeZona ?? s.tipoDeZona,
  }
}

export function applyAddressOverrides(records: Solicitud[]): Solicitud[] {
  return records.map(applyAddressOverride)
}
