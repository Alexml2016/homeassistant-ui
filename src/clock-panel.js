import "./segments.js";
import { AlarmState } from "./alarm.js";
import { WeatherState } from "./weather.js";
import { ClockController } from "./clock.js";
import { DEFAULT_CONFIG, mergeConfig } from "./utils.js";

const STYLE_URL = new URL("./clock.css", import.meta.url).href;

class ClockPanel extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = DEFAULT_CONFIG;
    this._clock = null;
    this._alarmState = new AlarmState(this._config);
    this._weatherState = new WeatherState(this._config);
    this._lastAlarmSignature = "";
    this._lastWeatherSignature = "";

    this._renderShell();
  }

  connectedCallback() {
    if (!this._clock) {
      this._clock = new ClockController({
        display: this._display,
        dateElement: this._date,
        locale: this._config.locale,
      });
    }
    this._clock.start();
    this._updateFromHass();
  }

  disconnectedCallback() {
    this._clock?.stop();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateFromHass();
  }

  get hass() {
    return this._hass;
  }

  set panel(panel) {
    const customConfig = panel?.config ?? panel ?? {};
    this._applyConfig(customConfig);
  }

  set narrow(_value) {
    // Home Assistant may set this property for responsive panels.
    // The panel itself is responsive through CSS media queries.
  }

  set route(_value) {
    // Reserved by the Home Assistant custom-panel API.
  }

  _applyConfig(customConfig) {
    this._config = mergeConfig(DEFAULT_CONFIG, customConfig);
    this._alarmState = new AlarmState(this._config);
    this._weatherState = new WeatherState(this._config);

    if (this._alarmBanner) {
      this._alarmBanner.textContent = this._config.alarmText;
    }

    if (this._clock) {
      this._clock.stop();
      this._clock = new ClockController({
        display: this._display,
        dateElement: this._date,
        locale: this._config.locale,
      });
      if (this.isConnected) this._clock.start();
    }

    this._lastAlarmSignature = "";
    this._lastWeatherSignature = "";
    this._updateFromHass();
  }

  _renderShell() {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = STYLE_URL;

    const screen = document.createElement("main");
    screen.className = "clock-screen";
    screen.innerHTML = `
      <div class="alarm-banner" role="status" aria-live="polite"></div>
      <div class="clock-holder">
        <seven-segment-display></seven-segment-display>
      </div>
      <div class="clock-date" aria-label="Текущая дата">—</div>
      <div class="clock-temperature is-unavailable" aria-live="polite">На улице: —</div>
      <div class="clock-error" role="status" aria-live="polite"></div>
    `;

    this.shadowRoot.append(styleLink, screen);

    this._screen = screen;
    this._alarmBanner = screen.querySelector(".alarm-banner");
    this._display = screen.querySelector("seven-segment-display");
    this._date = screen.querySelector(".clock-date");
    this._temperature = screen.querySelector(".clock-temperature");
    this._error = screen.querySelector(".clock-error");
    this._alarmBanner.textContent = this._config.alarmText;
  }

  _updateFromHass() {
    if (!this._hass || !this._screen) return;

    try {
      this._updateAlarm();
      this._updateWeather();
      this._showError("");
    } catch (error) {
      console.error("clock-panel update failed", error);
      this._showError("Ошибка обновления данных Home Assistant");
    }
  }

  _updateAlarm() {
    const alarm = this._alarmState.read(this._hass);
    const signature = `${alarm.available}:${alarm.armed}:${alarm.rawState}`;
    if (signature === this._lastAlarmSignature) return;
    this._lastAlarmSignature = signature;

    this._screen.classList.toggle("is-armed", alarm.armed);
    this._screen.classList.toggle("alarm-unavailable", !alarm.available);
    this._alarmBanner.textContent = alarm.armed ? this._config.alarmText : "";
  }

  _updateWeather() {
    const weather = this._weatherState.read(this._hass);
    const signature = JSON.stringify(weather);
    if (signature === this._lastWeatherSignature) return;
    this._lastWeatherSignature = signature;

    this._temperature.classList.remove("is-cold", "is-hot", "is-unavailable");
    this._temperature.textContent = weather.text;

    if (!weather.available) {
      this._temperature.classList.add("is-unavailable");
    } else if (weather.category === "cold") {
      this._temperature.classList.add("is-cold");
    } else if (weather.category === "hot") {
      this._temperature.classList.add("is-hot");
    }
  }

  _showError(message) {
    this._error.textContent = message;
    this._error.classList.toggle("is-visible", Boolean(message));
  }
}

if (!customElements.get("clock-panel")) {
  customElements.define("clock-panel", ClockPanel);
}

export { ClockPanel };
