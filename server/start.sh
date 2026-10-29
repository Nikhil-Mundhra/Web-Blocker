#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"

echo "Checking environment for ScrollTax MLX-Whisper Server..."

if [ -f "$PROJECT_ROOT/.venv/bin/python3" ]; then
    echo "Using existing project virtualenv at .venv..."
    exec "$PROJECT_ROOT/.venv/bin/python3" "$DIR/whisper_server.py"
elif command -v uv >/dev/null 2>&1; then
    echo "Using uv to run with mlx-whisper..."
    exec uv run --with mlx-whisper python "$DIR/whisper_server.py"
else
    echo "Using system python3..."
    exec python3 "$DIR/whisper_server.py"
fi
