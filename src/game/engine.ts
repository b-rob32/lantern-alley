import {
  BASE_OFFLINE_CAP_SECONDS,
  DISTRICTS,
  FESTIVAL_MIN_RUN_COINS,
  HEIRLOOMS,
  INGREDIENT_ORDER,
  INGREDIENTS,
  REGULAR_PATRONS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  STALL_ORDER,
  STALLS,
  UPGRADES,
} from './data';
import { formatCoins, formatStock } from './format';
import type {
  ActiveCraving,
  BulkMode,
  DistrictId,
  GameState,
  GoldenLanternState,
  IngredientId,
  LifetimeStats,
  OfflineSummary,
  PrepMetrics,
  StallId,
  StallMetrics,
  UpgradeDef,
  VisualEvent,
} from './types';

export interface UpgradeMultipliers {
  globalValue: number;
  globalPrep: number;
  stallValue: Record<StallId, number>;
  stallSpeed: Record<StallId, number>;
  prepSpeed: Record<IngredientId, number>;
  manualPower: number;
  lanternCount: number;
  cravingReward: number;
  offlineCapSeconds: number;
  startingCoins: number;
  rushActive: boolean;
  activeRushMultiplier: number;
}

export interface BulkPurchaseResult {
  count: number;
  totalCost: number;
  canAfford: boolean;
}

const INITIAL_COINS = 15;
const INITIAL_CHARCOAL_STOCK = 6;
const BASE_LANTERN_COUNT = 4;
const GOLDEN_LANTERN_INITIAL_DELAY_MS = 30_000;
const GOLDEN_LANTERN_DURATION_MS = 18_000;
const GOLDEN_LANTERN_MIN_INTERVAL_MS = 40_000;
const GOLDEN_LANTERN_MAX_INTERVAL_MS = 65_000;
const GOLDEN_LANTERN_RUSH_SECONDS = 20;
const GOLDEN_LANTERN_RUSH_MULTIPLIER = 2;
const CRAVING_RUSH_MULTIPLIER = 1.5;
const MAX_TICK_DT_SECONDS = 5;
const MIN_OFFLINE_SECONDS = 60;
const STALL_LEVEL_VALUE_BONUS = 0.12;
const SAVE_CODE_PREFIX = 'LA1:';

const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

const HEIRLOOM_MAP = Object.fromEntries(HEIRLOOMS.map((h) => [h.id, h]));

let nextVisualId = 1;
function allocateEventId(): number {
  return nextVisualId++;
}

