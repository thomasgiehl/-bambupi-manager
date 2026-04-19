<?php
// Ruft die Node.js API auf und gibt decoded JSON zurück
function api(string $path, string $method = 'GET', mixed $body = null): mixed {
    $url = 'http://127.0.0.1:3000' . $path;
    $user = $_SERVER['PHP_AUTH_USER'] ?? '';
    $pass = $_SERVER['PHP_AUTH_PW']  ?? '';

    $opts = [
        'http' => [
            'method'  => $method,
            'header'  => implode("\r\n", [
                'Content-Type: application/json',
                'Authorization: Basic ' . base64_encode("$user:$pass"),
            ]),
            'timeout' => 8,
            'ignore_errors' => true,
        ]
    ];
    if ($body !== null) {
        $opts['http']['content'] = json_encode($body);
    }
    $ctx  = stream_context_create($opts);
    $raw  = @file_get_contents($url, false, $ctx);
    return $raw !== false ? json_decode($raw, true) : null;
}

// Basic-Auth weiterleiten: Browser-Credentials an Node.js durchreichen
function requireAuth(): void {
    // Prüfen ob Setup erforderlich ist
    $status = api('/api/setup/status');
    if ($status && ($status['setup_required'] ?? false)) {
        if (($_GET['page'] ?? '') !== 'setup') {
            header('Location: index.php?page=setup');
            exit;
        }
        return;
    }

    if (empty($_SERVER['PHP_AUTH_USER'])) {
        header('WWW-Authenticate: Basic realm="BambuPi Manager"');
        header('HTTP/1.1 401 Unauthorized');
        exit;
    }
    // Prüfen ob Credentials gültig sind
    $test = api('/api/printers');
    if ($test === null) {
        header('WWW-Authenticate: Basic realm="BambuPi Manager"');
        header('HTTP/1.1 401 Unauthorized');
        exit;
    }
}
