<?php
/**
 * Capturas Trade Marketing por activación BTL.
 * GET    → { ok, entries: TradeEntry[] }
 * POST   → create/update (JSON) incl. satisfaccionImagenes (URL o data:image)
 * POST   → delete { action: "delete", id }
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

const STORE_FILE = __DIR__ . '/trade-marketing.json';
const UPLOAD_DIR = __DIR__ . '/trade-uploads';

/**
 * @return list<array<string, mixed>>
 */
function read_entries(): array {
  if (!is_file(STORE_FILE)) {
    return [];
  }
  $raw = @file_get_contents(STORE_FILE);
  if ($raw === false || $raw === '') {
    return [];
  }
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['entries']) || !is_array($data['entries'])) {
    return [];
  }
  $out = [];
  foreach ($data['entries'] as $row) {
    if (!is_array($row)) {
      continue;
    }
    $clean = clean_entry($row);
    if ($clean !== null) {
      $out[] = $clean;
    }
  }
  return $out;
}

/**
 * @param list<array<string, mixed>> $entries
 */
function write_entries(array $entries): bool {
  $payload = json_encode([
    'entries' => array_values($entries),
    'updatedAt' => gmdate('c'),
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  return @file_put_contents(STORE_FILE, $payload . "\n", LOCK_EX) !== false;
}

function clip(string $value, int $max): string {
  $value = trim($value);
  if ($value === '') {
    return '';
  }
  if (function_exists('mb_substr')) {
    return mb_substr($value, 0, $max);
  }
  return substr($value, 0, $max);
}

/**
 * @return list<string>
 */
function clean_images(mixed $raw): array {
  $out = ['', ''];
  if (!is_array($raw)) {
    return $out;
  }
  for ($i = 0; $i < 2; $i++) {
    if (!isset($raw[$i]) || !is_string($raw[$i])) {
      continue;
    }
    $v = trim($raw[$i]);
    if ($v === '') {
      continue;
    }
    if (str_starts_with($v, 'trade-uploads/') && preg_match('#^trade-uploads/[a-zA-Z0-9._-]+$#', $v)) {
      $out[$i] = $v;
      continue;
    }
    // data URLs se procesan en save; aquí solo URLs ya persistidas
    if (str_starts_with($v, 'data:image/')) {
      $out[$i] = $v;
    }
  }
  return $out;
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>|null
 */
function clean_entry(array $row): ?array {
  $id = isset($row['id']) && is_string($row['id']) ? trim($row['id']) : '';
  if ($id === '') {
    return null;
  }
  $fecha = isset($row['fecha']) && is_string($row['fecha']) ? trim($row['fecha']) : '';
  if ($fecha !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    $fecha = '';
  }
  $images = clean_images($row['satisfaccionImagenes'] ?? []);
  // En lectura, no devolver data URLs crudas (solo paths)
  foreach ($images as $i => $img) {
    if (str_starts_with($img, 'data:image/')) {
      $images[$i] = '';
    }
  }
  return [
    'id' => $id,
    'solicitudId' => isset($row['solicitudId']) && is_string($row['solicitudId'])
      ? clip($row['solicitudId'], 80)
      : '',
    'fecha' => $fecha,
    'clave' => isset($row['clave']) && is_string($row['clave']) ? clip($row['clave'], 80) : '',
    'ejecutivo' => isset($row['ejecutivo']) && is_string($row['ejecutivo'])
      ? clip($row['ejecutivo'], 120)
      : '',
    'gerente' => isset($row['gerente']) && is_string($row['gerente'])
      ? clip($row['gerente'], 120)
      : '',
    'municipioEstado' => isset($row['municipioEstado']) && is_string($row['municipioEstado'])
      ? clip($row['municipioEstado'], 160)
      : '',
    'satisfaccion' => isset($row['satisfaccion']) && is_string($row['satisfaccion'])
      ? clip($row['satisfaccion'], 2000)
      : '',
    'satisfaccionImagenes' => $images,
    'analisis' => isset($row['analisis']) && is_string($row['analisis'])
      ? clip($row['analisis'], 4000)
      : '',
    'ventasXrayImagen' => (static function () use ($row): string {
      $v = isset($row['ventasXrayImagen']) && is_string($row['ventasXrayImagen'])
        ? trim($row['ventasXrayImagen'])
        : '';
      if ($v !== '' && str_starts_with($v, 'trade-uploads/') && preg_match('#^trade-uploads/[a-zA-Z0-9._-]+$#', $v)) {
        return $v;
      }
      return '';
    })(),
    'ventasXray' => isset($row['ventasXray']) && is_string($row['ventasXray'])
      ? clip($row['ventasXray'], 500)
      : '',
    'ventasXrayAnalisis' => isset($row['ventasXrayAnalisis']) && is_string($row['ventasXrayAnalisis'])
      ? clip($row['ventasXrayAnalisis'], 2000)
      : '',
    'ventasEncuesta' => isset($row['ventasEncuesta']) && is_string($row['ventasEncuesta'])
      ? clip($row['ventasEncuesta'], 500)
      : '',
    'createdAt' => isset($row['createdAt']) && is_string($row['createdAt'])
      ? $row['createdAt']
      : gmdate('c'),
    'updatedAt' => isset($row['updatedAt']) && is_string($row['updatedAt'])
      ? $row['updatedAt']
      : gmdate('c'),
  ];
}

function new_id(): string {
  try {
    return bin2hex(random_bytes(8));
  } catch (Throwable $e) {
    return uniqid('tm_', true);
  }
}

function ensure_upload_dir(): bool {
  if (is_dir(UPLOAD_DIR)) {
    return is_writable(UPLOAD_DIR);
  }
  return @mkdir(UPLOAD_DIR, 0755, true);
}

function delete_upload_file(string $rel): void {
  if ($rel === '' || !str_starts_with($rel, 'trade-uploads/')) {
    return;
  }
  if (!preg_match('#^trade-uploads/[a-zA-Z0-9._-]+$#', $rel)) {
    return;
  }
  $path = __DIR__ . '/' . $rel;
  if (is_file($path)) {
    @unlink($path);
  }
}

/**
 * @param list<string> $images
 */
function delete_entry_images(array $images): void {
  foreach ($images as $img) {
    if (is_string($img)) {
      delete_upload_file($img);
    }
  }
}

/**
 * Guarda data URL o conserva path existente. $tag ej. sat-1, sat-2, xray
 */
function persist_image(string $id, string $tag, string $value, string $previous): string {
  $value = trim($value);
  $tag = preg_replace('/[^a-zA-Z0-9_-]/', '', $tag) ?: 'img';
  if ($value === '') {
    if ($previous !== '') {
      delete_upload_file($previous);
    }
    return '';
  }
  if (str_starts_with($value, 'trade-uploads/') && preg_match('#^trade-uploads/[a-zA-Z0-9._-]+$#', $value)) {
    return $value;
  }
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,#i', $value, $m)) {
    return $previous;
  }
  $ext = strtolower($m[1]) === 'jpg' ? 'jpg' : strtolower($m[1]);
  if ($ext === 'jpeg') {
    $ext = 'jpg';
  }
  $b64 = substr($value, strpos($value, ',') + 1);
  $bin = base64_decode($b64, true);
  if ($bin === false || strlen($bin) < 32 || strlen($bin) > 4_500_000) {
    return $previous;
  }
  if (!ensure_upload_dir()) {
    return $previous;
  }
  $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $id) ?: 'tm';
  $rel = 'trade-uploads/' . $safeId . '-' . $tag . '.' . $ext;
  $path = __DIR__ . '/' . $rel;
  if (@file_put_contents($path, $bin) === false) {
    return $previous;
  }
  if ($previous !== '' && $previous !== $rel) {
    delete_upload_file($previous);
  }
  return $rel;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode([
    'ok' => true,
    'entries' => read_entries(),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  // Subida binaria de evidencias (evita romper el JSON por base64 grande)
  $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
  if (
    isset($_FILES['file'])
    && is_array($_FILES['file'])
    && (stripos($contentType, 'multipart/form-data') !== false || !empty($_FILES['file']['tmp_name']))
  ) {
    $actionUp = isset($_POST['action']) ? strtolower(trim((string) $_POST['action'])) : 'upload';
    if ($actionUp !== 'upload') {
      http_response_code(400);
      echo json_encode(['ok' => false, 'message' => 'Acción de subida inválida']);
      exit;
    }
    $err = (int) ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err !== UPLOAD_ERR_OK) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'message' => 'Error al subir el archivo (' . $err . ')']);
      exit;
    }
    $tmp = (string) ($_FILES['file']['tmp_name'] ?? '');
    $size = (int) ($_FILES['file']['size'] ?? 0);
    if ($tmp === '' || !is_uploaded_file($tmp) || $size < 32 || $size > 4_500_000) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'message' => 'Archivo inválido o demasiado grande (máx 4.5 MB)']);
      exit;
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp) ?: '';
    $extMap = [
      'image/jpeg' => 'jpg',
      'image/jpg' => 'jpg',
      'image/png' => 'png',
      'image/webp' => 'webp',
    ];
    if (!isset($extMap[$mime])) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'message' => 'Solo se permiten JPG, PNG o WEBP']);
      exit;
    }
    $tag = isset($_POST['tag']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $_POST['tag']) : 'img';
    if ($tag === '') {
      $tag = 'img';
    }
    $id = isset($_POST['id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $_POST['id']) : '';
    if ($id === '') {
      $id = new_id();
    }
    if (!ensure_upload_dir()) {
      http_response_code(500);
      echo json_encode(['ok' => false, 'message' => 'No se pudo crear carpeta de uploads']);
      exit;
    }
    $rel = 'trade-uploads/' . $id . '-' . $tag . '.' . $extMap[$mime];
    $dest = __DIR__ . '/' . $rel;
    if (!@move_uploaded_file($tmp, $dest)) {
      // fallback copy (algunos entornos)
      if (!@rename($tmp, $dest) && !@copy($tmp, $dest)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'message' => 'No se pudo guardar la imagen en el servidor']);
        exit;
      }
    }
    @chmod($dest, 0644);
    echo json_encode([
      'ok' => true,
      'message' => 'Imagen subida',
      'path' => $rel,
      'id' => $id,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $raw = file_get_contents('php://input');
  $body = json_decode($raw ?: '{}', true);
  if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'JSON inválido', 'entries' => []]);
    exit;
  }

  $action = isset($body['action']) && is_string($body['action'])
    ? strtolower(trim($body['action']))
    : 'save';
  $entries = read_entries();

  if ($action === 'delete') {
    $id = isset($body['id']) && is_string($body['id']) ? trim($body['id']) : '';
    if ($id === '') {
      http_response_code(400);
      echo json_encode(['ok' => false, 'message' => 'Falta el id', 'entries' => $entries]);
      exit;
    }
    foreach ($entries as $existing) {
      if (($existing['id'] ?? '') === $id) {
        delete_entry_images(is_array($existing['satisfaccionImagenes'] ?? null)
          ? $existing['satisfaccionImagenes']
          : []);
        if (isset($existing['ventasXrayImagen']) && is_string($existing['ventasXrayImagen'])) {
          delete_upload_file($existing['ventasXrayImagen']);
        }
        break;
      }
    }
    $entries = array_values(array_filter(
      $entries,
      static fn(array $e): bool => ($e['id'] ?? '') !== $id,
    ));
    if (!write_entries($entries)) {
      http_response_code(500);
      echo json_encode(['ok' => false, 'message' => 'No se pudo borrar', 'entries' => []]);
      exit;
    }
    echo json_encode([
      'ok' => true,
      'message' => 'Eliminado',
      'entries' => $entries,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $id = isset($body['id']) && is_string($body['id']) ? trim($body['id']) : '';
  $now = gmdate('c');
  $createdAt = $now;
  $prevImages = ['', ''];
  $prevXray = '';
  if ($id !== '') {
    foreach ($entries as $existing) {
      if (($existing['id'] ?? '') === $id) {
        $createdAt = is_string($existing['createdAt'] ?? null)
          ? $existing['createdAt']
          : $now;
        $prevImages = clean_images($existing['satisfaccionImagenes'] ?? []);
        foreach ($prevImages as $i => $img) {
          if (str_starts_with($img, 'data:image/')) {
            $prevImages[$i] = '';
          }
        }
        if (isset($existing['ventasXrayImagen']) && is_string($existing['ventasXrayImagen'])) {
          $prevXray = trim($existing['ventasXrayImagen']);
          if (str_starts_with($prevXray, 'data:image/')) {
            $prevXray = '';
          }
        }
        break;
      }
    }
  } else {
    $id = new_id();
  }

  $incomingImages = clean_images($body['satisfaccionImagenes'] ?? null);
  $savedImages = [
    persist_image($id, 'sat-1', $incomingImages[0], $prevImages[0]),
    persist_image($id, 'sat-2', $incomingImages[1], $prevImages[1]),
  ];
  $incomingXray = isset($body['ventasXrayImagen']) && is_string($body['ventasXrayImagen'])
    ? trim($body['ventasXrayImagen'])
    : '';
  $savedXray = persist_image($id, 'xray', $incomingXray, $prevXray);

  $clean = clean_entry([
    'id' => $id,
    'solicitudId' => $body['solicitudId'] ?? '',
    'fecha' => $body['fecha'] ?? '',
    'clave' => $body['clave'] ?? '',
    'ejecutivo' => $body['ejecutivo'] ?? '',
    'gerente' => $body['gerente'] ?? '',
    'municipioEstado' => $body['municipioEstado'] ?? '',
    'satisfaccion' => $body['satisfaccion'] ?? '',
    'satisfaccionImagenes' => $savedImages,
    'analisis' => $body['analisis'] ?? '',
    'ventasXrayImagen' => $savedXray,
    'ventasXray' => $body['ventasXray'] ?? '',
    'ventasXrayAnalisis' => $body['ventasXrayAnalisis'] ?? '',
    'ventasEncuesta' => $body['ventasEncuesta'] ?? '',
    'createdAt' => $createdAt,
    'updatedAt' => $now,
  ]);

  if ($clean === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Datos inválidos', 'entries' => $entries]);
    exit;
  }

  if (($clean['fecha'] ?? '') === '') {
    http_response_code(400);
    echo json_encode([
      'ok' => false,
      'message' => 'La fecha es obligatoria',
      'entries' => $entries,
    ]);
    exit;
  }

  $found = false;
  foreach ($entries as $i => $existing) {
    if (($existing['id'] ?? '') === $id) {
      $entries[$i] = $clean;
      $found = true;
      break;
    }
  }
  if (!$found) {
    $entries[] = $clean;
  }

  usort($entries, static function (array $a, array $b): int {
    return strcmp((string) ($b['fecha'] ?? ''), (string) ($a['fecha'] ?? ''));
  });

  if (!write_entries($entries)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'message' => 'No se pudo guardar', 'entries' => []]);
    exit;
  }

  echo json_encode([
    'ok' => true,
    'message' => $found ? 'Actualizado' : 'Guardado',
    'entries' => $entries,
    'entry' => $clean,
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'message' => 'Método no permitido', 'entries' => []]);