function deterministicFloat(seedA: number, seedB: number, seedC: number): number {
  let h = (Math.imul(seedA | 0, 0x9e3779b1) ^ Math.imul(seedB | 0, 0x85ebca6b) ^ Math.imul(seedC | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}

function createZeroStallRecord(): Record<StallId, number> {
  return {
    yakitori: 0,
    ramen: 0,
    dumplings: 0,
    boba: 0,
    taiyaki: 0,
    izakaya: 0,
  };
}

function createOneStallRecord(): Record<StallId, number> {
  return {
    yakitori: 1,
    ramen: 1,
    dumplings: 1,
    boba: 1,
    taiyaki: 1,
    izakaya: 1,
  };
}

function createOneIngredientRecord(): Record<IngredientId, number> {
  return {
    charcoal: 1,
    broth: 1,
    dough: 1,
    tea: 1,
    sweetPaste: 1,
  };
}

function getStallLevelValueScale(level: number): number {
  return level > 0 ? 1 + (level - 1) * STALL_LEVEL_VALUE_BONUS : 1;
}

function getIngredientCap(productionPerSec: number): number {
  return Math.max(500, productionPerSec * 1800);
}

function getPatronForStall(stallId: StallId) {
  return REGULAR_PATRONS.find((p) => p.favoriteStall === stallId) ?? REGULAR_PATRONS[0];
}

function generateCraving(
  state: GameState,
  existing: ActiveCraving[],
  slotVariant: number,
  now: number,
): ActiveCraving {
  const builtStalls = STALL_ORDER.filter((id) => state.stallLevels[id] > 0);
  const unlockedStalls =
    builtStalls.length > 0
      ? builtStalls
      : STALL_ORDER.filter((id) => isStallUnlocked(state, id));
  const pool: StallId[] = unlockedStalls.length > 0 ? unlockedStalls : ['yakitori'];

  const existingStalls = new Set(existing.map((c) => c.stallId));
  const freshStalls = pool.filter((id) => !existingStalls.has(id));
  const unmetPatronStalls = (freshStalls.length > 0 ? freshStalls : pool).filter((id) => {
    const patron = getPatronForStall(id);
    return !state.metPatrons.includes(patron.id);
  });

  const candidatePool =
    unmetPatronStalls.length > 0
      ? unmetPatronStalls
      : freshStalls.length > 0
        ? freshStalls
        : pool;

  const pickIndex =
    Math.abs(state.stats.cravingsCompleted + existing.length + slotVariant) %
    candidatePool.length;
  const stallId = candidatePool[pickIndex];
  const patron = getPatronForStall(stallId);

  const mult = getUpgradeMultipliers(state, now);
  const def = STALLS[stallId];
  const effectiveLevel = Math.max(1, state.stallLevels[stallId]);
  const dishValue =
    def.baseDishValue *
    getStallLevelValueScale(effectiveLevel) *
    mult.globalValue *
    mult.stallValue[stallId];
  const potentialDishesPerSec = def.baseCookRate * effectiveLevel * mult.stallSpeed[stallId];

  const isLargerOrder = slotVariant % 2 === 1;
  const durationTargetSec = isLargerOrder ? 30 : 18;
  const targetDishes = Math.max(6, Math.round(potentialDishesPerSec * durationTargetSec));
  const coinBonusFactor = isLargerOrder ? 1.65 : 1.35;
  const rewardCoins = Math.max(
    25,
    Math.round(targetDishes * dishValue * coinBonusFactor * mult.cravingReward),
  );
  const rewardHype = Math.max(
    5,
    Math.round((isLargerOrder ? 14 : 8) * mult.cravingReward),
  );
  const rushBonusSec = isLargerOrder ? 8 : 0;

  return {
    id: `craving_${stallId}_${state.stats.cravingsCompleted}_${slotVariant}_${allocateEventId()}`,
    patronId: patron.id,
    stallId,
    targetDishes,
    deliveredDishes: 0,
    rewardCoins,
    rewardHype,
    rushBonusSec,
  };
}

function ensureTwoCravings(state: GameState, now: number): ActiveCraving[] {
  const cravings = state.activeCravings.map((c) => ({ ...c }));
  let variant = cravings.length;
  while (cravings.length < 2) {
    cravings.push(generateCraving(state, cravings, variant, now));
    variant += 1;
  }
  return cravings;
}

export function createInitialState(now: number = Date.now()): GameState {
  const baseState: GameState = {
    version: SAVE_VERSION,
    coins: INITIAL_COINS,
    runCoinsEarned: 0,
    hype: 0,
    festivalLanterns: 0,
    totalFestivalLanternsEarned: 0,

    ingredients: {
      charcoal: INITIAL_CHARCOAL_STOCK,
      broth: 0,
      dough: 0,
      tea: 0,
      sweetPaste: 0,
    },
    prepLevels: {
      charcoal: 1,
      broth: 0,
      dough: 0,
      tea: 0,
      sweetPaste: 0,
    },
    stallLevels: {
      yakitori: 1,
      ramen: 0,
      dumplings: 0,
      boba: 0,
      taiyaki: 0,
      izakaya: 0,
    },
    purchasedUpgrades: [],

    activeCravings: [],
    metPatrons: ['haru'],

    heirloomLevels: {},
    unlockedDistricts: ['lantern-alley'],
    activeDistrict: 'lantern-alley',

    rushMultiplier: 1,
    rushEndsAt: 0,
    goldenLantern: null,
    nextGoldenLanternAt: now + GOLDEN_LANTERN_INITIAL_DELAY_MS,

    stats: {
      totalCoinsEarned: 0,
      totalDishesServed: 0,
      dishesByStall: createZeroStallRecord(),
      peakCoinsPerSec: 0,
      festivalsHosted: 0,
      cravingsCompleted: 0,
      goldenLanternsTapped: 0,
      manualTaps: 0,
      startedAt: now,
    },

    settings: {
      muted: true,
      haptics: true,
      bulkMode: '1',
    },

    lastSavedAt: now,
    lastTickAt: now,
  };

  baseState.activeCravings = ensureTwoCravings(baseState, now);
  return baseState;
}

export function getUpgradeMultipliers(
  state: GameState,
  now: number = state.lastTickAt,
): UpgradeMultipliers {
  let globalValue = 1;
  let globalPrep = 1;
  const stallValue = createOneStallRecord();
  const stallSpeed = createOneStallRecord();
  const prepSpeed = createOneIngredientRecord();
  let manualPower = 1;
  let lanternCount = BASE_LANTERN_COUNT;
  let cravingReward = 1;
  let offlineCapSeconds = BASE_OFFLINE_CAP_SECONDS;
  let startingCoins = INITIAL_COINS;

  for (const upgradeId of state.purchasedUpgrades) {
    const def = UPGRADE_MAP[upgradeId];
    if (!def) continue;
    const effect = def.effect;
    switch (effect.type) {
      case 'stall_value':
        stallValue[effect.stallId] *= effect.multiplier;
        break;
      case 'stall_speed':
        stallSpeed[effect.stallId] *= effect.multiplier;
        break;
      case 'prep_speed':
        prepSpeed[effect.ingredientId] *= effect.multiplier;
        break;
      case 'all_value':
        globalValue *= effect.multiplier;
        break;
      case 'all_prep':
        globalPrep *= effect.multiplier;
        break;
      case 'manual_power':
        manualPower *= effect.multiplier;
        break;
      case 'lantern_count':
        lanternCount += effect.add;
        globalValue *= effect.valueMultiplier;
        break;
      case 'craving_reward':
        cravingReward *= effect.multiplier;
        break;
    }
  }

  const district = DISTRICTS[state.activeDistrict] ?? DISTRICTS['lantern-alley'];
  globalValue *= district.valueMultiplier;
  globalPrep *= district.prepMultiplier;

  for (const heirloom of HEIRLOOMS) {
    const level = state.heirloomLevels[heirloom.id] ?? 0;
    if (level <= 0) continue;
    switch (heirloom.effectType) {
      case 'global_value':
        globalValue *= 1 + level * heirloom.perLevelBonus;
        break;
      case 'prep_speed':
        globalPrep *= 1 + level * heirloom.perLevelBonus;
        break;
      case 'stall_speed': {
        const factor = 1 + level * heirloom.perLevelBonus;
        for (const stallId of STALL_ORDER) {
          stallSpeed[stallId] *= factor;
        }
        break;
      }
      case 'craving_boost':
        cravingReward *= 1 + level * heirloom.perLevelBonus;
        break;
      case 'starting_coins':
        startingCoins += level * heirloom.perLevelBonus;
        break;
      case 'offline_cap':
        offlineCapSeconds += level * heirloom.perLevelBonus;
        break;
    }
  }

  const rushActive = state.rushEndsAt > now && state.rushMultiplier > 1;
  const activeRushMultiplier = rushActive ? state.rushMultiplier : 1;
  if (rushActive) {
    globalValue *= activeRushMultiplier;
    for (const stallId of STALL_ORDER) {
      stallSpeed[stallId] *= activeRushMultiplier;
    }
  }

  return {
    globalValue,
    globalPrep,
    stallValue,
    stallSpeed,
    prepSpeed,
    manualPower,
    lanternCount,
    cravingReward,
    offlineCapSeconds,
    startingCoins,
    rushActive,
    activeRushMultiplier,
  };
}

export function getPrepCost(id: IngredientId, level: number): number {
  const def = INGREDIENTS[id];
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, Math.max(0, level)));
}

export function getStallCost(id: StallId, level: number): number {
  const def = STALLS[id];
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, Math.max(0, level)));
}

export function getBulkPurchase(
  baseCost: number,
  growth: number,
  currentLevel: number,
  coins: number,
  mode: BulkMode,
): BulkPurchaseResult {
  const level = Math.max(0, currentLevel);
  const costAt = (lvl: number): number => Math.floor(baseCost * Math.pow(growth, lvl));

  if (mode === '1') {
    const totalCost = costAt(level);
    return {
      count: 1,
      totalCost,
      canAfford: coins >= totalCost,
    };
  }

  if (mode === '10') {
    let totalCost = 0;
    for (let i = 0; i < 10; i++) {
      totalCost += costAt(level + i);
    }
    return {
      count: 10,
      totalCost,
      canAfford: coins >= totalCost,
    };
  }

  // mode === 'max'
  let count = 0;
  let totalCost = 0;
  const maxIterations = 500;
  while (count < maxIterations) {
    const nextCost = costAt(level + count);
    if (nextCost <= 0) break;
    if (totalCost + nextCost <= coins) {
      totalCost += nextCost;
      count += 1;
    } else {
      break;
    }
  }

  if (count === 0) {
    const nextCost = costAt(level);
    return {
      count: 1,
      totalCost: nextCost,
      canAfford: false,
    };
  }

  return {
    count,
    totalCost,
    canAfford: true,
  };
}

export function getHeirloomCost(heirloomId: string, currentLevel: number): number {
  const def = HEIRLOOM_MAP[heirloomId];
  if (!def) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.round(def.baseCost * Math.pow(def.costGrowth, Math.max(0, currentLevel))));
}

export function isIngredientUnlocked(state: GameState, id: IngredientId): boolean {
  const def = INGREDIENTS[id];
  return (
    state.prepLevels[id] > 0 ||
    state.runCoinsEarned >= def.unlockCoins ||
    state.stats.totalCoinsEarned >= def.unlockCoins
  );
}

