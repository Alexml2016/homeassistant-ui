import { readEntity, safeNumber } from "./utils.js";

export class WeatherState {
  constructor(config) {
    this.config = config;
  }

  read(hass) {
    const entity = readEntity(hass, this.config.weatherEntity);
    const temperature = safeNumber(entity?.attributes?.temperature);
    const unit =
      entity?.attributes?.temperature_unit ??
      hass?.config?.unit_system?.temperature ??
      "°C";

    let category = "normal";
    if (temperature === null) category = "unavailable";
    else if (temperature <= 0) category = "cold";
    else if (temperature >= 30) category = "hot";

    return {
      temperature,
      unit,
      category,
      text:
        temperature === null
          ? `${this.config.temperaturePrefix}: —`
          : `${this.config.temperaturePrefix}: ${temperature.toFixed(1)}${unit}`,
    };
  }
}
