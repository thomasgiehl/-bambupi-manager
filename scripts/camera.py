#!/usr/bin/env python3
import subprocess
import os
import sys
import time
from bambu_connect import BambuClient
from dotenv import dotenv_values

config = dotenv_values("/home/bambupi/bambupi/.env")

HOST = config["PRINTER_IP"]
CODE = config["PRINTER_ACCESS_CODE"]
SERIAL = config["PRINTER_SERIAL"]
STREAMS = "/home/bambupi/bambupi/streams"

os.makedirs(STREAMS, exist_ok=True)

client = BambuClient(
    hostname=HOST,
    access_code=CODE,
    serial=SERIAL
)

ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-f", "mjpeg",
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "5",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", f"{STREAMS}/segment_%03d.ts",
    f"{STREAMS}/stream.m3u8"
]

print("📹 Starte Kamera Stream...")
ffmpeg = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

def on_frame(frame):
    try:
        ffmpeg.stdin.write(frame)
        ffmpeg.stdin.flush()
    except Exception as e:
        print(f"Frame Fehler: {e}")

try:
    client.start_camera_stream(on_frame)
except KeyboardInterrupt:
    print("Stream gestoppt")
    ffmpeg.stdin.close()
    ffmpeg.wait()