import { useMemo } from 'react'
import { REPORTE_TABLERO_XLSX } from './reporteApi'
import { downloadTableroCsv } from './export'
import {
  buildTableroRows,
  sumTableroMetrics,
  type ReporteEntry,
  type TableroRow,
} from './tablero'
import type { Solicitud } from './types'

type Props = {
  solicitudes: Solicitud[]
  reportes: ReporteEntry[]
  activaIds: string[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

function cell(v: number | string | '') {
  return v === '' || v == null ? '—' : String(v)
}

function estatusClass(row: TableroRow): string {
  if (row.estatus === 'PROGRAMADA') return 'tablero-estatus tablero-estatus-programada'
  if (row.estatus === 'REAGENDADA') return 'tablero-estatus tablero-estatus-reagendada'
  return 'tablero-estatus tablero-estatus-realizada'
}

export default function TableroActivacionView({
  solicitudes,
  reportes,
  activaIds,
  loading,
  error,
  onRetry,
}: Props) {
  const rows = useMemo(
    () => buildTableroRows(solicitudes, reportes, activaIds),
    [solicitudes, reportes, activaIds],
  )
  const totals = useMemo(() => sumTableroMetrics(rows), [rows])

  return (
    <section className="tablero-section" aria-label="Tablero ACTIVACION BTL">
      <header className="tablero-head">
        <div>
          <h2 className="tablero-title">ACTIVACION BTL</h2>
          <p className="tablero-lede">
            Solicitudes del portal cruzadas con reportes del Formulario 7 (resultados comerciales).
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

      {loading && <p className="status">Cargando reportes BTL…</p>}
      {error && (
        <p className="status error">
          {error}.{' '}
          <button type="button" className="linkish" onClick={onRetry}>
            Reintentar
          </button>
        </p>
      )}

      {!loading && !error && (
        <>
          <div className="tablero-totals" aria-label="Totales">
            <div className="tablero-total">
              <span>PORTABILIDA</span>
              <strong>{cell(totals.portabilidad)}</strong>
            </div>
            <div className="tablero-total">
              <span>RECARGAS</span>
              <strong>{cell(totals.recargas)}</strong>
            </div>
            <div className="tablero-total">
              <span>POSPAG</span>
              <strong>{cell(totals.pospago)}</strong>
            </div>
            <div className="tablero-total">
              <span>e-SIM</span>
              <strong>{cell(totals.esim)}</strong>
            </div>
            <div className="tablero-total">
              <span>SIM - LÍNEA NUEVA</span>
              <strong>{cell(totals.sim)}</strong>
            </div>
          </div>

          <div className="tablero-scroll">
            <table className="tablero-table">
              <thead>
                <tr>
                  <th>NO</th>
                  <th>FECHA</th>
                  <th>ESTADO</th>
                  <th>MUNICIPIO/ALCALDIA</th>
                  <th>PDV</th>
                  <th>CLAVE YAAVSER</th>
                  <th>NOMBRE DEL YAAV</th>
                  <th>HORAS</th>
                  <th>FLUJO</th>
                  <th>ESTATUS</th>
                  <th>PORTABILIDA</th>
                  <th>RECARGAS</th>
                  <th>POSPAG</th>
                  <th>e-SIM</th>
                  <th>SIM - LÍNEA NUEVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.solicitudId}>
                    <td>{row.no}</td>
                    <td>{row.fecha}</td>
                    <td>{row.estado}</td>
                    <td>{row.municipio}</td>
                    <td className="tablero-pdv">{row.pdv}</td>
                    <td>{row.clave}</td>
                    <td className="tablero-nombre">{row.nombre}</td>
                    <td className={row.horas === '2' ? 'tablero-horas-low' : ''}>{row.horas}</td>
                    <td>{row.flujo}</td>
                    <td>
                      <span className={estatusClass(row)}>{row.estatus}</span>
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
