#!/usr/bin/env bash
# InsightFace + CUDA onnxruntime for hybrid reference face swap
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source venv/bin/activate

# CPU onnxruntime shadows GPU package — remove both, install GPU only
pip uninstall -y onnxruntime onnxruntime-gpu 2>/dev/null || true
rm -rf venv/lib/python3.12/site-packages/onnxruntime* 2>/dev/null || true
pip install -q 'onnxruntime-gpu==1.20.0' insightface opencv-python-headless

python - <<'PY'
import onnxruntime as ort
assert "CUDAExecutionProvider" in ort.get_available_providers(), ort.get_available_providers()
print("onnxruntime", ort.__version__, ort.get_available_providers())
PY

echo "Hybrid deps ready. Run: bash start-server.sh"
