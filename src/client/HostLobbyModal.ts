import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import { getServerConfigFromClient } from "../core/configuration/ConfigLoader";
import {
  Difficulty,
  Duos,
  GameMapSize,
  GameMapType,
  GameMode,
  Quads,
  Trios,
  UnitType,
  mapCategories,
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
import "./components/Maps";
import "./components/shared/DifficultyPicker";
import "./components/shared/GameModePicker";
import "./components/shared/MapGrid";
import { JoinLobbyEvent } from "./Main";
import { renderUnitTypeOptions } from "./utilities/RenderUnitTypeOptions";

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
  // Add a new timer for debouncing bot changes
  private botsUpdateTimer: number | null = null;
  private userSettings: UserSettings = new UserSettings();

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
    this.loadPresetsFromStorage();
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
    // Pick the canonical deep link for your app here.
    // If you later wire a /join/:id route, flip the constant below.
    const USE_PATH_ROUTE = false; // set to true if you add /join/<id>
    const id = this.lobbyId?.trim();
    if (!id) return "";

    const base = location.origin;

    if (USE_PATH_ROUTE) {
      return `${base}/join/${encodeURIComponent(id)}`;
    }

    // Default SPA hash deep link (works with your existing "#join=" handler)
    const u = new URL(base);
    u.hash = `join=${encodeURIComponent(id)}`;
    return u.toString();
  }

  private toggleInviteVisibility = () => {
    this.lobbyIdVisible = !this.lobbyIdVisible;
    // keep user choice persistent (you already read it in open())
    this.userSettings.set("settings.lobbyIdVisibility", this.lobbyIdVisible);
  };

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

  private toggleRightExpanded = () => {
    this.rightExpanded = !this.rightExpanded;
  };

  private toggleInviteExpanded = () => {
    this.inviteExpanded = !this.inviteExpanded;
  };

  private applySettings(s: HostLobbyPreset["settings"]) {
    // set all state first…
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
    // …then sync server once
    this.putGameConfig();
  }

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

  // (A) Just the invite content (no sticky wrapper)
  private renderInviteBarInner() {
    const actualUrl = this.getInviteUrl();
    const masked = "••••••••••••••••••••";
    const displayValue = this.lobbyId
      ? this.lobbyIdVisible
        ? actualUrl
        : masked
      : (translateText("host_modal.generating") ?? "Generating…");

    return html`
      <div
        class="rounded-xl border border-white/15 bg-zinc-900/70 backdrop-blur px-2 py-2 flex items-center gap-2"
      >
        <!-- URL field -->
        <div class="relative flex-1">
          <input
            class="h-10 w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 pr-24 text-zinc-100 placeholder:text-zinc-400
                 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
            type="text"
            .value=${displayValue}
            readonly
            @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
          />
          <!-- Eye toggle -->
          <button
            class="absolute right-2 top-1.5 h-7 w-7 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200"
            @click=${this.toggleInviteVisibility}
            title=${this.lobbyIdVisible
              ? "Hide invite link"
              : "Show invite link"}
            aria-label="Toggle invite visibility"
            aria-pressed=${String(this.lobbyIdVisible)}
          >
            ${this.lobbyIdVisible
              ? html`<svg
                  viewBox="0 0 512 512"
                  height="18"
                  width="18"
                  fill="currentColor"
                >
                  <path
                    d="M256 105c-101.8 0-188.4 62.7-224 151 35.6 88.3 122.2 151 224 151s188.4-62.7 224-151c-35.6-88.3-122.2-151-224-151zm0 251.7c-56 0-101.7-45.7-101.7-101.7S200 153.3 256 153.3 357.7 199 357.7 255 312 356.7 256 356.7zm0-161.1c-33 0-59.4 26.4-59.4 59.4s26.4 59.4 59.4 59.4 59.4-26.4 59.4-59.4-26.4-59.4-59.4-59.4z"
                  ></path>
                </svg>`
              : html`<svg
                  viewBox="0 0 512 512"
                  height="18"
                  width="18"
                  fill="currentColor"
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

        <!-- Copy -->
        <button
          class="h-10 whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 font-medium text-emerald-50
               hover:bg-emerald-600/30 disabled:opacity-50"
          @click=${this.copyInviteUrl}
          ?disabled=${!this.lobbyId}
        >
          ${this.copySuccess ? "Copied" : "Copy invite"}
        </button>
      </div>
    `;
  }

  // (B) Sticky top wrapper that contains the expand button row AND the invite bar
  private renderRightTopControls() {
    return html`
      <div class="sticky top-0 z-20 bg-transparent">
        <div class="flex items-center gap-2 pb-2">
          <div class="flex-1">${this.renderInviteBarInner()}</div>
          ${this.renderRightExpandButton(true)}
        </div>
      </div>
    `;
  }

  // 1) Mode toggle (FFA | Teams)
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

  // 2) Team options (only visible when Teams is selected)
  private renderTeamOptionsIfTeams() {
    if (this.gameMode !== GameMode.Team) return null;

    const numbers: TeamCountConfig[] = [2, 3, 4, 5, 6, 7];
    const named: TeamCountConfig[] = [Duos, Trios, Quads];

    const group =
      "inline-flex items-center overflow-hidden rounded-xl border border-white/15 bg-white/5 backdrop-blur";
    const btn =
      "h-9 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60";
    const on = "border border-emerald-500/40 bg-emerald-600/20 text-emerald-50";
    const off = "text-zinc-200 hover:bg-white/10";

    const isSel = (v: TeamCountConfig) => this.teamCount === v;

    return html`
      <div class="mt-3">
        <label class="mb-1 ml-0.5 block text-xs text-zinc-400">
          ${translateText("host_modal.team_count")}
        </label>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Teams">
          <!-- 2..7 -->
          <div class=${group}>
            ${numbers.map(
              (n) => html`
                <button
                  class="${btn} ${isSel(n) ? on : off}"
                  aria-pressed=${String(isSel(n))}
                  @click=${() => this.handleTeamCountSelection(n)}
                >
                  ${n}
                </button>
              `,
            )}
          </div>
          <!-- Duos/Trios/Quads -->
          <div class=${group}>
            ${named.map(
              (v) => html`
                <button
                  class="${btn} ${isSel(v) ? on : off}"
                  aria-pressed=${String(isSel(v))}
                  @click=${() => this.handleTeamCountSelection(v)}
                >
                  ${translateText(`public_lobby.teams_${v}`)}
                </button>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }

  // ⬇️ Not absolute anymore; it's a normal row we can place anywhere.
  private renderRightExpandButton(inline = false) {
    const label = this.rightExpanded
      ? (translateText("host_modal.collapse_panel") ?? "Collapse panel")
      : (translateText("host_modal.expand_panel") ?? "Expand panel");

    const btn = html`
      <button
        class="h-10 px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        @click=${this.toggleRightExpanded}
        aria-pressed=${String(this.rightExpanded)}
        aria-label=${label}
        title=${label}
      >
        ${this.rightExpanded ? "⤡" : "⤢"}
        <span class="hidden sm:inline">${label}</span>
      </button>
    `;

    return inline
      ? btn
      : html`<div class="mb-2 flex items-center justify-end">${btn}</div>`;
  }

  private renderPresetsFooter() {
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

          <span class="text-xs text-zinc-400 ml-1"
            >(${this.presets.length}/${HOST_MAX_PRESETS})</span
          >

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

          <!-- Save new -->
          <button
            class="h-9 w-9 grid place-items-center rounded-lg border border-blue-400/40 bg-blue-500/15 text-blue-50 hover:bg-blue-500/25 disabled:opacity-50"
            @click=${this.saveNewPreset}
            ?disabled=${!this.presetNameInput.trim() ||
            this.presets.length >= HOST_MAX_PRESETS}
            aria-label="Save new preset"
            title=${this.presets.length >= HOST_MAX_PRESETS
              ? `Limit reached (${this.presets.length}/${HOST_MAX_PRESETS}). Delete one to add another.`
              : "Save new preset"}
          >
            💾
          </button>

          <!-- Update selected -->
          <button
            class="h-9 w-9 grid place-items-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50"
            @click=${this.updateSelectedPreset}
            ?disabled=${!this.selectedPresetId || !this.presetNameInput.trim()}
            aria-label="Update selected preset"
            title="Update selected preset"
          >
            ⟳
          </button>

          <!-- Delete selected -->
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

        <!-- (Optional) Secondary Start button on the right; you can remove if you only want it in header -->
        <div>
          <button
            class="h-9 rounded-lg bg-blue-500 px-3 font-bold text-white hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50"
            @click=${this.startGame}
            ?disabled=${this.clients.length < 2}
          >
            ${this.clients.length === 1
              ? translateText("host_modal.waiting")
              : translateText("host_modal.start")}
          </button>
        </div>
      </footer>
    `;
  }

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

  // Build the filtered list for the left map pane (like SP)
  private getFilteredMaps(): Array<{
    value: GameMapType;
    key: keyof typeof GameMapType;
    category: string;
    name: string;
  }> {
    const q = this.norm(this.mapSearchQuery.trim());
    const selectedFilter = this.mapFilter;

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
    if (selectedFilter !== "all")
      filtered = filtered.filter((m) => m.category === selectedFilter);
    if (q)
      filtered = filtered.filter(
        (m) =>
          this.norm(m.name).includes(q) || this.norm(String(m.key)).includes(q),
      );
    return filtered;
  }

  // Slider visuals (same as SP)
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

  // ===== LEFT: Maps pane (exact spot to use <of-map-grid>) =====
  private renderMapsPane() {
    return html`
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

        <div class="grid flex-1 grid-cols-1 gap-4 overflow-auto p-3">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <!-- EXACTLY where to use of-map-grid -->
            <of-map-grid
              .items=${this.getFilteredMaps().map(({ value, key, name }) => ({
                value,
                key,
                name,
              }))}
              .selectedMap=${this.selectedMap}
              .useRandomMap=${this.useRandomMap}
              @map-select=${(e: CustomEvent<{ value: GameMapType }>) =>
                this.handleMapSelection(e.detail.value)}
            ></of-map-grid>

            ${this.getFilteredMaps().length
              ? null
              : html` <div class="col-span-full text-sm text-zinc-400">
                  ${translateText("common.no_results") ?? "No maps found."}
                </div>`}
          </div>
        </div>
      </aside>
    `;
  }

  // ===== RIGHT: Summary =====
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
              ${translateText("host_modal.bots")}
            </dt>
            <dd class="font-semibold">${this.bots}</dd>
          </div>
        </dl>
      </section>
    `;
  }

  // ===== RIGHT: Difficulty =====
  private renderDifficultyControls() {
    return html`
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
    `;
  }

  // ===== RIGHT: Mode =====
  private renderModeControls() {
    return html`
      <label class="mb-1 ml-0.5 block text-xs text-zinc-400"
        >${translateText("host_modal.mode")}</label
      >
      <of-game-mode-picker
        .value=${this.gameMode}
        @change=${(e: CustomEvent<{ value: GameMode }>) =>
          this.handleGameModeSelection(e.detail.value)}
      ></of-game-mode-picker>

      ${this.gameMode === GameMode.FFA
        ? ""
        : html`
            <div class="mt-3">
              <label class="mb-1 ml-0.5 block text-xs text-zinc-400"
                >${translateText("host_modal.team_count")}</label
              >
              <div class="flex flex-wrap gap-2">
                ${[2, 3, 4, 5, 6, 7, Quads, Trios, Duos].map(
                  (o) => html`
                    <button
                      class=${`min-w-11 rounded-full border px-3 py-2 transition-colors ${
                        this.teamCount === o
                          ? "border-blue-400/60 bg-blue-500/25 text-blue-50"
                          : "border-white/15 bg-white/5 hover:border-white/25"
                      }`}
                      @click=${() => this.handleTeamCountSelection(o)}
                    >
                      ${typeof o === "string"
                        ? translateText(`public_lobby.teams_${o}`)
                        : translateText("public_lobby.teams", { num: o })}
                    </button>
                  `,
                )}
              </div>
            </div>
          `}
    `;
  }

  // ===== RIGHT: Bots slider =====
  private renderBotsSlider() {
    return html`
      <div>
        <label for="botsRange" class="mb-1 ml-0.5 block text-xs text-zinc-400">
          ${translateText("host_modal.bots")}:
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
          @change=${this.handleBotsChange}
          class="w-full"
          style=${`--val:${(this.bots / 400) * 100}%`}
          aria-valuemin="0"
          aria-valuemax="400"
          aria-valuenow=${String(this.bots)}
        />
      </div>
    `;
  }

  // ===== RIGHT: Advanced options (rules + units) =====
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
            ${[
              [
                "disableNPCs",
                "host_modal.disable_nations",
                this.disableNPCs,
                this.handleDisableNPCsChange.bind(this),
              ],
              [
                "instantBuild",
                "host_modal.instant_build",
                this.instantBuild,
                this.handleInstantBuildChange.bind(this),
              ],
              [
                "donateGold",
                "host_modal.donate_gold",
                this.donateGold,
                this.handleDonateGoldChange.bind(this),
              ],
              [
                "donateTroops",
                "host_modal.donate_troops",
                this.donateTroops,
                this.handleDonateTroopsChange.bind(this),
              ],
              [
                "infiniteGold",
                "host_modal.infinite_gold",
                this.infiniteGold,
                this.handleInfiniteGoldChange.bind(this),
              ],
              [
                "infiniteTroops",
                "host_modal.infinite_troops",
                this.infiniteTroops,
                this.handleInfiniteTroopsChange.bind(this),
              ],
              [
                "compactMap",
                "host_modal.compact_map",
                this.compactMap,
                this.handleCompactMapChange.bind(this),
              ],
            ].map(
              ([key, labelKey, checked, handler]) => html`
                <label class="option-card ${checked ? "selected" : ""}">
                  <div class="checkbox-icon"></div>
                  <input
                    type="checkbox"
                    .checked=${checked as boolean}
                    @change=${handler as any}
                  />
                  <div class="option-card-title">
                    ${translateText(labelKey as string)}
                  </div>
                </label>
              `,
            )}
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

  // ===== RIGHT: Whole right pane (summary, difficulty, mode, bots, adv + players/start) =====
  private renderSettingsPane() {
    return html`
      <section
        aria-label="Settings"
        class="min-h-0 flex flex-col gap-3 rounded-xl border border-white/15 bg-zinc-900/40 p-3 overflow-auto"
      >
        ${this.renderRightTopControls()} ${this.renderSettingsSummary()}
        ${this.renderDifficultyControls()} ${this.renderModeToggle()}
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
                    ? html`<span class="host-badge"
                        >(${translateText("host_modal.host_badge")})</span
                      >`
                    : html`<button
                        class="remove-player-btn"
                        @click=${() => this.kickPlayer(client.clientID)}
                        title="Remove ${client.username}"
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

          ${this.renderPresetsFooter()}
        </section>

        ${this.renderSliderStyles()}
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

    const preId = generateID();
    this.lobbyId = preId; // <- show URL immediately

    createLobby(this.lobbyCreatorClientID, preId)
      .then((lobby) => {
        // keep server's id if it echoes back (should match preId)
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
    // Clear any pending bot updates
    if (this.botsUpdateTimer !== null) {
      clearTimeout(this.botsUpdateTimer);
      this.botsUpdateTimer = null;
    }
  }

  private async handleRandomMapToggle() {
    this.useRandomMap = true;
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

  // Modified to include debouncing
  private handleBotsChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(value) || value < 0 || value > 400) {
      return;
    }

    // Update the display value immediately
    this.bots = value;

    // Clear any existing timer
    if (this.botsUpdateTimer !== null) {
      clearTimeout(this.botsUpdateTimer);
    }

    // Set a new timer to call putGameConfig after 300ms of inactivity
    this.botsUpdateTimer = window.setTimeout(() => {
      this.putGameConfig();
      this.botsUpdateTimer = null;
    }, 300);
  }

  private handleInstantBuildChange(e: Event) {
    this.instantBuild = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private handleInfiniteGoldChange(e: Event) {
    this.infiniteGold = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private handleDonateGoldChange(e: Event) {
    this.donateGold = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private handleInfiniteTroopsChange(e: Event) {
    this.infiniteTroops = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private handleCompactMapChange(e: Event) {
    this.compactMap = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private handleDonateTroopsChange(e: Event) {
    this.donateTroops = Boolean((e.target as HTMLInputElement).checked);
    this.putGameConfig();
  }

  private async handleDisableNPCsChange(e: Event) {
    this.disableNPCs = Boolean((e.target as HTMLInputElement).checked);
    console.log(`updating disable npcs to ${this.disableNPCs}`);
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

  private async copyToClipboard() {
    try {
      //TODO: Convert id to url and copy
      await navigator.clipboard.writeText(
        `${location.origin}/#join=${this.lobbyId}`,
      );
      this.copySuccess = true;
      setTimeout(() => {
        this.copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error(`Failed to copy text: ${err}`);
    }
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
