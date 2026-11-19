export function formatCoins(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 1000) {
    return `${sign}${Math.floor(abs).toLocaleString()}`;
  }
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let scaled = abs;
  let unitIdx = -1;
  while (scaled >= 1000 && unitIdx < units.length - 1) {
    scaled /= 1000;
    unitIdx++;
  }
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${sign}${scaled.toFixed(decimals)}${units[unitIdx]}`;
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return '0';
  if (Math.abs(value) >= 1000) return formatCoins(value);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatStock(value: number): string {
  if (!Number.isFinite(value) || value < 0.05) return '0';
  if (value >= 1000) return formatCoins(value);
  if (value >= 100) return Math.floor(value).toString();
  return value.toFixed(1);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}
