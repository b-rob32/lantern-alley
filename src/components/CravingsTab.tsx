import { ArrowRight, CheckCircle2, Flame, Sparkles } from 'lucide-react';
import { REGULAR_PATRONS, STALLS } from '../game/data';
import { formatCoins } from '../game/format';
import type { ActiveCraving } from '../game/types';

export interface CravingsTabProps {
  cravings: ActiveCraving[];
  rushSecondsLeft: number;
  goldenLanternActive: boolean;
  onClaimCraving: (cravingId: string) => void;
  onJumpToStall: () => void;
}

export function CravingsTab({
  cravings,
  rushSecondsLeft,
  goldenLanternActive,
  onClaimCraving,
  onJumpToStall,
}: CravingsTabProps) {
  const rushActive = rushSecondsLeft > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-3.5 py-3">
      {/* Night Rush / Golden Lantern status banner */}
      {rushActive ? (
        <div className="rounded-2xl border border-[#fbbf24]/35 bg-gradient-to-r from-[#f59e0b]/20 via-[#fb923c]/16 to-[#1e2340]/90 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fbbf24]/20 text-[#fbbf24]">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#fde68a]">
                  2x Night Rush Active!
                </div>
                <p className="text-xs text-[#f8f3e6]/80">
                  Every stall earns double coins while the rush glows.
                </p>
              </div>
            </div>
            <span className="tabular-nums shrink-0 rounded-full bg-[#fbbf24] px-2.5 py-1 text-xs font-extrabold text-[#0b1026]">
              {Math.ceil(rushSecondsLeft)}s
            </span>
          </div>
        </div>
      ) : goldenLanternActive ? (
        <div className="animate-gentle-glow rounded-2xl border border-[#fbbf24]/40 bg-gradient-to-r from-[#fbbf24]/18 to-[#1e2340]/90 p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fbbf24]/20 text-[#fbbf24]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#fde68a]">
                Golden Lantern Overhead!
              </div>
              <p className="text-xs text-[#f8f3e6]/85">
                Tap the glowing lantern in the alley above for bonus coins &amp;
                2x Night Rush.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#ffe8b8]/10 bg-[#151930]/80 px-3.5 py-2.5">
          <p className="text-xs leading-relaxed text-[#b5bad1]">
            <span className="font-semibold text-[#fde68a]">Night Tip:</span>{' '}
            Fulfill Patron Cravings for big coin tips &amp;{' '}
            <span className="font-semibold text-[#fb923c]">2x Night Rush</span>,
            and watch the alley wire above for glowing Golden Lanterns.
          </p>
        </div>
      )}

      {/* Section title */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide text-[#f8f3e6]">
          Patron Cravings
        </h2>
        <span className="tabular-nums text-xs font-medium text-[#b5bad1]">
          {cravings.length} active
        </span>
      </div>

      {/* Craving cards */}
      {cravings.length === 0 ? (
        <div className="lantern-card flex flex-col items-center gap-1.5 rounded-2xl p-6 text-center">
          <span className="text-2xl" aria-hidden="true">
            🏮
          </span>
          <p className="text-sm font-semibold text-[#f8f3e6]">
            The alley is calm for a moment
          </p>
          <p className="text-xs text-[#b5bad1]">
            New hungry regulars will stroll up with a craving shortly.
          </p>
        </div>
      ) : (
        cravings.map((craving) => {
          const patron =
            REGULAR_PATRONS.find((p) => p.id === craving.patronId) ??
            REGULAR_PATRONS[0];
          const stall = STALLS[craving.stallId];
          const delivered = Math.min(
            craving.deliveredDishes,
            craving.targetDishes,
          );
          const progressPct = Math.min(
            100,
            craving.targetDishes > 0
              ? (delivered / craving.targetDishes) * 100
              : 0,
          );
          const isComplete = craving.deliveredDishes >= craving.targetDishes;

          return (
            <article
              key={craving.id}
              className={`lantern-card flex flex-col gap-3 rounded-2xl p-3.5 ${
                isComplete
                  ? 'border-[#fbbf24]/35 shadow-[0_4px_18px_rgba(245,158,11,0.16)]'
                  : ''
              }`}
            >
              {/* Patron header */}
              <div className="flex items-start gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b1026]/70 text-2xl">
                  <span role="img" aria-label={patron.name}>
                    {patron.emoji}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-[15px] font-bold text-[#f8f3e6]">
                      {patron.name}
                    </h3>
                    <span className="shrink-0 text-[11px] font-medium text-[#b5bad1]">
                      {patron.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs italic text-[#b5bad1]">
                    “{patron.quote}”
                  </p>
                </div>
              </div>

              {/* Requested dish & progress */}
              <div className="rounded-xl bg-[#0b1026]/55 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[#f8f3e6]">
                    <span aria-hidden="true">{stall.emoji}</span>
                    {stall.dishName}
                  </span>
                  <span
                    className={`tabular-nums font-bold ${
                      isComplete ? 'text-[#34d399]' : 'text-[#fbbf24]'
                    }`}
                  >
                    {Math.floor(delivered)} / {craving.targetDishes}
                  </span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#151930]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete
                        ? 'bg-gradient-to-r from-[#34d399] to-[#6ee7b7]'
                        : 'bg-gradient-to-r from-[#fb923c] to-[#fbbf24]'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Reward pills + action */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-[#fbbf24]/14 px-2.5 py-1 text-xs font-bold text-[#fde68a]">
                    +¥{formatCoins(craving.rewardCoins)}
                  </span>
                  {craving.rushBonusSec > 0 && (
                    <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-[#fb923c]/16 px-2.5 py-1 text-xs font-bold text-[#fb923c]">
                      <Flame className="h-3 w-3" />+{craving.rushBonusSec}s Rush
                    </span>
                  )}
                </div>

                {!isComplete && (
                  <button
                    type="button"
                    onClick={onJumpToStall}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#ffe8b8]/12 bg-[#262c4d] px-3 text-xs font-semibold text-[#f8f3e6] transition-transform active:scale-[0.98]"
                  >
                    Cook
                    <ArrowRight className="h-3.5 w-3.5 text-[#fbbf24]" />
                  </button>
                )}
              </div>

              {isComplete ? (
                <button
                  type="button"
                  onClick={() => onClaimCraving(craving.id)}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] px-4 text-sm font-extrabold text-[#0b1026] shadow-[0_4px_14px_rgba(245,158,11,0.32)] transition-transform active:scale-[0.98]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Serve &amp; Claim Reward
                </button>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-[#7f86a6]">
                  <span>In progress — dishes count automatically as served</span>
                  <span className="tabular-nums font-semibold text-[#b5bad1]">
                    {Math.round(progressPct)}%
                  </span>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
