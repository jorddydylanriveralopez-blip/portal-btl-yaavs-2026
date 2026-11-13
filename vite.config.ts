import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const DELETED_STORE = path.join(rootDir, 'public', 'deleted-solicitudes.json')
const STATUS_STORE = path.join(rootDir, 'public', 'status-solicitudes.json')
const TABLERO_META_STORE = path.join(rootDir, 'public', 'tablero-meta.json')
const TRADE_STORE = path.join(rootDir, 'public', 'trade-marketing.json')
const TRADE_UPLOADS = path.join(rootDir, 'public', 'trade-uploads')
const DELETE_PASSWORDS = new Set(['orlando01', 'Noemi2026'])
const TABLERO_ESTATUS = new Set(['REALIZADA', 'PROGRAMADA', 'CANCELADA', 'REAGENDADA'])

type TradeEntry = {
  id: string
  solicitudId?: string
  fecha: string
  clave: string
  ejecutivo: string
  gerente: string
  municipioEstado: string
  satisfaccion: string
  satisfaccionImagenes: [string, string]
  analisis: string
  ventasXrayImagen: string
  ventasXray: string
  ventasXrayAnalisis: string
  ventasEncuesta: string
  createdAt?: string
  updatedAt?: string
}

type ConnectNext = () => void

function normalizeClave(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  const code = t.match(/([0-9]{2}CL[A-Z0-9]+)/)
  if (code) return code[1]
  const beforeDash = t.split(/\s+-\s+/)[0]?.trim() || t
  return beforeDash.split(/\s{2,}/)[0]?.trim() || beforeDash
}

type TrashItem = {
  id: string
  deletedAt?: string | null
  puntoDeVenta?: string | null
  nombreYaavser?: string | null
  claveYaavser?: string | null
  estado?: string | null
  municipioAlcaldia?: string | null
  fechaBtl?: string | null
  flujoDePersonas?: string | null
  fotoUrl?: string | null
}

type DeletedStore = {
  ids: string[]
  items: Record<string, TrashItem>
}

function readDeletedStore(): DeletedStore {
  try {
    if (!fs.existsSync(DELETED_STORE)) return { ids: [], items: {} }
    const raw = fs.readFileSync(DELETED_STORE, 'utf8')
    const data = JSON.parse(raw) as {
      ids?: unknown
      items?: Record<string, TrashItem>
    }
    const ids = Array.isArray(data.ids)
      ? data.ids.filter((id): id is string => typeof id === 'string' && id !== '')
      : []
    const items =
      data.items && typeof data.items === 'object' && !Array.isArray(data.items)
        ? data.items
        : {}
    return { ids: [...new Set(ids)], items }
  } catch {
    return { ids: [], items: {} }
  }
}

