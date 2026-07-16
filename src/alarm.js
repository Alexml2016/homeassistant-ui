import { readEntity } from "./utils.js";

export class AlarmState {
  constructor(config) {
    this.config = config;
  }

  read(hass) {
    const entity = readEntity(hass, this.config.alarmEntity);
    return {
      available: Boolean(entity) && !["unknown", "unavailable"].includes(entity.state),
      armed: entity?.state === this.config.armedState,
      rawState: entity?.state ?? "unavailable",
    };
  }
}
