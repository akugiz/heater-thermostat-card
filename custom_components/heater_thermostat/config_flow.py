"""Config and options flow for Heater Thermostat."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
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


def _validate_settings(values: dict[str, Any]) -> dict[str, str]:
    """Validate thermostat settings and return flow errors."""
    errors: dict[str, str] = {}

    on_temperature = float(values[CONF_ON_TEMPERATURE])
    off_temperature = float(values[CONF_OFF_TEMPERATURE])
    min_temperature = float(values[CONF_MIN_TEMPERATURE])
    max_temperature = float(values[CONF_MAX_TEMPERATURE])
    min_gap = float(values[CONF_MIN_GAP])

    if min_temperature >= max_temperature:
        errors["base"] = "invalid_range"
    elif on_temperature < min_temperature or on_temperature > max_temperature:
        errors["base"] = "on_out_of_range"
    elif off_temperature < min_temperature or off_temperature > max_temperature:
        errors["base"] = "off_out_of_range"
    elif off_temperature - on_temperature < min_gap:
        errors["base"] = "gap_too_small"

    return errors


def _entry_values(entry: ConfigEntry) -> dict[str, Any]:
    """Return the effective settings for a config entry."""
    return {
        **entry.data,
        **entry.options,
        CONF_NAME: entry.title,
    }


def _heater_is_used(
    entries: list[ConfigEntry],
    heater_entity_id: str,
    *,
    exclude_entry_id: str | None = None,
) -> bool:
    """Return whether another thermostat already controls the heater."""
    for entry in entries:
        if entry.entry_id == exclude_entry_id:
            continue
        settings = {**entry.data, **entry.options}
        if settings.get(CONF_HEATER_ENTITY) == heater_entity_id:
            return True
    return False


def _schema(values: dict[str, Any]) -> vol.Schema:
    """Return the complete thermostat settings form."""
    temperature_entity_key = vol.Required(CONF_TEMPERATURE_ENTITY)
    if values.get(CONF_TEMPERATURE_ENTITY):
        temperature_entity_key = vol.Required(
            CONF_TEMPERATURE_ENTITY,
            default=values[CONF_TEMPERATURE_ENTITY],
        )

    heater_entity_key = vol.Required(CONF_HEATER_ENTITY)
    if values.get(CONF_HEATER_ENTITY):
        heater_entity_key = vol.Required(
            CONF_HEATER_ENTITY,
            default=values[CONF_HEATER_ENTITY],
        )

    return vol.Schema(
        {
            vol.Required(
                CONF_NAME,
                default=values.get(CONF_NAME, DEFAULT_NAME),
            ): selector.TextSelector(),
            temperature_entity_key: selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain="sensor",
                    device_class=SensorDeviceClass.TEMPERATURE,
                )
            ),
            heater_entity_key: selector.EntitySelector(
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


class HeaterThermostatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle Heater Thermostat setup."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Set up a thermostat from the UI."""
        errors: dict[str, str] = {}

        if user_input is not None:
            errors = _validate_settings(user_input)

            if not errors and _heater_is_used(
                self.hass.config_entries.async_entries(DOMAIN),
                user_input[CONF_HEATER_ENTITY],
            ):
                errors["base"] = "heater_in_use"

            if not errors:
                await self.async_set_unique_id(user_input[CONF_HEATER_ENTITY])
                self._abort_if_unique_id_configured()
                data = dict(user_input)
                title = str(data.pop(CONF_NAME)).strip() or DEFAULT_NAME
                return self.async_create_entry(title=title, data=data)

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(user_input or {}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> "HeaterThermostatOptionsFlow":
        """Return the options flow handler."""
        return HeaterThermostatOptionsFlow()


class HeaterThermostatOptionsFlow(OptionsFlowWithReload):
    """Allow every thermostat setting to be edited after setup."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show and save all thermostat settings."""
        errors: dict[str, str] = {}

        if user_input is not None:
            errors = _validate_settings(user_input)

            if not errors and _heater_is_used(
                self.hass.config_entries.async_entries(DOMAIN),
                user_input[CONF_HEATER_ENTITY],
                exclude_entry_id=self.config_entry.entry_id,
            ):
                errors["base"] = "heater_in_use"

            if not errors:
                options = dict(user_input)
                title = str(options.pop(CONF_NAME)).strip() or DEFAULT_NAME
                self.hass.config_entries.async_update_entry(
                    self.config_entry,
                    title=title,
                )
                return self.async_create_entry(data=options)

        values = user_input or _entry_values(self.config_entry)
        return self.async_show_form(
            step_id="init",
            data_schema=_schema(values),
            errors=errors,
        )
