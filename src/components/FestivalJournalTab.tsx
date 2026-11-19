import { useState } from 'react';
import {
  BookOpen,
  Check,
  Compass,
  Lock,
  Sparkles,
  Utensils,
} from 'lucide-react';
import {
  DISTRICT_ORDER,
  DISTRICTS,
  HEIRLOOMS,
  REGULAR_PATRONS,
  STALL_ORDER,
  STALLS,
} from '../game/data';
import { formatCoins, formatRate } from '../game/format';
import type { DistrictId, LifetimeStats } from '../game/types';

export interface FestivalJournalTabProps {
  runCoinsEarned: number;
  festivalLanterns: number;
  pendingLanterns: number;
  nextLanternThreshold: number;
  heirloomLevels: Record<string, number>;
  heirloomCosts: Record<string, number>;
  unlockedDistricts: DistrictId[];
  activeDistrict: DistrictId;
  stats: LifetimeStats;
  metPatrons: string[];
  onHostFestival: () => void;
  onBuyHeirloom: (heirloomId: string) => void;
  onSelectOrUnlockDistrict: (districtId: DistrictId) => void;
}

type SubTab = 'festival' | 'districts' | 'journal';

export function FestivalJournalTab({
  runCoinsEarned,
  festivalLanterns,
  pendingLanterns,
  nextLanternThreshold,
  heirloomLevels,
  heirloomCosts,
  unlockedDistricts,
  activeDistrict,
  stats,
  metPatrons,
  onHostFestival,
  onBuyHeirloom,
  onSelectOrUnlockDistrict,
}: FestivalJournalTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('festival');
  const [confirmingFestival, setConfirmingFestival] = useState(false);

  const switchSubTab = (next: SubTab) => {
    setSubTab(next);
    setConfirmingFestival(false);
  };

  const progressPct = Math.min(
    100,
    nextLanternThreshold > 0
      ? (runCoinsEarned / nextLanternThreshold) * 100
      : 100,
  );

  const canHost = pendingLanterns > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3.5 py-3">
      {/* Sub-pill switcher */}
      <div
        role="tablist"
        aria-label="Festival and Journal sections"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-[#ffe8b8]/10 bg-[#151930] p-1"
      >
        {(
          [
            { id: 'festival', label: 'Festival', icon: Sparkles },
            { id: 'districts', label: 'Districts', icon: Compass },
            { id: 'journal', label: 'Journal', icon: BookOpen },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchSubTab(id)}
              className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-all active:scale-[0.98] ${
                active
                  ? 'bg-[#262c4d] text-[#fbbf24] shadow-sm'
                  : 'text-[#b5bad1]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* SUBTAB 1: FESTIVAL & HEIRLOOMS */}
      {subTab === 'festival' && (
        <div className="flex flex-col gap-3">
          {/* Grand Night Festival prestige banner */}
          <section className="rounded-2xl border border-[#fbbf24]/25 bg-gradient-to-b from-[#272342] via-[#1e2140] to-[#151930] p-4 shadow-[0_6px_22px_rgba(4,7,20,0.45)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 text-base font-bold text-[#fde68a]">
                  <span aria-hidden="true">🏮</span>
                  Grand Night Festival
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[#b5bad1]">
                  Celebrate tonight’s market to earn permanent Festival
                  Lanterns. Stalls, prep &amp; coins reset; Heirlooms, Districts
                  &amp; Journal stay forever.
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-[#0b1026]/70 px-2.5 py-1.5 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b5bad1]">
                  Banked
                </div>
                <div className="tabular-nums text-sm font-extrabold text-[#fbbf24]">
                  🏮 {formatCoins(festivalLanterns)}
                </div>
              </div>
            </div>

            {/* Progress toward next Festival Lantern */}
            <div className="mt-3 rounded-xl bg-[#0b1026]/55 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#f8f3e6]">
                  {canHost
                    ? `Ready to claim +${formatCoins(pendingLanterns)} 🏮`
                    : 'Next Festival Lantern'}
                </span>
                <span className="tabular-nums font-bold text-[#fbbf24]">
                  ¥{formatCoins(runCoinsEarned)} / ¥
                  {formatCoins(nextLanternThreshold)}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#151930]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#fb923c] to-[#fbbf24] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Inline 2-tap confirmation */}
            <div className="mt-3">
              {!confirmingFestival ? (
                <button
                  type="button"
                  disabled={!canHost}
                  onClick={() => setConfirmingFestival(true)}
                  className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-transform active:scale-[0.98] ${
                    canHost
                      ? 'bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_4px_14px_rgba(245,158,11,0.3)]'
                      : 'cursor-not-allowed border border-[#ffe8b8]/10 bg-[#151930]/80 text-[#7f86a6]'
                  }`}
                >
                  {canHost
                    ? `Host Grand Festival (+${formatCoins(pendingLanterns)} 🏮)`
                    : `Earn ¥${formatCoins(nextLanternThreshold)} tonight to host`}
                </button>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl border border-[#fb923c]/35 bg-[#0b1026]/75 p-2.5">
                  <p className="text-center text-xs font-medium text-[#fde68a]">
                    Reset current stalls &amp; coins to claim +
                    {formatCoins(pendingLanterns)} 🏮?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingFestival(false)}
                      className="min-h-[44px] rounded-xl border border-[#ffe8b8]/12 bg-[#1e2340] px-3 text-xs font-bold text-[#b5bad1] transition-transform active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingFestival(false);
                        onHostFestival();
                      }}
                      className="min-h-[44px] rounded-xl bg-gradient-to-b from-[#fb923c] to-[#f59e0b] px-3 text-xs font-extrabold text-[#0b1026] transition-transform active:scale-[0.98]"
                    >
                      Confirm Reset for +{formatCoins(pendingLanterns)} 🏮
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Heirloom Recipes shop */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <h3 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
                Heirloom Recipes
              </h3>
              <p className="text-xs text-[#b5bad1]">
                Permanent keepsakes kept across every festival
              </p>
            </div>
            <span className="tabular-nums rounded-full bg-[#fb923c]/16 px-2.5 py-1 text-xs font-bold text-[#fbbf24]">
              🏮 {formatCoins(festivalLanterns)}
            </span>
          </div>

          {HEIRLOOMS.map((heirloom) => {
            const level = heirloomLevels[heirloom.id] ?? 0;
            const isMaxed = level >= heirloom.maxLevel;
            const cost = heirloomCosts[heirloom.id] ?? heirloom.baseCost;
            const canAfford = !isMaxed && festivalLanterns >= cost;

            return (
              <article
                key={heirloom.id}
                className="lantern-card flex items-center justify-between gap-3 rounded-2xl p-3.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                    <span role="img" aria-label={heirloom.name}>
                      {heirloom.emoji}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="truncate text-sm font-bold text-[#f8f3e6]">
                        {heirloom.name}
                      </h4>
                      <span className="tabular-nums shrink-0 rounded-md bg-[#262c4d] px-1.5 py-0.5 text-[10px] font-bold text-[#fbbf24]">
                        Lv. {level}/{heirloom.maxLevel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-[#b5bad1]">
                      {heirloom.description}
                    </p>
                  </div>
                </div>

                {isMaxed ? (
                  <span className="flex min-h-[44px] min-w-[82px] shrink-0 items-center justify-center gap-1 rounded-xl border border-[#34d399]/30 bg-[#34d399]/12 px-3 text-xs font-bold text-[#34d399]">
                    <Check className="h-3.5 w-3.5" />
                    Maxed
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => onBuyHeirloom(heirloom.id)}
                    className={`flex min-h-[44px] min-w-[82px] shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-1 transition-transform active:scale-[0.98] ${
                      canAfford
                        ? 'border-[#fbbf24]/45 bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_3px_12px_rgba(245,158,11,0.28)]'
                        : 'cursor-not-allowed border-[#ffe8b8]/8 bg-[#151930]/75 text-[#7f86a6]'
                    }`}
                  >
                    <span className="text-[10px] font-bold">Craft</span>
                    <span
                      className={`tabular-nums text-xs font-extrabold ${
                        canAfford ? 'text-[#0b1026]' : 'text-[#b5bad1]'
                      }`}
                    >
                      {formatCoins(cost)} 🏮
                    </span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* SUBTAB 2: DISTRICTS */}
      {subTab === 'districts' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
                Night Market Districts
              </h2>
              <p className="text-xs text-[#b5bad1]">
                Unlock new scenic alleys with permanent market bonuses
              </p>
            </div>
            <span className="tabular-nums rounded-full bg-[#fb923c]/16 px-2.5 py-1 text-xs font-bold text-[#fbbf24]">
              🏮 {formatCoins(festivalLanterns)}
            </span>
          </div>

          {DISTRICT_ORDER.map((districtId) => {
            const district = DISTRICTS[districtId];
            const isUnlocked = unlockedDistricts.includes(districtId);
            const isActive = activeDistrict === districtId;
            const canUnlock =
              !isUnlocked && festivalLanterns >= district.unlockCost;

            return (
              <article
                key={districtId}
                className={`lantern-card overflow-hidden rounded-2xl ${
                  isActive ? 'border-[#34d399]/40' : ''
                }`}
              >
                {/* Live mini palette swatch strip */}
                <div
                  className="relative flex h-9 w-full items-center justify-between px-3.5"
                  style={{
                    background: `linear-gradient(90deg, ${district.palette.skyTop} 0%, ${district.palette.skyMid} 48%, ${district.palette.skyBottom} 100%)`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {[
                      district.palette.lanternPrimary,
                      district.palette.lanternSecondary,
                      district.palette.accentGlow,
                      district.palette.groundTop,
                    ].map((swatch, idx) => (
                      <span
                        key={idx}
                        aria-hidden="true"
                        className="h-3.5 w-3.5 rounded-full border border-white/25 shadow-sm"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                  <span className="rounded-full bg-[#0b1026]/65 px-2.5 py-0.5 text-[11px] font-bold text-[#fde68a] backdrop-blur-sm">
                    {district.bonusLabel}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5 p-3.5">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[15px] font-bold text-[#f8f3e6]">
                        {district.name}
                      </h3>
                      <span className="text-[11px] font-medium text-[#b5bad1]">
                        {district.subtitle}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#b5bad1]">
                      {district.description}
                    </p>
                  </div>

                  {isActive ? (
                    <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#34d399]/35 bg-[#34d399]/14 text-xs font-bold text-[#34d399]">
                      <Check className="h-4 w-4" />
                      Active District
                    </div>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => onSelectOrUnlockDistrict(districtId)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[#ffe8b8]/14 bg-[#262c4d] text-xs font-bold text-[#f8f3e6] transition-transform active:scale-[0.98]"
                    >
                      Activate District
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canUnlock}
                      onClick={() => onSelectOrUnlockDistrict(districtId)}
                      className={`flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition-transform active:scale-[0.98] ${
                        canUnlock
                          ? 'border-[#fbbf24]/45 bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] text-[#0b1026] shadow-[0_3px_12px_rgba(245,158,11,0.28)]'
                          : 'cursor-not-allowed border-[#ffe8b8]/8 bg-[#151930]/75 text-[#7f86a6]'
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Unlock · {formatCoins(district.unlockCost)} 🏮
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* SUBTAB 3: JOURNAL */}
      {subTab === 'journal' && (
        <div className="flex flex-col gap-3.5">
          {/* Lifetime stats grid */}
          <section className="lantern-card rounded-2xl p-3.5">
            <h2 className="text-sm font-bold text-[#f8f3e6]">
              Market Ledger
            </h2>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Total Dishes',
                  value: formatCoins(stats.totalDishesServed),
                },
                {
                  label: 'Lifetime Coins',
                  value: `¥${formatCoins(stats.totalCoinsEarned)}`,
                },
                {
                  label: 'Peak ¥/s',
                  value: `¥${formatRate(stats.peakCoinsPerSec)}/s`,
                },
                {
                  label: 'Festivals Hosted',
                  value: formatCoins(stats.festivalsHosted),
                },
                {
                  label: 'Cravings Served',
                  value: formatCoins(stats.cravingsCompleted),
                },
                {
                  label: 'Golden Lanterns',
                  value: formatCoins(stats.goldenLanternsTapped),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl bg-[#0b1026]/55 px-3 py-2"
                >
                  <div className="text-[11px] font-medium text-[#b5bad1]">
                    {item.label}
                  </div>
                  <div className="tabular-nums mt-0.5 text-sm font-bold text-[#f8f3e6]">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Dish Counter grid */}
          <section className="lantern-card rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5">
              <Utensils className="h-4 w-4 text-[#fbbf24]" />
              <h3 className="text-sm font-bold text-[#f8f3e6]">
                Dish Counter
              </h3>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {STALL_ORDER.map((stallId) => {
                const stall = STALLS[stallId];
                const served = stats.dishesByStall[stallId] ?? 0;
                return (
                  <div
                    key={stallId}
                    className="flex items-center gap-2 rounded-xl bg-[#0b1026]/55 px-2.5 py-2"
                  >
                    <span className="text-xl" aria-hidden="true">
                      {stall.emoji}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[#f8f3e6]">
                        {stall.dishName}
                      </div>
                      <div className="tabular-nums text-[11px] font-bold text-[#fbbf24]">
                        {formatCoins(served)} served
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Regular Patrons showcase */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#f8f3e6]">
                Regular Patrons
              </h3>
              <span className="tabular-nums text-xs font-semibold text-[#b5bad1]">
                {metPatrons.length} / {REGULAR_PATRONS.length} befriended
              </span>
            </div>

            {REGULAR_PATRONS.map((patron) => {
              const met = metPatrons.includes(patron.id);
              const favStall = STALLS[patron.favoriteStall];

              if (!met) {
                return (
                  <div
                    key={patron.id}
                    className="flex items-center gap-3 rounded-2xl border border-dashed border-[#ffe8b8]/12 bg-[#151930]/55 p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-lg text-[#7f86a6]">
                      ?
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#b5bad1]">
                        Mysterious Night Stroller
                      </div>
                      <div className="text-[11px] text-[#7f86a6]">
                        Serve more {favStall.dishName} cravings to meet this
                        regular.
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <article
                  key={patron.id}
                  className="lantern-card flex items-start gap-3 rounded-2xl p-3.5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                    <span role="img" aria-label={patron.name}>
                      {patron.emoji}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-sm font-bold text-[#f8f3e6]">
                        {patron.name}
                      </h4>
                      <span className="shrink-0 text-[11px] font-medium text-[#fbbf24]">
                        {favStall.emoji} {favStall.dishName}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#7f86a6]">
                      {patron.title}
                    </div>
                    <p className="mt-1 text-xs italic leading-relaxed text-[#b5bad1]">
                      “{patron.quote}”
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
