/* Heater Thermostat Card v0.1.1 */
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
      ...config,
    };
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._drag) this.render();
  }

  getCardSize() {
    return this._config.show_threshold_boxes === false ? 5 : 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12 };
  }

  static getStubConfig() {
    return {
      entity: "",
      show_threshold_boxes: true,
      show_cycle_info: true,
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
        { name: "show_cycle_info", selector: { boolean: {} } },
      ],
      computeLabel: (schema) =>
        ({
          entity: "Heater thermostat",
          title: "Card title",
          show_threshold_boxes: "Show ON/OFF boxes",
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
    const decimals =
      step < 1 ? String(step).split(".")[1]?.length || 1 : 0;
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
      heaterOn:
        heater?.state === "on" || attributes.heater_state === "on",
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
    const radius = 105;
    const radians = (angle * Math.PI) / 180;
    return {
      x: 180 + radius * Math.cos(radians),
      y: 245 + radius * Math.sin(radians),
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
    return `M ${start.x} ${start.y} A 105 105 0 0 1 ${end.x} ${end.y}`;
  }

  _cycle(seconds) {
    if (!seconds) return "Off";
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const minutes = seconds / 60;
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
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
          padding: 14px 16px;
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

        .arc-wrap {
          padding: 4px 8px 0;
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

        .current-label {
          fill: var(--secondary-text-color);
          font-size: 12px;
          text-anchor: middle;
        }

        .current-value {
          fill: var(--primary-text-color);
          font-size: 41px;
          font-weight: 500;
          text-anchor: middle;
        }

        .heater-state {
          fill: ${
            model.heaterOn
              ? "var(--heater-red)"
              : "var(--secondary-text-color)"
          };
          font-size: 13px;
          text-anchor: middle;
        }

        .threshold-label {
          font-size: 12px;
          font-weight: 700;
        }

        .threshold-value {
          fill: var(--primary-text-color);
          font-size: 18px;
        }

        .align-left {
          text-anchor: start;
        }

        .align-right {
          text-anchor: end;
        }

        .on-text {
          fill: var(--heater-blue);
        }

        .off-text {
          fill: var(--heater-red);
        }

        .boxes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 0 12px 12px;
        }

        .box {
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          border-radius: 12px;
          padding: 13px;
          min-width: 0;
        }

        .box.on {
          box-shadow: inset 3px 0 0 var(--heater-blue);
        }

        .box.off {
          box-shadow: inset 3px 0 0 var(--heater-red);
        }

        .box h4 {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: 14px;
        }

        .box-value {
          margin-top: 8px;
          font-size: 27px;
          color: var(--primary-text-color);
        }

        .hint {
          margin-top: 3px;
          font-size: 11px;
          color: var(--secondary-text-color);
        }

        .footer {
          margin: 0 12px 12px;
          padding: 10px;
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          color: var(--secondary-text-color);
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 520px) {
          .header {
            padding: 12px 14px;
          }

          .boxes {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .box-value {
            font-size: 23px;
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

        <div class="arc-wrap">
          <svg id="arc" viewBox="0 0 360 310" role="img" aria-label="Heater temperature thresholds">
            <path class="arc-base" d="${this._path(180, 360)}"></path>
            <path id="blue" class="arc-blue" d="${this._path(180, onAngle)}"></path>
            <path id="red" class="arc-red" d="${this._path(offAngle, 360)}"></path>

            <text class="current-label" x="180" y="74">Current temperature</text>
            <text class="current-value" x="180" y="118">
              ${current}<tspan font-size="18" dx="3">${this._escape(model.unit)}</tspan>
            </text>
            <text class="heater-state" x="180" y="142">Heater: ${model.heaterOn ? "ON" : "OFF"}</text>

            <circle id="on" class="handle on" cx="${onPoint.x}" cy="${onPoint.y}" r="12"></circle>
            <circle id="off" class="handle off" cx="${offPoint.x}" cy="${offPoint.y}" r="12"></circle>

            <text class="threshold-label align-left on-text" x="68" y="282">ON at</text>
            <text id="onv" class="threshold-value align-left" x="68" y="306">${this._format(model.on, model.step)}${this._escape(model.unit)}</text>
            <text class="threshold-label align-right off-text" x="292" y="282">OFF at</text>
            <text id="offv" class="threshold-value align-right" x="292" y="306">${this._format(model.off, model.step)}${this._escape(model.unit)}</text>
          </svg>
        </div>

        ${
          this._config.show_threshold_boxes === false
            ? ""
            : `<div class="boxes">
                <div class="box on">
                  <h4>Heater ON</h4>
                  <div id="onbox" class="box-value">${this._format(model.on, model.step)}${this._escape(model.unit)}</div>
                  <div class="hint">Drag blue handle</div>
                </div>
                <div class="box off">
                  <h4>Heater OFF</h4>
                  <div id="offbox" class="box-value">${this._format(model.off, model.step)}${this._escape(model.unit)}</div>
                  <div class="hint">Drag red handle</div>
                </div>
              </div>`
        }

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

    this._bind();
  }

  _bind() {
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

  _round(value, model) {
    return Number(
      (
        model.min +
        Math.round((value - model.min) / model.step) * model.step
      ).toFixed(4),
    );
  }

  _move(event) {
    if (!this._drag || event.pointerId !== this._drag.pointer) return;

    const drag = this._drag;
    const model = drag.model;
    const svg = this.shadowRoot.querySelector("#arc");
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * 360) / rect.width;
    const y = ((event.clientY - rect.top) * 310) / rect.height;

    let angle = (Math.atan2(y - 245, x - 180) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    if (angle < 180) angle = x < 180 ? 180 : 360;
    angle = Math.max(180, Math.min(360, angle));

    let value = this._round(
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
      ["onv", drag.on],
      ["onbox", drag.on],
      ["offv", drag.off],
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
    const entityId =
      drag.type === "on" ? drag.model.onId : drag.model.offId;
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
