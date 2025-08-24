import {
  AllianceRequest,
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Relation,
  Tick,
} from "../src/core/game/Game";
import { AllianceExtensionExecution } from "../src/core/execution/alliance/AllianceExtensionExecution";
import { BotBehavior } from "../src/core/execution/utils/BotBehavior";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

let game: Game;
let player: Player;
let requestor: Player;
let botBehavior: BotBehavior;

describe("BotBehavior.handleAllianceRequests", () => {
  beforeEach(async () => {
    game = await setup("big_plains", {
      infiniteGold: true,
      instantBuild: true,
    });

    const playerInfo = new PlayerInfo(
      "player_id",
      PlayerType.Bot,
      null,
      "player_id",
    );
    const requestorInfo = new PlayerInfo(
      "requestor_id",
      PlayerType.Human,
      null,
      "requestor_id",
    );

    game.addPlayer(playerInfo);
    game.addPlayer(requestorInfo);

    player = game.player("player_id");
    requestor = game.player("requestor_id");

    const random = new PseudoRandom(42);

    botBehavior = new BotBehavior(random, game, player, 0.5, 0.5, 0.2);
  });

  function setupAllianceRequest({
    isTraitor = false,
    relationDelta = 2,
    numTilesPlayer = 10,
    numTilesRequestor = 10,
    alliancesCount = 0,
  } = {}) {
    if (isTraitor) requestor.markTraitor();

    player.updateRelation(requestor, relationDelta);
    requestor.updateRelation(player, relationDelta);

    game.map().forEachTile((tile) => {
      if (game.map().isLand(tile)) {
        if (numTilesPlayer > 0) {
          player.conquer(tile);
          numTilesPlayer--;
        } else if (numTilesRequestor > 0) {
          requestor.conquer(tile);
          numTilesRequestor--;
        }
      }
    });

    jest
      .spyOn(requestor, "alliances")
      .mockReturnValue(new Array(alliancesCount));

    const mockRequest = {
      requestor: () => requestor,
      recipient: () => player,
      createdAt: () => 0 as unknown as Tick,
      accept: jest.fn(),
      reject: jest.fn(),
    } as unknown as AllianceRequest;

    jest
      .spyOn(player, "incomingAllianceRequests")
      .mockReturnValue([mockRequest]);

    return mockRequest;
  }

  test("should accept alliance when all conditions are met", () => {
    const request = setupAllianceRequest({});

    botBehavior.handleAllianceRequests();

    expect(request.accept).toHaveBeenCalled();
    expect(request.reject).not.toHaveBeenCalled();
  });

  test("should reject alliance if requestor is a traitor", () => {
    const request = setupAllianceRequest({ isTraitor: true });

    botBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });

  test("should reject alliance if relation is malicious", () => {
    const request = setupAllianceRequest({ relationDelta: -2 });

    botBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });

  test("should accept alliance if requestor is much larger (> 3 times size of recipient) and has too many alliances (>= 3)", () => {
    const request = setupAllianceRequest({
      numTilesRequestor: 40,
      alliancesCount: 4,
    });

    botBehavior.handleAllianceRequests();

    expect(request.accept).toHaveBeenCalled();
    expect(request.reject).not.toHaveBeenCalled();
  });

  test("should accept alliance if requestor is much larger (> 3 times size of recipient) and does not have too many alliances (< 3)", () => {
    const request = setupAllianceRequest({
      numTilesRequestor: 40,
      alliancesCount: 2,
    });

    botBehavior.handleAllianceRequests();

    expect(request.accept).toHaveBeenCalled();
    expect(request.reject).not.toHaveBeenCalled();
  });

  test("should reject alliance if requestor is acceptably small (<= 3 times size of recipient) and has too many alliances (>= 3)", () => {
    const request = setupAllianceRequest({ alliancesCount: 3 });

    botBehavior.handleAllianceRequests();

    expect(request.accept).not.toHaveBeenCalled();
    expect(request.reject).toHaveBeenCalled();
  });
});

