export const DEFAULT_CONFIG = Object.freeze({
  alarmEntity: "binary_sensor.alarm_gateway_alarm_relay_state",
  weatherEntity: "weather.home_assistant",
  locale: "ru-RU",
  armedState: "on",
  alarmText: "ОХРАНА ВКЛЮЧЕНА",
  temperaturePrefix: "На улице",
});

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDate(date, locale = "ru-RU") {
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  const calendarDate = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  });
  return `${weekday}, ${calendarDate}`;
}

export function readEntity(hass, entityId) {
  return hass?.states?.[entityId] ?? null;
}

export function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mergeConfig(base, custom) {
  return Object.freeze({ ...base, ...(custom ?? {}) });
}
