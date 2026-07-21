const PANEL_VERSION = "0.1.0";

const DEFAULTS = {
  title: "Гараж и ворота",
  courtyard_name: "Дворовые ворота",
  garage_name: "Гаражные ворота",
  motion_name: "Движение в гараже",
  show_activity: true,
  confirm_open: false,
};

const STATE_COLORS = {
  closed: "#166534",
  open: "#b91c1c",
  opening: "#b45309",
  closing: "#b45309",
  moving: "#b45309",
  error: "#7e22ce",
  unavailable: "#475569",
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

  static getConfigElement() {
    return document.createElement("garage-panel-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:garage-panel",
      courtyard_cover: "cover.courtyard_gate",
      courtyard_open_sensor: "binary_sensor.courtyard_gate_open",
      courtyard_closed_sensor: "binary_sensor.courtyard_gate_closed",
      garage_cover: "cover.garage_gate",
      garage_open_sensor: "binary_sensor.garage_gate_open",
      garage_closed_sensor: "binary_sensor.garage_gate_closed",
      motion_sensor: "binary_sensor.garage_motion",
      temperature_sensor: "sensor.garage_temperature",
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
    return 8;
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
            <div class="header-status">
              <div class="temperature" id="temperature">—</div>
              <div class="online"><span class="online-dot"></span>ESPHome</div>
            </div>
          </header>

          <main class="gate-grid">
            ${this._gateTemplate("courtyard", this._config.courtyard_name, "Откатные ворота")}
            ${this._gateTemplate("garage", this._config.garage_name, "Подъёмные ворота")}
          </main>

          <section class="motion-card" id="motion-card">
            <div class="motion-icon"><ha-icon icon="mdi:motion-sensor"></ha-icon></div>
            <div class="motion-copy">
              <div class="motion-title">${this._escape(this._config.motion_name)}</div>
              <div class="motion-state" id="motion-state">Нет данных</div>
            </div>
            <div class="pulse" id="motion-pulse"></div>
          </section>

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

    this._rendered = true;
  }

  _gateTemplate(kind, title, subtitle) {
    return `
      <button class="gate-card" id="${kind}-card" type="button" aria-label="${this._escape(title)}">
        <div class="gate-topline">
          <div>
            <div class="gate-title">${this._escape(title)}</div>
            <div class="gate-subtitle">${subtitle}</div>
          </div>
          <ha-icon class="gate-action" icon="mdi:gesture-tap-button"></ha-icon>
        </div>
        <div class="gate-visual ${kind}" id="${kind}-visual">
          ${kind === "courtyard" ? this._courtyardSvg() : this._garageSvg()}
        </div>
        <div class="gate-state" id="${kind}-state">—</div>
        <div class="gate-hint" id="${kind}-hint">Нажмите для управления</div>
      </button>
    `;
  }

  _update() {
    if (!this._hass || !this._config || !this._rendered) return;

    const courtyard = this._resolveGateState("courtyard");
    const garage = this._resolveGateState("garage");

    this._updateGate("courtyard", courtyard, STATE_LABELS);
    this._updateGate("garage", garage, GARAGE_STATE_LABELS);
    this._updateTemperature();
    this._updateMotion();
    this._updateActivity(courtyard, garage);
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

    card.dataset.state = data.key;
    card.style.setProperty("--state-color", STATE_COLORS[data.key]);
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

  _updateTemperature() {
    const el = this.shadowRoot.getElementById("temperature");
    const entity = this._entity(this._config.temperature_sensor);
    if (!entity || ["unknown", "unavailable"].includes(entity.state)) {
      el.textContent = "—";
      return;
    }
    const unit = entity.attributes.unit_of_measurement || "°C";
    el.textContent = `${entity.state} ${unit}`;
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

  _updateActivity(courtyard, garage) {
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
      const ok = window.confirm(`Открыть: ${kind === "courtyard" ? this._config.courtyard_name : this._config.garage_name}?`);
      if (!ok) return;
    }

    try {
      await this._hass.callService("cover", "toggle", { entity_id: entityId });
    } catch (error) {
      console.error("garage-panel: cover.toggle failed", error);
      this._fireEvent("hass-notification", { message: `Не удалось выполнить команду для ${entityId}` });
    }
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

  _fireEvent(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
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
      :host { display:block; --panel-bg:#0b1220; --surface:#172033; --text:#f8fafc; --muted:#94a3b8; }
      * { box-sizing:border-box; }
      ha-card { overflow:hidden; border-radius:28px; background:linear-gradient(145deg,#111827,#070b13); color:var(--text); }
      .panel { padding:clamp(16px,3vw,32px); }
      .header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:22px; }
      .eyebrow { color:#60a5fa; font-size:11px; font-weight:800; letter-spacing:.18em; }
      h1 { margin:3px 0 0; font-size:clamp(25px,4vw,42px); line-height:1.05; }
      .header-status { text-align:right; }
      .temperature { font-size:clamp(22px,3vw,34px); font-weight:800; }
      .online { margin-top:4px; color:var(--muted); font-size:12px; }
      .online-dot { display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px #22c55e; }
      .gate-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
      .gate-card { position:relative; min-height:390px; padding:22px; overflow:hidden; border:1px solid color-mix(in srgb,var(--state-color) 48%,transparent); border-radius:26px; background:linear-gradient(155deg,color-mix(in srgb,var(--state-color) 30%,#172033),#101827 68%); color:var(--text); text-align:left; cursor:pointer; transition:transform .16s ease, box-shadow .25s ease, background .25s ease; -webkit-tap-highlight-color:transparent; }
      .gate-card::after { content:""; position:absolute; inset:auto -20% -55% 15%; height:80%; background:radial-gradient(circle,color-mix(in srgb,var(--state-color) 48%,transparent),transparent 70%); pointer-events:none; }
      .gate-card:hover { transform:translateY(-2px); box-shadow:0 18px 45px color-mix(in srgb,var(--state-color) 25%,transparent); }
      .gate-card:active { transform:scale(.985); }
      .gate-card:disabled { cursor:not-allowed; filter:saturate(.65); }
      .gate-topline { position:relative; z-index:2; display:flex; align-items:flex-start; justify-content:space-between; }
      .gate-title { font-size:clamp(20px,2.2vw,30px); font-weight:800; }
      .gate-subtitle,.gate-hint { color:#cbd5e1; font-size:13px; }
      .gate-action { color:#e2e8f0; opacity:.65; }
      .gate-visual { position:relative; z-index:2; height:205px; display:grid; place-items:center; }
      svg { width:min(100%,420px); max-height:190px; overflow:visible; }
      svg * { vector-effect:non-scaling-stroke; }
      .gate-frame,.garage-frame { fill:none; stroke:#dbeafe; stroke-width:7; stroke-linecap:round; stroke-linejoin:round; opacity:.9; }
      .sliding-leaf,.sectional-leaf { fill:color-mix(in srgb,var(--state-color) 42%,#cbd5e1); stroke:#f8fafc; stroke-width:3; transition:transform 1s ease, opacity .5s ease; transform-box:fill-box; transform-origin:center; }
      circle { fill:#f8fafc; }
      [data-state="open"] .sliding-leaf { transform:translateX(-72%); opacity:.28; }
      [data-state="opening"] .sliding-leaf,[data-state="closing"] .sliding-leaf,[data-state="moving"] .sliding-leaf { animation:slide-gate 1.8s ease-in-out infinite alternate; }
      [data-state="open"] .sectional-leaf { transform:translateY(-72%) scaleY(.28); opacity:.35; }
      [data-state="opening"] .sectional-leaf,[data-state="closing"] .sectional-leaf,[data-state="moving"] .sectional-leaf { animation:lift-gate 1.8s ease-in-out infinite alternate; }
      .gate-state { position:relative; z-index:2; color:#fff; font-size:clamp(25px,3vw,40px); font-weight:900; letter-spacing:.035em; }
      .gate-hint { position:relative; z-index:2; margin-top:7px; }
      .motion-card { display:flex; align-items:center; gap:15px; margin-top:18px; padding:18px 20px; border:1px solid #263449; border-radius:20px; background:#141d2e; transition:.25s ease; }
      .motion-card.active { border-color:#22c55e; background:linear-gradient(90deg,#153424,#141d2e); }
      .motion-icon { display:grid; place-items:center; width:47px; height:47px; border-radius:15px; background:#253147; color:#cbd5e1; }
      .motion-card.active .motion-icon { color:#4ade80; background:#17472d; }
      .motion-copy { flex:1; }
      .motion-title { font-weight:750; }
      .motion-state { margin-top:3px; color:var(--muted); font-size:13px; }
      .pulse { width:12px; height:12px; border-radius:50%; background:#64748b; }
      .pulse.active { background:#22c55e; box-shadow:0 0 0 0 rgba(34,197,94,.55); animation:pulse 1.45s infinite; }
      .activity { margin-top:18px; padding:20px; border-radius:22px; background:#121a2a; border:1px solid #263449; }
      .section-title { margin-bottom:10px; font-size:17px; font-weight:800; }
      .activity-row { display:grid; grid-template-columns:35px minmax(0,1fr) auto; align-items:center; gap:10px; padding:11px 0; border-top:1px solid rgba(148,163,184,.13); }
      .activity-row:first-child { border-top:0; }
      .activity-row ha-icon { color:#93c5fd; }
      .activity-copy { min-width:0; display:flex; flex-direction:column; }
      .activity-copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .activity-copy span,time { color:var(--muted); font-size:12px; }
      @keyframes slide-gate { from { transform:translateX(0); } to { transform:translateX(-34%); } }
      @keyframes lift-gate { from { transform:translateY(0) scaleY(1); } to { transform:translateY(-38%) scaleY(.55); } }
      @keyframes pulse { 70% { box-shadow:0 0 0 13px rgba(34,197,94,0); } 100% { box-shadow:0 0 0 0 rgba(34,197,94,0); } }
      @media (max-width:720px) { .gate-grid { grid-template-columns:1fr; } .gate-card { min-height:350px; } .header { align-items:flex-start; } }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; } }
    `;
  }
}

customElements.define("garage-panel", GaragePanel);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "garage-panel",
  name: "Garage Panel",
  description: "Панель управления откатными и подъёмными воротами",
  preview: true,
});

console.info(`%c GARAGE-PANEL %c v${PANEL_VERSION} `, "color:#fff;background:#2563eb;font-weight:700", "color:#2563eb;background:#dbeafe");
