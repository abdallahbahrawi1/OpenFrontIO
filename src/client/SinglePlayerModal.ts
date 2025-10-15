import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
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
import "./components/shared/DifficultyPicker";
import "./components/shared/GameModePicker";
import "./components/shared/MapGrid";
import { fetchCosmetics } from "./Cosmetics";
import { FlagInput } from "./FlagInput";
import { JoinLobbyEvent } from "./Main";
import { UsernameInput } from "./UsernameInput";
import { renderRulesOptions } from "./utilities/RenderRulesOptions";
import { renderUnitTypeOptions } from "./utilities/RenderUnitTypeOptions";

type PresetSettings = {
  selectedMap: GameMapType;
  selectedDifficulty: Difficulty;
  disableNPCs: boolean;
  bots: number;
  infiniteGold: boolean;
  infiniteTroops: boolean;
  compactMap: boolean;
  instantBuild: boolean;
  useRandomMap: boolean;
  gameMode: GameMode;
  teamCount: TeamCountConfig;
  disabledUnits: UnitType[];
};

type SinglePlayerPreset = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: PresetSettings;
};

@customElement("single-player-modal")
export class SinglePlayerModal extends LitElement {
  @property({ type: Array }) presets: SinglePlayerPreset[] = [];
  @property({ type: String }) selectedPresetId: string | null = null;
  @property({ type: String }) presetNameInput: string = "";
  @property({ type: String }) presetError: string = "";

  private static readonly MAX_PRESETS = 10;
  private static readonly PRESETS_KEY = "sp.presets.v1";

  @property({ type: Number }) selectedMap: GameMapType = GameMapType.World;
  @property({ type: Number }) selectedDifficulty: Difficulty =
    Difficulty.Medium;
  @property({ type: Boolean }) disableNPCs = false;
  @property({ type: Number }) bots = 400;
  @property({ type: Boolean }) infiniteGold = false;
  @property({ type: Boolean }) infiniteTroops = false;
  @property({ type: Boolean }) compactMap = false;
  @property({ type: Boolean }) instantBuild = false;
  @property({ type: Boolean }) useRandomMap = false;
  @property({ type: Number }) gameMode: GameMode = GameMode.FFA;
  @property({ type: Number }) teamCount: TeamCountConfig = 2;

  @state() private mapSearchQuery: string = "";
  @state() private mapFilter: string = "all";

  @state() private disabledUnits: UnitType[] = [];

  private userSettings: UserSettings = new UserSettings();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
    this.loadPresetsFromStorage();
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

  private get selectedDifficultyKey(): string {
    return (
      Object.keys(Difficulty).find(
        (k) =>
          Difficulty[k as keyof typeof Difficulty] === this.selectedDifficulty,
      ) ?? ""
    );
  }

