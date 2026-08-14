import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const DELETED_STORE = path.join(rootDir, 'public', 'deleted-solicitudes.json')
const DELETE_PASSWORDS = new Set(['orlando01', 'Noemi2026'])

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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
          if (!DELETE_PASSWORDS.has(body.password || '')) {
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
