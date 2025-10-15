import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Difficulty } from "../../../core/game/Game";
import { translateText } from "../../Utils";

@customElement("of-difficulty-picker")
export class OfDifficultyPicker extends LitElement {
  @property({ type: Number }) value: Difficulty = Difficulty.Medium;

  createRenderRoot() {
    return this;
  }

  private pick(v: Difficulty) {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: v },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="flex flex-wrap gap-2">
        ${Object.entries(Difficulty)
          .filter(([k]) => isNaN(Number(k)))
          .map(
            ([key, v]) => html`
              <button
                class=${`min-w-11 rounded-full border px-3 py-2 transition-colors ${
                  this.value === (v as unknown as Difficulty)
                    ? "border-blue-400/60 bg-blue-500/25 text-blue-50"
                    : "border-white/15 bg-white/5 hover:border-white/25"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60`}
                @click=${() => this.pick(v as unknown as Difficulty)}
              >
                ${translateText(`difficulty.${key}`)}
              </button>
            `,
          )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "of-difficulty-picker": OfDifficultyPicker;
  }
}
