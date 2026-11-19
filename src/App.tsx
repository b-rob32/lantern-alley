import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  Heart,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { playSfx, triggerHaptic } from './audio/sfx';
import { AlleyCanvas } from './components/AlleyCanvas';
import { CravingsTab } from './components/CravingsTab';
import { FestivalJournalTab } from './components/FestivalJournalTab';
import { OfflineModal } from './components/OfflineModal';
import { PrepTab, type PrepPurchaseInfo } from './components/PrepTab';
import { SettingsModal } from './components/SettingsModal';
import { StallsTab, type StallPurchaseInfo } from './components/StallsTab';
import { TopHud } from './components/TopHud';
import { UpgradesTab } from './components/UpgradesTab';
import {
  DISTRICTS,
  HEIRLOOMS,
  INGREDIENT_ORDER,
  INGREDIENTS,
  STALL_ORDER,
  STALLS,
  UPGRADES,
} from './game/data';
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
  getTotalCoinsPerSec,
  getUpgradeMultipliers,
  hostFestival,
  importSaveCode,
  isIngredientUnlocked,
  isStallUnlocked,
  isUpgradeVisible,
  loadGameFromStorage,
  manualCookStall,
  manualPrep,
  saveGameToStorage,
  selectOrUnlockDistrict,
  tapGoldenLantern,
  tickGame,
} from './game/engine';
import type {
  BulkMode,
  DistrictId,
  GameState,
  IngredientId,
  OfflineSummary,
  StallId,
  TabId,
  VisualEvent,
} from './game/types';

const TICK_MS = 100;
const AUTOSAVE_MS = 5000;
const MAX_VISUAL_EVENTS = 28;

