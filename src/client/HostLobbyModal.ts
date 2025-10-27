import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  UnitType,
} from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import {
  ClientInfo,
  GameConfig,
  GameInfo,
  TeamCountConfig,
} from "../core/Schemas";
import { generateID } from "../core/Util";
import "./components/Difficulties";
import "./components/shared/AdvancedOptions";
import "./components/shared/BotsSlider";
import "./components/shared/DifficultyControls";
import "./components/shared/DifficultyPicker";
import "./components/shared/ExpandButton";
import "./components/shared/GameModeControls";
import "./components/shared/GameModePicker";
import "./components/shared/MapBrowserPane";
import "./components/shared/MapGrid";
import "./components/shared/PresetsBar";
import "./components/shared/SettingsSummary";
import "./components/shared/TeamCountPicker";

import { JoinLobbyEvent } from "./Main";

type HostLobbyPreset = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: {
    selectedMap: GameMapType;
    selectedDifficulty: Difficulty;
    disableNPCs: boolean;
    bots: number;
    infiniteGold: boolean;
    donateGold: boolean;
    infiniteTroops: boolean;
    donateTroops: boolean;
    compactMap: boolean;
    instantBuild: boolean;
    useRandomMap: boolean;
    gameMode: GameMode;
    teamCount: TeamCountConfig;
    disabledUnits: UnitType[];
  };
};

const HOST_MAX_PRESETS = 10;
const HOST_PRESETS_KEY = "host.presets.v1";

