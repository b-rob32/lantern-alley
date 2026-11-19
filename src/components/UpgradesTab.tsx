import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { formatCoins } from '../game/format';
import type { UpgradeDef } from '../game/types';

export interface UpgradesTabProps {
  coins: number;
  availableUpgrades: UpgradeDef[];
  purchasedUpgrades: UpgradeDef[];
  onBuyUpgrade: (upgradeId: string) => void;
}

const CATEGORY_META: Record<
  UpgradeDef['category'],
  { label: string; className: string }
> = {
  lanterns: {
    label: 'Lanterns',
    className: 'bg-[#fbbf24]/16 text-[#fde68a]',
  },
  decor: {
    label: 'Alley Decor',
    className: 'bg-[#fb923c]/16 text-[#fdba74]',
  },
  chefs: {
    label: 'Helpers',
    className: 'bg-[#34d399]/15 text-[#6ee7b7]',
  },
  mastery: {
    label: 'Mastery',
    className: 'bg-[#f8f3e6]/12 text-[#f8f3e6]',
  },
};

export function UpgradesTab({
  coins,
  availableUpgrades,
  purchasedUpgrades,
  onBuyUpgrade,
}: UpgradesTabProps) {
  const [showOwned, setShowOwned] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3.5 py-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
            Alley Upgrades
          </h2>
          <p className="text-xs text-[#b5bad1]">
            Lanterns, decor, helper chefs &amp; secret recipes
          </p>
        </div>
        <span className="tabular-nums rounded-full bg-[#1e2340] px-2.5 py-1 text-xs font-semibold text-[#fbbf24]">
          {availableUpgrades.length} available
        </span>
      </div>

      {/* Available upgrades */}
      {availableUpgrades.length === 0 ? (
        <div className="lantern-card flex flex-col items-center gap-1.5 rounded-2xl p-6 text-center">
          <Sparkles className="h-6 w-6 text-[#fbbf24]" />
          <p className="text-sm font-semibold text-[#f8f3e6]">
            All current upgrades acquired!
          </p>
          <p className="text-xs text-[#b5bad1]">
            Open new stalls, level up stations, or earn more coins to reveal the
            next specialty craft.
          </p>
        </div>
      ) : (
        availableUpgrades.map((upgrade) => {
          const canAfford = coins >= upgrade.cost;
          const cat = CATEGORY_META[upgrade.category];

          return (
            <article
              key={upgrade.id}
              className="lantern-card flex items-center justify-between gap-3 rounded-2xl p-3.5"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                  <span role="img" aria-label={upgrade.name}>
                    {upgrade.emoji}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-[#f8f3e6]">
                      {upgrade.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cat.className}`}
                    >
                      {cat.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-[#b5bad1]">
                    {upgrade.description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onBuyUpgrade(upgrade.id)}
                disabled={!canAfford}
                className={`flex min-h-[46px] min-w-[92px] shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-1.5 transition-transform active:scale-[0.98] ${
                  canAfford
                    ? 'border-[#fbbf24]/45 bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_3px_12px_rgba(245,158,11,0.28)]'
                    : 'cursor-not-allowed border-[#ffe8b8]/8 bg-[#151930]/75 text-[#7f86a6]'
                }`}
              >
                <span className="text-[11px] font-bold">Buy</span>
                <span
                  className={`tabular-nums text-xs font-extrabold ${
                    canAfford ? 'text-[#0b1026]' : 'text-[#b5bad1]'
                  }`}
                >
                  ¥{formatCoins(upgrade.cost)}
                </span>
              </button>
            </article>
          );
        })
      )}

      {/* Owned upgrades collapsible drawer */}
      {purchasedUpgrades.length > 0 && (
        <section className="mt-1 rounded-2xl border border-[#ffe8b8]/10 bg-[#151930]/70">
          <button
            type="button"
            onClick={() => setShowOwned((prev) => !prev)}
            className="flex min-h-[46px] w-full items-center justify-between px-3.5 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[#b5bad1]">
              <Check className="h-4 w-4 text-[#34d399]" />
              Owned Upgrades ({purchasedUpgrades.length})
            </span>
            {showOwned ? (
              <ChevronUp className="h-4 w-4 text-[#7f86a6]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#7f86a6]" />
            )}
          </button>

          {showOwned && (
            <div className="flex flex-col gap-1.5 border-t border-[#ffe8b8]/8 px-3.5 py-2.5">
              {purchasedUpgrades.map((upgrade) => {
                const cat = CATEGORY_META[upgrade.category];
                return (
                  <div
                    key={upgrade.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[#0b1026]/50 px-2.5 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-base" aria-hidden="true">
                        {upgrade.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#f8f3e6]">
                          {upgrade.name}
                        </div>
                        <div className="truncate text-[11px] text-[#7f86a6]">
                          {upgrade.description}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.className}`}
                    >
                      {cat.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
