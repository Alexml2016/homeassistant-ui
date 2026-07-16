const SEGMENTS = Object.freeze({
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "c", "d", "g"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
  " ": [],
});

function createSegment(name) {
  const segment = document.createElement("span");
  segment.className = `segment segment-${name}`;
  segment.dataset.segment = name;
  segment.setAttribute("aria-hidden", "true");
  return segment;
}

export class SevenSegmentDigit extends HTMLElement {
  constructor() {
    super();
    this._value = " ";
    this.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./clock.css", import.meta.url).href;

    const frame = document.createElement("span");
    frame.className = "digit-frame";
    for (const name of ["a", "b", "c", "d", "e", "f", "g"]) {
      frame.append(createSegment(name));
    }

    this.shadowRoot.append(link, frame);
    this._segments = new Map(
      [...frame.querySelectorAll(".segment")].map((element) => [
        element.dataset.segment,
        element,
      ]),
    );
  }

  static get observedAttributes() {
    return ["value"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "value" && oldValue !== newValue) {
      this.value = newValue;
    }
  }

  get value() {
    return this._value;
  }

  set value(value) {
    const normalized = String(value ?? " ").slice(0, 1);
    this._value = Object.hasOwn(SEGMENTS, normalized) ? normalized : " ";
    this.setAttribute("aria-label", this._value.trim() || "пусто");
    this._render();
  }

  _render() {
    const active = new Set(SEGMENTS[this._value] ?? []);
    for (const [name, element] of this._segments) {
      element.classList.toggle("is-on", active.has(name));
    }
  }
}

export class SevenSegmentColon extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./clock.css", import.meta.url).href;

    const frame = document.createElement("span");
    frame.className = "colon-frame";
    frame.innerHTML = `
      <span class="colon-dot colon-dot-top" aria-hidden="true"></span>
      <span class="colon-dot colon-dot-bottom" aria-hidden="true"></span>
    `;

    this.shadowRoot.append(link, frame);
    this.setAttribute("aria-hidden", "true");
  }
}

export class SevenSegmentDisplay extends HTMLElement {
  constructor() {
    super();
    this._value = "00:00";
    this.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./clock.css", import.meta.url).href;

    const display = document.createElement("div");
    display.className = "segment-display";
    display.setAttribute("role", "timer");
    display.setAttribute("aria-live", "off");

    this._digits = [0, 1, 2, 3].map(() =>
      document.createElement("seven-segment-digit"),
    );
    this._colon = document.createElement("seven-segment-colon");

    display.append(
      this._digits[0],
      this._digits[1],
      this._colon,
      this._digits[2],
      this._digits[3],
    );
    this.shadowRoot.append(link, display);
    this._display = display;
  }

  set value(value) {
    const match = String(value ?? "").match(/^(\d{2}):(\d{2})$/);
    if (!match) return;
    this._value = `${match[1]}:${match[2]}`;
    const characters = `${match[1]}${match[2]}`;
    this._digits.forEach((digit, index) => {
      digit.value = characters[index];
    });
    this._display.setAttribute("aria-label", this._value);
  }

  get value() {
    return this._value;
  }
}

if (!customElements.get("seven-segment-digit")) {
  customElements.define("seven-segment-digit", SevenSegmentDigit);
}
if (!customElements.get("seven-segment-colon")) {
  customElements.define("seven-segment-colon", SevenSegmentColon);
}
if (!customElements.get("seven-segment-display")) {
  customElements.define("seven-segment-display", SevenSegmentDisplay);
}