export function isStallUnlocked(state: GameState, id: StallId): boolean {
  const def = STALLS[id];
  return (
    state.stallLevels[id] > 0 ||
    state.runCoinsEarned >= def.unlockCoins ||
    state.stats.totalCoinsEarned >= def.unlockCoins
  );
}

export function isUpgradeVisible(state: GameState, upgradeId: string): boolean {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return false;
  if (def.requiresStall && state.stallLevels[def.requiresStall.stallId] < def.requiresStall.level) {
    return false;
  }
  if (
    def.requiresPrep &&
    state.prepLevels[def.requiresPrep.ingredientId] < def.requiresPrep.level
  ) {
    return false;
  }
  if (
    def.requiresCoins !== undefined &&
    Math.max(state.runCoinsEarned, state.coins) < def.requiresCoins
  ) {
    return false;
  }
  return true;
}

export function getAllStallMetrics(
  state: GameState,
  now: number = state.lastTickAt,
): Record<StallId, StallMetrics> {
  const mult = getUpgradeMultipliers(state, now);

  const prodPerSec: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };
  const totalDemand: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };

  for (const id of INGREDIENT_ORDER) {
    prodPerSec[id] =
      INGREDIENTS[id].baseRate * state.prepLevels[id] * mult.globalPrep * mult.prepSpeed[id];
  }

  const prelim: Record<
    StallId,
    {
      level: number;
      unlocked: boolean;
      dishValue: number;
      potentialDishesPerSec: number;
      demandPerSec: Partial<Record<IngredientId, number>>;
    }
  > = {} as Record<
    StallId,
    {
      level: number;
      unlocked: boolean;
      dishValue: number;
      potentialDishesPerSec: number;
      demandPerSec: Partial<Record<IngredientId, number>>;
    }
  >;

  for (const stallId of STALL_ORDER) {
    const def = STALLS[stallId];
    const level = state.stallLevels[stallId];
    const unlocked = isStallUnlocked(state, stallId);
    const dishValue =
      def.baseDishValue *
      getStallLevelValueScale(level) *
      mult.globalValue *
      mult.stallValue[stallId];
    const potentialDishesPerSec =
      level > 0 ? def.baseCookRate * level * mult.stallSpeed[stallId] : 0;

    const demandPerSec: Partial<Record<IngredientId, number>> = {};
    if (level > 0) {
      for (const input of def.inputs) {
        const demand = potentialDishesPerSec * input.amount;
        demandPerSec[input.ingredientId] = demand;
        totalDemand[input.ingredientId] += demand;
      }
    }

    prelim[stallId] = {
      level,
      unlocked,
      dishValue,
      potentialDishesPerSec,
      demandPerSec,
    };
  }

  const supplyRatio: Record<IngredientId, number> = createOneIngredientRecord();
  const isStarved: Record<IngredientId, boolean> = {
    charcoal: false,
    broth: false,
    dough: false,
    tea: false,
    sweetPaste: false,
  };

  for (const id of INGREDIENT_ORDER) {
    if (totalDemand[id] > prodPerSec[id] + 0.0001 && state.ingredients[id] < 1.5) {
      supplyRatio[id] = totalDemand[id] > 0 ? Math.min(1, prodPerSec[id] / totalDemand[id]) : 1;
      isStarved[id] = true;
    }
  }

  const result = {} as Record<StallId, StallMetrics>;
  for (const stallId of STALL_ORDER) {
    const def = STALLS[stallId];
    const entry = prelim[stallId];
    if (entry.level <= 0) {
      result[stallId] = {
        stallId,
        level: 0,
        unlocked: entry.unlocked,
        dishValue: entry.dishValue,
        potentialDishesPerSec: 0,
        effectiveDishesPerSec: 0,
        coinsPerSec: 0,
        efficiency: 1,
        bottlenecks: [],
        demandPerSec: {},
      };
      continue;
    }

    let efficiency = 1;
    const bottlenecks: IngredientId[] = [];
    for (const input of def.inputs) {
      if (isStarved[input.ingredientId]) {
        bottlenecks.push(input.ingredientId);
        efficiency = Math.min(efficiency, supplyRatio[input.ingredientId]);
      }
    }

    const effectiveDishesPerSec = entry.potentialDishesPerSec * efficiency;
    const coinsPerSec = effectiveDishesPerSec * entry.dishValue;

    result[stallId] = {
      stallId,
      level: entry.level,
      unlocked: entry.unlocked,
      dishValue: entry.dishValue,
      potentialDishesPerSec: entry.potentialDishesPerSec,
      effectiveDishesPerSec,
      coinsPerSec,
      efficiency,
      bottlenecks,
      demandPerSec: entry.demandPerSec,
    };
  }

  return result;
}

export function getAllPrepMetrics(
  state: GameState,
  now: number = state.lastTickAt,
): Record<IngredientId, PrepMetrics> {
  const mult = getUpgradeMultipliers(state, now);
  const consumption: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };

  for (const stallId of STALL_ORDER) {
    const level = state.stallLevels[stallId];
    if (level <= 0) continue;
    const def = STALLS[stallId];
    const potentialDishesPerSec = def.baseCookRate * level * mult.stallSpeed[stallId];
    for (const input of def.inputs) {
      consumption[input.ingredientId] += potentialDishesPerSec * input.amount;
    }
  }

  const result = {} as Record<IngredientId, PrepMetrics>;
  for (const id of INGREDIENT_ORDER) {
    const def = INGREDIENTS[id];
    const level = state.prepLevels[id];
    const productionPerSec = def.baseRate * level * mult.globalPrep * mult.prepSpeed[id];
    const consumptionPerSec = consumption[id];
    const netPerSec = productionPerSec - consumptionPerSec;
    const manualAmount = def.manualAmount * mult.manualPower;
    const isBottleneck = consumptionPerSec > productionPerSec + 0.01;

    result[id] = {
      ingredientId: id,
      level,
      productionPerSec,
      consumptionPerSec,
      netPerSec,
      manualAmount,
      isBottleneck,
    };
  }

  return result;
}

export function getTotalCoinsPerSec(
  state: GameState,
  now: number = state.lastTickAt,
): number {
  const stallMetrics = getAllStallMetrics(state, now);
  let total = 0;
  for (const stallId of STALL_ORDER) {
    total += stallMetrics[stallId].coinsPerSec;
  }
  return total;
}

export function getPendingFestivalLanterns(state: GameState): number {
  if (state.runCoinsEarned < FESTIVAL_MIN_RUN_COINS) {
    return 0;
  }
  return Math.max(1, Math.floor(Math.sqrt(state.runCoinsEarned / FESTIVAL_MIN_RUN_COINS) * 2));
}

export function getNextFestivalThreshold(state: GameState): number {
  const pending = getPendingFestivalLanterns(state);
  if (pending === 0) {
    return FESTIVAL_MIN_RUN_COINS;
  }
  const targetLanterns = pending + 1;
  let threshold = Math.ceil(FESTIVAL_MIN_RUN_COINS * Math.pow(targetLanterns / 2, 2));
  while (Math.floor(Math.sqrt(threshold / FESTIVAL_MIN_RUN_COINS) * 2) < targetLanterns) {
    threshold += 1;
  }
  return threshold;
}

