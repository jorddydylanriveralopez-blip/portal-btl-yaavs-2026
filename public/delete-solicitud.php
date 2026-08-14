<?php
/**
 * Papelera de solicitudes (soft-delete compartido en el servidor).
 * GET  → { ok, ids, items: TrashItem[] }
 * POST → { id, password, action?: "delete"|"restore"|"purge", snapshot?: object }
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

/** Contraseñas válidas para eliminar / papelera (Orlando + Noemí). */
const DELETE_PASSWORDS = ['orlando01', 'Noemi2026'];
const STORE_FILE = __DIR__ . '/deleted-solicitudes.json';

function password_ok(string $password): bool {
  return in_array(trim($password), DELETE_PASSWORDS, true);
}

/**
 * @return array{ids: string[], items: array<string, array>}
 */
function read_store(): array {
  if (!is_file(STORE_FILE)) {
    return ['ids' => [], 'items' => []];
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return ['ids' => [], 'items' => []];
  }
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    return ['ids' => [], 'items' => []];
  }

  $ids = [];
  if (isset($data['ids']) && is_array($data['ids'])) {
    foreach ($data['ids'] as $id) {
      if (is_string($id) && $id !== '') {
        $ids[] = $id;
      }
    }
  }

  $items = [];
  if (isset($data['items']) && is_array($data['items'])) {
    foreach ($data['items'] as $key => $item) {
      if (!is_string($key) || $key === '' || !is_array($item)) {
        continue;
      }
      $items[$key] = $item;
    }
  }

  return [
    'ids' => array_values(array_unique($ids)),
    'items' => $items,
  ];
}

/**
 * @param string[] $ids
 * @param array<string, array> $items
 */
function write_store(array $ids, array $items): bool {
  $cleanIds = array_values(array_unique($ids));
  $cleanItems = [];
  foreach ($cleanIds as $id) {
    if (isset($items[$id]) && is_array($items[$id])) {
      $cleanItems[$id] = $items[$id];
    }
  }
  $payload = json_encode([
    'ids' => $cleanIds,
    'items' => $cleanItems,
    'updatedAt' => gmdate('c'),
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

/**
 * @param array<string, array> $items
 * @param string[] $ids
 * @return list<array>
 */
function items_list(array $items, array $ids): array {
  $list = [];
  foreach ($ids as $id) {
    if (!isset($items[$id]) || !is_array($items[$id])) {
      continue;
    }
    $row = $items[$id];
    $row['id'] = $id;
    $list[] = $row;
  }
  usort($list, static function ($a, $b) {
    $da = (string)($a['deletedAt'] ?? '');
    $db = (string)($b['deletedAt'] ?? '');
    return strcmp($db, $da);
  });
  return $list;
}

function snapshot_from_body(array $body, string $id): array {
  $snap = $body['snapshot'] ?? null;
  if (!is_array($snap)) {
    $snap = [];
  }
  return [
    'id' => $id,
    'deletedAt' => gmdate('c'),
    'puntoDeVenta' => isset($snap['puntoDeVenta']) ? (string)$snap['puntoDeVenta'] : null,
    'nombreYaavser' => isset($snap['nombreYaavser']) ? (string)$snap['nombreYaavser'] : null,
    'claveYaavser' => isset($snap['claveYaavser']) ? (string)$snap['claveYaavser'] : null,
    'estado' => isset($snap['estado']) ? (string)$snap['estado'] : null,
    'municipioAlcaldia' => isset($snap['municipioAlcaldia']) ? (string)$snap['municipioAlcaldia'] : null,
    'fechaBtl' => isset($snap['fechaBtl']) ? (string)$snap['fechaBtl'] : null,
    'flujoDePersonas' => isset($snap['flujoDePersonas']) ? (string)$snap['flujoDePersonas'] : null,
    'fotoUrl' => isset($snap['fotoUrl']) ? (string)$snap['fotoUrl'] : null,
  ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $store = read_store();
  echo json_encode([
    'ok' => true,
    'ids' => $store['ids'],
    'items' => items_list($store['items'], $store['ids']),
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

if (!password_ok($password)) {
  http_response_code(403);
  echo json_encode([
    'ok' => false,
    'message' => 'Contraseña incorrecta',
    'ids' => [],
    'items' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($id === '' && $action !== 'purge_all') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'message' => 'Falta el id de la solicitud',
    'ids' => [],
    'items' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$store = read_store();
$ids = $store['ids'];
$items = $store['items'];

if ($action === 'restore') {
  $ids = array_values(array_filter($ids, static fn($x) => $x !== $id));
  unset($items[$id]);
  $message = 'Solicitud restaurada';
} elseif ($action === 'purge') {
  // Quita de la papelera pero sigue oculta en el portal
  unset($items[$id]);
  if (!in_array($id, $ids, true)) {
    $ids[] = $id;
  }
  $message = 'Quitada de la papelera';
} elseif ($action === 'purge_all') {
  $items = [];
  $message = 'Papelera vaciada';
} else {
  if (!in_array($id, $ids, true)) {
    $ids[] = $id;
  }
  $items[$id] = snapshot_from_body($body, $id);
  $message = 'Enviada a la papelera';
}

if (!write_store($ids, $items)) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No se pudo guardar en el servidor (permisos de escritura)',
    'ids' => [],
    'items' => [],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  'ok' => true,
  'ids' => $ids,
  'items' => items_list($items, $ids),
  'message' => $message,
], JSON_UNESCAPED_UNICODE);
