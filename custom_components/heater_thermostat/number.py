"""Temperature threshold number entities for Heater Thermostat."""

from __future__ import annotations

from homeassistant.components.number import (
    NumberDeviceClass,
    NumberMode,
    RestoreNumber,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .controller import HeaterThermostatController
from .entity import HeaterThermostatEntityMixin


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up threshold entities."""
    controller: HeaterThermostatController = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            HeaterThermostatThresholdNumber(controller, entry, "on"),
            HeaterThermostatThresholdNumber(controller, entry, "off"),
        ]
    )


class HeaterThermostatThresholdNumber(HeaterThermostatEntityMixin, RestoreNumber):
    """One restorable thermostat temperature threshold."""

    _attr_device_class = NumberDeviceClass.TEMPERATURE
    _attr_mode = NumberMode.BOX

    def __init__(
        self,
        controller: HeaterThermostatController,
        entry: ConfigEntry,
        threshold: str,
    ) -> None:
        """Initialize a threshold number."""
        super().__init__(controller, entry)
        self.threshold = threshold
        self._attr_unique_id = f"{entry.entry_id}_{threshold}_temperature"
        self._attr_name = (
            "Heater ON temperature"
            if threshold == "on"
            else "Heater OFF temperature"
        )
        self._attr_icon = "mdi:radiator" if threshold == "on" else "mdi:radiator-off"
        self._attr_native_min_value = controller.min_temperature
        self._attr_native_max_value = controller.max_temperature
        self._attr_native_step = controller.step
        self._attr_native_unit_of_measurement = controller.temperature_unit

    @property
    def native_value(self) -> float:
        """Return the current threshold."""
        if self.threshold == "on":
            return self.controller.on_temperature
        return self.controller.off_temperature

    async def async_set_native_value(self, value: float) -> None:
        """Set the threshold."""
        if self.threshold == "on":
            await self.controller.async_set_on_temperature(value)
        else:
            await self.controller.async_set_off_temperature(value)

    async def async_added_to_hass(self) -> None:
        """Restore the previous threshold and publish the entity id."""
        await super().async_added_to_hass()
        restored = await self.async_get_last_number_data()
        restored_value = restored.native_value if restored is not None else None

        if self.threshold == "on":
            self.controller.on_temperature_entity_id = self.entity_id
            if restored_value is not None:
                await self.controller.async_set_on_temperature(restored_value)
        else:
            self.controller.off_temperature_entity_id = self.entity_id
            if restored_value is not None:
                await self.controller.async_set_off_temperature(restored_value)

        await self.controller.async_evaluate()
        self.async_write_ha_state()
