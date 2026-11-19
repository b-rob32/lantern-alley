import { Flame, Settings, Volume2, VolumeX } from 'lucide-react';
import { formatCoins, formatRate } from '../game/format';

export interface TopHudProps {
  coins: number;
  coinsPerSec: number;
  festivalLanterns: number;
  rushSecondsLeft: number;
  districtName: string;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
}

export function TopHud({
  coins,
  coinsPerSec,
  festivalLanterns,
  rushSecondsLeft,
  districtName,
  muted,
  onToggleMute,
  onOpenSettings,
}: TopHudProps) {
  const rushActive = rushSecondsLeft > 0;

  return (
    <header
      className="relative z-20 shrink-0 border-b border-[#ffe8b8]/10 bg-[#0b1026]/88 px-3.5 pb-2.5 backdrop-blur-md"
      style={{ paddingTop: 'max(0.5rem, var(--safe-top))' }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-gradient-to-br from-[#fde68a] via-[#fbbf24] to-[#d97706] shadow-[0_0_8px_rgba(251,191,36,0.45)]"
              />
              <span className="tabular-nums text-xl font-bold tracking-tight text-[#f8f3e6]">
                ¥{formatCoins(coins)}
              </span>
            </div>
            <span className="tabular-nums text-xs font-semibold text-[#34d399]">
              +{formatRate(coinsPerSec)}/s
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-medium text-[#b5bad1]">
              {districtName}
            </span>

            {festivalLanterns > 0 && (
              <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-[#fb923c]/15 px-2 py-0.5 text-[11px] font-semibold text-[#fbbf24]">
                <span aria-hidden="true">🏮</span>
                {formatCoins(festivalLanterns)}
              </span>
            )}

            {rushActive && (
              <span className="animate-gentle-glow tabular-nums inline-flex items-center gap-1 rounded-full bg-[#f59e0b]/20 px-2 py-0.5 text-[11px] font-bold text-[#fbbf24] shadow-[0_0_10px_rgba(245,158,11,0.28)]">
                <Flame className="h-3 w-3 text-[#fb923c]" />
                2x RUSH · {Math.ceil(rushSecondsLeft)}s
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#ffe8b8]/10 bg-[#1e2340]/85 text-[#f8f3e6] transition-transform active:scale-[0.96]"
          >
            {muted ? (
              <VolumeX className="h-[18px] w-[18px] text-[#7f86a6]" />
            ) : (
              <Volume2 className="h-[18px] w-[18px] text-[#fbbf24]" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open alley settings"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#ffe8b8]/10 bg-[#1e2340]/85 text-[#f8f3e6] transition-transform active:scale-[0.96]"
          >
            <Settings className="h-[18px] w-[18px] text-[#b5bad1]" />
          </button>
        </div>
      </div>
    </header>
  );
}
