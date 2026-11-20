"""Dependency-free model tests: python -m unittest discover -s tests."""
import importlib.util
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import unittest
from zoneinfo import ZoneInfo

path = Path(__file__).resolve().parents[1] / "custom_components/lighting_manager/models.py"
spec = importlib.util.spec_from_file_location("lighting_manager_models", path)
import sys
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
validate_rule = module.validate_rule
evaluate_rule = module.evaluate_rule
desired_state = module.desired_state

ZONE = ZoneInfo("Europe/Moscow")


def sun(event, day):
    hour = 6 if event == "sunrise" else 20
    return datetime(day.year, day.month, day.day, hour, tzinfo=ZONE).astimezone(timezone.utc)


def schedule(**kwargs):
    return validate_rule({
        "id": "lm_001", "name": "Evening", "targets": ["light.courtyard"],
        "start": {"type": "sunset", "offset_minutes": 10},
        "end": {"type": "time", "time": "23:00"},
        **kwargs,
    })


def gate_rule(**kwargs):
    rule = {
        "id": "gate_or_fence", "name": "Gates", "enabled": True,
        "targets": ["light.courtyard", "light.gate", "light.posts"],
        "days": [1, 2, 3, 4, 5, 6, 7],
        "start": {"type": "any_on", "entity_ids": [
            "binary_sensor.garage_open", "binary_sensor.fence_open",
        ]},
        "end": {"type": "all_off"}, "max_duration_seconds": 600,
        "active_period": {
            "start": {"type": "sunset"}, "end": {"type": "sunrise"}, "end_day": "next",
        },
    }
    rule.update(kwargs)
    return validate_rule(rule)


