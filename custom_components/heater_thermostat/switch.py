"""Master thermostat switch entity."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN
from .controller import HeaterThermostatController
from .entity import HeaterThermostatEntityMixin


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the master switch."""
    controller: HeaterThermostatController = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([HeaterThermostatSwitch(controller, entry)])


class HeaterThermostatSwitch(
    HeaterThermostatEntityMixin, SwitchEntity, RestoreEntity
):
    """Enable or disable automatic heater control."""

    _attr_name = None
    _attr_icon = "mdi:radiator"

    def __init__(
        self,
        controller: HeaterThermostatController,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the thermostat switch."""
        super().__init__(controller, entry)
        self._attr_unique_id = entry.entry_id

    @property
    def is_on(self) -> bool:
        """Return whether automatic control is enabled."""
        return self.controller.enabled

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose everything needed by the dashboard card."""
        return {
            "current_temperature": self.controller.current_temperature,
            "temperature_unit": self.controller.temperature_unit,
            "temperature_entity": self.controller.temperature_entity_id,
            "heater_entity": self.controller.heater_entity_id,
            "heater_state": "on" if self.controller.heater_is_on else "off",
            "control_status": self.controller.status,
            "on_temperature": self.controller.on_temperature,
            "off_temperature": self.controller.off_temperature,
            "on_temperature_entity": self.controller.on_temperature_entity_id,
            "off_temperature_entity": self.controller.off_temperature_entity_id,
            "min_temperature": self.controller.min_temperature,
            "max_temperature": self.controller.max_temperature,
            "step": self.controller.step,
            "min_gap": self.controller.min_gap,
            "min_cycle_seconds": self.controller.min_cycle_seconds,
            "fail_safe": self.controller.fail_safe,
        }

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Enable automatic control."""
        await self.controller.async_set_enabled(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Disable automatic control and force the heater off."""
        await self.controller.async_set_enabled(False)

    async def async_added_to_hass(self) -> None:
        """Restore the previous enabled state."""
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        enabled = last_state is not None and last_state.state == STATE_ON
        await self.controller.async_set_enabled(enabled)
        self.async_write_ha_state()
