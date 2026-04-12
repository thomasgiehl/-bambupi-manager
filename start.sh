#!/bin/bash
pkill -f "node server.js" 2>/dev/null
sleep 2
cd /home/bambupi/bambupi
source .env 2>/dev/null || true
nohup node server.js >> /home/bambupi/bambupi/server.log 2>&1 &
disown
echo "Server gestartet (PID $!)"
