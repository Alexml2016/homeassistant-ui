"""Authenticated administrative API for the Lighting Manager panel."""

from __future__ import annotations

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


def _engine(hass: HomeAssistant, connection, msg):
    engine = hass.data.get(DOMAIN)
    if engine is None:
        connection.send_error(msg["id"], "not_loaded", "Lighting Manager is not configured")
    return engine


@callback
@websocket_api.websocket_command({probatio.Required("type"): "lighting_manager/get"})
@websocket_api.require_admin
def ws_get(hass: HomeAssistant, connection, msg: dict) -> None:
    """Return rule and device snapshots."""
    if (engine := _engine(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], engine.snapshot())


@websocket_api.websocket_command({
    probatio.Required("type"): "lighting_manager/save_rule",
    probatio.Required("rule"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_rule(hass: HomeAssistant, connection, msg: dict) -> None:
    """Add or update a rule."""
    if (engine := _engine(hass, connection, msg)) is None:
        return
    try:
        await engine.async_save_rule(msg["rule"])
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_rule", str(exc))
        return
    connection.send_result(msg["id"], engine.snapshot())


@websocket_api.websocket_command({
    probatio.Required("type"): "lighting_manager/delete_rule",
    probatio.Required("rule_id"): str,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_rule(hass: HomeAssistant, connection, msg: dict) -> None:
    """Delete a rule."""
    if (engine := _engine(hass, connection, msg)) is None:
        return
    if not await engine.async_delete_rule(msg["rule_id"]):
        connection.send_error(msg["id"], "not_found", "Rule does not exist")
        return
    connection.send_result(msg["id"], engine.snapshot())


@websocket_api.websocket_command({
    probatio.Required("type"): "lighting_manager/set_override",
    probatio.Required("entity_id"): str,
    probatio.Optional("duration_seconds"): int,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_override(hass: HomeAssistant, connection, msg: dict) -> None:
    """Protect device state from automatic changes until event or timer."""
    if (engine := _engine(hass, connection, msg)) is None:
        return
    try:
        await engine.async_set_override(msg["entity_id"], msg.get("duration_seconds"))
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_override", str(exc))
        return
    connection.send_result(msg["id"], engine.snapshot())


@websocket_api.websocket_command({
    probatio.Required("type"): "lighting_manager/clear_override",
    probatio.Required("entity_id"): str,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_clear_override(hass: HomeAssistant, connection, msg: dict) -> None:
    """Resume automatic control."""
    if (engine := _engine(hass, connection, msg)) is None:
        return
    await engine.async_clear_override(msg["entity_id"])
    connection.send_result(msg["id"], engine.snapshot())


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    """Register commands once during integration setup."""
    for handler in (ws_get, ws_save_rule, ws_delete_rule, ws_set_override, ws_clear_override):
        websocket_api.async_register_command(hass, handler)
