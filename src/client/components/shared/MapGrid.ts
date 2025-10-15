import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { GameMapType } from "../../../core/game/Game";

type MapItem = {
  value: GameMapType;
  key: keyof typeof GameMapType;
  name: string;
};

@customElement("of-map-grid")
export class OfMapGrid extends LitElement {
  @property({ attribute: false }) items: MapItem[] = [];
  @property({ type: Number }) selectedMap: GameMapType = GameMapType.World;
  @property({ type: Boolean }) useRandomMap = false;

  createRenderRoot() {
    return this;
  }

  private select(value: GameMapType) {
    this.dispatchEvent(
      new CustomEvent("map-select", {
        detail: { value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      ${this.items.map(({ value, key, name }) => {
        const selected = !this.useRandomMap && this.selectedMap === value;
        return html`
          <div
            @click=${() => this.select(value)}
            class="w-full h-full cursor-pointer"
          >
            <map-display
              .mapKey=${key}
              .selected=${selected}
              .translation=${name}
            ></map-display>
          </div>
        `;
      })}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "of-map-grid": OfMapGrid;
  }
}
