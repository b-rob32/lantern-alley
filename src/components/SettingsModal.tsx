import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Plane,
  RotateCcw,
  Smartphone,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react';

export interface SettingsModalProps {
  muted: boolean;
  haptics: boolean;
  onToggleMute: () => void;
  onToggleHaptics: () => void;
  onExportSave: () => string;
  onImportSave: (code: string) => { ok: boolean; error?: string };
  onHardReset: () => void;
  onClose: () => void;
}

export function SettingsModal({
  muted,
  haptics,
  onToggleMute,
  onToggleHaptics,
  onExportSave,
  onImportSave,
  onHardReset,
  onClose,
}: SettingsModalProps) {
  const [exportedCode, setExportedCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleCopyBackup = async () => {
    const code = onExportSave();
    setExportedCode(code);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2400);
      } else {
        setCopied(false);
      }
    } catch {
      setCopied(false);
    }
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportStatus({ ok: false, message: 'Paste a backup code first.' });
      return;
    }
    const result = onImportSave(trimmed);
    if (result.ok) {
      setImportStatus({
        ok: true,
        message: 'Save restored! Your alley is back.',
      });
      setImportText('');
    } else {
      setImportStatus({
        ok: false,
        message: result.error || 'Could not read that save code.',
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#060916]/82 p-3 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="lantern-surface flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[#ffe8b8]/14">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ffe8b8]/10 px-4 py-3">
          <h2
            id="settings-modal-title"
            className="text-base font-bold text-[#f8f3e6]"
          >
            Alley Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[#262c4d]/80 text-[#b5bad1] transition-transform active:scale-[0.96]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="lantern-scroll flex flex-col gap-4 p-4">
          {/* Audio & Haptics */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7f86a6]">
              Sound &amp; Feel
            </h3>

            <button
              type="button"
              onClick={onToggleMute}
              className="flex min-h-[50px] w-full items-center justify-between rounded-2xl border border-[#ffe8b8]/10 bg-[#0b1026]/55 px-3.5 py-2 text-left transition-transform active:scale-[0.99]"
            >
              <span className="flex items-center gap-2.5">
                <Volume2 className="h-4 w-4 text-[#fbbf24]" />
                <span>
                  <span className="block text-sm font-semibold text-[#f8f3e6]">
                    Cozy Sound SFX
                  </span>
                  <span className="block text-[11px] text-[#b5bad1]">
                    Synthesized wooden taps, chimes &amp; sizzles
                  </span>
                </span>
              </span>
              <span
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                  !muted ? 'bg-[#f59e0b]' : 'bg-[#262c4d]'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-[#f8f3e6] shadow transition-transform ${
                    !muted ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleHaptics}
              className="flex min-h-[50px] w-full items-center justify-between rounded-2xl border border-[#ffe8b8]/10 bg-[#0b1026]/55 px-3.5 py-2 text-left transition-transform active:scale-[0.99]"
            >
              <span className="flex items-center gap-2.5">
                <Vibrate className="h-4 w-4 text-[#fb923c]" />
                <span>
                  <span className="block text-sm font-semibold text-[#f8f3e6]">
                    Haptic Taps
                  </span>
                  <span className="block text-[11px] text-[#b5bad1]">
                    Gentle pulse when cooking &amp; upgrading
                  </span>
                </span>
              </span>
              <span
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                  haptics ? 'bg-[#f59e0b]' : 'bg-[#262c4d]'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-[#f8f3e6] shadow transition-transform ${
                    haptics ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </section>

          {/* Play Offline tip card */}
          <section className="rounded-2xl border border-[#fbbf24]/20 bg-[#fbbf24]/8 p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#fde68a]">
              <Plane className="h-4 w-4 text-[#fbbf24]" />
              Play Offline on Your Phone
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#b5bad1]">
              Lantern Alley runs 100% offline with zero data needed — ideal for
              flights! Install it to your home screen:
            </p>
            <div className="mt-2 flex flex-col gap-1 text-xs text-[#f8f3e6]/90">
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" />
                <span>
                  <strong>iOS Safari:</strong> Tap Share →{' '}
                  <em>Add to Home Screen</em>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#34d399]" />
                <span>
                  <strong>Android Chrome:</strong> Tap Menu ⋮ →{' '}
                  <em>Install App</em>
                </span>
              </div>
            </div>
          </section>

          {/* Offline Save Backup */}
          <section className="flex flex-col gap-2.5 rounded-2xl border border-[#ffe8b8]/10 bg-[#0b1026]/55 p-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#b5bad1]">
              Offline Save Backup
            </h3>

            <button
              type="button"
              onClick={handleCopyBackup}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#fbbf24]/30 bg-[#262c4d] px-3 text-xs font-bold text-[#fde68a] transition-transform active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[#34d399]" />
                  Copied Backup Code!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-[#fbbf24]" />
                  Copy Backup Code
                </>
              )}
            </button>

            {exportedCode && (
              <textarea
                readOnly
                value={exportedCode}
                onFocus={(e) => e.currentTarget.select()}
                rows={2}
                aria-label="Exported save backup code"
                className="w-full select-all rounded-xl border border-[#ffe8b8]/12 bg-[#151930] p-2.5 font-mono text-[11px] text-[#f8f3e6] focus:border-[#fbbf24]/50 focus:outline-none"
              />
            )}

            <div className="flex flex-col gap-2 pt-1">
              <label
                htmlFor="import-save-input"
                className="text-xs font-semibold text-[#b5bad1]"
              >
                Import Save Code
              </label>
              <textarea
                id="import-save-input"
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  if (importStatus) setImportStatus(null);
                }}
                placeholder="Paste your backup code here..."
                rows={2}
                className="w-full select-text rounded-xl border border-[#ffe8b8]/12 bg-[#151930] p-2.5 font-mono text-[11px] text-[#f8f3e6] placeholder:text-[#7f86a6] focus:border-[#fbbf24]/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleImport}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-[#fbbf24] to-[#f59e0b] px-3 text-xs font-extrabold text-[#0b1026] transition-transform active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Import Save
              </button>

              {importStatus && (
                <p
                  className={`text-xs font-semibold ${
                    importStatus.ok ? 'text-[#34d399]' : 'text-[#fb923c]'
                  }`}
                >
                  {importStatus.message}
                </p>
              )}
            </div>
          </section>

          {/* Safe 2-step Hard Reset */}
          <section className="rounded-2xl border border-[#fb923c]/20 bg-[#151930]/75 p-3.5">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[#fb923c]/25 bg-[#0b1026]/55 px-3 text-xs font-bold text-[#fb923c] transition-transform active:scale-[0.98]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Hard Reset Save Data
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs font-medium text-[#fde68a]">
                  Erase all stalls, Festival Lanterns, Heirlooms &amp; Journal?
                  This cannot be undone.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="min-h-[44px] rounded-xl border border-[#ffe8b8]/12 bg-[#262c4d] text-xs font-bold text-[#f8f3e6] transition-transform active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmReset(false);
                      onHardReset();
                    }}
                    className="min-h-[44px] rounded-xl bg-[#dc2626] text-xs font-extrabold text-[#f8f3e6] transition-transform active:scale-[0.98]"
                  >
                    Confirm Wipe
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
