import { formatDate, pad2 } from "./utils.js";

/**
 * Updates the local clock without causing a full panel re-render.
 */
export class ClockController {
  constructor({ display, dateElement, locale = "ru-RU" }) {
    if (!display) throw new Error("ClockController: display is required");
    if (!dateElement) throw new Error("ClockController: dateElement is required");

    this.display = display;
    this.dateElement = dateElement;
    this.locale = locale;
    this._timer = null;
    this._lastTime = "";
    this._lastDateKey = "";
  }

  start() {
    if (this._timer !== null) return;
    this.update();
    this._scheduleNextTick();
  }

  stop() {
    if (this._timer !== null) {
      window.clearTimeout(this._timer);
      this._timer = null;
    }
  }

  update(now = new Date()) {
    const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    if (time !== this._lastTime) {
      this._lastTime = time;
      this.display.value = time;
    }

    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (dateKey !== this._lastDateKey) {
      this._lastDateKey = dateKey;
      this.dateElement.textContent = formatDate(now, this.locale);
    }
  }

  _scheduleNextTick() {
    const now = Date.now();
    const delay = 1000 - (now % 1000) + 20;
    this._timer = window.setTimeout(() => {
      this._timer = null;
      this.update();
      this._scheduleNextTick();
    }, delay);
  }
}
