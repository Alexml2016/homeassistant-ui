"""Pure rule validation and evaluation; no Home Assistant imports.

Times and weekdays are evaluated in the configured Home Assistant time zone.
A window has an anchor date (its start date). For windows crossing midnight,
the weekday refers to that anchor date.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, tzinfo
import re
from typing import Any, Callable, Mapping

SunProvider = Callable[[str, date], datetime | None]
ENTITY_RE = re.compile(r"^(?:light|switch)\.[a-z0-9_]+$")
SENSOR_RE = re.compile(r"^binary_sensor\.[a-z0-9_]+$")
RULE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(frozen=True)
class RuleResult:
    """Evaluated state of a rule."""

    status: str
    active: bool


@dataclass(frozen=True)
class Window:
    """Start/end of an active interval."""

    start: datetime
    end: datetime


def _point(spec: dict[str, Any], allowed: set[str], field: str) -> None:
    if not isinstance(spec, dict) or spec.get("type") not in allowed:
        raise ValueError(f"{field}: unsupported event type")
    kind = spec["type"]
    if kind == "time":
        value = spec.get("time")
        if not isinstance(value, str) or not re.fullmatch(r"\d{2}:\d{2}", value):
            raise ValueError(f"{field}.time must have HH:MM format")
        try:
            time.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{field}.time is invalid") from exc
    if kind in ("sunrise", "sunset"):
        offset = spec.get("offset_minutes", 0)
        if type(offset) is not int or not -720 <= offset <= 720:
            raise ValueError(f"{field}.offset_minutes must be between -720 and 720")
    if kind == "duration":
        seconds = spec.get("seconds")
        if type(seconds) is not int or not 1 <= seconds <= 86400:
            raise ValueError("end.seconds must be between 1 and 86400")
    if kind == "motion" and not SENSOR_RE.fullmatch(str(spec.get("entity_id", ""))):
        raise ValueError("start.entity_id must be a binary_sensor")
    if kind == "no_motion":
        delay = spec.get("delay_seconds", 0)
        if type(delay) is not int or not 0 <= delay <= 86400:
            raise ValueError("end.delay_seconds must be between 0 and 86400")


def validate_rule(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate a JSON rule and return a detached, normalized copy."""
    if not isinstance(raw, dict):
        raise ValueError("Rule must be an object")
    rule = deepcopy(raw)
    if not RULE_ID_RE.fullmatch(str(rule.get("id", ""))):
        raise ValueError("id must contain 1-64 letters, numbers, _ or -")
    if not isinstance(rule.get("name"), str) or not 1 <= len(rule["name"]) <= 120:
        raise ValueError("name must contain 1-120 characters")
    if type(rule.get("enabled", True)) is not bool:
        raise ValueError("enabled must be boolean")
    rule.setdefault("enabled", True)

    targets = rule.get("targets")
    if (not isinstance(targets, list) or not 1 <= len(targets) <= 64
            or any(not isinstance(x, str) or not ENTITY_RE.fullmatch(x) for x in targets)
            or len(set(targets)) != len(targets)):
        raise ValueError("targets must contain unique light.* or switch.* entity IDs")

    days = rule.get("days", [1, 2, 3, 4, 5, 6, 7])
    if (not isinstance(days, list) or not days or len(set(map(str, days))) != len(days)
            or any(type(d) is not int or d < 1 or d > 7 for d in days)):
        raise ValueError("days must contain ISO weekdays 1..7")
    rule["days"] = days

    start = rule.get("start")
    end = rule.get("end")
    _point(start, {"time", "sunrise", "sunset", "motion"}, "start")
    _point(end, {"time", "sunrise", "sunset", "duration", "no_motion"}, "end")
    is_motion = start["type"] == "motion"
    if is_motion != (end["type"] == "no_motion"):
        raise ValueError("motion start requires no_motion end (and vice versa)")

    if is_motion:
        period = rule.get("active_period")
        if not isinstance(period, dict):
            raise ValueError("motion rules require active_period")
        _point(period.get("start"), {"time", "sunrise", "sunset"}, "active_period.start")
        _point(period.get("end"), {"time", "sunrise", "sunset"}, "active_period.end")
        if period.get("end_day", "same") not in ("same", "next"):
            raise ValueError("active_period.end_day must be same or next")
        period.setdefault("end_day", "same")
    else:
        if "active_period" in rule:
            raise ValueError("active_period is only valid for motion rules")
        if rule.get("end_day", "same") not in ("same", "next"):
            raise ValueError("end_day must be same or next")
        rule.setdefault("end_day", "same")

    brightness = rule.get("brightness_pct")
    if brightness is not None and (type(brightness) is not int or not 1 <= brightness <= 100):
        raise ValueError("brightness_pct must be between 1 and 100")
    transition = rule.get("transition_seconds", 0)
    if type(transition) not in (int, float) or not 0 <= transition <= 30:
        raise ValueError("transition_seconds must be between 0 and 30")
    rule.setdefault("transition_seconds", 0)
    return rule


