/* Regression tests for live updates in Lighting Manager (no browser dependencies). */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

class FakeElement {
  constructor() {
    this.isConnected = false;
  }
  attachShadow() {
    this.shadowRoot = {
      getElementById: () => ({ textContent: "", className: "" }),
      querySelectorAll: () => [],
      querySelectorAll: () => [],
    };
    return this.shadowRoot;
  }
}
global.HTMLElement = FakeElement;
const definitions = new Map();
global.customElements = {
  get: (name) => definitions.get(name),
  define: (name, definition) => definitions.set(name, definition),
};
global.window = { customCards: [] };
require("../www/homeassistant-ui/panels/lighting-manager/lighting-manager.js");
const Panel = customElements.get("lighting-manager-panel");

const snapshot = Object.freeze({
  rules: [],
  rule_states: {},
  outputs: {},
  overrides: {},
  entities: [],
});

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

function makePanel(connection) {
  const panel = new Panel();
  let fullRenders = 0;
  let updates = 0;
  panel._render = () => { fullRenders += 1; };
  panel._renderData = () => { updates += 1; };
  panel._message = () => {};
  panel.hass = { connection };
  panel.isConnected = true;
  panel.connectedCallback();
  return { panel, get fullRenders() { return fullRenders; },
           get updates() { return updates; } };
}

test("rule update event refreshes status without rerendering editor", async () => {
  const subscriptions = [];
  let unsubscribed = 0;
  let fetches = 0;
  const connection = {
    sendMessagePromise: async (msg) => {
      assert.equal(msg.type, "lighting_manager/get");
      fetches += 1;
      return snapshot;
    },
    subscribeEvents: async (callback, eventName) => {
      assert.equal(eventName, "lighting_manager_updated");
      subscriptions.push(callback);
      return () => { unsubscribed += 1; return Promise.resolve(); };
    },
  };
  const state = makePanel(connection);
  await settle();
  assert.equal(state.fullRenders, 1);
  assert.equal(subscriptions.length, 1);
  const before = state.updates;
  subscriptions[0]({ type: "lighting_manager_updated" });
  await settle();
  assert.equal(state.updates, before + 1);
  assert.equal(state.fullRenders, 1, "background refresh must preserve editor DOM");
  assert.ok(fetches >= 2);

  state.panel.isConnected = false;
  state.panel.disconnectedCallback();
  assert.equal(unsubscribed, 1);
  const previous = fetches;
  subscriptions[0]({ type: "lighting_manager_updated" });
  await settle();
  assert.equal(fetches, previous, "detached panel must not query HA");
});

