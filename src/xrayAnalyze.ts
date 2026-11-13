export type XrayAnalysis = {
  monto: string
  analisis: string
  texto: string
}

function extractAmounts(text: string): number[] {
  const amounts: number[] = []
  const re =
    /(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{3,})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let raw = m[1].replace(/\s/g, '')
    // 12,500.00 or 12.500,00 → normalize
    if (/\d,\d{2}$/.test(raw) && raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.')
    } else if (/\d\.\d{2}$/.test(raw) && raw.includes(',')) {
      raw = raw.replace(/,/g, '')
    } else {
      raw = raw.replace(/,/g, '')
    }
    const n = Number.parseFloat(raw)
    if (Number.isFinite(n) && n > 0 && n < 1e9) amounts.push(n)
  }
  return amounts
}

function pickMainAmount(amounts: number[]): number | null {
  if (!amounts.length) return null
  // Prefer the largest plausible sales total (skip tiny 1–99 noise)
  const candidates = amounts.filter((n) => n >= 100)
  const pool = candidates.length ? candidates : amounts
  return Math.max(...pool)
}

function formatMx(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)
}

function buildAnalysis(texto: string, monto: number | null): string {
  const lines = texto
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)

  const keywords: string[] = []
  const lower = texto.toLowerCase()
  if (/activ|venta|chip|porta/.test(lower)) keywords.push('menciona activaciones/ventas')
  if (/meta|objetivo/.test(lower)) keywords.push('aparece meta/objetivo')
  if (/x[\s-]?ray|xray/.test(lower)) keywords.push('pantalla tipo X-Ray')
  if (/att|at&t|unefon|yaavs/.test(lower)) keywords.push('marca/operador detectado')

  const parts: string[] = []
  if (monto != null) {
    parts.push(`Monto principal detectado: ${formatMx(monto)}.`)
  } else {
    parts.push('No se pudo leer un monto claro en la captura; revisa que la imagen esté nítida.')
  }
  if (keywords.length) {
    parts.push(`Contexto: ${keywords.join('; ')}.`)
  }
  if (lines.length) {
    parts.push(`Texto leído (resumen): ${lines.slice(0, 4).join(' | ')}`)
  }
  return parts.join(' ')
}

/** Lee la captura X-Ray con OCR y propone monto + análisis. */
export async function analyzeXrayCapture(
  imageDataUrl: string,
  onProgress?: (msg: string) => void,
): Promise<XrayAnalysis> {
  onProgress?.('Cargando motor de lectura…')
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(`Analizando captura… ${Math.round(m.progress * 100)}%`)
      }
    },
  })
  try {
    onProgress?.('Analizando captura…')
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl)
    const raw = text || ''
    const amounts = extractAmounts(raw)
    const main = pickMainAmount(amounts)
    const monto = main != null ? String(Math.round(main)) : ''
    const analisis = buildAnalysis(raw, main)
    return { monto, analisis, texto: raw }
  } finally {
    await worker.terminate()
  }
}
