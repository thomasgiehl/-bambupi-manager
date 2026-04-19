# Repository Guidelines

## Project Structure & Module Organization
**BambuPi Manager** is a local web dashboard for Bambu Lab 3D printers, designed to run on a Raspberry Pi. The architecture consists of a Node.js backend and a multi-layered frontend.

- **Backend (`server.js`)**: A monolithic Express application that handles MQTT communication with printers, SQLite database management via `better-sqlite3`, and Server-Sent Events (SSE) for real-time updates.
- **Frontend (`public/`)**: Contains the primary web interface as a Progressive Web App (PWA).
- **Web Interface (`web/`)**: Includes PHP-based components and configuration files for Apache/Nginx reverse proxy setups.
- **Scripts (`scripts/`)**: Contains utility scripts for camera MJPEG streaming (`camera.py`) and environment setup.
- **Data (`db/`, `uploads/`, `thumbnails/`)**: Dedicated directories for the SQLite database, uploaded G-code files, and generated preview images.

## Build, Test, and Development Commands
The project primarily runs as a systemd service but can be managed manually.

- **Install**: `bash install.sh` (handles Node.js, ffmpeg, and dependencies)
- **Start Backend**: `node server.js`
- **Update System**:
  ```bash
  git pull
  npm install --production
  sudo systemctl restart bambupi
  ```
- **Check Credentials**: `sudo journalctl -u bambupi -f | grep "Pass:"` (retrieves auto-generated admin password)

## Coding Style & Naming Conventions
- **JavaScript**: Follows standard Node.js patterns. Uses `require` for modules. Employs **Pino** for structured logging.
- **Security**: Basic Auth is enforced globally via middleware. Credentials are bootstrapped into a `.env` file on first run.
- **Communication**: Real-time printer status is pushed via **SSE (Server-Sent Events)** with a polling fallback.

## Testing Guidelines
There is currently no automated test suite. Manual verification of printer connectivity and UI functionality is required. Ensure any changes to MQTT logic are tested against actual printer responses or mock data.

## Commit & Pull Request Guidelines
Commit messages follow a simple prefix convention:
- `feat:` for new features (e.g., `feat: add print queue`)
- `fix:` for bug fixes (e.g., `fix: cost calculation toggle`)
- `docs:` for documentation updates (e.g., `docs: update installation guide`)
- `chore:` for maintenance tasks
