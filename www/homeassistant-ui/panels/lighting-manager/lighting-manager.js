/**
 * Lighting Manager v0.2 — visual Home Assistant dashboard.
 * Actual HA entities and Lighting Manager rules; no demo data.
 * No third-party browser dependencies.
 */

const LM_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const LM_STATUS = {
  active: "Активно",
  inactive: "Ожидание",
  pending_off: "Задержка выключения",
  disabled: "Выключено",
  unavailable: "Недоступно",
  error: "Ошибка",
};

function lmEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function lmOption(value, label, selected) {
  return '<option value="' + lmEscape(value) + '"' +
    (String(value) === String(selected) ? " selected" : "") +
    ">" + lmEscape(label) + "</option>";
}

function lmEventOptions(value, includeDuration = false) {
  const options = [
    ["sunset", "Закат"],
    ["sunrise", "Рассвет"],
    ["time", "Заданное время"],
  ];
  if (includeDuration) options.push(["duration", "Через заданный интервал"]);
  return options.map((pair) => lmOption(pair[0], pair[1], value)).join("");
}

function lmClone(object) {
  return JSON.parse(JSON.stringify(object));
}

const LM_STYLE = [
  ":host { display:block; color:var(--primary-text-color); font-family:inherit; }",
  "ha-card.lm { --lm-accent:#e5ad3d; --lm-border:var(--divider-color,#d7d9dc); padding:0;",
  "  color:var(--primary-text-color); background:var(--card-background-color,var(--ha-card-background,#fff));",
  "  overflow:hidden; border-radius:18px; }",
  ".lm * { box-sizing:border-box; }",
  ".head { padding:24px 26px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:18px; flex-wrap:wrap;",
  "  background:linear-gradient(120deg,rgba(229,173,61,.13),transparent 65%); }",
  ".eyebrow { text-transform:uppercase; letter-spacing:.13em; font-size:11px; color:var(--secondary-text-color); font-weight:700; }",
  "h2 { margin:6px 0 6px; font-size:clamp(22px,3vw,30px); font-weight:750; letter-spacing:-.035em; }",
  "h3 { margin:0; font-size:17px; font-weight:700; letter-spacing:-.02em; }",
  "h4 { margin:0 0 8px; font-size:14px; }",
  ".muted { color:var(--secondary-text-color); }",
  ".sub { font-size:12px; line-height:1.45; }",
  ".head .subtitle { font-size:13px; margin:0; }",
  ".head-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }",
  ".stats { display:flex; gap:8px; flex-wrap:wrap; padding:0 26px 22px; }",
  ".stat { display:flex; flex-direction:column; min-width:96px; padding:10px 14px; border:1px solid var(--lm-border);",
  "  border-radius:13px; background:var(--secondary-background-color,rgba(128,128,128,.05)); }",
  ".stat strong { font-size:20px; line-height:1.2; }",
  ".stat small { color:var(--secondary-text-color); font-size:11px; }",
  ".layout { display:grid; grid-template-columns:minmax(260px,.85fr) minmax(320px,1.3fr); border-top:1px solid var(--lm-border); }",
  ".left { padding:23px; border-right:1px solid var(--lm-border); min-width:0; }",
  ".right { padding:23px 26px 26px; min-width:0; }",
  ".section-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; }",
  ".stack { display:grid; gap:10px; }",
  "button, input, select, textarea { font:inherit; }",
  "button { cursor:pointer; transition:background .13s,border-color .13s,transform .13s; }",
  "button:disabled { opacity:.53; cursor:wait; }",
  ".btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--lm-border);",
  "  border-radius:10px; background:var(--card-background-color,#fff); color:var(--primary-text-color); padding:9px 12px;",
  "  font-size:12px; font-weight:650; line-height:1.2; }",
  ".btn:hover:not(:disabled) { border-color:var(--primary-color,#e5ad3d); background:var(--secondary-background-color,#eee); }",
  ".btn.primary { background:var(--primary-color,#d99b25); color:#fff; border-color:transparent; }",
  ".btn.primary:hover { filter:brightness(1.08); }",
  ".btn.danger { color:var(--error-color,#d33); }",
  ".btn.icon { padding:9px; min-width:36px; }",
  ".btn.sm { padding:6px 9px; }",
  ".field, .select { min-width:0; width:100%; padding:10px 11px; border:1px solid var(--lm-border); border-radius:10px;",
  "  background:var(--card-background-color,#fff); color:var(--primary-text-color); outline-offset:2px; }",
  ".field:focus, .select:focus { border-color:var(--primary-color,#d99b25); }",
  ".search { margin-bottom:13px; }",
  ".devices { display:grid; gap:8px; max-height:520px; overflow-y:auto; padding-right:2px; }",
  ".device { display:flex; gap:8px; align-items:center; border:1px solid var(--lm-border); border-radius:14px;",
  "  padding:11px; background:var(--card-background-color,#fff); }",
  ".device[data-current='true'] { border-color:var(--primary-color,#d9a33a); background:rgba(229,173,61,.08); }",
  ".device-pick { display:flex; align-items:center; gap:10px; flex:1; min-width:0; padding:0; border:0;",
  "  color:inherit; text-align:left; background:none; }",
  ".device-icon { flex:0 0 40px; height:40px; border-radius:12px; display:grid; place-items:center;",
  "  background:var(--secondary-background-color,rgba(120,120,120,.09)); color:var(--secondary-text-color); }",
  ".device[data-power='on'] .device-icon { background:rgba(229,173,61,.2); color:#dba034; }",
  ".device-text { display:flex; flex-direction:column; min-width:0; gap:4px; }",
  ".device-name { font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
  ".device-detail { font-size:11px; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
  ".power { flex:0 0 38px; height:38px; border:1px solid var(--lm-border); color:var(--secondary-text-color);",
  "  border-radius:11px; background:var(--secondary-background-color,rgba(120,120,120,.08)); display:grid; place-items:center; }",
  ".device[data-power='on'] .power { background:rgba(229,173,61,.22); color:#ba8117; border-color:rgba(229,173,61,.5); }",
  ".power[disabled] { opacity:.35; }",
  ".badge { display:inline-block; border-radius:99px; padding:5px 8px; font-size:11px; font-weight:650;",
  "  background:var(--secondary-background-color,rgba(120,120,120,.1)); color:var(--secondary-text-color); }",
  ".badge.active { color:#16824d; background:rgba(24,151,81,.12); }",
  ".badge.manual { color:#a76c16; background:rgba(229,173,61,.16); }",
  ".badge.warning { color:var(--error-color,#c33); background:rgba(196,49,49,.09); }",
  ".line { border:0; border-top:1px solid var(--lm-border); margin:18px 0; }",
  ".device-heading { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:18px; }",
  ".device-heading h3 { font-size:20px; }",
  ".rule-list { display:grid; gap:8px; margin-bottom:13px; }",
  ".ruleitem { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid var(--lm-border);",
  "  color:inherit; background:var(--card-background-color,#fff); text-align:left; min-width:0; }",
  ".ruleitem[data-current='true'] { border-color:var(--primary-color,#e5ad3d); background:rgba(229,173,61,.06); }",
  ".ruleitem .label { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1; }",
  ".ruleitem strong { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }",
  ".settings { border:1px solid var(--lm-border); border-radius:15px; padding:17px; background:var(--secondary-background-color,rgba(128,128,128,.035)); }",
  ".settings .section-head { margin-bottom:15px; }",
  ".form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }",
  ".form-row { display:grid; gap:6px; min-width:0; }",
  ".form-row > label, .f-label { font-size:12px; font-weight:650; }",
  ".full { grid-column:1/-1; }",
  ".row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }",
  ".row.tight { gap:5px; }",
  ".row .grow { flex:1; min-width:120px; }",
  ".weekdays { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:5px; }",
  ".day { padding:9px 0; border:1px solid var(--lm-border); border-radius:9px; background:var(--card-background-color,#fff);",
  "  font-size:11px; font-weight:700; color:var(--secondary-text-color); }",
  ".day[aria-pressed='true'] { background:rgba(229,173,61,.2); border-color:var(--lm-accent); color:var(--primary-text-color); }",
  ".segment { display:flex; border:1px solid var(--lm-border); border-radius:10px; padding:3px; gap:2px; }",
  ".segment button { flex:1; padding:9px 6px; border:0; border-radius:8px; color:var(--secondary-text-color); background:none; font-size:12px; font-weight:650; }",
  ".segment button[aria-pressed='true'] { color:var(--primary-text-color); background:rgba(229,173,61,.17); }",
  ".form-actions { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-top:17px; }",
  ".range { width:100%; accent-color:var(--lm-accent); }",
  ".advanced { margin-top:15px; font-size:12px; }",
  ".advanced summary { cursor:pointer; color:var(--secondary-text-color); font-weight:650; }",
  ".advanced textarea { width:100%; min-height:190px; margin-top:9px; resize:vertical; font:12px/1.4 monospace;",
  "  color:var(--primary-text-color); background:var(--card-background-color,#fff); padding:10px; border:1px solid var(--lm-border); border-radius:9px; }",
  ".manual-box { padding:15px; border:1px solid var(--lm-border); border-radius:14px; margin-top:16px; }",
  ".manual-box .sub { margin:5px 0 12px; }",
  ".note { margin:8px 0; color:var(--secondary-text-color); font-size:12px; line-height:1.5; }",
  ".empty { border:1px dashed var(--lm-border); padding:20px; border-radius:12px; color:var(--secondary-text-color);",
  "  text-align:center; font-size:13px; line-height:1.6; }",
  ".msg { min-height:18px; margin:11px 0 0; font-size:12px; }",
  ".msg.error { color:var(--error-color,#c33); }",
  ".msg.ok { color:#208350; }",
  ".foot { padding:13px 25px; font-size:11px; color:var(--secondary-text-color); border-top:1px solid var(--lm-border); }",
  "@media (max-width:800px) { .layout { grid-template-columns:1fr; } .left { border-right:0; border-bottom:1px solid var(--lm-border); }",
  " .devices { max-height:320px; } .right,.left { padding:18px; } .stats { padding:0 18px 18px; } .head { padding:20px 18px 16px; } }",
  "@media (max-width:480px) { .form { grid-template-columns:1fr; } .weekdays { gap:3px; } .day { padding:8px 0; }",
  " .form-actions .btn { flex:1; } }",
].join("\n");

class LightingManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._data = null;
    this._hass = null;
    this._loaded = false;
    this._busy = false;
    this._pendingRefresh = false;
    this._subscribing = false;
    this._unsubscribe = null;
    this._subscriptionGeneration = 0;
    this._selectedEntity = null;
    this._selectedRuleId = null;
    this._draft = null;
    this._dirty = false;
    this._jsonDirty = false;
    this._showAdvanced = false;
    this._addedSwitches = new Set();
    this._filter = "";
    this._managedOnly = false;
    this._manualSeconds = "";
    this._initializedEditor = false;
  }

  setConfig(config) { this._config = config || {}; }
  getCardSize() { return 12; }

  set hass(hass) {
    if (this._hass?.connection && this._hass.connection !== hass?.connection) {
      this._stopLiveUpdates();
      this._loaded = false;
    }
    this._hass = hass;
    if (this.isConnected) {
      this._startLiveUpdates();
      this._updateLiveStates();
    }
  }

  connectedCallback() {
    this._render();
    this._startLiveUpdates();
  }

  disconnectedCallback() {
    this._stopLiveUpdates();
    this._loaded = false;
  }

  _startLiveUpdates() {
    if (!this._hass || !this.isConnected) return;
    if (!this._loaded) {
      this._loaded = true;
      void this._refresh();
    }
    void this._subscribeUpdates();
  }

  _stopLiveUpdates() {
    this._subscriptionGeneration += 1;
    this._subscribing = false;
    if (this._unsubscribe) {
      const fn = this._unsubscribe;
      this._unsubscribe = null;
      void Promise.resolve(fn()).catch(() => {});
    }
  }

  async _subscribeUpdates() {
    if (!this._hass?.connection?.subscribeEvents || !this.isConnected
        || this._unsubscribe || this._subscribing) return;
    const generation = this._subscriptionGeneration;
    const connection = this._hass.connection;
    this._subscribing = true;
    try {
      const unsubscribe = await connection.subscribeEvents(() => {
        if (this.isConnected && generation === this._subscriptionGeneration) {
          void this._refresh({ quiet: true });
        }
      }, "lighting_manager_updated");
      if (generation !== this._subscriptionGeneration || !this.isConnected
          || this._hass?.connection !== connection) {
        void Promise.resolve(unsubscribe()).catch(() => {});
      } else {
        this._unsubscribe = unsubscribe;
        void this._refresh({ quiet: true });
      }
    } catch (error) {
      if (generation === this._subscriptionGeneration) {
        this._message("Подписка недоступна: " + (error.message || error), true);
      }
    } finally {
      if (generation === this._subscriptionGeneration) this._subscribing = false;
    }
  }

  async _refresh({ quiet = false } = {}) {
    if (!this._hass || !this.isConnected) return;
    if (this._busy) {
      this._pendingRefresh = true;
      return;
    }
    this._busy = true;
    try {
      const data = await this._hass.connection.sendMessagePromise({ type: "lighting_manager/get" });
      if (!this.isConnected) return;
      this._data = data;
      this._renderData();
      if (!quiet) this._message("Данные обновлены");
    } catch (error) {
      this._message("Ошибка загрузки: " + (error.message || error), true);
    } finally {
      this._busy = false;
      this._flushPendingRefresh();
    }
  }

  _flushPendingRefresh() {
    if (this._pendingRefresh && this.isConnected) {
      this._pendingRefresh = false;
      void this._refresh({ quiet: true });
    }
  }

  async _request(type, body = {}) {
    if (!this._hass || this._busy) return false;
    this._busy = true;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type, ...body });
      if (!this.isConnected) return false;
      this._data = result;
      this._renderData();
      this._message("Изменения сохранены");
      return true;
    } catch (error) {
      this._message("Не удалось сохранить: " + (error.message || error), true);
      return false;
    } finally {
      this._busy = false;
      this._flushPendingRefresh();
    }
  }

  _message(message, error = false) {
    const element = this.shadowRoot?.getElementById("message");
    if (!element) return;
    element.textContent = message;
    element.className = "msg " + (error ? "error" : "ok");
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = [
      "<style>", LM_STYLE, "</style>",
      '<ha-card class="lm">',
      ' <header class="head">',
      '  <div><div class="eyebrow">HOME ASSISTANT · ОСВЕЩЕНИЕ</div>',
      '   <h2>Управление освещением</h2>',
      '   <p class="subtitle muted">Автоматизация, сценарии и ручное управление</p></div>',
      '  <div class="head-actions"><span class="badge">Lighting Manager 0.2</span>',
      '   <button class="btn" id="reload" type="button"><ha-icon icon="mdi:refresh"></ha-icon> Обновить</button></div>',
      ' </header>',
      ' <div class="stats" id="stats"></div>',
      ' <div class="layout">',
      '   <section class="left" aria-label="Осветительные приборы">',
      '    <div class="section-head"><h3>Устройства</h3><span id="device-count" class="badge">—</span></div>',
      '    <input class="field search" id="search" type="search" placeholder="Поиск светильника…" aria-label="Поиск устройств">',
      '    <label class="row sub muted" style="margin-bottom:13px">',
      '     <input type="checkbox" id="managed-only"> Только с правилами',
      '    </label>',
      '    <div class="devices" id="devices"></div>',
      '    <hr class="line">',
      '    <div class="form-row"><label for="switch-picker">Добавить переключатель (switch)</label>',
      '     <div class="row"><select class="select grow" id="switch-picker"></select>',
      '      <button class="btn" id="choose-switch" type="button">Выбрать</button></div>',
      '    </div>',
      '    <p class="note">Переключатели добавляются только по выбору. Светильники доступны автоматически.</p>',
      '   </section>',
      '   <section class="right" aria-label="Настройки освещения">',
      '    <div class="device-heading" id="device-heading"></div>',
      '    <div class="section-head"><h3>Правила устройства</h3>',
      '      <button class="btn sm" id="new-rule" type="button"><ha-icon icon="mdi:plus"></ha-icon> Правило</button>',
      '    </div>',
      '    <div id="rule-list" class="rule-list"></div>',
      '    <div class="settings">',
      '      <div class="section-head"><h3 id="settings-title">Настройки</h3></div>',
      '      <div id="editor-panel"></div>',
      '    </div>',
      '    <div class="manual-box" id="manual-box"></div>',
      '    <p class="msg" id="message" aria-live="polite"></p>',
      '   </section>',
      ' </div>',
      ' <footer class="foot">Правила исполняются в Home Assistant. Данные и статусы поступают из реальной интеграции Lighting Manager.</footer>',
      '</ha-card>',
    ].join("");
    this.shadowRoot.getElementById("reload").addEventListener("click", () => void this._refresh());
    this.shadowRoot.getElementById("search").addEventListener("input", (event) => {
      this._filter = event.target.value.trim().toLowerCase();
      this._renderDevices();
    });
    this.shadowRoot.getElementById("managed-only").addEventListener("change", (event) => {
      this._managedOnly = event.target.checked;
      this._renderDevices();
    });
    this.shadowRoot.getElementById("devices").addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-power-toggle]");
      if (toggle) {
        void this._toggleEntity(toggle.dataset.powerToggle);
        return;
      }
      const button = event.target.closest("[data-device]");
      if (button) this._pickEntity(button.dataset.device);
    });
    this.shadowRoot.getElementById("choose-switch").addEventListener("click", () => {
      const entity = this.shadowRoot.getElementById("switch-picker").value;
      if (!entity) return;
      this._addedSwitches.add(entity);
      this._pickEntity(entity);
    });
    this.shadowRoot.getElementById("new-rule").addEventListener("click", () => this._newRule());
    this.shadowRoot.getElementById("rule-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-rule]");
      if (button) this._pickRule(button.dataset.editRule);
    });
    this.shadowRoot.getElementById("editor-panel").addEventListener("input", (event) => {
      const target = event.target;
      if (target.id === "json-editor") {
        this._jsonDirty = true;
        this._dirty = true;
        return;
      }
      if (target.id === "brightness-range") {
        this.shadowRoot.getElementById("brightness-value").textContent = target.value + "%";
      }
      if (target.matches("[data-field]")) this._onEditorField(target);
    });
    this.shadowRoot.getElementById("editor-panel").addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-field]")) this._onEditorField(target);
    });
    this.shadowRoot.getElementById("editor-panel").addEventListener("click", (event) => {
      const day = event.target.closest("[data-weekday]");
      if (day) { this._toggleDay(Number(day.dataset.weekday)); return; }
      const mode = event.target.closest("[data-mode]");
      if (mode) { this._setMode(mode.dataset.mode); return; }
      const save = event.target.closest("#save-rule");
      if (save) { void this._saveRule(); return; }
      const remove = event.target.closest("#delete-rule");
      if (remove) { void this._deleteRule(); }
    });
    this.shadowRoot.getElementById("manual-box").addEventListener("change", (event) => {
      if (event.target.id === "manual-duration") this._manualSeconds = event.target.value;
    });
    this.shadowRoot.getElementById("manual-box").addEventListener("click", (event) => {
      if (event.target.closest("#hold-manual")) void this._holdManual();
      if (event.target.closest("#clear-manual")) void this._clearManual();
    });
    this._renderData();
  }

  _entityState(id) {
    return this._hass?.states?.[id]?.state
      || this._data?.entities?.find((item) => item.entity_id === id)?.state
      || "unknown";
  }

  _entityName(id) {
    return this._data?.entities?.find((item) => item.entity_id === id)?.name
      || this._hass?.states?.[id]?.attributes?.friendly_name
      || id;
  }

  _supportsBrightness(id) {
    if (!id?.startsWith("light.")) return false;
    const modes = this._hass?.states?.[id]?.attributes?.supported_color_modes;
    return Array.isArray(modes) ? modes.some((mode) => !["onoff", "unknown"].includes(mode)) : true;
  }

  _rulesForEntity(id) {
    return (this._data?.rules || []).filter((rule) => rule.targets?.includes(id));
  }

  _allVisibleDevices() {
    const lights = (this._data?.entities || [])
      .filter((entity) => entity.entity_id.startsWith("light."))
      .map((entity) => entity.entity_id);
    const switches = (this._data?.rules || [])
      .flatMap((rule) => rule.targets || [])
      .filter((id) => id.startsWith("switch."));
    return [...new Set([...lights, ...switches, ...this._addedSwitches])].sort((a, b) =>
      this._entityName(a).localeCompare(this._entityName(b), "ru")
    );
  }

  _renderData() {
    if (!this._data || !this.shadowRoot) return;
    if (!this._selectedEntity) {
      const managed = Object.keys(this._data.outputs || {});
      this._selectedEntity = managed[0] || this._allVisibleDevices()[0] || null;
    }
    const ids = this._allVisibleDevices();
    if (this._selectedEntity && !ids.includes(this._selectedEntity)) {
      this._selectedEntity = ids[0] || null;
      this._draft = null;
      this._initializedEditor = false;
    }
    if (!this._initializedEditor && this._selectedEntity) {
      const initial = this._rulesForEntity(this._selectedEntity)[0] || null;
      this._selectedRuleId = initial?.id || null;
      this._draft = initial ? lmClone(initial) : null;
      this._initializedEditor = true;
      this._renderEditor();
    }
    const rules = this._data.rules || [];
    const on = Object.values(this._data.rule_states || {}).filter((item) => item.active).length;
    const activeTargets = Object.values(this._data.outputs || {}).filter((item) => item.on).length;
    this.shadowRoot.getElementById("stats").innerHTML =
      '<div class="stat"><strong>' + ids.length + '</strong><small>Устройства</small></div>' +
      '<div class="stat"><strong>' + rules.length + '</strong><small>Правила</small></div>' +
      '<div class="stat"><strong>' + on + '</strong><small>Активных правил</small></div>' +
      '<div class="stat"><strong>' + activeTargets + '</strong><small>Автоматически включены</small></div>';
    this._renderDevices();
    this._renderSwitchPicker();
    this._renderRuleList();
    this._renderSelectedHeading();
    this._renderManual();
    this._updateLiveStates();
  }

  _renderDevices() {
    const root = this.shadowRoot?.getElementById("devices");
    if (!root || !this._data) return;
    const ids = this._allVisibleDevices().filter((id) => {
      if (this._managedOnly && !this._rulesForEntity(id).length) return false;
      return !this._filter || (this._entityName(id) + " " + id).toLowerCase().includes(this._filter);
    });
    this.shadowRoot.getElementById("device-count").textContent = ids.length + " устройств";
    if (!ids.length) {
      root.innerHTML = '<div class="empty">Подходящих устройств нет. Снимите фильтр или добавьте правило.</div>';
      return;
    }
    root.innerHTML = ids.map((id) => {
      const ruleCount = this._rulesForEntity(id).length;
      const state = this._entityState(id);
      const override = Boolean(this._data.overrides?.[id]);
      const status = override ? "Ручной режим" : ruleCount ? ruleCount + " правил" : "Без автоматизации";
      return '<div class="device" data-current="' + (id === this._selectedEntity) +
        '" data-power="' + lmEscape(state) + '" data-live-device="' + lmEscape(id) + '">' +
        '<button class="device-pick" type="button" data-device="' + lmEscape(id) + '">' +
        '<span class="device-icon"><ha-icon icon="' +
          (id.startsWith("light.") ? "mdi:lightbulb-outline" : "mdi:toggle-switch-outline") +
        '"></ha-icon></span><span class="device-text"><span class="device-name">' +
        lmEscape(this._entityName(id)) + '</span><span class="device-detail">' +
        lmEscape(status) + ' · <span data-live-state="' + lmEscape(id) + '">' +
        lmEscape(state === "on" ? "Включено" : state === "off" ? "Выключено" : "Недоступно") +
        '</span></span></span></button>' +
        '<button class="power" type="button" data-power-toggle="' + lmEscape(id) +
        '" aria-label="Переключить ' + lmEscape(this._entityName(id)) + '" ' +
        (!["on", "off"].includes(state) ? "disabled" : "") +
        '><ha-icon icon="mdi:power"></ha-icon></button></div>';
    }).join("");
  }

  _renderSwitchPicker() {
    const picker = this.shadowRoot.getElementById("switch-picker");
    const old = picker.value;
    const options = (this._data?.entities || []).filter((item) =>
      item.entity_id.startsWith("switch.") && !this._allVisibleDevices().includes(item.entity_id)
    );
    picker.innerHTML = options.length
      ? options.map((entity) => lmOption(entity.entity_id, entity.name, old)).join("")
      : '<option value="">Нет доступных switch</option>';
    if (old && options.some((entity) => entity.entity_id === old)) picker.value = old;
    this.shadowRoot.getElementById("choose-switch").disabled = !options.length;
  }

  _renderSelectedHeading() {
    const root = this.shadowRoot?.getElementById("device-heading");
    if (!root) return;
    const id = this._selectedEntity;
    if (!id) {
      root.innerHTML = '<div class="empty">Выберите устройство освещения слева.</div>';
      return;
    }
    const override = this._data.overrides?.[id];
    const state = this._entityState(id);
    const badge = override ? '<span class="badge manual">Ручное управление</span>'
      : this._rulesForEntity(id).length ? '<span class="badge active">Автоматизация</span>'
        : '<span class="badge">Не настроено</span>';
    root.innerHTML = '<div><div class="eyebrow">НАСТРОЙКИ УСТРОЙСТВА</div><h3>' +
      lmEscape(this._entityName(id)) + '</h3><div class="sub muted">' + lmEscape(id) +
      ' · <span data-live-state="' + lmEscape(id) + '">' +
      lmEscape(state === "on" ? "Включено" : state === "off" ? "Выключено" : "Недоступно") +
      '</span></div></div>' + badge;
  }

  _renderRuleList() {
    const root = this.shadowRoot?.getElementById("rule-list");
    if (!root) return;
    const rules = this._rulesForEntity(this._selectedEntity);
    if (!rules.length) {
      root.innerHTML = '<div class="empty">У устройства ещё нет правил. Нажмите «+ Правило», чтобы настроить освещение.</div>';
      return;
    }
    root.innerHTML = rules.map((rule) => {
      const status = this._data.rule_states?.[rule.id]?.status || "inactive";
      const readable = LM_STATUS[status] || status;
      const statusClass = status === "active" ? "active" : status === "unavailable" || status === "error" ? "warning" : "";
      return '<button class="ruleitem" type="button" data-edit-rule="' + lmEscape(rule.id) +
        '" data-current="' + (this._selectedRuleId === rule.id) + '">' +
        '<span class="label"><strong>' + lmEscape(rule.name) + '</strong>' +
        '<span class="sub muted">' + lmEscape(rule.start?.type === "motion" ? "По движению" : "По расписанию") +
        ' · ' + lmEscape(rule.id) + '</span></span>' +
        '<span class="badge ' + statusClass + '">' + lmEscape(readable) + '</span>' +
        '<ha-icon icon="mdi:chevron-right"></ha-icon></button>';
    }).join("");
  }

  _updateLiveStates() {
    if (!this.shadowRoot || !this._data) return;
    for (const item of this.shadowRoot.querySelectorAll("[data-live-state]")) {
      const state = this._entityState(item.dataset.liveState);
      item.textContent = state === "on" ? "Включено" :
        state === "off" ? "Выключено" : "Недоступно";
    }
    for (const item of this.shadowRoot.querySelectorAll("[data-live-device]")) {
      const state = this._entityState(item.dataset.liveDevice);
      item.dataset.power = state;
      const button = item.querySelector("[data-power-toggle]");
      if (button) button.disabled = !["on", "off"].includes(state);
    }
  }

  _confirmLoseDraft() {
    if (!this._dirty) return true;
    return window.confirm("Есть несохранённые изменения. Отменить их?");
  }

  _pickEntity(id) {
    if (!id || id === this._selectedEntity) return;
    if (!this._confirmLoseDraft()) return;
    this._selectedEntity = id;
    const rule = this._rulesForEntity(id)[0] || null;
    this._selectedRuleId = rule?.id || null;
    this._draft = rule ? lmClone(rule) : null;
    this._dirty = false;
    this._jsonDirty = false;
    this._showAdvanced = false;
    this._renderData();
    this._renderEditor();
  }

  _pickRule(id) {
    if (id === this._selectedRuleId && this._draft) return;
    if (!this._confirmLoseDraft()) return;
    const rule = (this._data?.rules || []).find((item) => item.id === id);
    if (!rule) return;
    this._selectedRuleId = id;
    this._draft = lmClone(rule);
    this._dirty = false;
    this._jsonDirty = false;
    this._showAdvanced = false;
    this._renderRuleList();
    this._renderEditor();
  }

  _newRule() {
    if (!this._selectedEntity) {
      this._message("Сначала выберите устройство", true);
      return;
    }
    if (!this._confirmLoseDraft()) return;
    this._selectedRuleId = null;
    this._draft = this._newDraft(this._selectedEntity);
    this._dirty = false;
    this._jsonDirty = false;
    this._showAdvanced = false;
    this._renderRuleList();
    this._renderEditor();
  }

  _newDraft(id) {
    const rule = {
      id: "lm_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name: this._entityName(id) + " · Закат — рассвет",
      enabled: true,
      targets: [id],
      days: [1, 2, 3, 4, 5, 6, 7],
      start: { type: "sunset", offset_minutes: 0 },
      end: { type: "sunrise", offset_minutes: 0 },
      end_day: "next",
      transition_seconds: 1,
    };
    if (this._supportsBrightness(id)) rule.brightness_pct = 80;
    return rule;
  }

  _setMode(mode) {
    if (!this._draft) return;
    const current = this._draft.start.type === "motion" ? "motion" : "schedule";
    if (current === mode) return;
    if (mode === "motion") {
      const sensor = (this._data?.entities || []).find((item) => item.entity_id.startsWith("binary_sensor."));
      if (!sensor) {
        this._message("Сначала добавьте binary_sensor движения в Home Assistant", true);
        return;
      }
      this._draft.start = { type: "motion", entity_id: sensor.entity_id };
      this._draft.end = { type: "no_motion", delay_seconds: 300 };
      this._draft.active_period = {
        start: { type: "time", time: "23:00" },
        end: { type: "sunrise", offset_minutes: 0 },
        end_day: "next",
      };
      delete this._draft.end_day;
    } else if (mode === "schedule") {
      this._draft.start = { type: "sunset", offset_minutes: 0 };
      this._draft.end = { type: "sunrise", offset_minutes: 0 };
      this._draft.end_day = "next";
      delete this._draft.active_period;
    } else return;
    this._dirty = true;
    this._renderEditor();
  }

  _toggleDay(day) {
    if (!this._draft) return;
    const days = new Set(this._draft.days || [1, 2, 3, 4, 5, 6, 7]);
    if (days.has(day)) {
      if (days.size === 1) { this._message("Выберите хотя бы один день", true); return; }
      days.delete(day);
    } else days.add(day);
    this._draft.days = [...days].sort((a, b) => a - b);
    this._dirty = true;
    for (const button of this.shadowRoot.querySelectorAll("[data-weekday]")) {
      button.setAttribute("aria-pressed", String(days.has(Number(button.dataset.weekday))));
    }
  }

  _changePoint(point, type) {
    if (type === "time") return { type, time: "19:00" };
    if (type === "duration") return { type, seconds: 3600 };
    return { type, offset_minutes: 0 };
  }

  _onEditorField(target) {
    if (!this._draft) return;
    const field = target.dataset.field;
    const motion = this._draft.start.type === "motion";
    const source = motion ? this._draft.active_period : this._draft;
    const isStart = field.startsWith("start.");
    const isEnd = field.startsWith("end.");
    const needsRender = (isStart || isEnd) && field.endsWith(".type");
    if (field === "name") this._draft.name = target.value;
    else if (field === "enabled") this._draft.enabled = target.checked;
    else if (field === "brightness.enabled") {
      if (target.checked) this._draft.brightness_pct = 80;
      else delete this._draft.brightness_pct;
      this._renderEditor();
    } else if (field === "brightness_pct") this._draft.brightness_pct = Number(target.value);
    else if (field === "transition_seconds") this._draft.transition_seconds = Number(target.value);
    else if (field === "motion.sensor") this._draft.start.entity_id = target.value;
    else if (field === "motion.delay") this._draft.end.delay_seconds = Number(target.value);
    else if (field === "end_day") source.end_day = target.value;
    else if (field === "start.type") {
      source.start = this._changePoint(source.start, target.value);
      this._renderEditor();
    } else if (field === "end.type") {
      source.end = this._changePoint(source.end, target.value);
      if (source.end.type === "duration") source.end_day = "same";
      this._renderEditor();
    } else if (isStart || isEnd) {
      const side = isStart ? "start" : "end";
      const prop = field.slice(side.length + 1);
      source[side][prop] = ["seconds", "offset_minutes"].includes(prop)
        ? Number(target.value) : target.value;
    }
    if (needsRender) this._jsonDirty = false;
    this._dirty = true;
  }

  _pointFields(label, key, point, allowDuration = false) {
    const kind = point.type;
    const typeSelect = '<div class="form-row"><label>' + label + '</label>' +
      '<select class="select" data-field="' + key + '.type">' + lmEventOptions(kind, allowDuration) +
      '</select></div>';
    let detail = "";
    if (kind === "time") {
      detail = '<div class="form-row"><label>Время</label><input class="field" type="time" data-field="' + key +
        '.time" value="' + lmEscape(point.time || "19:00") + '"></div>';
    } else if (kind === "duration") {
      detail = '<div class="form-row"><label>Продолжительность (сек.)</label><input class="field" type="number" min="1" max="86400" data-field="' +
        key + '.seconds" value="' + lmEscape(point.seconds || 3600) + '"></div>';
    } else {
      detail = '<div class="form-row"><label>Смещение относительно ' +
        (kind === "sunset" ? "заката" : "рассвета") +
        ' (минуты)</label><input class="field" type="number" min="-720" max="720" data-field="' +
        key + '.offset_minutes" value="' + lmEscape(point.offset_minutes ?? 0) + '"></div>';
    }
    return typeSelect + detail;
  }

  _renderEditor() {
    const root = this.shadowRoot?.getElementById("editor-panel");
    const title = this.shadowRoot?.getElementById("settings-title");
    if (!root || !title) return;
    if (!this._draft) {
      title.textContent = "Настройки";
      root.innerHTML = '<div class="empty">Выберите существующее правило или создайте новое.</div>';
      return;
    }
    const rule = this._draft;
    title.textContent = (this._selectedRuleId ? "Редактирование" : "Новое правило") +
      (this._dirty ? " · не сохранено" : "");
    const isMotion = rule.start.type === "motion";
    const source = isMotion ? rule.active_period : rule;
    const sensors = (this._data?.entities || []).filter((item) => item.entity_id.startsWith("binary_sensor."));
    const startEnd = !isMotion
      ? this._pointFields("Включение", "start", source.start) +
        this._pointFields("Выключение", "end", source.end, true)
      : '<div class="form-row full"><label>Датчик движения</label><select class="select" data-field="motion.sensor">' +
        sensors.map((item) => lmOption(item.entity_id, item.name, rule.start.entity_id)).join("") +
        '</select></div>' +
        '<div class="form-row"><label>Выключить при отсутствии движения (сек.)</label>' +
        '<input class="field" type="number" min="0" max="86400" data-field="motion.delay" value="' +
        lmEscape(rule.end.delay_seconds ?? 300) + '"></div>' +
        '<div class="form-row full"><label class="f-label">Период работы датчика</label></div>' +
        this._pointFields("Начало периода", "start", source.start) +
        this._pointFields("Конец периода", "end", source.end);
    const nextDay = source.end.type !== "duration"
      ? '<div class="form-row full"><label>Когда заканчивается интервал</label><select class="select" data-field="end_day">' +
        lmOption("same", "В тот же день", source.end_day || "same") +
        lmOption("next", "На следующий день", source.end_day || "same") + '</select></div>'
      : "";
    const days = LM_WEEKDAYS.map((day, index) => {
      const dayIndex = index + 1;
      const selected = (rule.days || [1, 2, 3, 4, 5, 6, 7]).includes(dayIndex);
      return '<button type="button" class="day" data-weekday="' + dayIndex +
        '" aria-pressed="' + selected + '">' + day + '</button>';
    }).join("");
    const showDimmer = this._supportsBrightness(this._selectedEntity);
    const brightness = showDimmer
      ? '<div class="form-row full"><label class="row"><input type="checkbox" data-field="brightness.enabled" ' +
        (Number.isInteger(rule.brightness_pct) ? "checked" : "") +
        '> Управлять яркостью</label></div>' +
        (Number.isInteger(rule.brightness_pct) ?
          '<div class="form-row full"><label>Яркость · <span id="brightness-value">' +
          lmEscape(rule.brightness_pct) + '%</span></label><input class="range" id="brightness-range" type="range" min="1" max="100" step="1" data-field="brightness_pct" value="' +
          lmEscape(rule.brightness_pct) + '"></div>' : "") +
        '<div class="form-row full"><label>Плавный переход (сек.)</label>' +
        '<input class="field" type="number" min="0" max="30" step="0.5" data-field="transition_seconds" value="' +
        lmEscape(rule.transition_seconds ?? 0) + '"></div>'
      : '<div class="form-row full"><p class="note">Этот переключатель не поддерживает настройку яркости.</p></div>';
    root.innerHTML = [
      '<div class="form">',
      '<div class="form-row full"><label for="lm-rule-name">Название правила</label>',
      '<input class="field" id="lm-rule-name" data-field="name" maxlength="120" value="' + lmEscape(rule.name) + '"></div>',
      '<div class="form-row full"><label>Режим управления</label><div class="segment">',
      '<button type="button" data-mode="schedule" aria-pressed="' + !isMotion + '">По расписанию</button>',
      '<button type="button" data-mode="motion" aria-pressed="' + isMotion + '">По движению</button>',
      '</div></div>',
      startEnd,
      nextDay,
      '<div class="form-row full"><label>Дни недели</label><div class="weekdays">' + days + '</div></div>',
      brightness,
      '<div class="form-row full"><label class="row"><input type="checkbox" data-field="enabled" ' +
        (rule.enabled !== false ? "checked" : "") + '> Правило включено</label></div>',
      '</div>',
      (rule.targets.length > 1 ?
        '<p class="note">Это общее правило для ' + rule.targets.length +
        ' устройств. Изменения затронут все его цели.</p>' : ''),
      '<details class="advanced" id="advanced" ' + (this._showAdvanced ? "open" : "") + '>',
      '<summary>Расширенные настройки (JSON)</summary>',
      '<p class="note">Для сложных правил. Изменения JSON при сохранении имеют приоритет над полями формы.</p>',
      '<textarea id="json-editor" spellcheck="false">' +
        lmEscape(this._jsonDirty ? this._advancedValue : JSON.stringify(rule, null, 2)) +
      '</textarea></details>',
      '<div class="form-actions">',
      '<button type="button" class="btn danger" id="delete-rule"' +
        (!this._selectedRuleId ? " disabled" : "") + '>Удалить</button>',
      '<button type="button" class="btn primary" id="save-rule">Сохранить правило</button>',
      '</div>',
    ].join("");
    root.querySelector("#advanced").addEventListener("toggle", (event) => {
      this._showAdvanced = event.target.open;
    });
  }

  async _saveRule() {
    if (!this._draft) return;
    let raw = lmClone(this._draft);
    if (this._jsonDirty) {
      try {
        raw = JSON.parse(this.shadowRoot.getElementById("json-editor").value);
      } catch (error) {
        this._message("Неверный JSON: " + error.message, true);
        return;
      }
    }
    if (!raw?.id || !Array.isArray(raw.targets) || !raw.targets.length || !raw.name) {
      this._message("Заполните название и устройство правила", true);
      return;
    }
    if (raw.start?.type === "motion" && !raw.start.entity_id) {
      this._message("Выберите датчик движения", true);
      return;
    }
    const success = await this._request("lighting_manager/save_rule", { rule: raw });
    if (!success) return;
    this._selectedRuleId = raw.id;
    const saved = (this._data.rules || []).find((item) => item.id === raw.id);
    this._draft = lmClone(saved || raw);
    this._dirty = false;
    this._jsonDirty = false;
    this._showAdvanced = false;
    this._renderEditor();
    this._renderRuleList();
  }

  async _deleteRule() {
    if (!this._selectedRuleId) return;
    const id = this._selectedRuleId;
    if (!window.confirm("Удалить правило «" + this._draft.name + "»?")) return;
    const success = await this._request("lighting_manager/delete_rule", { rule_id: id });
    if (!success) return;
    const next = this._rulesForEntity(this._selectedEntity)[0] || null;
    this._selectedRuleId = next?.id || null;
    this._draft = next ? lmClone(next) : null;
    this._dirty = false;
    this._jsonDirty = false;
    this._renderEditor();
    this._renderRuleList();
  }

  _renderManual() {
    const root = this.shadowRoot?.getElementById("manual-box");
    if (!root) return;
    if (!this._selectedEntity) {
      root.innerHTML = "";
      return;
    }
    const override = this._data?.overrides?.[this._selectedEntity];
    const current = override ? "Активен ручной приоритет" : "Автоматическое управление";
    const manualUntil = override?.mode === "timer" ? " до " +
      new Date(override.until).toLocaleString("ru-RU") : " до следующего события";
    root.innerHTML = [
      '<div class="section-head"><h3>Ручное управление</h3>',
      '<span class="badge ' + (override ? "manual" : "") + '">' + current + '</span></div>',
      '<p class="sub muted">Ручное переключение сохраняет выбранное состояние до следующего события расписания',
      ' или выбранного таймера — что произойдёт раньше.</p>',
      override ? '<p class="note">Удержание' + lmEscape(manualUntil) + '</p>' : "",
      '<div class="form-row"><label for="manual-duration">Вернуть автоматику через</label>',
      '<select class="select" id="manual-duration">',
      lmOption("", "Следующее событие правила", this._manualSeconds),
      lmOption("300", "5 минут", this._manualSeconds),
      lmOption("1800", "30 минут", this._manualSeconds),
      lmOption("3600", "1 час", this._manualSeconds),
      lmOption("7200", "2 часа", this._manualSeconds),
      '</select></div>',
      '<div class="row" style="margin-top:12px">',
      '<button class="btn" type="button" id="hold-manual" ' +
        (!this._rulesForEntity(this._selectedEntity).length ? "disabled" : "") +
        '>Удерживать состояние</button>',
      '<button class="btn" type="button" id="clear-manual" ' +
        (!override ? "disabled" : "") + '>Вернуть автоматику</button>',
      '</div>',
    ].join("");
  }

  async _holdManual() {
    if (!this._selectedEntity || !this._rulesForEntity(this._selectedEntity).length) return;
    const message = { entity_id: this._selectedEntity };
    if (this._manualSeconds) message.duration_seconds = Number(this._manualSeconds);
    await this._request("lighting_manager/set_override", message);
  }

  async _clearManual() {
    if (this._selectedEntity) {
      await this._request("lighting_manager/clear_override", { entity_id: this._selectedEntity });
    }
  }

  async _toggleEntity(id) {
    if (!this._hass || this._busy) return;
    const domain = id?.split(".")[0];
    if (!["light", "switch"].includes(domain)) return;
    const state = this._entityState(id);
    if (!["on", "off"].includes(state)) {
      this._message("Устройство недоступно", true);
      return;
    }
    this._busy = true;
    try {
      // Reserve manual priority before the service call: the rule engine must
      // not undo an intentional action while an active schedule is running.
      if (this._data?.outputs && Object.prototype.hasOwnProperty.call(this._data.outputs, id)) {
        const msg = { type: "lighting_manager/set_override", entity_id: id };
        if (this._manualSeconds) msg.duration_seconds = Number(this._manualSeconds);
        this._data = await this._hass.connection.sendMessagePromise(msg);
      }
      await this._hass.callService(domain, state === "on" ? "turn_off" : "turn_on", { entity_id: id });
      this._renderData();
      this._message("Команда отправлена: " + this._entityName(id));
    } catch (error) {
      this._message("Ошибка управления: " + (error.message || error), true);
    } finally {
      this._busy = false;
      this._flushPendingRefresh();
    }
  }
}

if (!customElements.get("lighting-manager-panel")) {
  customElements.define("lighting-manager-panel", LightingManagerPanel);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "lighting-manager-panel",
    name: "Lighting Manager",
    description: "Визуальное управление освещением, правилами и ручным режимом (v0.2)",
  });
}
