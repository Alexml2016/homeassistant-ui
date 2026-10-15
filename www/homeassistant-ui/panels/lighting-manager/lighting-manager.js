/**
 * Lighting Manager — administrative rule editor, technical preview v0.1.
 * Lovelace card type: custom:lighting-manager-panel
 * WebSocket commands require Home Assistant administrator permissions.
 */

class LightingManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._data = null;
    this._loaded = false;
    this._busy = false;
    this._pendingRefresh = false;
    this._unsubscribe = null;
    this._subscribing = false;
    this._subscriptionGeneration = 0;
  }

  setConfig(config) {
    this._config = config || {};
  }

  getCardSize() {
    return 9;
  }

  set hass(hass) {
    if (this._hass?.connection && this._hass.connection !== hass?.connection) {
      this._stopLiveUpdates();
      this._loaded = false;
    }
    this._hass = hass;
    if (this.isConnected) this._startLiveUpdates();
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
      const unsubscribe = this._unsubscribe;
      this._unsubscribe = null;
      void Promise.resolve(unsubscribe()).catch(() => {});
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
        // Close the race between the initial snapshot and the subscription.
        void this._refresh({ quiet: true });
      }
    } catch (error) {
      if (generation === this._subscriptionGeneration) {
        this._message("Подписка на обновления недоступна: " + (error.message || error), true);
      }
    } finally {
      if (generation === this._subscriptionGeneration) this._subscribing = false;
    }
  }

  _message(message, error = false) {
    const field = this.shadowRoot.getElementById("message");
    if (!field) return;
    field.textContent = message;
    field.className = error ? "error" : "ok";
  }

  _defaultRule(motion = false) {
    const entities = this._data?.entities || [];
    const target = this.shadowRoot.getElementById("target")?.value
      || entities.find((entity) => entity.entity_id.startsWith("light."))?.entity_id
      || "light.replace_me";
    const rule = {
      id: "lm_" + Date.now(),
      name: motion ? "Освещение по движению" : "Вечернее освещение",
      enabled: true,
      targets: [target],
      days: [1, 2, 3, 4, 5, 6, 7],
      brightness_pct: motion ? 25 : 80,
      transition_seconds: 1,
    };
    if (motion) {
      rule.start = {
        type: "motion",
        entity_id: entities.find((entity) => entity.entity_id.startsWith("binary_sensor."))?.entity_id
          || "binary_sensor.replace_me",
      };
      rule.end = { type: "no_motion", delay_seconds: 300 };
      rule.active_period = {
        start: { type: "time", time: "23:00" },
        end: { type: "sunrise" },
        end_day: "next",
      };
    } else {
      rule.start = { type: "sunset", offset_minutes: 10 };
      rule.end = { type: "time", time: "23:00" };
      rule.end_day = "same";
    }
    return rule;
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
      if (!quiet) this._message("Данные обновлены.");
    } catch (error) {
      if (this.isConnected) this._message("Не удалось получить данные: " + (error.message || error), true);
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
    if (!this._hass || this._busy) return;
    this._busy = true;
    try {
      this._data = await this._hass.connection.sendMessagePromise({ type, ...body });
      this._renderData();
      this._message("Изменения сохранены.");
    } catch (error) {
      this._message("Ошибка: " + (error.message || error), true);
    } finally {
      this._busy = false;
      this._flushPendingRefresh();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: var(--primary-text-color); }
        ha-card { display: block; padding: 18px; background: var(--card-background-color, #fff);
          border-radius: var(--ha-card-border-radius, 12px); }
        h2 { margin: 0 0 8px; font-size: 1.3rem; }
        h3 { margin: 24px 0 10px; font-size: 1.05rem; }
        p { color: var(--secondary-text-color); margin: 6px 0 12px; }
        button, select, textarea { font: inherit; }
        button { border: 1px solid var(--divider-color, #aaa); border-radius: 8px;
          padding: 9px 12px; background: var(--secondary-background-color, #eee);
          color: var(--primary-text-color); cursor: pointer; }
        button.primary { background: var(--primary-color, #03a9f4); color: white; border: 0; }
        button.danger { color: var(--error-color, #c62828); }
        button:disabled { cursor: wait; opacity: .5; }
        .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .rule { display: flex; justify-content: space-between; align-items: center;
          gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--divider-color, #ddd); }
        .rule strong { display: block; }
        .sub { font-size: .86rem; color: var(--secondary-text-color); }
        textarea { box-sizing: border-box; width: 100%; min-height: 290px; padding: 12px;
          border-radius: 8px; border: 1px solid var(--divider-color, #aaa);
          background: var(--card-background-color, #fff); color: var(--primary-text-color);
          font-family: ui-monospace, monospace; }
        select { min-width: 190px; max-width: 100%; padding: 8px; background:
          var(--card-background-color, #fff); color: var(--primary-text-color); }
        #message { min-height: 18px; font-size: .88rem; margin-top: 12px; }
        #message.error { color: var(--error-color, #c62828); }
        #message.ok { color: var(--success-color, #168a43); }
      </style>
      <ha-card>
        <h2>Lighting Manager <small style="font-size:.7em">v0.1.1</small></h2>
        <p>Правила освещения · редактор JSON для администратора Home Assistant</p>
        <div class="bar"><button id="reload">Обновить</button>
        <span class="sub" id="summary"></span></div>
        <h3>Правила</h3>
        <div id="rules"></div>
        <h3>Создать или изменить правило</h3>
        <div class="bar">
          <select id="target" aria-label="Целевое устройство"></select>
          <button id="template-time">Новое расписание</button>
          <button id="template-motion">Новое движение</button>
        </div>
        <p class="sub">Выберите устройство, затем шаблон. При необходимости скорректируйте JSON.</p>
        <textarea id="editor" spellcheck="false" aria-label="JSON правила"></textarea>
        <div class="bar"><button class="primary" id="save">Сохранить правило</button>
          <button class="danger" id="delete">Удалить правило из редактора</button></div>
        <h3>Ручной режим</h3>
        <p class="sub">Состояние устройства сохраняется до следующего события правила или до таймера.</p>
        <div class="bar">
          <select id="override-target" aria-label="Управляемое устройство"></select>
          <select id="override-seconds" aria-label="Таймер удержания">
            <option value="">До следующего события</option>
            <option value="300">5 минут</option>
            <option value="1800">30 минут</option>
            <option value="3600">1 час</option>
          </select>
          <button id="override">Удерживать текущее состояние</button>
          <button id="clear">Вернуть автоматику</button>
        </div>
        <div id="message" aria-live="polite"></div>
      </ha-card>`;

    this._renderData();
    this.shadowRoot.getElementById("reload").addEventListener("click", () => void this._refresh());
    this.shadowRoot.getElementById("template-time").addEventListener("click", () => {
      this.shadowRoot.getElementById("editor").value = JSON.stringify(this._defaultRule(false), null, 2);
    });
    this.shadowRoot.getElementById("template-motion").addEventListener("click", () => {
      this.shadowRoot.getElementById("editor").value = JSON.stringify(this._defaultRule(true), null, 2);
    });
    this.shadowRoot.getElementById("save").addEventListener("click", () => {
      try {
        const rule = JSON.parse(this.shadowRoot.getElementById("editor").value);
        void this._request("lighting_manager/save_rule", { rule });
      } catch (error) {
        this._message("Неверный JSON: " + error.message, true);
      }
    });
    this.shadowRoot.getElementById("delete").addEventListener("click", () => {
      let rule;
      try {
        rule = JSON.parse(this.shadowRoot.getElementById("editor").value);
      } catch (_error) {
        this._message("Сначала выберите правило.", true);
        return;
      }
      if (!rule.id || !window.confirm("Удалить правило " + rule.id + "?")) return;
      void this._request("lighting_manager/delete_rule", { rule_id: rule.id });
    });
    this.shadowRoot.getElementById("override").addEventListener("click", () => {
      const entity_id = this.shadowRoot.getElementById("override-target").value;
      if (!entity_id) return;
      const seconds = this.shadowRoot.getElementById("override-seconds").value;
      const payload = { entity_id };
      if (seconds) payload.duration_seconds = Number(seconds);
      void this._request("lighting_manager/set_override", payload);
    });
    this.shadowRoot.getElementById("clear").addEventListener("click", () => {
      const entity_id = this.shadowRoot.getElementById("override-target").value;
      if (entity_id) {
        void this._request("lighting_manager/clear_override", { entity_id });
      }
    });
  }
  _renderData() {
    const select = this.shadowRoot.getElementById("target");
    const overrideSelect = this.shadowRoot.getElementById("override-target");
    if (!select || !overrideSelect) return;
    const oldTarget = select.value;
    const oldOverrideTarget = overrideSelect.value;
    select.replaceChildren();
    overrideSelect.replaceChildren();
    for (const entity of (this._data?.entities || [])) {
      if (!/^(light|switch)\./.test(entity.entity_id)) continue;
      const option = document.createElement("option");
      option.value = entity.entity_id;
      option.textContent = entity.name + " (" + entity.entity_id + ")";
      select.appendChild(option);
    }
    const targets = Object.keys(this._data?.outputs || {}).sort();
    for (const id of targets) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id + (this._data?.overrides?.[id] ? " — ручной режим" : "");
      overrideSelect.appendChild(option);
    }
    if (oldTarget && Array.from(select.options).some((option) => option.value === oldTarget)) {
      select.value = oldTarget;
    }
    if (oldOverrideTarget && Array.from(overrideSelect.options).some(
      (option) => option.value === oldOverrideTarget
    )) {
      overrideSelect.value = oldOverrideTarget;
    }
    this.shadowRoot.getElementById("summary").textContent =
      (this._data?.rules?.length || 0) + " правил · " + targets.length + " устройств";
    const rules = this.shadowRoot.getElementById("rules");
    rules.replaceChildren();
    const all = this._data?.rules || [];
    if (!all.length) {
      const message = document.createElement("p");
      message.textContent = "Правил пока нет. Создайте первое правило из шаблона.";
      rules.appendChild(message);
    }
    for (const rule of all) {
      const item = document.createElement("div");
      item.className = "rule";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = rule.name;
      const sub = document.createElement("span");
      sub.className = "sub";
      const status = this._data?.rule_states?.[rule.id]?.status || "unknown";
      sub.textContent = rule.id + " · " + rule.targets.join(", ") + " · " + status;
      info.append(title, sub);
      const edit = document.createElement("button");
      edit.textContent = "Редактировать";
      edit.addEventListener("click", () => {
        this.shadowRoot.getElementById("editor").value = JSON.stringify(rule, null, 2);
        this.shadowRoot.getElementById("editor").focus();
      });
      item.append(info, edit);
      rules.appendChild(item);
    }
  }

}

if (!customElements.get("lighting-manager-panel")) {
  customElements.define("lighting-manager-panel", LightingManagerPanel);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "lighting-manager-panel",
    name: "Lighting Manager",
    description: "Правила освещения и ручные режимы (v0.1.1)",
  });
}
