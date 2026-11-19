import { Clock, MoonStar } from 'lucide-react';
import { STALL_ORDER, STALLS } from '../game/data';
import { formatCoins, formatDuration } from '../game/format';
import type { OfflineSummary } from '../game/types';

export interface OfflineModalProps {
  summary: OfflineSummary;
  onClose: () => void;
}

export function OfflineModal({ summary, onClose }: OfflineModalProps) {
  const dishRows = STALL_ORDER.map((stallId) => ({
    stall: STALLS[stallId],
    count: summary.dishesByStall[stallId] ?? 0,
  })).filter((row) => row.count > 0);

  const wasCapped = summary.elapsedSeconds > summary.cappedSeconds + 5;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#060916]/82 p-4 backdrop-blur-sm"
    >
      <div className="lantern-surface flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-[#ffe8b8]/14 p-5">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fbbf24]/15 text-[#fbbf24]">
            <MoonStar className="h-6 w-6" />
          </div>
          <h2
            id="offline-modal-title"
            className="mt-2.5 text-lg font-bold text-[#f8f3e6]"
          >
            Welcome Back to the Alley
          </h2>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#0b1026]/65 px-3 py-1 text-xs font-medium text-[#b5bad1]">
            <Clock className="h-3.5 w-3.5 text-[#fbbf24]" />
            <span className="tabular-nums">
              Away for {formatDuration(summary.elapsedSeconds)}
            </span>
          </div>
          {wasCapped && (
            <p className="mt-1 text-[11px] text-[#7f86a6]">
              Counted up to your {formatDuration(summary.cappedSeconds)} night
              watch cap
            </p>
          )}
        </div>

        {/* Receipt earnings card */}
        <div className="rounded-2xl border border-[#fbbf24]/25 bg-[#0b1026]/70 p-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#b5bad1]">
            Lantern Coins Earned
          </div>
          <div className="tabular-nums mt-1 text-3xl font-extrabold text-[#fbbf24]">
            +¥{formatCoins(summary.coinsEarned)}
          </div>
          <div className="tabular-nums mt-1 text-xs font-medium text-[#34d399]">
            {formatCoins(summary.totalDishes)} warm dishes served while you
            rested
          </div>
        </div>

        {/* Per-stall breakdown */}
        {dishRows.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-[#0b1026]/50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7f86a6]">
              Night Shift Receipt
            </div>
            <div className="mt-0.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto lantern-scroll">
              {dishRows.map(({ stall, count }) => (
                <div
                  key={stall.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[#f8f3e6]">
                    <span aria-hidden="true">{stall.emoji}</span>
                    <span className="truncate font-medium">
                      {stall.dishName}
                    </span>
                  </span>
                  <span className="tabular-nums shrink-0 font-bold text-[#fde68a]">
                    ×{formatCoins(count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collect button */}
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] px-4 text-sm font-extrabold text-[#0b1026] shadow-[0_4px_16px_rgba(245,158,11,0.34)] transition-transform active:scale-[0.98]"
        >
          Collect &amp; Reopen Alley
        </button>
      </div>
    </div>
  );
}
