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
} from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import { TeamCountConfig } from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/shared/AdvancedOptions";
import "./components/shared/BotsSlider";
import "./components/shared/DifficultyControls";
import "./components/shared/ExpandButton";
import "./components/shared/GameModeControls";
import "./components/shared/MapBrowserPane";
import "./components/shared/PresetsBar";
import "./components/shared/SettingsSummary";
import "./components/shared/TeamCountPicker";

import { fetchCosmetics } from "./Cosmetics";
import { FlagInput } from "./FlagInput";
import { JoinLobbyEvent } from "./Main";
import { UsernameInput } from "./UsernameInput";

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

  @state() private disabledUnits: UnitType[] = [];
  @state() private rightExpanded: boolean = false;

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
    this.presetNameInput = updated.name;
    this.persistPresetsToStorage();
  };

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

  private renderMapsPane() {
    return html`
      <of-map-browser-pane
        .selectedMap=${this.selectedMap}
        .useRandomMap=${this.useRandomMap}
        @map-select=${(e: CustomEvent<{ value: GameMapType }>) =>
          this.handleMapSelection(e.detail.value)}
        @toggle-random=${this.handleRandomMapToggle}
      ></of-map-browser-pane>
    `;
  }

  private renderSettingsSummary() {
    return html`
      <of-settings-summary
        .selectedMap=${this.selectedMap}
        .selectedDifficulty=${this.selectedDifficulty}
        .gameMode=${this.gameMode}
        .bots=${this.bots}
        .useRandomMap=${this.useRandomMap}
      ></of-settings-summary>
    `;
  }

  private renderDifficultyControls() {
    return html`
      <of-difficulty-controls
        .value=${this.selectedDifficulty}
        @change=${(e: CustomEvent<{ value: Difficulty }>) =>
          this.handleDifficultySelection(e.detail.value)}
      ></of-difficulty-controls>
    `;
  }

  private renderModeControls() {
    return html`
      <of-game-mode-controls
        .value=${this.gameMode}
        @change=${(e: CustomEvent<{ value: GameMode }>) =>
          this.handleGameModeSelection(e.detail.value)}
      ></of-game-mode-controls>
    `;
  }

  private renderBotsSlider() {
    return html`
      <of-bots-slider
        .value=${this.bots}
        .max=${400}
        .debounceMs=${0}
        @input=${(e: CustomEvent<{ value: number }>) =>
          (this.bots = e.detail.value)}
        @change=${(e: CustomEvent<{ value: number }>) =>
          (this.bots = e.detail.value)}
      ></of-bots-slider>
    `;
  }

  private renderTeamCountControls() {
    if (this.gameMode !== GameMode.Team) return null;
    return html`
      <of-team-count-picker
        .mode=${this.gameMode}
        .value=${this.teamCount}
        @change=${(e: CustomEvent<{ value: TeamCountConfig }>) =>
          (this.teamCount = e.detail.value)}
      ></of-team-count-picker>
    `;
  }

  private renderAdvancedOptions() {
    return html`
      <of-advanced-options
        .rules=${{
          disableNPCs: this.disableNPCs,
          instantBuild: this.instantBuild,
          infiniteGold: this.infiniteGold,
          infiniteTroops: this.infiniteTroops,
          compactMap: this.compactMap,
        }}
        .disabledUnits=${this.disabledUnits}
        @toggle-rule=${(e: CustomEvent<{ key: string; checked: boolean }>) => {
          this[e.detail.key] = e.detail.checked;
        }}
        @toggle-unit=${(
          e: CustomEvent<{ unit: UnitType; checked: boolean }>,
        ) => {
          this.toggleUnit(e.detail.unit, e.detail.checked);
        }}
      ></of-advanced-options>
    `;
  }

  private renderSettingsPane() {
    return html`
      <section
        aria-label="Settings"
        class="min-h-0 flex flex-col gap-3 rounded-xl border border-white/15 bg-zinc-900/40 p-3 overflow-auto"
      >
        ${this.renderRightTopControls()} ${this.renderSettingsSummary()}
        ${this.renderDifficultyControls()} ${this.renderModeControls()}
        ${this.renderTeamCountControls()} ${this.renderBotsSlider()}
        ${this.renderAdvancedOptions()}
      </section>
    `;
  }

  private renderFooter() {
    return html`
      <of-presets-bar
        .items=${this.presets.map((p) => ({ id: p.id, name: p.name }))}
        .selectedId=${this.selectedPresetId}
        .nameInput=${this.presetNameInput}
        .error=${this.presetError}
        .limit=${(this.constructor as typeof SinglePlayerModal).MAX_PRESETS}
        @select=${(e: CustomEvent<string | null>) => (
          (this.selectedPresetId = e.detail),
          this.handlePresetSelectChange(new Event("change", { bubbles: false }))
        )}
        @name-input=${(e: CustomEvent<string>) => {
          this.presetNameInput = e.detail;
          if (this.presetError && this.presetNameInput.trim())
            this.presetError = "";
        }}
        @save=${this.saveNewPreset}
        @update=${this.updateSelectedPreset}
        @delete=${this.deleteSelectedPreset}
      >
      </of-presets-bar>
    `;
  }

  private renderBody() {
    return html`
      <main
        class=${`grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-auto p-4 ${
          this.rightExpanded ? "md:grid-cols-1" : "md:grid-cols-[1.2fr_1fr]"
        }`}
      >
        ${this.rightExpanded ? null : this.renderMapsPane()}
        ${this.renderSettingsPane()}
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
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }

  public open() {
    this.style.display = "block";
  }

  public close() {
    this.style.display = "none";
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

  private toggleUnit = (unit: UnitType, checked: boolean): void => {
    this.disabledUnits = checked
      ? this.disabledUnits.includes(unit)
        ? this.disabledUnits
        : [...this.disabledUnits, unit]
      : this.disabledUnits.filter((u) => u !== unit);
  };

  private renderRightTopControls() {
    return html`
      <div class="sticky top-0 z-20 bg-transparent">
        <div class="flex items-center gap-2 pb-2 justify-end">
          <of-expand-button
            .expanded=${this.rightExpanded}
            @toggle=${(e: CustomEvent<{ value: boolean }>) =>
              (this.rightExpanded = e.detail.value)}
          ></of-expand-button>
        </div>
      </div>
    `;
  }

  private async startGame() {
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
