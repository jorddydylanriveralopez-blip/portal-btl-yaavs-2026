import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Solicitud } from './types'
import {
  availableMonths,
  deleteTradeEntry,
  emptyTradeForm,
  fetchTradeEntries,
  fileToJpegDataUrl,
  monthLabel,
  saveTradeEntry,
  summarizeMonth,
  tradeImageUrl,
  type TradeEntry,
  type TradeEntryInput,
} from './tradeMarketing'
import { downloadTradeMonthPreviewImage, downloadTradeMonthSlides } from './tradeSlides'
import { analyzeXrayCapture } from './xrayAnalyze'

type Props = {
  solicitudes: Solicitud[]
  onToast?: (msg: string) => void
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthKey(): string {
  return todayIso().slice(0, 7)
}

export default function TradeMarketingView({ solicitudes, onToast }: Props) {
  const [entries, setEntries] = useState<TradeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TradeEntryInput>(() => emptyTradeForm(todayIso()))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null)
  const [imgBusy, setImgBusy] = useState<0 | 1 | null>(null)
  const [xrayBusy, setXrayBusy] = useState(false)
  const [xrayProgress, setXrayProgress] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchTradeEntries()
      setEntries(list)
      const months = availableMonths(list)
      if (months.length && !months.includes(monthKey)) {
        setMonthKey(months[0])
      }
    } catch {
      setError('No se pudieron cargar las capturas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const months = useMemo(() => {
    const keys = availableMonths(entries)
    if (!keys.includes(currentMonthKey())) keys.unshift(currentMonthKey())
    return keys
  }, [entries])

  const summary = useMemo(() => summarizeMonth(entries, monthKey), [entries, monthKey])

  const solicitudOptions = useMemo(() => {
    return [...solicitudes]
      .filter((s) => s.fechaBtl || s.claveYaavser)
      .sort((a, b) => String(b.fechaBtl || '').localeCompare(String(a.fechaBtl || '')))
      .slice(0, 300)
  }, [solicitudes])

  const patch = (key: keyof TradeEntryInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setImageSlot = (slot: 0 | 1, value: string) => {
    setForm((prev) => {
      const next: [string, string] = [...prev.satisfaccionImagenes]
      next[slot] = value
      return { ...prev, satisfaccionImagenes: next }
    })
  }

  const onPickImage = async (slot: 0 | 1, file: File | null) => {
    if (!file) return
    setImgBusy(slot)
    try {
      const dataUrl = await fileToJpegDataUrl(file)
      setImageSlot(slot, dataUrl)
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'No se pudo leer la imagen')
    } finally {
      setImgBusy(null)
    }
  }

  const onPickXray = async (file: File | null) => {
    if (!file) return
    setXrayBusy(true)
    setXrayProgress('Preparando captura…')
    try {
      const dataUrl = await fileToJpegDataUrl(file, 1600)
      setForm((prev) => ({
        ...prev,
        ventasXrayImagen: dataUrl,
        ventasXray: '',
        ventasXrayAnalisis: '',
      }))
      const result = await analyzeXrayCapture(dataUrl, setXrayProgress)
      setForm((prev) => ({
        ...prev,
        ventasXrayImagen: dataUrl,
        ventasXray: result.monto || prev.ventasXray,
        ventasXrayAnalisis: result.analisis,
      }))
      onToast?.(
        result.monto
          ? `X-Ray analizado · monto ${result.monto}`
          : 'Captura leída; revisa el análisis (monto no claro)',
      )
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'No se pudo analizar la captura')
    } finally {
      setXrayBusy(false)
      setXrayProgress('')
    }
  }

  const clearXray = () => {
    setForm((prev) => ({
      ...prev,
      ventasXrayImagen: '',
      ventasXray: '',
      ventasXrayAnalisis: '',
    }))
  }

  const fillFromSolicitud = (id: string) => {
    const s = solicitudes.find((x) => x.id === id)
    if (!s) {
      patch('solicitudId', id)
      return
    }
    setForm((prev) => ({
      ...prev,
      solicitudId: s.id,
      fecha: (s.fechaBtl || prev.fecha || todayIso()).slice(0, 10),
      clave: s.claveYaavser || prev.clave,
      ejecutivo: s.ejecutivoDeVentas || s.nombreYaavser || prev.ejecutivo,
      municipioEstado: [s.municipioAlcaldia, s.estado].filter(Boolean).join(' / ') || prev.municipioEstado,
    }))
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyTradeForm(todayIso()))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.fecha) {
      onToast?.('La fecha es obligatoria')
      return
    }
    setSaving(true)
    const result = await saveTradeEntry({
      ...form,
      id: editingId || undefined,
    })
    setSaving(false)
    if (!result.ok) {
      onToast?.(result.message || 'No se pudo guardar')
      return
    }
    setEntries(result.entries)
    onToast?.(result.message || 'Guardado')
    if (form.fecha) setMonthKey(form.fecha.slice(0, 7))
    resetForm()
  }

  const startEdit = (entry: TradeEntry) => {
    setEditingId(entry.id)
    setForm({
      id: entry.id,
      solicitudId: entry.solicitudId || '',
      fecha: entry.fecha,
      clave: entry.clave,
      ejecutivo: entry.ejecutivo,
      gerente: entry.gerente,
      municipioEstado: entry.municipioEstado,
      satisfaccion: entry.satisfaccion,
      satisfaccionImagenes: [
        entry.satisfaccionImagenes?.[0] || '',
        entry.satisfaccionImagenes?.[1] || '',
      ],
      analisis: entry.analisis,
      ventasXrayImagen: entry.ventasXrayImagen || '',
      ventasXray: entry.ventasXray,
      ventasXrayAnalisis: entry.ventasXrayAnalisis || '',
      ventasEncuesta: entry.ventasEncuesta,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta captura de Trade Marketing?')) return
    const result = await deleteTradeEntry(id)
    if (!result.ok) {
      onToast?.(result.message || 'No se pudo eliminar')
      return
    }
    setEntries(result.entries)
    if (editingId === id) resetForm()
    onToast?.('Eliminado')
  }

  const onExportSlides = async () => {
    setExporting('pdf')
    try {
      await downloadTradeMonthSlides(entries, monthKey)
      onToast?.(
        `Diapositivas de ${monthLabel(monthKey)} descargadas (puedes hacerlo aunque el mes no haya cerrado)`,
      )
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'No se pudo generar el PDF')
    } finally {
      setExporting(null)
    }
  }

  const onExportPreviewImage = async () => {
    setExporting('png')
    try {
      await downloadTradeMonthPreviewImage(entries, monthKey)
      onToast?.(`Vista imagen de ${monthLabel(monthKey)} descargada`)
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'No se pudo generar la imagen')
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="trade-section" aria-label="Trade Marketing BTL">
      <div className="tablero-head">
        <div>
          <h2 className="tablero-title">Trade Marketing</h2>
          <p className="tablero-lede">
            Captura satisfacción, análisis y ventas (X-Ray / encuesta) por activación. Puedes
            descargar PDF o una vista en imagen en cualquier momento, aunque el mes aún no cierre.
          </p>
        </div>
        <div className="tablero-actions">
          <label className="trade-month">
            <span>Mes</span>
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-solid"
            disabled={exporting != null || summary.total === 0}
            onClick={() => void onExportSlides()}
          >
            {exporting === 'pdf' ? 'Generando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={exporting != null || summary.total === 0}
            onClick={() => void onExportPreviewImage()}
          >
            {exporting === 'png' ? 'Generando…' : 'Vista imagen'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      <form className="trade-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="trade-form-head">
          <h3>{editingId ? 'Editar captura' : 'Nueva captura'}</h3>
          {editingId && (
            <button type="button" className="btn btn-text" onClick={resetForm}>
              Cancelar edición
            </button>
          )}
        </div>

        <label className="trade-field trade-field-wide">
          <span>Vincular solicitud (opcional)</span>
          <select
            value={form.solicitudId || ''}
            onChange={(e) => fillFromSolicitud(e.target.value)}
          >
            <option value="">— Manual —</option>
            {solicitudOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.fechaBtl || '').slice(0, 10)} · {s.claveYaavser || 'sin clave'} ·{' '}
                {s.puntoDeVenta || s.nombreYaavser || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <div className="trade-grid" aria-label="Plantilla captura">
          <fieldset className="trade-panel trade-panel-solid">
            <legend>SOLICITUD BTL</legend>
            <label>
              <span>Fecha</span>
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => patch('fecha', e.target.value)}
              />
            </label>
            <label>
              <span>Clave</span>
              <input
                value={form.clave}
                onChange={(e) => patch('clave', e.target.value)}
                placeholder="19CL…"
              />
            </label>
            <label>
              <span>Ejecutivo/a</span>
              <input
                value={form.ejecutivo}
                onChange={(e) => patch('ejecutivo', e.target.value)}
              />
            </label>
            <label>
              <span>Gerente</span>
              <input
                value={form.gerente}
                onChange={(e) => patch('gerente', e.target.value)}
              />
            </label>
            <label className="trade-span-2">
              <span>Municipio / Estado</span>
              <input
                value={form.municipioEstado}
                onChange={(e) => patch('municipioEstado', e.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="trade-panel trade-panel-solid">
            <legend>SATISFACCIÓN</legend>
            <label className="trade-area">
              <span>Nota o comentarios (puedes empezar con un número 1–5)</span>
              <textarea
                rows={5}
                value={form.satisfaccion}
                onChange={(e) => patch('satisfaccion', e.target.value)}
                placeholder="Ej. 4.5 — Buena atención en piso…"
              />
            </label>
            <div className="trade-evidencias trade-span-2">
              <span className="trade-evidencias-label">Evidencia (2 imágenes)</span>
              <div className="trade-evidencias-grid">
                {([0, 1] as const).map((slot) => {
                  const src = tradeImageUrl(form.satisfaccionImagenes[slot])
                  return (
                    <div key={slot} className="trade-evidencia-slot">
                      {src ? (
                        <img src={src} alt={`Evidencia ${slot + 1}`} />
                      ) : (
                        <span className="trade-evidencia-empty">Sin foto {slot + 1}</span>
                      )}
                      <div className="trade-evidencia-actions">
                        <label className="btn btn-quiet trade-file-btn">
                          {imgBusy === slot ? 'Procesando…' : src ? 'Cambiar' : 'Subir'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={imgBusy != null}
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null
                              e.target.value = ''
                              void onPickImage(slot, f)
                            }}
                          />
                        </label>
                        {src && (
                          <button
                            type="button"
                            className="btn btn-text"
                            onClick={() => setImageSlot(slot, '')}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className="trade-panel">
            <legend>Análisis</legend>
            <label className="trade-area">
              <span>Hallazgos de la activación</span>
              <textarea
                rows={8}
                value={form.analisis}
                onChange={(e) => patch('analisis', e.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="trade-panel">
            <legend>Resultado de ventas</legend>
            <div className="trade-xray trade-span-2">
              <span className="trade-evidencias-label">Resultado de ventas X-Ray (solo captura)</span>
              <div className="trade-evidencia-slot trade-xray-slot">
                {tradeImageUrl(form.ventasXrayImagen) ? (
                  <img src={tradeImageUrl(form.ventasXrayImagen)} alt="Captura X-Ray" />
                ) : (
                  <span className="trade-evidencia-empty">
                    {xrayBusy ? xrayProgress || 'Analizando…' : 'Sube la captura X-Ray'}
                  </span>
                )}
                <div className="trade-evidencia-actions">
                  <label className="btn btn-quiet trade-file-btn">
                    {xrayBusy
                      ? 'Analizando…'
                      : form.ventasXrayImagen
                        ? 'Cambiar captura'
                        : 'Subir captura'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={xrayBusy || imgBusy != null}
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null
                        e.target.value = ''
                        void onPickXray(f)
                      }}
                    />
                  </label>
                  {form.ventasXrayImagen && !xrayBusy && (
                    <button type="button" className="btn btn-text" onClick={clearXray}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              {xrayProgress && <p className="trade-xray-progress">{xrayProgress}</p>}
              {(form.ventasXray || form.ventasXrayAnalisis) && (
                <div className="trade-xray-result">
                  <p>
                    <strong>Monto detectado:</strong> {form.ventasXray || '—'}
                  </p>
                  <p className="trade-xray-analisis">{form.ventasXrayAnalisis || ''}</p>
                </div>
              )}
            </div>
            <label className="trade-span-2">
              <span>Ventas reportadas en la encuesta</span>
              <input
                value={form.ventasEncuesta}
                onChange={(e) => patch('ventasEncuesta', e.target.value)}
                placeholder="Ej. 9800"
              />
            </label>
          </fieldset>
        </div>

        <div className="trade-form-actions">
          <button type="submit" className="btn btn-solid" disabled={saving}>
            {saving ? 'Guardando…' : editingId ? 'Actualizar captura' : 'Guardar captura'}
          </button>
        </div>
      </form>

      {loading && <p className="status">Cargando capturas…</p>}
      {error && (
        <p className="status error">
          {error}.{' '}
          <button type="button" className="linkish" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}

      {!loading && !error && (
        <div className="trade-list">
          <h3>
            Capturas · {monthLabel(monthKey)} ({summary.total})
          </h3>
          {summary.entries.length === 0 ? (
            <div className="empty">
              <p>Aún no hay capturas en este mes. Llena la plantilla y guarda.</p>
            </div>
          ) : (
            <div className="trade-cards">
              {summary.entries.map((entry) => (
                <article key={entry.id} className="trade-card">
                  <header>
                    <strong>{entry.fecha}</strong>
                    <span>{entry.clave || 'Sin clave'}</span>
                  </header>
                  <p className="trade-card-meta">
                    {entry.ejecutivo || '—'} · {entry.municipioEstado || 'Sin ubicación'}
                  </p>
                  <p className="trade-card-snip">
                    <strong>Sat:</strong> {entry.satisfaccion || '—'}
                  </p>
                  {(entry.satisfaccionImagenes?.[0] || entry.satisfaccionImagenes?.[1]) && (
                    <div className="trade-card-thumbs">
                      {entry.satisfaccionImagenes.map((img, i) =>
                        img ? (
                          <img key={i} src={tradeImageUrl(img)} alt={`Evidencia ${i + 1}`} />
                        ) : null,
                      )}
                    </div>
                  )}
                  {entry.ventasXrayImagen && (
                    <div className="trade-card-thumbs">
                      <img src={tradeImageUrl(entry.ventasXrayImagen)} alt="X-Ray" />
                    </div>
                  )}
                  <p className="trade-card-snip">
                    <strong>X-Ray:</strong> {entry.ventasXray || '—'} ·{' '}
                    <strong>Encuesta:</strong> {entry.ventasEncuesta || '—'}
                  </p>
                  {entry.ventasXrayAnalisis && (
                    <p className="trade-card-snip">{entry.ventasXrayAnalisis}</p>
                  )}
                  <div className="trade-card-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => startEdit(entry)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={() => void onDelete(entry.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
