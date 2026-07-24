"""Background heater controller for Heater Thermostat."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    ATTR_ENTITY_ID,
    SERVICE_TURN_OFF,
    SERVICE_TURN_ON,
    STATE_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

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
    DEFAULT_OFF_TEMPERATURE,
    DEFAULT_ON_TEMPERATURE,
    DEFAULT_STEP,
)

_LOGGER = logging.getLogger(__name__)

Listener = Callable[[], None]


class HeaterThermostatController:
    """Continuously control one heater from two temperature thresholds."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the controller."""
        self.hass = hass
        self.entry = entry
        self.temperature_entity_id: str = entry.data[CONF_TEMPERATURE_ENTITY]
        self.heater_entity_id: str = entry.data[CONF_HEATER_ENTITY]

        self.min_temperature = float(
            entry.data.get(CONF_MIN_TEMPERATURE, DEFAULT_MIN_TEMPERATURE)
        )
        self.max_temperature = float(
            entry.data.get(CONF_MAX_TEMPERATURE, DEFAULT_MAX_TEMPERATURE)
        )
        self.step = float(entry.data.get(CONF_STEP, DEFAULT_STEP))
        self.min_gap = float(entry.data.get(CONF_MIN_GAP, DEFAULT_MIN_GAP))
        self.min_cycle_seconds = int(entry.data.get(CONF_MIN_CYCLE, DEFAULT_MIN_CYCLE))
        self.fail_safe = bool(entry.data.get(CONF_FAIL_SAFE, DEFAULT_FAIL_SAFE))

        self.on_temperature = float(
            entry.data.get(CONF_ON_TEMPERATURE, DEFAULT_ON_TEMPERATURE)
        )
        self.off_temperature = float(
            entry.data.get(CONF_OFF_TEMPERATURE, DEFAULT_OFF_TEMPERATURE)
        )
        self.enabled = False
        self.status = "disabled"

        self.on_temperature_entity_id: str | None = None
        self.off_temperature_entity_id: str | None = None
        self._listeners: set[Listener] = set()
        self._remove_state_listener: Callable[[], None] | None = None
        self._cancel_delayed_evaluation: Callable[[], None] | None = None
        self._lock = asyncio.Lock()

    @property
    def current_temperature(self) -> float | None:
        """Return the current source temperature."""
        return self._temperature_from_state(
            self.hass.states.get(self.temperature_entity_id)
        )

    @property
    def temperature_unit(self) -> str:
        """Return the source sensor temperature unit."""
        state = self.hass.states.get(self.temperature_entity_id)
        if state is not None and state.attributes.get("unit_of_measurement"):
            return str(state.attributes["unit_of_measurement"])
        return self.hass.config.units.temperature_unit

    @property
    def heater_is_on(self) -> bool:
        """Return whether the physical heater entity is on."""
        return self.hass.states.is_state(self.heater_entity_id, STATE_ON)

    async def async_start(self) -> None:
        """Start listening for source and heater state changes."""
        self._remove_state_listener = async_track_state_change_event(
            self.hass,
            [self.temperature_entity_id, self.heater_entity_id],
            self._async_state_changed,
        )
        await self.async_evaluate()

    async def async_stop(self) -> None:
        """Stop the controller and leave the physical heater safely off."""
        if self._remove_state_listener is not None:
            self._remove_state_listener()
            self._remove_state_listener = None
        self._cancel_delayed()
        if self.heater_is_on:
            await self._async_set_heater(False)

    @callback
    def async_add_listener(self, listener: Listener) -> Callable[[], None]:
        """Register an entity update listener."""
        self._listeners.add(listener)

        @callback
        def remove_listener() -> None:
            self._listeners.discard(listener)

        return remove_listener

    @callback
    def _notify(self) -> None:
        for listener in tuple(self._listeners):
            listener()

    async def async_set_enabled(self, enabled: bool) -> None:
        """Enable or disable automatic heater control."""
        self.enabled = enabled
        self.status = "checking" if enabled else "disabled"
        self._notify()
        await self.async_evaluate(force_off=not enabled)

    async def async_set_on_temperature(self, value: float) -> None:
        """Set the temperature at or below which the heater turns on."""
        value = self._round_to_step(value)
        maximum = self._floor_to_step(self.off_temperature - self.min_gap)
        self.on_temperature = min(max(value, self.min_temperature), maximum)
        self._notify()
        await self.async_evaluate()

    async def async_set_off_temperature(self, value: float) -> None:
        """Set the temperature at or above which the heater turns off."""
        value = self._round_to_step(value)
        minimum = self._ceil_to_step(self.on_temperature + self.min_gap)
        self.off_temperature = max(min(value, self.max_temperature), minimum)
        self._notify()
        await self.async_evaluate()

    async def async_evaluate(self, *, force_off: bool = False) -> None:
        """Evaluate the thermostat state and control the heater."""
        async with self._lock:
            self._cancel_delayed()
            temperature = self.current_temperature
            heater_on = self.heater_is_on

            if force_off or not self.enabled:
                self.status = "disabled"
                if heater_on:
                    await self._async_set_heater(False)
                self._notify()
                return

            if temperature is None:
                self.status = "sensor unavailable"
                if self.fail_safe and heater_on:
                    await self._async_set_heater(False)
                self._notify()
                return

            if temperature <= self.on_temperature and not heater_on:
                if not self._cycle_delay_elapsed():
                    self.status = "waiting to heat"
                    self._schedule_after_cycle_delay()
                else:
                    self.status = "heating"
                    await self._async_set_heater(True)
                self._notify()
                return

            if temperature >= self.off_temperature and heater_on:
                if not self._cycle_delay_elapsed():
                    self.status = "waiting to stop"
                    self._schedule_after_cycle_delay()
                else:
                    self.status = "idle"
                    await self._async_set_heater(False)
                self._notify()
                return

            self.status = "heating" if heater_on else "idle"
            self._notify()

    @callback
    def _async_state_changed(self, event: Event[EventStateChangedData]) -> None:
        """Handle a source temperature or heater state change."""
        self.hass.async_create_task(
            self.async_evaluate(),
            f"Evaluate {self.entry.title}",
        )

    async def _async_set_heater(self, turn_on: bool) -> None:
        """Call the physical heater entity's turn-on or turn-off service."""
        domain = self.heater_entity_id.split(".", 1)[0]
        service = SERVICE_TURN_ON if turn_on else SERVICE_TURN_OFF
        try:
            await self.hass.services.async_call(
                domain,
                service,
                {ATTR_ENTITY_ID: self.heater_entity_id},
                blocking=True,
            )
        except Exception:
            self.status = "control error"
            _LOGGER.exception(
                "Unable to turn %s heater %s",
                "on" if turn_on else "off",
                self.heater_entity_id,
            )

    @staticmethod
    def _temperature_from_state(state: State | None) -> float | None:
        """Convert a state to a usable numeric temperature."""
        if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            return None
        try:
            return float(state.state)
        except (TypeError, ValueError):
            return None

    def _cycle_delay_elapsed(self) -> bool:
        """Return whether the physical heater may be switched now."""
        if self.min_cycle_seconds <= 0:
            return True
        state = self.hass.states.get(self.heater_entity_id)
        if state is None:
            return True
        elapsed = (dt_util.utcnow() - state.last_changed).total_seconds()
        return elapsed >= self.min_cycle_seconds

    def _remaining_cycle_delay(self) -> float:
        """Return remaining minimum-cycle seconds."""
        state = self.hass.states.get(self.heater_entity_id)
        if state is None:
            return 0
        elapsed = (dt_util.utcnow() - state.last_changed).total_seconds()
        return max(0.0, self.min_cycle_seconds - elapsed)

    def _schedule_after_cycle_delay(self) -> None:
        """Schedule a reevaluation when the minimum cycle duration expires."""
        delay = self._remaining_cycle_delay() + 0.2

        async def delayed_evaluation(_now: datetime) -> None:
            self._cancel_delayed_evaluation = None
            await self.async_evaluate()

        self._cancel_delayed_evaluation = async_call_later(
            self.hass,
            delay,
            delayed_evaluation,
        )

    @callback
    def _cancel_delayed(self) -> None:
        if self._cancel_delayed_evaluation is not None:
            self._cancel_delayed_evaluation()
            self._cancel_delayed_evaluation = None

    def _round_to_step(self, value: float) -> float:
        """Round a value to the nearest configured temperature step."""
        if self.step <= 0:
            return float(value)
        rounded = round((float(value) - self.min_temperature) / self.step)
        return round(self.min_temperature + rounded * self.step, 4)

    def _floor_to_step(self, value: float) -> float:
        """Round a value down to the configured step."""
        if self.step <= 0:
            return float(value)
        steps = int((float(value) - self.min_temperature) // self.step)
        return round(self.min_temperature + steps * self.step, 4)

    def _ceil_to_step(self, value: float) -> float:
        """Round a value up to the configured step."""
        if self.step <= 0:
            return float(value)
        relative = (float(value) - self.min_temperature) / self.step
        steps = int(relative) if relative == int(relative) else int(relative) + 1
        return round(self.min_temperature + steps * self.step, 4)
