import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { renderRulesOptions } from "../../../client/utilities/RenderRulesOptions";
import { renderUnitTypeOptions } from "../../../client/utilities/RenderUnitTypeOptions";
import { translateText } from "../../../client/Utils";
import { UnitType } from "../../../core/game/Game";

type Rules = {
  disableNPCs: boolean;
  instantBuild: boolean;
  infiniteGold: boolean;
  infiniteTroops: boolean;
  compactMap: boolean;
};

@customElement("of-advanced-options")
export class AdvancedOptions extends LitElement {
  @property({ type: Object }) rules!: Rules;
  @property({ type: Array }) disabledUnits: UnitType[] = [];

  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <details class="rounded-xl border border-white/15 ">
        <summary
          class="cursor-pointer px-3 py-3 font-semibold hover:bg-white/5 transition-colors text-zinc-100"
        >
          ${translateText("single_modal.advanced_options")}
        </summary>
        <div class="border-t border-white/15 p-3 flex flex-col min-h-0">
          <div class="mb-2 text-center text-sm font-semibold text-zinc-200">
            ${translateText("single_modal.rules")}
          </div>
          <div
            class="grid grid-cols-2 gap-2 max-h-72 sm:max-h-80 overflow-auto pr-1 [scrollbar-gutter:stable]"
          >
            ${renderRulesOptions({
              values: this.rules,
              toggleRule: (key: string, checked: boolean) =>
                this.dispatchEvent(
                  new CustomEvent("toggle-rule", {
                    detail: { key, checked },
                    bubbles: true,
                    composed: true,
                  }),
                ),
            })}
          </div>

          <div class="my-2 h-px bg-white/15"></div>

          <div class="mb-2 text-center text-sm font-semibold text-zinc-200">
            ${translateText("single_modal.units_and_buildings")}
          </div>
          <div
            class="grid grid-cols-2 gap-2 max-h-72 sm:max-h-80 overflow-auto pr-1 [scrollbar-gutter:stable]"
          >
            ${renderUnitTypeOptions({
              disabledUnits: this.disabledUnits,
              toggleUnit: (unit: UnitType, checked: boolean) =>
                this.dispatchEvent(
                  new CustomEvent("toggle-unit", {
                    detail: { unit, checked },
                    bubbles: true,
                    composed: true,
                  }),
                ),
            })}
          </div>
        </div>
      </details>
    `;
  }
}
