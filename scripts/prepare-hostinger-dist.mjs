/**
 * Preserva datos vivos de Trade Marketing (y otros stores) antes del zip de deploy.
 * El deploy de Hostinger sobrescribe el docroot: sin esto se borran capturas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const LIVE =
  process.env.TRADE_LIVE_ORIGIN ||
  'https://palegreen-stork-987187.hostingersite.com'

async function pullJson(url, fallback) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

function writeJson(rel, data) {
  fs.writeFileSync(path.join(dist, rel), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function main() {
  if (!fs.existsSync(dist)) {
    console.error('dist/ no existe; corre npm run build primero')
    process.exit(1)
  }

  // Trade Marketing: no incluir JSON vacío del repo; traer live vía API
  const trade = await pullJson(`${LIVE}/trade-marketing.php`, { ok: true, entries: [] })
  const entries = Array.isArray(trade.entries) ? trade.entries : []
  writeJson('trade-marketing.json', {
    entries,
    updatedAt: new Date().toISOString(),
  })
  console.log(`trade entries preserved: ${entries.length}`)

  const uploadsDir = path.join(dist, 'trade-uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  // No borrar .gitkeep si existe
  const keep = path.join(uploadsDir, '.gitkeep')
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '')

  const paths = new Set()
  for (const e of entries) {
    for (const img of e.satisfaccionImagenes || []) {
      if (typeof img === 'string' && img.startsWith('trade-uploads/')) paths.add(img)
    }
    if (
      typeof e.ventasXrayImagen === 'string' &&
      e.ventasXrayImagen.startsWith('trade-uploads/')
    ) {
      paths.add(e.ventasXrayImagen)
    }
  }

  let ok = 0
  for (const rel of paths) {
    try {
      const res = await fetch(`${LIVE}/${rel}`, { cache: 'no-store' })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const dest = path.join(dist, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, buf)
      ok += 1
    } catch {
      /* ignore missing */
    }
  }
  console.log(`trade images preserved: ${ok}/${paths.size}`)

  // Otros stores (mismo patrón que el workflow GHA)
  for (const [file, endpoint, shape] of [
    [
      'deleted-solicitudes.json',
      'delete-solicitud.php',
      (live) => {
        const ids = (live.ids || []).filter((id) => id && id !== 'test')
        return { ids, items: live.items || {}, updatedAt: new Date().toISOString() }
      },
    ],
    [
      'status-solicitudes.json',
      'status-solicitud.php',
      (live) => ({
        activaIds: Array.isArray(live.activaIds) ? live.activaIds : [],
        updatedAt: new Date().toISOString(),
      }),
    ],
    [
      'tablero-meta.json',
      'tablero-meta.php',
      (live) => ({
        rows: live.rows && typeof live.rows === 'object' ? live.rows : {},
        updatedAt: new Date().toISOString(),
      }),
    ],
  ]) {
    const live = await pullJson(`${LIVE}/${endpoint}`, {})
    writeJson(file, shape(live))
    console.log(`preserved ${file}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
