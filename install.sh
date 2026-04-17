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
mkdir -p db uploads streams

# Platzhalter damit git die leeren Ordner trackt
touch uploads/.gitkeep streams/.gitkeep

# Dependencies installieren
echo "📦 Dependencies werden installiert..."
npm install --production

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