def resolve_point(
    spec: dict[str, Any], on_date: date, zone: tzinfo, sun: SunProvider
) -> datetime | None:
    """Calculate fixed or solar event on a given local calendar date."""
    if spec["type"] == "time":
        return datetime.combine(on_date, time.fromisoformat(spec["time"]), tzinfo=zone)
    found = sun(spec["type"], on_date)
    if found is None:
        return None
    return found.astimezone(zone) + timedelta(minutes=spec.get("offset_minutes", 0))


def _window(
    start: dict[str, Any], end: dict[str, Any], end_day: str,
    on_date: date, zone: tzinfo, sun: SunProvider
) -> Window | None:
    beginning = resolve_point(start, on_date, zone, sun)
    if beginning is None:
        return None
    if end["type"] == "duration":
        finishing = beginning + timedelta(seconds=end["seconds"])
    else:
        ending_date = on_date + timedelta(days=1 if end_day == "next" else 0)
        finishing = resolve_point(end, ending_date, zone, sun)
    if finishing is None or finishing <= beginning:
        # By design, same-day sunset+offset after 23:00 skips this cycle.
        return None
    return Window(beginning, finishing)


def current_window(
    rule: Mapping[str, Any], now: datetime, zone: tzinfo,
    sun: SunProvider, *, period: bool = False,
) -> Window | None:
    """Resolve an active window; examine yesterday for overnight schedules."""
    source = rule["active_period"] if period else rule
    start, end = source["start"], source["end"]
    anchor = now.astimezone(zone).date()
    for day in (anchor, anchor - timedelta(days=1)):
        if day.isoweekday() not in rule["days"]:
            continue
        window = _window(start, end, source.get("end_day", "same"), day, zone, sun)
        if window and window.start <= now < window.end:
            return window
    return None


def evaluate_rule(
    rule: Mapping[str, Any], now: datetime, zone: tzinfo,
    sun: SunProvider, sensors: Mapping[str, Mapping[str, Any]],
) -> RuleResult:
    """Evaluate daily and motion rules from immutable input state."""
    if not rule["enabled"]:
        return RuleResult("disabled", False)
    if rule["start"]["type"] != "motion":
        return (RuleResult("active", True) if current_window(rule, now, zone, sun)
                else RuleResult("inactive", False))

    window = current_window(rule, now, zone, sun, period=True)
    if window is None:
        return RuleResult("inactive", False)
    sensor = sensors.get(rule["start"]["entity_id"])
    if not sensor or sensor.get("state") not in ("on", "off"):
        return RuleResult("unavailable", False)
    if sensor["state"] == "on":
        return RuleResult("active", True)
    delay = rule["end"].get("delay_seconds", 0)
    off_since = sensor.get("last_changed")
    if (isinstance(off_since, datetime) and off_since >= window.start
            and now < off_since + timedelta(seconds=delay)):
        return RuleResult("pending_off", True)
    return RuleResult("inactive", False)


def desired_state(rule_states: Mapping[str, RuleResult], rules: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """OR across active rules; maximum specified brightness wins."""
    targets = {entity for rule in rules for entity in rule["targets"]}
    desired = {entity: {"on": False, "brightness_pct": None, "transition_seconds": 0,
                        "active_rules": []} for entity in targets}
    for rule in rules:
        if not rule_states.get(rule["id"], RuleResult("inactive", False)).active:
            continue
        for entity in rule["targets"]:
            item = desired[entity]
            item["on"] = True
            item["active_rules"].append(rule["id"])
            item["transition_seconds"] = max(item["transition_seconds"],
                                              rule.get("transition_seconds", 0))
            bright = rule.get("brightness_pct") if entity.startswith("light.") else None
            if bright is not None:
                item["brightness_pct"] = max(item["brightness_pct"] or 0, bright)
    return desired
