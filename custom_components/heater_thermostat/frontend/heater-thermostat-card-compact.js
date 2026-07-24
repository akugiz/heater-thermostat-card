import "/heater_thermostat/heater-thermostat-card.js?v=0.2.4";

const CARD_TAG = "heater-thermostat-card";
const PATCH_ID = "heater-thermostat-compact-layout";

function applyCompactLayout(card) {
  const root = card.shadowRoot;
  if (!root) return;

  const haCard = root.querySelector("ha-card");
  const header = root.querySelector(".header");
  const power = root.querySelector("#power");
  const currentBlock = root.querySelector(".current-block");
  const currentLabel = root.querySelector(".current-label");

  if (!haCard || !currentBlock || !currentLabel) return;

  const title =
    header?.querySelector(".title")?.textContent?.trim() ||
    card._model?.()?.title ||
    "Heater Thermostat";

  currentLabel.textContent = title;

  if (power && power.parentElement !== haCard) {
    haCard.insertBefore(power, currentBlock);
  }
  header?.remove();

  if (!root.querySelector(`#${PATCH_ID}`)) {
    const style = document.createElement("style");
    style.id = PATCH_ID;
    style.textContent = `
      ha-card {
        position: relative;
      }

      .power {
        position: absolute !important;
        top: 12px;
        left: 12px;
        z-index: 2;
        width: 42px;
        height: 42px;
        flex: none !important;
      }

      .current-block {
        min-height: 70px;
        padding: 13px 58px 0 !important;
      }

      .current-label {
        overflow: hidden;
        color: var(--primary-text-color) !important;
        font-size: 17px !important;
        font-weight: 700;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 420px) {
        .current-block {
          padding: 12px 56px 0 !important;
        }
      }
    `;
    root.appendChild(style);
  }
}

customElements.whenDefined(CARD_TAG).then(() => {
  const CardClass = customElements.get(CARD_TAG);
  if (!CardClass || CardClass.prototype.__compactLayoutPatched) return;

  const originalRender = CardClass.prototype.render;
  CardClass.prototype.render = function (...args) {
    const result = originalRender.apply(this, args);
    applyCompactLayout(this);
    return result;
  };
  CardClass.prototype.__compactLayoutPatched = true;
});
