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

const SEGMENT_NAMES = Object.freeze(["a", "b", "c", "d", "e", "f", "g"]);
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function createElement(tagName, className, attributes = {}) {
  const element = document.createElement(tagName);
  element.className = className;

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createSegment(name) {
  const segment = createElement("span", `segment segment-${name}`, {
    "aria-hidden": "true",
  });
  segment.dataset.segment = name;
  return segment;
}

function createDigit() {
  const frame = createElement("div", "digit-frame", {
    "aria-hidden": "true",
  });

  for (const name of SEGMENT_NAMES) {
    frame.append(createSegment(name));
  }

  return {
    element: frame,
    segments: new Map(
      [...frame.querySelectorAll(".segment")].map((segment) => [
        segment.dataset.segment,
        segment,
      ]),
    ),
  };
}

function createColon() {
  const frame = createElement("div", "colon-frame", {
    "aria-hidden": "true",
  });

  frame.append(
    createElement("span", "colon-dot colon-dot-top"),
    createElement("span", "colon-dot colon-dot-bottom"),
  );

  return frame;
}

/**
 * Seven-segment clock renderer that uses only standard DOM elements.
 *
 * This deliberately avoids nested custom elements because Home Assistant's
 * scoped custom element registry can reject their construction inside a
 * panel_custom component.
 */
export class SegmentRenderer {
  constructor(container) {
    if (!(container instanceof Element)) {
      throw new TypeError("SegmentRenderer requires a DOM container element");
    }

    this._container = container;
    this._root = null;
    this._digits = [];
    this._value = "00:00";
  }

  create() {
    if (this._root) return this._root;

    const display = createElement("div", "segment-display", {
      role: "timer",
      "aria-live": "off",
      "aria-label": this._value,
    });

    this._digits = [0, 1, 2, 3].map(() => createDigit());
    const colon = createColon();

    display.append(
      this._digits[0].element,
      this._digits[1].element,
      colon,
      this._digits[2].element,
      this._digits[3].element,
    );

    this._container.replaceChildren(display);
    this._root = display;
    this.setTime(this._value);
    return display;
  }

  setTime(value) {
    const match = String(value ?? "").match(TIME_PATTERN);
    if (!match) return false;

    this._value = `${match[1]}:${match[2]}`;
    const characters = `${match[1]}${match[2]}`;

    if (!this._root) this.create();

    this._digits.forEach((digit, index) => {
      this._renderDigit(digit, characters[index]);
    });

    this._root.setAttribute("aria-label", this._value);
    return true;
  }

  get value() {
    return this._value;
  }

  get element() {
    return this._root;
  }

  destroy() {
    this._root?.remove();
    this._root = null;
    this._digits = [];
  }

  _renderDigit(digit, value) {
    const normalized = Object.hasOwn(SEGMENTS, value) ? value : " ";
    const activeSegments = new Set(SEGMENTS[normalized]);

    for (const [name, segment] of digit.segments) {
      segment.classList.toggle("is-on", activeSegments.has(name));
    }
  }
}

export { SEGMENTS };