export function tickGame(
  state: GameState,
  dtSeconds: number,
  now?: number,
): { state: GameState; events: VisualEvent[] } {
  const dt = Number.isFinite(dtSeconds)
    ? Math.min(MAX_TICK_DT_SECONDS, Math.max(0, dtSeconds))
    : 0;
  const currentNow = now ?? state.lastTickAt + Math.round(dt * 1000);
  const events: VisualEvent[] = [];

  let rushEndsAt = state.rushEndsAt;
  let rushMultiplier = state.rushMultiplier;
  if (rushEndsAt > 0 && currentNow >= rushEndsAt) {
    rushEndsAt = 0;
    rushMultiplier = 1;
  }

  const rushCheckedState: GameState =
    rushEndsAt === state.rushEndsAt && rushMultiplier === state.rushMultiplier
      ? state
      : { ...state, rushEndsAt, rushMultiplier };

  const mult = getUpgradeMultipliers(rushCheckedState, currentNow);
  const ingredients: Record<IngredientId, number> = { ...state.ingredients };

  // 1. Advance Prep Stations
  for (const id of INGREDIENT_ORDER) {
    const level = state.prepLevels[id];
    if (level <= 0) continue;
    const prodPerSec = INGREDIENTS[id].baseRate * level * mult.globalPrep * mult.prepSpeed[id];
    const cap = getIngredientCap(prodPerSec);
    ingredients[id] = Math.min(cap, ingredients[id] + prodPerSec * dt);
  }

  // 2. Advance Stalls
  const dishesByStall: Record<StallId, number> = { ...state.stats.dishesByStall };
  const activeCravings: ActiveCraving[] = state.activeCravings.map((c) => ({ ...c }));

  let coinsEarned = 0;
  let totalDishesServedDelta = 0;
  let hypeEarned = 0;

  for (const stallId of STALL_ORDER) {
    const level = state.stallLevels[stallId];
    if (level <= 0) continue;
    const def = STALLS[stallId];
    const dishValue =
      def.baseDishValue *
      getStallLevelValueScale(level) *
      mult.globalValue *
      mult.stallValue[stallId];
    const potentialDishesPerSec = def.baseCookRate * level * mult.stallSpeed[stallId];
    const desiredDishes = potentialDishesPerSec * dt;
    if (desiredDishes <= 0) continue;

    let actualDishes = desiredDishes;
    for (const input of def.inputs) {
      if (input.amount > 0) {
        const availableRatio = Math.max(0, ingredients[input.ingredientId]) / input.amount;
        actualDishes = Math.min(actualDishes, availableRatio);
      }
    }

    if (actualDishes <= 0) continue;

    for (const input of def.inputs) {
      ingredients[input.ingredientId] = Math.max(
        0,
        ingredients[input.ingredientId] - actualDishes * input.amount,
      );
    }

    const earned = actualDishes * dishValue;
    coinsEarned += earned;
    totalDishesServedDelta += actualDishes;
    hypeEarned += actualDishes * 0.5;

    const prevDishes = dishesByStall[stallId];
    const nextDishes = prevDishes + actualDishes;
    dishesByStall[stallId] = nextDishes;

    for (const craving of activeCravings) {
      if (craving.stallId === stallId && craving.deliveredDishes < craving.targetDishes) {
        craving.deliveredDishes = Math.min(
          craving.targetDishes,
          craving.deliveredDishes + actualDishes,
        );
      }
    }

    // Throttle dish_served visual events cleanly at higher speeds
    const eventStride = Math.max(1, Math.ceil(potentialDishesPerSec / 1.5));
    if (Math.floor(nextDishes / eventStride) > Math.floor(prevDishes / eventStride)) {
      events.push({
        id: allocateEventId(),
        type: 'dish_served',
        stallId,
        label: `+${formatCoins(Math.max(1, dishValue))}`,
        color: def.accentColor,
      });
    }
  }

  // 3. Manage Golden Lantern lifecycle
  let goldenLantern: GoldenLanternState | null = state.goldenLantern
    ? { ...state.goldenLantern }
    : null;
  let nextGoldenLanternAt = state.nextGoldenLanternAt;

  if (goldenLantern && currentNow >= goldenLantern.expiresAt) {
    goldenLantern = null;
  }

  if (!goldenLantern && currentNow >= nextGoldenLanternAt) {
    const rPos = deterministicFloat(
      currentNow,
      state.stats.goldenLanternsTapped + 1,
      nextGoldenLanternAt,
    );
    const rDelay = deterministicFloat(
      nextGoldenLanternAt,
      currentNow,
      state.stats.goldenLanternsTapped + 7,
    );
    const xNorm = 0.16 + rPos * (0.84 - 0.16);
    const delayMs = Math.round(
      GOLDEN_LANTERN_MIN_INTERVAL_MS +
        rDelay * (GOLDEN_LANTERN_MAX_INTERVAL_MS - GOLDEN_LANTERN_MIN_INTERVAL_MS),
    );
    goldenLantern = {
      id: allocateEventId(),
      xNorm,
      expiresAt: currentNow + GOLDEN_LANTERN_DURATION_MS,
    };
    nextGoldenLanternAt = currentNow + delayMs;
  }

  const nextState: GameState = {
    ...state,
    coins: state.coins + coinsEarned,
    runCoinsEarned: state.runCoinsEarned + coinsEarned,
    hype: state.hype + hypeEarned,
    ingredients,
    activeCravings,
    rushEndsAt,
    rushMultiplier,
    goldenLantern,
    nextGoldenLanternAt,
    stats: {
      ...state.stats,
      totalCoinsEarned: state.stats.totalCoinsEarned + coinsEarned,
      totalDishesServed: state.stats.totalDishesServed + totalDishesServedDelta,
      dishesByStall,
    },
    lastTickAt: currentNow,
  };

  const currentCps = getTotalCoinsPerSec(nextState, currentNow);
  if (currentCps > nextState.stats.peakCoinsPerSec) {
    nextState.stats = {
      ...nextState.stats,
      peakCoinsPerSec: currentCps,
    };
  }

  if (nextState.activeCravings.length < 2) {
    nextState.activeCravings = ensureTwoCravings(nextState, currentNow);
  }

  return { state: nextState, events };
}

