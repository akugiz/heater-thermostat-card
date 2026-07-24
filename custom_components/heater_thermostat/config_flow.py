"""Config flow for Heater Thermostat."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.const import CONF_NAME
from homeassistant.helpers import selector

from .const import (
    CONF_FAIL_SAFE,
    CONF_HEATER_ENTITY,
    CONF_MAX_TEMPERATURE,
    CONF_MIN_CYCLE,
    CONF_MIN_GAP,
    CONF_MIN_TEMPERATURE,
    CONF_OFF_TEMPERATURE,
    CONF_ON_TEMPERATURE,
    CONF_STEP,
    CONF_TEMPERATURE_ENTITY,
    DEFAULT_FAIL_SAFE,
    DEFAULT_MAX_TEMPERATURE,
    DEFAULT_MIN_CYCLE,
    DEFAULT_MIN_GAP,
    DEFAULT_MIN_TEMPERATURE,
    DEFAULT_NAME,
    DEFAULT_OFF_TEMPERATURE,
    DEFAULT_ON_TEMPERATURE,
    DEFAULT_STEP,
    DOMAIN,
)


class HeaterThermostatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle Heater Thermostat setup."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Set up a thermostat from the UI."""
        errors: dict[str, str] = {}

        if user_input is not None:
            on_temperature = float(user_input[CONF_ON_TEMPERATURE])
            off_temperature = float(user_input[CONF_OFF_TEMPERATURE])
            min_temperature = float(user_input[CONF_MIN_TEMPERATURE])
            max_temperature = float(user_input[CONF_MAX_TEMPERATURE])
            min_gap = float(user_input[CONF_MIN_GAP])

            if min_temperature >= max_temperature:
                errors["base"] = "invalid_range"
            elif on_temperature < min_temperature or on_temperature > max_temperature:
                errors["base"] = "on_out_of_range"
            elif off_temperature < min_temperature or off_temperature > max_temperature:
                errors["base"] = "off_out_of_range"
            elif off_temperature - on_temperature < min_gap:
                errors["base"] = "gap_too_small"
            else:
                await self.async_set_unique_id(user_input[CONF_HEATER_ENTITY])
                self._abort_if_unique_id_configured()
                title = str(user_input.pop(CONF_NAME)).strip() or DEFAULT_NAME
                return self.async_create_entry(title=title, data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=self._schema(user_input or {}),
            errors=errors,
        )

    @staticmethod
    def _schema(values: dict[str, Any]) -> vol.Schema:
        """Return the setup form schema."""
        return vol.Schema(
            {
                vol.Required(
                    CONF_NAME,
                    default=values.get(CONF_NAME, DEFAULT_NAME),
                ): selector.TextSelector(),
                vol.Required(CONF_TEMPERATURE_ENTITY): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="sensor",
                        device_class=SensorDeviceClass.TEMPERATURE,
                    )
                ),
                vol.Required(CONF_HEATER_ENTITY): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="switch")
                ),
                vol.Required(
                    CONF_ON_TEMPERATURE,
                    default=values.get(
                        CONF_ON_TEMPERATURE, DEFAULT_ON_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=-20,
                        max=60,
                        step=0.5,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_OFF_TEMPERATURE,
                    default=values.get(
                        CONF_OFF_TEMPERATURE, DEFAULT_OFF_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=-20,
                        max=60,
                        step=0.5,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_MIN_TEMPERATURE,
                    default=values.get(
                        CONF_MIN_TEMPERATURE, DEFAULT_MIN_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=-20,
                        max=60,
                        step=0.5,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_MAX_TEMPERATURE,
                    default=values.get(
                        CONF_MAX_TEMPERATURE, DEFAULT_MAX_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=-20,
                        max=60,
                        step=0.5,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_STEP,
                    default=values.get(CONF_STEP, DEFAULT_STEP),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0.1,
                        max=5,
                        step=0.1,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_MIN_GAP,
                    default=values.get(CONF_MIN_GAP, DEFAULT_MIN_GAP),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0.1,
                        max=10,
                        step=0.1,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                ),
                vol.Required(
                    CONF_MIN_CYCLE,
                    default=values.get(CONF_MIN_CYCLE, DEFAULT_MIN_CYCLE),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=0,
                        max=3600,
                        step=30,
                        mode=selector.NumberSelectorMode.BOX,
                        unit_of_measurement="seconds",
                    )
                ),
                vol.Required(
                    CONF_FAIL_SAFE,
                    default=values.get(CONF_FAIL_SAFE, DEFAULT_FAIL_SAFE),
                ): selector.BooleanSelector(),
            }
        )
