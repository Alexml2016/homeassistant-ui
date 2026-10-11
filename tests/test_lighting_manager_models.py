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

    def test_reject_bad_rule(self):
        with self.assertRaises(ValueError):
            schedule(targets=["switch.ok", "sensor.temperature"])
        with self.assertRaises(ValueError):
            schedule(brightness_pct=101)
        with self.assertRaises(ValueError):
            schedule(end={"type": "no_motion", "delay_seconds": 10})


if __name__ == "__main__":
    unittest.main()
