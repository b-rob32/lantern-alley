import { AlertTriangle, ArrowRight, Flame, Lock, Plus } from 'lucide-react';
import { INGREDIENTS, STALL_ORDER, STALLS } from '../game/data';
import { formatCoins, formatRate, formatStock } from '../game/format';
import type {
  BulkMode,
  IngredientId,
  StallId,
  StallMetrics,
} from '../game/types';

export interface StallPurchaseInfo {
  count: number;
  totalCost: number;
  canAfford: boolean;
}

export interface StallsTabProps {
  coins: number;
  bulkMode: BulkMode;
  onSetBulkMode: (mode: BulkMode) => void;
  stallMetrics: Record<StallId, StallMetrics>;
  stallUnlocked: Record<StallId, boolean>;
  stallPurchase: Record<StallId, StallPurchaseInfo>;
  ingredients: Record<IngredientId, number>;
  onCookStall: (stallId: StallId) => void;
  onBuyStall: (stallId: StallId) => void;
  onJumpToPrep: (ingredientId: IngredientId) => void;
}

const BULK_OPTIONS: { mode: BulkMode; label: string }[] = [
  { mode: '1', label: '1x' },
  { mode: '10', label: '10x' },
  { mode: 'max', label: 'Max' },
];

export function StallsTab({
  coins,
  bulkMode,
  onSetBulkMode,
  stallMetrics,
  stallUnlocked,
  stallPurchase,
  ingredients,
  onCookStall,
  onBuyStall,
  onJumpToPrep,
}: StallsTabProps) {
  const unlockedIds = STALL_ORDER.filter((id) => stallUnlocked[id]);
  const nextLockedId = STALL_ORDER.find((id) => !stallUnlocked[id]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3.5 py-3">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
            Alley Stalls
          </h2>
          <p className="text-xs text-[#b5bad1]">
            Serve hot dishes &amp; expand the night market
          </p>
        </div>

        <div
          role="group"
          aria-label="Bulk upgrade quantity"
          className="inline-flex rounded-xl border border-[#ffe8b8]/10 bg-[#151930] p-0.5"
        >
          {BULK_OPTIONS.map(({ mode, label }) => {
            const active = bulkMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSetBulkMode(mode)}
                className={`min-h-[36px] min-w-[44px] rounded-lg px-2.5 text-xs font-bold transition-all active:scale-[0.97] ${
                  active
                    ? 'bg-[#f59e0b] text-[#0b1026] shadow-sm'
                    : 'text-[#b5bad1]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unlocked stalls */}
      {unlockedIds.map((stallId) => {
        const def = STALLS[stallId];
        const metrics = stallMetrics[stallId];
        const purchase = stallPurchase[stallId];
        const isBuilt = metrics.level > 0;
        const primaryBottleneck = metrics.bottlenecks[0] ?? null;

        return (
          <article
            key={stallId}
            className="lantern-card flex flex-col gap-2.5 rounded-2xl p-3.5"
          >
            {/* Top info row */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                  <span role="img" aria-label={def.dishName}>
                    {def.emoji}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-bold text-[#f8f3e6]">
                      {def.name}
                    </h3>
                    <span className="tabular-nums shrink-0 rounded-md bg-[#262c4d] px-1.5 py-0.5 text-[11px] font-bold text-[#fbbf24]">
                      Lv. {metrics.level}
                    </span>
                  </div>
                  <p className="truncate text-xs text-[#b5bad1]">
                    {def.dishName} · ¥{formatCoins(metrics.dishValue)}/dish
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div
                  className={`tabular-nums text-sm font-bold ${
                    metrics.coinsPerSec > 0
                      ? 'text-[#34d399]'
                      : 'text-[#7f86a6]'
                  }`}
                >
                  +¥{formatRate(metrics.coinsPerSec)}/s
                </div>
                <div className="tabular-nums text-[11px] font-medium text-[#b5bad1]">
                  {formatRate(metrics.effectiveDishesPerSec)} dishes/s
                </div>
              </div>
            </div>

            {/* Recipe input stock pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {def.inputs.map((input) => {
                const ingDef = INGREDIENTS[input.ingredientId];
                const stock = ingredients[input.ingredientId] ?? 0;
                const isLow =
                  metrics.bottlenecks.includes(input.ingredientId) ||
                  stock < input.amount * 2;

                return (
                  <span
                    key={input.ingredientId}
                    className={`tabular-nums inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                      isLow
                        ? 'border-[#fbbf24]/35 bg-[#fbbf24]/12 text-[#fde68a]'
                        : 'border-[#ffe8b8]/8 bg-[#0b1026]/55 text-[#b5bad1]'
                    }`}
                  >
                    <span aria-hidden="true">{ingDef.emoji}</span>
                    <span>{ingDef.shortName}</span>
                    <span className="opacity-70">×{input.amount}</span>
                    <span className="text-[#f8f3e6]">
                      ({formatStock(stock)})
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Gentle amber bottleneck hint */}
            {primaryBottleneck && (
              <button
                type="button"
                onClick={() => onJumpToPrep(primaryBottleneck)}
                className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#fbbf24]/30 bg-[#fbbf24]/12 px-3 py-1.5 text-left text-xs font-semibold text-[#fde68a] transition-transform active:scale-[0.98]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" />
                  <span className="truncate">
                    Low on {INGREDIENTS[primaryBottleneck].name} — Boost Prep
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" />
              </button>
            )}

            {/* Side-by-side thumb buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCookStall(stallId)}
                disabled={!isBuilt}
                className={`flex min-h-[46px] flex-col items-center justify-center rounded-xl border px-3 py-1.5 transition-transform active:scale-[0.98] ${
                  isBuilt
                    ? 'border-[#fb923c]/30 bg-[#262c4d] text-[#f8f3e6]'
                    : 'cursor-not-allowed border-[#ffe8b8]/6 bg-[#151930]/60 text-[#7f86a6]'
                }`}
              >
                <span className="flex items-center gap-1 text-xs font-bold">
                  <Flame className="h-3.5 w-3.5 text-[#fb923c]" />
                  {isBuilt ? 'Serve' : 'Locked'}
                </span>
                <span className="tabular-nums text-[11px] font-semibold text-[#fbbf24]">
                  {isBuilt
                    ? `+¥${formatCoins(metrics.dishValue)}`
                    : 'Open stall first'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onBuyStall(stallId)}
                disabled={!purchase.canAfford}
                className={`flex min-h-[46px] flex-col items-center justify-center rounded-xl border px-3 py-1.5 transition-transform active:scale-[0.98] ${
                  purchase.canAfford
                    ? 'border-[#fbbf24]/45 bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_3px_12px_rgba(245,158,11,0.28)]'
                    : 'cursor-not-allowed border-[#ffe8b8]/8 bg-[#151930]/75 text-[#7f86a6]'
                }`}
              >
                <span className="flex items-center gap-1 text-xs font-bold">
                  <Plus className="h-3.5 w-3.5" />
                  {isBuilt ? `Upgrade +${purchase.count}` : 'Open Stall'}
                </span>
                <span
                  className={`tabular-nums text-[11px] font-bold ${
                    purchase.canAfford ? 'text-[#0b1026]/85' : 'text-[#b5bad1]'
                  }`}
                >
                  ¥{formatCoins(purchase.totalCost)}
                </span>
              </button>
            </div>
          </article>
        );
      })}

      {/* Next locked stall preview */}
      {nextLockedId && (() => {
        const def = STALLS[nextLockedId];
        const progress = Math.min(
          100,
          def.unlockCoins > 0 ? (coins / def.unlockCoins) * 100 : 100,
        );

        return (
          <article className="rounded-2xl border border-dashed border-[#ffe8b8]/14 bg-[#151930]/65 p-3.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-xl opacity-75">
                  <span role="img" aria-label={def.dishName}>
                    {def.emoji}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]/80" />
                    <h3 className="truncate text-sm font-bold text-[#f8f3e6]/85">
                      Next: {def.name}
                    </h3>
                  </div>
                  <p className="truncate text-xs text-[#7f86a6]">
                    {def.description}
                  </p>
                </div>
              </div>
              <div className="tabular-nums shrink-0 text-right text-xs font-bold text-[#fbbf24]">
                ¥{formatCoins(def.unlockCoins)}
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#0b1026]/85">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#fb923c] to-[#fbbf24] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </article>
        );
      })()}
    </div>
  );
}