@customElement("host-lobby-modal")
export class HostLobbyModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };
  @state() private selectedMap: GameMapType = GameMapType.World;
  @state() private selectedDifficulty: Difficulty = Difficulty.Medium;
  @state() private disableNPCs = false;
  @state() private gameMode: GameMode = GameMode.FFA;
  @state() private teamCount: TeamCountConfig = 2;
  @state() private bots: number = 400;
  @state() private infiniteGold: boolean = false;
  @state() private donateGold: boolean = false;
  @state() private infiniteTroops: boolean = false;
  @state() private donateTroops: boolean = false;
  @state() private instantBuild: boolean = false;
  @state() private compactMap: boolean = false;

  @state() private lobbyId = "";
  @state() private copySuccess = false;
  @state() private clients: ClientInfo[] = [];
  @state() private useRandomMap: boolean = false;
  @state() private disabledUnits: UnitType[] = [];
  @state() private lobbyCreatorClientID: string = "";
  @state() private lobbyIdVisible: boolean = true;

  @state() private mapSearchQuery: string = "";
  @state() private mapFilter: string = "all"; // "all" | "continental" | "regional" | "fantasy"

  @state() private presets: HostLobbyPreset[] = [];
  @state() private selectedPresetId: string | null = null;
  @state() private presetNameInput: string = "";
  @state() private presetError: string = "";

  @state() private inviteExpanded = false;
  @state() private rightExpanded = false;

  private playersInterval: NodeJS.Timeout | null = null;
  private botsUpdateTimer: number | null = null;
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

  private currentSettings(): HostLobbyPreset["settings"] {
    return {
      selectedMap: this.selectedMap,
      selectedDifficulty: this.selectedDifficulty,
      disableNPCs: this.disableNPCs,
      bots: this.bots,
      infiniteGold: this.infiniteGold,
      donateGold: this.donateGold,
      infiniteTroops: this.infiniteTroops,
      donateTroops: this.donateTroops,
      compactMap: this.compactMap,
      instantBuild: this.instantBuild,
      useRandomMap: this.useRandomMap,
      gameMode: this.gameMode,
      teamCount: this.teamCount,
      disabledUnits: [...this.disabledUnits],
    };
  }

  private getInviteUrl(): string {
    const USE_PATH_ROUTE = false; // flip if you add /join/:id
    const id = this.lobbyId?.trim();
    if (!id) return "";
    const base = location.origin;
    if (USE_PATH_ROUTE) return `${base}/join/${encodeURIComponent(id)}`;
    const u = new URL(base);
    u.hash = `join=${encodeURIComponent(id)}`;
    return u.toString();
  }

  private toggleInviteVisibility = () => {
    this.lobbyIdVisible = !this.lobbyIdVisible;
    // keep user choice persistent (you already read it in open())
    this.userSettings.set("settings.lobbyIdVisibility", this.lobbyIdVisible);
  };

  private norm(s: string) {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private get selectedDifficultyKey(): string {
    return (
      Object.keys(Difficulty).find(
        (k) =>
          Difficulty[k as keyof typeof Difficulty] === this.selectedDifficulty,
      ) ?? ""
    );
  }

  private applySettings(s: HostLobbyPreset["settings"]) {
    this.selectedMap = s.selectedMap;
    this.selectedDifficulty = s.selectedDifficulty;
    this.disableNPCs = s.disableNPCs;
    this.bots = s.bots;
    this.infiniteGold = s.infiniteGold;
    this.donateGold = s.donateGold;
    this.infiniteTroops = s.infiniteTroops;
    this.donateTroops = s.donateTroops;
    this.compactMap = s.compactMap;
    this.instantBuild = s.instantBuild;
    this.useRandomMap = s.useRandomMap;
    this.gameMode = s.gameMode;
    this.teamCount = s.teamCount;
    this.disabledUnits = [...s.disabledUnits];
    this.putGameConfig();
  }

  private copyInviteUrl = async () => {
    try {
      const url = this.getInviteUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      this.copySuccess = true;
      setTimeout(() => (this.copySuccess = false), 1600);
    } catch (err) {
      console.error("Failed to copy invite:", err);
    }
  };

  private loadPresetsFromStorage() {
    try {
      const raw = localStorage.getItem(HOST_PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const arr = parsed as HostLobbyPreset[];
        this.presets = arr
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, HOST_MAX_PRESETS);
        if (arr.length !== this.presets.length) this.persistPresetsToStorage();
      }
    } catch (e) {
      console.warn("Failed to load host presets:", e);
    }
  }

  private persistPresetsToStorage() {
    try {
      localStorage.setItem(HOST_PRESETS_KEY, JSON.stringify(this.presets));
    } catch (e) {
      console.warn("Failed to save host presets:", e);
    }
  }

  private handlePresetSelectChange = (e: Event) => {
    const id = (e.target as HTMLSelectElement).value || null;
    this.selectedPresetId = id;
    const preset = this.presets.find((p) => p.id === id);
    if (preset) {
      this.applySettings(preset.settings);
      this.presetNameInput = preset.name;
    } else {
      this.presetNameInput = "";
    }
  };

  private saveNewPreset = () => {
    const name = this.presetNameInput.trim();
    if (!name) {
      this.presetError = "Please enter a preset name.";
      return;
    }
    if (this.presets.length >= HOST_MAX_PRESETS) {
      this.presetError = `You can only save up to ${HOST_MAX_PRESETS} presets. Delete one to add another.`;
      return;
    }
    this.presetError = "";

    const now = Date.now();
    const preset: HostLobbyPreset = {
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
    const updated: HostLobbyPreset = {
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

  private deleteSelectedPreset = () => {
    if (!this.selectedPresetId) return;
    this.presets = this.presets.filter((p) => p.id !== this.selectedPresetId);
    this.selectedPresetId = null;
    this.presetNameInput = "";
    this.persistPresetsToStorage();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private toggleRightExpanded = () => {
    this.rightExpanded = !this.rightExpanded;
  };

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

  private getInviteId(): string {
    return this.lobbyId?.trim() ?? "";
  }

  private mask(text: string): string {
    return text ? "•".repeat(text.length) : "";
  }

  private renderInviteBarInner() {
    const id = this.getInviteId();

    // what the input displays: only the id, masked if hidden
    const displayValue = id
      ? this.lobbyIdVisible
        ? id
        : this.mask(id)
      : (translateText("host_modal.generating") ?? "Generating…");

    return html`
      <div
        class="rounded-xl border border-white/15 bg-zinc-900/70 backdrop-blur px-2 py-2 flex items-center gap-2"
      >
        <!-- ID field -->
        <div class="relative flex-1">
          <input
            class="h-10 w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 pr-24 text-zinc-100 placeholder:text-zinc-400
                 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            type="text"
            .value=${displayValue}
            readonly
            @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
            aria-label="Lobby ID"
          />

          <!-- Eye toggle -->
          <button
            class="absolute right-2 top-1.5 h-7 w-7 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200 flex items-center justify-center"
            @click=${this.toggleInviteVisibility}
            title=${this.lobbyIdVisible ? "Hide ID" : "Show ID"}
            aria-label=${this.lobbyIdVisible ? "Hide ID" : "Show ID"}
            aria-pressed=${String(this.lobbyIdVisible)}
            type="button"
          >
            ${this.lobbyIdVisible
              ? html`<svg
                  viewBox="0 0 512 512"
                  height="18"
                  width="18"
                  fill="currentColor"
                  class="block"
                >
                  <path
                    d="M256 105c-101.8 0-188.4 62.7-224 151 35.6 88.3 122.2 151 224 151s188.4-62.7 224-151c-35.6-88.3-122.2-151-224-151zm0 251.7c-56 0-101.7-45.7-101.7-101.7S200 153.3 256 153.3 357.7 199 357.7 255 312 356.7 256 356.7zm0-161.1c-33 0-59.4 26.4-59.4 59.4s26.4 59.4 59.4 59.4 59.4-26.4 59.4-59.4-26.4-59.4-59.4-59.4z"
                  />
                </svg>`
              : html`<svg
                  viewBox="0 0 512 512"
                  height="18"
                  width="18"
                  fill="currentColor"
                  class="block"
                >
                  <path
                    d="M448 256s-64-128-192-128S64 256 64 256c32 64 96 128 192 128s160-64 192-128z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="32"
                  ></path>
                  <path
                    d="M144 256l224 0"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="32"
                    stroke-linecap="round"
                  ></path>
                </svg>`}
          </button>
        </div>

        <!-- Copy full URL -->
        <button
          class="h-10 whitespace-nowrap rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 font-medium text-blue-50 hover:bg-blue-500/25 disabled:opacity-50"
          @click=${this.copyInviteUrl}
          ?disabled=${!id}
          type="button"
        >
          ${this.copySuccess ? "Copied" : "Copy invite"}
        </button>
      </div>
    `;
  }

  private renderRightTopControls() {
    return html`
      <div class="sticky top-0 z-20 bg-transparent">
        <div class="flex items-center gap-2 pb-2">
          <div class="flex-1">${this.renderInviteBarInner()}</div>
          <of-expand-button
            .expanded=${this.rightExpanded}
            @toggle=${(e: CustomEvent<{ value: boolean }>) =>
              (this.rightExpanded = e.detail.value)}
          ></of-expand-button>
        </div>
      </div>
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

  private renderModeToggle() {
    const on = "bg-blue-500/25 text-blue-50 border border-blue-400/50";
    const off =
      "bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/15";
    const btn =
      "h-10 px-4 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60";

    return html`
      <label class="mb-1 ml-0.5 block text-xs text-zinc-400">
        ${translateText("host_modal.mode")}
      </label>
      <div class="inline-flex overflow-hidden rounded-xl">
        <button
          class="${btn} ${this.gameMode === GameMode.FFA ? on : off}"
          aria-pressed=${String(this.gameMode === GameMode.FFA)}
          @click=${() => this.handleGameModeSelection(GameMode.FFA)}
        >
          ${translateText("game_mode.ffa")}
        </button>
        <button
          class="${btn} ${this.gameMode === GameMode.Team ? on : off}"
          aria-pressed=${String(this.gameMode === GameMode.Team)}
          @click=${() => this.handleGameModeSelection(GameMode.Team)}
        >
          ${translateText("game_mode.teams")}
        </button>
      </div>
    `;
  }

  private renderTeamOptionsIfTeams() {
    if (this.gameMode !== GameMode.Team) return null;

    return html`
      <of-team-count-picker
        .mode=${this.gameMode}
        .value=${this.teamCount}
        @change=${(e: CustomEvent<{ value: TeamCountConfig }>) =>
          this.handleTeamCountSelection(e.detail.value)}
      ></of-team-count-picker>
    `;
  }

  private renderBotsSlider() {
    return html`
      <of-bots-slider
        .value=${this.bots}
        .max=${400}
        .debounceMs=${300}
        @bots-input=${(e: CustomEvent<{ value: number }>) => {
          this.bots = e.detail.value;
        }}
        @bots-change=${(e: CustomEvent<{ value: number }>) => {
          this.bots = e.detail.value;
          this.putGameConfig();
        }}
      ></of-bots-slider>
    `;
  }

  private renderAdvancedOptions() {
    return html`
      <of-advanced-options
        .rules=${{
          disableNPCs: this.disableNPCs,
          instantBuild: this.instantBuild,
          donateGold: this.donateGold,
          donateTroops: this.donateTroops,
          infiniteGold: this.infiniteGold,
          infiniteTroops: this.infiniteTroops,
          compactMap: this.compactMap,
        }}
        .disabledUnits=${this.disabledUnits}
        @toggle-rule=${(
          e: CustomEvent<{ key: keyof HostLobbyModal; checked: boolean }>,
        ) => {
          (this as any)[e.detail.key] = e.detail.checked;
          this.putGameConfig();
        }}
        @toggle-unit=${(
          e: CustomEvent<{ unit: UnitType; checked: boolean }>,
        ) => {
          this.toggleUnit(e.detail.unit, e.detail.checked);
        }}
      ></of-advanced-options>
    `;
  }

  private renderFooter() {
    return html`
      <of-presets-bar
        .items=${this.presets.map((p) => ({ id: p.id, name: p.name }))}
        .selectedId=${this.selectedPresetId}
        .nameInput=${this.presetNameInput}
        .error=${this.presetError}
        .limit=${HOST_MAX_PRESETS}
        @select=${(e: CustomEvent<string | null>) => {
          const id = e.detail;
          this.selectedPresetId = id;
          const preset = this.presets.find((p) => p.id === id);
          if (preset) {
            this.applySettings(preset.settings);
            this.presetNameInput = preset.name;
          } else {
            this.presetNameInput = "";
          }
        }}
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

  private renderSettingsPane() {
    return html`
      <section
        aria-label="Settings"
        class="min-h-0 flex flex-col gap-3 rounded-xl border border-white/15 bg-zinc-900/40 p-3 overflow-auto"
      >
        ${this.renderRightTopControls()} ${this.renderSettingsSummary()}
        ${this.renderDifficultyControls()} ${this.renderModeControls()}
        ${this.renderTeamOptionsIfTeams()} ${this.renderBotsSlider()}
        ${this.renderAdvancedOptions()}

        <!-- Host-only: players + start button -->
        <section class="rounded-xl border border-white/15 bg-white/5 p-3">
          <div class="option-title mb-2">
            ${this.clients.length}
            ${this.clients.length === 1
              ? translateText("host_modal.player")
              : translateText("host_modal.players")}
          </div>

          <div class="players-list">
            ${this.clients.map(
              (client) => html`
                <span class="player-tag">
                  ${client.username}
                  ${client.clientID === this.lobbyCreatorClientID
                    ? html`<span class="host-badge">
                        (${translateText("host_modal.host_badge")})
                      </span>`
                    : html`<button
                        class="remove-player-btn"
                        @click=${() => this.kickPlayer(client.clientID)}
                        title="Remove ${client.username}"
                        type="button"
                      >
                        ×
                      </button>`}
                </span>
              `,
            )}
          </div>

          <div class="start-game-button-container mt-3">
            <button
              @click=${this.startGame}
              ?disabled=${this.clients.length < 2}
              class="start-game-button"
              type="button"
            >
              ${this.clients.length === 1
                ? translateText("host_modal.waiting")
                : translateText("host_modal.start")}
            </button>
          </div>
        </section>
      </section>
    `;
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-50"
        role="dialog"
        aria-labelledby="host-title"
        aria-modal="true"
      >
        <div
          class="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_600px_at_60%_-10%,rgba(59,130,246,0.18),transparent),radial-gradient(900px_500px_at_15%_110%,rgba(59,130,246,0.10),transparent)]"
        ></div>

        <section
          class="fixed inset-4 mx-auto flex max-w-[1200px] min-h-[560px] flex-col rounded-2xl border border-white/15 bg-zinc-900/80 backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.45)] md:inset-8 text-zinc-100 antialiased"
        >
          <!-- header (matches Single Player) -->
          <header
            class="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-gradient-to-b from-zinc-900/95 to-zinc-900/70 px-4 py-3 backdrop-blur"
          >
            <h1
              id="host-title"
              class="m-0 text-[18px] font-bold tracking-tight text-zinc-100"
            >
              ${translateText("host_modal.title")}
            </h1>
            <div class="flex gap-2">
              <button
                class="h-11 min-w-11 rounded-xl border border-blue-400/40 bg-blue-500/15 px-3 text-blue-50 hover:bg-blue-500/20"
                title=${translateText("host_modal.start")}
                @click=${this.startGame}
                ?disabled=${this.clients.length < 2}
              >
                ▶
                ${this.clients.length === 1
                  ? translateText("host_modal.waiting")
                  : translateText("host_modal.start")}
              </button>
              <button
                aria-label="Close"
                class="h-11 min-w-11 rounded-xl border border-white/15 bg-white/5 px-3 hover:bg-white/10 hover:border-white/20 text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 transition-colors"
                @click=${this.close}
              >
                ✕
              </button>
            </div>
          </header>

          <!-- body -->
          <main
            class=${`grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-auto p-4 ${
              this.rightExpanded ? "md:grid-cols-1" : "md:grid-cols-[1.2fr_1fr]"
            }`}
          >
            ${this.rightExpanded ? null : this.renderMapsPane()}
            ${this.renderSettingsPane()}
          </main>

          ${this.renderFooter()}
        </section>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }

  public open() {
    this.lobbyCreatorClientID = generateID();
    this.lobbyIdVisible = this.userSettings.get(
      "settings.lobbyIdVisibility",
      true,
    );

    this.style.display = "block";

    const preId = generateID();
    this.lobbyId = preId; // <- show URL immediately

    createLobby(this.lobbyCreatorClientID, preId)
      .then((lobby) => {
        this.lobbyId = lobby.gameID || preId;
      })
      .then(() => {
        this.dispatchEvent(
          new CustomEvent("join-lobby", {
            detail: {
              gameID: this.lobbyId,
              clientID: this.lobbyCreatorClientID,
            } as JoinLobbyEvent,
            bubbles: true,
            composed: true,
          }),
        );
      })
      .catch((err) => console.error("Error creating lobby:", err));

    this.modalEl?.open();
    this.playersInterval = setInterval(() => this.pollPlayers(), 1000);
  }

  public close() {
    this.style.display = "none";
    this.copySuccess = false;
    if (this.playersInterval) {
      clearInterval(this.playersInterval);
      this.playersInterval = null;
    }
    if (this.botsUpdateTimer !== null) {
      clearTimeout(this.botsUpdateTimer);
      this.botsUpdateTimer = null;
    }
  }

  private async handleRandomMapToggle() {
    this.useRandomMap = !this.useRandomMap;
    this.putGameConfig();
  }

  private async handleMapSelection(value: GameMapType) {
    this.selectedMap = value;
    this.useRandomMap = false;
    this.putGameConfig();
  }

  private async handleDifficultySelection(value: Difficulty) {
    this.selectedDifficulty = value;
    this.putGameConfig();
  }

  private async handleGameModeSelection(value: GameMode) {
    this.gameMode = value;
    this.putGameConfig();
  }

  private async handleTeamCountSelection(value: TeamCountConfig) {
    this.teamCount = value;
    this.putGameConfig();
  }

  private async putGameConfig() {
    const config = await getServerConfigFromClient();
    const response = await fetch(
      `${window.location.origin}/${config.workerPath(this.lobbyId)}/api/game/${this.lobbyId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameMap: this.selectedMap,
          gameMapSize: this.compactMap
            ? GameMapSize.Compact
            : GameMapSize.Normal,
          difficulty: this.selectedDifficulty,
          disableNPCs: this.disableNPCs,
          bots: this.bots,
          infiniteGold: this.infiniteGold,
          donateGold: this.donateGold,
          infiniteTroops: this.infiniteTroops,
          donateTroops: this.donateTroops,
          instantBuild: this.instantBuild,
          gameMode: this.gameMode,
          disabledUnits: this.disabledUnits,
          playerTeams: this.teamCount,
        } satisfies Partial<GameConfig>),
      },
    );
    return response;
  }

  private toggleUnit(unit: UnitType, checked: boolean): void {
    console.log(`Toggling unit type: ${unit} to ${checked}`);
    this.disabledUnits = checked
      ? [...this.disabledUnits, unit]
      : this.disabledUnits.filter((u) => u !== unit);

    this.putGameConfig();
  }

  private getRandomMap(): GameMapType {
    const maps = Object.values(GameMapType);
    const randIdx = Math.floor(Math.random() * maps.length);
    return maps[randIdx] as GameMapType;
  }

  private async startGame() {
    if (this.useRandomMap) {
      this.selectedMap = this.getRandomMap();
    }

    await this.putGameConfig();
    console.log(
      `Starting private game with map: ${GameMapType[this.selectedMap as keyof typeof GameMapType]} ${this.useRandomMap ? " (Randomly selected)" : ""}`,
    );
    this.close();
    const config = await getServerConfigFromClient();
    const response = await fetch(
      `${window.location.origin}/${config.workerPath(this.lobbyId)}/api/start_game/${this.lobbyId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    return response;
  }

  private async pollPlayers() {
    const config = await getServerConfigFromClient();
    fetch(`/${config.workerPath(this.lobbyId)}/api/game/${this.lobbyId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data: GameInfo) => {
        console.log(`got game info response: ${JSON.stringify(data)}`);

        this.clients = data.clients ?? [];
      });
  }

  private kickPlayer(clientID: string) {
    // Dispatch event to be handled by WebSocket instead of HTTP
    this.dispatchEvent(
      new CustomEvent("kick-player", {
        detail: { target: clientID },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

async function createLobby(
  creatorClientID: string,
  id?: string,
): Promise<GameInfo> {
  const config = await getServerConfigFromClient();
  const lobbyId = id ?? generateID(); // use provided id if present
  const response = await fetch(
    `/${config.workerPath(lobbyId)}/api/create_game/${encodeURIComponent(lobbyId)}?creatorClientID=${encodeURIComponent(creatorClientID)}`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Server error response:", errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data as GameInfo;
}
