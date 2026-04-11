#!/bin/bash
source /home/bambupi/bambupi/.env

mkdir -p /home/bambupi/bambupi/streams
rm -f /home/bambupi/bambupi/streams/*.ts
rm -f /home/bambupi/bambupi/streams/*.m3u8

echo "📹 Starte Kamera Stream..."

ffmpeg \
  -rtsp_transport tcp \
  -i "rtsp://bblp:${PRINTER_ACCESS_CODE}@${PRINTER_IP}:554/streaming/live/1" \
  -c:v copy \
  -an \
  -f hls \
  -hls_time 2 \
  -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  -hls_segment_filename "/home/bambupi/bambupi/streams/segment_%03d.ts" \
  "/home/bambupi/bambupi/streams/stream.m3u8"