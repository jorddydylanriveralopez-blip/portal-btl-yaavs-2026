<?php
/**
 * Proxy de reportes BTL (Formulario 7) para el portal.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$upstream = 'https://lightslategrey-deer-478072.hostingersite.com/api/responses';

$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'timeout' => 30,
    'header' => "Accept: application/json\r\n",
  ],
]);

$body = @file_get_contents($upstream, false, $ctx);
if ($body === false) {
  http_response_code(502);
  echo json_encode(['ok' => false, 'error' => 'No se pudieron obtener los reportes BTL']);
  exit;
}

http_response_code(200);
echo $body;
