import { useCallback, useEffect, useMemo, useState } from 'react'
import { REPORTE_TABLERO_XLSX } from './reporteApi'
import { downloadTableroCsv } from './export'
import {
  buildTableroRows,
  colorForEstado,
  countTableroEstados,
  countTableroEstatus,
  countUniqueSucursales,
  type ReporteEntry,
  type TableroEstadoCount,
  type TableroEstatus,
  type TableroRow,
} from './tablero'
import {
  fetchTableroMeta,
  saveTableroMeta,
  type TableroMetaMap,
  type TableroMetaRow,
} from './tableroMeta'
import type { Solicitud } from './types'

type Props = {
  solicitudes: Solicitud[]
  reportes: ReporteEntry[]
  activaIds: string[]
  fechaFrom?: string
  fechaTo?: string
  loading: boolean
  error: string | null
  onRetry: () => void
}

const ESTATUS_OPTIONS: TableroEstatus[] = [
  'REALIZADA',
  'PROGRAMADA',
  'CANCELADA',
  'REAGENDADA',
]

function cell(v: number | string | '') {
  return v === '' || v == null ? '—' : String(v)
}

function estatusClass(estatus: TableroEstatus): string {
  if (estatus === 'PROGRAMADA') return 'tablero-estatus tablero-estatus-programada'
  if (estatus === 'REAGENDADA') return 'tablero-estatus tablero-estatus-reagendada'
  if (estatus === 'CANCELADA') return 'tablero-estatus tablero-estatus-cancelada'
  return 'tablero-estatus tablero-estatus-realizada'
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
) {
  const sweep = end - start
  if (sweep <= 0.001) return ''
  const large = sweep > 180 ? 1 : 0
  const o1 = polar(cx, cy, rOuter, start)
  const o2 = polar(cx, cy, rOuter, end)
  const i1 = polar(cx, cy, rInner, end)
  const i2 = polar(cx, cy, rInner, start)
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ')
}

