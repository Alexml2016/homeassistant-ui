#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HA_CONFIG="${HA_CONFIG:-/config}"
DRY=()
if [[ "${1:-}" == "--dry-run" ]]; then DRY=(--dry-run); elif [[ $# -gt 0 ]]; then echo "Usage: $0 [--dry-run]" >&2; exit 2; fi
if [[ ! -f "$HA_CONFIG/configuration.yaml" ]]; then echo "Home Assistant configuration.yaml not found in $HA_CONFIG" >&2; exit 1; fi
if [[ "$ROOT" == "$HA_CONFIG" || "$ROOT" == "$HA_CONFIG/www/homeassistant-ui" ]]; then echo "Clone must be separate from deployed directories" >&2; exit 1; fi
command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }
mkdir -p "$HA_CONFIG/www" "$HA_CONFIG/custom_components"
rsync -av "${DRY[@]}" "$ROOT/www/" "$HA_CONFIG/www/"
if [[ -d "$ROOT/custom_components" ]]; then
  rsync -av "${DRY[@]}" "$ROOT/custom_components/" "$HA_CONFIG/custom_components/"
fi
echo "Deployment ${DRY:+preview }complete; no files deleted."
