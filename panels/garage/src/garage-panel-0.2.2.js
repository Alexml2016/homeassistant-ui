import "./garage-panel.js?v=0.2.0";

const PANEL_PATCH_VERSION = "0.2.2";
const WICKET_STATE_STYLES = {
  closed: {
    color: "#4ade80",
    background: "#14532d",
    glow: "rgba(34,197,94,.24)",
  },
  open: {
    color: "#f87171",
    background: "#7f1d1d",
    glow: "rgba(239,68,68,.24)",
  },
  unavailable: {
    color: "#94a3b8",
    background: "#334155",
    glow: "rgba(100,116,139,.2)",
  },
};

const GaragePanel = customElements.get("garage-panel");

if (!GaragePanel) {
  throw new Error("garage-panel 0.2.2: базовый компонент garage-panel не зарегистрирован");
}

GaragePanel.prototype._updateWicket = function updateWicket() {
  const card = this.shadowRoot.getElementById("wicket-card");
  const stateEl = this.shadowRoot.getElementById("wicket-state");
  const hint = this.shadowRoot.getElementById("wicket-hint");
  const entity = this._entity(this._config.wicket_sensor);
  const configured = Boolean(
    this._config.wicket_sensor
      && (this._config.wicket_entity || this._config.wicket_service),
  );

  card.hidden = !configured;
  if (!configured) return null;

  const unavailable = !entity
    || ["unknown", "unavailable"].includes(entity.state);
  const open = !unavailable
    && ["on", "open", "opening", "unlocked"].includes(entity.state);
  const key = unavailable ? "unavailable" : open ? "open" : "closed";
  const style = WICKET_STATE_STYLES[key];

  card.dataset.state = key;
  card.style.setProperty("--state-color", style.color);
  card.style.setProperty("--state-bg", style.background);
  card.style.setProperty("--state-glow", style.glow);
  stateEl.textContent = unavailable
    ? "НЕДОСТУПНА"
    : open
      ? "ОТКРЫТА"
      : "ЗАКРЫТА";
  hint.textContent = unavailable
    ? "Проверьте датчик калитки"
    : "Нажмите, чтобы открыть замок";

  // Состояние калитки влияет только на индикацию. При доступном датчике
  // кнопка всегда активна, в том числе когда калитка уже открыта.
  card.disabled = unavailable;
  if (!unavailable) {
    card.removeAttribute("disabled");
    card.setAttribute("aria-disabled", "false");
  } else {
    card.setAttribute("aria-disabled", "true");
  }

  return { key, entity };
};

GaragePanel.prototype._openWicket = async function openWicket() {
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
    if (this._config.wicket_entity && !data.entity_id) {
      data.entity_id = this._config.wicket_entity;
    }
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
    console.debug("garage-panel: wicket action", `${domain}.${service}`, data);
    await this._hass.callService(domain, service, data);
  } catch (error) {
    console.error("garage-panel: wicket open failed", error);
    this._notify("Не удалось открыть замок калитки");
  }
};

console.info(
  `%c GARAGE-PANEL PATCH %c v${PANEL_PATCH_VERSION} `,
  "color:#fff;background:#2563eb;font-weight:700",
  "color:#2563eb;background:#dbeafe",
);
