import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSolicitudes } from './api'
import {
  downloadCsv,
  downloadFileAsset,
  downloadJson,
  downloadSolicitud,
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
              <h1 className="brand-title">YAAVS</h1>
              <p className="lede">
                Solicitudes en vivo — consulta, filtra y descarga en un clic.
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
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de solicitud"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <p className="eyebrow dark">Detalle</p>
            <h2>{s.puntoDeVenta || s.nombreYaavser}</h2>
          </div>
          <button type="button" className="btn btn-text" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="drawer-actions">
          <button
            type="button"
            className="btn btn-solid dark"
            onClick={() => {
              downloadSolicitud(s)
              onToast('Solicitud descargada')
            }}
          >
            Descargar TXT
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              downloadCsv([s], `solicitud-${s.claveYaavser || s.id}.csv`)
              onToast('CSV listo')
            }}
          >
            CSV / Excel
          </button>
          <button
            type="button"
            className="btn btn-text"
            onClick={() => void copy(s.telefonoDeContacto, 'Teléfono copiado')}
          >
            Copiar tel.
          </button>
        </div>

        {(s.fotoExterior?.length || 0) > 0 && (
          <section className="panel">
            <h3>Foto exterior</h3>
            <div className="thumbs">
              {s.fotoExterior!.map((f, idx) => (
                <div key={f.url} className="thumb">
                  <img src={f.url} alt={f.filename || 'Foto'} />
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() =>
                      void downloadFileAsset(
                        f,
                        `foto-exterior-${s.claveYaavser || idx}.jpg`,
                      ).then(() => onToast('Imagen descargada'))
                    }
                  >
                    Descargar imagen
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <Section title="Información del YAAVSER">
          <Row label="Ejecutivo de Ventas" value={s.ejecutivoDeVentas} />
          <Row label="Nombre YAAVSER" value={s.nombreYaavser} />
          <Row label="Clave YAAVSER" value={s.claveYaavser} />
          <Row label="Teléfono" value={s.telefonoDeContacto} />
          <Row label="Punto de Venta" value={s.puntoDeVenta} />
        </Section>

        <Section title="Ubicación">
          <Row label="Estado" value={s.estado} />
          <Row label="Municipio / Alcaldía" value={s.municipioAlcaldia} />
          <Row label="Tipo de Zona" value={s.tipoDeZona} />
          <Row label="Flujo de Personas" value={s.flujoDePersonas} />
          {s.ubicacionGoogleMaps && (
            <p className="row">
              <span>Google Maps</span>
              <a href={s.ubicacionGoogleMaps} target="_blank" rel="noreferrer">
                Abrir ubicación
              </a>
            </p>
          )}
        </Section>

        <Section title="Servicios y evento">
          <Row label="Servicios" value={(s.serviciosActuales || []).join(', ')} />
          <Row label="Otro servicio" value={s.otroServicio} />
          <Row label="Fecha BTL" value={formatFecha(s.fechaBtl)} />
          <Row label="Hora de inicio" value={s.horaDeInicio} />
          <Row label="Permiso" value={s.permisoConfirmado} />
          <Row label="Medidas" value={s.medidasDelEspacio} />
          <Row label="Materiales" value={(s.materialesRequeridos || []).join(', ')} />
          <Row
            label="Promocionales"
            value={(s.entregaDePromocionales || []).join(', ')}
          />
          <Row label="Aportación" value={s.aportacionDelYaavser} />
          <Row label="Detalle aportación" value={s.detalleDeAportacion} />
          <Row label="Observaciones" value={s.observaciones} />
        </Section>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="rows">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <p className="row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}
