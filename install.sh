#!/bin/bash
# ═══════════════════════════════════════════════
#  BambuPi Manager — Ein-Befehl Installer
#  https://github.com/thomasgiehl/-bambupi-manager
# ═══════════════════════════════════════════════

set -e

REPO="https://github.com/thomasgiehl/-bambupi-manager.git"
INSTALL_DIR="$HOME/bambupi-manager"
SERVICE_NAME="bambupi"

echo ""
echo "🖨️  BambuPi Manager Installer"
echo "══════════════════════════════"
echo ""

# Node.js prüfen
if ! command -v node &> /dev/null; then
  echo "📦 Node.js wird installiert..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "✅ Node.js $(node -v)"

# Git prüfen
if ! command -v git &> /dev/null; then
  echo "📦 Git wird installiert..."
  sudo apt-get install -y git
fi

# Repository klonen oder updaten
if [ -d "$INSTALL_DIR" ]; then
  echo "🔄 Update läuft..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "📥 Repository wird geklont..."
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Ordner anlegen
mkdir -p db uploads streams scripts certs

# Platzhalter damit git die leeren Ordner trackt
touch uploads/.gitkeep streams/.gitkeep

# Dependencies installieren
echo "📦 Dependencies werden installiert..."
npm install --production

# ── go2rtc Binary ─────────────────────────────────────────────────────────────
GO2RTC_VERSION="1.9.14"
GO2RTC_SHA256_ARM64="359fabade8a7a51e81a55fe6df6b0ef81764a5e1d63179577534eaaa71904b50"
GO2RTC_SHA256_AMD64="1e58b9aecb897b79e6f17f040a9f1cd8c3de8d4d37eea481c35459e6b8a48f5d"

ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  GO2RTC_ARCH="arm64"
  GO2RTC_SHA256="$GO2RTC_SHA256_ARM64"
elif [ "$ARCH" = "x86_64" ]; then
  GO2RTC_ARCH="amd64"
  GO2RTC_SHA256="$GO2RTC_SHA256_AMD64"
else
  echo "⚠️  Unbekannte Architektur: $ARCH — go2rtc wird übersprungen"
  GO2RTC_ARCH=""
fi

GO2RTC_BIN="scripts/go2rtc_linux_${GO2RTC_ARCH}"

if [ -n "$GO2RTC_ARCH" ] && [ ! -f "$GO2RTC_BIN" ]; then
  echo "📥 go2rtc v${GO2RTC_VERSION} (${GO2RTC_ARCH}) wird heruntergeladen..."
  GO2RTC_URL="https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_linux_${GO2RTC_ARCH}"
  curl -fsSL "$GO2RTC_URL" -o "$GO2RTC_BIN.tmp"

  # SHA-256 prüfen
  ACTUAL_SHA=$(sha256sum "$GO2RTC_BIN.tmp" | awk '{print $1}')
  if [ "$ACTUAL_SHA" != "$GO2RTC_SHA256" ]; then
    rm -f "$GO2RTC_BIN.tmp"
    echo "❌ SHA-256-Prüfung fehlgeschlagen!"
    echo "   Erwartet: $GO2RTC_SHA256"
    echo "   Erhalten: $ACTUAL_SHA"
    echo "   go2rtc wurde NICHT installiert — Kamera-Stream nicht verfügbar"
  else
    mv "$GO2RTC_BIN.tmp" "$GO2RTC_BIN"
    chmod +x "$GO2RTC_BIN"
    echo "✅ go2rtc installiert und Integrität verifiziert"
  fi
elif [ -n "$GO2RTC_ARCH" ]; then
  echo "✅ go2rtc bereits vorhanden ($GO2RTC_BIN)"
fi

# ── Bambu CA-Zertifikat ───────────────────────────────────────────────────────
if [ ! -f "certs/bambu-ca.crt" ]; then
  echo "🔒 Bambu CA-Zertifikat wird eingerichtet..."
  cat > certs/bambu-ca.crt << 'CERT'