describe("BotBehavior.handleAllianceExtensionRequests", () => {
  let mockGame: any;
  let mockPlayer: any;
  let mockAlliance: any;
  let mockHuman: any;
  let mockRandom: any;
  let botBehavior: BotBehavior;

  beforeEach(() => {
    mockGame = { addExecution: jest.fn() };
    mockHuman = { id: jest.fn(() => "human_id") };
    mockAlliance = {
      onlyOneAgreedToExtend: jest.fn(() => true),
      other: jest.fn(() => mockHuman),
    };
    mockRandom = { chance: jest.fn() };

    mockPlayer = {
      alliances: jest.fn(() => [mockAlliance]),
      relation: jest.fn(),
      id: jest.fn(() => "bot_id"),
      type: jest.fn(() => PlayerType.FakeHuman),
    };

    botBehavior = new BotBehavior(
      mockRandom,
      mockGame,
      mockPlayer,
      0.5,
      0.5,
      0.2,
    );
  });

  it("should NOT request extension if onlyOneAgreedToExtend is false (no expiration yet or both already agreed)", () => {
    mockAlliance.onlyOneAgreedToExtend.mockReturnValue(false);
    botBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).not.toHaveBeenCalled();
  });

  it("should always extend if type Bot", () => {
    mockPlayer.type.mockReturnValue(PlayerType.Bot);
    botBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).toHaveBeenCalledTimes(1);
    expect(mockGame.addExecution.mock.calls[0][0]).toBeInstanceOf(
      AllianceExtensionExecution,
    );
  });

  it("should always extend if Nation and relation is Friendly", () => {
    mockPlayer.relation.mockReturnValue(Relation.Friendly);
    botBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).toHaveBeenCalledTimes(1);
    expect(mockGame.addExecution.mock.calls[0][0]).toBeInstanceOf(
      AllianceExtensionExecution,
    );
  });

  it("should extend if Nation, relation is Neutral and random chance is true", () => {
    mockPlayer.relation.mockReturnValue(Relation.Neutral);
    mockRandom.chance.mockReturnValue(true);
    botBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).toHaveBeenCalledTimes(1);
    expect(mockGame.addExecution.mock.calls[0][0]).toBeInstanceOf(
      AllianceExtensionExecution,
    );
  });

  it("should NOT extend if Nation, relation is Neutral and random chance is false", () => {
    mockPlayer.relation.mockReturnValue(Relation.Neutral);
    mockRandom.chance.mockReturnValue(false);
    botBehavior.handleAllianceExtensionRequests();
    expect(mockGame.addExecution).not.toHaveBeenCalled();
  });
});

