const PANEL_VERSION = "0.3.0";

const DEFAULTS = {
  title: "Гараж и ворота",
  courtyard_name: "Дворовые ворота",
  garage_name: "Гаражные ворота",
  wicket_name: "Калитка",
  show_activity: true,
  confirm_open: false,
};

const STATE_STYLES = {
  closed: { color: "#4ade80", background: "#14532d", glow: "rgba(34,197,94,.24)" },
  open: { color: "#f87171", background: "#7f1d1d", glow: "rgba(239,68,68,.24)" },
  opening: { color: "#fbbf24", background: "#78350f", glow: "rgba(245,158,11,.26)" },
  closing: { color: "#fbbf24", background: "#78350f", glow: "rgba(245,158,11,.26)" },
  moving: { color: "#fbbf24", background: "#78350f", glow: "rgba(245,158,11,.26)" },
  error: { color: "#c084fc", background: "#581c87", glow: "rgba(168,85,247,.25)" },
  unavailable: { color: "#94a3b8", background: "#334155", glow: "rgba(100,116,139,.2)" },
};

const STATE_LABELS = {
  closed: "ЗАКРЫТЫ",
  open: "ОТКРЫТЫ",
  opening: "ОТКРЫВАЮТСЯ",
  closing: "ЗАКРЫВАЮТСЯ",
  moving: "ДВИЖЕНИЕ",
  error: "ОШИБКА ДАТЧИКОВ",
  unavailable: "НЕДОСТУПНЫ",
};

const GARAGE_STATE_LABELS = {
  ...STATE_LABELS,
  opening: "ПОДНИМАЮТСЯ",
  closing: "ОПУСКАЮТСЯ",
};

