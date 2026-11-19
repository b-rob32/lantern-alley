import { useEffect, useRef } from 'react';
import { Hand, Lock, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { INGREDIENT_ORDER, INGREDIENTS } from '../game/data';
import { formatCoins, formatRate, formatStock } from '../game/format';
import type { BulkMode, IngredientId, PrepMetrics } from '../game/types';

export interface PrepPurchaseInfo {
  count: number;
  totalCost: number;
  canAfford: boolean;
}

export interface PrepTabProps {
  bulkMode: BulkMode;
  onSetBulkMode: (mode: BulkMode) => void;
  prepMetrics: Record<IngredientId, PrepMetrics>;
  prepUnlocked: Record<IngredientId, boolean>;
  prepPurchase: Record<IngredientId, PrepPurchaseInfo>;
  ingredients: Record<IngredientId, number>;
  highlightedIngredient?: IngredientId | null;
  onManualPrep: (id: IngredientId) => void;
  onBuyPrep: (id: IngredientId) => void;
}

const BULK_OPTIONS: { mode: BulkMode; label: string }[] = [
  { mode: '1', label: '1x' },
  { mode: '10', label: '10x' },
  { mode: 'max', label: 'Max' },
];

export function PrepTab({
  bulkMode,
  onSetBulkMode,
  prepMetrics,
  prepUnlocked,
  prepPurchase,
  ingredients,
  highlightedIngredient,
  onManualPrep,
  onBuyPrep,
}: PrepTabProps) {
  const cardRefs = useRef<Partial<Record<IngredientId, HTMLElement | null>>>(
    {},
  );

  useEffect(() => {
    if (!highlightedIngredient) return;
    const node = cardRefs.current[highlightedIngredient];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedIngredient]);

  const unlockedIds = INGREDIENT_ORDER.filter((id) => prepUnlocked[id]);
  const nextLockedId = INGREDIENT_ORDER.find((id) => !prepUnlocked[id]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3.5 py-3">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
            Prep Kitchen
          </h2>
          <p className="text-xs text-[#b5bad1]">
            Keep warm ingredients flowing to every stall
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

      {/* Unlocked prep stations */}
      {unlockedIds.map((ingredientId) => {
        const def = INGREDIENTS[ingredientId];
        const metrics = prepMetrics[ingredientId];
        const purchase = prepPurchase[ingredientId];
        const stock = ingredients[ingredientId] ?? 0;
        const isHighlighted = highlightedIngredient === ingredientId;
        const isDeficit = metrics.isBottleneck || metrics.netPerSec < -0.005;
        const isBuilt = metrics.level > 0;

        return (
          <article
            key={ingredientId}
            ref={(el) => {
              cardRefs.current[ingredientId] = el;
            }}
            className={`lantern-card flex flex-col gap-2.5 rounded-2xl p-3.5 transition-shadow ${
              isHighlighted
                ? 'ring-2 ring-[#fbbf24]/70 shadow-[0_0_18px_rgba(251,191,36,0.18)]'
                : ''
            }`}
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                  <span role="img" aria-label={def.name}>
                    {def.emoji}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-bold text-[#f8f3e6]">
                      {def.stationName}
                    </h3>
                    <span className="tabular-nums shrink-0 rounded-md bg-[#262c4d] px-1.5 py-0.5 text-[11px] font-bold text-[#fbbf24]">
                      Lv. {metrics.level}
                    </span>
                  </div>
                  <p className="truncate text-xs text-[#b5bad1]">
                    {def.name}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="tabular-nums text-sm font-bold text-[#f8f3e6]">
                  {formatStock(stock)}
                </div>
                <div className="text-[11px] font-medium text-[#7f86a6]">
                  in stock
                </div>
              </div>
            </div>

            {/* Flow metrics row */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-[#0b1026]/55 px-2.5 py-1.5">
              <div className="tabular-nums flex items-center gap-3 text-xs font-semibold">
                <span className="text-[#34d399]">
                  +{formatRate(metrics.productionPerSec)}/s
                </span>
                <span className="text-[#b5bad1]">
                  -{formatRate(metrics.consumptionPerSec)}/s demand
                </span>
              </div>

              <span
                className={`tabular-nums inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isDeficit
                    ? 'bg-[#fbbf24]/18 text-[#fbbf24]'
                    : 'bg-[#34d399]/15 text-[#34d399]'
                }`}
              >
                {isDeficit ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3" />
                )}
                {metrics.netPerSec >= 0 ? '+' : ''}
                {formatRate(metrics.netPerSec)}/s
              </span>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onManualPrep(ingredientId)}
                className="flex min-h-[46px] flex-col items-center justify-center rounded-xl border border-[#ffe8b8]/12 bg-[#262c4d] px-3 py-1.5 text-[#f8f3e6] transition-transform active:scale-[0.98]"
              >
                <span className="flex items-center gap-1 text-xs font-bold">
                  <Hand className="h-3.5 w-3.5 text-[#fbbf24]" />
                  Prep
                </span>
                <span className="tabular-nums text-[11px] font-semibold text-[#34d399]">
                  +{formatStock(metrics.manualAmount)} {def.shortName}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onBuyPrep(ingredientId)}
                disabled={!purchase.canAfford}
                className={`flex min-h-[46px] flex-col items-center justify-center rounded-xl border px-3 py-1.5 transition-transform active:scale-[0.98] ${
                  purchase.canAfford
                    ? 'border-[#fbbf24]/45 bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_3px_12px_rgba(245,158,11,0.28)]'
                    : 'cursor-not-allowed border-[#ffe8b8]/8 bg-[#151930]/75 text-[#7f86a6]'
                }`}
              >
                <span className="flex items-center gap-1 text-xs font-bold">
                  <Plus className="h-3.5 w-3.5" />
                  {isBuilt ? `Upgrade +${purchase.count}` : 'Build Station'}
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

      {/* Next locked prep station preview */}
      {nextLockedId && (() => {
        const def = INGREDIENTS[nextLockedId];
        return (
          <article className="rounded-2xl border border-dashed border-[#ffe8b8]/14 bg-[#151930]/65 p-3.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-xl opacity-75">
                  <span role="img" aria-label={def.name}>
                    {def.emoji}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]/80" />
                    <h3 className="truncate text-sm font-bold text-[#f8f3e6]/85">
                      Next: {def.stationName}
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
          </article>
        );
      })()}
    </div>
  );
}
