export type IngredientId = 'charcoal' | 'broth' | 'dough' | 'tea' | 'sweetPaste';

export type StallId =
  | 'yakitori'
  | 'ramen'
  | 'dumplings'
  | 'boba'
  | 'taiyaki'
  | 'izakaya';

export type DistrictId =
  | 'lantern-alley'
  | 'harbor-pier'
  | 'blossom-courtyard'
  | 'neon-rooftop';

export type BulkMode = '1' | '10' | 'max';

export type TabId = 'stalls' | 'prep' | 'cravings' | 'upgrades' | 'festival';

export interface IngredientDef {
  id: IngredientId;
  name: string;
  stationName: string;
  shortName: string;
  emoji: string;
  color: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  baseRate: number; // per second per level
  manualAmount: number; // base amount gained per tap
  unlockCoins: number; // lifetime coins needed to reveal/unlock, 0 = available immediately
}

export interface StallRecipeInput {
  ingredientId: IngredientId;
  amount: number;
}

export interface StallDef {
  id: StallId;
  name: string;
  dishName: string;
  emoji: string;
  accentColor: string;
  norenColor: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  baseCookRate: number; // dishes per second at level 1
  baseDishValue: number; // coins per dish at level 1
  inputs: StallRecipeInput[];
  unlockCoins: number;
  slotIndex: number; // 0..5 placement along the alley canvas
}

export type UpgradeEffect =
  | { type: 'stall_value'; stallId: StallId; multiplier: number }
  | { type: 'stall_speed'; stallId: StallId; multiplier: number }
  | { type: 'prep_speed'; ingredientId: IngredientId; multiplier: number }
  | { type: 'all_value'; multiplier: number }
  | { type: 'all_prep'; multiplier: number }
  | { type: 'manual_power'; multiplier: number }
  | { type: 'lantern_count'; add: number; valueMultiplier: number }
  | { type: 'craving_reward'; multiplier: number };

export interface UpgradeDef {
  id: string;
  name: string;
  category: 'decor' | 'chefs' | 'mastery' | 'lanterns';
  emoji: string;
  description: string;
  cost: number;
  effect: UpgradeEffect;
  requiresStall?: { stallId: StallId; level: number };
  requiresPrep?: { ingredientId: IngredientId; level: number };
  requiresCoins?: number;
}

export interface RegularPatronDef {
  id: string;
  name: string;
  title: string;
  emoji: string;
  accentColor: string;
  favoriteStall: StallId;
  quote: string;
}

export interface ActiveCraving {
  id: string;
  patronId: string;
  stallId: StallId;
  targetDishes: number;
  deliveredDishes: number;
  rewardCoins: number;
  rewardHype: number;
  rushBonusSec: number;
}

export interface HeirloomDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  baseCost: number; // Festival Lanterns
  costGrowth: number;
  maxLevel: number;
  effectType:
    | 'global_value'
    | 'prep_speed'
    | 'stall_speed'
    | 'craving_boost'
    | 'starting_coins'
    | 'offline_cap';
  perLevelBonus: number;
}

export interface DistrictDef {
  id: DistrictId;
  name: string;
  subtitle: string;
  description: string;
  unlockCost: number; // Festival Lanterns (0 for starting district)
  bonusLabel: string;
  valueMultiplier: number;
  prepMultiplier: number;
  palette: {
    skyTop: string;
    skyMid: string;
    skyBottom: string;
    horizon: string;
    groundTop: string;
    groundBottom: string;
    lanternPrimary: string;
    lanternSecondary: string;
    accentGlow: string;
  };
}

export interface GoldenLanternState {
  id: number;
  xNorm: number; // 0.15 .. 0.85 along the alley wire
  expiresAt: number; // ms timestamp
}

export interface VisualEvent {
  id: number;
  type: 'dish_served' | 'manual_prep' | 'golden_lantern' | 'craving_claimed' | 'stall_bought';
  stallId?: StallId;
  ingredientId?: IngredientId;
  label?: string;
  color?: string;
}

export interface LifetimeStats {
  totalCoinsEarned: number;
  totalDishesServed: number;
  dishesByStall: Record<StallId, number>;
  peakCoinsPerSec: number;
  festivalsHosted: number;
  cravingsCompleted: number;
  goldenLanternsTapped: number;
  manualTaps: number;
  startedAt: number;
}

export interface GameState {
  version: number;
  coins: number;
  runCoinsEarned: number; // resets on Festival prestige
  hype: number;
  festivalLanterns: number;
  totalFestivalLanternsEarned: number;

  ingredients: Record<IngredientId, number>;
  prepLevels: Record<IngredientId, number>;
  stallLevels: Record<StallId, number>;
  purchasedUpgrades: string[];

  activeCravings: ActiveCraving[];
  metPatrons: string[];

  heirloomLevels: Record<string, number>;
  unlockedDistricts: DistrictId[];
  activeDistrict: DistrictId;

  rushMultiplier: number;
  rushEndsAt: number; // ms timestamp, 0 when inactive
  goldenLantern: GoldenLanternState | null;
  nextGoldenLanternAt: number; // ms timestamp

  stats: LifetimeStats;

  settings: {
    muted: boolean;
    haptics: boolean;
    bulkMode: BulkMode;
  };

  lastSavedAt: number;
  lastTickAt: number;
}

export interface StallMetrics {
  stallId: StallId;
  level: number;
  unlocked: boolean;
  dishValue: number;
  potentialDishesPerSec: number;
  effectiveDishesPerSec: number;
  coinsPerSec: number;
  efficiency: number; // 0..1
  bottlenecks: IngredientId[];
  demandPerSec: Partial<Record<IngredientId, number>>;
}

export interface PrepMetrics {
  ingredientId: IngredientId;
  level: number;
  productionPerSec: number;
  consumptionPerSec: number;
  netPerSec: number;
  manualAmount: number;
  isBottleneck: boolean;
}

export interface OfflineSummary {
  elapsedSeconds: number;
  cappedSeconds: number;
  coinsEarned: number;
  totalDishes: number;
  dishesByStall: Partial<Record<StallId, number>>;
}
