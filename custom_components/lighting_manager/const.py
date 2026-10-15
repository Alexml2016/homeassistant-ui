"""Constants for Lighting Manager."""

DOMAIN = "lighting_manager"
STORAGE_VERSION = 1
STORAGE_KEY = "lighting_manager.data"
EVALUATION_INTERVAL_SECONDS = 10

# Minimal invalidation event: viewers fetch the admin-only snapshot over WebSocket.
EVENT_UPDATED = "lighting_manager_updated"
