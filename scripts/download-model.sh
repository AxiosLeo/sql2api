#!/usr/bin/env bash
# download-model.sh — download GGUF models for sql2api local inference
#
# Usage:
#   bash scripts/download-model.sh [preset] [options]
#
# Presets:
#   qwen2.5-coder-1.5b   ~1.1GB  (low-resource)
#   qwen2.5-coder-3b     ~2GB    (default, SQL quality/size balance)
#   qwen2.5-coder-7b     ~4.7GB  (higher quality, multi-shard)
#   qwen3.8-27b          ~15.3GB (Qwen3.8-27B Unsloth UD-Q4_K_M)
#
# Options:
#   --url <gguf-url>     Custom GGUF URL (overrides preset)
#   --dir <output-dir>   Output directory (default: apps/services/models)
#   --mirror ms|hf       Download mirror: ModelScope (default) or hf-mirror
#   --set-env            Update apps/services/.env LLAMA_MODEL_PATH after download
#   -h, --help           Show help
#
# Examples:
#   bash scripts/download-model.sh qwen2.5-coder-3b --set-env
#   bash scripts/download-model.sh --url https://example.com/model.gguf --set-env
#   bash scripts/download-model.sh qwen2.5-coder-7b --mirror hf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PRESET="qwen2.5-coder-3b"
OUT_DIR="${REPO_ROOT}/apps/services/models"
MIRROR="ms"
SET_ENV=0
CUSTOM_URL=""

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# ─── preset definitions ─────────────────────────────────────────────────────
# Each preset: "filename1|filename2|..." relative to the repo base URL

preset_files() {
  case "$1" in
    qwen2.5-coder-1.5b)
      echo "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
      ;;
    qwen2.5-coder-3b)
      echo "qwen2.5-coder-3b-instruct-q4_k_m.gguf"
      ;;
    qwen2.5-coder-7b)
      echo "qwen2.5-coder-7b-instruct-q4_k_m-00001-of-00002.gguf"
      echo "qwen2.5-coder-7b-instruct-q4_k_m-00002-of-00002.gguf"
      ;;
    qwen3.8-27b)
      echo "Qwen3.8-27B-UD-Q4_K_M.gguf"
      ;;
    *)
      echo "Unknown preset: $1" >&2
      echo "Available: qwen2.5-coder-1.5b, qwen2.5-coder-3b, qwen2.5-coder-7b, qwen3.8-27b" >&2
      exit 1
      ;;
  esac
}

preset_repo() {
  case "$1" in
    qwen2.5-coder-1.5b) echo "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF" ;;
    qwen2.5-coder-3b)   echo "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF" ;;
    qwen2.5-coder-7b)   echo "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF" ;;
    qwen3.8-27b)        echo "unsloth/Qwen3.8-27B-GGUF" ;;
  esac
}

build_url() {
  local repo="$1"
  local file="$2"
  case "$MIRROR" in
    ms)
      echo "https://modelscope.cn/models/${repo}/resolve/master/${file}"
      ;;
    hf)
      echo "https://hf-mirror.com/${repo}/resolve/main/${file}"
      ;;
    *)
      echo "Unknown mirror: $MIRROR (use ms or hf)" >&2
      exit 1
      ;;
  esac
}

download_file() {
  local url="$1"
  local dest="$2"
  local part="${dest}.part"

  if [[ -f "$dest" ]]; then
    echo "[skip] already exists: $dest"
    return 0
  fi

  echo "[download] $url"
  echo "        -> $dest"
  mkdir -p "$(dirname "$dest")"
  curl -L -C - --fail --progress-bar -o "$part" "$url"
  mv "$part" "$dest"
  echo "[done] $(du -h "$dest" | awk '{print $1}')  $dest"
}

update_env() {
  local model_path="$1"
  local env_file="${REPO_ROOT}/apps/services/.env"
  local abs_path
  abs_path="$(cd "$(dirname "$model_path")" && pwd)/$(basename "$model_path")"

  touch "$env_file"
  if grep -q '^LLAMA_MODEL_PATH=' "$env_file" 2>/dev/null; then
    # portable in-place edit
    local tmp
    tmp="$(mktemp)"
    sed "s|^LLAMA_MODEL_PATH=.*|LLAMA_MODEL_PATH=${abs_path}|" "$env_file" > "$tmp"
    mv "$tmp" "$env_file"
  else
    echo "LLAMA_MODEL_PATH=${abs_path}" >> "$env_file"
  fi
  echo "[env] LLAMA_MODEL_PATH=${abs_path}"
}

# ─── parse args ──────────────────────────────────────────────────────────────

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --url) CUSTOM_URL="$2"; shift 2 ;;
    --dir) OUT_DIR="$2"; shift 2 ;;
    --mirror) MIRROR="$2"; shift 2 ;;
    --set-env) SET_ENV=1; shift ;;
    --*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [[ ${#POSITIONAL[@]} -gt 0 ]]; then
  PRESET="${POSITIONAL[0]}"
fi

# Resolve relative OUT_DIR against repo root
if [[ "$OUT_DIR" != /* ]]; then
  OUT_DIR="${REPO_ROOT}/${OUT_DIR}"
fi

mkdir -p "$OUT_DIR"
PRIMARY_MODEL=""

if [[ -n "$CUSTOM_URL" ]]; then
  filename="$(basename "${CUSTOM_URL%%\?*}")"
  dest="${OUT_DIR}/${filename}"
  download_file "$CUSTOM_URL" "$dest"
  PRIMARY_MODEL="$dest"
else
  repo="$(preset_repo "$PRESET")"
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    url="$(build_url "$repo" "$file")"
    dest="${OUT_DIR}/${file}"
    download_file "$url" "$dest"
    if [[ -z "$PRIMARY_MODEL" ]]; then
      PRIMARY_MODEL="$dest"
    fi
  done < <(preset_files "$PRESET")
fi

echo ""
echo "Primary model file: $PRIMARY_MODEL"

if [[ "$SET_ENV" -eq 1 ]]; then
  update_env "$PRIMARY_MODEL"
fi

echo "Done."
