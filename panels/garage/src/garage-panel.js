const PANEL_VERSION = "0.2.0";

const DEFAULTS = {
  title: "Гараж и ворота",
  courtyard_name: "Дворовые ворота",
  garage_name: "Гаражные ворота",
  wicket_name: "Калитка",
  motion_name: "Движение в гараже",
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

class GaragePanel extends HTMLElement {
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
      garage_cover: "cover.garage_gate",
      garage_open_sensor: "binary_sensor.garage_gate_open",
      garage_closed_sensor: "binary_sensor.garage_gate_closed",
      garage_temperature_sensor: "sensor.garage_temperature",
      wicket_sensor: "binary_sensor.wicket",
      wicket_entity: "button.open_wicket",
      motion_sensor: "binary_sensor.garage_motion",
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
    return 6;
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

          <main class="gate-grid">
            ${this._gateTemplate("courtyard", this._config.courtyard_name, "Откатные ворота", "На улице")}
            ${this._gateTemplate("garage", this._config.garage_name, "Подъёмные ворота", "В гараже")}
          </main>

          <div class="status-grid">
            <button class="wicket-card" id="wicket-card" type="button">
              <div class="status-icon"><ha-icon icon="mdi:door"></ha-icon></div>
              <div class="status-copy">
                <div class="status-title">${this._escape(this._config.wicket_name)}</div>
                <div class="status-state" id="wicket-state">Нет данных</div>
                <div class="status-hint" id="wicket-hint">Нажмите, чтобы открыть</div>
              </div>
              <ha-icon class="status-action" icon="mdi:door-open"></ha-icon>
            </button>

            <section class="motion-card" id="motion-card">
              <div class="status-icon"><ha-icon icon="mdi:motion-sensor"></ha-icon></div>
              <div class="status-copy">
                <div class="status-title">${this._escape(this._config.motion_name)}</div>
                <div class="status-state" id="motion-state">Нет данных</div>
              </div>
              <div class="pulse" id="motion-pulse"></div>
            </section>
          </div>

          <section class="activity" id="activity-section">
            <div class="section-title">Последние изменения</div>
            <div class="activity-list" id="activity-list"></div>
          </section>
        </div>
      </ha-card>
    `;

    this.shadowRoot.getElementById("courtyard-card")
      .addEventListener("click", () => this._toggle("courtyard"));
    this.shadowRoot.getElementById("garage-card")
      .addEventListener("click", () => this._toggle("garage"));
    this.shadowRoot.getElementById("wicket-card")
      .addEventListener("click", () => this._openWicket());

    this._rendered = true;
  }

  _gateTemplate(kind, title, subtitle, temperatureLabel) {
    return `
      <button class="gate-card" id="${kind}-card" type="button" aria-label="${this._escape(title)}">
        <div class="gate-topline">
          <div>
            <div class="gate-title">${this._escape(title)}</div>
            <div class="gate-subtitle">${subtitle}</div>
          </div>
          <div class="gate-meta">
            <div class="gate-temperature-label">${temperatureLabel}</div>
            <div class="gate-temperature" id="${kind}-temperature">—</div>
          </div>
        </div>
        <div class="gate-visual ${kind}" id="${kind}-visual">
          ${kind === "courtyard" ? this._courtyardSvg() : this._garageSvg()}
        </div>
        <div class="gate-bottomline">
          <div>
            <div class="gate-state" id="${kind}-state">—</div>
            <div class="gate-hint" id="${kind}-hint">Нажмите для управления</div>
          </div>
          <ha-icon class="gate-action" icon="mdi:gesture-tap-button"></ha-icon>
        </div>
      </button>
    `;
  }

  _update() {
    if (!this._hass || !this._config || !this._rendered) return;

    const courtyard = this._resolveGateState("courtyard");
    const garage = this._resolveGateState("garage");

    this._updateGate("courtyard", courtyard, STATE_LABELS);
    this._updateGate("garage", garage, GARAGE_STATE_LABELS);
    this._updateTemperature("courtyard", this._config.courtyard_temperature_sensor || this._config.outdoor_temperature_sensor);
    this._updateTemperature("garage", this._config.garage_temperature_sensor || this._config.temperature_sensor);
    const wicket = this._updateWicket();
    this._updateMotion();
    this._updateActivity(courtyard, garage, wicket);
  }

  _resolveGateState(kind) {
    const cover = this._entity(this._config[`${kind}_cover`]);
    const openSensor = this._entity(this._config[`${kind}_open_sensor`]);
    const closedSensor = this._entity(this._config[`${kind}_closed_sensor`]);

    if (!cover || !openSensor || !closedSensor || [cover, openSensor, closedSensor].some((e) => ["unknown", "unavailable"].includes(e.state))) {
      return { key: "unavailable", cover, openSensor, closedSensor };
    }

    const isOpen = openSensor.state === "on";
    const isClosed = closedSensor.state === "on";

    if (isOpen && isClosed) return { key: "error", cover, openSensor, closedSensor };
    if (isOpen) return { key: "open", cover, openSensor, closedSensor };
    if (isClosed) return { key: "closed", cover, openSensor, closedSensor };
    if (cover.state === "opening") return { key: "opening", cover, openSensor, closedSensor };
    if (cover.state === "closing") return { key: "closing", cover, openSensor, closedSensor };
    return { key: "moving", cover, openSensor, closedSensor };
  }

  _updateGate(kind, data, labels) {
    const card = this.shadowRoot.getElementById(`${kind}-card`);
    const state = this.shadowRoot.getElementById(`${kind}-state`);
    const hint = this.shadowRoot.getElementById(`${kind}-hint`);
    const visual = this.shadowRoot.getElementById(`${kind}-visual`);
    const style = STATE_STYLES[data.key] || STATE_STYLES.unavailable;

    card.dataset.state = data.key;
    card.style.setProperty("--state-color", style.color);
    card.style.setProperty("--state-bg", style.background);
    card.style.setProperty("--state-glow", style.glow);
    state.textContent = labels[data.key] || STATE_LABELS[data.key];
    visual.dataset.state = data.key;

    const hintText = {
      closed: "Нажмите, чтобы открыть",
      open: "Нажмите, чтобы закрыть",
      opening: "Нажмите, чтобы остановить",
      closing: "Нажмите, чтобы остановить",
      moving: "Нажмите для управления",
      error: "Проверьте концевые датчики",
      unavailable: "Проверьте соединение",
    };
    hint.textContent = hintText[data.key];
    card.disabled = ["error", "unavailable"].includes(data.key);
  }

  _updateTemperature(kind, entityId) {
    const el = this.shadowRoot.getElementById(`${kind}-temperature`);
    el.textContent = this._formatTemperature(this._entity(entityId));
  }

  _formatTemperature(entity) {
    if (!entity || ["unknown", "unavailable"].includes(entity.state)) return "—";
    const value = Number.parseFloat(entity.state);
    if (!Number.isFinite(value)) return "—";
    const unit = entity.attributes.unit_of_measurement || "°C";
    const locale = this._hass?.locale?.language || "ru-RU";
    return `${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
  }

  _updateWicket() {
    const card = this.shadowRoot.getElementById("wicket-card");
    const stateEl = this.shadowRoot.getElementById("wicket-state");
    const hint = this.shadowRoot.getElementById("wicket-hint");
    const entity = this._entity(this._config.wicket_sensor);
    const configured = Boolean(this._config.wicket_sensor && (this._config.wicket_entity || this._config.wicket_service));

    card.hidden = !configured;
    if (!configured) return null;

    const unavailable = !entity || ["unknown", "unavailable"].includes(entity.state);
    const open = !unavailable && ["on", "open", "opening", "unlocked"].includes(entity.state);
    const key = unavailable ? "unavailable" : open ? "open" : "closed";
    const style = STATE_STYLES[key];

    card.dataset.state = key;
    card.style.setProperty("--state-color", style.color);
    card.style.setProperty("--state-bg", style.background);
    card.style.setProperty("--state-glow", style.glow);
    stateEl.textContent = unavailable ? "НЕДОСТУПНА" : open ? "ОТКРЫТА" : "ЗАКРЫТА";
    hint.textContent = open ? "Калитка уже открыта" : "Нажмите, чтобы открыть";
    card.disabled = unavailable || open;

    return { key, entity };
  }

  _updateMotion() {
    const card = this.shadowRoot.getElementById("motion-card");
    const state = this.shadowRoot.getElementById("motion-state");
    const pulse = this.shadowRoot.getElementById("motion-pulse");
    const entity = this._entity(this._config.motion_sensor);

    if (!this._config.motion_sensor) {
      card.hidden = true;
      return;
    }

    card.hidden = false;
    const active = entity?.state === "on";
    const unavailable = !entity || ["unknown", "unavailable"].includes(entity.state);
    card.classList.toggle("active", active);
    pulse.classList.toggle("active", active);
    state.textContent = unavailable ? "Нет данных" : active ? "Обнаружено движение" : "Движения нет";
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
    ];

    if (wicket?.entity) {
      items.push({
        title: this._config.wicket_name,
        text: wicket.key === "open" ? "ОТКРЫТА" : wicket.key === "closed" ? "ЗАКРЫТА" : "НЕДОСТУПНА",
        icon: "mdi:door",
        changed: wicket.entity.last_changed,
      });
    }

    const motion = this._entity(this._config.motion_sensor);
    if (motion) {
      items.push({
        title: this._config.motion_name,
        text: motion.state === "on" ? "Обнаружено движение" : "Движения нет",
        icon: "mdi:motion-sensor",
        changed: motion.last_changed,
      });
    }

    items.sort((a, b) => new Date(b.changed) - new Date(a.changed));
    this.shadowRoot.getElementById("activity-list").innerHTML = items.map((item) => `
      <div class="activity-row">
        <ha-icon icon="${item.icon}"></ha-icon>
        <div class="activity-copy"><strong>${this._escape(item.title)}</strong><span>${this._escape(item.text)}</span></div>
        <time>${this._formatTime(item.changed)}</time>
      </div>
    `).join("");
  }

  _activityItem(title, gate, icon) {
    return {
      title,
      text: STATE_LABELS[gate.key] || gate.key,
      icon,
      changed: gate.cover?.last_changed || gate.openSensor?.last_changed || new Date().toISOString(),
    };
  }

  async _toggle(kind) {
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
    let data = { ...(this._config.wicket_service_data || {}) };

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
      console.error("garage-panel: wicket open failed", error);
      this._notify("Не удалось открыть калитку");
    }
  }

  _notify(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    }));
  }

  _entity(entityId) {
    return entityId ? this._hass?.states?.[entityId] : null;
  }

  _formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(this._hass?.locale?.language || "ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
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

  _styles() {
    return `
      :host { display:block; --text:#f8fafc; --muted:#94a3b8; }
      * { box-sizing:border-box; }
      [hidden] { display:none!important; }
      ha-card { overflow:hidden; border-radius:22px; background:linear-gradient(145deg,#111827,#070b13); color:var(--text); }
      .panel { padding:clamp(14px,2.2vw,24px); }
      .header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:13px; }
      .eyebrow { color:#60a5fa; font-size:10px; font-weight:800; letter-spacing:.18em; }
      h1 { margin:2px 0 0; font-size:clamp(22px,3vw,34px); line-height:1.05; }
      .online { color:var(--muted); font-size:12px; white-space:nowrap; }
      .online-dot { display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px #22c55e; }
      .gate-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .gate-card { --state-color:#94a3b8; --state-bg:#334155; --state-glow:rgba(100,116,139,.2); position:relative; min-height:205px; padding:14px; overflow:hidden; border:1px solid var(--state-color); border-radius:18px; background:linear-gradient(155deg,var(--state-bg),#101827 72%); color:var(--text); text-align:left; cursor:pointer; transition:transform .16s ease,box-shadow .22s ease; -webkit-tap-highlight-color:transparent; }
      .gate-card::after { content:""; position:absolute; right:-15%; bottom:-55%; width:70%; height:95%; border-radius:50%; background:var(--state-glow); filter:blur(22px); pointer-events:none; }
      .gate-card:hover { transform:translateY(-2px); box-shadow:0 12px 28px var(--state-glow); }
      .gate-card:active { transform:scale(.985); }
      .gate-card:disabled { cursor:not-allowed; filter:saturate(.65); }
      .gate-topline,.gate-bottomline { position:relative; z-index:2; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .gate-bottomline { align-items:flex-end; }
      .gate-title { font-size:clamp(17px,2vw,24px); font-weight:800; }
      .gate-subtitle,.gate-hint,.gate-temperature-label { color:#cbd5e1; font-size:11px; }
      .gate-meta { text-align:right; white-space:nowrap; }
      .gate-temperature { margin-top:2px; color:#fff; font-size:clamp(18px,2.2vw,25px); font-weight:850; }
      .gate-action { color:#e2e8f0; opacity:.7; }
      .gate-visual { position:relative; z-index:2; height:87px; display:grid; place-items:center; }
      svg { width:min(100%,245px); max-height:82px; overflow:visible; }
      svg * { vector-effect:non-scaling-stroke; }
      .gate-frame,.garage-frame { fill:none; stroke:#dbeafe; stroke-width:7; stroke-linecap:round; stroke-linejoin:round; opacity:.9; }
      .sliding-leaf,.sectional-leaf { fill:var(--state-color); stroke:#f8fafc; stroke-width:3; transition:transform 1s ease,opacity .5s ease; transform-box:fill-box; transform-origin:center; }
      circle { fill:#f8fafc; }
      [data-state="open"] .sliding-leaf { transform:translateX(-72%); opacity:.28; }
      [data-state="opening"] .sliding-leaf,[data-state="closing"] .sliding-leaf,[data-state="moving"] .sliding-leaf { animation:slide-gate 1.8s ease-in-out infinite alternate; }
      [data-state="open"] .sectional-leaf { transform:translateY(-72%) scaleY(.28); opacity:.35; }
      [data-state="opening"] .sectional-leaf,[data-state="closing"] .sectional-leaf,[data-state="moving"] .sectional-leaf { animation:lift-gate 1.8s ease-in-out infinite alternate; }
      .gate-state { color:#fff; font-size:clamp(18px,2.4vw,28px); font-weight:900; letter-spacing:.025em; }
      .gate-hint { margin-top:3px; }
      .status-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px; }
      .wicket-card,.motion-card { min-height:82px; display:flex; align-items:center; gap:12px; padding:13px 15px; border:1px solid #334155; border-radius:17px; background:#141d2e; color:var(--text); text-align:left; }
      .wicket-card { --state-color:#94a3b8; --state-bg:#334155; --state-glow:rgba(100,116,139,.2); border-color:var(--state-color); background:linear-gradient(110deg,var(--state-bg),#141d2e 72%); cursor:pointer; transition:transform .16s ease,box-shadow .22s ease; }
      .wicket-card:hover { transform:translateY(-1px); box-shadow:0 9px 22px var(--state-glow); }
      .wicket-card:active { transform:scale(.99); }
      .wicket-card:disabled { cursor:default; opacity:.78; }
      .status-icon { flex:0 0 auto; display:grid; place-items:center; width:43px; height:43px; border-radius:13px; background:#253147; color:#cbd5e1; }
      .wicket-card .status-icon { color:var(--state-color); }
      .motion-card.active { border-color:#22c55e; background:linear-gradient(90deg,#153424,#141d2e); }
      .motion-card.active .status-icon { color:#4ade80; background:#17472d; }
      .status-copy { flex:1; min-width:0; }
      .status-title { font-weight:800; }
      .status-state { margin-top:2px; font-size:13px; font-weight:750; }
      .status-hint { margin-top:2px; color:var(--muted); font-size:11px; }
      .status-action { color:var(--state-color); }
      .pulse { width:11px; height:11px; border-radius:50%; background:#64748b; }
      .pulse.active { background:#22c55e; box-shadow:0 0 0 0 rgba(34,197,94,.55); animation:pulse 1.45s infinite; }
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
      @keyframes pulse { 70% { box-shadow:0 0 0 13px rgba(34,197,94,0); } 100% { box-shadow:0 0 0 0 rgba(34,197,94,0); } }
      @media (max-width:720px) { .gate-grid,.status-grid { grid-template-columns:1fr; } .gate-card { min-height:210px; } .header { align-items:flex-start; } }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; } }
    `;
  }
}

if (!customElements.get("garage-panel")) {
  customElements.define("garage-panel", GaragePanel);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "garage-panel",
  name: "Garage Panel",
  description: "Компактная панель управления воротами и калиткой",
  preview: true,
});

console.info(`%c GARAGE-PANEL %c v${PANEL_VERSION} `, "color:#fff;background:#2563eb;font-weight:700", "color:#2563eb;background:#dbeafe");
