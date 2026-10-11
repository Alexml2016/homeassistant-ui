"""Lighting Manager integration entry points."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .engine import LightingEngine
from .websocket_api import async_register_websocket


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register WebSocket management commands once."""
    async_register_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load persisted rules and start evaluation."""
    engine = LightingEngine(hass)
    hass.data[DOMAIN] = engine
    try:
        await engine.async_start()
    except Exception:
        hass.data.pop(DOMAIN, None)
        raise
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Stop timers and release event subscriptions."""
    engine = hass.data.pop(DOMAIN, None)
    if engine:
        await engine.async_stop()
    return True