test("status events during a pending fetch cause a follow-up fetch", async () => {
  let resolveFirst;
  let fetches = 0;
  let subscriber;
  const connection = {
    sendMessagePromise: async () => {
      fetches += 1;
      if (fetches === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      return snapshot;
    },
    subscribeEvents: async (callback) => {
      subscriber = callback;
      return async () => {};
    },
  };
  const state = makePanel(connection);
  await settle();
  assert.equal(fetches, 1, "initial request must be in flight");
  subscriber({ type: "lighting_manager_updated" });
  resolveFirst(snapshot);
  await settle();
  assert.equal(fetches, 2, "pending event must be processed after first request");
  assert.equal(state.fullRenders, 1);
  assert.equal(state.updates, 2);
  state.panel.isConnected = false;
  state.panel.disconnectedCallback();
});

test("reconnect establishes one new subscription", async () => {
  const callbacks = [];
  let unsubscribeCalls = 0;
  const connection = {
    sendMessagePromise: async () => snapshot,
    subscribeEvents: async (cb) => {
      callbacks.push(cb);
      return async () => { unsubscribeCalls += 1; };
    },
  };
  const state = makePanel(connection);
  await settle();
  state.panel.hass = { connection };
  await settle();
  assert.equal(callbacks.length, 1, "repeated hass setter must not duplicate subscription");
  state.panel.isConnected = false;
  state.panel.disconnectedCallback();
  assert.equal(unsubscribeCalls, 1);
  state.panel.isConnected = true;
  state.panel.connectedCallback();
  await settle();
  assert.equal(callbacks.length, 2);
  state.panel.isConnected = false;
  state.panel.disconnectedCallback();
});

test("new rule preserves sunset-to-sunrise and local device", () => {
  const panel = new Panel();
  panel._data = { entities: [{ entity_id: "light.test", name: "Свет" }] };
  panel._supportsBrightness = () => true;
  const rule = panel._newDraft("light.test");
  assert.deepEqual(rule.targets, ["light.test"]);
  assert.deepEqual(rule.start, { type: "sunset", offset_minutes: 0 });
  assert.deepEqual(rule.end, { type: "sunrise", offset_minutes: 0 });
  assert.equal(rule.end_day, "next");
  assert.deepEqual(rule.days, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(rule.brightness_pct, 80);
});

test("switch rules do not offer brightness controls", () => {
  const panel = new Panel();
  panel._data = { entities: [{ entity_id: "switch.porch", name: "Крыльцо" }] };
  panel._supportsBrightness = () => false;
  const rule = panel._newDraft("switch.porch");
  assert.ok(!Object.hasOwn(rule, "brightness_pct"));
  assert.deepEqual(rule.targets, ["switch.porch"]);
});

test("visual editor handles same-day offsets and preserves multiple targets", () => {
  const panel = new Panel();
  panel._draft = {
    id: "shared", name: "Общий свет", enabled: true,
    targets: ["light.a", "light.b"],
    days: [1, 2, 3, 4, 5, 6, 7],
    start: { type: "sunset", offset_minutes: 0 },
    end: { type: "time", time: "23:00" },
    end_day: "same",
  };
  panel._onEditorField({
    dataset: { field: "start.offset_minutes" },
    value: "10",
    checked: false,
  });
  assert.equal(panel._draft.start.offset_minutes, 10);
  assert.deepEqual(panel._draft.targets, ["light.a", "light.b"]);
  assert.deepEqual(panel._draft.end, { type: "time", time: "23:00" });
  assert.equal(panel._dirty, true);
});

test("manual power command sets priority before the light service call", async () => {
  const panel = new Panel();
  panel.isConnected = true;
  panel._data = {
    entities: [{ entity_id: "light.yard", name: "Двор" }],
    outputs: { "light.yard": { on: true } },
    rules: [{ id: "existing", targets: ["light.yard"] }],
    rule_states: {}, overrides: {},
  };
  const calls = [];
  panel._entityState = () => "on";
  panel._renderData = () => {};
  panel._message = () => {};
  panel._hass = {
    connection: {
      sendMessagePromise: async (msg) => {
        calls.push(msg.type);
        return panel._data;
      },
    },
    callService: async (domain, service, data) => {
      calls.push(domain + "." + service);
      assert.deepEqual(data, { entity_id: "light.yard" });
    },
  };
  await panel._toggleEntity("light.yard");
  assert.deepEqual(calls, ["lighting_manager/set_override", "light.turn_off"]);
});


test("visual editor produces independent schedule and motion rules", () => {
  const panel = new Panel();
  panel._data = {
    ...snapshot,
    entities: [
      { entity_id: "light.garden", name: "Сад", state: "off" },
      { entity_id: "binary_sensor.entry", name: "Движение", state: "off" },
    ],
  };
  panel._selectedEntity = "light.garden";
  panel._renderEditor = () => {};
  panel._message = () => {};

  const initial = panel._newDraft("light.garden");
  assert.equal(initial.targets[0], "light.garden");
  assert.equal(initial.start.type, "sunset");
  assert.equal(initial.end.type, "sunrise");
  assert.equal(initial.end_day, "next");
  assert.equal(initial.brightness_pct, 80);
  panel._draft = initial;
  panel._setMode("motion");
  assert.equal(panel._draft.start.type, "motion");
  assert.equal(panel._draft.start.entity_id, "binary_sensor.entry");
  assert.equal(panel._draft.end.delay_seconds, 300);
  assert.equal(panel._draft.active_period.end_day, "next");
  panel._onEditorField({ dataset: { field: "motion.delay" }, value: "60" });
  assert.equal(panel._draft.end.delay_seconds, 60);
  panel._setMode("schedule");
  assert.equal(panel._draft.start.type, "sunset");
  assert.equal(panel._draft.end.type, "sunrise");
  assert.equal(panel._draft.active_period, undefined);
  panel._toggleDay(7);
  assert.deepEqual(panel._draft.days, [1, 2, 3, 4, 5, 6]);
});

test("editor keeps independently selected device and existing rule", () => {
  const panel = new Panel();
  panel._message = () => {};
  panel._renderData = () => {};
  panel._renderEditor = () => {};
  panel._data = {
    ...snapshot,
    rules: [
      { id: "first", name: "Вечер", targets: ["light.garden"], start: { type: "time", time: "19:00" } },
      { id: "second", name: "Ночь", targets: ["light.garden"], start: { type: "time", time: "23:00" } },
    ],
  };
  panel._selectedEntity = "light.garden";
  panel._selectedRuleId = "first";
  panel._draft = { name: "Unsaved changes" };
  panel._dirty = false;
  panel._renderRuleList = () => {};
  panel._pickRule("second");
  assert.equal(panel._selectedRuleId, "second");
  assert.equal(panel._draft.name, "Ночь");
  assert.equal(panel._data.rules[1].name, "Ночь");
  panel._newRule();
  assert.equal(panel._selectedRuleId, null);
  assert.equal(panel._draft.targets[0], "light.garden");
});

test("advanced JSON draft survives visual editor re-rendering", () => {
  const panel = new Panel();
  const containers = {
    "editor-panel": {
      innerHTML: "",
      querySelector: () => ({ addEventListener: () => {} }),
    },
    "settings-title": { textContent: "" },
  };
  panel.shadowRoot.getElementById = (id) => containers[id];
  panel._draft = {
    id: "rule_one", name: "Свет", enabled: true, targets: ["light.garden"],
    start: { type: "time", time: "19:00" },
    end: { type: "duration", seconds: 300 },
    days: [1, 2, 3, 4, 5, 6, 7],
  };
  panel._selectedEntity = "light.garden";
  panel._selectedRuleId = "rule_one";
  panel._showAdvanced = true;
  panel._jsonDirty = true;
  panel._advancedValue = '{"name":"Сохранённые несохранённые изменения"}';
  panel._renderEditor();
  assert.ok(containers["editor-panel"].innerHTML.includes("&quot;name&quot;"));
  assert.ok(containers["editor-panel"].innerHTML.includes("Сохранённые несохранённые изменения"));
});
