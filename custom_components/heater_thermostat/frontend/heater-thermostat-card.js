/* Heater Thermostat Card v0.2.1 */
class HeaterThermostatCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._drag = null;
  }

  setConfig(config) {
    this._config = {
      show_threshold_boxes: true,
      show_cycle_info: true,
      show_step_buttons: true,
      ...config,
    };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._drag) this.render();
  }

  getCardSize() {
    return this._config.show_threshold_boxes === false ? 5 : 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12 };
  }

  static getStubConfig() {
    return {
      entity: "",
      show_threshold_boxes: true,
      show_cycle_info: true,
      show_step_buttons: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: {
            entity: {
              filter: [{ domain: "switch", integration: "heater_thermostat" }],
            },
          },
        },
        { name: "title", selector: { text: {} } },
        { name: "show_threshold_boxes", selector: { boolean: {} } },
        { name: "show_step_buttons", selector: { boolean: {} } },
        { name: "show_cycle_info", selector: { boolean: {} } },
      ],
      computeLabel: (schema) =>
        ({
          entity: "Heater thermostat",
          title: "Card title",
          show_threshold_boxes: "Show ON/OFF boxes",
          show_step_buttons: "Show − / + buttons",
          show_cycle_info: "Show gap and cycle time",
        })[schema.name],
    };
  }

  _number(...values) {
    for (const value of values) {
      if (value === null) return null;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  _format(value, step = 0.5) {
    if (!Number.isFinite(value)) return "--";
    const decimals = step < 1 ? String(step).split(".")[1]?.length || 1 : 0;
    return Number(value).toFixed(decimals);
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _model() {
    const master = this._hass?.states?.[this._config.entity];
    if (!master) return null;

    const attributes = master.attributes || {};
    const temperature = this._hass.states[attributes.temperature_entity];
    const heater = this._hass.states[attributes.heater_entity];
    const onEntity = this._hass.states[attributes.on_temperature_entity];
    const offEntity = this._hass.states[attributes.off_temperature_entity];

    return {
      enabled: master.state === "on",
      title:
        this._config.title ||
        master.attributes.friendly_name ||
        "Heater Thermostat",
      status: attributes.control_status || "idle",
      unit:
        temperature?.attributes?.unit_of_measurement ||
        attributes.temperature_unit ||
        "°C",
      current: this._number(
        temperature?.state,
        attributes.current_temperature,
        null,
      ),
      heaterOn: heater?.state === "on" || attributes.heater_state === "on",
      on: this._drag
        ? this._drag.on
        : this._number(onEntity?.state, attributes.on_temperature, 17),
      off: this._drag
        ? this._drag.off
        : this._number(offEntity?.state, attributes.off_temperature, 22),
      min: this._number(
        onEntity?.attributes?.min,
        attributes.min_temperature,
        5,
      ),
      max: this._number(
        onEntity?.attributes?.max,
        attributes.max_temperature,
        30,
      ),
      step: this._number(onEntity?.attributes?.step, attributes.step, 0.5),
      gap: this._number(attributes.min_gap, 1),
      cycle: this._number(attributes.min_cycle_seconds, 0),
      onId: attributes.on_temperature_entity,
      offId: attributes.off_temperature_entity,
    };
  }

  _point(angle) {
    const radius = 110;
    const radians = (angle * Math.PI) / 180;
    return {
      x: 180 + radius * Math.cos(radians),
      y: 172 + radius * Math.sin(radians),
    };
  }

  _angle(value, model) {
    const percentage = Math.max(
      0,
      Math.min(1, (value - model.min) / (model.max - model.min || 1)),
    );
    return 180 + percentage * 180;
  }

  _path(startAngle, endAngle) {
    const start = this._point(startAngle);
    const end = this._point(endAngle);
    return `M ${start.x} ${start.y} A 110 110 0 0 1 ${end.x} ${end.y}`;
  }

  _cycle(seconds) {
    if (!seconds) return "Off";
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const minutes = seconds / 60;
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
  }

  _round(value, model) {
    return Number(
      (
        model.min +
        Math.round((value - model.min) / model.step) * model.step
      ).toFixed(4),
    );
  }

  _message(text) {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding:18px;color:var(--secondary-text-color)">
          ${this._escape(text)}
        </div>
      </ha-card>`;
  }

  _stepButtons(type, model) {
    if (this._config.show_step_buttons === false) return "";

    const epsilon = 0.0001;
    const downDisabled =
      type === "on"
        ? model.on <= model.min + epsilon
        : model.off - model.step < model.on + model.gap - epsilon;
    const upDisabled =
      type === "on"
        ? model.on + model.step > model.off - model.gap + epsilon
        : model.off >= model.max - epsilon;

    return `
      <button
        class="step-button ${type}"
        data-threshold="${type}"
        data-direction="-1"
        title="Decrease ${type.toUpperCase()} temperature"
        aria-label="Decrease ${type.toUpperCase()} temperature"
        ${downDisabled ? "disabled" : ""}
      >−</button>
      <div id="${type}box" class="box-value">${this._format(model[type], model.step)}${this._escape(model.unit)}</div>
      <button
        class="step-button ${type}"
        data-threshold="${type}"
        data-direction="1"
        title="Increase ${type.toUpperCase()} temperature"
        aria-label="Increase ${type.toUpperCase()} temperature"
        ${upDisabled ? "disabled" : ""}
      >+</button>`;
  }

  _thresholdControl(type, model) {
    const title = type === "on" ? "Heater ON" : "Heater OFF";
    const hint = type === "on" ? "Drag blue handle" : "Drag red handle";
    const classes = this._config.show_threshold_boxes === false
      ? `threshold-control ${type} compact`
      : `threshold-control ${type}`;

    const controls = this._config.show_step_buttons === false
      ? `<div id="${type}box" class="box-value solo">${this._format(model[type], model.step)}${this._escape(model.unit)}</div>`
      : this._stepButtons(type, model);

    return `
      <div class="${classes}">
        <div class="control-title">${title}</div>
        <div class="stepper">${controls}</div>
        <div class="hint">${hint}</div>
      </div>`;
  }

  render() {
    if (!this.shadowRoot) return;

    if (!this._hass || !this._config.entity) {
      this._message("Select the Heater Thermostat switch in card settings.");
      return;
    }

    const model = this._model();
    if (!model) {
      this._message("Thermostat entity was not found.");
      return;
    }

    if (!model.onId || !model.offId) {
      this._message(
        "Threshold entities are loading. Restart Home Assistant if this remains.",
      );
      return;
    }

    const onAngle = this._angle(model.on, model);
    const offAngle = this._angle(model.off, model);
    const onPoint = this._point(onAngle);
    const offPoint = this._point(offAngle);
    const current =
      model.current === null ? "--" : this._format(model.current, 0.1);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
          --heater-blue: #2196f3;
          --heater-red: #ff4545;
        }

        ha-card {
          overflow: hidden;
          color: var(--primary-text-color);
        }

        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--divider-color);
        }

        button {
          border: 0;
          font: inherit;
        }

        .power {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: white;
          cursor: pointer;
          background: ${
            model.enabled
              ? "var(--success-color, #43a047)"
              : "var(--secondary-background-color)"
          };
          box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
        }

        .power ha-icon {
          --mdc-icon-size: 25px;
        }

        .name {
          flex: 1;
          min-width: 0;
        }

        .title {
          font-size: 17px;
          font-weight: 700;
          color: var(--primary-text-color);
        }

        .subtitle {
          margin-top: 2px;
          font-size: 12px;
          color: var(--secondary-text-color);
          text-transform: capitalize;
        }

        .state {
          font-weight: 800;
          color: ${
            model.enabled
              ? "var(--success-color, #43a047)"
              : "var(--secondary-text-color)"
          };
        }

        .current-block {
          padding: 12px 12px 0;
          text-align: center;
        }

        .current-label {
          color: var(--secondary-text-color);
          font-size: 14px;
        }

        .current-value {
          margin-top: 2px;
          color: var(--primary-text-color);
          font-size: 48px;
          font-weight: 500;
          line-height: 1.05;
        }

        .current-unit {
          margin-left: 3px;
          font-size: 21px;
        }

        .heater-state {
          margin-top: 4px;
          color: ${
            model.heaterOn
              ? "var(--heater-red)"
              : "var(--secondary-text-color)"
          };
          font-size: 14px;
          font-weight: 500;
        }

        .arc-wrap {
          margin-top: 2px;
          padding: 0 8px;
        }

        svg {
          display: block;
          width: 100%;
          max-width: 500px;
          margin: auto;
          overflow: visible;
          touch-action: none;
          user-select: none;
        }

        .arc-base,
        .arc-blue,
        .arc-red {
          fill: none;
          stroke-width: 15;
          stroke-linecap: round;
        }

        .arc-base {
          stroke: var(--divider-color, rgba(127, 127, 127, 0.35));
        }

        .arc-blue {
          stroke: var(--heater-blue);
        }

        .arc-red {
          stroke: var(--heater-red);
        }

        .handle {
          stroke: var(--card-background-color, var(--ha-card-background));
          stroke-width: 4;
          cursor: grab;
          filter: drop-shadow(0 2px 3px rgb(0 0 0 / 35%));
        }

        .handle:active {
          cursor: grabbing;
        }

        .handle.on {
          fill: var(--heater-blue);
        }

        .handle.off {
          fill: var(--heater-red);
        }

        .thresholds {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 0 12px 12px;
        }

        .threshold-control {
          min-width: 0;
          padding: 12px;
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          background: var(--secondary-background-color);
        }

        .threshold-control.on {
          box-shadow: inset 3px 0 0 var(--heater-blue);
        }

        .threshold-control.off {
          box-shadow: inset 3px 0 0 var(--heater-red);
        }

        .threshold-control.compact {
          padding: 6px 4px 10px;
          border: 0;
          background: transparent;
          box-shadow: none;
        }

        .control-title {
          color: var(--secondary-text-color);
          font-size: 14px;
          font-weight: 700;
        }

        .threshold-control.on .control-title {
          color: var(--heater-blue);
        }

        .threshold-control.off .control-title {
          color: var(--heater-red);
        }

        .stepper {
          display: grid;
          grid-template-columns: 38px minmax(54px, 1fr) 38px;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }

        .box-value {
          min-width: 0;
          color: var(--primary-text-color);
          font-size: 24px;
          line-height: 38px;
          text-align: center;
          white-space: nowrap;
        }

        .box-value.solo {
          grid-column: 1 / -1;
        }

        .step-button {
          width: 38px;
          height: 38px;
          border: 1px solid var(--divider-color);
          border-radius: 50%;
          color: var(--primary-text-color);
          background: var(--card-background-color, var(--ha-card-background));
          font-size: 25px;
          line-height: 1;
          cursor: pointer;
          transition: transform 0.08s ease, opacity 0.15s ease;
        }

        .step-button.on {
          border-color: color-mix(in srgb, var(--heater-blue) 55%, var(--divider-color));
        }

        .step-button.off {
          border-color: color-mix(in srgb, var(--heater-red) 55%, var(--divider-color));
        }

        .step-button:active:not(:disabled) {
          transform: scale(0.92);
        }

        .step-button:disabled {
          cursor: default;
          opacity: 0.32;
        }

        .hint {
          margin-top: 4px;
          color: var(--secondary-text-color);
          font-size: 11px;
          text-align: center;
        }

        .footer {
          margin: 0 12px 12px;
          padding: 9px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          color: var(--secondary-text-color);
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 420px) {
          .header {
            padding: 10px 12px;
          }

          .current-block {
            padding-top: 10px;
          }

          .current-value {
            font-size: 44px;
          }

          .thresholds {
            gap: 8px;
            padding: 0 8px 10px;
          }

          .threshold-control {
            padding: 10px 7px;
          }

          .stepper {
            grid-template-columns: 34px minmax(46px, 1fr) 34px;
            gap: 3px;
          }

          .step-button {
            width: 34px;
            height: 34px;
            font-size: 22px;
          }

          .box-value {
            font-size: 21px;
            line-height: 34px;
          }
        }
      </style>

      <ha-card>
        <div class="header">
          <button id="power" class="power" title="Toggle automatic thermostat control">
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
          <div class="name">
            <div class="title">${this._escape(model.title)}</div>
            <div class="subtitle">${this._escape(model.status)}</div>
          </div>
          <div class="state">${model.enabled ? "ON" : "OFF"}</div>
        </div>

        <div class="current-block">
          <div class="current-label">Current temperature</div>
          <div class="current-value">${current}<span class="current-unit">${this._escape(model.unit)}</span></div>
          <div class="heater-state">Heater: ${model.heaterOn ? "ON" : "OFF"}</div>
        </div>

        <div class="arc-wrap">
          <svg id="arc" viewBox="0 0 360 188" role="img" aria-label="Heater temperature thresholds">
            <path class="arc-base" d="${this._path(180, 360)}"></path>
            <path id="blue" class="arc-blue" d="${this._path(180, onAngle)}"></path>
            <path id="red" class="arc-red" d="${this._path(offAngle, 360)}"></path>
            <circle id="on" class="handle on" cx="${onPoint.x}" cy="${onPoint.y}" r="13"></circle>
            <circle id="off" class="handle off" cx="${offPoint.x}" cy="${offPoint.y}" r="13"></circle>
          </svg>
        </div>

        <div class="thresholds">
          ${this._thresholdControl("on", model)}
          ${this._thresholdControl("off", model)}
        </div>

        ${
          this._config.show_cycle_info === false
            ? ""
            : `<div class="footer">Minimum gap: ${this._format(model.gap, model.step)}${this._escape(model.unit)} · Minimum cycle: ${this._cycle(model.cycle)}</div>`
        }
      </ha-card>`;

    this.shadowRoot.querySelector("#power")?.addEventListener("click", () => {
      this._hass.callService(
        "switch",
        model.enabled ? "turn_off" : "turn_on",
        { entity_id: this._config.entity },
      );
    });

    this.shadowRoot.querySelectorAll(".step-button").forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.dataset.threshold;
        const direction = Number(button.dataset.direction);
        this._adjustThreshold(type, direction);
      });
    });

    this._bindDrag();
  }

  async _adjustThreshold(type, direction) {
    const model = this._model();
    if (!model || !["on", "off"].includes(type) || ![-1, 1].includes(direction)) {
      return;
    }

    let value;
    if (type === "on") {
      const maximum = this._round(model.off - model.gap, model);
      value = Math.max(
        model.min,
        Math.min(maximum, this._round(model.on + direction * model.step, model)),
      );
    } else {
      const minimum = this._round(model.on + model.gap, model);
      value = Math.min(
        model.max,
        Math.max(minimum, this._round(model.off + direction * model.step, model)),
      );
    }

    const entityId = type === "on" ? model.onId : model.offId;
    await this._hass.callService("number", "set_value", {
      entity_id: entityId,
      value,
    });
  }

  _bindDrag() {
    const svg = this.shadowRoot.querySelector("#arc");
    if (!svg) return;

    for (const id of ["on", "off"]) {
      this.shadowRoot.querySelector(`#${id}`)?.addEventListener(
        "pointerdown",
        (event) => this._start(id, event),
      );
    }

    svg.addEventListener("pointermove", (event) => this._move(event));
    svg.addEventListener("pointerup", (event) => this._end(event));
    svg.addEventListener("pointercancel", (event) => this._end(event));
  }

  _start(type, event) {
    const model = this._model();
    const svg = this.shadowRoot.querySelector("#arc");
    if (!model || !svg) return;

    this._drag = {
      type,
      pointer: event.pointerId,
      on: model.on,
      off: model.off,
      model,
    };

    svg.setPointerCapture?.(event.pointerId);
    this._move(event);
  }

  _move(event) {
    if (!this._drag || event.pointerId !== this._drag.pointer) return;

    const drag = this._drag;
    const model = drag.model;
    const svg = this.shadowRoot.querySelector("#arc");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * 360) / rect.width;
    const y = ((event.clientY - rect.top) * 188) / rect.height;

    let angle = (Math.atan2(y - 172, x - 180) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    if (angle < 180) angle = x < 180 ? 180 : 360;
    angle = Math.max(180, Math.min(360, angle));

    const value = this._round(
      model.min + ((angle - 180) / 180) * (model.max - model.min),
      model,
    );

    if (drag.type === "on") {
      const maximum =
        model.min +
        Math.floor((drag.off - model.gap - model.min) / model.step) *
          model.step;
      drag.on = Math.max(model.min, Math.min(value, maximum));
    } else {
      const minimum =
        model.min +
        Math.ceil((drag.on + model.gap - model.min) / model.step) *
          model.step;
      drag.off = Math.min(model.max, Math.max(value, minimum));
    }

    this._updateVisuals();
  }

  _updateVisuals() {
    const drag = this._drag;
    if (!drag) return;

    const model = drag.model;
    const onAngle = this._angle(drag.on, model);
    const offAngle = this._angle(drag.off, model);
    const onPoint = this._point(onAngle);
    const offPoint = this._point(offAngle);

    this.shadowRoot
      .querySelector("#blue")
      ?.setAttribute("d", this._path(180, onAngle));
    this.shadowRoot
      .querySelector("#red")
      ?.setAttribute("d", this._path(offAngle, 360));

    for (const [id, point] of [
      ["on", onPoint],
      ["off", offPoint],
    ]) {
      const element = this.shadowRoot.querySelector(`#${id}`);
      element?.setAttribute("cx", point.x);
      element?.setAttribute("cy", point.y);
    }

    for (const [id, value] of [
      ["onbox", drag.on],
      ["offbox", drag.off],
    ]) {
      const element = this.shadowRoot.querySelector(`#${id}`);
      if (element) {
        element.textContent = `${this._format(value, model.step)}${model.unit}`;
      }
    }
  }

  async _end(event) {
    if (!this._drag || event.pointerId !== this._drag.pointer) return;

    const drag = this._drag;
    const entityId = drag.type === "on" ? drag.model.onId : drag.model.offId;
    const value = drag.type === "on" ? drag.on : drag.off;
    this._drag = null;

    await this._hass.callService("number", "set_value", {
      entity_id: entityId,
      value,
    });
    this.render();
  }
}

if (!customElements.get("heater-thermostat-card")) {
  customElements.define("heater-thermostat-card", HeaterThermostatCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "heater-thermostat-card")) {
  window.customCards.push({
    type: "heater-thermostat-card",
    name: "Heater Thermostat Card",
    preview: false,
    description: "Dual-handle heater thermostat arc.",
  });
}
