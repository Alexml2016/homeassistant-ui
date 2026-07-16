import { readEntity, safeNumber } from "./utils.js";

export class WeatherState {
  constructor(config) {
    this.config = config;
  }

  read(hass) {
    const entity = readEntity(hass, this.config.weatherEntity);
    const temperature = safeNumber(entity?.attributes?.temperature);
    const available =
      Boolean(entity) &&
      !["unknown", "unavailable"].includes(entity.state) &&
      temperature !== null;

    const unit =
      entity?.attributes?.temperature_unit ??
      hass?.config?.unit_system?.temperature ??
      "°C";

    let category = "normal";
    if (!available) category = "unavailable";
    else if (temperature <= 0) category = "cold";
    else if (temperature >= 30) category = "hot";

    return {
      available,
      temperature,
      unit,
      category,
      text: available
        ? `${this.config.temperaturePrefix}: ${temperature.toFixed(1)}${unit}`
        : `${this.config.temperaturePrefix}: —`,
    };
  }
}