describe("BotBehavior Attack Behavior", () => {
  let game: Game;
  let bot: Player;
  let human: Player;
  let botBehavior: BotBehavior;

  beforeEach(async () => {
    game = await setup("big_plains", {
      infiniteGold: true,
      instantBuild: true,
      infiniteTroops: true,
    });

    const botInfo = new PlayerInfo("bot_test", PlayerType.Bot, null, "bot_test");
    const humanInfo = new PlayerInfo("human_test", PlayerType.Human, null, "human_test");

    game.addPlayer(botInfo);
    game.addPlayer(humanInfo);

    bot = game.player("bot_test");
    human = game.player("human_test");

    // Give both players some tiles and troops
    let tileCount = 0;
    game.map().forEachTile((tile) => {
      if (game.map().isLand(tile) && tileCount < 10) {
        if (tileCount % 2 === 0) {
          bot.conquer(tile);
        } else {
          human.conquer(tile);
        }
        tileCount++;
      }
    });

    bot.addTroops(1000);
    human.addTroops(1000);

    const random = new PseudoRandom(42);
    botBehavior = new BotBehavior(random, game, bot, 0.5, 0.5, 0.2);

    // Skip spawn phase
    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }
  });

  test("bot cannot attack allied player", () => {
    // Form alliance (bot creates request to human)
    const allianceRequest = bot.createAllianceRequest(human);
    allianceRequest?.accept();

    expect(bot.isAlliedWith(human)).toBe(true);
    expect(bot.isFriendly(human)).toBe(true);

    // Count attacks before
    const attacksBefore = bot.outgoingAttacks().length;

    // Bot tries to attack ally (should be blocked by your isFriendly check)
    botBehavior.sendAttack(human);

    game.executeNextTick();

    expect(human.incomingAttacks()).toHaveLength(0);
    // Should be same number of attacks (no new attack created)
    expect(bot.outgoingAttacks()).toHaveLength(attacksBefore);
  });

  test("nation cannot attack allied player", () => {
    // Create nation
    const nationInfo = new PlayerInfo("nation_test", PlayerType.FakeHuman, null, "nation_test");
    game.addPlayer(nationInfo);
    const nation = game.player("nation_test");

    let tilesAssigned = 0;

    game.map().forEachTile((tile) => {
      if (game.map().isLand(tile) && tilesAssigned < 20) {
        // Assign tiles round-robin style: bot, human, nation, bot, human, nation...
        if (tilesAssigned % 3 === 0) {
          bot.conquer(tile);
        } else if (tilesAssigned % 3 === 1) {
          human.conquer(tile);
        } else {
          nation.conquer(tile);
        }
        tilesAssigned++;
      }
    });

    nation.addTroops(1000);

    const nationBehavior = new BotBehavior(new PseudoRandom(42), game, nation, 0.5, 0.5, 0.2);

    // Alliance between nation and human
    const allianceRequest = nation.createAllianceRequest(human);
    allianceRequest?.accept();

    expect(nation.isAlliedWith(human)).toBe(true);

    const attacksBefore = nation.outgoingAttacks().length;

    // Nation tries to attack ally (should be blocked)
    nationBehavior.sendAttack(human);

    game.executeNextTick();

    expect(nation.outgoingAttacks()).toHaveLength(attacksBefore);
  });

  test("bot can attack unallied player", () => {
  // Ensure no alliance exists
    expect(bot.isAlliedWith(human)).toBe(false);
    expect(bot.isFriendly(human)).toBe(false);

    // FIX: Use addTroops instead of setTroops
    bot.addTroops(50000); // Add a lot of troops

    const attacksBefore = bot.outgoingAttacks().length;

    // Bot should be able to attack non-ally
    botBehavior.sendAttack(human);

    game.executeNextTick();

    // Should create new attack
    expect(bot.outgoingAttacks().length).toBeGreaterThan(attacksBefore);
  });

  test("bot can attack other unallied bot", () => {
    // Create another bot
    const bot2Info = new PlayerInfo("bot2", PlayerType.Bot, null, "bot2");
    game.addPlayer(bot2Info);
    const bot2 = game.player("bot2");

    // Give bot2 some tiles and troops
    let bot2Tiles = 0;
    game.map().forEachTile((tile) => {
      if (game.map().isLand(tile) && bot2Tiles < 3) {
        bot2.conquer(tile);
        bot2Tiles++;
      }
    });
    bot2.addTroops(1000);

    // FIX: Give the attacking bot MORE troops
    bot.addTroops(50000); // Add lots of troops to ensure attack happens

    // No alliance between bots
    expect(bot.isAlliedWith(bot2)).toBe(false);
    expect(bot.isFriendly(bot2)).toBe(false);

    const attacksBefore = bot.outgoingAttacks().length;

    // Bot should attack other bot
    botBehavior.sendAttack(bot2);
    game.executeNextTick();

    expect(bot.outgoingAttacks().length).toBeGreaterThan(attacksBefore);
  });

  test("bot can attack TerraNullius (expansion)", () => {
    const attacksBefore = bot.outgoingAttacks().length;

    // Bot should be able to expand to neutral territory
    botBehavior.sendAttack(game.terraNullius());

    game.executeNextTick();

    expect(bot.outgoingAttacks().length).toBeGreaterThan(attacksBefore);
  });
});