-----BEGIN CERTIFICATE-----
MIIDZTCCAk2gAwIBAgIUV1FckwXElyek1onFnQ9kL7Bk4N8wDQYJKoZIhvcNAQEL
BQAwQjELMAkGA1UEBhMCQ04xIjAgBgNVBAoMGUJCTCBUZWNobm9sb2dpZXMgQ28u
LCBMdGQxDzANBgNVBAMMBkJCTCBDQTAeFw0yMjA0MDQwMzQyMTFaFw0zMjA0MDEw
MzQyMTFaMEIxCzAJBgNVBAYTAkNOMSIwIAYDVQQKDBlCQkwgVGVjaG5vbG9naWVz
IENvLiwgTHRkMQ8wDQYDVQQDDAZCQkwgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQDL3pnDdxGOk5Z6vugiT4dpM0ju+3Xatxz09UY7mbj4tkIdby4H
oeEdiYSZjc5LJngJuCHwtEbBJt1BriRdSVrF6M9D2UaBDyamEo0dxwSaVxZiDVWC
eeCPdELpFZdEhSNTaT4O7zgvcnFsfHMa/0vMAkvE7i0qp3mjEzYLfz60axcDoJLk
p7n6xKXI+cJbA4IlToFjpSldPmC+ynOo7YAOsXt7AYKY6Glz0BwUVzSJxU+/+VFy
/QrmYGNwlrQtdREHeRi0SNK32x1+bOndfJP0sojuIrDjKsdCLye5CSZIvqnbowwW
1jRwZgTBR29Zp2nzCoxJYcU9TSQp/4KZuWNVAgMBAAGjUzBRMB0GA1UdDgQWBBSP
NEJo3GdOj8QinsV8SeWr3US+HjAfBgNVHSMEGDAWgBSPNEJo3GdOj8QinsV8SeWr
3US+HjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQABlBIT5ZeG
fgcK1LOh1CN9sTzxMCLbtTPFF1NGGA13mApu6j1h5YELbSKcUqfXzMnVeAb06Htu
3CoCoe+wj7LONTFO++vBm2/if6Jt/DUw1CAEcNyqeh6ES0NX8LJRVSe0qdTxPJuA
BdOoo96iX89rRPoxeed1cpq5hZwbeka3+CJGV76itWp35Up5rmmUqrlyQOr/Wax6
itosIzG0MfhgUzU51A2P/hSnD3NDMXv+wUY/AvqgIL7u7fbDKnku1GzEKIkfH8hm
Rs6d8SCU89xyrwzQ0PR853irHas3WrHVqab3P+qNwR0YirL0Qk7Xt/q3O1griNg2
Blbjg3obpHo9
-----END CERTIFICATE-----
CERT
  echo "✅ Bambu CA-Zertifikat eingerichtet (TLS-Verifikation aktiv)"
fi

# .env anlegen falls nicht vorhanden
if [ ! -f .env ]; then
  cat > .env << 'EOF'
PORT=3000
ELECTRICITY_COST=0.35
PRINTER_WATT=350
EOF
  echo "✅ .env Datei erstellt"
fi

# Systemd Service anlegen
echo "⚙️  Service wird eingerichtet..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=BambuPi Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

# IP ermitteln
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "══════════════════════════════════════════"
echo "✅ BambuPi Manager erfolgreich installiert!"
echo ""
echo "🌐 Öffne im Browser:"
echo "   http://${IP}:3000"
echo ""
echo "📋 Nützliche Befehle:"
echo "   Status:   sudo systemctl status $SERVICE_NAME"
echo "   Logs:     sudo journalctl -u $SERVICE_NAME -f"
echo "   Neustart: sudo systemctl restart $SERVICE_NAME"
echo "══════════════════════════════════════════"
echo ""
