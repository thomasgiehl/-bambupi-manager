# 🖨️ BambuPi Manager

A web-based dashboard for Bambu Lab 3D printers running on a Raspberry Pi 4.
Built as an open-source alternative to Bambu Studio — fully local, no cloud required.

![Dashboard](docs/screenshot.png)

---

## ✨ Features

- **Live Dashboard** — Real-time camera stream, temperatures, print progress
- **Server-Sent Events** — Push updates directly from MQTT to browser, no polling overhead
- **Temperature Graphs** — Live Chart.js graphs showing nozzle & bed temperature history
- **Push Notifications** — Browser notifications when print finishes or fails (works in background tab)
- **Mobile Ready** — Responsive design with hamburger menu and bottom navigation bar
- **Full Printer Control** — Pause, resume, stop, home axes, control lights & fans
- **AMS Support** — RFID auto-detection + manual assignment for third-party filaments
- **Filament Management** — Track spools, remaining weight, costs per kg
- **File Manager** — Upload .3mf/.gcode files directly to the printer via FTP
- **Cost Calculator** — Calculate filament + electricity costs per print
- **Print History** — Full log of all prints with cost tracking
- **Multi-Printer** — Manage multiple Bambu Lab printers simultaneously
- **Tailscale Ready** — Remote access via VPN

## 🖨️ Supported Printers

| Printer | AMS | Camera | Control |
|---------|-----|--------|---------|
| X1C | ✅ | ✅ | ✅ |
| X1E | ✅ | ✅ | ✅ |
| P1S | ✅ | ✅ | ✅ |
| P1P | ✅ | ✅ | ✅ |
| A1 | AMS Lite | ✅ | ✅ |
| A1 Mini | AMS Lite | ✅ | ✅ |
| H2D | ✅ | ✅ | ✅ |

---

## 🚀 Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/bambupi-manager/main/install.sh | bash
```

> Replace `YOUR_USERNAME` with your GitHub username after forking.

---

## 📋 Requirements

- Raspberry Pi 4 (2GB+ RAM recommended)
- Raspberry Pi OS Lite 64-bit
- Bambu Lab printer in **LAN-only mode**
- Node.js 18+

---

## 🔧 Manual Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/bambupi-manager.git
cd bambupi-manager

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env

# Start
npm start
```

Then open `http://YOUR_PI_IP:3000` in your browser.

---

## ⚙️ Configuration

Edit `.env`:

```env
PORT=3000
ELECTRICITY_COST=0.35
PRINTER_WATT=350
```

---

## 📁 Project Structure

```
bambupi-manager/
├── public/          # Frontend (HTML, CSS, JS)
│   └── index.html   # Main dashboard
├── db/              # SQLite database
├── uploads/         # Uploaded print files
├── streams/         # Camera streams
├── server.js        # Express + MQTT backend
├── install.sh       # One-command installer
└── .env             # Configuration (not in git)
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- Inspired by [Mainsail](https://mainsail.xyz) and [Fluidd](https://fluidd.xyz)
- MQTT protocol reverse-engineered by the community at [OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI)
- Built with ❤️ for the Bambu Lab community
