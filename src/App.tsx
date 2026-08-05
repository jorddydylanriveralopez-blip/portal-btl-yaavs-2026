import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSolicitudes } from './api'
import {
  downloadCsv,
  downloadFileAsset,
  downloadJson,
  downloadSolicitud,
  downloadSolicitudPdf,
  formatFecha,
} from './export'
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
  const [records, setRecords] = useState<Solicitud[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Solicitud | null>(null)
  const [sort, setSort] = useState<SortKey>('fecha-desc')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const load = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSolicitudes(f)
      setRecords(data.records || [])
      setTotal(data.total ?? data.records?.length ?? 0)
      setUpdatedAt(new Date())
    } catch (e) {
      setRecords([])
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
    const list = [...records]
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
  }, [records, sort])

  const stats = useMemo(() => {
    const byFlujo: Record<string, number> = {}
    const withPhoto = records.filter((r) => (r.fotoExterior?.length || 0) > 0).length
    for (const r of records) {
      const f = r.flujoDePersonas || 'Sin dato'
      byFlujo[f] = (byFlujo[f] || 0) + 1
    }
    return { byFlujo, withPhoto }
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
            <span>Filtradas</span>
            <strong>{records.length}</strong>
          </div>
          <div className="metric">
            <span>Con foto</span>
            <strong>{stats.withPhoto}</strong>
          </div>
          {Object.entries(stats.byFlujo)
            .slice(0, 3)
            .map(([k, v]) => (
              <div key={k} className="metric">
                <span>Flujo {k}</span>
                <strong>{v}</strong>
              </div>
            ))}
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

          <ul className={view === 'grid' ? 'board board-grid' : 'board board-list'}>
            {sorted.map((s, i) => (
              <li
                key={s.id}
                className="item"
                style={{ animationDelay: `${Math.min(i, 14) * 40}ms` }}
              >
                <button
                  type="button"
                  className="item-hit"
                  onClick={() => setSelected(s)}
                >
                  <div className="item-media">
                    {s.fotoExterior?.[0]?.url ? (
                      <img src={s.fotoExterior[0].url} alt="" loading="lazy" />
                    ) : (
                      <div className="item-placeholder">Sin foto</div>
                    )}
                    <span className={flujoClass(s.flujoDePersonas)}>
                      {s.flujoDePersonas || '—'}
                    </span>
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
                      showToast('Solicitud descargada')
                    }}
                  >
                    Descargar
                  </button>
                  <button
                    type="button"
                    className="btn btn-text"
                    onClick={() => {
                      downloadCsv([s], `solicitud-${s.claveYaavser || s.id}.csv`)
                      showToast('CSV listo')
                    }}
                  >
                    CSV
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </main>

        <footer className="foot">
          <span>Portal BTL YAAVS 2026</span>
          <span>Datos en vivo</span>
        </footer>
      </div>

      {selected && (
        <Detail
          solicitud={selected}
          onClose={() => setSelected(null)}
          onToast={showToast}
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

function Detail({
  solicitud: s,
  onClose,
  onToast,
}: {
  solicitud: Solicitud
  onClose: () => void
  onToast: (msg: string) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async (text?: string, label = 'Copiado') => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      onToast(label)
    } catch {
      onToast('No se pudo copiar')
    }
  }

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
          {s.fotoExterior?.[0]?.url ? (
            <img src={s.fotoExterior[0].url} alt="" />
          ) : (
            <div className="modal-hero-empty">Sin foto exterior</div>
          )}
          <div className="modal-hero-veil" />
          <div className="modal-hero-top">
            <span className={flujoClass(s.flujoDePersonas)}>
              {s.flujoDePersonas || 'Flujo'}
            </span>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="modal-hero-copy">
            <p className="eyebrow">Solicitud BTL</p>
            <h2>{s.puntoDeVenta || s.nombreYaavser}</h2>
            <p>
              {formatFecha(s.fechaBtl)}
              {s.claveYaavser ? ` · ${s.claveYaavser}` : ''}
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
            {s.estado && <span className="chip">{s.estado}</span>}
            {s.municipioAlcaldia && <span className="chip">{s.municipioAlcaldia}</span>}
            {s.tipoDeZona && <span className="chip">{s.tipoDeZona}</span>}
            {s.permisoConfirmado && <span className="chip">{s.permisoConfirmado}</span>}
          </div>

          {(s.fotoExterior?.length || 0) > 1 && (
            <section className="panel">
              <h3>Más fotos</h3>
              <div className="thumbs thumbs-row">
                {s.fotoExterior!.slice(1).map((f, idx) => (
                  <div key={f.url} className="thumb">
                    <img src={f.url} alt={f.filename || 'Foto'} />
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() =>
                        void downloadFileAsset(
                          f,
                          `foto-exterior-${s.claveYaavser || idx + 1}.jpg`,
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

          {(s.fotoExterior?.length || 0) === 1 && (
            <div className="modal-photo-action">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() =>
                  void downloadFileAsset(
                    s.fotoExterior![0],
                    `foto-exterior-${s.claveYaavser || '1'}.jpg`,
                  ).then(() => onToast('Imagen descargada'))
                }
              >
                Descargar foto exterior
              </button>
            </div>
          )}

          <Section title="YAAVSER">
            <div className="fact-grid">
              <Fact label="Ejecutivo" value={s.ejecutivoDeVentas} />
              <Fact label="Nombre" value={s.nombreYaavser} />
              <Fact label="Clave" value={s.claveYaavser} />
              <Fact label="Teléfono" value={s.telefonoDeContacto} />
              <Fact label="Punto de venta" value={s.puntoDeVenta} wide />
            </div>
          </Section>

          <Section title="Ubicación">
            <div className="fact-grid">
              <Fact label="Estado" value={s.estado} />
              <Fact label="Municipio / Alcaldía" value={s.municipioAlcaldia} />
              <Fact label="Tipo de zona" value={s.tipoDeZona} />
              <Fact label="Flujo" value={s.flujoDePersonas} />
            </div>
            {s.ubicacionGoogleMaps && (
              <p className="maps-link">
                <a href={s.ubicacionGoogleMaps} target="_blank" rel="noreferrer">
                  Abrir en Google Maps →
                </a>
              </p>
            )}
          </Section>

          <Section title="Evento BTL">
            <div className="fact-grid">
              <Fact label="Fecha" value={formatFecha(s.fechaBtl)} />
              <Fact label="Hora de inicio" value={s.horaDeInicio} />
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