export function App() {
  const [bootData] = useState(() => loadGameFromStorage(Date.now()));
  const [state, setState] = useState<GameState>(bootData.state);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(
    bootData.offlineSummary,
  );
  const [activeTab, setActiveTab] = useState<TabId>('stalls');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highlightedIngredient, setHighlightedIngredient] =
    useState<IngredientId | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [visualEvents, setVisualEvents] = useState<VisualEvent[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const stateRef = useRef<GameState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const pushToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const pushVisualEvents = useCallback((events: VisualEvent[]) => {
    if (events.length === 0) return;
    setVisualEvents((prev) => {
      const merged = [...prev, ...events];
      return merged.length > MAX_VISUAL_EVENTS
        ? merged.slice(merged.length - MAX_VISUAL_EVENTS)
        : merged;
    });
  }, []);

  // Main 10Hz simulation loop
  useEffect(() => {
    let lastStep = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0, (now - lastStep) / 1000);
      lastStep = now;
      setNowMs(now);

      if (dt >= 60) {
        // Woke from phone sleep/background
        const { state: next, summary } = calculateOfflineProgress(
          stateRef.current,
          now,
        );
        stateRef.current = next;
        setState(next);
        if (summary) {
          setOfflineSummary(summary);
        }
        return;
      }

      const { state: next, events } = tickGame(stateRef.current, dt, now);
      stateRef.current = next;
      setState(next);
      if (events.length > 0) {
        pushVisualEvents(events);
      }
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [pushVisualEvents]);

  // Periodic autosave + save on page hide / resume offline catch-up
  useEffect(() => {
    const saveInterval = window.setInterval(() => {
      saveGameToStorage(stateRef.current);
    }, AUTOSAVE_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveGameToStorage(stateRef.current);
      } else if (document.visibilityState === 'visible') {
        const now = Date.now();
        const elapsed = (now - stateRef.current.lastTickAt) / 1000;
        if (elapsed >= 60) {
          const { state: next, summary } = calculateOfflineProgress(
            stateRef.current,
            now,
          );
          stateRef.current = next;
          setState(next);
          if (summary) {
            setOfflineSummary(summary);
          }
        }
      }
    };

    const handlePageHide = () => {
      saveGameToStorage(stateRef.current);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(saveInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Derived metrics
  const multipliers = useMemo(
    () => getUpgradeMultipliers(state, nowMs),
    [state, nowMs],
  );
  const stallMetrics = useMemo(
    () => getAllStallMetrics(state, nowMs),
    [state, nowMs],
  );
  const prepMetrics = useMemo(
    () => getAllPrepMetrics(state, nowMs),
    [state, nowMs],
  );
  const coinsPerSec = useMemo(
    () => getTotalCoinsPerSec(state, nowMs),
    [state, nowMs],
  );
  const rushSecondsLeft = Math.max(0, (state.rushEndsAt - nowMs) / 1000);

  const stallUnlocked = useMemo(() => {
    const out = {} as Record<StallId, boolean>;
    for (const id of STALL_ORDER) {
      out[id] = isStallUnlocked(state, id);
    }
    return out;
  }, [state]);

  const prepUnlocked = useMemo(() => {
    const out = {} as Record<IngredientId, boolean>;
    for (const id of INGREDIENT_ORDER) {
      out[id] = isIngredientUnlocked(state, id);
    }
    return out;
  }, [state]);

  const stallPurchase = useMemo(() => {
    const out = {} as Record<StallId, StallPurchaseInfo>;
    for (const id of STALL_ORDER) {
      const def = STALLS[id];
      out[id] = getBulkPurchase(
        def.baseCost,
        def.costGrowth,
        state.stallLevels[id],
        state.coins,
        state.settings.bulkMode,
      );
    }
    return out;
  }, [state.coins, state.stallLevels, state.settings.bulkMode]);

  const prepPurchase = useMemo(() => {
    const out = {} as Record<IngredientId, PrepPurchaseInfo>;
    for (const id of INGREDIENT_ORDER) {
      const def = INGREDIENTS[id];
      out[id] = getBulkPurchase(
        def.baseCost,
        def.costGrowth,
        state.prepLevels[id],
        state.coins,
        state.settings.bulkMode,
      );
    }
    return out;
  }, [state.coins, state.prepLevels, state.settings.bulkMode]);

  const { availableUpgrades, purchasedUpgrades } = useMemo(() => {
    const purchasedSet = new Set(state.purchasedUpgrades);
    const available = UPGRADES.filter(
      (u) => !purchasedSet.has(u.id) && isUpgradeVisible(state, u.id),
    );
    const purchased = UPGRADES.filter((u) => purchasedSet.has(u.id));
    return { availableUpgrades: available, purchasedUpgrades: purchased };
  }, [state]);

  const pendingLanterns = useMemo(
    () => getPendingFestivalLanterns(state),
    [state],
  );
  const nextLanternThreshold = useMemo(
    () => getNextFestivalThreshold(state),
    [state],
  );
  const heirloomCosts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of HEIRLOOMS) {
      map[h.id] = getHeirloomCost(h.id, state.heirloomLevels[h.id] ?? 0);
    }
    return map;
  }, [state.heirloomLevels]);

  // Tab badge counts
  const readyCravingsCount = useMemo(
    () =>
      state.activeCravings.filter((c) => c.deliveredDishes >= c.targetDishes)
        .length,
    [state.activeCravings],
  );
  const affordableUpgradesCount = useMemo(
    () => availableUpgrades.filter((u) => state.coins >= u.cost).length,
    [availableUpgrades, state.coins],
  );
  const bottleneckCount = useMemo(
    () =>
      INGREDIENT_ORDER.filter(
        (id) => prepUnlocked[id] && prepMetrics[id].isBottleneck,
      ).length,
    [prepUnlocked, prepMetrics],
  );

  // Handlers
  const handleManualPrep = useCallback(
    (id: IngredientId) => {
      const now = Date.now();
      const { state: next, events } = manualPrep(stateRef.current, id, now);
      stateRef.current = next;
      setState(next);
      pushVisualEvents(events);
      playSfx('tap', next.settings.muted);
      triggerHaptic('light', next.settings.haptics);
    },
    [pushVisualEvents],
  );

  const handleCookStall = useCallback(
    (stallId: StallId) => {
      const now = Date.now();
      const {
        state: next,
        cooked,
        missingIngredient,
        events,
      } = manualCookStall(stateRef.current, stallId, now);
      if (cooked) {
        stateRef.current = next;
        setState(next);
        pushVisualEvents(events);
        playSfx('cook', next.settings.muted);
        triggerHaptic('light', next.settings.haptics);
      } else if (missingIngredient) {
        playSfx('error', stateRef.current.settings.muted);
        pushToast(
          `Need more ${INGREDIENTS[missingIngredient].name} — tap Prep!`,
        );
      }
    },
    [pushToast, pushVisualEvents],
  );

  const handleBuyStall = useCallback(
    (stallId: StallId) => {
      const { state: next, bought, events } = buyStall(
        stateRef.current,
        stallId,
        stateRef.current.settings.bulkMode,
      );
      if (bought > 0) {
        stateRef.current = next;
        setState(next);
        pushVisualEvents(events);
        playSfx('upgrade', next.settings.muted);
        triggerHaptic('medium', next.settings.haptics);
        saveGameToStorage(next);
      }
    },
    [pushVisualEvents],
  );

  const handleBuyPrep = useCallback((id: IngredientId) => {
    const prevLevel = stateRef.current.prepLevels[id];
    const next = buyPrep(
      stateRef.current,
      id,
      stateRef.current.settings.bulkMode,
    );
    if (next.prepLevels[id] > prevLevel) {
      stateRef.current = next;
      setState(next);
      playSfx('upgrade', next.settings.muted);
      triggerHaptic('medium', next.settings.haptics);
      saveGameToStorage(next);
    }
  }, []);

  const handleBuyUpgrade = useCallback((upgradeId: string) => {
    const prevCount = stateRef.current.purchasedUpgrades.length;
    const next = buyUpgrade(stateRef.current, upgradeId);
    if (next.purchasedUpgrades.length > prevCount) {
      stateRef.current = next;
      setState(next);
      playSfx('upgrade', next.settings.muted);
      triggerHaptic('success', next.settings.haptics);
      saveGameToStorage(next);
    }
  }, []);

  const handleClaimCraving = useCallback(
    (cravingId: string) => {
      const now = Date.now();
      const { state: next, claimed, events } = claimCraving(
        stateRef.current,
        cravingId,
        now,
      );
      if (claimed) {
        stateRef.current = next;
        setState(next);
        pushVisualEvents(events);
        playSfx('craving', next.settings.muted);
        triggerHaptic('success', next.settings.haptics);
        saveGameToStorage(next);
      }
    },
    [pushVisualEvents],
  );

  const handleTapGoldenLantern = useCallback(() => {
    const now = Date.now();
    const {
      state: next,
      rewardCoins,
      rushSeconds,
      events,
    } = tapGoldenLantern(stateRef.current, now);
    if (rewardCoins > 0 || rushSeconds > 0) {
      stateRef.current = next;
      setState(next);
      pushVisualEvents(events);
      playSfx('lantern', next.settings.muted);
      triggerHaptic('success', next.settings.haptics);
      pushToast(`Golden Lantern! 2x Night Rush for ${rushSeconds}s`);
    }
  }, [pushToast, pushVisualEvents]);

  const handleHostFestival = useCallback(() => {
    const now = Date.now();
    const prevFestivals = stateRef.current.stats.festivalsHosted;
    const next = hostFestival(stateRef.current, now);
    if (next.stats.festivalsHosted > prevFestivals) {
      stateRef.current = next;
      setState(next);
      playSfx('festival', next.settings.muted);
      triggerHaptic('success', next.settings.haptics);
      saveGameToStorage(next);
      pushToast('Grand Night Festival hosted! Lanterns earned.');
    }
  }, [pushToast]);

  const handleBuyHeirloom = useCallback((heirloomId: string) => {
    const prevLv = stateRef.current.heirloomLevels[heirloomId] ?? 0;
    const next = buyHeirloom(stateRef.current, heirloomId);
    if ((next.heirloomLevels[heirloomId] ?? 0) > prevLv) {
      stateRef.current = next;
      setState(next);
      playSfx('upgrade', next.settings.muted);
      triggerHaptic('medium', next.settings.haptics);
      saveGameToStorage(next);
    }
  }, []);

  const handleSelectOrUnlockDistrict = useCallback(
    (districtId: DistrictId) => {
      const prevDistrict = stateRef.current.activeDistrict;
      const next = selectOrUnlockDistrict(stateRef.current, districtId);
      if (next !== stateRef.current) {
        stateRef.current = next;
        setState(next);
        playSfx('festival', next.settings.muted);
        triggerHaptic('success', next.settings.haptics);
        saveGameToStorage(next);
        if (next.activeDistrict !== prevDistrict) {
          pushToast(`Moved market to ${DISTRICTS[districtId].name}!`);
        }
      }
    },
    [pushToast],
  );

  const handleSetBulkMode = useCallback((mode: BulkMode) => {
    setState((prev) => {
      const next: GameState = {
        ...prev,
        settings: { ...prev.settings, bulkMode: mode },
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setState((prev) => {
      const nextMuted = !prev.settings.muted;
      const next: GameState = {
        ...prev,
        settings: { ...prev.settings, muted: nextMuted },
      };
      stateRef.current = next;
      saveGameToStorage(next);
      if (!nextMuted) {
        playSfx('tap', false);
      }
      return next;
    });
  }, []);

  const handleToggleHaptics = useCallback(() => {
    setState((prev) => {
      const nextHaptics = !prev.settings.haptics;
      const next: GameState = {
        ...prev,
        settings: { ...prev.settings, haptics: nextHaptics },
      };
      stateRef.current = next;
      saveGameToStorage(next);
      if (nextHaptics) {
        triggerHaptic('light', true);
      }
      return next;
    });
  }, []);

  const handleJumpToPrep = useCallback((ingredientId: IngredientId) => {
    setActiveTab('prep');
    setHighlightedIngredient(ingredientId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedIngredient(null);
    }, 3200);
  }, []);

  const handleExportSave = useCallback(() => {
    return exportSaveCode(stateRef.current);
  }, []);

  const handleImportSave = useCallback((code: string) => {
    const result = importSaveCode(code, Date.now());
    if (result.ok) {
      stateRef.current = result.state;
      setState(result.state);
      saveGameToStorage(result.state);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }, []);

  const handleHardReset = useCallback(() => {
    const fresh = createInitialState(Date.now());
    stateRef.current = fresh;
    setState(fresh);
    setVisualEvents([]);
    setOfflineSummary(null);
    setSettingsOpen(false);
    setActiveTab('stalls');
    saveGameToStorage(fresh);
    pushToast('Alley reset to a fresh night.');
  }, [pushToast]);

  const navTabs: {
    id: TabId;
    label: string;
    icon: typeof Store;
    badge?: number;
    badgeTone?: 'amber' | 'jade';
  }[] = [
    { id: 'stalls', label: 'Stalls', icon: Store },
    {
      id: 'prep',
      label: 'Prep',
      icon: Flame,
      badge: bottleneckCount > 0 ? bottleneckCount : undefined,
      badgeTone: 'amber',
    },
    {
      id: 'cravings',
      label: 'Cravings',
      icon: Heart,
      badge: readyCravingsCount > 0 ? readyCravingsCount : undefined,
      badgeTone: 'jade',
    },
    {
      id: 'upgrades',
      label: 'Upgrades',
      icon: Sparkles,
      badge: affordableUpgradesCount > 0 ? affordableUpgradesCount : undefined,
      badgeTone: 'amber',
    },
    {
      id: 'festival',
      label: 'Festival',
      icon: UtensilsCrossed,
      badge: pendingLanterns > 0 ? pendingLanterns : undefined,
      badgeTone: 'amber',
    },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0b1026] text-[#f8f3e6]">
      {/* Top HUD */}
      <TopHud
        coins={state.coins}
        coinsPerSec={coinsPerSec}
        festivalLanterns={state.festivalLanterns}
        rushSecondsLeft={rushSecondsLeft}
        districtName={DISTRICTS[state.activeDistrict].name}
        muted={state.settings.muted}
        onToggleMute={handleToggleMute}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Animated Dusk Alley Viewport (~34% height, clamped smoothly for tall & compact phones) */}
      <section
        aria-label="Night Market Alley Scene"
        className="relative h-[33vh] min-h-[195px] max-h-[290px] w-full shrink-0 overflow-hidden border-b border-[#ffe8b8]/12 bg-[#0b1026]"
      >
        <AlleyCanvas
          district={state.activeDistrict}
          stallLevels={state.stallLevels}
          lanternCount={multipliers.lanternCount}
          rushActive={rushSecondsLeft > 0}
          goldenLantern={state.goldenLantern}
          visualEvents={visualEvents}
          onTapGoldenLantern={handleTapGoldenLantern}
          onTapStall={handleCookStall}
        />

        {toastMessage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-20 flex justify-center px-4">
            <div className="rounded-full border border-[#fbbf24]/30 bg-[#0b1026]/88 px-3.5 py-1.5 text-xs font-semibold text-[#fde68a] shadow-lg backdrop-blur-md">
              {toastMessage}
            </div>
          </div>
        )}
      </section>

      {/* Scrollable One-Thumb Tab Content */}
      <main className="lantern-scroll min-h-0 flex-1 bg-gradient-to-b from-[#11152c] to-[#0b1026] pb-3">
        {activeTab === 'stalls' && (
          <StallsTab
            coins={state.coins}
            bulkMode={state.settings.bulkMode}
            onSetBulkMode={handleSetBulkMode}
            stallMetrics={stallMetrics}
            stallUnlocked={stallUnlocked}
            stallPurchase={stallPurchase}
            ingredients={state.ingredients}
            onCookStall={handleCookStall}
            onBuyStall={handleBuyStall}
            onJumpToPrep={handleJumpToPrep}
          />
        )}

        {activeTab === 'prep' && (
          <PrepTab
            bulkMode={state.settings.bulkMode}
            onSetBulkMode={handleSetBulkMode}
            prepMetrics={prepMetrics}
            prepUnlocked={prepUnlocked}
            prepPurchase={prepPurchase}
            ingredients={state.ingredients}
            highlightedIngredient={highlightedIngredient}
            onManualPrep={handleManualPrep}
            onBuyPrep={handleBuyPrep}
          />
        )}

        {activeTab === 'cravings' && (
          <CravingsTab
            cravings={state.activeCravings}
            rushSecondsLeft={rushSecondsLeft}
            goldenLanternActive={state.goldenLantern !== null}
            onClaimCraving={handleClaimCraving}
            onJumpToStall={() => setActiveTab('stalls')}
          />
        )}

        {activeTab === 'upgrades' && (
          <UpgradesTab
            coins={state.coins}
            availableUpgrades={availableUpgrades}
            purchasedUpgrades={purchasedUpgrades}
            onBuyUpgrade={handleBuyUpgrade}
          />
        )}

        {activeTab === 'festival' && (
          <FestivalJournalTab
            runCoinsEarned={state.runCoinsEarned}
            festivalLanterns={state.festivalLanterns}
            pendingLanterns={pendingLanterns}
            nextLanternThreshold={nextLanternThreshold}
            heirloomLevels={state.heirloomLevels}
            heirloomCosts={heirloomCosts}
            unlockedDistricts={state.unlockedDistricts}
            activeDistrict={state.activeDistrict}
            stats={state.stats}
            metPatrons={state.metPatrons}
            onHostFestival={handleHostFestival}
            onBuyHeirloom={handleBuyHeirloom}
            onSelectOrUnlockDistrict={handleSelectOrUnlockDistrict}
          />
        )}
      </main>

      {/* Bottom One-Thumb Navigation Bar */}
      <nav
        aria-label="Market navigation"
        className="relative z-20 shrink-0 border-t border-[#ffe8b8]/12 bg-[#0d1229]/95 px-2 pt-1.5 backdrop-blur-md"
        style={{ paddingBottom: 'max(0.5rem, var(--safe-bottom))' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`nav-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  playSfx('tap', state.settings.muted);
                }}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-all active:scale-95 ${
                  active
                    ? 'bg-[#fbbf24]/16 text-[#fde68a]'
                    : 'text-[#8e95b5] hover:text-[#d7dceb]'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.3 : 1.9} />
                <span className="text-[10px] font-semibold tracking-wide">
                  {tab.label}
                </span>
                {tab.badge !== undefined && (
                  <span
                    className={`tabular-nums absolute top-1 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#0b1026] ${
                      tab.badgeTone === 'jade'
                        ? 'bg-[#34d399]'
                        : 'bg-[#fbbf24]'
                    }`}
                  >
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      {offlineSummary && (
        <OfflineModal
          summary={offlineSummary}
          onClose={() => {
            playSfx('craving', state.settings.muted);
            setOfflineSummary(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          muted={state.settings.muted}
          haptics={state.settings.haptics}
          onToggleMute={handleToggleMute}
          onToggleHaptics={handleToggleHaptics}
          onExportSave={handleExportSave}
          onImportSave={handleImportSave}
          onHardReset={handleHardReset}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
