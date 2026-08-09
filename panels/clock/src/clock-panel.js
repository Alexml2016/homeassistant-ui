import { SegmentRenderer } from "./segments.js";
import { AlarmState } from "./alarm.js";
import { WeatherState } from "./weather.js";
import { ClockController } from "./clock.js";
import { DEFAULT_CONFIG, mergeConfig, readEntity } from "./utils.js";

const STYLE_URL = new URL("./clock.css", import.meta.url).href;

class ClockPanel extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = DEFAULT_CONFIG;
    this._clock = null;
    this._segmentRenderer = null;
    this._alarmState = new AlarmState(this._config);
    this._weatherState = new WeatherState(this._config);
    this._lastAlarmSignature = "";
    this._lastWeatherSignature = "";
    this._lastDoorbellSignature = "";
    this._doorbellTimer = null;
    this._doorbellRequestToken = 0;
    this._doorbellActive = false;
    this._cameraStreamElement = null;

    this._renderShell();
  }

  connectedCallback() {
    this._ensureClock();
    this._clock.start();
    this._updateFromHass();
  }

  disconnectedCallback() {
    this._clock?.stop();
    this._hideDoorbellCamera();
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

  _ensureClock() {
    if (!this._segmentRenderer) {
      this._segmentRenderer = new SegmentRenderer(this._displayContainer);
      this._segmentRenderer.create();
    }

    if (!this._clock) {
      this._clock = new ClockController({
        display: this._segmentRenderer,
        dateElement: this._date,
        locale: this._config.locale,
      });
    }
  }

  _applyConfig(customConfig) {
    this._config = mergeConfig(DEFAULT_CONFIG, customConfig);
    this._alarmState = new AlarmState(this._config);
    this._weatherState = new WeatherState(this._config);
    this._applyDisplaySettings();

    if (this._alarmBanner) {
      this._alarmBanner.textContent = this._config.alarmText;
    }

    if (this._clock) {
      this._clock.stop();
      this._clock = new ClockController({
        display: this._segmentRenderer,
        dateElement: this._date,
        locale: this._config.locale,
      });
      if (this.isConnected) this._clock.start();
    }

    this._lastAlarmSignature = "";
    this._lastWeatherSignature = "";
    this._lastDoorbellSignature = "";
    this._hideDoorbellCamera();
    this._updateFromHass();
  }

  _applyDisplaySettings() {
    const settings = {
      "--digit-width": this._config.digitWidth,
      "--hour-minute-gap": this._config.hourMinuteGap,
      "--segment-thickness": this._config.segmentThickness,
    };

    for (const [property, value] of Object.entries(settings)) {
      if (value === null || value === undefined || value === "") {
        this.style.removeProperty(property);
      } else {
        this.style.setProperty(property, String(value));
      }
    }
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
        <div class="clock-display" aria-label="Цифровые часы"></div>
      </div>
      <div class="clock-date" aria-label="Текущая дата">—</div>
      <div class="clock-temperature is-unavailable" aria-live="polite">На улице: —</div>
      <div class="doorbell-overlay" aria-hidden="true">
        <div class="doorbell-media" aria-label="Видео с камеры звонка"></div>
        <div class="doorbell-label">ЗВОНОК</div>
        <div class="doorbell-camera-error" role="status" aria-live="polite"></div>
      </div>
      <button class="refresh-button" type="button" aria-label="Обновить панель">Обновить</button>
      <div class="clock-error" role="status" aria-live="polite"></div>
    `;

    this.shadowRoot.append(styleLink, screen);

    this._screen = screen;
    this._alarmBanner = screen.querySelector(".alarm-banner");
    this._displayContainer = screen.querySelector(".clock-display");
    this._date = screen.querySelector(".clock-date");
    this._temperature = screen.querySelector(".clock-temperature");
    this._doorbellOverlay = screen.querySelector(".doorbell-overlay");
    this._doorbellMedia = screen.querySelector(".doorbell-media");
    this._doorbellCameraError = screen.querySelector(".doorbell-camera-error");
    this._refreshButton = screen.querySelector(".refresh-button");
    this._error = screen.querySelector(".clock-error");
    this._alarmBanner.textContent = this._config.alarmText;
    this._refreshButton.addEventListener("click", () => window.location.reload());
  }

  _updateFromHass() {
    if (!this._hass || !this._screen) return;

    try {
      this._updateAlarm();
      this._updateWeather();
      this._updateDoorbell();
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

  _updateDoorbell() {
    const entityId = this._config.doorbellEntity;
    if (!entityId) return;

    const doorbell = readEntity(this._hass, entityId);
    const rawState = doorbell?.state ?? "";
    const available = Boolean(doorbell) && rawState !== "unknown" && rawState !== "unavailable";
    const pressed = available && rawState === this._config.doorbellPressedState;
    const signature = `${available}:${pressed}:${rawState}`;

    if (this._doorbellActive && this._cameraStreamElement?.tagName === "HA-CAMERA-STREAM") {
      const cameraState = readEntity(this._hass, this._config.cameraEntity);
      if (cameraState) this._cameraStreamElement.stateObj = cameraState;
    }

    if (signature === this._lastDoorbellSignature) return;
    this._lastDoorbellSignature = signature;

    if (pressed) {
      this._showDoorbellCamera();
    }
  }

  _showDoorbellCamera() {
    this._doorbellActive = true;
    this._screen.classList.add("is-doorbell-active");
    this._doorbellOverlay.setAttribute("aria-hidden", "false");

    if (this._doorbellTimer) {
      clearTimeout(this._doorbellTimer);
      this._doorbellTimer = null;
    }

    const seconds = Number(this._config.doorbellDisplaySeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      this._doorbellTimer = setTimeout(() => this._hideDoorbellCamera(), seconds * 1000);
    }

    this._mountDoorbellStream();
  }

  _hideDoorbellCamera() {
    if (this._doorbellTimer) {
      clearTimeout(this._doorbellTimer);
      this._doorbellTimer = null;
    }

    this._doorbellRequestToken += 1;
    this._doorbellActive = false;

    if (this._screen) this._screen.classList.remove("is-doorbell-active");
    if (this._doorbellOverlay) this._doorbellOverlay.setAttribute("aria-hidden", "true");

    if (this._cameraStreamElement?.tagName === "VIDEO") {
      this._cameraStreamElement.pause();
      this._cameraStreamElement.removeAttribute("src");
      this._cameraStreamElement.load();
    }

    this._cameraStreamElement = null;
    this._doorbellMedia?.replaceChildren();
    if (this._doorbellCameraError) this._doorbellCameraError.textContent = "";
  }

  async _mountDoorbellStream() {
    const cameraEntity = this._config.cameraEntity;
    const cameraState = readEntity(this._hass, cameraEntity);
    const requestToken = ++this._doorbellRequestToken;

    this._cameraStreamElement = null;
    this._doorbellMedia.replaceChildren();
    this._doorbellCameraError.textContent = "";

    if (!cameraEntity || !cameraState) {
      this._doorbellCameraError.textContent = `Камера ${cameraEntity || "не настроена"} недоступна`;
      return;
    }

    try {
      if (!customElements.get("ha-camera-stream") && typeof window.loadCardHelpers === "function") {
        await window.loadCardHelpers();
      }

      if (!this._doorbellActive || requestToken !== this._doorbellRequestToken) return;

      if (customElements.get("ha-camera-stream")) {
        const stream = document.createElement("ha-camera-stream");
        stream.className = "doorbell-camera-stream";
        stream.stateObj = cameraState;
        stream.muted = true;
        stream.controls = false;
        stream.fitMode = this._config.cameraFitMode || "cover";
        this._doorbellMedia.append(stream);
        this._cameraStreamElement = stream;
        return;
      }
    } catch (error) {
      console.warn("Home Assistant camera stream element is unavailable", error);
    }

    await this._mountNativeHls(cameraEntity, requestToken);
  }

  async _mountNativeHls(cameraEntity, requestToken) {
    if (typeof this._hass?.callWS !== "function") {
      this._doorbellCameraError.textContent = "Не удалось открыть видеопоток камеры";
      return;
    }

    try {
      const response = await this._hass.callWS({
        type: "camera/stream",
        entity_id: cameraEntity,
        format: "hls",
      });

      if (!this._doorbellActive || requestToken !== this._doorbellRequestToken) return;
      if (!response?.url) throw new Error("Home Assistant did not return an HLS URL");

      const video = document.createElement("video");
      video.className = "doorbell-native-video";
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.src = new URL(response.url, window.location.origin).href;

      this._doorbellMedia.replaceChildren(video);
      this._cameraStreamElement = video;

      await video.play();
    } catch (error) {
      console.error("Doorbell camera stream failed", error);
      if (this._doorbellActive && requestToken === this._doorbellRequestToken) {
        this._doorbellCameraError.textContent = "Не удалось открыть видеопоток камеры";
      }
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
