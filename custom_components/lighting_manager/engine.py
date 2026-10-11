"""Evaluate lighting rules and issue Home Assistant service calls."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import logging
from time import monotonic
from typing import Any
from zoneinfo import ZoneInfo

from homeassistant.components.light import LightEntityFeature
from homeassistant.const import STATE_ON, STATE_OFF, STATE_UNKNOWN, STATE_UNAVAILABLE
from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.helpers.sun import get_astral_event_date
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVALUATION_INTERVAL_SECONDS, STORAGE_KEY, STORAGE_VERSION
from .models import RuleResult, desired_state, evaluate_rule, override_expired, validate_rule

_LOGGER = logging.getLogger(__name__)


class LightingEngine:
    """Persist and execute independently configured automation rules."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.rules: list[dict[str, Any]] = []
        self.overrides: dict[str, dict[str, Any]] = {}
        self.rule_states: dict[str, RuleResult] = {}
        self.outputs: dict[str, dict[str, Any]] = {}
        self._previous_active: dict[str, tuple[str, ...]] = {}
        self._initialized = False
        self._unsub_entities = None
        self._unsub_tick = None
        self._lock = asyncio.Lock()
        self._owned_contexts: dict[str, float] = {}
        self._recent_commands: dict[str, tuple[bool, int | None, float]] = {}
        self._target_entities: set[str] = set()
        self._sensor_entities: set[str] = set()

    async def async_start(self) -> None:
        """Load rules and subscribe to relevant entities and timer events."""
        data = await self.store.async_load() or {}
        for raw in data.get("rules", []):
            try:
                self.rules.append(validate_rule(raw))
            except (ValueError, TypeError) as exc:
                _LOGGER.warning("Skipping invalid stored Lighting Manager rule: %s", exc)
        self.overrides = {
            entity: entry for entity, entry in data.get("overrides", {}).items()
            if isinstance(entry, dict) and entry.get("mode") in ("event", "timer")
        }
        self._previous_active = {
            entity: tuple(rule_ids)
            for entity, rule_ids in data.get("previous_active", {}).items()
            if isinstance(rule_ids, list)
        }
        self._initialized = bool(data.get("initialized"))
        self._rebind_entities()
        self._unsub_tick = async_track_time_interval(
            self.hass, self._tick, timedelta(seconds=EVALUATION_INTERVAL_SECONDS)
        )
        await self.async_refresh()

    async def async_stop(self) -> None:
        """Stop callbacks and persist final state."""
        if self._unsub_entities:
            self._unsub_entities()
            self._unsub_entities = None
        if self._unsub_tick:
            self._unsub_tick()
            self._unsub_tick = None
        await self.store.async_save(self._serialized())

    def _serialized(self) -> dict[str, Any]:
        return {
            "rules": self.rules,
            "overrides": self.overrides,
            "previous_active": {key: list(value) for key, value in self._previous_active.items()},
            "initialized": self._initialized,
        }

    @callback
    def _schedule_save(self) -> None:
        self.store.async_delay_save(self._serialized, 1)

    @callback
    def _tick(self, _now: datetime) -> None:
        self.hass.async_create_task(self.async_refresh())

    @callback
    def _rebind_entities(self) -> None:
        if self._unsub_entities is not None:
            self._unsub_entities()
            self._unsub_entities = None
        self._target_entities = {target for rule in self.rules for target in rule["targets"]}
        self._sensor_entities = {
            rule["start"]["entity_id"] for rule in self.rules
            if rule["start"]["type"] == "motion"
        }
        watched = self._target_entities | self._sensor_entities
        if watched:
            self._unsub_entities = async_track_state_change_event(
                self.hass, sorted(watched), self._on_entity_event
            )

    @callback
    def _on_entity_event(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        old = event.data.get("old_state")
        new = event.data.get("new_state")
        if entity_id in self._sensor_entities:
            self.hass.async_create_task(self.async_refresh())
        if entity_id not in self._target_entities or old is None or new is None:
            return
        if old.state in (STATE_UNKNOWN, STATE_UNAVAILABLE) or new.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            return
        if (old.state, old.attributes.get("brightness")) == (
            new.state, new.attributes.get("brightness")
        ):
            return
        # Services can report a child context rather than their parent's ID.
        current = monotonic()
        self._owned_contexts = {
            key: sent for key, sent in self._owned_contexts.items() if current - sent < 10
        }
        context = new.context
        if context and (context.id in self._owned_contexts or context.parent_id in self._owned_contexts):
            return
        last = self._recent_commands.get(entity_id)
        if last and current - last[2] < 3:
            expected_on, expected_brightness, _ = last
            actual_brightness = new.attributes.get("brightness")
            matched_brightness = (
                expected_brightness is None or actual_brightness is None
                or abs(actual_brightness - round(expected_brightness * 255 / 100)) <= 3
            )
            if (new.state == STATE_ON) == expected_on and matched_brightness:
                return
        # Keep an explicitly configured timer when the user changes the device.
        # Otherwise the timer would be lost and the manual hold could last longer.
        if self.overrides.get(entity_id, {}).get("mode") != "timer":
            self.overrides[entity_id] = {"mode": "event"}
        self._schedule_save()
        _LOGGER.debug("Manual override detected for %s", entity_id)

    async def async_save_rule(self, raw: dict[str, Any]) -> None:
        """Validate and add or replace a rule."""
        rule = validate_rule(raw)
        async with self._lock:
            for index, current in enumerate(self.rules):
                if current["id"] == rule["id"]:
                    self.rules[index] = rule
                    break
            else:
                self.rules.append(rule)
            await self.store.async_save(self._serialized())
            self._rebind_entities()
        await self.async_refresh()

    async def async_delete_rule(self, rule_id: str) -> bool:
        """Remove a rule; removed targets are no longer controlled."""
        async with self._lock:
            old_count = len(self.rules)
            self.rules = [rule for rule in self.rules if rule["id"] != rule_id]
            if len(self.rules) == old_count:
                return False
            await self.store.async_save(self._serialized())
            self._rebind_entities()
        await self.async_refresh()
        return True

    async def async_set_override(self, entity_id: str, duration_seconds: int | None) -> None:
        """Hold external/manual device state until next event or a timer expires."""
        if entity_id not in self._target_entities:
            raise ValueError("Entity is not managed by Lighting Manager")
        if duration_seconds is not None and not 1 <= duration_seconds <= 86400:
            raise ValueError("Duration must be between 1 and 86400 seconds")
        if duration_seconds is None:
            self.overrides[entity_id] = {"mode": "event"}
        else:
            expires = dt_util.utcnow() + timedelta(seconds=duration_seconds)
            self.overrides[entity_id] = {"mode": "timer", "until": expires.isoformat()}
        await self.store.async_save(self._serialized())

    async def async_clear_override(self, entity_id: str) -> None:
        """Restore automatic control immediately."""
        self.overrides.pop(entity_id, None)
        await self.store.async_save(self._serialized())
        await self.async_refresh()

    def _sun(self, kind: str, on_date) -> datetime | None:
        return get_astral_event_date(self.hass, kind, on_date)

    async def async_refresh(self) -> None:
        """Evaluate once. Serialize passes to avoid overlapping service calls."""
        async with self._lock:
            now = dt_util.now()
            zone = ZoneInfo(self.hass.config.time_zone)
            sensor_states: dict[str, dict[str, Any]] = {}
            for entity in self._sensor_entities:
                state = self.hass.states.get(entity)
                if state is not None:
                    sensor_states[entity] = {"state": state.state, "last_changed": state.last_changed}

            self.rule_states = {
                rule["id"]: evaluate_rule(rule, now, zone, self._sun, sensor_states)
                for rule in self.rules
            }
            self.outputs = desired_state(self.rule_states, self.rules)
            fingerprint = {
                entity: tuple(sorted(output["active_rules"]))
                for entity, output in self.outputs.items()
            }

            dirty = False
            for entity, override in list(self.overrides.items()):
                if override_expired(
                    override,
                    now,
                    self._previous_active.get(entity, ()),
                    fingerprint.get(entity, ()),
                    self._initialized,
                ):
                    del self.overrides[entity]
                    dirty = True

            if fingerprint != self._previous_active or not self._initialized:
                dirty = True
            self._previous_active = fingerprint
            self._initialized = True
            if dirty:
                self._schedule_save()

            for entity, target in self.outputs.items():
                if entity not in self.overrides:
                    await self._apply_target(entity, target)

    async def _apply_target(self, entity: str, target: dict[str, Any]) -> None:
        state = self.hass.states.get(entity)
        if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            return
        desired_on = target["on"]
        current_on = state.state == STATE_ON
        brightness = target["brightness_pct"] if entity.startswith("light.") else None
        supported_modes = set(state.attributes.get("supported_color_modes") or [])
        supports_dim = bool(supported_modes - {"onoff", "unknown"})
        if not supports_dim:
            brightness = None
        actual = state.attributes.get("brightness")
        brightness_ok = (brightness is None or actual is None
                         or abs(actual - round(brightness * 255 / 100)) <= 3)
        if current_on == desired_on and (not desired_on or brightness_ok):
            return

        domain, service = entity.split(".", 1)[0], "turn_on" if desired_on else "turn_off"
        data: dict[str, Any] = {"entity_id": entity}
        if desired_on and brightness is not None:
            data["brightness_pct"] = brightness
        features = state.attributes.get("supported_features", 0)
        if (desired_on and domain == "light" and target["transition_seconds"]
                and features & LightEntityFeature.TRANSITION):
            data["transition"] = target["transition_seconds"]
        context = Context()
        self._owned_contexts[context.id] = monotonic()
        self._recent_commands[entity] = (desired_on, brightness, monotonic())
        try:
            await self.hass.services.async_call(domain, service, data, blocking=True, context=context)
        except (HomeAssistantError, ValueError) as exc:
            _LOGGER.error("Unable to control %s: %s", entity, exc)

    def snapshot(self) -> dict[str, Any]:
        """Small serializable snapshot for admin dashboard."""
        candidates = [
            {"entity_id": state.entity_id, "name": state.name or state.entity_id,
             "state": state.state}
            for domain in ("light", "switch", "binary_sensor")
            for state in self.hass.states.async_all(domain)
        ]
        return {
            "rules": self.rules,
            "rule_states": {key: {"status": value.status, "active": value.active}
                            for key, value in self.rule_states.items()},
            "outputs": self.outputs,
            "overrides": self.overrides,
            "entities": sorted(candidates, key=lambda x: x["entity_id"]),
        }
