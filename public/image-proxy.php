<?php
/**
 * Proxy de imágenes para embeber fotos en el PDF (evita bloqueo CORS de S3).
 * Solo permite hosts de Fillout / AWS S3 / Zite.
 */
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

$url = $_GET['url'] ?? '';
if (!is_string($url) || $url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'URL inválida';
  exit;
}

$parts = parse_url($url);
$scheme = strtolower((string)($parts['scheme'] ?? ''));
$host = strtolower((string)($parts['host'] ?? ''));

if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
  http_response_code(400);
  exit;
}

$allowed = (
  preg_match('/\\.amazonaws\\.com$/i', $host)
  || preg_match('/\\.fillout\\.com$/i', $host)
  || preg_match('/\\.zite\\.com$/i', $host)
  || $host === 'fillout.com'
  || $host === 'zite.com'
  || $host === 'images.fillout.com'
);

if (!$allowed) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Host no permitido';
  exit;
}

$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'timeout' => 25,
    'header' => "User-Agent: PortalBTL-YAAVS-PDF/1.0\r\nAccept: image/*\r\n",
  ],
  'ssl' => [
    'verify_peer' => true,
    'verify_peer_name' => true,
  ],
]);

$data = @file_get_contents($url, false, $ctx);
if ($data === false || $data === '') {
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'No se pudo obtener la imagen';
  exit;
}

$contentType = 'image/jpeg';
if (isset($http_response_header) && is_array($http_response_header)) {
  foreach ($http_response_header as $headerLine) {
    if (stripos($headerLine, 'Content-Type:') === 0) {
      $contentType = trim(substr($headerLine, strlen('Content-Type:')));
      break;
    }
  }
}

header('Content-Type: ' . $contentType);
header('Cache-Control: public, max-age=86400');
header('Access-Control-Allow-Origin: *');
echo $data;
