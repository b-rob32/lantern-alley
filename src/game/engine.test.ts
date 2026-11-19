import { describe, expect, it } from 'vitest';
import {
  BASE_OFFLINE_CAP_SECONDS,
  DISTRICTS,
  FESTIVAL_MIN_RUN_COINS,
  HEIRLOOMS,
  INGREDIENTS,
  STALLS,
} from './data';
import {
  buyHeirloom,
  buyPrep,
  buyStall,
  buyUpgrade,
  calculateOfflineProgress,
  claimCraving,
  createInitialState,
  exportSaveCode,
  getAllPrepMetrics,
  getAllStallMetrics,
  getBulkPurchase,
  getHeirloomCost,
  getNextFestivalThreshold,
  getPendingFestivalLanterns,
  getPrepCost,
  getStallCost,
  getTotalCoinsPerSec,
  getUpgradeMultipliers,
  hostFestival,
  importSaveCode,
  isIngredientUnlocked,
  isStallUnlocked,
  isUpgradeVisible,
  manualCookStall,
  manualPrep,
  selectOrUnlockDistrict,
  tapGoldenLantern,
  tickGame,
} from './engine';
import type { GameState } from './types';

const BASE_NOW = 1_700_000_000_000;

describe('Lantern Alley simulation engine', () => {
  describe('1. Initial state setup & starting metrics', () => {
    it('initializes starting resources, unlocks, cravings, patrons, and settings', () => {
      const state = createInitialState(BASE_NOW);

      expect(state.coins).toBe(15);
      expect(state.prepLevels).toEqual({
        charcoal: 1,
        broth: 0,
        dough: 0,
        tea: 0,
        sweetPaste: 0,
      });
      expect(state.stallLevels).toEqual({
        yakitori: 1,
        ramen: 0,
        dumplings: 0,
        boba: 0,
        taiyaki: 0,
        izakaya: 0,
      });
      expect(state.ingredients).toEqual({
        charcoal: 6,
        broth: 0,
        dough: 0,
        tea: 0,
        sweetPaste: 0,
      });
      expect(state.activeCravings).toHaveLength(2);
      for (const craving of state.activeCravings) {
        expect(craving.stallId).toBe('yakitori');
        expect(craving.targetDishes).toBeGreaterThan(0);
        expect(craving.deliveredDishes).toBe(0);
      }
      expect(state.metPatrons).toEqual(['haru']);
      expect(state.unlockedDistricts).toEqual(['lantern-alley']);
      expect(state.activeDistrict).toBe('lantern-alley');
      expect(state.settings).toEqual({ muted: true, haptics: true, bulkMode: '1' });
      expect(state.nextGoldenLanternAt).toBe(BASE_NOW + 30_000);
    });

    it('computes baseline multipliers and healthy starting metrics', () => {
      const state = createInitialState(BASE_NOW);
      const mult = getUpgradeMultipliers(state, BASE_NOW);
      expect(mult.globalValue).toBe(1);
      expect(mult.globalPrep).toBe(1);
      expect(mult.lanternCount).toBe(4);
      expect(mult.manualPower).toBe(1);
      expect(mult.offlineCapSeconds).toBe(BASE_OFFLINE_CAP_SECONDS);
      expect(mult.rushActive).toBe(false);
      expect(mult.activeRushMultiplier).toBe(1);

      const prepMetrics = getAllPrepMetrics(state, BASE_NOW);
      expect(prepMetrics.charcoal.productionPerSec).toBeCloseTo(INGREDIENTS.charcoal.baseRate, 6);
      expect(prepMetrics.charcoal.consumptionPerSec).toBeCloseTo(STALLS.yakitori.baseCookRate, 6);
      expect(prepMetrics.charcoal.netPerSec).toBeGreaterThan(0);
      expect(prepMetrics.charcoal.isBottleneck).toBe(false);

      const stallMetrics = getAllStallMetrics(state, BASE_NOW);
      expect(stallMetrics.yakitori.unlocked).toBe(true);
      expect(stallMetrics.yakitori.dishValue).toBeCloseTo(STALLS.yakitori.baseDishValue, 6);
      expect(stallMetrics.yakitori.efficiency).toBe(1);
      expect(stallMetrics.yakitori.bottlenecks).toEqual([]);
      expect(stallMetrics.yakitori.coinsPerSec).toBeCloseTo(
        STALLS.yakitori.baseCookRate * STALLS.yakitori.baseDishValue,
        6,
      );
      expect(getTotalCoinsPerSec(state, BASE_NOW)).toBeCloseTo(
        stallMetrics.yakitori.coinsPerSec,
        6,
      );

      expect(isIngredientUnlocked(state, 'charcoal')).toBe(true);
      expect(isIngredientUnlocked(state, 'broth')).toBe(false);
      expect(isStallUnlocked(state, 'yakitori')).toBe(true);
      expect(isStallUnlocked(state, 'ramen')).toBe(false);
      expect(isUpgradeVisible(state, 'lantern_string_1')).toBe(true);
      expect(isUpgradeVisible(state, 'tare_glaze')).toBe(false);
    });
  });

  describe('2. Two-tier supply chain tick', () => {
    it('prep generates charcoal, yakitori consumes it, earns coins, and updates cravings & stats without mutating input', () => {
      const initial = createInitialState(BASE_NOW);
      const snapshotCoins = initial.coins;
      const snapshotCharcoal = initial.ingredients.charcoal;

      const { state: afterTick, events } = tickGame(initial, 2, BASE_NOW + 2000);

      // Purity check: original state untouched
      expect(initial.coins).toBe(snapshotCoins);
      expect(initial.ingredients.charcoal).toBe(snapshotCharcoal);

      const expectedCharcoalAdded = INGREDIENTS.charcoal.baseRate * 2;
      const expectedDishes = STALLS.yakitori.baseCookRate * 2; // 1.1 dishes
      const expectedCoinsEarned = expectedDishes * STALLS.yakitori.baseDishValue;

      expect(afterTick.ingredients.charcoal).toBeCloseTo(
        snapshotCharcoal + expectedCharcoalAdded - expectedDishes,
        6,
      );
      expect(afterTick.coins).toBeCloseTo(snapshotCoins + expectedCoinsEarned, 6);
      expect(afterTick.runCoinsEarned).toBeCloseTo(expectedCoinsEarned, 6);
      expect(afterTick.stats.totalCoinsEarned).toBeCloseTo(expectedCoinsEarned, 6);
      expect(afterTick.stats.totalDishesServed).toBeCloseTo(expectedDishes, 6);
      expect(afterTick.stats.dishesByStall.yakitori).toBeCloseTo(expectedDishes, 6);
      expect(afterTick.stats.peakCoinsPerSec).toBeCloseTo(
        STALLS.yakitori.baseCookRate * STALLS.yakitori.baseDishValue,
        6,
      );

      for (const craving of afterTick.activeCravings) {
        expect(craving.deliveredDishes).toBeCloseTo(expectedDishes, 6);
      }

      // Crossing 1.0 whole dish should emit a dish_served visual event
      expect(events.some((e) => e.type === 'dish_served' && e.stallId === 'yakitori')).toBe(true);
    });

    it('clamps dtSeconds safely to [0, 5]', () => {
      const initial = createInitialState(BASE_NOW);
      const { state: negativeTick } = tickGame(initial, -10, BASE_NOW);
      expect(negativeTick.coins).toBe(initial.coins);

      const { state: hugeTick } = tickGame(initial, 999, BASE_NOW + 5000);
      const expectedDishes = STALLS.yakitori.baseCookRate * 5;
      expect(hugeTick.stats.totalDishesServed).toBeCloseTo(expectedDishes, 6);
    });
  });

  describe('3. Bottleneck detection when stall demand exceeds prep rate', () => {
    it('flags prep bottleneck and throttles stall efficiency when stock is low', () => {
      const base = createInitialState(BASE_NOW);
      const strained: GameState = {
        ...base,
        stallLevels: { ...base.stallLevels, yakitori: 4 }, // 4 * 0.55 = 2.2 charcoal/sec needed
        prepLevels: { ...base.prepLevels, charcoal: 1 }, // 0.85 charcoal/sec produced
        ingredients: { ...base.ingredients, charcoal: 0.4 }, // low stock (< 1.5)
      };

      const prepMetrics = getAllPrepMetrics(strained, BASE_NOW);
      expect(prepMetrics.charcoal.isBottleneck).toBe(true);
      expect(prepMetrics.charcoal.netPerSec).toBeLessThan(0);

      const stallMetrics = getAllStallMetrics(strained, BASE_NOW);
      expect(stallMetrics.yakitori.bottlenecks).toEqual(['charcoal']);
      expect(stallMetrics.yakitori.efficiency).toBeCloseTo(0.85 / 2.2, 4);
      expect(stallMetrics.yakitori.effectiveDishesPerSec).toBeCloseTo(0.85, 4);
      expect(stallMetrics.yakitori.coinsPerSec).toBeCloseTo(
        0.85 * stallMetrics.yakitori.dishValue,
        4,
      );
    });

    it('keeps stall at full efficiency while buffered stock is >= 1.5 even if prep net rate is negative', () => {
      const base = createInitialState(BASE_NOW);
      const buffered: GameState = {
        ...base,
        stallLevels: { ...base.stallLevels, yakitori: 4 },
        prepLevels: { ...base.prepLevels, charcoal: 1 },
        ingredients: { ...base.ingredients, charcoal: 10 },
      };

      const prepMetrics = getAllPrepMetrics(buffered, BASE_NOW);
      expect(prepMetrics.charcoal.isBottleneck).toBe(true);

      const stallMetrics = getAllStallMetrics(buffered, BASE_NOW);
      expect(stallMetrics.yakitori.bottlenecks).toEqual([]);
      expect(stallMetrics.yakitori.efficiency).toBe(1);
    });
  });

  describe('4. Bulk buy math (1, 10, max) and purchases', () => {
    it('computes exact costs for 1, 10, and max modes including unaffordable fallback', () => {
      const baseCost = INGREDIENTS.charcoal.baseCost;
      const growth = INGREDIENTS.charcoal.costGrowth;

      const one = getBulkPurchase(baseCost, growth, 1, 100, '1');
      expect(one).toEqual({
        count: 1,
        totalCost: getPrepCost('charcoal', 1),
        canAfford: true,
      });

      let expectedTenCost = 0;
      for (let i = 0; i < 10; i++) {
        expectedTenCost += getPrepCost('charcoal', 1 + i);
      }
      const ten = getBulkPurchase(baseCost, growth, 1, expectedTenCost, '10');
      expect(ten).toEqual({
        count: 10,
        totalCost: expectedTenCost,
        canAfford: true,
      });

      const tenShort = getBulkPurchase(baseCost, growth, 1, expectedTenCost - 1, '10');
      expect(tenShort.canAfford).toBe(false);
      expect(tenShort.count).toBe(10);

      // max mode when 3 levels are affordable
      const cost3 =
        getPrepCost('charcoal', 1) + getPrepCost('charcoal', 2) + getPrepCost('charcoal', 3);
      const max3 = getBulkPurchase(baseCost, growth, 1, cost3 + 1, 'max');
      expect(max3).toEqual({
        count: 3,
        totalCost: cost3,
        canAfford: true,
      });

      // max mode when 0 levels are affordable still returns count: 1 & next cost
      const maxNone = getBulkPurchase(baseCost, growth, 1, 5, 'max');
      expect(maxNone).toEqual({
        count: 1,
        totalCost: getPrepCost('charcoal', 1),
        canAfford: false,
      });
    });

    it('applies buyPrep, buyStall, and buyUpgrade accurately', () => {
      let state = createInitialState(BASE_NOW);
      state = { ...state, coins: 1000, runCoinsEarned: 1000 };

      const prepCost = getPrepCost('charcoal', 1);
      const afterPrep = buyPrep(state, 'charcoal', '1');
      expect(afterPrep.prepLevels.charcoal).toBe(2);
      expect(afterPrep.coins).toBe(1000 - prepCost);

      const stallCost = getStallCost('yakitori', 1);
      const stallResult = buyStall(afterPrep, 'yakitori', '1');
      expect(stallResult.bought).toBe(1);
      expect(stallResult.state.stallLevels.yakitori).toBe(2);
      expect(stallResult.state.coins).toBe(afterPrep.coins - stallCost);
      expect(stallResult.events).toHaveLength(1);
      expect(stallResult.events[0].type).toBe('stall_bought');

      const afterUpgrade = buyUpgrade(stallResult.state, 'lantern_string_1');
      expect(afterUpgrade.purchasedUpgrades).toContain('lantern_string_1');
      const mult = getUpgradeMultipliers(afterUpgrade, BASE_NOW);
      expect(mult.lanternCount).toBe(8);
      expect(mult.globalValue).toBeCloseTo(1.25, 6);
    });
  });

  describe('5. Manual prep & manual cook', () => {
    it('adds stock on manual prep and respects manual_power upgrades', () => {
      const base = createInitialState(BASE_NOW);
      const upgraded: GameState = {
        ...base,
        purchasedUpgrades: ['nimble_hands'],
      };

      const { state: afterPrep, gained, events } = manualPrep(upgraded, 'charcoal', BASE_NOW);
      expect(gained).toBeCloseTo(INGREDIENTS.charcoal.manualAmount * 2.5, 6);
      expect(afterPrep.ingredients.charcoal).toBeCloseTo(base.ingredients.charcoal + gained, 6);
      expect(afterPrep.stats.manualTaps).toBe(1);
      expect(events[0]?.type).toBe('manual_prep');
    });

    it('cooks dishes when ingredients are available and reports missingIngredient when starved', () => {
      const base = createInitialState(BASE_NOW);
      const { state: afterCook, earned, cooked, events } = manualCookStall(
        base,
        'yakitori',
        BASE_NOW,
      );

      expect(cooked).toBe(true);
      expect(earned).toBeCloseTo(STALLS.yakitori.baseDishValue, 6);
      expect(afterCook.ingredients.charcoal).toBeCloseTo(base.ingredients.charcoal - 1, 6);
      expect(afterCook.coins).toBeCloseTo(base.coins + earned, 6);
      expect(afterCook.stats.totalDishesServed).toBeCloseTo(1, 6);
      expect(afterCook.activeCravings[0].deliveredDishes).toBeCloseTo(1, 6);
      expect(events[0]?.type).toBe('dish_served');

      // Insufficient ingredient case
      const emptyState: GameState = {
        ...base,
        ingredients: { ...base.ingredients, charcoal: 0.2 },
      };
      const failed = manualCookStall(emptyState, 'yakitori', BASE_NOW);
      expect(failed.cooked).toBe(false);
      expect(failed.earned).toBe(0);
      expect(failed.missingIngredient).toBe('charcoal');
      expect(failed.events).toEqual([]);
      expect(failed.state).toBe(emptyState);
    });
  });

  describe('6. Craving completion, reward claim, and regular patron discovery', () => {
    it('claims completed cravings, awards coins/hype/rush, discovers new patrons, and generates replacements', () => {
      const base = createInitialState(BASE_NOW);
      const meiCraving = {
        id: 'craving_mei_test',
        patronId: 'mei',
        stallId: 'ramen' as const,
        targetDishes: 8,
        deliveredDishes: 8,
        rewardCoins: 350,
        rewardHype: 15,
        rushBonusSec: 8,
      };
      const readyState: GameState = {
        ...base,
        stallLevels: { ...base.stallLevels, ramen: 1 },
        activeCravings: [meiCraving, base.activeCravings[0]],
      };

      // Incomplete craving cannot be claimed
      const incomplete = claimCraving(readyState, base.activeCravings[0].id, BASE_NOW);
      expect(incomplete.claimed).toBe(false);

      // Completed craving claims cleanly
      const { state: claimedState, claimed, events } = claimCraving(
        readyState,
        meiCraving.id,
        BASE_NOW,
      );
      expect(claimed).toBe(true);
      expect(claimedState.coins).toBe(readyState.coins + 350);
      expect(claimedState.runCoinsEarned).toBe(readyState.runCoinsEarned + 350);
      expect(claimedState.hype).toBe(readyState.hype + 15);
      expect(claimedState.stats.cravingsCompleted).toBe(1);
      expect(claimedState.metPatrons).toContain('mei');
      expect(claimedState.rushEndsAt).toBe(BASE_NOW + 8_000);
      expect(claimedState.activeCravings).toHaveLength(2);
      expect(claimedState.activeCravings.some((c) => c.id === meiCraving.id)).toBe(false);
      expect(events[0]?.type).toBe('craving_claimed');
    });
  });

  describe('7. Golden lantern spawn, tap, and Night Rush', () => {
    it('spawns a golden lantern on schedule, awards coins and 2x Rush on tap, and expires Rush cleanly', () => {
      const initial = createInitialState(BASE_NOW);

      // Advance to spawn timestamp
      const spawnTime = BASE_NOW + 30_000;
      const { state: spawned } = tickGame(initial, 1, spawnTime);
      expect(spawned.goldenLantern).not.toBeNull();
      expect(spawned.goldenLantern!.xNorm).toBeGreaterThanOrEqual(0.16);
      expect(spawned.goldenLantern!.xNorm).toBeLessThanOrEqual(0.84);
      expect(spawned.goldenLantern!.expiresAt).toBe(spawnTime + 18_000);
      expect(spawned.nextGoldenLanternAt).toBeGreaterThanOrEqual(spawnTime + 40_000);
      expect(spawned.nextGoldenLanternAt).toBeLessThanOrEqual(spawnTime + 65_000);

      // Tap golden lantern
      const tapTime = spawnTime + 2_000;
      const cpsBefore = getTotalCoinsPerSec(spawned, tapTime);
      const {
        state: rushed,
        rewardCoins,
        rushSeconds,
        events,
      } = tapGoldenLantern(spawned, tapTime);

      expect(rushSeconds).toBe(20);
      expect(rewardCoins).toBe(Math.max(25, Math.floor(cpsBefore * 18)));
      expect(rushed.goldenLantern).toBeNull();
      expect(rushed.coins).toBeCloseTo(spawned.coins + rewardCoins, 6);
      expect(rushed.stats.goldenLanternsTapped).toBe(1);
      expect(rushed.rushEndsAt).toBe(tapTime + 20_000);
      expect(rushed.rushMultiplier).toBe(2);
      expect(events[0]?.type).toBe('golden_lantern');

      const rushMult = getUpgradeMultipliers(rushed, tapTime + 5_000);
      expect(rushMult.rushActive).toBe(true);
      expect(rushMult.activeRushMultiplier).toBe(2);
      expect(rushMult.globalValue).toBeCloseTo(2, 6);
      expect(rushMult.stallSpeed.yakitori).toBeCloseTo(2, 6);

      // Rush clears once expired
      const { state: afterRush } = tickGame(rushed, 1, tapTime + 25_000);
      expect(afterRush.rushEndsAt).toBe(0);
      expect(afterRush.rushMultiplier).toBe(1);
      expect(getUpgradeMultipliers(afterRush, tapTime + 25_000).rushActive).toBe(false);
    });
  });

  describe('8. Grand Night Festival prestige, heirlooms & districts', () => {
    it('calculates pending lanterns and exact next threshold accurately', () => {
      const base = createInitialState(BASE_NOW);
      expect(getPendingFestivalLanterns(base)).toBe(0);
      expect(getNextFestivalThreshold(base)).toBe(FESTIVAL_MIN_RUN_COINS);

      const atMin: GameState = { ...base, runCoinsEarned: FESTIVAL_MIN_RUN_COINS };
      expect(getPendingFestivalLanterns(atMin)).toBe(2);

      const nextThreshold = getNextFestivalThreshold(atMin);
      expect(getPendingFestivalLanterns({ ...base, runCoinsEarned: nextThreshold - 1 })).toBe(2);
      expect(getPendingFestivalLanterns({ ...base, runCoinsEarned: nextThreshold })).toBe(3);
    });

    it('awards Festival Lanterns, resets run state, preserves permanent progression, and grants starting coins heirloom', () => {
      const base = createInitialState(BASE_NOW);
      let state: GameState = {
        ...base,
        coins: 50_000,
        runCoinsEarned: 100_000, // 4 pending lanterns
        festivalLanterns: 10,
        totalFestivalLanternsEarned: 10,
        prepLevels: { ...base.prepLevels, charcoal: 12, broth: 5 },
        stallLevels: { ...base.stallLevels, yakitori: 10, ramen: 4 },
        purchasedUpgrades: ['lantern_string_1', 'tare_glaze'],
        metPatrons: ['haru', 'mei'],
        stats: {
          ...base.stats,
          totalCoinsEarned: 150_000,
          totalDishesServed: 500,
        },
      };

      // Buy Lucky Festival Coin Pouch heirloom & unlock Harbor Pier district
      const pouchCost = getHeirloomCost('festival_pouch', 0);
      expect(pouchCost).toBe(3);
      state = buyHeirloom(state, 'festival_pouch');
      expect(state.heirloomLevels.festival_pouch).toBe(1);
      expect(state.festivalLanterns).toBe(10 - pouchCost);

      state = selectOrUnlockDistrict(state, 'harbor-pier');
      expect(state.unlockedDistricts).toContain('harbor-pier');
      expect(state.activeDistrict).toBe('harbor-pier');
      expect(state.festivalLanterns).toBe(10 - pouchCost - DISTRICTS['harbor-pier'].unlockCost);

      const lanternsBeforePrestige = state.festivalLanterns;
      const pending = getPendingFestivalLanterns(state);
      expect(pending).toBe(4);

      const afterPrestige = hostFestival(state, BASE_NOW + 60_000);

      // Awarded lanterns & festival count
      expect(afterPrestige.festivalLanterns).toBe(lanternsBeforePrestige + pending);
      expect(afterPrestige.totalFestivalLanternsEarned).toBe(10 + pending);
      expect(afterPrestige.stats.festivalsHosted).toBe(1);

      // Starting coins include Lucky Festival Coin Pouch bonus (+500)
      expect(afterPrestige.coins).toBe(15 + 500);

      // Run state reset
      expect(afterPrestige.runCoinsEarned).toBe(0);
      expect(afterPrestige.purchasedUpgrades).toEqual([]);
      expect(afterPrestige.stallLevels.yakitori).toBe(1);
      expect(afterPrestige.stallLevels.ramen).toBe(0);
      expect(afterPrestige.prepLevels.charcoal).toBe(1);
      expect(afterPrestige.prepLevels.broth).toBe(0);
      expect(afterPrestige.ingredients.charcoal).toBe(6);

      // Permanent progression preserved
      expect(afterPrestige.heirloomLevels).toEqual({ festival_pouch: 1 });
      expect(afterPrestige.unlockedDistricts).toContain('harbor-pier');
      expect(afterPrestige.activeDistrict).toBe('harbor-pier');
      expect(afterPrestige.metPatrons).toEqual(['haru', 'mei']);
      expect(afterPrestige.stats.totalCoinsEarned).toBe(150_000);
      expect(afterPrestige.stats.totalDishesServed).toBe(500);

      // District bonus applies in new run
      const mult = getUpgradeMultipliers(afterPrestige, BASE_NOW + 60_000);
      expect(mult.globalValue).toBeCloseTo(DISTRICTS['harbor-pier'].valueMultiplier, 6);
      expect(mult.globalPrep).toBeCloseTo(DISTRICTS['harbor-pier'].prepMultiplier, 6);
    });
  });

  describe('9. Offline progress calculation & cap', () => {
    it('returns null summary under 60 seconds and caps at 12 hours by default', () => {
      const initial = createInitialState(BASE_NOW);

      const shortGap = calculateOfflineProgress(initial, BASE_NOW + 30_000);
      expect(shortGap.summary).toBeNull();
      expect(shortGap.state).toBe(initial);

      // 20 hours elapsed -> capped to 12 hours
      const twentyHoursLater = BASE_NOW + 20 * 3600 * 1000;
      const { state: afterOffline, summary } = calculateOfflineProgress(initial, twentyHoursLater);

      expect(summary).not.toBeNull();
      expect(summary!.elapsedSeconds).toBeCloseTo(20 * 3600, 4);
      expect(summary!.cappedSeconds).toBe(BASE_OFFLINE_CAP_SECONDS);

      const expectedDishes = STALLS.yakitori.baseCookRate * BASE_OFFLINE_CAP_SECONDS;
      const expectedCoins = expectedDishes * STALLS.yakitori.baseDishValue;
      expect(summary!.totalDishes).toBeCloseTo(expectedDishes, 2);
      expect(summary!.coinsEarned).toBeCloseTo(expectedCoins, 2);
      expect(afterOffline.coins).toBeCloseTo(initial.coins + expectedCoins, 2);
      expect(afterOffline.lastTickAt).toBe(twentyHoursLater);

      // Original state remains untouched
      expect(initial.coins).toBe(15);
    });

    it('extends offline cap with Night-Watch Lantern heirloom', () => {
      const nightWatch = HEIRLOOMS.find((h) => h.id === 'night_watch_lantern')!;
      const base = createInitialState(BASE_NOW);
      const withHeirloom: GameState = {
        ...base,
        heirloomLevels: { night_watch_lantern: 2 }, // +8h -> 20h cap
      };

      const twentyFourHoursLater = BASE_NOW + 24 * 3600 * 1000;
      const { summary } = calculateOfflineProgress(withHeirloom, twentyFourHoursLater);

      expect(summary).not.toBeNull();
      expect(summary!.cappedSeconds).toBe(BASE_OFFLINE_CAP_SECONDS + 2 * nightWatch.perLevelBonus);
      expect(summary!.cappedSeconds).toBe(20 * 3600);
    });
  });

  describe('10. Save export/import round-trip and validation', () => {
    it('exports with LA1: prefix and restores state cleanly on import', () => {
      let state = createInitialState(BASE_NOW);
      state = {
        ...state,
        coins: 12345.5,
        runCoinsEarned: 25000,
        festivalLanterns: 7,
        purchasedUpgrades: ['lantern_string_1', 'tare_glaze'],
        heirloomLevels: { golden_broth_scroll: 2 },
        unlockedDistricts: ['lantern-alley', 'harbor-pier'],
        activeDistrict: 'harbor-pier',
        metPatrons: ['haru', 'mei', 'kenji'],
        settings: { muted: false, haptics: false, bulkMode: '10' },
      };

      const code = exportSaveCode(state);
      expect(code.startsWith('LA1:')).toBe(true);

      const imported = importSaveCode(code, BASE_NOW + 5_000);
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.state.coins).toBe(12345.5);
        expect(imported.state.runCoinsEarned).toBe(25000);
        expect(imported.state.festivalLanterns).toBe(7);
        expect(imported.state.purchasedUpgrades).toEqual(['lantern_string_1', 'tare_glaze']);
        expect(imported.state.heirloomLevels).toEqual({ golden_broth_scroll: 2 });
        expect(imported.state.unlockedDistricts).toEqual(['lantern-alley', 'harbor-pier']);
        expect(imported.state.activeDistrict).toBe('harbor-pier');
        expect(imported.state.metPatrons).toEqual(['haru', 'mei', 'kenji']);
        expect(imported.state.settings).toEqual({ muted: false, haptics: false, bulkMode: '10' });
      }
    });

    it('merges missing optional keys safely and rejects invalid save codes', () => {
      const partialPayload = btoa(
        JSON.stringify({
          version: 1,
          coins: 99,
          ingredients: { charcoal: 12 },
          prepLevels: { charcoal: 2 },
          stallLevels: { yakitori: 2 },
        }),
      );
      const partialImport = importSaveCode(`LA1:${partialPayload}`, BASE_NOW);
      expect(partialImport.ok).toBe(true);
      if (partialImport.ok) {
        expect(partialImport.state.coins).toBe(99);
        expect(partialImport.state.ingredients.charcoal).toBe(12);
        expect(partialImport.state.ingredients.broth).toBe(0);
        expect(partialImport.state.activeDistrict).toBe('lantern-alley');
        expect(partialImport.state.activeCravings).toHaveLength(2);
      }

      // Invalid prefix
      expect(importSaveCode('BAD:abc').ok).toBe(false);
      // Empty payload
      expect(importSaveCode('LA1:').ok).toBe(false);
      // Malformed base64 / JSON
      expect(importSaveCode('LA1:!!!not-valid-base64!!!').ok).toBe(false);
      // Unsupported version
      const futureVersion = btoa(
        JSON.stringify({
          version: 999,
          coins: 10,
          ingredients: {},
          prepLevels: {},
          stallLevels: {},
        }),
      );
      expect(importSaveCode(`LA1:${futureVersion}`).ok).toBe(false);
      // Missing required fields
      const missingFields = btoa(JSON.stringify({ version: 1, coins: 10 }));
      expect(importSaveCode(`LA1:${missingFields}`).ok).toBe(false);
    });
  });
});
