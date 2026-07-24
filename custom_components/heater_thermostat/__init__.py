"""Heater Thermostat integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CARD_RESOURCE_URL, CARD_URL_PATH, DOMAIN, PLATFORMS
from .controller import HeaterThermostatController

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register the bundled dashboard card."""
    frontend_dir = Path(__file__).parent / "frontend"
    try:
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    CARD_URL_PATH.rsplit("/", 1)[0],
                    str(frontend_dir),
                    False,
                )
            ]
        )
    except RuntimeError:
        _LOGGER.debug("Heater Thermostat frontend path is already registered")

    await _async_register_card_resource(hass)
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up one Heater Thermostat config entry."""
    controller = HeaterThermostatController(hass, entry)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = controller
    await controller.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Heater Thermostat config entry."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False

    controller: HeaterThermostatController = hass.data[DOMAIN].pop(entry.entry_id)
    await controller.async_stop()
    return True


async def _async_register_card_resource(hass: HomeAssistant) -> None:
    """Add or update the card resource in Lovelace storage mode."""
    lovelace_data = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace_data, "resources", None)

    if resources is None or not hasattr(resources, "async_create_item"):
        _LOGGER.warning(
            "Could not automatically register Heater Thermostat Card. "
            "Lovelace YAML mode must add %s as a module",
            CARD_RESOURCE_URL,
        )
        return

    await resources.async_get_info()
    base_path = CARD_URL_PATH
    for item in resources.async_items():
        current_url = item.get("url", "")
        if current_url.split("?", 1)[0] != base_path:
            continue
        if current_url != CARD_RESOURCE_URL or item.get("type") != "module":
            await resources.async_update_item(
                item["id"],
                {"res_type": "module", "url": CARD_RESOURCE_URL},
            )
        return

    await resources.async_create_item(
        {"res_type": "module", "url": CARD_RESOURCE_URL}
    )