export function manualPrep(
  state: GameState,
  id: IngredientId,
  now: number = state.lastTickAt,
): { state: GameState; gained: number; events: VisualEvent[] } {
  if (!isIngredientUnlocked(state, id)) {
    return { state, gained: 0, events: [] };
  }

  const mult = getUpgradeMultipliers(state, now);
  const def = INGREDIENTS[id];
  const gained = def.manualAmount * mult.manualPower;
  const prodPerSec = def.baseRate * state.prepLevels[id] * mult.globalPrep * mult.prepSpeed[id];
  const cap = getIngredientCap(prodPerSec);

  const nextIngredients: Record<IngredientId, number> = {
    ...state.ingredients,
    [id]: Math.min(cap, state.ingredients[id] + gained),
  };

  const nextState: GameState = {
    ...state,
    ingredients: nextIngredients,
    stats: {
      ...state.stats,
      manualTaps: state.stats.manualTaps + 1,
    },
  };

  const events: VisualEvent[] = [
    {
      id: allocateEventId(),
      type: 'manual_prep',
      ingredientId: id,
      label: `+${formatStock(gained)} ${def.shortName}`,
      color: def.color,
    },
  ];

  return { state: nextState, gained, events };
}

export function manualCookStall(
  state: GameState,
  id: StallId,
  now: number = state.lastTickAt,
): {
  state: GameState;
  earned: number;
  cooked: boolean;
  missingIngredient?: IngredientId;
  events: VisualEvent[];
} {
  const level = state.stallLevels[id];
  if (level <= 0) {
    return { state, earned: 0, cooked: false, events: [] };
  }

  const def = STALLS[id];
  for (const input of def.inputs) {
    if (state.ingredients[input.ingredientId] + 1e-9 < input.amount) {
      return {
        state,
        earned: 0,
        cooked: false,
        missingIngredient: input.ingredientId,
        events: [],
      };
    }
  }

  const mult = getUpgradeMultipliers(state, now);
  const desiredCount = Math.max(1, mult.manualPower);
  let maxAffordable = desiredCount;
  for (const input of def.inputs) {
    if (input.amount > 0) {
      maxAffordable = Math.min(maxAffordable, state.ingredients[input.ingredientId] / input.amount);
    }
  }
  const dishesToCook = Math.max(1, maxAffordable);

  const ingredients: Record<IngredientId, number> = { ...state.ingredients };
  for (const input of def.inputs) {
    ingredients[input.ingredientId] = Math.max(
      0,
      ingredients[input.ingredientId] - dishesToCook * input.amount,
    );
  }

  const dishValue =
    def.baseDishValue *
    getStallLevelValueScale(level) *
    mult.globalValue *
    mult.stallValue[id];
  const earned = dishesToCook * dishValue;

  const activeCravings = state.activeCravings.map((c) =>
    c.stallId === id && c.deliveredDishes < c.targetDishes
      ? { ...c, deliveredDishes: Math.min(c.targetDishes, c.deliveredDishes + dishesToCook) }
      : { ...c },
  );

  const dishesByStall: Record<StallId, number> = {
    ...state.stats.dishesByStall,
    [id]: state.stats.dishesByStall[id] + dishesToCook,
  };

  const nextState: GameState = {
    ...state,
    coins: state.coins + earned,
    runCoinsEarned: state.runCoinsEarned + earned,
    hype: state.hype + dishesToCook,
    ingredients,
    activeCravings,
    stats: {
      ...state.stats,
      totalCoinsEarned: state.stats.totalCoinsEarned + earned,
      totalDishesServed: state.stats.totalDishesServed + dishesToCook,
      dishesByStall,
      manualTaps: state.stats.manualTaps + 1,
    },
  };

  const events: VisualEvent[] = [
    {
      id: allocateEventId(),
      type: 'dish_served',
      stallId: id,
      label: `+${formatCoins(earned)}`,
      color: def.accentColor,
    },
  ];

  return { state: nextState, earned, cooked: true, events };
}

export function buyPrep(state: GameState, id: IngredientId, mode?: BulkMode): GameState {
  if (!isIngredientUnlocked(state, id)) {
    return state;
  }
  const def = INGREDIENTS[id];
  const purchaseMode = mode ?? state.settings.bulkMode;
  const purchase = getBulkPurchase(
    def.baseCost,
    def.costGrowth,
    state.prepLevels[id],
    state.coins,
    purchaseMode,
  );
  if (!purchase.canAfford || purchase.count <= 0) {
    return state;
  }

  return {
    ...state,
    coins: state.coins - purchase.totalCost,
    prepLevels: {
      ...state.prepLevels,
      [id]: state.prepLevels[id] + purchase.count,
    },
  };
}

export function buyStall(
  state: GameState,
  id: StallId,
  mode?: BulkMode,
): { state: GameState; bought: number; events: VisualEvent[] } {
  if (!isStallUnlocked(state, id)) {
    return { state, bought: 0, events: [] };
  }
  const def = STALLS[id];
  const purchaseMode = mode ?? state.settings.bulkMode;
  const currentLevel = state.stallLevels[id];
  const purchase = getBulkPurchase(
    def.baseCost,
    def.costGrowth,
    currentLevel,
    state.coins,
    purchaseMode,
  );
  if (!purchase.canAfford || purchase.count <= 0) {
    return { state, bought: 0, events: [] };
  }

  const nextLevel = currentLevel + purchase.count;
  const nextState: GameState = {
    ...state,
    coins: state.coins - purchase.totalCost,
    stallLevels: {
      ...state.stallLevels,
      [id]: nextLevel,
    },
  };

  const events: VisualEvent[] = [
    {
      id: allocateEventId(),
      type: 'stall_bought',
      stallId: id,
      label: currentLevel === 0 ? `${def.name} Open!` : `Lv.${nextLevel}`,
      color: def.accentColor,
    },
  ];

  return { state: nextState, bought: purchase.count, events };
}

export function buyUpgrade(state: GameState, upgradeId: string): GameState {
  if (state.purchasedUpgrades.includes(upgradeId)) {
    return state;
  }
  const def = UPGRADE_MAP[upgradeId];
  if (!def || !isUpgradeVisible(state, upgradeId)) {
    return state;
  }
  if (state.coins < def.cost) {
    return state;
  }

  return {
    ...state,
    coins: state.coins - def.cost,
    purchasedUpgrades: [...state.purchasedUpgrades, upgradeId],
  };
}

