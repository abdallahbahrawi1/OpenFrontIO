import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
  mapCategories,
} from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import { TeamCountConfig } from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import "./components/Difficulties";
import "./components/Maps";
import { fetchCosmetics } from "./Cosmetics";
import { FlagInput } from "./FlagInput";
import { JoinLobbyEvent } from "./Main";
import { UsernameInput } from "./UsernameInput";
import { renderUnitTypeOptions } from "./utilities/RenderUnitTypeOptions";

@customElement("single-player-modal")
export class SinglePlayerModal extends LitElement {
  @state() private selectedMap: GameMapType = GameMapType.World;
  @state() private selectedDifficulty: Difficulty = Difficulty.Medium;
  @state() private disableNPCs: boolean = false;
  @state() private bots: number = 400;
  @state() private infiniteGold: boolean = false;
  @state() private infiniteTroops: boolean = false;
  @state() private compactMap: boolean = false;
  @state() private instantBuild: boolean = false;
  @state() private useRandomMap: boolean = false;
  @state() private gameMode: GameMode = GameMode.FFA;
  @state() private teamCount: TeamCountConfig = 2;

  @state() private mapSearchQuery: string = "";
  @state() private mapFilter: string = "all";

  @state() private disabledUnits: UnitType[] = [];

  private userSettings: UserSettings = new UserSettings();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private resetSettings() {
    this.selectedMap = GameMapType.World;
    this.selectedDifficulty = Difficulty.Medium;
    this.disableNPCs = false;
    this.bots = 400;
    this.infiniteGold = false;
    this.infiniteTroops = false;
    this.compactMap = false;
    this.instantBuild = false;
    this.useRandomMap = false;
    this.gameMode = GameMode.FFA;
    this.teamCount = 2;
    this.disabledUnits = [];
    this.mapSearchQuery = "";
    this.mapFilter = "all";
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-50"
        role="dialog"
        aria-labelledby="sp-title"
        aria-modal="true"
      >
        <!-- fancy background -->
        <div
          class="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_600px_at_60%_-10%,rgba(59,130,246,0.18),transparent),radial-gradient(900px_500px_at_15%_110%,rgba(59,130,246,0.10),transparent)]"
        ></div>

        <!-- modal surface -->
        <section
          class="fixed inset-4 mx-auto flex max-w-[1200px] min-h-[560px] flex-col rounded-2xl border border-white/15 bg-zinc-900/80 backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.45)] md:inset-8"
        >
          <!-- header -->
          <header
            class="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-gradient-to-b from-zinc-900/95 to-zinc-900/70 px-4 py-3 backdrop-blur"
          >
            <h1
              id="sp-title"
              class="m-0 text-[18px] font-bold tracking-tight text-zinc-100"
            >
              ${translateText("single_modal.title")}
            </h1>
            <div class="flex gap-2">
              <button
                id="quickStartHeader"
                class="h-11 min-w-11 rounded-xl border border-blue-400/40 bg-blue-500/15 px-3 text-blue-50 hover:bg-blue-500/20"
                title="Quick Start (Enter)"
                @click=${this.startGame}
              >
                ▶ ${translateText("single_modal.quick_start")}
              </button>
              <button
                id="closeModal"
                aria-label="Close"
                class="h-11 min-w-11 rounded-xl border border-white/15 bg-white/5 px-3 hover:bg-white/10 hover:border-white/20 text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 transition-colors"
                @click=${this.close}
              >
                ✕
              </button>
            </div>
          </header>

          <!-- body (desktop grid) -->
          <main
            class="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-[1.2fr_1fr]"
          >
            <!-- Maps pane (desktop) -->
            <aside
              aria-label="Map Browser"
              class="min-h-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-900/40 flex"
            >
              <div class="flex flex-col gap-2 border-b border-white/10 p-3">
                <div class="w-full">
                  <input
                    id="mapSearch"
                    type="search"
                    placeholder="${translateText("common.search")}"
                    aria-label="Search maps"
                    class="h-11 w-full rounded-xl border border-white/15 bg-zinc-900/60 px-3 text-zinc-100 placeholder:text-zinc-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 transition-colors"
                    .value=${this.mapSearchQuery}
                    @input=${(e: InputEvent) =>
                      (this.mapSearchQuery = (
                        e.target as HTMLInputElement
                      ).value)}
                  />
                </div>

                <div class="flex flex-wrap gap-2">
                  ${["all", "continental", "regional", "fantasy"].map(
                    (f) => html`
                      <button
                        class=${`h-9 cursor-pointer rounded-full border px-3 transition-colors ${
                          this.mapFilter === f
                            ? "border-blue-400/50 bg-blue-500/25 text-blue-50"
                            : "border-white/15 bg-white/5 text-zinc-100 hover:border-white/25"
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60`}
                        aria-pressed=${this.mapFilter === f}
                        @click=${() => (this.mapFilter = f)}
                      >
                        ${f === "all"
                          ? translateText("common.all")
                          : translateText(`map_categories.${f}`)}
                      </button>
                    `,
                  )}
                  <button
                    id="randomMap"
                    class="h-9 rounded-full border border-white/15 bg-white/5 px-3 hover:bg-white/10 hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                    title=${translateText("map.random")}
                    @click=${this.handleRandomMapToggle}
                  >
                    🎲 ${translateText("map.random")}
                  </button>
                </div>
              </div>

              <div
                id="mapGrid"
                role="listbox"
                aria-label="Maps"
                class="grid flex-1 grid-cols-1 gap-4 overflow-auto p-3"
              >
                ${this.mapFilter === "all"
                  ? html`
                      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        ${Object.entries(mapCategories).flatMap(
                          ([_, categoryMaps]) =>
                            Object.values(categoryMaps).map(
                              (mapValue: GameMapType) => {
                                const mapKey = Object.keys(GameMapType).find(
                                  (key) =>
                                    GameMapType[
                                      key as keyof typeof GameMapType
                                    ] === mapValue,
                                );
                                const selected =
                                  !this.useRandomMap &&
                                  this.selectedMap === mapValue;

                                return html`
                                  <div
                                    @click=${() =>
                                      this.handleMapSelection(mapValue)}
                                    class="w-full h-full cursor-pointer"
                                  >
                                    <map-display
                                      .mapKey=${mapKey}
                                      .selected=${selected}
                                      .translation=${translateText(
                                        `map.${mapKey?.toLowerCase()}`,
                                      )}
                                    ></map-display>
                                  </div>
                                `;
                              },
                            ),
                        )}
                      </div>
                    `
                  : html`
                      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        ${Object.entries(mapCategories)
                          .filter(
                            ([categoryKey]) => categoryKey === this.mapFilter,
                          )
                          .flatMap(([_, categoryMaps]) =>
                            Object.values(categoryMaps).map(
                              (mapValue: GameMapType) => {
                                const mapKey = Object.keys(GameMapType).find(
                                  (key) =>
                                    GameMapType[
                                      key as keyof typeof GameMapType
                                    ] === mapValue,
                                );
                                const selected =
                                  !this.useRandomMap &&
                                  this.selectedMap === mapValue;

                                return html`
                                  <div
                                    @click=${() =>
                                      this.handleMapSelection(mapValue)}
                                    class="w-full h-full cursor-pointer"
                                  >
                                    <map-display
                                      .mapKey=${mapKey}
                                      .selected=${selected}
                                      .translation=${translateText(
                                        `map.${mapKey?.toLowerCase()}`,
                                      )}
                                    ></map-display>
                                  </div>
                                `;
                              },
                            ),
                          )}
                      </div>
                    `}
              </div>
            </aside>

            <!-- Settings pane (desktop) -->
            <section
              aria-label="Settings"
              class="min-h-80 flex-col gap-3 rounded-xl border border-white/15 bg-zinc-900/40 p-3 flex"
            >
              <section
                class="rounded-xl border border-white/15 bg-white/5 p-4 md:p-5 text-zinc-100"
              >
                <dl class="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                  <div class="space-y-1">
                    <dt class="text-xs text-zinc-300">
                      ${translateText("map.map")}
                    </dt>
                    <dd class="font-semibold">
                      ${this.useRandomMap
                        ? translateText("map.random")
                        : translateText(
                            `map.${(
                              Object.keys(GameMapType).find(
                                (k) =>
                                  GameMapType[k as keyof typeof GameMapType] ===
                                  this.selectedMap,
                              ) ?? ""
                            ).toLowerCase()}`,
                          )}
                    </dd>
                  </div>

                  <div class="space-y-1">
                    <dt class="text-xs text-zinc-300">
                      ${translateText("difficulty.difficulty")}
                    </dt>
                    <dd class="font-semibold">
                      ${translateText(
                        `difficulty.${
                          Object.keys(Difficulty).find(
                            (k) =>
                              Difficulty[k as keyof typeof Difficulty] ===
                              this.selectedDifficulty,
                          ) ?? "unknown"
                        }`,
                      )}
                    </dd>
                  </div>

                  <div class="space-y-1">
                    <dt class="text-xs text-zinc-300">
                      ${translateText("host_modal.mode")}
                    </dt>
                    <dd class="font-semibold">
                      ${this.gameMode === GameMode.FFA
                        ? translateText("game_mode.ffa")
                        : translateText("game_mode.teams")}
                    </dd>
                  </div>

                  <div class="space-y-1">
                    <dt class="text-xs text-zinc-300">
                      ${translateText("single_modal.bots")}
                    </dt>
                    <dd class="font-semibold">${this.bots}</dd>
                  </div>
                </dl>
              </section>

              <!-- difficulty -->
              <div>
                <label class="mb-1 ml-0.5 block text-xs text-zinc-400">
                  ${translateText("difficulty.difficulty")}
                </label>
                <div class="flex flex-wrap gap-2">
                  ${Object.entries(Difficulty)
                    .filter(([key]) => isNaN(Number(key)))
                    .map(
                      ([key, value]) => html`
                        <button
                          class=${`min-w-11 rounded-full border px-3 py-2 transition-colors ${
                            this.selectedDifficulty === value
                              ? "border-blue-400/60 bg-blue-500/25 text-blue-50"
                              : "border-white/15 bg-white/5 hover:border-white/25"
                          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60`}
                          @click=${() => this.handleDifficultySelection(value)}
                        >
                          ${translateText(`difficulty.${key}`)}
                        </button>
                      `,
                    )}
                </div>
              </div>

              <!-- mode -->
              <div>
                <label class="mb-1 ml-0.5 block text-xs text-zinc-400">
                  ${translateText("host_modal.mode")}
                </label>
                <div
                  class="inline-flex overflow-hidden rounded-xl border border-white/15"
                >
                  ${[GameMode.FFA, GameMode.Team].map(
                    (mode) => html`
                      <button
                        class=${`h-10 px-4 transition-colors ${
                          this.gameMode === mode
                            ? "bg-blue-500/25 text-blue-50"
                            : "bg-transparent hover:bg-white/5"
                        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60`}
                        @click=${() => this.handleGameModeSelection(mode)}
                      >
                        ${mode === GameMode.FFA
                          ? translateText("game_mode.ffa")
                          : translateText("game_mode.teams")}
                      </button>
                    `,
                  )}
                </div>
              </div>

              <!-- bots -->
              <div>
                <label
                  for="botsRange"
                  class="mb-1 ml-0.5 block text-xs text-zinc-400"
                >
                  ${translateText("single_modal.bots")}:
                  <span class="font-semibold text-zinc-200">${this.bots}</span>
                </label>
                <input
                  id="botsRange"
                  type="range"
                  min="0"
                  max="400"
                  step="1"
                  .value="${String(this.bots)}"
                  @input=${this.handleBotsChange}
                  class="w-full accent-blue-400"
                />
              </div>

              <!-- advanced options -->
              <details
                class="overflow-hidden rounded-xl border border-white/15"
              >
                <summary
                  class="cursor-pointer px-3 py-3 font-semibold hover:bg-white/5 transition-colors"
                >
                  ${translateText("single_modal.advanced_options")}
                </summary>
                <div class="border-t border-white/15 p-3">
                  <div class="grid grid-cols-2 gap-2">
                    <label
                      class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-2 hover:bg-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        .checked=${this.disableNPCs}
                        @change=${this.handleDisableNPCsChange}
                        class="h-4 w-4"
                      />
                      <span
                        >${translateText("single_modal.disable_nations")}</span
                      >
                    </label>

                    <label
                      class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-2 hover:bg-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        .checked=${this.instantBuild}
                        @change=${this.handleInstantBuildChange}
                        class="h-4 w-4"
                      />
                      <span
                        >${translateText("single_modal.instant_build")}</span
                      >
                    </label>

                    <label
                      class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-2 hover:bg-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        .checked=${this.infiniteGold}
                        @change=${this.handleInfiniteGoldChange}
                        class="h-4 w-4"
                      />
                      <span
                        >${translateText("single_modal.infinite_gold")}</span
                      >
                    </label>

                    <label
                      class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-2 hover:bg-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        .checked=${this.infiniteTroops}
                        @change=${this.handleInfiniteTroopsChange}
                        class="h-4 w-4"
                      />
                      <span
                        >${translateText("single_modal.infinite_troops")}</span
                      >
                    </label>

                    <label
                      class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-2 hover:bg-white/5 transition-colors"
                    >
                      <input
                        type="checkbox"
                        .checked=${this.compactMap}
                        @change=${this.handleCompactMapChange}
                        class="h-4 w-4"
                      />
                      <span>${translateText("single_modal.compact_map")}</span>
                    </label>
                  </div>

                  <div class="my-2 h-px bg-white/15"></div>

                  <div>
                    <div class="mb-2 text-center text-xs text-zinc-400">
                      ${translateText("single_modal.enables_title")}
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      ${renderUnitTypeOptions({
                        disabledUnits: this.disabledUnits,
                        toggleUnit: this.toggleUnit.bind(this),
                      })}
                    </div>
                  </div>
                </div>
              </details>
            </section>
          </main>

          <!-- footer -->
          <footer
            class="sticky bottom-0 flex items-center justify-between border-t border-white/15 bg-gradient-to-t from-zinc-900/95 to-zinc-900/70 px-4 py-3 backdrop-blur"
          >
            <div class="flex items-center gap-2">
              <label for="presetSelect" class="text-xs text-zinc-400">
                ${translateText("single_modal.presets")}
              </label>
              <select
                id="presetSelect"
                class="h-11 rounded-xl border border-white/15 bg-zinc-900/60 px-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 transition-colors"
                .value=${String(this.selectedDifficulty)}
                @change=${(e: Event) =>
                  this.handleDifficultySelection(
                    Number(
                      (e.target as HTMLSelectElement).value,
                    ) as unknown as Difficulty,
                  )}
              >
                ${Object.entries(Difficulty)
                  .filter(([key]) => isNaN(Number(key)))
                  .map(
                    ([key, value]) => html`
                      <option value=${value}>
                        ${translateText(`difficulty.${key}`)}
                      </option>
                    `,
                  )}
              </select>
              <button
                id="resetBtn"
                class="h-11 rounded-xl border border-white/15 bg-transparent px-3 hover:bg-white/5 hover:border-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                @click=${this.resetSettings}
              >
                ${translateText("single_modal.reset")}
              </button>
            </div>
            <div>
              <button
                id="startGame"
                class="h-11 rounded-xl bg-blue-500 px-4 font-bold text-white hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition-colors"
                @click=${this.startGame}
              >
                ${translateText("single_modal.start")}
              </button>
            </div>
          </footer>
        </section>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // light DOM
  }

  public open() {
    this.style.display = "block";
    window.addEventListener("keydown", this.handleKeyDown);
  }

  public close() {
    this.style.display = "none";
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleRandomMapToggle() {
    this.useRandomMap = true;
  }

  private handleMapSelection(value: GameMapType) {
    this.selectedMap = value;
    this.useRandomMap = false;
  }

  private handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
  }

  private handleBotsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(value) || value < 0 || value > 400) {
      return;
    }
    this.bots = value;
  }

  private handleInstantBuildChange(e: Event) {
    this.instantBuild = Boolean((e.target as HTMLInputElement).checked);
  }

  private handleInfiniteGoldChange(e: Event) {
    this.infiniteGold = Boolean((e.target as HTMLInputElement).checked);
  }

  private handleInfiniteTroopsChange(e: Event) {
    this.infiniteTroops = Boolean((e.target as HTMLInputElement).checked);
  }

  private handleCompactMapChange(e: Event) {
    this.compactMap = Boolean((e.target as HTMLInputElement).checked);
  }

  private handleDisableNPCsChange(e: Event) {
    this.disableNPCs = Boolean((e.target as HTMLInputElement).checked);
  }

  private handleGameModeSelection(value: GameMode) {
    this.gameMode = value;
  }

  private handleTeamCountSelection(value: TeamCountConfig) {
    this.teamCount = value;
  }

  private getRandomMap(): GameMapType {
    const maps = Object.values(GameMapType);
    const randIdx = Math.floor(Math.random() * maps.length);
    return maps[randIdx] as GameMapType;
  }

  private toggleUnit(unit: UnitType, checked: boolean): void {
    console.log(`Toggling unit type: ${unit} to ${checked}`);
    this.disabledUnits = checked
      ? [...this.disabledUnits, unit]
      : this.disabledUnits.filter((u) => u !== unit);
  }

  private async startGame() {
    // If random map is selected, choose a random map now
    if (this.useRandomMap) {
      this.selectedMap = this.getRandomMap();
    }

    console.log(
      `Starting single player game with map: ${GameMapType[this.selectedMap as keyof typeof GameMapType]}${this.useRandomMap ? " (Randomly selected)" : ""}`,
    );
    const clientID = generateID();
    const gameID = generateID();

    const usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput;
    if (!usernameInput) {
      console.warn("Username input element not found");
    }

    const flagInput = document.querySelector("flag-input") as FlagInput;
    if (!flagInput) {
      console.warn("Flag input element not found");
    }
    const cosmetics = await fetchCosmetics();
    let selectedPattern = this.userSettings.getSelectedPatternName(cosmetics);
    selectedPattern ??= cosmetics
      ? (this.userSettings.getDevOnlyPattern() ?? null)
      : null;

    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          clientID: clientID,
          gameID: gameID,
          gameStartInfo: {
            gameID: gameID,
            players: [
              {
                clientID,
                username: usernameInput.getCurrentUsername(),
                cosmetics: {
                  flag:
                    flagInput.getCurrentFlag() === "xx"
                      ? ""
                      : flagInput.getCurrentFlag(),
                  pattern: selectedPattern ?? undefined,
                },
              },
            ],
            config: {
              gameMap: this.selectedMap,
              gameMapSize: this.compactMap
                ? GameMapSize.Compact
                : GameMapSize.Normal,
              gameType: GameType.Singleplayer,
              gameMode: this.gameMode,
              playerTeams: this.teamCount,
              difficulty: this.selectedDifficulty,
              disableNPCs: this.disableNPCs,
              bots: this.bots,
              infiniteGold: this.infiniteGold,
              donateGold: true,
              donateTroops: true,
              infiniteTroops: this.infiniteTroops,
              instantBuild: this.instantBuild,
              disabledUnits: this.disabledUnits
                .map((u) => Object.values(UnitType).find((ut) => ut === u))
                .filter((ut): ut is UnitType => ut !== undefined),
            },
          },
        } satisfies JoinLobbyEvent,
        bubbles: true,
        composed: true,
      }),
    );
    this.close();
  }
}
