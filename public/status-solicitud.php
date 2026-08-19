<?php
/**
 * Forzar solicitudes restauradas a Activas (aunque la fecha BTL ya haya pasado).
 * GET  → { ok, activaIds: string[] }
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
 * @return string[]
 */
function read_activa_ids(): array {
  if (!is_file(STORE_FILE)) {
    return [];
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return [];
  }
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['activaIds']) || !is_array($data['activaIds'])) {
    return [];
  }
  $ids = [];
  foreach ($data['activaIds'] as $id) {
    if (is_string($id) && $id !== '') {
      $ids[] = $id;
    }
  }
  return array_values(array_unique($ids));
}

/**
 * @param string[] $ids
 */
function write_activa_ids(array $ids): bool {
  $payload = json_encode([
    'activaIds' => array_values(array_unique($ids)),
    'updatedAt' => gmdate('c'),
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode([
    'ok' => true,
    'activaIds' => read_activa_ids(),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode([
    'ok' => false,
    'message' => 'Método no permitido',
    'activaIds' => [],
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
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$ids = read_activa_ids();

if ($action === 'terminada') {
  $ids = array_values(array_filter($ids, static fn($x) => $x !== $id));
  $message = 'Movida a terminadas';
} else {
  if (!in_array($id, $ids, true)) {
    $ids[] = $id;
  }
  $message = 'Restaurada en activas';
}

if (!write_activa_ids($ids)) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No se pudo guardar en el servidor (permisos de escritura)',
    'activaIds' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  'ok' => true,
  'activaIds' => $ids,
  'message' => $message,
], JSON_UNESCAPED_UNICODE);
