#!/usr/bin/env python3
"""
ScrollTax Local MLX-Whisper Server
Provides high-accuracy, local Apple Silicon speech-to-text transcription
for the ScrollTax Mirror of Accountability challenge.
"""

import io
import json
import os
import subprocess
import wave
from http.server import HTTPServer, BaseHTTPRequestHandler
import numpy as np

# Default port and model
PORT = int(os.environ.get("PORT", 8765))
MODEL_REPO = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-small-mlx")
SYNC_STORE_PATH = os.path.join(os.path.dirname(__file__), "sync_store.json")

# In-memory and disk sync store
SYNC_STORE = {}
if os.path.exists(SYNC_STORE_PATH):
    try:
        with open(SYNC_STORE_PATH, "r") as f:
            SYNC_STORE = json.load(f)
    except Exception as e:
        print(f"Notice: Could not load sync_store.json: {e}")

def save_sync_store():
    try:
        with open(SYNC_STORE_PATH, "w") as f:
            json.dump(SYNC_STORE, f)
    except Exception as e:
        print(f"Notice: Could not save sync_store.json: {e}")

try:
    import mlx_whisper
    HAS_MLX = True
except ImportError:
    HAS_MLX = False
    print("Warning: mlx_whisper not installed. Will run in mock/fallback mode.")

def audio_bytes_to_float32(raw_bytes: bytes) -> np.ndarray:
    """
    Decodes audio bytes (WAV or other formats) into a float32 16kHz mono numpy array.
    """
    # 1. Try reading as standard WAV
    if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WAVE":
        try:
            with wave.open(io.BytesIO(raw_bytes), "rb") as wf:
                channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                framerate = wf.getframerate()
                nframes = wf.getnframes()
                frames = wf.readframes(nframes)

                if sampwidth == 2:
                    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                elif sampwidth == 4:
                    audio = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
                else:
                    audio = np.frombuffer(frames, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

                if channels > 1:
                    audio = audio.reshape(-1, channels).mean(axis=1)

                # Resample to 16000 if needed
                if framerate != 16000 and len(audio) > 0:
                    indices = np.round(np.arange(0, len(audio), framerate / 16000)).astype(int)
                    indices = indices[indices < len(audio)]
                    audio = audio[indices]

                return audio.astype(np.float32)
        except Exception as e:
            print(f"Direct WAV parsing exception: {e}, falling back to ffmpeg if available")

    # 2. Try ffmpeg if available for WebM, OGG, or complex containers
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-threads", "0",
                "-i", "pipe:0",
                "-f", "s16le", "-ac", "1", "-ar", "16000",
                "pipe:1"
            ],
            input=raw_bytes,
            capture_output=True,
            check=True
        )
        return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    except Exception as e:
        # If ffmpeg is not present, attempt raw PCM float parsing
        print(f"ffmpeg conversion unavailable: {e}")
        try:
            return np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        except Exception:
            return np.zeros(16000, dtype=np.float32)

class WhisperRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Content-Length, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "" or clean_path == "/health":
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {
                "status": "ok",
                "engine": "mlx-whisper" if HAS_MLX else "mock",
                "model": MODEL_REPO,
                "message": "ScrollTax MLX-Whisper & Sync Server Active"
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
        elif clean_path.startswith("/sync/"):
            key_id = clean_path[len("/sync/"):]
            if key_id in SYNC_STORE:
                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(SYNC_STORE[key_id]).encode("utf-8"))
            else:
                self.send_response(404)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Sync record not found"}).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def do_POST(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/transcribe":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                audio_data = self.rfile.read(content_len)

                if not audio_data:
                    self.send_response(400)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "No audio payload provided"}).encode("utf-8"))
                    return

                audio_np = audio_bytes_to_float32(audio_data)

                if HAS_MLX:
                    result = mlx_whisper.transcribe(
                        audio_np,
                        path_or_hf_repo=MODEL_REPO
                    )
                    transcription = result.get("text", "").strip()
                else:
                    transcription = "I am wasting my time and I need to get back to work"

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"text": transcription}).encode("utf-8"))

            except Exception as e:
                print(f"Error during transcription: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        elif clean_path.startswith("/sync/"):
            key_id = clean_path[len("/sync/"):]
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len)
                data = json.loads(body.decode("utf-8"))

                if "iv" not in data or "ciphertext" not in data:
                    self.send_response(400)
                    self._send_cors_headers()
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Missing iv or ciphertext"}).encode("utf-8"))
                    return

                SYNC_STORE[key_id] = {
                    "iv": data["iv"],
                    "ciphertext": data["ciphertext"],
                    "updatedAt": data.get("updatedAt", 0)
                }
                save_sync_store()

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "keyId": key_id}).encode("utf-8"))

            except Exception as e:
                print(f"Error storing sync payload: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        # Concise logging
        print(f"[ScrollTax Whisper Server] {self.address_string()} - {format % args}")

def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, WhisperRequestHandler)
    print(f"======================================================")
    print(f" ScrollTax MLX-Whisper Server running at http://127.0.0.1:{PORT}")
    print(f" Engine: {'Apple Silicon MLX' if HAS_MLX else 'Fallback/Mock'}")
    print(f" Model:  {MODEL_REPO}")
    print(f" Ready to transcribe Mirror of Accountability audio.")
    print(f"======================================================")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