class GaragePanelV030 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rendered = false;
  }

  static getStubConfig() {
    return {
      type: "custom:garage-panel",
      courtyard_cover: "cover.courtyard_gate",
      courtyard_open_sensor: "binary_sensor.courtyard_gate_open",
      courtyard_closed_sensor: "binary_sensor.courtyard_gate_closed",
      courtyard_temperature_sensor: "sensor.outdoor_temperature",
      courtyard_light_entity: "light.courtyard",
      courtyard_motion_sensor: "binary_sensor.courtyard_motion",
      garage_cover: "cover.garage_gate",
      garage_open_sensor: "binary_sensor.garage_gate_open",
      garage_closed_sensor: "binary_sensor.garage_gate_closed",
      garage_temperature_sensor: "sensor.garage_temperature",
      garage_light_entity: "light.garage",
      garage_motion_sensor: "binary_sensor.garage_motion",
      wicket_sensor: "binary_sensor.wicket",
      wicket_entity: "switch.ulitsa_courtyard_kalitka",
      wicket_light_entity: "light.wicket",
      wicket_motion_sensor: "binary_sensor.wicket_motion",
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Не задана конфигурация garage-panel");

    const required = [
      "courtyard_cover",
      "courtyard_open_sensor",
      "courtyard_closed_sensor",
      "garage_cover",
      "garage_open_sensor",
      "garage_closed_sensor",
      "wicket_sensor",
      "wicket_entity",
    ];

    const missing = required.filter((key) => !config[key]);
    if (missing.length) {
      throw new Error(`Не заданы обязательные параметры: ${missing.join(", ")}`);
    }

    this._config = { ...DEFAULTS, ...config };
    this._rendered = false;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._update();
  }

  getCardSize() {
    return 7;
  }

  _render() {
    if (!this._config || this._rendered) return;

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="panel">
          <header class="header">
            <div>
              <div class="eyebrow">HOME ASSISTANT</div>
              <h1>${this._escape(this._config.title)}</h1>
            </div>
            <div class="online"><span class="online-dot"></span>ESPHome</div>
          </header>

          <main class="device-grid">
            ${this._deviceTemplate("courtyard", this._config.courtyard_name, "Откатные ворота", "На улице")}
            ${this._deviceTemplate("garage", this._config.garage_name, "Подъёмные ворота", "В гараже")}
            ${this._deviceTemplate("wicket", this._config.wicket_name, "Калитка", "")}
          </main>

          <section class="activity" id="activity-section">
            <div class="section-title">Последние изменения</div>
            <div class="activity-list" id="activity-list"></div>
          </section>
        </div>
      </ha-card>
    `;

    for (const kind of ["courtyard", "garage", "wicket"]) {
      this.shadowRoot.getElementById(`${kind}-action`)
        .addEventListener("click", (event) => this._handleDeviceAction(kind, event));
      this.shadowRoot.getElementById(`${kind}-light`)
        .addEventListener("click", (event) => this._toggleLight(kind, event));
    }

    this._rendered = true;
  }

  _deviceTemplate(kind, title, subtitle, temperatureLabel) {
    const isWicket = kind === "wicket";
    return `
      <section class="device-card" id="${kind}-card" aria-label="${this._escape(title)}">
        <div class="device-topline">
          <div>
            <div class="device-title">${this._escape(title)}</div>
            <div class="device-subtitle">${subtitle}</div>
          </div>
          ${isWicket ? "" : `
            <div class="temperature-block">
              <div class="temperature-label">${temperatureLabel}</div>
              <div class="temperature" id="${kind}-temperature">—</div>
            </div>
          `}
        </div>

        <div class="device-visual ${kind}" id="${kind}-visual">
          ${kind === "courtyard" ? this._courtyardSvg() : kind === "garage" ? this._garageSvg() : this._wicketSvg()}
        </div>

        <div class="device-state" id="${kind}-state">—</div>
        <div class="device-hint" id="${kind}-hint">Управление кнопками</div>

        <div class="device-controls">
          <button class="icon-button action-button" id="${kind}-action" type="button" aria-label="Управление: ${this._escape(title)}">
            <ha-icon icon="${kind === "courtyard" ? "mdi:gate" : kind === "garage" ? "mdi:garage" : "mdi:door-open"}"></ha-icon>
          </button>

          <button class="icon-button light-button" id="${kind}-light" type="button" aria-label="Переключить свет: ${this._escape(title)}">
            <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
          </button>

          <div class="motion-indicator" id="${kind}-motion" title="Движение">
            <ha-icon icon="mdi:motion-sensor"></ha-icon>
            <span id="${kind}-motion-text">Нет данных</span>
          </div>
        </div>
      </section>
    `;
  }

  _update() {
    if (!this._hass || !this._config || !this._rendered) return;

    const courtyard = this._resolveGateState("courtyard");
    const garage = this._resolveGateState("garage");
    const wicket = this._resolveWicketState();

    this._updateDevice("courtyard", courtyard, STATE_LABELS);
    this._updateDevice("garage", garage, GARAGE_STATE_LABELS);
    this._updateDevice("wicket", wicket, {
      closed: "ЗАКРЫТА",
      open: "ОТКРЫТА",
      unavailable: "НЕДОСТУПНА",
    });

    this._updateTemperature("courtyard", this._config.courtyard_temperature_sensor || this._config.outdoor_temperature_sensor);
    this._updateTemperature("garage", this._config.garage_temperature_sensor || this._config.temperature_sensor);

    for (const kind of ["courtyard", "garage", "wicket"]) {
      this._updateLight(kind);
      this._updateMotion(kind);
    }

    this._updateActivity(courtyard, garage, wicket);
  }

  _resolveGateState(kind) {
    const cover = this._entity(this._config[`${kind}_cover`]);
    const openSensor = this._entity(this._config[`${kind}_open_sensor`]);
    const closedSensor = this._entity(this._config[`${kind}_closed_sensor`]);

    if (!cover || !openSensor || !closedSensor || [cover, openSensor, closedSensor].some((entity) => this._isUnavailable(entity))) {
      return { key: "unavailable", mainEntity: cover, openSensor, closedSensor };
    }

    const isOpen = this._isActive(openSensor);
    const isClosed = this._isActive(closedSensor);

    if (isOpen && isClosed) return { key: "error", mainEntity: cover, openSensor, closedSensor };
    if (isOpen) return { key: "open", mainEntity: cover, openSensor, closedSensor };
    if (isClosed) return { key: "closed", mainEntity: cover, openSensor, closedSensor };
    if (cover.state === "opening") return { key: "opening", mainEntity: cover, openSensor, closedSensor };
    if (cover.state === "closing") return { key: "closing", mainEntity: cover, openSensor, closedSensor };
    return { key: "moving", mainEntity: cover, openSensor, closedSensor };
  }

  _resolveWicketState() {
    const sensor = this._entity(this._config.wicket_sensor);
    if (!sensor || this._isUnavailable(sensor)) {
      return { key: "unavailable", mainEntity: sensor };
    }
    return { key: this._isActive(sensor) ? "open" : "closed", mainEntity: sensor };
  }

  _updateDevice(kind, data, labels) {
    const card = this.shadowRoot.getElementById(`${kind}-card`);
    const visual = this.shadowRoot.getElementById(`${kind}-visual`);
    const state = this.shadowRoot.getElementById(`${kind}-state`);
    const hint = this.shadowRoot.getElementById(`${kind}-hint`);
    const action = this.shadowRoot.getElementById(`${kind}-action`);
    const style = STATE_STYLES[data.key] || STATE_STYLES.unavailable;

    card.dataset.state = data.key;
    card.style.setProperty("--state-color", style.color);
    card.style.setProperty("--state-bg", style.background);
    card.style.setProperty("--state-glow", style.glow);
    visual.dataset.state = data.key;
    state.textContent = labels[data.key] || data.key;

    const hints = kind === "wicket"
      ? {
          closed: "Нажмите значок калитки, чтобы открыть замок",
          open: "Нажмите значок калитки, чтобы открыть замок",
          unavailable: "Проверьте датчик калитки",
        }
      : {
          closed: "Нажмите значок ворот, чтобы открыть",
          open: "Нажмите значок ворот, чтобы закрыть",
          opening: "Нажмите значок ворот, чтобы остановить",
          closing: "Нажмите значок ворот, чтобы остановить",
          moving: "Нажмите значок ворот для управления",
          error: "Проверьте концевые датчики",
          unavailable: "Проверьте соединение",
        };

    hint.textContent = hints[data.key] || "Управление кнопками";
    const disabled = kind === "wicket"
      ? data.key === "unavailable"
      : ["error", "unavailable"].includes(data.key);
    action.disabled = disabled;
  }

  _updateTemperature(kind, entityId) {
    const element = this.shadowRoot.getElementById(`${kind}-temperature`);
    if (element) element.textContent = this._formatTemperature(this._entity(entityId));
  }

  _formatTemperature(entity) {
    if (!entity || this._isUnavailable(entity)) return "—";
    const value = Number.parseFloat(entity.state);
    if (!Number.isFinite(value)) return "—";
    const unit = entity.attributes.unit_of_measurement || "°C";
    const locale = this._hass?.locale?.language || "ru-RU";
    return `${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
  }

  _updateLight(kind) {
    const button = this.shadowRoot.getElementById(`${kind}-light`);
    const entityId = this._config[`${kind}_light_entity`];
    const entity = this._entity(entityId);

    button.hidden = !entityId;
    if (!entityId) return;

    const unavailable = !entity || this._isUnavailable(entity);
    const active = !unavailable && this._isActive(entity);
    button.disabled = unavailable;
    button.classList.toggle("active", active);
    button.querySelector("ha-icon").setAttribute("icon", active ? "mdi:lightbulb-on" : "mdi:lightbulb-outline");
    button.title = unavailable ? "Свет недоступен" : active ? "Выключить свет" : "Включить свет";
  }

  _updateMotion(kind) {
    const indicator = this.shadowRoot.getElementById(`${kind}-motion`);
    const text = this.shadowRoot.getElementById(`${kind}-motion-text`);
    const entityId = this._config[`${kind}_motion_sensor`]
      || (kind === "garage" ? this._config.motion_sensor : null);
    const entity = this._entity(entityId);

    indicator.hidden = !entityId;
    if (!entityId) return;

    const unavailable = !entity || this._isUnavailable(entity);
    const active = !unavailable && this._isActive(entity);
    indicator.classList.toggle("active", active);
    indicator.classList.toggle("unavailable", unavailable);
    text.textContent = unavailable ? "Нет данных" : active ? "Движение" : "Спокойно";
  }

  async _handleDeviceAction(kind, event) {
    event.stopPropagation();
    if (kind === "wicket") {
      await this._openWicket();
      return;
    }
    await this._toggleGate(kind);
  }

  async _toggleGate(kind) {
    if (!this._hass) return;
    const entityId = this._config[`${kind}_cover`];
    const gate = this._resolveGateState(kind);

    if (this._config.confirm_open && gate.key === "closed") {
      const name = kind === "courtyard" ? this._config.courtyard_name : this._config.garage_name;
      if (!window.confirm(`Открыть: ${name}?`)) return;
    }

    try {
      await this._hass.callService("cover", "toggle", { entity_id: entityId });
    } catch (error) {
      console.error("garage-panel: cover.toggle failed", error);
      this._notify(`Не удалось выполнить команду для ${entityId}`);
    }
  }

  async _openWicket() {
    if (!this._hass) return;

    let domain;
    let service;
    const data = { ...(this._config.wicket_service_data || {}) };

    if (this._config.wicket_service) {
      [domain, service] = this._config.wicket_service.split(".", 2);
      if (!domain || !service) {
        this._notify("Параметр wicket_service должен иметь вид domain.service");
        return;
      }
      if (this._config.wicket_entity && !data.entity_id) data.entity_id = this._config.wicket_entity;
    } else {
      const entityId = this._config.wicket_entity;
      domain = entityId?.split(".", 1)[0];
      const services = {
        button: "press",
        input_button: "press",
        switch: "turn_on",
        script: "turn_on",
        cover: "open_cover",
        lock: "unlock",
      };
      service = services[domain];
      data.entity_id = entityId;
    }

    if (!domain || !service) {
      this._notify("Не удалось определить команду открытия калитки");
      return;
    }

    try {
      await this._hass.callService(domain, service, data);
    } catch (error) {
      console.error("garage-panel: wicket action failed", error);
      this._notify("Не удалось открыть замок калитки");
    }
  }

  async _toggleLight(kind, event) {
    event.stopPropagation();
    if (!this._hass) return;
    const entityId = this._config[`${kind}_light_entity`];
    if (!entityId) return;

    try {
      await this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
    } catch (error) {
      console.error("garage-panel: light toggle failed", error);
      this._notify(`Не удалось переключить свет: ${entityId}`);
    }
  }

  _updateActivity(courtyard, garage, wicket) {
    const section = this.shadowRoot.getElementById("activity-section");
    if (!this._config.show_activity) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const items = [
      this._activityItem(this._config.courtyard_name, courtyard, "mdi:gate"),
      this._activityItem(this._config.garage_name, garage, "mdi:garage"),
      this._activityItem(this._config.wicket_name, wicket, "mdi:door"),
    ];

    items.sort((a, b) => new Date(b.changed) - new Date(a.changed));
    this.shadowRoot.getElementById("activity-list").innerHTML = items.map((item) => `
      <div class="activity-row">
        <ha-icon icon="${item.icon}"></ha-icon>
        <div class="activity-copy"><strong>${this._escape(item.title)}</strong><span>${this._escape(item.text)}</span></div>
        <time>${this._formatTime(item.changed)}</time>
      </div>
    `).join("");
  }

  _activityItem(title, data, icon) {
    const label = data.key === "open"
      ? title === this._config.wicket_name ? "ОТКРЫТА" : "ОТКРЫТЫ"
      : data.key === "closed"
        ? title === this._config.wicket_name ? "ЗАКРЫТА" : "ЗАКРЫТЫ"
        : STATE_LABELS[data.key] || data.key;

    return {
      title,
      text: label,
      icon,
      changed: data.mainEntity?.last_changed || data.openSensor?.last_changed || new Date().toISOString(),
    };
  }

  _entity(entityId) {
    return entityId ? this._hass?.states?.[entityId] : null;
  }

  _isUnavailable(entity) {
    return !entity || ["unknown", "unavailable"].includes(entity.state);
  }

  _isActive(entity) {
    return ["on", "open", "opening", "unlocked", "detected", "active"].includes(entity?.state);
  }

  _formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(this._hass?.locale?.language || "ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  _notify(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    }));
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _courtyardSvg() {
    return `<svg viewBox="0 0 420 190" role="img" aria-label="Откатные ворота">
      <g class="gate-frame"><path d="M34 161V45h18v116M368 161V45h18v116"/><path d="M25 161h370"/></g>
      <g class="sliding-leaf"><rect x="54" y="63" width="309" height="91" rx="4"/><path d="M75 63v91M102 63v91M129 63v91M156 63v91M183 63v91M210 63v91M237 63v91M264 63v91M291 63v91M318 63v91M345 63v91"/></g>
      <circle cx="82" cy="163" r="7"/><circle cx="336" cy="163" r="7"/>
    </svg>`;
  }

  _garageSvg() {
    return `<svg viewBox="0 0 420 190" role="img" aria-label="Подъёмные гаражные ворота">
      <g class="garage-frame"><path d="M67 162V49L210 18l143 31v113"/><rect x="95" y="61" width="230" height="101" rx="5"/></g>
      <g class="sectional-leaf"><rect x="105" y="70" width="210" height="84" rx="3"/><path d="M105 91h210M105 112h210M105 133h210"/></g>
    </svg>`;
  }

  _wicketSvg() {
    return `<svg viewBox="0 0 420 190" role="img" aria-label="Калитка">
      <g class="wicket-frame"><path d="M98 166V37h18v129M304 166V37h18v129"/><path d="M84 166h252"/></g>
      <g class="wicket-leaf"><rect x="122" y="54" width="176" height="106" rx="4"/><path d="M145 54v106M176 54v106M207 54v106M238 54v106M269 54v106"/><circle cx="276" cy="108" r="5"/></g>
    </svg>`;
  }

  _styles() {
    return `
      :host { display:block; --text:#f8fafc; --muted:#94a3b8; }
      * { box-sizing:border-box; }
      [hidden] { display:none!important; }
      button { font:inherit; }
      ha-card { overflow:hidden; border-radius:22px; background:linear-gradient(145deg,#111827,#070b13); color:var(--text); }
      .panel { padding:clamp(14px,2.2vw,24px); }
      .header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:13px; }
      .eyebrow { color:#60a5fa; font-size:10px; font-weight:800; letter-spacing:.18em; }
      h1 { margin:2px 0 0; font-size:clamp(22px,3vw,34px); line-height:1.05; }
      .online { color:var(--muted); font-size:12px; white-space:nowrap; }
      .online-dot { display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px #22c55e; }
      .device-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
      .device-card { --state-color:#94a3b8; --state-bg:#334155; --state-glow:rgba(100,116,139,.2); position:relative; min-height:278px; padding:14px; overflow:hidden; border:1px solid var(--state-color); border-radius:18px; background:linear-gradient(155deg,var(--state-bg),#101827 72%); color:var(--text); }
      .device-card::after { content:""; position:absolute; right:-15%; bottom:-55%; width:70%; height:95%; border-radius:50%; background:var(--state-glow); filter:blur(22px); pointer-events:none; }
      .device-topline,.device-controls { position:relative; z-index:2; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .device-title { font-size:clamp(17px,1.7vw,23px); font-weight:800; }
      .device-subtitle,.device-hint,.temperature-label { color:#cbd5e1; font-size:11px; }
      .temperature-block { text-align:right; white-space:nowrap; }
      .temperature { margin-top:2px; color:#fff; font-size:clamp(18px,2vw,24px); font-weight:850; }
      .device-visual { position:relative; z-index:2; height:105px; display:grid; place-items:center; }
      svg { width:min(100%,255px); max-height:99px; overflow:visible; }
      svg * { vector-effect:non-scaling-stroke; }
      .gate-frame,.garage-frame,.wicket-frame { fill:none; stroke:#dbeafe; stroke-width:7; stroke-linecap:round; stroke-linejoin:round; opacity:.9; }
      .sliding-leaf,.sectional-leaf,.wicket-leaf { fill:var(--state-color); stroke:#f8fafc; stroke-width:3; transition:transform 1s ease,opacity .5s ease; transform-box:fill-box; transform-origin:center; }
      circle { fill:#f8fafc; }
      [data-state="open"] .sliding-leaf { transform:translateX(-72%); opacity:.28; }
      [data-state="opening"] .sliding-leaf,[data-state="closing"] .sliding-leaf,[data-state="moving"] .sliding-leaf { animation:slide-gate 1.8s ease-in-out infinite alternate; }
      [data-state="open"] .sectional-leaf { transform:translateY(-72%) scaleY(.28); opacity:.35; }
      [data-state="opening"] .sectional-leaf,[data-state="closing"] .sectional-leaf,[data-state="moving"] .sectional-leaf { animation:lift-gate 1.8s ease-in-out infinite alternate; }
      [data-state="open"] .wicket-leaf { transform:perspective(260px) rotateY(-67deg); opacity:.55; }
      .device-state { position:relative; z-index:2; color:#fff; font-size:clamp(18px,2.1vw,27px); font-weight:900; letter-spacing:.025em; }
      .device-hint { position:relative; z-index:2; min-height:28px; margin-top:3px; }
      .device-controls { align-items:center; justify-content:flex-start; margin-top:9px; }
      .icon-button { display:grid; place-items:center; width:43px; height:43px; padding:0; border:1px solid rgba(226,232,240,.3); border-radius:13px; background:rgba(15,23,42,.65); color:#e2e8f0; cursor:pointer; transition:transform .15s ease,background .2s ease,color .2s ease,box-shadow .2s ease; }
      .icon-button:hover { transform:translateY(-1px); background:rgba(30,41,59,.9); }
      .icon-button:active { transform:scale(.96); }
      .icon-button:disabled { cursor:not-allowed; opacity:.42; transform:none; }
      .action-button { color:var(--state-color); border-color:var(--state-color); box-shadow:0 0 18px var(--state-glow); }
      .light-button.active { color:#fde047; border-color:#fde047; background:rgba(113,63,18,.7); box-shadow:0 0 18px rgba(250,204,21,.3); }
      .motion-indicator { margin-left:auto; display:flex; align-items:center; gap:6px; min-width:0; padding:8px 10px; border:1px solid rgba(148,163,184,.24); border-radius:12px; color:var(--muted); background:rgba(15,23,42,.52); font-size:11px; white-space:nowrap; }
      .motion-indicator.active { color:#4ade80; border-color:#22c55e; background:rgba(20,83,45,.62); box-shadow:0 0 18px rgba(34,197,94,.2); }
      .motion-indicator.unavailable { opacity:.55; }
      .activity { margin-top:12px; padding:15px; border-radius:17px; background:#121a2a; border:1px solid #263449; }
      .section-title { margin-bottom:7px; font-size:15px; font-weight:800; }
      .activity-row { display:grid; grid-template-columns:31px minmax(0,1fr) auto; align-items:center; gap:9px; padding:8px 0; border-top:1px solid rgba(148,163,184,.13); }
      .activity-row:first-child { border-top:0; }
      .activity-row ha-icon { color:#93c5fd; }
      .activity-copy { min-width:0; display:flex; flex-direction:column; }
      .activity-copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
      .activity-copy span,time { color:var(--muted); font-size:11px; }
      @keyframes slide-gate { from { transform:translateX(0); } to { transform:translateX(-34%); } }
      @keyframes lift-gate { from { transform:translateY(0) scaleY(1); } to { transform:translateY(-38%) scaleY(.55); } }
      @media (max-width:1050px) { .device-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:720px) { .device-grid { grid-template-columns:1fr; } .device-card { min-height:270px; } .header { align-items:flex-start; } }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; } }
    `;
  }
}

if (!customElements.get("garage-panel")) {
  customElements.define("garage-panel", GaragePanelV030);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "garage-panel",
  name: "Garage Panel",
  description: "Панель ворот, калитки, света и датчиков движения",
  preview: true,
});

console.info(`%c GARAGE-PANEL %c v${PANEL_VERSION} `, "color:#fff;background:#2563eb;font-weight:700", "color:#2563eb;background:#dbeafe");