export function claimCraving(
  state: GameState,
  cravingId: string,
  now: number = state.lastTickAt,
): { state: GameState; claimed: boolean; events: VisualEvent[] } {
  const index = state.activeCravings.findIndex((c) => c.id === cravingId);
  if (index === -1) {
    return { state, claimed: false, events: [] };
  }

  const craving = state.activeCravings[index];
  if (craving.deliveredDishes + 1e-6 < craving.targetDishes) {
    return { state, claimed: false, events: [] };
  }

  const remaining = state.activeCravings
    .filter((c) => c.id !== cravingId)
    .map((c) => ({ ...c }));

  const metPatrons = state.metPatrons.includes(craving.patronId)
    ? [...state.metPatrons]
    : [...state.metPatrons, craving.patronId];

  let rushEndsAt = state.rushEndsAt;
  let rushMultiplier = state.rushMultiplier;
  if (craving.rushBonusSec > 0) {
    const isCurrentlyActive = rushEndsAt > now && rushMultiplier > 1;
    const baseEnd = isCurrentlyActive ? rushEndsAt : now;
    rushEndsAt = baseEnd + craving.rushBonusSec * 1000;
    rushMultiplier = isCurrentlyActive
      ? Math.max(rushMultiplier, CRAVING_RUSH_MULTIPLIER)
      : CRAVING_RUSH_MULTIPLIER;
  }

  const intermediateState: GameState = {
    ...state,
    coins: state.coins + craving.rewardCoins,
    runCoinsEarned: state.runCoinsEarned + craving.rewardCoins,
    hype: state.hype + craving.rewardHype,
    activeCravings: remaining,
    metPatrons,
    rushEndsAt,
    rushMultiplier,
    stats: {
      ...state.stats,
      totalCoinsEarned: state.stats.totalCoinsEarned + craving.rewardCoins,
      cravingsCompleted: state.stats.cravingsCompleted + 1,
    },
  };

  const replacement = generateCraving(
    intermediateState,
    remaining,
    intermediateState.stats.cravingsCompleted + index,
    now,
  );
  const nextCravings = [...remaining];
  nextCravings.splice(Math.min(index, nextCravings.length), 0, replacement);

  const nextState: GameState = {
    ...intermediateState,
    activeCravings: nextCravings,
  };

  const events: VisualEvent[] = [
    {
      id: allocateEventId(),
      type: 'craving_claimed',
      stallId: craving.stallId,
      label: `+${formatCoins(craving.rewardCoins)}`,
      color: '#fbbf24',
    },
  ];

  return { state: nextState, claimed: true, events };
}

export function tapGoldenLantern(
  state: GameState,
  now: number = state.lastTickAt,
): { state: GameState; rewardCoins: number; rushSeconds: number; events: VisualEvent[] } {
  if (!state.goldenLantern || now >= state.goldenLantern.expiresAt) {
    return { state, rewardCoins: 0, rushSeconds: 0, events: [] };
  }

  const cps = getTotalCoinsPerSec(state, now);
  const rewardCoins = Math.max(25, Math.floor(cps * 18));
  const rushSeconds = GOLDEN_LANTERN_RUSH_SECONDS;

  const isCurrentlyActive = state.rushEndsAt > now && state.rushMultiplier > 1;
  const baseEnd = isCurrentlyActive ? state.rushEndsAt : now;
  const rushEndsAt = baseEnd + rushSeconds * 1000;
  const rushMultiplier = isCurrentlyActive
    ? Math.max(state.rushMultiplier, GOLDEN_LANTERN_RUSH_MULTIPLIER)
    : GOLDEN_LANTERN_RUSH_MULTIPLIER;

  const nextState: GameState = {
    ...state,
    coins: state.coins + rewardCoins,
    runCoinsEarned: state.runCoinsEarned + rewardCoins,
    goldenLantern: null,
    rushEndsAt,
    rushMultiplier,
    stats: {
      ...state.stats,
      totalCoinsEarned: state.stats.totalCoinsEarned + rewardCoins,
      goldenLanternsTapped: state.stats.goldenLanternsTapped + 1,
    },
  };

  const events: VisualEvent[] = [
    {
      id: allocateEventId(),
      type: 'golden_lantern',
      label: `+${formatCoins(rewardCoins)} · 2x Rush!`,
      color: '#fde047',
    },
  ];

  return { state: nextState, rewardCoins, rushSeconds, events };
}

export function hostFestival(
  state: GameState,
  now: number = state.lastTickAt > 0 ? state.lastTickAt : Date.now(),
): GameState {
  const pending = getPendingFestivalLanterns(state);
  if (pending <= 0) {
    return state;
  }

  const mult = getUpgradeMultipliers(state, now);
  const fresh = createInitialState(now);

  const prestiged: GameState = {
    ...fresh,
    coins: mult.startingCoins,
    festivalLanterns: state.festivalLanterns + pending,
    totalFestivalLanternsEarned: state.totalFestivalLanternsEarned + pending,
    heirloomLevels: { ...state.heirloomLevels },
    unlockedDistricts: [...state.unlockedDistricts],
    activeDistrict: state.activeDistrict,
    metPatrons: [...state.metPatrons],
    settings: { ...state.settings },
    stats: {
      ...state.stats,
      dishesByStall: { ...state.stats.dishesByStall },
      festivalsHosted: state.stats.festivalsHosted + 1,
    },
    activeCravings: [],
  };

  prestiged.activeCravings = ensureTwoCravings(prestiged, now);
  return prestiged;
}

export function buyHeirloom(state: GameState, heirloomId: string): GameState {
  const def = HEIRLOOM_MAP[heirloomId];
  if (!def) return state;

  const currentLevel = state.heirloomLevels[heirloomId] ?? 0;
  if (currentLevel >= def.maxLevel) {
    return state;
  }

  const cost = getHeirloomCost(heirloomId, currentLevel);
  if (state.festivalLanterns < cost) {
    return state;
  }

  return {
    ...state,
    festivalLanterns: state.festivalLanterns - cost,
    heirloomLevels: {
      ...state.heirloomLevels,
      [heirloomId]: currentLevel + 1,
    },
  };
}

export function selectOrUnlockDistrict(state: GameState, districtId: DistrictId): GameState {
  const def = DISTRICTS[districtId];
  if (!def) return state;

  if (state.unlockedDistricts.includes(districtId)) {
    if (state.activeDistrict === districtId) {
      return state;
    }
    return {
      ...state,
      activeDistrict: districtId,
    };
  }

  if (state.festivalLanterns < def.unlockCost) {
    return state;
  }

  return {
    ...state,
    festivalLanterns: state.festivalLanterns - def.unlockCost,
    unlockedDistricts: [...state.unlockedDistricts, districtId],
    activeDistrict: districtId,
  };
}