class RuleTests(unittest.TestCase):
    def test_evening(self):
        rule = schedule()
        self.assertFalse(evaluate_rule(rule, datetime(2026, 10, 11, 20, 9, tzinfo=ZONE), ZONE, sun, {}).active)
        self.assertTrue(evaluate_rule(rule, datetime(2026, 10, 11, 20, 10, tzinfo=ZONE), ZONE, sun, {}).active)
        self.assertFalse(evaluate_rule(rule, datetime(2026, 10, 11, 23, tzinfo=ZONE), ZONE, sun, {}).active)

    def test_skip_if_start_not_before_end(self):
        late_sun = lambda event, day: datetime(day.year, day.month, day.day,
                                              23 if event == "sunset" else 6, tzinfo=ZONE)
        rule = schedule()
        self.assertFalse(evaluate_rule(rule, datetime(2026, 10, 11, 23, 30, tzinfo=ZONE), ZONE, late_sun, {}).active)

    def test_overnight_motion_and_delay(self):
        rule = validate_rule({
            "id": "night", "name": "Motion", "targets": ["light.courtyard"],
            "start": {"type": "motion", "entity_id": "binary_sensor.yard"},
            "end": {"type": "no_motion", "delay_seconds": 300},
            "active_period": {"start": {"type": "time", "time": "23:00"},
                              "end": {"type": "sunrise"}, "end_day": "next"},
            "brightness_pct": 25,
        })
        moment = datetime(2026, 10, 12, 1, tzinfo=ZONE)
        self.assertTrue(evaluate_rule(rule, moment, ZONE, sun,
                                      {"binary_sensor.yard": {"state": "on"}}).active)
        off = moment - timedelta(minutes=3)
        self.assertEqual(evaluate_rule(rule, moment, ZONE, sun,
                                      {"binary_sensor.yard": {"state": "off", "last_changed": off}}).status,
                         "pending_off")
        self.assertFalse(evaluate_rule(rule, moment + timedelta(minutes=3), ZONE, sun,
                                      {"binary_sensor.yard": {"state": "off", "last_changed": off}}).active)

    def test_max_brightness_arbitration(self):
        low = schedule(id="low", brightness_pct=25)
        high = schedule(id="high", brightness_pct=80)
        now = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        states = {r["id"]: evaluate_rule(r, now, ZONE, sun, {}) for r in (low, high)}
        self.assertEqual(desired_state(states, [low, high])["light.courtyard"]["brightness_pct"], 80)
        states["high"] = module.RuleResult("inactive", False)
        self.assertEqual(desired_state(states, [low, high])["light.courtyard"]["brightness_pct"], 25)

    def test_duration_weekdays(self):
        rule = validate_rule({"id": "w", "name": "Weekdays", "targets": ["light.a"],
                              "start": {"type": "time", "time": "19:00"},
                              "end": {"type": "duration", "seconds": 7200},
                              "days": [1, 2, 3, 4, 5], "brightness_pct": 60})
        self.assertFalse(evaluate_rule(rule, datetime(2026, 10, 11, 20, tzinfo=ZONE), ZONE, sun, {}).active)
        self.assertTrue(evaluate_rule(rule, datetime(2026, 10, 12, 20, tzinfo=ZONE), ZONE, sun, {}).active)

    def test_manual_override_expires_at_next_event_or_timer(self):
        now = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        before = ("rule_a",)
        after = ("rule_b",)
        until = (now + timedelta(minutes=5)).isoformat()
        timed = {"mode": "timer", "until": until}
        self.assertFalse(module.override_expired(timed, now, before, before))
        self.assertTrue(module.override_expired(timed, now, before, after))
        self.assertTrue(module.override_expired(
            timed, now + timedelta(minutes=5), before, before
        ))
        event = {"mode": "event"}
        self.assertFalse(module.override_expired(event, now, before, before))
        self.assertTrue(module.override_expired(event, now, before, after))
        self.assertFalse(module.override_expired(event, now, before, after, initialized=False))

    def test_reject_bad_rule(self):
        with self.assertRaises(ValueError):
            schedule(targets=["switch.ok", "sensor.temperature"])
        with self.assertRaises(ValueError):
            schedule(brightness_pct=101)
        with self.assertRaises(ValueError):
            schedule(end={"type": "no_motion", "delay_seconds": 10})


    def test_or_event_arms_only_on_opening_after_sunset(self):
        rule = gate_rule()
        after_sunset = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        before_sunset = datetime(2026, 10, 11, 19, tzinfo=ZONE)
        self.assertIsNone(module.start_event_session(
            rule, "binary_sensor.garage_open", "off", "on", before_sunset, ZONE, sun))
        self.assertIsNone(module.start_event_session(
            rule, "binary_sensor.garage_open", None, "on", after_sunset, ZONE, sun))
        self.assertIsNone(module.start_event_session(
            rule, "binary_sensor.garage_open", "on", "on", after_sunset, ZONE, sun))
        self.assertIsNone(module.start_event_session(
            rule, "binary_sensor.other", "off", "on", after_sunset, ZONE, sun))
        session = module.start_event_session(
            rule, "binary_sensor.garage_open", "off", "on", after_sunset, ZONE, sun)
        self.assertIsNotNone(session)
        self.assertEqual(datetime.fromisoformat(session["until"]) - after_sunset,
                         timedelta(minutes=10))

    def test_or_event_ends_when_both_off_or_timeout(self):
        rule = gate_rule()
        now = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        session = module.start_event_session(
            rule, "binary_sensor.garage_open", "off", "on", now, ZONE, sun)
        one_open = {
            "binary_sensor.garage_open": {"state": "off"},
            "binary_sensor.fence_open": {"state": "on"},
        }
        both_off = {key: {"state": "off"} for key in one_open}
        both_open = {key: {"state": "on"} for key in one_open}
        self.assertTrue(evaluate_rule(rule, now, ZONE, sun, one_open, session).active)
        self.assertTrue(evaluate_rule(rule, now, ZONE, sun, both_open, session).active)
        self.assertFalse(evaluate_rule(rule, now, ZONE, sun, both_off, session).active)
        self.assertFalse(evaluate_rule(rule, now, ZONE, sun, both_open, None).active)
        self.assertFalse(evaluate_rule(
            rule, now + timedelta(minutes=10), ZONE, sun, one_open, session).active)
        # A stale open sensor must not retrigger without another off -> on event.
        self.assertIsNone(module.start_event_session(
            rule, "binary_sensor.fence_open", "on", "on",
            now + timedelta(minutes=11), ZONE, sun))

    def test_or_event_second_opening_restarts_timer_and_crosses_midnight(self):
        rule = gate_rule()
        now = datetime(2026, 10, 11, 23, 57, tzinfo=ZONE)
        first = module.start_event_session(
            rule, "binary_sensor.garage_open", "off", "on", now, ZONE, sun)
        again = module.start_event_session(
            rule, "binary_sensor.fence_open", "off", "on",
            now + timedelta(minutes=5), ZONE, sun)
        self.assertEqual(datetime.fromisoformat(again["until"]) -
                         datetime.fromisoformat(first["until"]), timedelta(minutes=5))
        after_midnight = now + timedelta(minutes=6)
        self.assertTrue(evaluate_rule(rule, after_midnight, ZONE, sun, {
            "binary_sensor.garage_open": {"state": "on"},
            "binary_sensor.fence_open": {"state": "on"},
        }, again).active)
        self.assertFalse(evaluate_rule(
            rule, datetime(2026, 10, 12, 8, tzinfo=ZONE), ZONE, sun,
            {"binary_sensor.garage_open": {"state": "on"}}, again).active)

    def test_close_state_or_combined_with_both_off_and_timeout(self):
        rule = gate_rule(end={
            "type": "all_off", "or_on_entity_ids": ["binary_sensor.garage_closed"]
        })
        now = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        session = module.start_event_session(
            rule, "binary_sensor.fence_open", "off", "on", now, ZONE, sun)
        self.assertIsNotNone(session)
        open_states = {
            "binary_sensor.garage_open": {"state": "off"},
            "binary_sensor.fence_open": {"state": "on"},
            "binary_sensor.garage_closed": {"state": "off"},
        }
        self.assertTrue(evaluate_rule(rule, now, ZONE, sun, open_states, session).active)
        # Closure signal has OR precedence even while the fence is open.
        close_states = {**open_states, "binary_sensor.garage_closed": {"state": "on"}}
        self.assertFalse(evaluate_rule(rule, now, ZONE, sun, close_states, session).active)
        # A close sensor already on at the moment of opening also ends the rule.
        self.assertFalse(evaluate_rule(rule, now, ZONE, sun, close_states, session).active)
        both_off = {**open_states, "binary_sensor.fence_open": {"state": "off"}}
        self.assertFalse(evaluate_rule(rule, now, ZONE, sun, both_off, session).active)
        self.assertFalse(evaluate_rule(
            rule, now + timedelta(minutes=10), ZONE, sun, open_states, session).active)
        # An unavailable close sensor must not itself terminate an open session.
        missing_close = {**open_states, "binary_sensor.garage_closed": {"state": "unavailable"}}
        self.assertTrue(evaluate_rule(rule, now, ZONE, sun, missing_close, session).active)

    def test_close_state_validation_and_legacy_compatibility(self):
        now = datetime(2026, 10, 11, 21, tzinfo=ZONE)
        old_rule = gate_rule()
        self.assertEqual(old_rule["end"]["or_on_entity_ids"], [])
        valid = gate_rule(end={"type": "all_off",
                               "or_on_entity_ids": ["binary_sensor.garage_closed"]})
        self.assertEqual(valid["end"]["or_on_entity_ids"], ["binary_sensor.garage_closed"])
        for invalid in (
            "binary_sensor.garage_closed",
            ["sensor.outside"],
            ["binary_sensor.garage_closed", "binary_sensor.garage_closed"],
            ["binary_sensor.fence_open"],
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                gate_rule(end={"type": "all_off", "or_on_entity_ids": invalid})
        with self.assertRaises(ValueError):
            schedule(end={"type": "time", "time": "23:00",
                          "or_on_entity_ids": ["binary_sensor.garage_closed"]})

    def test_or_event_validation(self):
        base = gate_rule()
        cases = [
            {"start": {"type": "any_on", "entity_ids": []}},
            {"start": {"type": "any_on", "entity_ids": [
                "binary_sensor.garage_open", "binary_sensor.garage_open"]}},
            {"start": {"type": "any_on", "entity_ids": ["sensor.invalid"]}},
            {"end": {"type": "no_motion"}},
            {"max_duration_seconds": 0},
            {"max_duration_seconds": 86401},
            {"max_duration_seconds": True},
            {"active_period": {"start": {"type": "sunset"}, "end": {"type": "motion"}}},
        ]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_rule({**base, **change})
        with self.assertRaises(ValueError):
            schedule(end={"type": "all_off"})


if __name__ == "__main__":
    unittest.main()
