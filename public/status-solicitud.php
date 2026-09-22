<?php
/**
 * Forzar solicitudes en Activas o Terminadas (independiente de la fecha BTL).
 * GET  → { ok, activaIds: string[], terminadaIds: string[] }
 * POST → { id, action?: "activa"|"terminada" }
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

const STORE_FILE = __DIR__ . '/status-solicitudes.json';

/**
 * @return array{activaIds: string[], terminadaIds: string[]}
 */
function read_store(): array {
  $empty = ['activaIds' => [], 'terminadaIds' => []];
  if (!is_file(STORE_FILE)) {
    return $empty;
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return $empty;
  }
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    return $empty;
  }
  $activa = [];
  if (isset($data['activaIds']) && is_array($data['activaIds'])) {
    foreach ($data['activaIds'] as $id) {
      if (is_string($id) && $id !== '') {
        $activa[] = $id;
      }
    }
  }
  $terminada = [];
  if (isset($data['terminadaIds']) && is_array($data['terminadaIds'])) {
    foreach ($data['terminadaIds'] as $id) {
      if (is_string($id) && $id !== '') {
        $terminada[] = $id;
      }
    }
  }
  return [
    'activaIds' => array_values(array_unique($activa)),
    'terminadaIds' => array_values(array_unique($terminada)),
  ];
}

/**
 * @param string[] $activaIds
 * @param string[] $terminadaIds
 */
function write_store(array $activaIds, array $terminadaIds): bool {
  $payload = json_encode([
    'activaIds' => array_values(array_unique($activaIds)),
    'terminadaIds' => array_values(array_unique($terminadaIds)),
    'updatedAt' => gmdate('c'),
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $store = read_store();
  echo json_encode([
    'ok' => true,
    'activaIds' => $store['activaIds'],
    'terminadaIds' => $store['terminadaIds'],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode([
    'ok' => false,
    'message' => 'Método no permitido',
    'activaIds' => [],
    'terminadaIds' => [],
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
    'activaIds' => [],
    'terminadaIds' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$id = trim((string)($body['id'] ?? ''));
$action = strtolower(trim((string)($body['action'] ?? 'activa')));

if ($id === '') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'message' => 'Falta el id de la solicitud',
    'activaIds' => [],
    'terminadaIds' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$store = read_store();
$activaIds = $store['activaIds'];
$terminadaIds = $store['terminadaIds'];

if ($action === 'terminada') {
  $activaIds = array_values(array_filter($activaIds, static fn($x) => $x !== $id));
  if (!in_array($id, $terminadaIds, true)) {
    $terminadaIds[] = $id;
  }
  $message = 'Movida a terminadas';
} else {
  $terminadaIds = array_values(array_filter($terminadaIds, static fn($x) => $x !== $id));
  if (!in_array($id, $activaIds, true)) {
    $activaIds[] = $id;
  }
  $message = 'Restaurada en activas';
}

if (!write_store($activaIds, $terminadaIds)) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No se pudo guardar en el servidor (permisos de escritura)',
    'activaIds' => [],
    'terminadaIds' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  'ok' => true,
  'activaIds' => $activaIds,
  'terminadaIds' => $terminadaIds,
  'message' => $message,
], JSON_UNESCAPED_UNICODE);
