import { SegmentRenderer } from "./segments.js?v=2.2.2";
import { AlarmState } from "./alarm.js?v=2.2.2";
import { WeatherState } from "./weather.js?v=2.2.2";
import { ClockController } from "./clock.js?v=2.2.2";
import { DEFAULT_CONFIG, mergeConfig, readEntity } from "./utils.js?v=2.2.2";

const PANEL_VERSION = "2.2.2";
const STYLE_URL = new URL("./clock.css?v=2.2.2", import.meta.url).href;

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
    this._stateChangedConnection = null;
    this._unsubscribeStateChanged = null;
    this._subscriptionStatus = "ожидание";
    this._lastDoorbellTriggerSource = "—";

    this._renderShell();
  }

  connectedCallback() {
    this._ensureClock();
    this._clock.start();
    this._subscribeStateChanges();
    this._updateFromHass();
    this._updateDoorbellDebug();
  }

  disconnectedCallback() {
    this._clock?.stop();
    this._hideDoorbellCamera();
    this._teardownStateChanges();
  }

  set hass(hass) {
    const previousSnapshot = this._getDoorbellSnapshot(this._hass);
    const connectionChanged = this._hass?.connection !== hass?.connection;

    this._hass = hass;

    const currentSnapshot = this._getDoorbellSnapshot(this._hass);
    if (currentSnapshot.pressed && !previousSnapshot.pressed) {
      this._showDoorbellCamera("hass");
    }

    if (connectionChanged || !this._stateChangedConnection) {
      this._subscribeStateChanges();
    }

    this._updateFromHass();
    this._updateDoorbellDebug();
  }

  get hass() {
    return this._hass;
  }

  set panel(panel) {
    const panelConfig = panel?.config ?? panel ?? {};
    const nestedConfig = panelConfig?.config;
    const customConfig = nestedConfig && typeof nestedConfig === "object"
      ? { ...panelConfig, ...nestedConfig }
      : panelConfig;
    this._applyConfig(customConfig);
  }

  set narrow(_value) {
    // Home Assistant may set this property for responsive panels.
  }

  set route(_value) {
    // Reserved by the Home Assistant custom-panel API.
  }

  _normalizeValue(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  _getDoorbellSnapshot(hass = this._hass) {
    const entityId = String(this._config?.doorbellEntity ?? "").trim();
    const entity = entityId ? readEntity(hass, entityId) : null;
    const rawState = entity?.state ?? "";
    const normalizedState = this._normalizeValue(rawState);
    const pressedState = this._normalizeValue(this._config?.doorbellPressedState);
    const available = Boolean(entity) && normalizedState !== "unknown" && normalizedState !== "unavailable";

    return {
      entityId,
      entity,
      rawState,
      normalizedState,
      pressedState,
      available,
      pressed: available && normalizedState === pressedState,
    };
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
    this._applyDoorbellDebugVisibility();

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
    this._updateDoorbellDebug();
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
    screen.dataset.version = PANEL_VERSION;
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
      <div class="doorbell-debug" style="position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(58px,calc(env(safe-area-inset-bottom) + 48px));z-index:40;max-width:72vw;padding:6px 9px;border-radius:8px;background:rgb(0 0 0 / 0.58);color:rgb(255 255 255 / 0.80);font-size:11px;line-height:1.35;text-align:right;pointer-events:none;white-space:normal"></div>
      <button class="doorbell-test-button" type="button" style="position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:40;min-height:38px;padding:8px 12px;border:1px solid rgb(255 255 255 / 0.22);border-radius:10px;background:rgb(0 0 0 / 0.38);color:rgb(255 255 255 / 0.80);font:inherit;font-size:13px">Тест звонка</button>
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
    this._doorbellDebug = screen.querySelector(".doorbell-debug");
    this._doorbellTestButton = screen.querySelector(".doorbell-test-button");

    this._alarmBanner.textContent = this._config.alarmText;

    this._refreshButton.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", Date.now().toString());
      window.location.replace(url.href);
    });

    this._doorbellTestButton.addEventListener("click", () => {
      this._showDoorbellCamera("manual-test");
    });

    this._applyDoorbellDebugVisibility();
  }

  _applyDoorbellDebugVisibility() {
    const visible = Boolean(this._config?.doorbellDebug);
    if (this._doorbellDebug) this._doorbellDebug.style.display = visible ? "block" : "none";
    if (this._doorbellTestButton) this._doorbellTestButton.style.display = visible ? "block" : "none";
  }

  _updateDoorbellDebug() {
    if (!this._doorbellDebug) return;

    const snapshot = this._getDoorbellSnapshot();
    const stateText = snapshot.entity
      ? String(snapshot.rawState || "(пусто)")
      : "НЕ НАЙДЕН";

    this._doorbellDebug.textContent =
      `v${PANEL_VERSION} • ${snapshot.entityId || "doorbellEntity не задан"} = ${stateText} • ` +
      `ожидается: ${snapshot.pressedState || "(пусто)"} • WS: ${this._subscriptionStatus} • ` +
      `trigger: ${this._lastDoorbellTriggerSource}`;
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
    const snapshot = this._getDoorbellSnapshot();
    if (!snapshot.entityId) {
      this._updateDoorbellDebug();
      return;
    }

    const signature = `${snapshot.available}:${snapshot.pressed}:${snapshot.rawState}`;

    if (this._doorbellActive && this._cameraStreamElement?.tagName === "HA-CAMERA-STREAM") {
      const cameraState = readEntity(this._hass, this._config.cameraEntity);
      if (cameraState) this._cameraStreamElement.stateObj = cameraState;
    }

    if (signature === this._lastDoorbellSignature) {
      this._updateDoorbellDebug();
      return;
    }

    this._lastDoorbellSignature = signature;

    console.debug("clock-panel doorbell state", {
      entityId: snapshot.entityId,
      rawState: snapshot.rawState,
      pressed: snapshot.pressed,
      configuredPressedState: this._config.doorbellPressedState,
    });

    if (snapshot.pressed) {
      this._showDoorbellCamera("hass-state");
    }

    this._updateDoorbellDebug();
  }

  _subscribeStateChanges() {
    const connection = this._hass?.connection;
    if (!this.isConnected || !connection || this._stateChangedConnection === connection) return;

    this._teardownStateChanges();
    this._stateChangedConnection = connection;
    this._subscriptionStatus = "подключение";
    this._updateDoorbellDebug();

    Promise.resolve(
      connection.subscribeEvents((event) => this._handleStateChanged(event), "state_changed")
    )
      .then((unsubscribe) => {
        if (this._stateChangedConnection !== connection) {
          if (typeof unsubscribe === "function") unsubscribe();
          return;
        }
        this._unsubscribeStateChanged = unsubscribe;
        this._subscriptionStatus = "OK";
        this._updateDoorbellDebug();
      })
      .catch((error) => {
        if (this._stateChangedConnection === connection) {
          this._stateChangedConnection = null;
        }
        this._subscriptionStatus = "ОШИБКА";
        this._updateDoorbellDebug();
        console.warn("clock-panel state_changed subscription failed", error);
      });
  }

  _teardownStateChanges() {
    this._stateChangedConnection = null;
    const unsubscribe = this._unsubscribeStateChanged;
    this._unsubscribeStateChanged = null;

    if (typeof unsubscribe === "function") {
      try {
        const result = unsubscribe();
        if (result?.catch) result.catch(() => {});
      } catch (_error) {
        // Ignore cleanup errors while the Home Assistant connection is closing.
      }
    }
  }

  _handleStateChanged(event) {
    const configuredEntityId = String(this._config?.doorbellEntity ?? "").trim();
    const eventEntityId = String(event?.data?.entity_id ?? "").trim();
    if (!eventEntityId || eventEntityId !== configuredEntityId) return;

    const oldState = this._normalizeValue(event?.data?.old_state?.state);
    const newState = this._normalizeValue(event?.data?.new_state?.state);
    const pressedState = this._normalizeValue(this._config?.doorbellPressedState);
    const pressed = newState === pressedState;

    console.debug("clock-panel doorbell state_changed", {
      entityId: eventEntityId,
      oldState,
      newState,
      configuredPressedState: pressedState,
    });

    this._lastDoorbellSignature = "";

    if (pressed && oldState !== newState) {
      this._showDoorbellCamera("state_changed");
    }

    this._updateDoorbellDebug();
  }

  _showDoorbellCamera(source = "unknown") {
    if (!this._screen || !this._doorbellOverlay) return;

    this._lastDoorbellTriggerSource = source;
    this._doorbellActive = true;
    this._screen.classList.add("is-doorbell-active");
    this._doorbellOverlay.setAttribute("aria-hidden", "false");
    this._updateDoorbellDebug();

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
    this._updateDoorbellDebug();
  }

  async _mountDoorbellStream() {
    const cameraEntity = String(this._config.cameraEntity ?? "").trim();
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