export function calculateOfflineProgress(
  state: GameState,
  now: number,
): { state: GameState; summary: OfflineSummary | null } {
  const referenceTime = state.lastTickAt || state.lastSavedAt || now;
  const elapsedSeconds = Math.max(0, (now - referenceTime) / 1000);
  if (elapsedSeconds < MIN_OFFLINE_SECONDS) {
    return { state, summary: null };
  }

  // Evaluate offline equilibrium without temporary Rush boosts
  const offlineBaselineState: GameState = {
    ...state,
    rushEndsAt: 0,
    rushMultiplier: 1,
  };
  const mult = getUpgradeMultipliers(offlineBaselineState, now);
  const cappedSeconds = Math.min(elapsedSeconds, mult.offlineCapSeconds);

  const prodPerSec: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };
  const totalAvailable: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };
  const totalDemand: Record<IngredientId, number> = {
    charcoal: 0,
    broth: 0,
    dough: 0,
    tea: 0,
    sweetPaste: 0,
  };

  for (const id of INGREDIENT_ORDER) {
    prodPerSec[id] =
      INGREDIENTS[id].baseRate * state.prepLevels[id] * mult.globalPrep * mult.prepSpeed[id];
    totalAvailable[id] = Math.max(0, state.ingredients[id]) + prodPerSec[id] * cappedSeconds;
  }

  const desiredByStall: Record<StallId, number> = createZeroStallRecord();
  for (const stallId of STALL_ORDER) {
    const level = state.stallLevels[stallId];
    if (level <= 0) continue;
    const def = STALLS[stallId];
    const desired = def.baseCookRate * level * mult.stallSpeed[stallId] * cappedSeconds;
    desiredByStall[stallId] = desired;
    for (const input of def.inputs) {
      totalDemand[input.ingredientId] += desired * input.amount;
    }
  }

  const ingredientRatio: Record<IngredientId, number> = createOneIngredientRecord();
  for (const id of INGREDIENT_ORDER) {
    if (totalDemand[id] > 0) {
      ingredientRatio[id] = Math.min(1, totalAvailable[id] / totalDemand[id]);
    }
  }

  const remainingIngredients: Record<IngredientId, number> = { ...totalAvailable };
  const nextDishesByStall: Record<StallId, number> = { ...state.stats.dishesByStall };
  const activeCravings: ActiveCraving[] = state.activeCravings.map((c) => ({ ...c }));
  const summaryDishesByStall: Partial<Record<StallId, number>> = {};

  let coinsEarned = 0;
  let totalDishes = 0;

  for (const stallId of STALL_ORDER) {
    const level = state.stallLevels[stallId];
    const desired = desiredByStall[stallId];
    if (level <= 0 || desired <= 0) continue;
    const def = STALLS[stallId];

    let stallRatio = 1;
    for (const input of def.inputs) {
      stallRatio = Math.min(stallRatio, ingredientRatio[input.ingredientId]);
    }

    const dishes = desired * stallRatio;
    if (dishes <= 0) continue;

    for (const input of def.inputs) {
      remainingIngredients[input.ingredientId] = Math.max(
        0,
        remainingIngredients[input.ingredientId] - dishes * input.amount,
      );
    }

    const dishValue =
      def.baseDishValue *
      getStallLevelValueScale(level) *
      mult.globalValue *
      mult.stallValue[stallId];
    coinsEarned += dishes * dishValue;
    totalDishes += dishes;
    summaryDishesByStall[stallId] = dishes;
    nextDishesByStall[stallId] += dishes;

    for (const craving of activeCravings) {
      if (craving.stallId === stallId && craving.deliveredDishes < craving.targetDishes) {
        craving.deliveredDishes = Math.min(
          craving.targetDishes,
          craving.deliveredDishes + dishes,
        );
      }
    }
  }

  const finalIngredients: Record<IngredientId, number> = { ...state.ingredients };
  for (const id of INGREDIENT_ORDER) {
    const cap = getIngredientCap(prodPerSec[id]);
    finalIngredients[id] = Math.min(cap, Math.max(0, remainingIngredients[id]));
  }

  const rushStillActive = state.rushEndsAt > now && state.rushMultiplier > 1;
  const goldenStillActive = state.goldenLantern !== null && now < state.goldenLantern.expiresAt;

  const nextState: GameState = {
    ...state,
    coins: state.coins + coinsEarned,
    runCoinsEarned: state.runCoinsEarned + coinsEarned,
    hype: state.hype + totalDishes * 0.5,
    ingredients: finalIngredients,
    activeCravings,
    rushEndsAt: rushStillActive ? state.rushEndsAt : 0,
    rushMultiplier: rushStillActive ? state.rushMultiplier : 1,
    goldenLantern: goldenStillActive && state.goldenLantern ? { ...state.goldenLantern } : null,
    nextGoldenLanternAt: Math.max(state.nextGoldenLanternAt, now + GOLDEN_LANTERN_INITIAL_DELAY_MS),
    stats: {
      ...state.stats,
      totalCoinsEarned: state.stats.totalCoinsEarned + coinsEarned,
      totalDishesServed: state.stats.totalDishesServed + totalDishes,
      dishesByStall: nextDishesByStall,
    },
    lastSavedAt: now,
    lastTickAt: now,
  };

  const summary: OfflineSummary = {
    elapsedSeconds,
    cappedSeconds,
    coinsEarned,
    totalDishes,
    dishesByStall: summaryDishesByStall,
  };

  return { state: nextState, summary };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, fallback: number, min: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(min, value);
  }
  return fallback;
}

function readInteger(value: unknown, fallback: number, min: number = 0): number {
  return Math.floor(readFiniteNumber(value, fallback, min));
}

function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DISTRICTS, value);
}

function isStallId(value: unknown): value is StallId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STALLS, value);
}

function isBulkMode(value: unknown): value is BulkMode {
  return value === '1' || value === '10' || value === 'max';
}

