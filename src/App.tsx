import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSolicitudes } from './api'
import {
  downloadCsv,
  downloadFileAsset,
  downloadJson,
  downloadSolicitud,
  downloadSolicitudPdf,
  formatFecha,
  formatHora,
} from './export'
import {
  ADDRESS_EDIT_PASSWORD,
  applyAddressOverride,
  applyAddressOverrides,
  getAddressOverride,
  saveAddressOverride,
  type AddressOverride,
} from './overrides'
import type { Filters, Solicitud } from './types'
import './App.css'

const EMPTY_FILTERS: Filters = {
  search: '',
  estado: '',
  flujo: '',
  fechaFrom: '',
  fechaTo: '',
}

type SortKey = 'fecha-desc' | 'fecha-asc' | 'nombre' | 'estado'
type StatusFilter = 'todas' | 'activas' | 'terminadas'

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fechaKey(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/** Terminada si la fecha BTL ya pasó (es anterior a hoy). */
function isTerminada(s: Solicitud): boolean {
  const d = fechaKey(s.fechaBtl)
  return !!d && d < todayKey()
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function flujoClass(flujo?: string) {
  const f = (flujo || '').toLowerCase()
  if (f.includes('alto')) return 'badge badge-alto'
  if (f.includes('bajo')) return 'badge badge-bajo'
  if (f.includes('medio')) return 'badge badge-medio'
  return 'badge'
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const debounced = useDebounced(filters, 350)
  const [rawRecords, setRawRecords] = useState<Solicitud[]>([])
  const [overrideTick, setOverrideTick] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('fecha-desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const records = useMemo(
    () => applyAddressOverrides(rawRecords),
    [rawRecords, overrideTick],
  )
  const selected = useMemo(
    () => (selectedId ? records.find((r) => r.id === selectedId) || null : null),
    [records, selectedId],
  )

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const load = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSolicitudes(f)
      setRawRecords(data.records || [])
      setTotal(data.total ?? data.records?.length ?? 0)
      setUpdatedAt(new Date())
    } catch (e) {
      setRawRecords([])
      setTotal(0)
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las solicitudes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(debounced)
  }, [debounced, load])

  useEffect(() => {
    const id = window.setInterval(() => {
      void load(filters)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [filters, load])

  const sorted = useMemo(() => {
    const list = [...records].filter((s) => {
      if (statusFilter === 'terminadas') return isTerminada(s)
      if (statusFilter === 'activas') return !isTerminada(s)
      return true
    })
    list.sort((a, b) => {
      if (sort === 'nombre') {
        return (a.puntoDeVenta || a.nombreYaavser || '').localeCompare(
          b.puntoDeVenta || b.nombreYaavser || '',
          'es',
        )
      }
      if (sort === 'estado') {
        return (a.estado || '').localeCompare(b.estado || '', 'es')
      }
      const da = a.fechaBtl || ''
      const db = b.fechaBtl || ''
      return sort === 'fecha-asc' ? da.localeCompare(db) : db.localeCompare(da)
    })
    return list
  }, [records, sort, statusFilter])

  const stats = useMemo(() => {
    const byFlujo: Record<string, number> = {}
    const withPhoto = records.filter((r) => (r.fotoExterior?.length || 0) > 0).length
    const terminadas = records.filter(isTerminada).length
    const activas = records.length - terminadas
    for (const r of records) {
      const f = r.flujoDePersonas || 'Sin dato'
      byFlujo[f] = (byFlujo[f] || 0) + 1
    }
    return { byFlujo, withPhoto, terminadas, activas }
  }, [records])

  const estados = useMemo(() => {
    const set = new Set(records.map((r) => r.estado).filter(Boolean) as string[])
    ;['Ciudad de México', 'Estado de México'].forEach((e) => set.add(e))
    return [...set].sort()
  }, [records])

  const flujos = useMemo(() => {
    const base = ['Alto', 'Medio', 'Bajo']
    const extra = records
      .map((r) => r.flujoDePersonas)
      .filter((f): f is string => !!f && !base.includes(f))
    return [...base, ...new Set(extra)]
  }, [records])

  const { activasList, terminadasList } = useMemo(() => {
    const activasList = sorted.filter((s) => !isTerminada(s))
    const terminadasList = sorted.filter(isTerminada)
    return { activasList, terminadasList }
  }, [sorted])

  const patch = (partial: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...partial }))

  const exportAll = () => {
    if (!sorted.length) return
    downloadCsv(sorted)
    showToast(`CSV listo · ${sorted.length} solicitudes`)
  }

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden>
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="grain" />
      </div>

      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand-block">
            <img
              src={`${import.meta.env.BASE_URL}logo-yaavs-blanco.png`}
              alt="YAAVS"
              className="brand-mark"
            />
            <div className="brand-copy">
              <p className="eyebrow">Portal BTL 2026</p>
              <h1 className="brand-title">Solicitudes BTL</h1>
              <p className="lede">
                Consulta, filtra y descarga las solicitudes que van llegando.
              </p>
            </div>
          </div>

          <div className="masthead-actions">
            <div className="live-chip" aria-live="polite">
              <span className="live-dot" />
              <strong>{total}</strong>
              <span>en vivo</span>
            </div>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={loading}
              onClick={() => void load(filters)}
            >
              Actualizar
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!sorted.length}
              onClick={() => {
                downloadJson(sorted)
                showToast('JSON descargado')
              }}
            >
              JSON
            </button>
            <button
              type="button"
              className="btn btn-solid"
              disabled={!sorted.length}
              onClick={exportAll}
            >
              Descargar Excel
            </button>
          </div>
        </div>
      </header>

      <div className="page">
        <section className="metrics" aria-label="Resumen">
          <div className="metric">
            <span>Total</span>
            <strong>{records.length}</strong>
          </div>
          <div className="metric">
            <span>Activas</span>
            <strong>{stats.activas}</strong>
          </div>
          <div className="metric">
            <span>Terminadas</span>
            <strong>{stats.terminadas}</strong>
          </div>
          <div className="metric">
            <span>Con foto</span>
            <strong>{stats.withPhoto}</strong>
          </div>
          <div className="metric">
            <span>Viendo</span>
            <strong>{sorted.length}</strong>
          </div>
          {updatedAt && (
            <div className="metric metric-time">
              <span>Última sync</span>
              <strong>
                {updatedAt.toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>
          )}
        </section>

        <section className="toolbar" aria-label="Filtros">
          <label className="field field-search">
            <span className="sr-only">Buscar</span>
            <input
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Buscar ejecutivo, YAAVSER, clave o punto de venta…"
            />
          </label>
          <label className="field">
            <span>Estado</span>
            <select
              value={filters.estado}
              onChange={(e) => patch({ estado: e.target.value })}
            >
              <option value="">Todos</option>
              {estados.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Flujo</span>
            <select
              value={filters.flujo}
              onChange={(e) => patch({ flujo: e.target.value })}
            >
              <option value="">Todos</option>
              {flujos.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Desde</span>
            <input
              type="date"
              value={filters.fechaFrom}
              onChange={(e) => patch({ fechaFrom: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input
              type="date"
              value={filters.fechaTo}
              onChange={(e) => patch({ fechaTo: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Estatus</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="todas">Todas</option>
              <option value="activas">Activas</option>
              <option value="terminadas">Terminadas</option>
            </select>
          </label>
          <label className="field">
            <span>Orden</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="fecha-desc">Fecha ↓</option>
              <option value="fecha-asc">Fecha ↑</option>
              <option value="nombre">Nombre</option>
              <option value="estado">Estado</option>
            </select>
          </label>
          <div className="toolbar-end">
            <div className="seg" role="group" aria-label="Vista">
              <button
                type="button"
                className={view === 'grid' ? 'on' : ''}
                onClick={() => setView('grid')}
              >
                Grid
              </button>
              <button
                type="button"
                className={view === 'list' ? 'on' : ''}
                onClick={() => setView('list')}
              >
                Lista
              </button>
            </div>
            <button
              type="button"
              className="btn btn-text"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Limpiar
            </button>
          </div>
        </section>

        <main className="main">
          {loading && <p className="status">Cargando solicitudes…</p>}
          {error && (
            <p className="status error">
              {error}.{' '}
              <button type="button" className="linkish" onClick={() => void load(filters)}>
                Reintentar
              </button>
            </p>
          )}
          {!loading && !error && sorted.length === 0 && (
            <div className="empty">
              <h2>Sin resultados</h2>
              <p>No hay solicitudes con estos filtros. Prueba limpiar o actualizar.</p>
            </div>
          )}

          {activasList.length > 0 && (
            <section className="group group-active">
              {statusFilter === 'todas' && terminadasList.length > 0 && (
                <header className="group-head">
                  <h2>Activas</h2>
                  <span>{activasList.length}</span>
                </header>
              )}
              <ul className={view === 'grid' ? 'board board-grid' : 'board board-list'}>
                {activasList.map((s, i) => (
                  <SolicitudCard
                    key={s.id}
                    s={s}
                    i={i}
                    view={view}
                    onOpen={() => setSelectedId(s.id)}
                    onToast={showToast}
                  />
                ))}
              </ul>
            </section>
          )}

          {terminadasList.length > 0 && (
            <section className="group group-done">
              <header className="group-head group-head-done">
                <h2>Terminadas</h2>
                <span>{terminadasList.length}</span>
              </header>
              <ul className={view === 'grid' ? 'board board-grid' : 'board board-list'}>
                {terminadasList.map((s, i) => (
                  <SolicitudCard
                    key={s.id}
                    s={s}
                    i={i}
                    view={view}
                    onOpen={() => setSelectedId(s.id)}
                    onToast={showToast}
                  />
                ))}
              </ul>
            </section>
          )}
        </main>

        <footer className="foot">
          <span>Portal BTL YAAVS 2026</span>
          <span>Datos en vivo</span>
        </footer>
      </div>

      {selected && (
        <Detail
          solicitud={selected}
          onClose={() => setSelectedId(null)}
          onToast={showToast}
          onAddressSaved={() => setOverrideTick((n) => n + 1)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function SolicitudCard({
  s,
  i,
  view,
  onOpen,
  onToast,
}: {
  s: Solicitud
  i: number
  view: 'grid' | 'list'
  onOpen: () => void
  onToast: (msg: string) => void
}) {
  const done = isTerminada(s)
  return (
    <li
      className={`item${done ? ' item-done' : ''}`}
      style={{ animationDelay: `${Math.min(i, 14) * 40}ms` }}
    >
      <button type="button" className="item-hit" onClick={onOpen}>
        <div className="item-media">
          {s.fotoExterior?.[0]?.url ? (
            <img src={s.fotoExterior[0].url} alt="" loading="lazy" />
          ) : (
            <div className="item-placeholder">Sin foto</div>
          )}
          <div className="badge-stack">
            {done && <span className="badge badge-done">Terminada</span>}
            <span className={flujoClass(s.flujoDePersonas)}>
              {s.flujoDePersonas || '—'}
            </span>
          </div>
        </div>
        <div className="item-body">
          <h2>{s.puntoDeVenta || s.nombreYaavser || 'Sin nombre'}</h2>
          <p className="item-line">
            {s.nombreYaavser}
            {s.claveYaavser ? ` · ${s.claveYaavser}` : ''}
          </p>
          <p className="item-meta">
            {s.estado}
            {s.municipioAlcaldia ? ` · ${s.municipioAlcaldia}` : ''}
          </p>
          <p className="item-date">{formatFecha(s.fechaBtl)}</p>
          {view === 'list' && (
            <p className="item-meta">Ejecutivo: {s.ejecutivoDeVentas || '—'}</p>
          )}
        </div>
      </button>
      <div className="item-actions">
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => {
            downloadSolicitud(s)
            onToast('Solicitud descargada')
          }}
        >
          Descargar
        </button>
        <button
          type="button"
          className="btn btn-text"
          onClick={() => {
            downloadCsv([s], `solicitud-${s.claveYaavser || s.id}.csv`)
            onToast('CSV listo')
          }}
        >
          CSV
        </button>
      </div>
    </li>
  )
}

function Detail({
  solicitud: s,
  onClose,
  onToast,
  onAddressSaved,
}: {
  solicitud: Solicitud
  onClose: () => void
  onToast: (msg: string) => void
  onAddressSaved: () => void
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [editingAddress, setEditingAddress] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [askPassword, setAskPassword] = useState(false)
  const [draft, setDraft] = useState<AddressOverride>({})

  const fotos = s.fotoExterior || []
  const evidencias = s.evidenciaDePermiso || []
  const gallery = [...fotos, ...evidencias]

  useEffect(() => {
    setEditingAddress(false)
    setAskPassword(false)
    setPassword('')
    setPasswordError('')
    const o = getAddressOverride(s.id)
    setDraft({
      puntoDeVenta: o.puntoDeVenta ?? s.puntoDeVenta ?? '',
      estado: o.estado ?? s.estado ?? '',
      municipioAlcaldia: o.municipioAlcaldia ?? s.municipioAlcaldia ?? '',
      ubicacionGoogleMaps: o.ubicacionGoogleMaps ?? s.ubicacionGoogleMaps ?? '',
      tipoDeZona: o.tipoDeZona ?? s.tipoDeZona ?? '',
    })
  }, [s])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox != null) setLightbox(null)
        else onClose()
      }
      if (lightbox == null || gallery.length < 2) return
      if (e.key === 'ArrowRight') setLightbox((i) => ((i ?? 0) + 1) % gallery.length)
      if (e.key === 'ArrowLeft')
        setLightbox((i) => ((i ?? 0) - 1 + gallery.length) % gallery.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightbox, gallery.length])

  const copy = async (text?: string, label = 'Copiado') => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      onToast(label)
    } catch {
      onToast('No se pudo copiar')
    }
  }

  const unlockEdit = () => {
    if (password === ADDRESS_EDIT_PASSWORD) {
      setAskPassword(false)
      setEditingAddress(true)
      setPassword('')
      setPasswordError('')
      onToast('Edición desbloqueada')
    } else {
      setPasswordError('Contraseña incorrecta')
    }
  }

  const saveAddress = () => {
    saveAddressOverride(s.id, draft)
    onAddressSaved()
    setEditingAddress(false)
    onToast('Dirección actualizada')
  }

  const downloadAllImages = async () => {
    if (!gallery.length) return
    for (const [idx, f] of gallery.entries()) {
      await downloadFileAsset(f, `solicitud-${s.claveYaavser || s.id}-${idx + 1}.jpg`)
    }
    onToast(gallery.length > 1 ? `${gallery.length} imágenes descargadas` : 'Imagen descargada')
  }

  const display = applyAddressOverride(s)

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <aside
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de solicitud"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hero">
          {fotos[0]?.url ? (
            <button
              type="button"
              className="modal-hero-img"
              onClick={() => setLightbox(0)}
              aria-label="Ampliar foto"
            >
              <img src={fotos[0].url} alt="" />
            </button>
          ) : (
            <div className="modal-hero-empty">Sin foto exterior</div>
          )}
          <div className="modal-hero-veil" />
          <div className="modal-hero-top">
            <div className="badge-stack">
              {isTerminada(s) && <span className="badge badge-done">Terminada</span>}
              <span className={flujoClass(s.flujoDePersonas)}>
                {s.flujoDePersonas || 'Flujo'}
              </span>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="modal-hero-copy">
            <p className="eyebrow">Solicitud BTL</p>
            <h2>{display.puntoDeVenta || display.nombreYaavser}</h2>
            <p>
              {formatFecha(display.fechaBtl)}
              {display.claveYaavser ? ` · ${display.claveYaavser}` : ''}
            </p>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-solid dark"
              onClick={() => {
                void downloadSolicitudPdf(s).then(() => onToast('PDF descargado'))
              }}
            >
              Descargar PDF
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                downloadCsv([s], `solicitud-${s.claveYaavser || s.id}.csv`)
                onToast('CSV listo')
              }}
            >
              CSV
            </button>
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                downloadSolicitud(s)
                onToast('TXT descargado')
              }}
            >
              TXT
            </button>
            <button
              type="button"
              className="btn btn-text"
              onClick={() => void copy(s.telefonoDeContacto, 'Teléfono copiado')}
            >
              Copiar tel.
            </button>
          </div>

          <div className="chip-row">
            {isTerminada(display) && <span className="chip chip-done">Terminada</span>}
            {!isTerminada(display) && <span className="chip chip-active">Activa</span>}
            {display.estado && <span className="chip">{display.estado}</span>}
            {display.municipioAlcaldia && (
              <span className="chip">{display.municipioAlcaldia}</span>
            )}
            {display.tipoDeZona && <span className="chip">{display.tipoDeZona}</span>}
            {s.permisoConfirmado && <span className="chip">{s.permisoConfirmado}</span>}
          </div>

          {gallery.length > 0 && (
            <section className="panel gallery-panel">
              <div className="gallery-head">
                <h3>Imágenes</h3>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => void downloadAllImages()}
                >
                  Descargar {gallery.length > 1 ? 'todas' : 'imagen'}
                </button>
              </div>
              <div className="gallery-grid">
                {gallery.map((f, idx) => (
                  <div key={`${f.url}-${idx}`} className="gallery-item">
                    <button
                      type="button"
                      className="gallery-thumb"
                      onClick={() => setLightbox(idx)}
                      aria-label={`Ampliar imagen ${idx + 1}`}
                    >
                      <img src={f.url} alt={f.filename || `Imagen ${idx + 1}`} />
                      <span className="gallery-zoom">Ampliar</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() =>
                        void downloadFileAsset(
                          f,
                          `solicitud-${s.claveYaavser || s.id}-${idx + 1}.jpg`,
                        ).then(() => onToast('Imagen descargada'))
                      }
                    >
                      Descargar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Section title="YAAVSER">
            <div className="fact-grid">
              <Fact label="Ejecutivo" value={s.ejecutivoDeVentas} />
              <Fact label="Nombre" value={s.nombreYaavser} />
              <Fact label="Clave" value={s.claveYaavser} />
              <Fact label="Teléfono" value={s.telefonoDeContacto} />
              <Fact label="Punto de venta" value={display.puntoDeVenta} wide />
            </div>
          </Section>

          <Section title="Ubicación">
            {!editingAddress && !askPassword && (
              <>
                <div className="fact-grid">
                  <Fact label="Estado" value={display.estado} />
                  <Fact label="Municipio / Alcaldía" value={display.municipioAlcaldia} />
                  <Fact label="Tipo de zona" value={display.tipoDeZona} />
                  <Fact label="Flujo" value={s.flujoDePersonas} />
                </div>
                {display.ubicacionGoogleMaps && (
                  <p className="maps-link">
                    <a href={display.ubicacionGoogleMaps} target="_blank" rel="noreferrer">
                      Abrir en Google Maps →
                    </a>
                  </p>
                )}
                <div className="address-edit-trigger">
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => {
                      setAskPassword(true)
                      setPassword('')
                      setPasswordError('')
                    }}
                  >
                    Editar dirección
                  </button>
                </div>
              </>
            )}

            {askPassword && !editingAddress && (
              <div className="password-box">
                <p>Ingresa la contraseña para editar la dirección</p>
                <input
                  type="password"
                  value={password}
                  placeholder="Contraseña"
                  autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') unlockEdit()
                  }}
                />
                {passwordError && <p className="password-error">{passwordError}</p>}
                <div className="password-actions">
                  <button type="button" className="btn btn-solid dark" onClick={unlockEdit}>
                    Desbloquear
                  </button>
                  <button
                    type="button"
                    className="btn btn-text"
                    onClick={() => {
                      setAskPassword(false)
                      setPassword('')
                      setPasswordError('')
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {editingAddress && (
              <div className="address-form">
                <label>
                  <span>Punto de venta</span>
                  <input
                    value={draft.puntoDeVenta || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, puntoDeVenta: e.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Estado</span>
                  <input
                    value={draft.estado || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, estado: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Municipio / Alcaldía</span>
                  <input
                    value={draft.municipioAlcaldia || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, municipioAlcaldia: e.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Tipo de zona</span>
                  <input
                    value={draft.tipoDeZona || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, tipoDeZona: e.target.value }))}
                  />
                </label>
                <label className="wide">
                  <span>Google Maps (URL)</span>
                  <input
                    value={draft.ubicacionGoogleMaps || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, ubicacionGoogleMaps: e.target.value }))
                    }
                    placeholder="https://maps.google.com/..."
                  />
                </label>
                <div className="password-actions">
                  <button type="button" className="btn btn-solid dark" onClick={saveAddress}>
                    Guardar dirección
                  </button>
                  <button
                    type="button"
                    className="btn btn-text"
                    onClick={() => setEditingAddress(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Evento BTL">
            <div className="fact-grid">
              <Fact label="Fecha" value={formatFecha(s.fechaBtl)} />
              <Fact label="Hora de inicio" value={formatHora(s.horaDeInicio)} />
              <Fact label="Permiso" value={s.permisoConfirmado} />
              <Fact label="Medidas" value={s.medidasDelEspacio} />
              <Fact
                label="Servicios"
                value={(s.serviciosActuales || []).join(', ')}
                wide
              />
              <Fact label="Otro servicio" value={s.otroServicio} wide />
              <Fact
                label="Materiales"
                value={(s.materialesRequeridos || []).join(', ')}
                wide
              />
              <Fact
                label="Promocionales"
                value={(s.entregaDePromocionales || []).join(', ')}
                wide
              />
              <Fact label="Aportación" value={s.aportacionDelYaavser} />
              <Fact label="Detalle aportación" value={s.detalleDeAportacion} />
              <Fact label="Observaciones" value={s.observaciones} wide />
            </div>
          </Section>
        </div>
      </aside>

      {lightbox != null && gallery[lightbox] && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setLightbox(null)}
            aria-label="Cerrar imagen"
          >
            ✕
          </button>
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox-nav prev"
                aria-label="Anterior"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox((i) => ((i ?? 0) - 1 + gallery.length) % gallery.length)
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox-nav next"
                aria-label="Siguiente"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox((i) => ((i ?? 0) + 1) % gallery.length)
                }}
              >
                ›
              </button>
            </>
          )}
          <img
            src={gallery[lightbox].url}
            alt={gallery[lightbox].filename || 'Imagen ampliada'}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span>
              {lightbox + 1} / {gallery.length}
            </span>
            <button
              type="button"
              className="btn btn-solid"
              onClick={() =>
                void downloadFileAsset(
                  gallery[lightbox],
                  `solicitud-${s.claveYaavser || s.id}-${lightbox + 1}.jpg`,
                ).then(() => onToast('Imagen descargada'))
              }
            >
              Descargar imagen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Fact({
  label,
  value,
  wide,
}: {
  label: string
  value?: string
  wide?: boolean
}) {
  if (!value) return null
  return (
    <div className={wide ? 'fact fact-wide' : 'fact'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
