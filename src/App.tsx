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

  // Auto-refresh cada 60s para nuevas solicitudes
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
    const byEstado: Record<string, number> = {}
    const withPhoto = records.filter((r) => (r.fotoExterior?.length || 0) > 0).length
    for (const r of records) {
      const f = r.flujoDePersonas || 'Sin dato'
      const e = r.estado || 'Sin estado'
      byFlujo[f] = (byFlujo[f] || 0) + 1
      byEstado[e] = (byEstado[e] || 0) + 1
    }
    return { byFlujo, byEstado, withPhoto }
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
    <div className="app">
      <div className="bg-mesh" aria-hidden />
      <header className="hero">
        <div className="hero-brand">
          <img src={`${import.meta.env.BASE_URL}logo-yaavs-blanco.png`} alt="YAAVS" className="brand-logo" />
          <div>
            <p className="brand-kicker">YAAVS · Portal BTL 2026</p>
            <h1>Solicitudes BTL</h1>
            <p className="hero-sub">
              Consulta, filtra y descarga las solicitudes que van llegando en tiempo real.
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <div className="stat-pill" aria-live="polite">
            <span className="stat-dot" />
            <strong>{total}</strong>
            <span>en vivo</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void load(filters)}
          >
            Actualizar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
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
            className="btn btn-primary"
            disabled={!sorted.length}
            onClick={exportAll}
          >
            Descargar Excel
          </button>
        </div>
      </header>

      <section className="insight-row" aria-label="Resumen">
        <article className="insight">
          <span>Total filtrado</span>
          <strong>{records.length}</strong>
        </article>
        <article className="insight">
          <span>Con foto</span>
          <strong>{stats.withPhoto}</strong>
        </article>
        {Object.entries(stats.byFlujo)
          .slice(0, 3)
          .map(([k, v]) => (
            <article key={k} className="insight">
              <span>Flujo {k}</span>
              <strong>{v}</strong>
            </article>
          ))}
        {updatedAt && (
          <article className="insight insight-muted">
            <span>Última sync</span>
            <strong>
              {updatedAt.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
          </article>
        )}
      </section>

      <section className="filters" aria-label="Filtros">
        <label className="search">
          <span className="sr-only">Buscar</span>
          <input
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Buscar ejecutivo, YAAVSER, clave o punto de venta…"
          />
        </label>
        <label>
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
        <label>
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
        <label>
          <span>Desde</span>
          <input
            type="date"
            value={filters.fechaFrom}
            onChange={(e) => patch({ fechaFrom: e.target.value })}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            type="date"
            value={filters.fechaTo}
            onChange={(e) => patch({ fechaTo: e.target.value })}
          />
        </label>
        <label>
          <span>Orden</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="fecha-desc">Fecha ↓</option>
            <option value="fecha-asc">Fecha ↑</option>
            <option value="nombre">Nombre</option>
            <option value="estado">Estado</option>
          </select>
        </label>
        <div className="filter-tools">
          <div className="view-toggle" role="group" aria-label="Vista">
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              Lista
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
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

        <ul className={view === 'grid' ? 'grid' : 'list'}>
          {sorted.map((s, i) => (
            <li
              key={s.id}
              className="solicitud"
              style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
            >
              <button
                type="button"
                className="solicitud-hit"
                onClick={() => setSelected(s)}
              >
                <div className="solicitud-media">
                  {s.fotoExterior?.[0]?.url ? (
                    <img src={s.fotoExterior[0].url} alt="" loading="lazy" />
                  ) : (
                    <div className="solicitud-placeholder">Sin foto</div>
                  )}
                  <span className="badge">{s.flujoDePersonas || '—'}</span>
                </div>
                <div className="solicitud-body">
                  <h2>{s.puntoDeVenta || s.nombreYaavser || 'Sin nombre'}</h2>
                  <p>
                    {s.nombreYaavser}
                    {s.claveYaavser ? ` · ${s.claveYaavser}` : ''}
                  </p>
                  <p className="meta">
                    {s.estado}
                    {s.municipioAlcaldia ? ` · ${s.municipioAlcaldia}` : ''}
                  </p>
                  <p className="meta highlight">{formatFecha(s.fechaBtl)}</p>
                  {view === 'list' && (
                    <p className="meta">Ejecutivo: {s.ejecutivoDeVentas || '—'}</p>
                  )}
                </div>
              </button>
              <div className="solicitud-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    downloadSolicitud(s)
                    showToast('Solicitud descargada')
                  }}
                >
                  Descargar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
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
        <span>Datos en vivo desde Zite</span>
      </footer>

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
            <p className="brand-kicker">Detalle de solicitud</p>
            <h2>{s.puntoDeVenta || s.nombreYaavser}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="drawer-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              downloadSolicitud(s)
              onToast('Solicitud descargada')
            }}
          >
            Descargar TXT
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              downloadCsv([s], `solicitud-${s.claveYaavser || s.id}.csv`)
              onToast('CSV listo')
            }}
          >
            CSV / Excel
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void copy(s.telefonoDeContacto, 'Teléfono copiado')}
          >
            Copiar tel.
          </button>
        </div>

        {(s.fotoExterior?.length || 0) > 0 && (
          <section className="block">
            <h3>Foto exterior</h3>
            <div className="thumbs">
              {s.fotoExterior!.map((f, idx) => (
                <div key={f.url} className="thumb">
                  <img src={f.url} alt={f.filename || 'Foto'} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
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
    <section className="block">
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