function writeDeletedStore(ids: string[], items: Record<string, TrashItem>) {
  const unique = [...new Set(ids)]
  const cleanItems: Record<string, TrashItem> = {}
  for (const id of unique) {
    if (items[id]) cleanItems[id] = { ...items[id], id }
  }
  fs.writeFileSync(
    DELETED_STORE,
    `${JSON.stringify(
      { ids: unique, items: cleanItems, updatedAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return { ids: unique, items: cleanItems }
}

function itemsList(store: DeletedStore): TrashItem[] {
  return store.ids
    .map((id) => {
      const item = store.items[id]
      if (!item) return null
      return { ...item, id }
    })
    .filter((item): item is TrashItem => !!item)
    .sort((a, b) =>
      String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')),
    )
}

function readDeletedIds(): string[] {
  return readDeletedStore().ids
}

function readActivaIds(): string[] {
  try {
    if (!fs.existsSync(STATUS_STORE)) return []
    const raw = fs.readFileSync(STATUS_STORE, 'utf8')
    const data = JSON.parse(raw) as { activaIds?: unknown }
    return Array.isArray(data.activaIds)
      ? [...new Set(data.activaIds.filter((id): id is string => typeof id === 'string' && id !== ''))]
      : []
  } catch {
    return []
  }
}

function writeActivaIds(ids: string[]): string[] {
  const unique = [...new Set(ids)]
  fs.writeFileSync(
    STATUS_STORE,
    `${JSON.stringify({ activaIds: unique, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  return unique
}

type TableroMetaRow = {
  estatus?: string
  fechaReagendada?: string
  comentario?: string
}

function readTableroMeta(): Record<string, TableroMetaRow> {
  try {
    if (!fs.existsSync(TABLERO_META_STORE)) return {}
    const raw = fs.readFileSync(TABLERO_META_STORE, 'utf8')
    const data = JSON.parse(raw) as { rows?: Record<string, TableroMetaRow> }
    return data.rows && typeof data.rows === 'object' ? data.rows : {}
  } catch {
    return {}
  }
}

function writeTableroMeta(rows: Record<string, TableroMetaRow>) {
  fs.writeFileSync(
    TABLERO_META_STORE,
    `${JSON.stringify({ rows, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  return rows
}

function clipStr(value: unknown, max: number): string {
  const t = String(value ?? '').trim()
  return t.slice(0, max)
}

function normalizeTradeImages(raw: unknown): [string, string] {
  const out: [string, string] = ['', '']
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < 2; i++) {
    const v = typeof raw[i] === 'string' ? raw[i].trim() : ''
    if (!v) continue
    if (v.startsWith('trade-uploads/') && /^trade-uploads\/[a-zA-Z0-9._-]+$/.test(v)) {
      out[i] = v
    } else if (v.startsWith('data:image/')) {
      out[i] = v
    }
  }
  return out
}

function deleteTradeUpload(rel: string) {
  if (!rel.startsWith('trade-uploads/') || !/^trade-uploads\/[a-zA-Z0-9._-]+$/.test(rel)) {
    return
  }
  const full = path.join(rootDir, 'public', rel)
  if (fs.existsSync(full)) fs.unlinkSync(full)
}

function persistTradeImage(
  id: string,
  tag: string,
  value: string,
  previous: string,
): string {
  const v = value.trim()
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '') || 'img'
  if (!v) {
    if (previous) deleteTradeUpload(previous)
    return ''
  }
  if (v.startsWith('trade-uploads/') && /^trade-uploads\/[a-zA-Z0-9._-]+$/.test(v)) {
    return v
  }
  const m = v.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i)
  if (!m) return previous
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  const b64 = v.slice(v.indexOf(',') + 1)
  const bin = Buffer.from(b64, 'base64')
  if (bin.length < 32 || bin.length > 4_500_000) return previous
  if (!fs.existsSync(TRADE_UPLOADS)) fs.mkdirSync(TRADE_UPLOADS, { recursive: true })
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '') || 'tm'
  const rel = `trade-uploads/${safeId}-${safeTag}.${ext}`
  fs.writeFileSync(path.join(rootDir, 'public', rel), bin)
  if (previous && previous !== rel) deleteTradeUpload(previous)
  return rel
}

function readTradeEntries(): TradeEntry[] {
  try {
    if (!fs.existsSync(TRADE_STORE)) return []
    const raw = fs.readFileSync(TRADE_STORE, 'utf8')
    const data = JSON.parse(raw) as { entries?: TradeEntry[] }
    if (!Array.isArray(data.entries)) return []
    return data.entries
      .filter((e) => e && typeof e.id === 'string' && e.id)
      .map((e) => ({
        ...e,
        satisfaccionImagenes: normalizeTradeImages(e.satisfaccionImagenes).map((img) =>
          img.startsWith('data:image/') ? '' : img,
        ) as [string, string],
        ventasXrayImagen:
          typeof e.ventasXrayImagen === 'string' &&
          e.ventasXrayImagen.startsWith('trade-uploads/')
            ? e.ventasXrayImagen
            : '',
        ventasXrayAnalisis:
          typeof e.ventasXrayAnalisis === 'string' ? e.ventasXrayAnalisis : '',
      }))
  } catch {
    return []
  }
}

function writeTradeEntries(entries: TradeEntry[]): TradeEntry[] {
  const sorted = [...entries].sort((a, b) =>
    String(b.fecha || '').localeCompare(String(a.fecha || '')),
  )
  fs.writeFileSync(
    TRADE_STORE,
    `${JSON.stringify({ entries: sorted, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  return sorted
}

function cleanTradeEntry(row: Partial<TradeEntry> & { id: string }): TradeEntry | null {
  const fecha = clipStr(row.fecha, 10)
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const imgs = normalizeTradeImages(row.satisfaccionImagenes).map((img) =>
    img.startsWith('data:image/') ? '' : img,
  ) as [string, string]
  return {
    id: row.id,
    solicitudId: clipStr(row.solicitudId, 80),
    fecha,
    clave: clipStr(row.clave, 80),
    ejecutivo: clipStr(row.ejecutivo, 120),
    gerente: clipStr(row.gerente, 120),
    municipioEstado: clipStr(row.municipioEstado, 160),
    satisfaccion: clipStr(row.satisfaccion, 2000),
    satisfaccionImagenes: imgs,
    analisis: clipStr(row.analisis, 4000),
    ventasXrayImagen:
      typeof row.ventasXrayImagen === 'string' &&
      row.ventasXrayImagen.startsWith('trade-uploads/')
        ? row.ventasXrayImagen
        : '',
    ventasXray: clipStr(row.ventasXray, 500),
    ventasXrayAnalisis: clipStr(row.ventasXrayAnalisis, 2000),
    ventasEncuesta: clipStr(row.ventasEncuesta, 500),
    createdAt: row.createdAt || new Date().toISOString(),
    updatedAt: row.updatedAt || new Date().toISOString(),
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Parser mínimo multipart para un archivo `file` + campos texto. */
function parseMultipart(
  buf: Buffer,
  contentType: string,
): { fields: Record<string, string>; file?: { filename: string; data: Buffer; mime: string } } {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = (m?.[1] || m?.[2] || '').trim()
  if (!boundary) return { fields: {} }
  const sep = Buffer.from(`--${boundary}`)
  const fields: Record<string, string> = {}
  let file: { filename: string; data: Buffer; mime: string } | undefined
  let start = buf.indexOf(sep)
  while (start >= 0) {
    const afterSep = start + sep.length
    if (buf[afterSep] === 45 && buf[afterSep + 1] === 45) break // --
    let partStart = afterSep
    if (buf[partStart] === 13 && buf[partStart + 1] === 10) partStart += 2
    const next = buf.indexOf(sep, partStart)
    if (next < 0) break
    let partEnd = next
    if (partEnd >= 2 && buf[partEnd - 2] === 13 && buf[partEnd - 1] === 10) partEnd -= 2
    const part = buf.subarray(partStart, partEnd)
    const hdrEnd = part.indexOf('\r\n\r\n')
    if (hdrEnd < 0) {
      start = next
      continue
    }
    const headers = part.subarray(0, hdrEnd).toString('utf8')
    const body = part.subarray(hdrEnd + 4)
    const nameM = headers.match(/name="([^"]+)"/i)
    const name = nameM?.[1] || ''
    const fileM = headers.match(/filename="([^"]*)"/i)
    if (fileM && name === 'file') {
      const mimeM = headers.match(/Content-Type:\s*([^\r\n]+)/i)
      file = {
        filename: fileM[1] || 'upload.bin',
        data: Buffer.from(body),
        mime: (mimeM?.[1] || 'application/octet-stream').trim(),
      }
    } else if (name) {
      fields[name] = body.toString('utf8')
    }
    start = next
  }
  return { fields, file }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

function localApiPlugin(): Plugin {
  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: ConnectNext,
  ) => {
    const rawUrl = req.url || ''

    if (rawUrl.startsWith('/image-proxy.php')) {
      try {
        const parsed = new URL(rawUrl, 'http://localhost')
        const target = parsed.searchParams.get('url')
        if (!target) {
          res.statusCode = 400
          res.end('URL inválida')
          return
        }

        const host = new URL(target).hostname.toLowerCase()
        const allowed =
          host.endsWith('.amazonaws.com') ||
          host.endsWith('.fillout.com') ||
          host.endsWith('.zite.com') ||
          host === 'fillout.com' ||
          host === 'zite.com' ||
          host === 'images.fillout.com'

        if (!allowed) {
          res.statusCode = 403
          res.end('Host no permitido')
          return
        }

        const upstream = await fetch(target, {
          headers: { Accept: 'image/*' },
        })
        if (!upstream.ok) {
          res.statusCode = 502
          res.end('No se pudo obtener la imagen')
          return
        }

        const buf = Buffer.from(await upstream.arrayBuffer())
        res.setHeader(
          'Content-Type',
          upstream.headers.get('content-type') || 'image/jpeg',
        )
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(buf)
      } catch {
        res.statusCode = 502
        res.end('Error de proxy')
      }
      return
    }

    if (rawUrl.startsWith('/tablero-meta.php')) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        res.end()
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, rows: readTableroMeta() })
        return
      }
      if (req.method === 'POST') {
        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as {
            id?: string
            estatus?: string
            fechaReagendada?: string
            comentario?: string
          }
          const id = (body.id || '').trim()
          if (!id) {
            sendJson(res, 400, {
              ok: false,
              message: 'Falta el id de la solicitud',
              rows: {},
            })
            return
          }
          const rows = { ...readTableroMeta() }
          const current: TableroMetaRow = { ...(rows[id] || {}) }
          if ('estatus' in body) {
            const estatus = String(body.estatus || '').trim().toUpperCase()
            if (!estatus) delete current.estatus
            else if (TABLERO_ESTATUS.has(estatus)) current.estatus = estatus
            else {
              sendJson(res, 400, {
                ok: false,
                message: 'Estatus no válido',
                rows,
              })
              return
            }
          }
          if ('fechaReagendada' in body) {
            const fecha = String(body.fechaReagendada || '').trim()
            if (!fecha) delete current.fechaReagendada
            else if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) current.fechaReagendada = fecha
            else {
              sendJson(res, 400, {
                ok: false,
                message: 'Fecha reagendada inválida',
                rows,
              })
              return
            }
          }
          if ('comentario' in body) {
            const comentario = String(body.comentario || '').trim().slice(0, 500)
            if (!comentario) delete current.comentario
            else current.comentario = comentario
          }
          if (Object.keys(current).length) rows[id] = current
          else delete rows[id]
          sendJson(res, 200, {
            ok: true,
            rows: writeTableroMeta(rows),
            message: 'Guardado',
          })
        } catch {
          sendJson(res, 500, {
            ok: false,
            message: 'Error al guardar metadatos del tablero',
            rows: {},
          })
        }
        return
      }
      sendJson(res, 405, { ok: false, message: 'Método no permitido' })
      return
    }

    if (rawUrl.startsWith('/trade-marketing.php')) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        res.end()
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, entries: readTradeEntries() })
        return
      }
      if (req.method === 'POST') {
        try {
          const ctype = String(req.headers['content-type'] || '')
          if (ctype.includes('multipart/form-data')) {
            const rawBuf = await readRawBody(req)
            const parsed = parseMultipart(rawBuf, ctype)
            const actionUp = String(parsed.fields.action || 'upload').toLowerCase()
            if (actionUp !== 'upload') {
              sendJson(res, 400, { ok: false, message: 'Acción de subida inválida' })
              return
            }
            const file = parsed.file
            if (!file || file.data.length < 32 || file.data.length > 4_500_000) {
              sendJson(res, 400, {
                ok: false,
                message: 'Archivo inválido o demasiado grande (máx 4.5 MB)',
              })
              return
            }
            const mimeMap: Record<string, string> = {
              'image/jpeg': 'jpg',
              'image/jpg': 'jpg',
              'image/png': 'png',
              'image/webp': 'webp',
            }
            const ext = mimeMap[file.mime]
            if (!ext) {
              sendJson(res, 400, { ok: false, message: 'Solo se permiten JPG, PNG o WEBP' })
              return
            }
            const tag =
              (parsed.fields.tag || 'img').replace(/[^a-zA-Z0-9_-]/g, '') || 'img'
            let id =
              (parsed.fields.id || '').replace(/[^a-zA-Z0-9_-]/g, '') || ''
            if (!id) id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            if (!fs.existsSync(TRADE_UPLOADS)) {
              fs.mkdirSync(TRADE_UPLOADS, { recursive: true })
            }
            const rel = `trade-uploads/${id}-${tag}.${ext}`
            fs.writeFileSync(path.join(rootDir, 'public', rel), file.data)
            sendJson(res, 200, {
              ok: true,
              message: 'Imagen subida',
              path: rel,
              id,
            })
            return
          }

          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as Partial<TradeEntry> & {
            action?: string
            id?: string
          }
          const action = String(body.action || 'save').toLowerCase()
          let entries = readTradeEntries()

          if (action === 'delete') {
            const id = String(body.id || '').trim()
            if (!id) {
              sendJson(res, 400, { ok: false, message: 'Falta el id', entries })
              return
            }
            const doomed = entries.find((e) => e.id === id)
            if (doomed?.satisfaccionImagenes) {
              for (const img of doomed.satisfaccionImagenes) {
                if (img) deleteTradeUpload(img)
              }
            }
            if (doomed?.ventasXrayImagen) deleteTradeUpload(doomed.ventasXrayImagen)
            entries = writeTradeEntries(entries.filter((e) => e.id !== id))
            sendJson(res, 200, { ok: true, message: 'Eliminado', entries })
            return
          }

          const now = new Date().toISOString()
          let id = String(body.id || '').trim()
          let createdAt = now
          let prevImages: [string, string] = ['', '']
          let prevXray = ''
          if (id) {
            const prev = entries.find((e) => e.id === id)
            if (prev?.createdAt) createdAt = prev.createdAt
            if (prev?.satisfaccionImagenes) {
              prevImages = normalizeTradeImages(prev.satisfaccionImagenes)
            }
            if (prev?.ventasXrayImagen) prevXray = prev.ventasXrayImagen
          } else {
            id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
          }

          const incoming = normalizeTradeImages(
            (body as { satisfaccionImagenes?: unknown }).satisfaccionImagenes,
          )
          const savedImages: [string, string] = [
            persistTradeImage(id, 'sat-1', incoming[0], prevImages[0]),
            persistTradeImage(id, 'sat-2', incoming[1], prevImages[1]),
          ]
          const incomingXray = String(
            (body as { ventasXrayImagen?: string }).ventasXrayImagen || '',
          )
          const savedXray = persistTradeImage(id, 'xray', incomingXray, prevXray)

          const clean = cleanTradeEntry({
            ...body,
            id,
            satisfaccionImagenes: savedImages,
            ventasXrayImagen: savedXray,
            createdAt,
            updatedAt: now,
          })
          if (!clean || !clean.fecha) {
            sendJson(res, 400, {
              ok: false,
              message: 'La fecha es obligatoria',
              entries,
            })
            return
          }

          const idx = entries.findIndex((e) => e.id === id)
          if (idx >= 0) entries[idx] = clean
          else entries.push(clean)
          entries = writeTradeEntries(entries)
          sendJson(res, 200, {
            ok: true,
            message: idx >= 0 ? 'Actualizado' : 'Guardado',
            entries,
            entry: clean,
          })
        } catch {
          sendJson(res, 500, {
            ok: false,
            message: 'Error al guardar Trade Marketing',
            entries: [],
          })
        }
        return
      }
      sendJson(res, 405, { ok: false, message: 'Método no permitido', entries: [] })
      return
    }

    if (rawUrl.startsWith('/status-solicitud.php')) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        res.end()
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, activaIds: readActivaIds() })
        return
      }
      if (req.method === 'POST') {
        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as { id?: string; action?: string }
          const id = (body.id || '').trim()
          const action = (body.action || 'activa').toLowerCase()
          if (!id) {
            sendJson(res, 400, {
              ok: false,
              message: 'Falta el id de la solicitud',
              activaIds: [],
            })
            return
          }
          let ids = readActivaIds()
          let message = 'Restaurada en activas'
          if (action === 'terminada') {
            ids = ids.filter((x) => x !== id)
            message = 'Movida a terminadas'
          } else if (!ids.includes(id)) {
            ids.push(id)
          }
          sendJson(res, 200, {
            ok: true,
            activaIds: writeActivaIds(ids),
            message,
          })
        } catch {
          sendJson(res, 500, {
            ok: false,
            message: 'Error al guardar el estatus',
            activaIds: [],
          })
        }
        return
      }
      sendJson(res, 405, { ok: false, message: 'Método no permitido' })
      return
    }

    if (rawUrl.startsWith('/delete-solicitud.php')) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
        res.end()
        return
      }

      if (req.method === 'GET') {
        const store = readDeletedStore()
        sendJson(res, 200, {
          ok: true,
          ids: store.ids,
          items: itemsList(store),
        })
        return
      }

      if (req.method === 'POST') {
        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as {
            id?: string
            password?: string
            action?: string
            snapshot?: Partial<TrashItem>
          }
          if (!DELETE_PASSWORDS.has((body.password || '').trim())) {
            sendJson(res, 403, {
              ok: false,
              message: 'Contraseña incorrecta',
              ids: [],
              items: [],
            })
            return
          }
          const action = (body.action || 'delete').toLowerCase()
          const id = (body.id || '').trim()
          if (!id && action !== 'purge_all') {
            sendJson(res, 400, {
              ok: false,
              message: 'Falta el id de la solicitud',
              ids: [],
              items: [],
            })
            return
          }

          const store = readDeletedStore()
          let ids = [...store.ids]
          const items = { ...store.items }

          let message = 'Enviada a la papelera'
          if (action === 'restore') {
            ids = ids.filter((x) => x !== id)
            delete items[id]
            message = 'Solicitud restaurada'
          } else if (action === 'purge') {
            delete items[id]
            if (!ids.includes(id)) ids.push(id)
            message = 'Quitada de la papelera'
          } else if (action === 'purge_all') {
            for (const key of Object.keys(items)) delete items[key]
            message = 'Papelera vaciada'
          } else {
            if (!ids.includes(id)) ids.push(id)
            const snap = body.snapshot || {}
            items[id] = {
              id,
              deletedAt: new Date().toISOString(),
              puntoDeVenta: snap.puntoDeVenta ?? null,
              nombreYaavser: snap.nombreYaavser ?? null,
              claveYaavser: snap.claveYaavser ?? null,
              estado: snap.estado ?? null,
              municipioAlcaldia: snap.municipioAlcaldia ?? null,
              fechaBtl: snap.fechaBtl ?? null,
              flujoDePersonas: snap.flujoDePersonas ?? null,
              fotoUrl: snap.fotoUrl ?? null,
            }
            message = 'Enviada a la papelera'
          }

          const saved = writeDeletedStore(ids, items)
          sendJson(res, 200, {
            ok: true,
            ids: saved.ids,
            items: itemsList(saved),
            message,
          })
        } catch {
          sendJson(res, 500, {
            ok: false,
            message: 'Error al eliminar',
            ids: [],
            items: [],
          })
        }
        return
      }

      sendJson(res, 405, { ok: false, message: 'Método no permitido' })
      return
    }

    if (rawUrl.startsWith('/reporte-proxy.php')) {
      try {
        const upstream = await fetch(
          'https://lightslategrey-deer-478072.hostingersite.com/api/responses',
          { headers: { Accept: 'application/json' } },
        )
        if (!upstream.ok) {
          sendJson(res, 502, { ok: false, error: 'No se pudieron obtener los reportes BTL' })
          return
        }
        const data = await upstream.text()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Cache-Control', 'no-store')
        res.end(data)
      } catch {
        sendJson(res, 502, { ok: false, error: 'Error al consultar reportes BTL' })
      }
      return
    }

    if (rawUrl.startsWith('/check-clave.php')) {
      try {
        const parsed = new URL(rawUrl, 'http://localhost')
        const clave = normalizeClave(parsed.searchParams.get('clave') || '')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')

        if (!clave) {
          res.statusCode = 400
          res.end(
            JSON.stringify({
              ok: false,
              exists: false,
              message: 'Falta la clave YAAVSER',
            }),
          )
          return
        }

        const deleted = new Set(readDeletedIds())
        const upstream = await fetch(
          'https://workflows.fillout.com/public/sy3akaxkpf/workflow/execute',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json;charset=UTF-8' },
            body: JSON.stringify({
              inputs: { limit: 500 },
              mode: 'live',
              workflowId: 'getSolicitudes',
              stream: false,
            }),
          },
        )
        if (!upstream.ok) {
          res.statusCode = 502
          res.end(
            JSON.stringify({
              ok: false,
              exists: false,
              message: 'No se pudo consultar solicitudes',
            }),
          )
          return
        }

        const data = (await upstream.json()) as {
          records?: Array<Record<string, unknown>>
        }
        const match = (data.records || []).find((row) => {
          const id = String(row.id || '')
          if (id && deleted.has(id)) return false
          const existing = normalizeClave(String(row.claveYaavser || ''))
          return existing !== '' && existing === clave
        })

        res.statusCode = 200
        res.end(
          JSON.stringify({
            ok: true,
            exists: !!match,
            clave,
            message: match
              ? 'Esta clave YAAVSER ya tiene una solicitud registrada. No se puede enviar otra.'
              : 'Clave disponible',
            solicitud: match
              ? {
                  id: match.id,
                  puntoDeVenta: match.puntoDeVenta,
                  nombreYaavser: match.nombreYaavser,
                  fechaBtl: match.fechaBtl,
                }
              : null,
          }),
        )
      } catch {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: false,
            exists: false,
            message: 'Error al validar la clave',
          }),
        )
      }
      return
    }

    next()
  }

  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
