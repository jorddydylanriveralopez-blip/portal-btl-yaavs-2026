<?php
/**
 * Soft-delete de solicitudes en el portal (compartido en el servidor).
 * GET  → { ok, ids: string[] }
 * POST → { id, password, action?: "delete"|"restore" }
 *      → { ok, ids, message }
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

const DELETE_PASSWORD = 'orlando01';
const STORE_FILE = __DIR__ . '/deleted-solicitudes.json';

function read_deleted(): array {
  if (!is_file(STORE_FILE)) {
    return ['ids' => []];
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return ['ids' => []];
  }
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['ids']) || !is_array($data['ids'])) {
    return ['ids' => []];
  }
  $ids = [];
  foreach ($data['ids'] as $id) {
    if (is_string($id) && $id !== '') {
      $ids[] = $id;
    }
  }
  return ['ids' => array_values(array_unique($ids))];
}

function write_deleted(array $ids): bool {
  $payload = json_encode(
    ['ids' => array_values(array_unique($ids)), 'updatedAt' => gmdate('c')],
    JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
  );
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $store = read_deleted();
  echo json_encode([
    'ok' => true,
    'ids' => $store['ids'],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode([
    'ok' => false,
    'message' => 'Método no permitido',
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
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$password = (string)($body['password'] ?? '');
$id = trim((string)($body['id'] ?? ''));
$action = strtolower(trim((string)($body['action'] ?? 'delete')));

if ($password !== DELETE_PASSWORD) {
  http_response_code(403);
  echo json_encode([
    'ok' => false,
    'message' => 'Contraseña incorrecta',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($id === '') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'message' => 'Falta el id de la solicitud',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$store = read_deleted();
$ids = $store['ids'];

if ($action === 'restore') {
  $ids = array_values(array_filter($ids, static fn($x) => $x !== $id));
  $message = 'Solicitud restaurada';
} else {
  if (!in_array($id, $ids, true)) {
    $ids[] = $id;
  }
  $message = 'Solicitud eliminada del portal';
}

if (!write_deleted($ids)) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No se pudo guardar en el servidor (permisos de escritura)',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  'ok' => true,
  'ids' => $ids,
  'message' => $message,
], JSON_UNESCAPED_UNICODE);
