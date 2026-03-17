<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$cloudName = getenv('CLOUDINARY_CLOUD_NAME') ?: '';
$apiKey = getenv('CLOUDINARY_API_KEY') ?: '';
$apiSecret = getenv('CLOUDINARY_API_SECRET') ?: '';

if ($cloudName === '' || $apiKey === '' || $apiSecret === '') {
    http_response_code(500);
    echo json_encode([
        'error' => 'Missing Cloudinary server credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.'
    ]);
    exit;
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput ?: '', true);

$publicId = trim((string) ($payload['publicId'] ?? ''));
$resourceType = trim((string) ($payload['resourceType'] ?? 'image'));

if ($publicId === '') {
    http_response_code(422);
    echo json_encode(['error' => 'Missing publicId']);
    exit;
}

$timestamp = time();
$paramsToSign = [
    'invalidate' => 'true',
    'public_id' => $publicId,
    'timestamp' => (string) $timestamp,
];

ksort($paramsToSign);
$signatureBase = http_build_query($paramsToSign, '', '&', PHP_QUERY_RFC3986);
$signatureBase = str_replace('%7E', '~', $signatureBase);
$signature = sha1($signatureBase . $apiSecret);

$postFields = [
    'public_id' => $publicId,
    'invalidate' => 'true',
    'timestamp' => (string) $timestamp,
    'api_key' => $apiKey,
    'signature' => $signature,
];

$endpoint = sprintf(
    'https://api.cloudinary.com/v1_1/%s/%s/destroy',
    rawurlencode($cloudName),
    rawurlencode($resourceType !== '' ? $resourceType : 'image')
);

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query($postFields, '', '&', PHP_QUERY_RFC3986),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/x-www-form-urlencoded',
    ],
]);

$response = curl_exec($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Cloudinary request failed', 'detail' => $curlError]);
    exit;
}

$decoded = json_decode($response, true);

if ($httpCode >= 400) {
    http_response_code($httpCode);
    echo json_encode([
        'error' => $decoded['error']['message'] ?? 'Cloudinary destroy failed',
        'response' => $decoded,
    ]);
    exit;
}

echo json_encode([
    'ok' => true,
    'result' => $decoded,
]);
