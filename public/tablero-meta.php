<?php
/**
 * Metadatos editables del Tablero BTL por solicitud.
 * GET  → { ok, rows: { [id]: { estatus?, fechaReagendada?, comentario? } } }
 * POST → { id, estatus?, fechaReagendada?, comentario? }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

const STORE_FILE = __DIR__ . '/tablero-meta.json';
const ALLOWED_ESTATUS = ['REALIZADA', 'PROGRAMADA', 'CANCELADA', 'REAGENDADA'];

/**
 * @return array<string, array{estatus?: string, fechaReagendada?: string, comentario?: string}>
 */
function read_rows(): array {
  if (!is_file(STORE_FILE)) {
    return [];
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return [];
  }
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['rows']) || !is_array($data['rows'])) {
    return [];
  }
  $out = [];
  foreach ($data['rows'] as $id => $row) {
    if (!is_string($id) || $id === '' || !is_array($row)) {
      continue;
    }
    $clean = [];
    if (isset($row['estatus']) && is_string($row['estatus'])) {
      $estatus = strtoupper(trim($row['estatus']));
      if (in_array($estatus, ALLOWED_ESTATUS, true)) {
        $clean['estatus'] = $estatus;
      }
    }
    if (isset($row['fechaReagendada']) && is_string($row['fechaReagendada'])) {
      $fecha = trim($row['fechaReagendada']);
      if ($fecha === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        $clean['fechaReagendada'] = $fecha;
      }
    }
    if (isset($row['comentario']) && is_string($row['comentario'])) {
      $clean['comentario'] = mb_substr(trim($row['comentario']), 0, 500);
    }
    if ($clean) {
      $out[$id] = $clean;
    }
  }
  return $out;
}

/**
 * @param array<string, array{estatus?: string, fechaReagendada?: string, comentario?: string}> $rows
 */
function write_rows(array $rows): bool {
  $payload = json_encode([
    'rows' => $rows,
    'updatedAt' => gmdate('c'),
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $rows = read_rows();
  echo json_encode([
    'ok' => true,
    'rows' => $rows ?: new stdClass(),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode([
    'ok' => false,
    'message' => 'Método no permitido',
    'rows' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$rawBody = file_get_contents('php://input');
$body = is_string($rawBody) ? json_decode($rawBody, true) : null;
if (!is_array($body)) {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'message' => 'JSON inválido',
    'rows' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$id = trim((string)($body['id'] ?? ''));
if ($id === '') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'message' => 'Falta el id de la solicitud',
    'rows' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$rows = read_rows();
$current = $rows[$id] ?? [];

if (array_key_exists('estatus', $body)) {
  $estatus = strtoupper(trim((string)$body['estatus']));
  if ($estatus === '') {
    unset($current['estatus']);
  } elseif (in_array($estatus, ALLOWED_ESTATUS, true)) {
    $current['estatus'] = $estatus;
  } else {
    http_response_code(400);
    echo json_encode([
      'ok' => false,
      'message' => 'Estatus no válido',
      'rows' => $rows,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (array_key_exists('fechaReagendada', $body)) {
  $fecha = trim((string)$body['fechaReagendada']);
  if ($fecha === '') {
    unset($current['fechaReagendada']);
  } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    $current['fechaReagendada'] = $fecha;
  } else {
    http_response_code(400);
    echo json_encode([
      'ok' => false,
      'message' => 'Fecha reagendada inválida',
      'rows' => $rows,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (array_key_exists('comentario', $body)) {
  $comentario = mb_substr(trim((string)$body['comentario']), 0, 500);
  if ($comentario === '') {
    unset($current['comentario']);
  } else {
    $current['comentario'] = $comentario;
  }
}

if ($current) {
  $rows[$id] = $current;
} else {
  unset($rows[$id]);
}

if (!write_rows($rows)) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No se pudo guardar en el servidor (permisos de escritura)',
    'rows' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  'ok' => true,
  'rows' => $rows ?: new stdClass(),
  'message' => 'Guardado',
], JSON_UNESCAPED_UNICODE);