function hydrateState(
  raw: unknown,
  now: number,
): { ok: true; state: GameState } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Save payload must be a JSON object.' };
  }

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1 || version > SAVE_VERSION) {
    return { ok: false, error: 'Unsupported or missing save version.' };
  }

  if (typeof raw.coins !== 'number' || !Number.isFinite(raw.coins)) {
    return { ok: false, error: 'Missing or invalid coins field.' };
  }

  if (!isPlainObject(raw.stallLevels) || !isPlainObject(raw.prepLevels) || !isPlainObject(raw.ingredients)) {
    return { ok: false, error: 'Missing core market state fields.' };
  }

  const base = createInitialState(now);

  const ingredients: Record<IngredientId, number> = { ...base.ingredients };
  const prepLevels: Record<IngredientId, number> = { ...base.prepLevels };
  for (const id of INGREDIENT_ORDER) {
    ingredients[id] = readFiniteNumber(raw.ingredients[id], base.ingredients[id], 0);
    prepLevels[id] = readInteger(raw.prepLevels[id], base.prepLevels[id], 0);
  }

  const stallLevels: Record<StallId, number> = { ...base.stallLevels };
  for (const id of STALL_ORDER) {
    stallLevels[id] = readInteger(raw.stallLevels[id], base.stallLevels[id], 0);
  }

  const purchasedUpgrades = Array.isArray(raw.purchasedUpgrades)
    ? Array.from(
        new Set(
          raw.purchasedUpgrades.filter(
            (id): id is string => typeof id === 'string' && Boolean(UPGRADE_MAP[id]),
          ),
        ),
      )
    : [];

  const heirloomLevels: Record<string, number> = {};
  if (isPlainObject(raw.heirloomLevels)) {
    for (const heirloom of HEIRLOOMS) {
      const lvl = readInteger(raw.heirloomLevels[heirloom.id], 0, 0);
      if (lvl > 0) {
        heirloomLevels[heirloom.id] = Math.min(heirloom.maxLevel, lvl);
      }
    }
  }

  const unlockedSet = new Set<DistrictId>(['lantern-alley']);
  if (Array.isArray(raw.unlockedDistricts)) {
    for (const d of raw.unlockedDistricts) {
      if (isDistrictId(d)) {
        unlockedSet.add(d);
      }
    }
  }
  const unlockedDistricts = Array.from(unlockedSet);
  const activeDistrict: DistrictId =
    isDistrictId(raw.activeDistrict) && unlockedSet.has(raw.activeDistrict)
      ? raw.activeDistrict
      : 'lantern-alley';

  const validPatronIds = new Set(REGULAR_PATRONS.map((p) => p.id));
  const metPatronsSet = new Set<string>(['haru']);
  if (Array.isArray(raw.metPatrons)) {
    for (const p of raw.metPatrons) {
      if (typeof p === 'string' && validPatronIds.has(p)) {
        metPatronsSet.add(p);
      }
    }
  }

  const rawStats = isPlainObject(raw.stats) ? raw.stats : {};
  const rawDishesByStall = isPlainObject(rawStats.dishesByStall) ? rawStats.dishesByStall : {};
  const dishesByStall = createZeroStallRecord();
  for (const id of STALL_ORDER) {
    dishesByStall[id] = readFiniteNumber(rawDishesByStall[id], 0, 0);
  }

  const stats: LifetimeStats = {
    totalCoinsEarned: readFiniteNumber(rawStats.totalCoinsEarned, 0, 0),
    totalDishesServed: readFiniteNumber(rawStats.totalDishesServed, 0, 0),
    dishesByStall,
    peakCoinsPerSec: readFiniteNumber(rawStats.peakCoinsPerSec, 0, 0),
    festivalsHosted: readInteger(rawStats.festivalsHosted, 0, 0),
    cravingsCompleted: readInteger(rawStats.cravingsCompleted, 0, 0),
    goldenLanternsTapped: readInteger(rawStats.goldenLanternsTapped, 0, 0),
    manualTaps: readInteger(rawStats.manualTaps, 0, 0),
    startedAt: readFiniteNumber(rawStats.startedAt, now, 0),
  };

  const rawSettings = isPlainObject(raw.settings) ? raw.settings : {};
  const settings = {
    muted: typeof rawSettings.muted === 'boolean' ? rawSettings.muted : base.settings.muted,
    haptics:
      typeof rawSettings.haptics === 'boolean' ? rawSettings.haptics : base.settings.haptics,
    bulkMode: isBulkMode(rawSettings.bulkMode) ? rawSettings.bulkMode : base.settings.bulkMode,
  };

  const activeCravings: ActiveCraving[] = [];
  if (Array.isArray(raw.activeCravings)) {
    for (const entry of raw.activeCravings) {
      if (!isPlainObject(entry)) continue;
      if (typeof entry.id !== 'string' || typeof entry.patronId !== 'string') continue;
      if (!isStallId(entry.stallId)) continue;
      const targetDishes = readInteger(entry.targetDishes, 10, 1);
      const deliveredDishes = Math.min(targetDishes, readFiniteNumber(entry.deliveredDishes, 0, 0));
      activeCravings.push({
        id: entry.id,
        patronId: validPatronIds.has(entry.patronId)
          ? entry.patronId
          : getPatronForStall(entry.stallId).id,
        stallId: entry.stallId,
        targetDishes,
        deliveredDishes,
        rewardCoins: readFiniteNumber(entry.rewardCoins, 25, 1),
        rewardHype: readFiniteNumber(entry.rewardHype, 5, 0),
        rushBonusSec: readFiniteNumber(entry.rushBonusSec, 0, 0),
      });
    }
  }

  let goldenLantern: GoldenLanternState | null = null;
  if (isPlainObject(raw.goldenLantern)) {
    const expiresAt = readFiniteNumber(raw.goldenLantern.expiresAt, 0, 0);
    if (expiresAt > now) {
      goldenLantern = {
        id: readInteger(raw.goldenLantern.id, allocateEventId(), 1),
        xNorm: Math.min(0.84, Math.max(0.16, readFiniteNumber(raw.goldenLantern.xNorm, 0.5, 0))),
        expiresAt,
      };
    }
  }

  const hydrated: GameState = {
    version: SAVE_VERSION,
    coins: readFiniteNumber(raw.coins, INITIAL_COINS, 0),
    runCoinsEarned: readFiniteNumber(raw.runCoinsEarned, 0, 0),
    hype: readFiniteNumber(raw.hype, 0, 0),
    festivalLanterns: readInteger(raw.festivalLanterns, 0, 0),
    totalFestivalLanternsEarned: readInteger(raw.totalFestivalLanternsEarned, 0, 0),
    ingredients,
    prepLevels,
    stallLevels,
    purchasedUpgrades,
    activeCravings,
    metPatrons: Array.from(metPatronsSet),
    heirloomLevels,
    unlockedDistricts,
    activeDistrict,
    rushMultiplier: readFiniteNumber(raw.rushMultiplier, 1, 1),
    rushEndsAt: readFiniteNumber(raw.rushEndsAt, 0, 0),
    goldenLantern,
    nextGoldenLanternAt: readFiniteNumber(
      raw.nextGoldenLanternAt,
      now + GOLDEN_LANTERN_INITIAL_DELAY_MS,
      0,
    ),
    stats,
    settings,
    lastSavedAt: readFiniteNumber(raw.lastSavedAt, now, 0),
    lastTickAt: readFiniteNumber(raw.lastTickAt, readFiniteNumber(raw.lastSavedAt, now, 0), 0),
  };

  if (hydrated.activeCravings.length < 2) {
    hydrated.activeCravings = ensureTwoCravings(hydrated, now);
  }

  return { ok: true, state: hydrated };
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function saveGameToStorage(state: GameState): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    const payload: GameState = {
      ...state,
      lastSavedAt: Date.now(),
    };
    globalThis.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or restricted-mode errors gracefully
  }
}

export function loadGameFromStorage(
  now: number = Date.now(),
): { state: GameState; offlineSummary: OfflineSummary | null } {
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      return { state: createInitialState(now), offlineSummary: null };
    }
    const rawText = globalThis.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!rawText) {
      return { state: createInitialState(now), offlineSummary: null };
    }
    const parsed: unknown = JSON.parse(rawText);
    const hydrated = hydrateState(parsed, now);
    if (!hydrated.ok) {
      return { state: createInitialState(now), offlineSummary: null };
    }
    const { state: progressed, summary } = calculateOfflineProgress(hydrated.state, now);
    return { state: progressed, offlineSummary: summary };
  } catch {
    return { state: createInitialState(now), offlineSummary: null };
  }
}

export function exportSaveCode(state: GameState): string {
  const json = JSON.stringify(state);
  return `${SAVE_CODE_PREFIX}${toBase64Utf8(json)}`;
}

export function importSaveCode(
  code: string,
  now: number = Date.now(),
): { ok: true; state: GameState } | { ok: false; error: string } {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SAVE_CODE_PREFIX)) {
    return { ok: false, error: 'Invalid save code prefix. Expected "LA1:".' };
  }

  const encoded = trimmed.slice(SAVE_CODE_PREFIX.length);
  if (!encoded) {
    return { ok: false, error: 'Save code is empty.' };
  }

  let parsed: unknown;
  try {
    const json = fromBase64Utf8(encoded);
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Save code could not be decoded.' };
  }

  return hydrateState(parsed, now);
}
