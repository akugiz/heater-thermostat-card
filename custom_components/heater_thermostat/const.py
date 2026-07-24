"""Constants for Heater Thermostat."""

from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "heater_thermostat"
PLATFORMS: list[Platform] = [Platform.SWITCH, Platform.NUMBER]

CONF_TEMPERATURE_ENTITY = "temperature_entity"
CONF_HEATER_ENTITY = "heater_entity"
CONF_ON_TEMPERATURE = "on_temperature"
CONF_OFF_TEMPERATURE = "off_temperature"
CONF_MIN_TEMPERATURE = "min_temperature"
CONF_MAX_TEMPERATURE = "max_temperature"
CONF_STEP = "step"
CONF_MIN_GAP = "min_gap"
CONF_MIN_CYCLE = "min_cycle_seconds"
CONF_FAIL_SAFE = "fail_safe"

DEFAULT_NAME = "Heater Thermostat"
DEFAULT_ON_TEMPERATURE = 17.0
DEFAULT_OFF_TEMPERATURE = 22.0
DEFAULT_MIN_TEMPERATURE = 5.0
DEFAULT_MAX_TEMPERATURE = 30.0
DEFAULT_STEP = 0.5
DEFAULT_MIN_GAP = 1.0
DEFAULT_MIN_CYCLE = 300
DEFAULT_FAIL_SAFE = True

CARD_VERSION = "0.1.0"
CARD_URL_PATH = "/heater_thermostat/heater-thermostat-card.js"
CARD_RESOURCE_URL = f"{CARD_URL_PATH}?v={CARD_VERSION}"
