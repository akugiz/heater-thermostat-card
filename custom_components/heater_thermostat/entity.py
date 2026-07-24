"""Shared entity support for Heater Thermostat."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN
from .controller import HeaterThermostatController


class HeaterThermostatEntityMixin:
    """Shared entity properties and update subscription."""

    _attr_has_entity_name = True

    def __init__(
        self,
        controller: HeaterThermostatController,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the entity mixin."""
        self.controller = controller
        self.entry = entry

    @property
    def device_info(self) -> DeviceInfo:
        """Return the virtual thermostat device information."""
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=self.entry.title,
            manufacturer="Home Assistant Community",
            model="Dual-threshold heater thermostat",
            configuration_url="https://github.com/akugiz/heater-thermostat-card",
        )

    async def async_added_to_hass(self) -> None:
        """Subscribe to controller updates."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.controller.async_add_listener(self.async_write_ha_state)
        )