function DonutChart({
  items,
  emptyLabel,
  ariaLabel,
  filterId,
}: {
  items: { key: string; label: string; value: number; color: string }[]
  emptyLabel: string
  ariaLabel: string
  filterId: string
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const cx = 110
  const cy = 110
  const rOuter = 92
  const rInner = 58

  let angle = 0
  const slices =
    total === 0
      ? []
      : items
          .filter((item) => item.value > 0)
          .map((item) => {
            const sweep = (item.value / total) * 360
            const start = angle
            const end = angle + sweep
            angle = end
            const mid = start + sweep / 2
            const labelR = (rOuter + rInner) / 2
            const labelPos = polar(cx, cy, labelR, mid)
            const pct = Math.round((item.value / total) * 100)
            return {
              ...item,
              path: donutSlice(cx, cy, rOuter, rInner, start, end === 360 ? 359.99 : end),
              labelPos,
              pct,
              showPct: sweep >= 18,
            }
          })

  return (
    <div className="tablero-pie-layout">
      <div className="tablero-pie-visual">
        <svg
          className="tablero-pie-svg"
          viewBox="0 0 220 220"
          role="img"
          aria-label={ariaLabel}
        >
          <defs>
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0b2a44" floodOpacity="0.18" />
            </filter>
            <linearGradient id={`${filterId}-hole`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#eef5fb" />
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cy} r={rOuter + 4} fill="#e8eef4" opacity="0.55" />
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={rOuter} fill="#d5dee8" />
          ) : (
            <g filter={`url(#${filterId})`}>
              {slices.map((slice) => (
                <path
                  key={slice.key}
                  className="tablero-pie-slice"
                  d={slice.path}
                  fill={slice.color}
                />
              ))}
            </g>
          )}
          <circle cx={cx} cy={cy} r={rInner} fill={`url(#${filterId}-hole)`} />
          {slices.map(
            (slice) =>
              slice.showPct && (
                <text
                  key={`${slice.key}-pct`}
                  x={slice.labelPos.x}
                  y={slice.labelPos.y}
                  className="tablero-pie-pct"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {slice.pct}%
                </text>
              ),
          )}
          <text x={cx} y={cy - 10} className="tablero-pie-total-label" textAnchor="middle">
            Total
          </text>
          <text x={cx} y={cy + 18} className="tablero-pie-total-value" textAnchor="middle">
            {total}
          </text>
        </svg>
      </div>
      <ul className="tablero-pie-legend">
        {items.length === 0 || total === 0 ? (
          <li className="tablero-pie-legend-item">
            <div className="tablero-pie-legend-copy">
              <span>{emptyLabel}</span>
              <strong>0</strong>
            </div>
          </li>
        ) : (
          items.map((item) => {
            const pct = total ? Math.round((item.value / total) * 100) : 0
            return (
              <li key={item.key} className="tablero-pie-legend-item">
                <span className="tablero-pie-swatch" style={{ background: item.color }} />
                <div className="tablero-pie-legend-copy">
                  <span>{item.label}</span>
                  <strong>
                    {item.value}
                    <em>{pct}%</em>
                  </strong>
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

function ChartResumen({
  realizada,
  cancelada,
  reagendada,
  programada,
  estados,
  activaciones,
  sucursales,
  rangoLabel,
}: {
  realizada: number
  cancelada: number
  reagendada: number
  programada: number
  estados: TableroEstadoCount[]
  activaciones: number
  sucursales: number
  rangoLabel: string
}) {
  const estatusItems = [
    { key: 'realizada', label: 'Realizadas', value: realizada, color: '#1a7a3c' },
    { key: 'cancelada', label: 'Canceladas', value: cancelada, color: '#6b7280' },
    { key: 'reagendada', label: 'Reagendadas', value: reagendada, color: '#c41e2a' },
    { key: 'programada', label: 'Programadas', value: programada, color: '#1f4e79' },
  ]

  const estadoItems = estados.map((e, i) => ({
    key: e.label,
    label: e.label,
    value: e.value,
    color: colorForEstado(e.label, i),
  }))

  return (
    <div className="tablero-charts">
      <div className="tablero-chart" aria-label="Resumen de estatus">
        <h3 className="tablero-chart-title">Resumen de estatus</h3>
        {rangoLabel ? <p className="tablero-chart-range">{rangoLabel}</p> : null}
        <div className="tablero-kpi-row tablero-kpi-row-4" aria-label="Totales de estatus">
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Realizadas</span>
            <strong className="tablero-kpi-value">{realizada}</strong>
          </div>
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Canceladas</span>
            <strong className="tablero-kpi-value">{cancelada}</strong>
          </div>
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Reagendadas</span>
            <strong className="tablero-kpi-value">{reagendada}</strong>
          </div>
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Programadas</span>
            <strong className="tablero-kpi-value">{programada}</strong>
          </div>
        </div>
        <DonutChart
          items={estatusItems}
          emptyLabel="Sin activaciones en el periodo"
          ariaLabel={`Realizadas ${realizada}, canceladas ${cancelada}, reagendadas ${reagendada}, programadas ${programada}`}
          filterId="pie-estatus"
        />
      </div>

      <div className="tablero-chart" aria-label="Resumen por estado">
        <h3 className="tablero-chart-title">Resumen por estado</h3>
        {rangoLabel ? <p className="tablero-chart-range">{rangoLabel}</p> : null}
        <div className="tablero-kpi-row" aria-label="Totales del periodo">
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Activaciones</span>
            <strong className="tablero-kpi-value">{activaciones}</strong>
          </div>
          <div className="tablero-kpi tablero-kpi-accent">
            <span className="tablero-kpi-label">Sucursales vistas</span>
            <strong className="tablero-kpi-value">{sucursales}</strong>
          </div>
          <div className="tablero-kpi">
            <span className="tablero-kpi-label">Estados</span>
            <strong className="tablero-kpi-value">{estados.length}</strong>
          </div>
        </div>
        <DonutChart
          items={estadoItems}
          emptyLabel="Sin activaciones en el periodo"
          ariaLabel={`Activaciones por estado: ${estadoItems.map((i) => `${i.label} ${i.value}`).join(', ') || 'sin datos'}`}
          filterId="pie-estados"
        />
      </div>
    </div>
  )
}

function formatRangoLabel(fechaFrom?: string, fechaTo?: string): string {
  const from = String(fechaFrom || '').slice(0, 10)
  const to = String(fechaTo || '').slice(0, 10)
  if (!from && !to) return 'Sin filtro de fechas (todas las activaciones)'
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
  }
  if (from && to) return `Periodo: ${fmt(from)} → ${fmt(to)}`
  if (from) return `Desde ${fmt(from)}`
  return `Hasta ${fmt(to)}`
}

export default function TableroActivacionView({
  solicitudes,
  reportes,
  activaIds,
  fechaFrom,
  fechaTo,
  loading,
  error,
  onRetry,
}: Props) {
  const [meta, setMeta] = useState<TableroMetaMap>({})
  const [metaLoading, setMetaLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    setMeta(await fetchTableroMeta())
    setMetaLoading(false)
  }, [])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const rows = useMemo(
    () => buildTableroRows(solicitudes, reportes, activaIds, meta),
    [solicitudes, reportes, activaIds, meta],
  )
  const chart = useMemo(() => countTableroEstatus(rows), [rows])
  const estadosChart = useMemo(() => countTableroEstados(rows), [rows])
  const sucursales = useMemo(() => countUniqueSucursales(rows), [rows])
  const rangoLabel = useMemo(
    () => formatRangoLabel(fechaFrom, fechaTo),
    [fechaFrom, fechaTo],
  )

  const patchRow = async (id: string, patch: TableroMetaRow) => {
    setSavingId(id)
    setSaveError(null)
    const prev = meta
    setMeta((m) => ({
      ...m,
      [id]: { ...(m[id] || {}), ...patch },
    }))
    const result = await saveTableroMeta(id, patch)
    setSavingId(null)
    if (!result.ok) {
      setMeta(prev)
      setSaveError(result.message || 'No se pudo guardar')
      return
    }
    setMeta(result.rows)
  }

  return (
    <section className="tablero-section" aria-label="Tablero ACTIVACION BTL">
      <header className="tablero-head">
        <div>
          <h2 className="tablero-title">ACTIVACION BTL</h2>
          <p className="tablero-lede">
            Filtra por Estado, Municipio y Desde/Hasta para ver activaciones con su ubicación.
            Estatus, fecha reagendada y comentarios son editables.
          </p>
        </div>
        <div className="tablero-actions">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!rows.length}
            onClick={() => downloadTableroCsv(rows)}
          >
            Descargar CSV
          </button>
          <a
            className="btn btn-solid"
            href={`${REPORTE_TABLERO_XLSX}?ts=${Date.now()}`}
            download
          >
            Descargar Excel
          </a>
        </div>
      </header>

      {(loading || metaLoading) && <p className="status">Cargando tablero BTL…</p>}
      {error && (
        <p className="status error">
          {error}.{' '}
          <button type="button" className="linkish" onClick={onRetry}>
            Reintentar
          </button>
        </p>
      )}
      {saveError && <p className="status error">{saveError}</p>}

      {!loading && !metaLoading && !error && (
        <>
          <ChartResumen
            realizada={chart.realizada}
            cancelada={chart.cancelada}
            reagendada={chart.reagendada}
            programada={chart.programada}
            estados={estadosChart}
            activaciones={rows.length}
            sucursales={sucursales}
            rangoLabel={rangoLabel}
          />

          <div className="tablero-scroll">
            <table className="tablero-table">
              <thead>
                <tr>
                  <th>NO</th>
                  <th>FECHA</th>
                  <th>ESTADO</th>
                  <th>MUNICIPIO/ALCALDIA</th>
                  <th>COLONIA</th>
                  <th>PDV</th>
                  <th>CLAVE YAAVSER</th>
                  <th>NOMBRE DEL YAAV</th>
                  <th>HORAS</th>
                  <th>FLUJO</th>
                  <th>ESTATUS</th>
                  <th>FECHA REAGENDADA</th>
                  <th>COMENTARIOS</th>
                  <th>PORTABILIDA</th>
                  <th>RECARGAS</th>
                  <th>POSPAG</th>
                  <th>e-SIM</th>
                  <th>SIM - LÍNEA NUEVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: TableroRow) => (
                  <tr key={row.solicitudId}>
                    <td>{row.no}</td>
                    <td>{row.fecha}</td>
                    <td>{row.estado || '—'}</td>
                    <td className="tablero-ubicacion">{row.municipio || '—'}</td>
                    <td className="tablero-ubicacion">{row.colonia || '—'}</td>
                    <td className="tablero-pdv">{row.pdv}</td>
                    <td>{row.clave}</td>
                    <td className="tablero-nombre">{row.nombre}</td>
                    <td className={row.horas === '2' ? 'tablero-horas-low' : ''}>{row.horas}</td>
                    <td>{row.flujo}</td>
                    <td>
                      <select
                        className={`tablero-estatus-select ${estatusClass(row.estatus)}`}
                        value={row.estatus}
                        disabled={savingId === row.solicitudId}
                        onChange={(e) => {
                          const estatus = e.target.value as TableroEstatus
                          void patchRow(row.solicitudId, { estatus })
                        }}
                        aria-label={`Estatus de ${row.pdv || row.nombre}`}
                      >
                        {ESTATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        className="tablero-date-input"
                        value={row.fechaReagendada}
                        disabled={savingId === row.solicitudId}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                          try {
                            e.currentTarget.showPicker()
                          } catch {
                            // no soportado
                          }
                        }}
                        onChange={(e) => {
                          const fechaReagendada = e.target.value
                          void patchRow(row.solicitudId, {
                            fechaReagendada,
                            ...(fechaReagendada && row.estatus !== 'REAGENDADA'
                              ? { estatus: 'REAGENDADA' as const }
                              : {}),
                          })
                        }}
                        aria-label={`Fecha reagendada de ${row.pdv || row.nombre}`}
                      />
                    </td>
                    <td className="tablero-comentario-cell">
                      <textarea
                        className="tablero-comentario-input"
                        rows={2}
                        defaultValue={row.comentario}
                        key={`${row.solicitudId}-${row.comentario}`}
                        disabled={savingId === row.solicitudId}
                        placeholder="Agregar comentario…"
                        onBlur={(e) => {
                          const comentario = e.target.value.trim()
                          if (comentario === row.comentario) return
                          void patchRow(row.solicitudId, { comentario })
                        }}
                        aria-label={`Comentario de ${row.pdv || row.nombre}`}
                      />
                    </td>
                    <td>{cell(row.metrics.portabilidad)}</td>
                    <td>{cell(row.metrics.recargas)}</td>
                    <td>{cell(row.metrics.pospago)}</td>
                    <td>{cell(row.metrics.esim)}</td>
                    <td>{cell(row.metrics.sim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div className="empty">
              <h2>Sin filas</h2>
              <p>No hay solicitudes para mostrar en el tablero.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
