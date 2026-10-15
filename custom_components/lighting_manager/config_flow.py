"""UI installation flow for Lighting Manager."""

from __future__ import annotations

from typing import Any

import probatio
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult

from .const import DOMAIN


class LightingManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure a single local Lighting Manager instance."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Create the integration with no credentials required."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Lighting Manager", data={})
        return self.async_show_form(step_id="user", data_schema=probatio.Schema({}))
