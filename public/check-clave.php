<?php
/**
 * Valida si una clave YAAVSER ya existe en las solicitudes.
 * GET ?clave=24CL01072
 * → { "ok": true, "exists": false, "clave": "24CL01072" }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

function normalize_clave(string $raw): string {
  $t = strtoupper(trim($raw));
  $t = preg_replace('/\s+/', ' ', $t) ?? $t;
  if (preg_match('/([0-9]{2}CL[A-Z0-9]+)/', $t, $m)) {
    return $m[1];
  }
  $parts = preg_split('/\s+-\s+/', $t, 2);
  $first = trim((string)($parts[0] ?? $t));
  $first = preg_split('/\s{2,}/', $first, 2)[0] ?? $first;
  return trim($first);
}

$claveRaw = $_GET['clave'] ?? '';
if (!is_string($claveRaw) || trim($claveRaw) === '') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'exists' => false,
    'message' => 'Falta la clave YAAVSER',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$clave = normalize_clave($claveRaw);
if ($clave === '') {
  http_response_code(400);
  echo json_encode([
    'ok' => false,
    'exists' => false,
    'message' => 'Clave inválida',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$payload = json_encode([
  'inputs' => ['limit' => 500],
  'mode' => 'live',
  'workflowId' => 'getSolicitudes',
  'stream' => false,
], JSON_UNESCAPED_UNICODE);

$ctx = stream_context_create([
  'http' => [
    'method' => 'POST',
    'header' => "Content-Type: application/json;charset=UTF-8\r\nAccept: application/json\r\n",
    'content' => $payload,
    'timeout' => 25,
  ],
]);

$url = 'https://workflows.fillout.com/public/sy3akaxkpf/workflow/execute';
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
  http_response_code(502);
  echo json_encode([
    'ok' => false,
    'exists' => false,
    'message' => 'No se pudo consultar solicitudes',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$data = json_decode($raw, true);
$records = is_array($data) && isset($data['records']) && is_array($data['records'])
  ? $data['records']
  : [];

$deletedFile = __DIR__ . '/deleted-solicitudes.json';
$deletedIds = [];
if (is_file($deletedFile)) {
  $deletedRaw = @file_get_contents($deletedFile);
  $deletedData = is_string($deletedRaw) ? json_decode($deletedRaw, true) : null;
  if (is_array($deletedData) && isset($deletedData['ids']) && is_array($deletedData['ids'])) {
    foreach ($deletedData['ids'] as $did) {
      if (is_string($did) && $did !== '') {
        $deletedIds[$did] = true;
      }
    }
  }
}

$match = null;
foreach ($records as $row) {
  if (!is_array($row)) continue;
  $rowId = (string)($row['id'] ?? '');
  if ($rowId !== '' && isset($deletedIds[$rowId])) {
    continue;
  }
  $existing = normalize_clave((string)($row['claveYaavser'] ?? ''));
  if ($existing !== '' && $existing === $clave) {
    $match = $row;
    break;
  }
}

$exists = $match !== null;
echo json_encode([
  'ok' => true,
  'exists' => $exists,
  'clave' => $clave,
  'message' => $exists
    ? 'Esta clave YAAVSER ya tiene una solicitud registrada. No se puede enviar otra.'
    : 'Clave disponible',
  'solicitud' => $exists ? [
    'id' => $match['id'] ?? null,
    'puntoDeVenta' => $match['puntoDeVenta'] ?? null,
    'nombreYaavser' => $match['nombreYaavser'] ?? null,
    'fechaBtl' => $match['fechaBtl'] ?? null,
  ] : null,
], JSON_UNESCAPED_UNICODE);