  private handleBotsChange = (e: Event) => {
    const value = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.bots = Math.min(400, Math.max(0, value));
    }
  };

  private loadPresetsFromStorage() {
    try {
      const raw = localStorage.getItem(SinglePlayerModal.PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const arr = parsed as SinglePlayerPreset[];
        // keep the most recently updated 10
        this.presets = arr
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, SinglePlayerModal.MAX_PRESETS);
        // persist trimmed list if we had more than 10
        if (arr.length !== this.presets.length) this.persistPresetsToStorage();
      }
    } catch (e) {
      console.warn("Failed to load presets:", e);
    }
  }

  private persistPresetsToStorage() {
    try {
      localStorage.setItem(
        SinglePlayerModal.PRESETS_KEY,
        JSON.stringify(this.presets),
      );
    } catch (e) {
      console.warn("Failed to save presets:", e);
    }
  }

  private currentSettings(): SinglePlayerPreset["settings"] {
    return {
      selectedMap: this.selectedMap,
      selectedDifficulty: this.selectedDifficulty,
      disableNPCs: this.disableNPCs,
      bots: this.bots,
      infiniteGold: this.infiniteGold,
      infiniteTroops: this.infiniteTroops,
      compactMap: this.compactMap,
      instantBuild: this.instantBuild,
      useRandomMap: this.useRandomMap,
      gameMode: this.gameMode,
      teamCount: this.teamCount,
      disabledUnits: [...this.disabledUnits],
    };
  }

  private applySettings(s: SinglePlayerPreset["settings"]) {
    this.selectedMap = s.selectedMap;
    this.selectedDifficulty = s.selectedDifficulty;
    this.disableNPCs = s.disableNPCs;
    this.bots = s.bots;
    this.infiniteGold = s.infiniteGold;
    this.infiniteTroops = s.infiniteTroops;
    this.compactMap = s.compactMap;
    this.instantBuild = s.instantBuild;
    this.useRandomMap = s.useRandomMap;
    this.gameMode = s.gameMode;
    this.teamCount = s.teamCount;
    this.disabledUnits = [...s.disabledUnits];
  }

  private deleteSelectedPreset = () => {
    if (!this.selectedPresetId) return;
    this.presets = this.presets.filter((p) => p.id !== this.selectedPresetId);
    this.selectedPresetId = null;
    this.presetNameInput = "";
    this.persistPresetsToStorage();
  };

  private handlePresetSelectChange = (e: Event) => {
    const id = (e.target as HTMLSelectElement).value || null;
    this.selectedPresetId = id;
    const preset = this.presets.find((p) => p.id === id);
    if (preset) {
      this.applySettings(preset.settings);
      this.presetNameInput = preset.name;
    }
  };

  private saveNewPreset = () => {
    const name = this.presetNameInput.trim();
    if (!name) {
      this.presetError = "Please enter a preset name.";
      return;
    }
    if (this.presets.length >= SinglePlayerModal.MAX_PRESETS) {
      this.presetError = `You can only save up to ${SinglePlayerModal.MAX_PRESETS} presets. Delete one to add another.`;
      return;
    }
    this.presetError = "";

    const now = Date.now();
    const preset: SinglePlayerPreset = {
      id: generateID(),
      name,
      createdAt: now,
      updatedAt: now,
      settings: this.currentSettings(),
    };
    this.presets = [...this.presets, preset];
    this.selectedPresetId = preset.id;
    this.persistPresetsToStorage();
  };

  private updateSelectedPreset = () => {
    if (!this.selectedPresetId) return;
    const i = this.presets.findIndex((p) => p.id === this.selectedPresetId);
    if (i < 0) return;

    const name = this.presetNameInput.trim() || this.presets[i].name;
    const updated: SinglePlayerPreset = {
      ...this.presets[i],
      name,
      updatedAt: Date.now(),
      settings: this.currentSettings(),
    };
    this.presets = [
      ...this.presets.slice(0, i),
      updated,
      ...this.presets.slice(i + 1),
    ];
    this.persistPresetsToStorage();
  };

  private norm(s: string) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private getFilteredMaps(): Array<{
    value: GameMapType;
    key: keyof typeof GameMapType;
    category: string;
    name: string;
  }> {
    const q = this.norm(this.mapSearchQuery.trim());
    const selectedFilter = this.mapFilter; // "all" | "continental" | ...

    const items: Array<{
      value: GameMapType;
      key: keyof typeof GameMapType;
      category: string;
      name: string;
    }> = [];

    for (const [category, categoryMaps] of Object.entries(mapCategories)) {
      for (const mapValue of Object.values(categoryMaps) as GameMapType[]) {
        const key = Object.keys(GameMapType).find(
          (k) => GameMapType[k as keyof typeof GameMapType] === mapValue,
        ) as keyof typeof GameMapType;

        const name = translateText(`map.${String(key).toLowerCase()}`);
        items.push({ value: mapValue, key, category, name });
      }
    }

    let filtered = items;
    if (selectedFilter !== "all") {
      filtered = filtered.filter((m) => m.category === selectedFilter);
    }
    if (q) {
      filtered = filtered.filter(
        (m) =>
          this.norm(m.name).includes(q) || this.norm(String(m.key)).includes(q),
      );
    }
    return filtered;
  }

  private renderSliderStyles() {
    return html`<style>
      input[type="range"] {
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        background: transparent;
        height: 28px;
        cursor: pointer;
        --val: 0%;
        --accent: #60a5fa;
        --track: #3f3f46;
        --track-h: 8px;
        --thumb: 16px;
      }
      input[type="range"]::-webkit-slider-runnable-track {
        height: var(--track-h);
        border-radius: 9999px;
        background: linear-gradient(
          to right,
          var(--accent) 0%,
          var(--accent) var(--val),
          var(--track) var(--val),
          var(--track) 100%
        );
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: var(--thumb);
        height: var(--thumb);
        margin-top: calc((var(--track-h) - var(--thumb)) / 2);
        border-radius: 9999px;
        background: var(--accent);
        border: 2px solid #ffffff55;
      }
      input[type="range"]::-moz-range-track {
        height: var(--track-h);
        border-radius: 9999px;
        background: var(--track);
      }
      input[type="range"]::-moz-range-progress {
        height: var(--track-h);
        border-radius: 9999px 0 0 9999px;
        background: var(--accent);
      }
      input[type="range"]::-moz-range-thumb {
        width: var(--thumb);
        height: var(--thumb);
        border-radius: 9999px;
        background: var(--accent);
        border: 2px solid #ffffff55;
      }
    </style>`;
  }

  private renderHeader() {
    return html`
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
    `;
  }

  private renderMapFilters() {
    return html`
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
              (this.mapSearchQuery = (e.target as HTMLInputElement).value)}
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
            class=${`h-9 rounded-full border px-3 flex items-center gap-1.5 transition-all duration-200 
              ${
                this.useRandomMap
                  ? "border-blue-400/60 bg-gradient-to-r from-blue-500/30 to-blue-600/30 text-blue-50 font-medium shadow-[0_0_8px_rgba(59,130,246,0.35)]"
                  : "border-white/15 bg-white/5 text-zinc-200 hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-blue-600/15 hover:border-blue-400/30"
              }
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60`}
            title=${translateText("map.random")}
            aria-pressed=${this.useRandomMap}
            @click=${this.handleRandomMapToggle}
          >
            <span
              class=${`inline-block transition-transform duration-200 ${this.useRandomMap ? "rotate-[15deg]" : ""}`}
              >🎲</span
            >
            <span>${translateText("map.random")}</span>
            ${this.useRandomMap
              ? html`<span
                  class="ml-1 inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-400/30 text-xs font-bold"
                  >✓</span
                >`
              : ""}
          </button>
        </div>
      </div>
    `;
  }

  private renderMapGrid() {
    const maps = this.getFilteredMaps(); // already respects search + filter
    return html`
      <div
        id="mapGrid"
        role="listbox"
        aria-label="Maps"
        class="grid flex-1 grid-cols-1 gap-4 overflow-auto p-3"
      >
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${maps.length
            ? maps.map(({ value, key, name }) => {
                const selected =
                  !this.useRandomMap && this.selectedMap === value;
                return html`
                  <div
                    @click=${() => this.handleMapSelection(value)}
                    class="w-full h-full cursor-pointer"
                  >
                    <map-display
                      .mapKey=${key}
                      .selected=${selected}
                      .translation=${name}
                    ></map-display>
                  </div>
                `;
              })
            : html`<div class="col-span-full text-sm text-zinc-400">
                ${translateText("common.no_results") ?? "No maps found."}
              </div>`}
        </div>
      </div>
    `;
  }

  private renderMapsPane() {
    return html`
      <aside
        aria-label="Map Browser"
        class="min-h-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-900/40 flex"
      >
        ${this.renderMapFilters()} ${this.renderMapGrid()}
      </aside>
    `;
  }

  private renderSettingsSummary() {
    const mapKey =
      Object.keys(GameMapType).find(
        (k) => GameMapType[k as keyof typeof GameMapType] === this.selectedMap,
      ) ?? "";
    const difficultyKey =
      Object.keys(Difficulty).find(
        (k) =>
          Difficulty[k as keyof typeof Difficulty] === this.selectedDifficulty,
      ) ?? "unknown";

    return html`
      <section
        class="rounded-xl border border-white/15 bg-white/5 p-4 md:p-5 text-zinc-100"
      >
        <dl class="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <div class="space-y-1">
            <dt class="text-xs text-zinc-300">${translateText("map.map")}</dt>
            <dd class="font-semibold">
              ${this.useRandomMap
                ? translateText("map.random")
                : translateText(`map.${mapKey.toLowerCase()}`)}
            </dd>
          </div>
          <div class="space-y-1">
            <dt class="text-xs text-zinc-300">
              ${translateText("difficulty.difficulty")}
            </dt>
            <dd class="font-semibold">
              ${translateText(`difficulty.${difficultyKey}`)}
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
    `;
  }

  private renderDifficultyControls() {
    return html`
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="ml-0.5 block text-xs text-zinc-400"
            >${translateText("difficulty.difficulty")}</label
          >
          <div class="h-10">
            <difficulty-display
              .difficultyKey=${this.selectedDifficultyKey}
            ></difficulty-display>
          </div>
        </div>
        <of-difficulty-picker
          .value=${this.selectedDifficulty}
          @change=${(e: CustomEvent<{ value: Difficulty }>) =>
            this.handleDifficultySelection(e.detail.value)}
        ></of-difficulty-picker>
      </div>
    `;
  }

  private renderModeControls() {
    return html`
      <div>
        <label class="mb-1 ml-0.5 block text-xs text-zinc-400"
          >${translateText("host_modal.mode")}</label
        >
        <of-game-mode-picker
          .value=${this.gameMode}
          @change=${(e: CustomEvent<{ value: GameMode }>) =>
            this.handleGameModeSelection(e.detail.value)}
        ></of-game-mode-picker>
      </div>
    `;
  }

  private renderBotsSlider() {
    return html`
      <div>
        <label for="botsRange" class="mb-1 ml-0.5 block text-xs text-zinc-400">
          ${translateText("single_modal.bots")}:
          <span class="font-semibold text-zinc-200">${this.bots}</span>
        </label>
        <input
          id="botsRange"
          type="range"
          min="0"
          max="400"
          step="1"
          .value=${String(this.bots)}
          @input=${this.handleBotsChange}
          class="w-full"
          style=${`--val:${(this.bots / 400) * 100}%`}
          aria-valuemin="0"
          aria-valuemax="400"
          aria-valuenow=${String(this.bots)}
        />
      </div>
    `;
  }

  private renderAdvancedOptions() {
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
              values: {
                disableNPCs: this.disableNPCs,
                instantBuild: this.instantBuild,
                infiniteGold: this.infiniteGold,
                infiniteTroops: this.infiniteTroops,
                compactMap: this.compactMap,
              },
              toggleRule: (key: string, checked: boolean) => {
                (this as any)[key] = checked; // keep existing logic, avoid TS index error
              },
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
              toggleUnit: this.toggleUnit.bind(this),
            })}
          </div>
        </div>
      </details>
    `;
  }

  private renderSettingsPane() {
    return html`
      <section
        aria-label="Settings"
        class="min-h-0 flex flex-col gap-3 rounded-xl border border-white/15 bg-zinc-900/40 p-3 overflow-auto"
      >
        ${this.renderSettingsSummary()} ${this.renderDifficultyControls()}
        ${this.renderModeControls()} ${this.renderBotsSlider()}
        ${this.renderAdvancedOptions()}
      </section>
    `;
  }

  private renderFooter() {
    return html`
      <footer
        class="sticky bottom-0 flex items-center justify-between border-t border-white/15 bg-gradient-to-t from-zinc-900/95 to-zinc-900/70 px-3 py-2 backdrop-blur"
      >
        <div class="flex items-center gap-1.5 flex-wrap">
          <select
            class="h-9 rounded-lg border border-white/15 bg-zinc-900 px-2 text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 appearance-none"
            .value=${this.selectedPresetId ?? ""}
            @change=${this.handlePresetSelectChange}
            aria-label="Select preset"
            title="Select preset"
          >
            <option class="bg-zinc-900 text-zinc-100" value="">
              — Presets —
            </option>
            ${this.presets.map(
              (p) =>
                html`<option class="bg-zinc-900 text-zinc-100" value=${p.id}>
                  ${p.name}
                </option>`,
            )}
          </select>

          <span class="text-xs text-zinc-400 ml-1">
            (${this.presets.length}/${(
              this.constructor as typeof SinglePlayerModal
            ).MAX_PRESETS})
          </span>

          <input
            type="text"
            placeholder="Name"
            class="h-9 w-36 rounded-lg border border-white/15 bg-zinc-900 px-2 text-zinc-100 placeholder:text-zinc-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            .value=${this.presetNameInput}
            @input=${(e: InputEvent) => {
              this.presetNameInput = (e.target as HTMLInputElement).value;
              if (this.presetError && this.presetNameInput.trim())
                this.presetError = "";
            }}
            aria-label="Preset name"
          />

          <button
            class="h-9 w-9 grid place-items-center rounded-lg border border-blue-400/40 bg-blue-500/15 text-blue-50 hover:bg-blue-500/25 disabled:opacity-50"
            @click=${this.saveNewPreset}
            ?disabled=${!this.presetNameInput.trim() ||
            this.presets.length >=
              (this.constructor as typeof SinglePlayerModal).MAX_PRESETS}
            aria-label="Save new preset"
            title=${this.presets.length >=
            (this.constructor as typeof SinglePlayerModal).MAX_PRESETS
              ? `Limit reached (${this.presets.length}/${(this.constructor as typeof SinglePlayerModal).MAX_PRESETS}). Delete one to add another.`
              : "Save new preset"}
          >
            💾
          </button>

          <button
            class="h-9 w-9 grid place-items-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            @click=${this.updateSelectedPreset}
            ?disabled=${!this.selectedPresetId || !this.presetNameInput.trim()}
            aria-label="Update selected preset"
            title="Update selected preset"
          >
            ⟳
          </button>

          <button
            class="h-9 w-9 grid place-items-center rounded-lg border border-red-400/40 bg-red-500/15 text-red-50 hover:bg-red-500/25 disabled:opacity-50"
            @click=${this.deleteSelectedPreset}
            ?disabled=${!this.selectedPresetId}
            aria-label="Delete selected preset"
            title="Delete selected preset"
          >
            🗑️
          </button>

          ${this.presetError
            ? html`<span class="ml-1 text-xs text-red-400"
                >${this.presetError}</span
              >`
            : null}
        </div>

        <div>
          <button
            id="startGame"
            class="h-9 rounded-lg bg-blue-500 px-3 font-bold text-white hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            @click=${this.startGame}
          >
            ${translateText("single_modal.start")}
          </button>
        </div>
      </footer>
    `;
  }

  private renderBody() {
    return html`
      <main
        class="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-[1.2fr_1fr]"
      >
        ${this.renderMapsPane()} ${this.renderSettingsPane()}
      </main>
    `;
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-50"
        role="dialog"
        aria-labelledby="sp-title"
        aria-modal="true"
      >
        <div
          class="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_600px_at_60%_-10%,rgba(59,130,246,0.18),transparent),radial-gradient(900px_500px_at_15%_110%,rgba(59,130,246,0.10),transparent)]"
        ></div>

        <section
          class="fixed inset-4 mx-auto flex max-w-[1200px] min-h-[560px] flex-col rounded-2xl border border-white/15 bg-zinc-900/80 backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.45)] md:inset-8 text-zinc-100 antialiased"
        >
          ${this.renderHeader()} ${this.renderBody()} ${this.renderFooter()}
        </section>

        ${this.renderSliderStyles()}
      </div>
    `;
  }

  createRenderRoot() {
    return this;
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
    this.useRandomMap = !this.useRandomMap;
  }

  private handleMapSelection(value: GameMapType) {
    this.selectedMap = value;
    this.useRandomMap = false;
  }

  private handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
  }

  private handleGameModeSelection(value: GameMode) {
    this.gameMode = value;
  }

  private getRandomMap(): GameMapType {
    const maps = Object.values(GameMapType);
    const randIdx = Math.floor(Math.random() * maps.length);
    return maps[randIdx] as GameMapType;
  }

  private toggleUnit(unit: UnitType, checked: boolean): void {
    this.disabledUnits = checked
      ? this.disabledUnits.filter((u) => u !== unit)
      : this.disabledUnits.includes(unit)
        ? this.disabledUnits
        : [...this.disabledUnits, unit];
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
