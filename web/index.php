<?php
require_once __DIR__ . '/api.php';
requireAuth();

$page      = preg_replace('/[^a-z]/', '', strtolower($_GET['page'] ?? 'dashboard'));
$pageFile  = __DIR__ . '/pages/' . $page . '.php';

if (!file_exists($pageFile)) {
    $page     = 'dashboard';
    $pageFile = __DIR__ . '/pages/dashboard.php';
}

$titles = [
    'dashboard'   => 'Dashboard',
    'printers'    => 'Drucker',
    'filaments'   => 'Filamente',
    'files'       => 'Dateien',
    'queue'       => 'Druck-Warteschlange',
    'history'     => 'Druckhistorie',
    'calculator'  => 'Kostenrechner',
    'maintenance' => 'Wartung',
    'settings'    => 'Einstellungen',
    'kiosk'       => 'Kiosk Modus',
];
$pageTitle = $titles[$page] ?? ucfirst($page);

require __DIR__ . '/layout/header.php';
require $pageFile;
require __DIR__ . '/layout/footer.php';
