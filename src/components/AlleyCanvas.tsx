import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { DISTRICTS, STALLS, STALL_ORDER } from '../game/data';
import type {
  DistrictId,
  GoldenLanternState,
  StallId,
  VisualEvent,
} from '../game/types';

export interface AlleyCanvasProps {
  district: DistrictId;
  stallLevels: Record<StallId, number>;
  lanternCount: number;
  rushActive: boolean;
  goldenLantern: GoldenLanternState | null;
  visualEvents: VisualEvent[];
  onTapGoldenLantern: () => void;
  onTapStall?: (stallId: StallId) => void;
}

// ---------- Color & Geometry Helpers ----------

const hexCache = new Map<string, [number, number, number]>();

function parseHex(hex: string): [number, number, number] {
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  const num = Number.parseInt(full, 16);
  const rgb: [number, number, number] = Number.isNaN(num)
    ? [255, 190, 100]
    : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  hexCache.set(hex, rgb);
  return rgb;
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rotation = 0,
): void {
  const inner = r * 0.34;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const angle = (i * Math.PI) / 4;
    const px = Math.cos(angle) * rad;
    const py = Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function catenaryY(u: number, yLeft: number, yRight: number, sag: number): number {
  return yLeft * (1 - u) + yRight * u + 4 * sag * u * (1 - u);
}

interface StallRect {
  stallId: StallId;
  slotIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  groundY: number;
}

function getStallRect(slotIndex: number, width: number, height: number): StallRect {
  const padX = Math.max(6, width * 0.022);
  const usableW = Math.max(60, width - padX * 2);
  const slotW = usableW / 6;
  const stallW = Math.min(slotW * 0.88, height * 0.44);
  const stallH = Math.min(height * 0.28, stallW * 1.16);
  const groundY = height * 0.775;
  const cx = padX + slotW * (slotIndex + 0.5);
  return {
    stallId: STALL_ORDER[slotIndex] ?? 'yakitori',
    slotIndex,
    x: cx - stallW * 0.5,
    y: groundY - stallH,
    w: stallW,
    h: stallH,
    cx,
    groundY,
  };
}

function getGoldenLanternPosition(
  goldenLantern: GoldenLanternState,
  width: number,
  height: number,
  lanternCount: number,
): { x: number; y: number; wireY: number } {
  const clampedNorm = Math.max(0.12, Math.min(0.88, goldenLantern.xNorm));
  const x = Math.max(32, Math.min(width - 32, clampedNorm * width));
  const visible = Math.min(20, Math.max(4, Math.round(lanternCount)));
  const twoWires = visible > 10;
  const yL = twoWires ? height * 0.11 : height * 0.088;
  const yR = twoWires ? height * 0.124 : height * 0.102;
  const sag = Math.min(height * 0.135, 36);
  const wireY = catenaryY(clampedNorm, yL, yR, sag);
  const cordLen = Math.max(12, Math.min(22, height * 0.08));
  const y = Math.min(height * 0.44, wireY + cordLen + 10);
  return { x, y, wireY };
}

// ---------- Deterministic Scene Seeds ----------

interface StarSeed {
  xNorm: number;
  yNorm: number;
  size: number;
  phase: number;
  speed: number;
  warm: boolean;
  bright: boolean;
}

const STARS: StarSeed[] = Array.from({ length: 34 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  const s2 = Math.sin(i * 78.233 + 1.618) * 24634.6345;
  const s3 = Math.sin(i * 39.425 + 9.21) * 19283.421;
  const f1 = s1 - Math.floor(s1);
  const f2 = s2 - Math.floor(s2);
  const f3 = s3 - Math.floor(s3);
  return {
    xNorm: 0.03 + f1 * 0.94,
    yNorm: 0.03 + f2 * 0.41,
    size: 0.75 + f3 * 1.35,
    phase: f1 * Math.PI * 2,
    speed: 1.1 + f3 * 1.9,
    warm: i % 3 === 0,
    bright: i < 7,
  };
});

interface BuildingSeed {
  xNorm: number;
  wNorm: number;
  hNorm: number;
  tier: 0 | 1;
  hasSpire: boolean;
  windows: Array<{ rx: number; ry: number; phase: number; warm: boolean }>;
}

const SKYLINE_BUILDINGS: BuildingSeed[] = (() => {
  const specs: Array<[number, number, number, 0 | 1, boolean]> = [
    // Back tier
    [-0.02, 0.11, 0.34, 0, false],
    [0.08, 0.1, 0.42, 0, true],
    [0.19, 0.12, 0.31, 0, false],
    [0.32, 0.11, 0.45, 0, true],
    [0.45, 0.13, 0.36, 0, false],
    [0.59, 0.1, 0.47, 0, true],
    [0.7, 0.12, 0.33, 0, false],
    [0.83, 0.11, 0.41, 0, false],
    [0.92, 0.1, 0.35, 0, false],
    // Mid tier
    [0.01, 0.12, 0.25, 1, false],
    [0.14, 0.13, 0.29, 1, false],
    [0.29, 0.11, 0.22, 1, false],
    [0.42, 0.14, 0.27, 1, false],
    [0.57, 0.12, 0.24, 1, false],
    [0.71, 0.13, 0.3, 1, false],
    [0.85, 0.15, 0.26, 1, false],
  ];

  return specs.map(([xNorm, wNorm, hNorm, tier, hasSpire], bi) => {
    const windows: BuildingSeed['windows'] = [];
    const cols = tier === 0 ? 3 : 4;
    const rows = Math.max(3, Math.floor(hNorm * 16));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hash = Math.sin((bi + 1) * 31.7 + r * 17.3 + c * 43.1) * 9973.1;
        const frac = hash - Math.floor(hash);
        if (frac > 0.62) {
          windows.push({
            rx: (c + 0.5) / cols,
            ry: 0.12 + (r / Math.max(1, rows)) * 0.72,
            phase: frac * Math.PI * 2,
            warm: frac > 0.74,
          });
        }
      }
    }
    return { xNorm, wNorm, hNorm, tier, hasSpire, windows };
  });
})();

const PATRON_COATS = [
  '#2d233c',
  '#3b2535',
  '#233142',
  '#3e2b25',
  '#2d3733',
  '#432833',
  '#2a2a44',
  '#3a2e22',
];
const PATRON_ACCENTS = [
  '#d97757',
  '#e0a96d',
  '#c08497',
  '#84a98c',
  '#eab308',
  '#f4a261',
  '#a78bfa',
  '#fb7185',
];

// ---------- Dynamic Particle & Entity Types ----------

interface SteamPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  age: number;
  life: number;
  alpha: number;
  phase: number;
  tint: string;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  color: string;
  shape: 'dot' | 'star' | 'ember';
  gravity: number;
  rotation: number;
  spin: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  age: number;
  life: number;
  color: string;
}

interface FloatingLabel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  color: string;
  age: number;
  life: number;
  scale: number;
}

interface SakuraPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  swayPhase: number;
  color: string;
}

interface FireflyMote {
  xNorm: number;
  yNorm: number;
  phase: number;
  speedX: number;
  speedY: number;
  size: number;
  warmGold: boolean;
}

interface Patron {
  x: number;
  yNorm: number;
  dir: 1 | -1;
  speed: number;
  walkPhase: number;
  state: 'walking' | 'pausing';
  pauseTimer: number;
  pauseCooldown: number;
  coatColor: string;
  accentColor: string;
  hatType: 'none' | 'beanie' | 'conical' | 'bun';
  hasLantern: boolean;
  scale: number;
  retiring: boolean;
}

interface SceneState {
  width: number;
  height: number;
  time: number;
  rushBlend: number;
  steam: SteamPuff[];
  sparks: SparkParticle[];
  rings: ShockRing[];
  labels: FloatingLabel[];
  petals: SakuraPetal[];
  fireflies: FireflyMote[];
  patrons: Patron[];
  stallSteamTimers: Record<StallId, number>;
  stallBounce: Record<StallId, number>;
  stallGlowPulse: Record<StallId, number>;
  ventSteamTimer: number;
  goldenPos: { x: number; y: number; wireY: number } | null;
}

function createInitialFireflies(): FireflyMote[] {
  return Array.from({ length: 24 }, (_, i) => ({
    xNorm: (i * 0.137 + 0.05) % 1,
    yNorm: 0.16 + ((i * 0.293) % 0.72),
    phase: i * 1.17,
    speedX: 0.012 + (i % 5) * 0.005,
    speedY: 0.016 + (i % 4) * 0.006,
    size: 1.5 + (i % 3) * 0.65,
    warmGold: i % 3 !== 0,
  }));
}

function createInitialPetals(w: number, h: number): SakuraPetal[] {
  const colors = ['#fbcfe8', '#f9a8d4', '#fda4af', '#fce7f3'];
  return Array.from({ length: 28 }, (_, i) => ({
    x: ((i * 73.7) % Math.max(1, w + 40)) - 20,
    y: (i * 41.3) % Math.max(1, h * 0.9),
    vx: 14 + (i % 5) * 4.5,
    vy: 12 + (i % 4) * 3.8,
    size: 2.3 + (i % 3) * 0.95,
    angle: i * 0.9,
    spin: (i % 2 === 0 ? 1 : -1) * (1.2 + (i % 4) * 0.45),
    swayPhase: i * 1.4,
    color: colors[i % colors.length],
  }));
}

function createPatron(
  index: number,
  width: number,
  spawnAtEdge: boolean,
): Patron {
  const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;
  const hats: Patron['hatType'][] = ['none', 'beanie', 'conical', 'bun'];
  const x = spawnAtEdge
    ? dir === 1
      ? -18 - Math.random() * 24
      : width + 18 + Math.random() * 24
    : width * (0.08 + Math.random() * 0.84);
  return {
    x,
    yNorm: 0.815 + ((index * 0.037 + Math.random() * 0.04) % 0.125),
    dir,
    speed: 14 + Math.random() * 10,
    walkPhase: Math.random() * Math.PI * 2,
    state: 'walking',
    pauseTimer: 0,
    pauseCooldown: 1.5 + Math.random() * 3.5,
    coatColor: PATRON_COATS[index % PATRON_COATS.length],
    accentColor: PATRON_ACCENTS[index % PATRON_ACCENTS.length],
    hatType: hats[index % hats.length],
    hasLantern: index % 4 === 1,
    scale: 0.88 + (index % 4) * 0.06,
    retiring: false,
  };
}

function createZeroStallRecord(): Record<StallId, number> {
  return {
    yakitori: 0,
    ramen: 0,
    dumplings: 0,
    boba: 0,
    taiyaki: 0,
    izakaya: 0,
  };
}

// ---------- Component ----------

export function AlleyCanvas({
  district,
  stallLevels,
  lanternCount,
  rushActive,
  goldenLantern,
  visualEvents,
  onTapGoldenLantern,
  onTapStall,
}: AlleyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({
    district,
    stallLevels,
    lanternCount,
    rushActive,
    goldenLantern,
    onTapGoldenLantern,
    onTapStall,
  });

  useEffect(() => {
    propsRef.current = {
      district,
      stallLevels,
      lanternCount,
      rushActive,
      goldenLantern,
      onTapGoldenLantern,
      onTapStall,
    };
  }, [
    district,
    stallLevels,
    lanternCount,
    rushActive,
    goldenLantern,
    onTapGoldenLantern,
    onTapStall,
  ]);

  const sceneRef = useRef<SceneState>({
    width: 390,
    height: 240,
    time: 0,
    rushBlend: rushActive ? 1 : 0,
    steam: [],
    sparks: [],
    rings: [],
    labels: [],
    petals: createInitialPetals(390, 240),
    fireflies: createInitialFireflies(),
    patrons: Array.from({ length: 4 }, (_, i) => createPatron(i, 390, false)),
    stallSteamTimers: createZeroStallRecord(),
    stallBounce: createZeroStallRecord(),
    stallGlowPulse: createZeroStallRecord(),
    ventSteamTimer: 0,
    goldenPos: null,
  });

  const seenEventIdsRef = useRef<Set<number>>(new Set());
  const lastTappedGoldenIdRef = useRef<number | null>(null);

  // ---------- Particle Spawners ----------

  const spawnSteam = (
    x: number,
    y: number,
    count: number,
    tint = '#fff4e0',
    boost = 1,
  ) => {
    const s = sceneRef.current;
    for (let i = 0; i < count; i++) {
      if (s.steam.length >= 76) s.steam.shift();
      s.steam.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 8 * boost,
        vy: -(13 + Math.random() * 14) * boost,
        radius: 2.2 + Math.random() * 2.2,
        maxRadius: 8 + Math.random() * 6,
        age: 0,
        life: 1.35 + Math.random() * 0.9,
        alpha: 0.24 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        tint,
      });
    }
  };

  const spawnSparks = (
    x: number,
    y: number,
    count: number,
    colors: string[],
    opts?: {
      speedMin?: number;
      speedMax?: number;
      shape?: SparkParticle['shape'];
      upwardBias?: number;
      gravity?: number;
      sizeMin?: number;
      sizeMax?: number;
      lifeMin?: number;
      lifeMax?: number;
    },
  ) => {
    const s = sceneRef.current;
    const speedMin = opts?.speedMin ?? 22;
    const speedMax = opts?.speedMax ?? 62;
    const shape = opts?.shape ?? 'dot';
    const upwardBias = opts?.upwardBias ?? 18;
    const gravity = opts?.gravity ?? 42;
    const sizeMin = opts?.sizeMin ?? 1.8;
    const sizeMax = opts?.sizeMax ?? 3.6;
    const lifeMin = opts?.lifeMin ?? 0.55;
    const lifeMax = opts?.lifeMax ?? 1.05;

    for (let i = 0; i < count; i++) {
      if (s.sparks.length >= 160) s.sparks.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      s.sparks.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - upwardBias,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        age: 0,
        life: lifeMin + Math.random() * (lifeMax - lifeMin),
        color: colors[i % colors.length],
        shape,
        gravity,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 6,
      });
    }
  };

  const spawnLabel = (
    x: number,
    y: number,
    text: string,
    color = '#fef08a',
    scale = 1,
  ) => {
    const s = sceneRef.current;
    if (s.labels.length >= 24) s.labels.shift();
    const clampedX = Math.max(28, Math.min(s.width - 28, x));
    s.labels.push({
      x: clampedX,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: -(24 + Math.random() * 8),
      text,
      color,
      age: 0,
      life: 1.35,
      scale,
    });
  };

  const spawnGoldenBurst = (x: number, y: number) => {
    const s = sceneRef.current;
    spawnSparks(x, y, 22, ['#fef9c3', '#fde047', '#fbbf24', '#fb923c'], {
      speedMin: 36,
      speedMax: 112,
      shape: 'star',
      upwardBias: 10,
      gravity: 48,
      sizeMin: 3.0,
      sizeMax: 6.2,
      lifeMin: 0.7,
      lifeMax: 1.3,
    });
    spawnSparks(x, y, 12, ['#ffffff', '#fef08a', '#f59e0b'], {
      speedMin: 18,
      speedMax: 70,
      shape: 'dot',
      upwardBias: 6,
      gravity: 24,
      sizeMin: 1.6,
      sizeMax: 3.2,
    });
    s.rings.push(
      {
        x,
        y,
        radius: 6,
        maxRadius: 56,
        age: 0,
        life: 0.55,
        color: '#fde047',
      },
      {
        x,
        y,
        radius: 3,
        maxRadius: 38,
        age: 0,
        life: 0.42,
        color: '#fffbeb',
      },
    );
  };

  const spawnLanternShower = (focusX: number, focusY: number, accent?: string) => {
    const s = sceneRef.current;
    const palette = DISTRICTS[propsRef.current.district].palette;
    const showerColors = [
      '#fef08a',
      '#fbbf24',
      palette.lanternPrimary,
      accent ?? palette.lanternSecondary,
    ];
    // Focused celebratory burst
    spawnSparks(focusX, focusY, 16, showerColors, {
      speedMin: 28,
      speedMax: 84,
      shape: 'star',
      upwardBias: 36,
      gravity: 56,
      sizeMin: 2.6,
      sizeMax: 5.0,
      lifeMin: 0.75,
      lifeMax: 1.35,
    });
    // Gentle lantern-spark shower drifting across the upper alley
    for (let i = 0; i < 16; i++) {
      if (s.sparks.length >= 160) s.sparks.shift();
      s.sparks.push({
        x: s.width * (0.08 + Math.random() * 0.84),
        y: s.height * (0.14 + Math.random() * 0.22),
        vx: (Math.random() - 0.5) * 18,
        vy: 14 + Math.random() * 24,
        size: 2.2 + Math.random() * 2.6,
        age: 0,
        life: 1.0 + Math.random() * 0.8,
        color: showerColors[i % showerColors.length],
        shape: i % 2 === 0 ? 'star' : 'dot',
        gravity: 16,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 5,
      });
    }
  };

  // ---------- Process Visual Events (Never Replay Seen IDs) ----------

  useEffect(() => {
    const seen = seenEventIdsRef.current;
    const s = sceneRef.current;

    for (const ev of visualEvents) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);

      const stallDef = ev.stallId ? STALLS[ev.stallId] : undefined;
      const stallRect = stallDef
        ? getStallRect(stallDef.slotIndex, s.width, s.height)
        : null;

      switch (ev.type) {
        case 'dish_served': {
          const x = stallRect ? stallRect.cx : s.width * 0.5;
          const y = stallRect ? stallRect.y + 4 : s.height * 0.52;
          const label = ev.label ?? stallDef?.emoji ?? '✨';
          const color = ev.color ?? stallDef?.accentColor ?? '#fef08a';
          spawnLabel(x, y - 4, label, color, 1);
          spawnSparks(x, y + 4, 6, ['#fef08a', color, '#fbbf24'], {
            speedMin: 16,
            speedMax: 44,
            upwardBias: 24,
            gravity: 34,
            sizeMin: 1.6,
            sizeMax: 3.1,
            lifeMin: 0.45,
            lifeMax: 0.85,
          });
          spawnSteam(x, y + 6, 2, '#fff5e4', 1.15);
          if (ev.stallId) {
            s.stallGlowPulse[ev.stallId] = 0.7;
          }
          break;
        }
        case 'manual_prep': {
          const x = s.width * 0.5 + (Math.random() - 0.5) * 34;
          const y = s.height * 0.88;
          const tint = ev.color ?? '#fb923c';
          spawnSteam(x, y, 3, '#ffedd5', 1.25);
          spawnSparks(x, y, 7, ['#fde68a', tint, '#fbbf24'], {
            speedMin: 18,
            speedMax: 48,
            shape: 'ember',
            upwardBias: 36,
            gravity: 22,
            sizeMin: 1.7,
            sizeMax: 3.2,
            lifeMin: 0.5,
            lifeMax: 0.95,
          });
          if (ev.label) {
            spawnLabel(x, y - 10, ev.label, ev.color ?? '#fde68a', 0.95);
          }
          break;
        }
        case 'golden_lantern': {
          const gx = s.goldenPos?.x ?? s.width * 0.5;
          const gy = s.goldenPos?.y ?? s.height * 0.25;
          spawnGoldenBurst(gx, gy);
          if (ev.label) {
            spawnLabel(gx, gy - 12, ev.label, ev.color ?? '#fef08a', 1.18);
          }
          break;
        }
        case 'craving_claimed': {
          const fx = stallRect ? stallRect.cx : s.width * 0.5;
          const fy = stallRect ? stallRect.y : s.height * 0.42;
          spawnLanternShower(fx, fy, ev.color ?? stallDef?.accentColor);
          if (ev.label) {
            spawnLabel(fx, fy - 12, ev.label, ev.color ?? '#fde047', 1.15);
          }
          break;
        }
        case 'stall_bought': {
          const fx = stallRect ? stallRect.cx : s.width * 0.5;
          const fy = stallRect ? stallRect.y + stallRect.h * 0.3 : s.height * 0.55;
          spawnLanternShower(fx, fy, ev.color ?? stallDef?.accentColor);
          spawnSteam(fx, fy, 5, '#fff4e0', 1.3);
          if (ev.stallId) {
            s.stallBounce[ev.stallId] = 1;
            s.stallGlowPulse[ev.stallId] = 1;
          }
          if (ev.label) {
            spawnLabel(fx, fy - 16, ev.label, ev.color ?? '#fde68a', 1.1);
          }
          break;
        }
      }
    }

    if (seen.size > 400) {
      const currentIds = new Set(visualEvents.map((e) => e.id));
      for (const id of seen) {
        if (!currentIds.has(id)) seen.delete(id);
      }
    }
  }, [visualEvents]);

  // ---------- Pointer Interaction ----------

  const getPointerCoords = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = getPointerCoords(e);
    if (!pt) return;

    const {
      goldenLantern: gl,
      lanternCount: lc,
      stallLevels: levels,
      onTapGoldenLantern: tapGolden,
      onTapStall: tapStall,
    } = propsRef.current;
    const s = sceneRef.current;

    // 1. Check Golden Paper Lantern first (generous mobile hit radius >= 48px CSS)
    if (gl) {
      const pos = getGoldenLanternPosition(gl, s.width, s.height, lc);
      const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      if (dist <= 54) {
        if (lastTappedGoldenIdRef.current !== gl.id) {
          lastTappedGoldenIdRef.current = gl.id;
          s.goldenPos = pos;
          spawnGoldenBurst(pos.x, pos.y);
          tapGolden();
        }
        return;
      }
    }

    // 2. Check unlocked stalls
    for (let i = 0; i < STALL_ORDER.length; i++) {
      const stallId = STALL_ORDER[i];
      if ((levels[stallId] ?? 0) <= 0) continue;
      const rect = getStallRect(i, s.width, s.height);
      const pad = 6;
      if (
        pt.x >= rect.x - pad &&
        pt.x <= rect.x + rect.w + pad &&
        pt.y >= rect.y - pad &&
        pt.y <= rect.groundY + pad
      ) {
        const stallDef = STALLS[stallId];
        s.stallBounce[stallId] = 1;
        s.stallGlowPulse[stallId] = 1;
        spawnSteam(rect.cx, rect.y + rect.h * 0.28, 4, '#fff7e6', 1.35);
        spawnSparks(
          rect.cx,
          rect.y + rect.h * 0.25,
          9,
          ['#fef08a', stallDef.accentColor, '#fbbf24'],
          {
            speedMin: 22,
            speedMax: 58,
            upwardBias: 28,
            gravity: 38,
            sizeMin: 1.8,
            sizeMax: 3.4,
            lifeMin: 0.45,
            lifeMax: 0.85,
          },
        );
        tapStall?.(stallId);
        return;
      }
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getPointerCoords(e);
    if (!pt) return;

    const { goldenLantern: gl, lanternCount: lc, stallLevels: levels } = propsRef.current;
    const s = sceneRef.current;
    let interactive = false;

    if (gl) {
      const pos = getGoldenLanternPosition(gl, s.width, s.height, lc);
      if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= 54) {
        interactive = true;
      }
    }

    if (!interactive) {
      for (let i = 0; i < STALL_ORDER.length; i++) {
        const stallId = STALL_ORDER[i];
        if ((levels[stallId] ?? 0) <= 0) continue;
        const rect = getStallRect(i, s.width, s.height);
        if (
          pt.x >= rect.x - 4 &&
          pt.x <= rect.x + rect.w + 4 &&
          pt.y >= rect.y - 4 &&
          pt.y <= rect.groundY + 4
        ) {
          interactive = true;
          break;
        }
      }
    }

    canvas.style.cursor = interactive ? 'pointer' : 'default';
  };

  // ---------- Main Animation & ResizeObserver Loop ----------

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 3);

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const prevW = sceneRef.current.width;
      const prevH = sceneRef.current.height;
      if (prevW > 0 && prevH > 0 && (prevW !== w || prevH !== h)) {
        const sx = w / prevW;
        const sy = h / prevH;
        for (const p of sceneRef.current.patrons) {
          p.x *= sx;
        }
        for (const pt of sceneRef.current.petals) {
          pt.x *= sx;
          pt.y *= sy;
        }
      }
      sceneRef.current.width = w;
      sceneRef.current.height = h;
    };

    syncSize();
    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let lastTs = performance.now();

    const updateSimulation = (dt: number) => {
      const s = sceneRef.current;
      const { district: dist, stallLevels: levels, rushActive: rush } = propsRef.current;
      const w = s.width;
      const h = s.height;
      s.time += dt;

      // Smooth rush blend
      const rushTarget = rush ? 1 : 0;
      s.rushBlend += (rushTarget - s.rushBlend) * Math.min(1, dt * 3.2);

      // Update stall bounce & glow pulses + continuous steam/embers
      let unlockedCount = 0;
      const unlockedSlots: number[] = [];

      for (let i = 0; i < STALL_ORDER.length; i++) {
        const id = STALL_ORDER[i];
        const lv = levels[id] ?? 0;

        if (s.stallBounce[id] > 0) {
          s.stallBounce[id] = Math.max(0, s.stallBounce[id] - dt * 3.6);
        }
        if (s.stallGlowPulse[id] > 0) {
          s.stallGlowPulse[id] = Math.max(0, s.stallGlowPulse[id] - dt * 2.1);
        }

        if (lv > 0) {
          unlockedCount++;
          unlockedSlots.push(i);
          s.stallSteamTimers[id] -= dt * (rush ? 1.55 : 1);
          if (s.stallSteamTimers[id] <= 0) {
            const rect = getStallRect(i, w, h);
            const steamX = rect.cx + (Math.random() - 0.5) * rect.w * 0.34;
            const steamY = rect.y + rect.h * 0.24;
            const tint =
              id === 'boba'
                ? '#d1fae5'
                : id === 'taiyaki'
                  ? '#fce7f3'
                  : '#fff4e0';
            spawnSteam(steamX, steamY, 1, tint, rush ? 1.15 : 0.92);

            // Yakitori emits subtle warm rising ember sparks!
            if (id === 'yakitori') {
              spawnSparks(
                rect.cx + (Math.random() - 0.5) * rect.w * 0.3,
                rect.y + rect.h * 0.52,
                rush ? 2 : 1,
                ['#fb923c', '#f97316', '#fde047'],
                {
                  speedMin: 5,
                  speedMax: 16,
                  shape: 'ember',
                  upwardBias: 26,
                  gravity: -6,
                  sizeMin: 1.2,
                  sizeMax: 2.3,
                  lifeMin: 0.75,
                  lifeMax: 1.35,
                },
              );
            }

            const baseInterval = id === 'dumplings' || id === 'ramen' ? 0.58 : 0.85;
            s.stallSteamTimers[id] = baseInterval + Math.random() * 0.55;
          }
        }
      }

      // Neon rooftop subtle rooftop vent steam
      if (dist === 'neon-rooftop') {
        s.ventSteamTimer -= dt;
        if (s.ventSteamTimer <= 0) {
          const ventXs = [w * 0.14, w * 0.52, w * 0.86];
          const vx = ventXs[Math.floor(Math.random() * ventXs.length)];
          spawnSteam(vx, h * 0.56, 1, '#dbeafe', 0.75);
          s.ventSteamTimer = 0.65 + Math.random() * 0.6;
        }
      }

      // Sakura petals for blossom-courtyard
      if (dist === 'blossom-courtyard') {
        for (const p of s.petals) {
          p.x += (p.vx + Math.sin(s.time * 1.3 + p.swayPhase) * 9) * dt;
          p.y += p.vy * dt;
          p.angle += p.spin * dt;
          if (p.y > h + 12 || p.x > w + 24) {
            if (Math.random() < 0.55) {
              p.x = Math.random() * w * 0.9;
              p.y = -10 - Math.random() * 20;
            } else {
              p.x = -12;
              p.y = Math.random() * h * 0.55;
            }
          }
        }
      }

      // Rush fireflies / ember motes
      if (s.rushBlend > 0.02) {
        for (const f of s.fireflies) {
          f.xNorm = (f.xNorm + f.speedX * dt + Math.sin(s.time + f.phase) * 0.008 * dt + 1) % 1;
          f.yNorm -= f.speedY * dt;
          if (f.yNorm < 0.08) {
            f.yNorm = 0.86 + Math.random() * 0.08;
            f.xNorm = Math.random();
          }
        }
      }

      // Scale strolling patrons cleanly between 4 and 8 based on unlocked stalls
      const targetPatrons = Math.min(8, Math.max(4, 3 + unlockedCount));
      const activePatrons = s.patrons.filter((p) => !p.retiring);
      if (activePatrons.length < targetPatrons) {
        const needed = targetPatrons - activePatrons.length;
        for (let k = 0; k < needed; k++) {
          s.patrons.push(createPatron(s.patrons.length + k, w, true));
        }
      } else if (activePatrons.length > targetPatrons) {
        let excess = activePatrons.length - targetPatrons;
        for (let i = s.patrons.length - 1; i >= 0 && excess > 0; i--) {
          if (!s.patrons[i].retiring) {
            s.patrons[i].retiring = true;
            s.patrons[i].state = 'walking';
            excess--;
          }
        }
      }

      // Update patrons
      for (let i = s.patrons.length - 1; i >= 0; i--) {
        const p = s.patrons[i];
        if (p.state === 'pausing') {
          p.pauseTimer -= dt;
          p.walkPhase += dt * 1.4;
          if (p.pauseTimer <= 0) {
            p.state = 'walking';
            p.pauseCooldown = 3.2 + Math.random() * 4.5;
          }
        } else {
          const speedMult = rush ? 1.24 : 1;
          p.x += p.dir * p.speed * speedMult * dt;
          p.walkPhase += dt * (p.speed * 0.36) * speedMult;
          p.pauseCooldown -= dt;

          // Occasionally pause in front of an unlocked stall for ~2.5s
          if (!p.retiring && p.pauseCooldown <= 0 && unlockedSlots.length > 0) {
            for (const slot of unlockedSlots) {
              const rect = getStallRect(slot, w, h);
              if (Math.abs(p.x - rect.cx) < 8) {
                if (Math.random() < 0.42) {
                  p.state = 'pausing';
                  p.pauseTimer = 2.1 + Math.random() * 0.9;
                } else {
                  p.pauseCooldown = 1.4 + Math.random() * 2.0;
                }
                break;
              }
            }
          }

          // Wrap or retire at screen edges
          if (p.dir === 1 && p.x > w + 26) {
            if (p.retiring) {
              s.patrons.splice(i, 1);
            } else {
              p.x = -22;
              p.yNorm = 0.815 + Math.random() * 0.125;
            }
          } else if (p.dir === -1 && p.x < -26) {
            if (p.retiring) {
              s.patrons.splice(i, 1);
            } else {
              p.x = w + 22;
              p.yNorm = 0.815 + Math.random() * 0.125;
            }
          }
        }
      }

      // Update steam puffs
      for (let i = s.steam.length - 1; i >= 0; i--) {
        const st = s.steam[i];
        st.age += dt;
        if (st.age >= st.life) {
          s.steam.splice(i, 1);
          continue;
        }
        st.x += (st.vx + Math.sin(s.time * 2.6 + st.phase) * 7) * dt;
        st.y += st.vy * dt;
        st.vy *= 1 - dt * 0.25;
      }

      // Update sparks
      for (let i = s.sparks.length - 1; i >= 0; i--) {
        const sp = s.sparks[i];
        sp.age += dt;
        if (sp.age >= sp.life) {
          s.sparks.splice(i, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += sp.gravity * dt;
        sp.vx *= 1 - dt * 0.9;
        sp.rotation += sp.spin * dt;
      }

      // Update shock rings
      for (let i = s.rings.length - 1; i >= 0; i--) {
        const rg = s.rings[i];
        rg.age += dt;
        if (rg.age >= rg.life) {
          s.rings.splice(i, 1);
          continue;
        }
        const prog = rg.age / rg.life;
        rg.radius = rg.maxRadius * (1 - (1 - prog) * (1 - prog));
      }

      // Update floating labels
      for (let i = s.labels.length - 1; i >= 0; i--) {
        const lb = s.labels[i];
        lb.age += dt;
        if (lb.age >= lb.life) {
          s.labels.splice(i, 1);
          continue;
        }
        lb.x += lb.vx * dt;
        lb.y += lb.vy * dt;
        lb.vy *= 1 - dt * 1.1;
      }
    };

    // ---------- Rendering Layers ----------

    const drawSkyAndMoon = (w: number, h: number) => {
      const s = sceneRef.current;
      const { district: dist } = propsRef.current;
      const pal = DISTRICTS[dist].palette;
      const horizonY = h * 0.64;

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, pal.skyTop);
      skyGrad.addColorStop(0.52, pal.skyMid);
      skyGrad.addColorStop(0.9, pal.skyBottom);
      skyGrad.addColorStop(1, pal.horizon);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizonY + 8);

      // Subtle warm horizon haze
      const hazeGrad = ctx.createRadialGradient(
        w * 0.5,
        horizonY * 0.98,
        10,
        w * 0.5,
        horizonY * 0.98,
        w * 0.72,
      );
      hazeGrad.addColorStop(0, hexToRgba(pal.lanternPrimary, 0.14 + s.rushBlend * 0.14));
      hazeGrad.addColorStop(0.55, hexToRgba(pal.accentGlow, 0.05 + s.rushBlend * 0.07));
      hazeGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, 0, w, horizonY + 14);

      // Rush golden shimmer across sky
      if (s.rushBlend > 0.01) {
        const pulse = 0.85 + Math.sin(s.time * 2.4) * 0.15;
        const rushGrad = ctx.createRadialGradient(
          w * 0.5,
          h * 0.24,
          6,
          w * 0.5,
          h * 0.24,
          Math.max(w, h) * 0.65,
        );
        rushGrad.addColorStop(0, `rgba(255, 206, 98, ${0.15 * s.rushBlend * pulse})`);
        rushGrad.addColorStop(0.5, `rgba(251, 146, 60, ${0.07 * s.rushBlend * pulse})`);
        rushGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = rushGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Twinkling stars
      for (const st of STARS) {
        const twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(s.time * st.speed + st.phase));
        const sx = st.xNorm * w;
        const sy = st.yNorm * h;
        ctx.fillStyle = st.warm
          ? `rgba(255, 241, 204, ${twinkle * 0.9})`
          : `rgba(226, 236, 255, ${twinkle * 0.82})`;
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();

        if (st.bright && twinkle > 0.72) {
          ctx.fillStyle = `rgba(255, 248, 225, ${(twinkle - 0.6) * 0.8})`;
          drawFourPointStar(ctx, sx, sy, st.size * 2.4, 0);
        }
      }

      // Luminous crescent moon with soft atmospheric halo
      const mx = w * 0.83;
      const my = h * 0.155;
      const mr = Math.max(8.5, Math.min(15.5, h * 0.058));

      const halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4.4);
      halo.addColorStop(0, 'rgba(255, 247, 214, 0.26)');
      halo.addColorStop(0.38, 'rgba(255, 233, 180, 0.09)');
      halo.addColorStop(1, 'rgba(255, 233, 180, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 4.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(-0.34);
      ctx.beginPath();
      ctx.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2, false);
      ctx.bezierCurveTo(mr * 0.42, mr * 0.56, mr * 0.42, -mr * 0.56, 0, -mr);
      ctx.closePath();
      const moonGrad = ctx.createLinearGradient(-mr * 0.2, -mr, mr, mr);
      moonGrad.addColorStop(0, '#fffef5');
      moonGrad.addColorStop(0.65, '#fde9b0');
      moonGrad.addColorStop(1, '#f7cf78');
      ctx.fillStyle = moonGrad;
      ctx.fill();
      ctx.restore();
    };

    // ----- District 1: Lantern Alley -----
    const drawLanternAlleyBackdrop = (w: number, h: number) => {
      const s = sceneRef.current;
      const pal = DISTRICTS['lantern-alley'].palette;
      const horizonY = h * 0.62;

      // Far misty alley gable silhouettes
      ctx.fillStyle = '#14152b';
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(0, h * 0.34);
      ctx.lineTo(w * 0.18, h * 0.31);
      ctx.lineTo(w * 0.26, h * 0.38);
      ctx.lineTo(w * 0.35, h * 0.42);
      ctx.lineTo(w * 0.35, horizonY);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(w, horizonY);
      ctx.lineTo(w, h * 0.33);
      ctx.lineTo(w * 0.82, h * 0.3);
      ctx.lineTo(w * 0.72, h * 0.39);
      ctx.lineTo(w * 0.65, h * 0.42);
      ctx.lineTo(w * 0.65, horizonY);
      ctx.closePath();
      ctx.fill();

      // Distant warm temple/alley arch silhouette in the center gap
      ctx.fillStyle = '#191830';
      ctx.fillRect(w * 0.38, h * 0.46, w * 0.24, horizonY - h * 0.46);
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.47);
      ctx.quadraticCurveTo(w * 0.5, h * 0.415, w * 0.66, h * 0.47);
      ctx.lineTo(w * 0.63, h * 0.49);
      ctx.quadraticCurveTo(w * 0.5, h * 0.445, w * 0.37, h * 0.49);
      ctx.closePath();
      ctx.fill();

      // Left & Right Traditional Timber Machiya Eaves
      const drawEaveSide = (isRight: boolean) => {
        ctx.save();
        if (isRight) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }

        // Building wall mass
        ctx.fillStyle = '#121226';
        ctx.fillRect(0, h * 0.26, w * 0.23, horizonY - h * 0.26);
        ctx.fillRect(w * 0.2, h * 0.37, w * 0.13, horizonY - h * 0.37);

        // Upper curved tiled roof eave
        ctx.fillStyle = '#0d0d1c';
        ctx.beginPath();
        ctx.moveTo(-4, h * 0.23);
        ctx.lineTo(w * 0.21, h * 0.255);
        ctx.quadraticCurveTo(w * 0.265, h * 0.255, w * 0.285, h * 0.232);
        ctx.lineTo(w * 0.25, h * 0.285);
        ctx.lineTo(-4, h * 0.285);
        ctx.closePath();
        ctx.fill();

        // Lower mid-story eave
        ctx.beginPath();
        ctx.moveTo(-4, h * 0.415);
        ctx.lineTo(w * 0.29, h * 0.415);
        ctx.quadraticCurveTo(w * 0.335, h * 0.412, w * 0.355, h * 0.392);
        ctx.lineTo(w * 0.325, h * 0.445);
        ctx.lineTo(-4, h * 0.445);
        ctx.closePath();
        ctx.fill();

        // Subtle moonlight ridge highlight on eaves
        ctx.strokeStyle = 'rgba(186, 198, 240, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.235);
        ctx.lineTo(w * 0.21, h * 0.255);
        ctx.quadraticCurveTo(w * 0.265, h * 0.255, w * 0.285, h * 0.232);
        ctx.stroke();

        // Softly lit warm upper-story shoji windows
        const windows = [
          { x: w * 0.035, y: h * 0.305, ww: Math.max(15, w * 0.072), wh: Math.max(14, h * 0.088), ph: isRight ? 1.8 : 0.3 },
          { x: w * 0.125, y: h * 0.312, ww: Math.max(13, w * 0.06), wh: Math.max(13, h * 0.082), ph: isRight ? 3.9 : 2.1 },
          { x: w * 0.215, y: h * 0.46, ww: Math.max(12, w * 0.056), wh: Math.max(11, h * 0.072), ph: isRight ? 5.1 : 4.2 },
        ];

        for (const win of windows) {
          const flicker = 0.88 + 0.12 * Math.sin(s.time * 1.9 + win.ph);
          // Warm spill halo
          const spill = ctx.createRadialGradient(
            win.x + win.ww * 0.5,
            win.y + win.wh * 0.5,
            2,
            win.x + win.ww * 0.5,
            win.y + win.wh * 0.5,
            win.ww * 1.45,
          );
          spill.addColorStop(0, `rgba(255, 190, 92, ${0.24 * flicker})`);
          spill.addColorStop(1, 'rgba(255, 190, 92, 0)');
          ctx.fillStyle = spill;
          ctx.fillRect(win.x - win.ww, win.y - win.wh * 0.7, win.ww * 3, win.wh * 2.4);

          // Shoji paper glow
          const wGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.wh);
          wGrad.addColorStop(0, `rgba(255, 224, 152, ${0.78 * flicker})`);
          wGrad.addColorStop(1, `rgba(244, 158, 72, ${0.65 * flicker})`);
          ctx.fillStyle = wGrad;
          ctx.fillRect(win.x, win.y, win.ww, win.wh);

          // Delicate wooden shoji lattice bars
          ctx.strokeStyle = 'rgba(42, 24, 18, 0.72)';
          ctx.lineWidth = 1;
          ctx.strokeRect(win.x, win.y, win.ww, win.wh);
          ctx.beginPath();
          ctx.moveTo(win.x + win.ww * 0.5, win.y);
          ctx.lineTo(win.x + win.ww * 0.5, win.y + win.wh);
          ctx.moveTo(win.x, win.y + win.wh * 0.5);
          ctx.lineTo(win.x + win.ww, win.y + win.wh * 0.5);
          ctx.stroke();
        }

        ctx.restore();
      };

      drawEaveSide(false);
      drawEaveSide(true);

      // Wet cobblestone lane
      const gGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      gGrad.addColorStop(0, pal.groundTop);
      gGrad.addColorStop(1, pal.groundBottom);
      ctx.fillStyle = gGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Perspective cobblestone courses
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const t0 = r / rows;
        const y = horizonY + (h - horizonY) * (t0 * t0 * 0.55 + t0 * 0.45);
        const stoneW = 14 + t0 * 22;
        const stoneH = 3.2 + t0 * 5.2;
        const offset = (r % 2) * (stoneW * 0.5);

        ctx.fillStyle = `rgba(255, 215, 165, ${0.03 + t0 * 0.035})`;
        ctx.strokeStyle = `rgba(12, 10, 22, ${0.28 + t0 * 0.14})`;
        ctx.lineWidth = 0.9;
        for (let sx = -stoneW + offset; sx < w + stoneW; sx += stoneW) {
          drawRoundedRect(ctx, sx + 1, y, stoneW - 2.5, stoneH, 2.2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Faint wet cobblestone amber reflections along the lane
      const shimmer = 0.82 + 0.18 * Math.sin(s.time * 1.7);
      for (let i = 0; i < 6; i++) {
        const rx = w * (0.12 + i * 0.152);
        const ry = h * (0.82 + (i % 2) * 0.055);
        const rw = 26 + (i % 3) * 10;
        const refGrad = ctx.createRadialGradient(rx, ry, 2, rx, ry, rw);
        refGrad.addColorStop(0, hexToRgba(pal.lanternPrimary, 0.12 * shimmer));
        refGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = refGrad;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ----- District 2: Harbor Pier -----
    const drawHarborPierBackdrop = (w: number, h: number) => {
      const s = sceneRef.current;
      const pal = DISTRICTS['harbor-pier'].palette;
      const waterTop = h * 0.42;
      const pierTop = h * 0.675;

      // Distant dark coastal headland & island silhouettes
      ctx.fillStyle = '#0a1b2e';
      ctx.beginPath();
      ctx.moveTo(0, waterTop + 2);
      ctx.quadraticCurveTo(w * 0.14, waterTop - 16, w * 0.34, waterTop - 3);
      ctx.quadraticCurveTo(w * 0.46, waterTop - 10, w * 0.56, waterTop + 1);
      ctx.lineTo(w * 0.64, waterTop + 1);
      ctx.quadraticCurveTo(w * 0.82, waterTop - 19, w, waterTop - 6);
      ctx.lineTo(w, waterTop + 4);
      ctx.closePath();
      ctx.fill();

      // Distant warm shore/lighthouse lights
      const shoreLights = [0.09, 0.16, 0.24, 0.77, 0.86, 0.93];
      for (let i = 0; i < shoreLights.length; i++) {
        const lx = w * shoreLights[i];
        const ly = waterTop - 3 - (i % 2) * 3;
        const blink = 0.55 + 0.45 * Math.sin(s.time * (1.2 + i * 0.3) + i * 2);
        ctx.fillStyle = `rgba(255, 224, 150, ${0.72 * blink})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Moonlit harbor bay water
      const waterGrad = ctx.createLinearGradient(0, waterTop, 0, pierTop);
      waterGrad.addColorStop(0, '#091c30');
      waterGrad.addColorStop(0.45, '#12314d');
      waterGrad.addColorStop(1, '#0b1e33');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterTop, w, pierTop - waterTop + 2);

      // Gentle animated moon reflection ripples on water
      const moonX = w * 0.83;
      for (let i = 0; i < 11; i++) {
        const frac = i / 10;
        const ry = waterTop + 5 + frac * (pierTop - waterTop - 12);
        const rw = 10 + frac * 26 + Math.sin(s.time * 2.2 + i * 0.9) * 5;
        const rx = moonX + Math.sin(s.time * 1.5 + i * 1.2) * (3 + frac * 5);
        ctx.fillStyle = `rgba(254, 240, 195, ${0.26 - frac * 0.14})`;
        drawRoundedRect(ctx, rx - rw * 0.5, ry, rw, 1.6 + frac * 0.8, 1);
        ctx.fill();
      }

      // Subtle warm lantern & cyan reflections rippling across the bay
      const refBands = [0.16, 0.36, 0.54, 0.7];
      for (let b = 0; b < refBands.length; b++) {
        const bx = w * refBands[b];
        const refColor = b % 2 === 0 ? pal.lanternPrimary : pal.accentGlow;
        for (let r = 0; r < 6; r++) {
          const frac = r / 5;
          const ry = waterTop + 10 + frac * (pierTop - waterTop - 16);
          const rw = 8 + frac * 18 + Math.sin(s.time * 1.9 + b * 2 + r) * 4;
          const rx = bx + Math.sin(s.time * 1.4 + r * 1.1 + b) * 4;
          ctx.fillStyle = hexToRgba(refColor, 0.15 - frac * 0.06);
          drawRoundedRect(ctx, rx - rw * 0.5, ry, rw, 1.4, 0.7);
          ctx.fill();
        }
      }

      // 2 Silhouetted Moored Wooden Ferries gently bobbing
      const ferries = [
        { x: w * 0.24, y: waterTop + (pierTop - waterTop) * 0.44, scale: 1.0, phase: 0.4, flip: 1 },
        { x: w * 0.73, y: waterTop + (pierTop - waterTop) * 0.34, scale: 0.84, phase: 2.3, flip: -1 },
      ];

      for (const ferry of ferries) {
        const bobY = Math.sin(s.time * 1.25 + ferry.phase) * 2.1;
        const rock = Math.sin(s.time * 0.9 + ferry.phase) * 0.026;
        const fx = ferry.x;
        const fy = ferry.y + bobY;
        const sc = ferry.scale * Math.max(0.75, Math.min(1.15, w / 390));

        // Warm bow-lantern water reflection under ferry
        for (let r = 0; r < 4; r++) {
          const ry = fy + 9 * sc + r * 4;
          const rw = (14 - r * 2) * sc + Math.sin(s.time * 2.4 + r + ferry.phase) * 3;
          ctx.fillStyle = `rgba(251, 191, 36, ${0.22 - r * 0.045})`;
          ctx.fillRect(fx - rw * 0.5, ry, rw, 1.4);
        }

        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(rock);
        ctx.scale(ferry.flip * sc, sc);

        // Wooden ferry hull
        ctx.fillStyle = '#091524';
        ctx.beginPath();
        ctx.moveTo(-34, 0);
        ctx.lineTo(36, -2);
        ctx.lineTo(27, 9);
        ctx.lineTo(-27, 9);
        ctx.closePath();
        ctx.fill();

        // Cabin deckhouse
        ctx.fillStyle = '#0e1e33';
        drawRoundedRect(ctx, -18, -12, 34, 12, 2);
        ctx.fill();

        // Curved wooden cabin roof
        ctx.fillStyle = '#081220';
        ctx.beginPath();
        ctx.moveTo(-22, -11);
        ctx.quadraticCurveTo(0, -16, 20, -11);
        ctx.lineTo(18, -9);
        ctx.lineTo(-20, -9);
        ctx.closePath();
        ctx.fill();

        // Warm cabin portholes
        ctx.fillStyle = 'rgba(254, 215, 122, 0.88)';
        for (let p = 0; p < 3; p++) {
          drawRoundedRect(ctx, -13 + p * 10, -8.5, 6, 4.2, 1);
          ctx.fill();
        }

        // Bow lantern pole & warm glow
        ctx.strokeStyle = '#182b42';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(28, -2);
        ctx.lineTo(31, -13);
        ctx.stroke();

        const bGlow = ctx.createRadialGradient(31, -11, 1, 31, -11, 11);
        bGlow.addColorStop(0, 'rgba(255, 232, 160, 0.85)');
        bGlow.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = bGlow;
        ctx.beginPath();
        ctx.arc(31, -11, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(31, -11, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Wooden boardwalk pier
      const pierGrad = ctx.createLinearGradient(0, pierTop, 0, h);
      pierGrad.addColorStop(0, pal.groundTop);
      pierGrad.addColorStop(1, pal.groundBottom);
      ctx.fillStyle = pierGrad;
      ctx.fillRect(0, pierTop, w, h - pierTop);

      // Pier top edge beam highlight
      ctx.fillStyle = '#3b3035';
      ctx.fillRect(0, pierTop, w, 3.5);

      // Horizontal timber deck planks
      const plankRows = 9;
      ctx.strokeStyle = 'rgba(10, 8, 16, 0.42)';
      ctx.lineWidth = 1;
      for (let i = 1; i < plankRows; i++) {
        const t = i / plankRows;
        const py = pierTop + (h - pierTop) * (t * t * 0.35 + t * 0.65);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }

      // Mooring bollards & draped pier rope along water edge
      const posts = 7;
      ctx.strokeStyle = 'rgba(180, 155, 128, 0.32)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < posts; i++) {
        const px1 = (w / (posts - 1)) * i;
        const px2 = (w / (posts - 1)) * (i + 1);
        if (i < posts - 1) {
          ctx.beginPath();
          ctx.moveTo(px1, pierTop - 6);
          ctx.quadraticCurveTo((px1 + px2) * 0.5, pierTop + 1, px2, pierTop - 6);
          ctx.stroke();
        }
        ctx.fillStyle = '#1b141a';
        drawRoundedRect(ctx, px1 - 3.5, pierTop - 10, 7, 13, 1.8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 214, 158, 0.16)';
        ctx.fillRect(px1 - 2.5, pierTop - 9.5, 5, 1.5);
      }
    };

    // ----- District 3: Blossom Courtyard -----
    const drawBlossomCourtyardBackdrop = (w: number, h: number) => {
      const s = sceneRef.current;
      const pal = DISTRICTS['blossom-courtyard'].palette;
      const horizonY = h * 0.625;

      // Distant misty sakura hill silhouette
      ctx.fillStyle = '#201333';
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.quadraticCurveTo(w * 0.22, h * 0.48, w * 0.44, h * 0.56);
      ctx.quadraticCurveTo(w * 0.68, h * 0.45, w, h * 0.53);
      ctx.lineTo(w, horizonY);
      ctx.closePath();
      ctx.fill();

      // Silhouetted curved stone Torii gate centered in mid-distance
      const tx = w * 0.5;
      const ty = horizonY + 4;
      const th = Math.min(h * 0.34, 88);
      const tw = Math.min(w * 0.27, th * 1.18);

      ctx.save();
      ctx.fillStyle = '#1d102b';
      // Pillars (slight inward taper)
      ctx.beginPath();
      ctx.moveTo(tx - tw * 0.34, ty);
      ctx.lineTo(tx - tw * 0.3, ty - th * 0.85);
      ctx.lineTo(tx - tw * 0.22, ty - th * 0.85);
      ctx.lineTo(tx - tw * 0.24, ty);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(tx + tw * 0.34, ty);
      ctx.lineTo(tx + tw * 0.3, ty - th * 0.85);
      ctx.lineTo(tx + tw * 0.22, ty - th * 0.85);
      ctx.lineTo(tx + tw * 0.24, ty);
      ctx.closePath();
      ctx.fill();

      // Lower nuki beam
      ctx.fillRect(tx - tw * 0.42, ty - th * 0.72, tw * 0.84, Math.max(4, th * 0.085));
      // Center tablet (gakuzuka)
      ctx.fillRect(tx - tw * 0.055, ty - th * 0.88, tw * 0.11, th * 0.19);

      // Curved kasagi top lintel with upturned tips
      ctx.beginPath();
      ctx.moveTo(tx - tw * 0.56, ty - th * 0.94);
      ctx.quadraticCurveTo(tx, ty - th * 0.78, tx + tw * 0.56, ty - th * 0.94);
      ctx.lineTo(tx + tw * 0.5, ty - th * 0.82);
      ctx.quadraticCurveTo(tx, ty - th * 0.71, tx - tw * 0.5, ty - th * 0.82);
      ctx.closePath();
      ctx.fill();

      // Soft rose rim highlight on torii top
      ctx.strokeStyle = 'rgba(251, 207, 232, 0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx - tw * 0.55, ty - th * 0.94);
      ctx.quadraticCurveTo(tx, ty - th * 0.78, tx + tw * 0.55, ty - th * 0.94);
      ctx.stroke();
      ctx.restore();

      // Flanking stone garden lanterns (Toro)
      const toroXs = [w * 0.21, w * 0.79];
      for (let i = 0; i < toroXs.length; i++) {
        const lx = toroXs[i];
        const ly = horizonY + 2;
        ctx.fillStyle = '#1b1129';
        ctx.fillRect(lx - 4, ly - 16, 8, 16);
        ctx.fillRect(lx - 7, ly - 24, 14, 9);
        ctx.beginPath();
        ctx.moveTo(lx - 11, ly - 23);
        ctx.quadraticCurveTo(lx, ly - 32, lx + 11, ly - 23);
        ctx.closePath();
        ctx.fill();
        // Tiny warm candle flame inside firebox
        const fl = 0.8 + 0.2 * Math.sin(s.time * 3.8 + i * 2.1);
        ctx.fillStyle = `rgba(255, 224, 140, ${0.85 * fl})`;
        ctx.fillRect(lx - 2.5, ly - 22, 5, 5);
        const cg = ctx.createRadialGradient(lx, ly - 19.5, 1, lx, ly - 19.5, 16);
        cg.addColorStop(0, `rgba(255, 210, 125, ${0.28 * fl})`);
        cg.addColorStop(1, 'rgba(255, 210, 125, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(lx, ly - 19.5, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // Overhanging Cherry Blossom Branches (left & right)
      const sway = Math.sin(s.time * 0.95) * 3.5;
      const drawSakuraBranch = (isRight: boolean) => {
        ctx.save();
        if (isRight) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        const bSway = isRight ? -sway * 0.8 : sway;

        // Gnarled dark limb
        ctx.strokeStyle = '#1b1024';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(-6, h * 0.16);
        ctx.quadraticCurveTo(w * 0.1, h * 0.12, w * 0.23, h * 0.21 + bSway * 0.4);
        ctx.stroke();

        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.15);
        ctx.quadraticCurveTo(w * 0.15, h * 0.24, w * 0.18, h * 0.29 + bSway * 0.5);
        ctx.stroke();

        // Layered twilight blossom clusters
        const clusters = [
          { x: w * 0.04, y: h * 0.13, r: 16 },
          { x: w * 0.11, y: h * 0.11, r: 18 },
          { x: w * 0.18, y: h * 0.17, r: 15 },
          { x: w * 0.24, y: h * 0.21, r: 12 },
          { x: w * 0.16, y: h * 0.26, r: 11 },
        ];
        for (let i = 0; i < clusters.length; i++) {
          const c = clusters[i];
          const cx = c.x + bSway * (0.2 + i * 0.12);
          const cy = c.y + bSway * 0.15;
          // Deep twilight rose shadow
          ctx.fillStyle = 'rgba(157, 75, 122, 0.72)';
          ctx.beginPath();
          ctx.arc(cx, cy + 2, c.r, 0, Math.PI * 2);
          ctx.fill();
          // Soft blush sakura pink
          ctx.fillStyle = 'rgba(244, 168, 206, 0.78)';
          ctx.beginPath();
          ctx.arc(cx - 2, cy - 1, c.r * 0.76, 0, Math.PI * 2);
          ctx.fill();
          // Warm lantern-kissed pale blossom highlights
          ctx.fillStyle = 'rgba(254, 226, 240, 0.72)';
          ctx.beginPath();
          ctx.arc(cx + c.r * 0.22, cy - c.r * 0.18, c.r * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      drawSakuraBranch(false);
      drawSakuraBranch(true);

      // Courtyard flagstone ground
      const gGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      gGrad.addColorStop(0, pal.groundTop);
      gGrad.addColorStop(1, pal.groundBottom);
      ctx.fillStyle = gGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Soft garden stepping flagstones & scattered fallen sakura petals
      for (let i = 0; i < 10; i++) {
        const fx = w * (0.06 + i * 0.098);
        const fy = h * (0.82 + (i % 3) * 0.045);
        ctx.fillStyle = 'rgba(249, 168, 212, 0.05)';
        ctx.beginPath();
        ctx.ellipse(fx, fy, 15, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        const px = ((i * 67.3) % w);
        const py = horizonY + 12 + ((i * 29.7) % Math.max(10, h - horizonY - 18));
        ctx.fillStyle = 'rgba(249, 168, 212, 0.34)';
        ctx.beginPath();
        ctx.ellipse(px, py, 2.2, 1.1, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ----- District 4: Neon Rooftop -----
    const drawNeonRooftopBackdrop = (w: number, h: number) => {
      const s = sceneRef.current;
      const pal = DISTRICTS['neon-rooftop'].palette;
      const horizonY = h * 0.635;

      // Distant layered midnight city skyline (tier 0 far, tier 1 mid)
      for (const tier of [0, 1] as const) {
        const fill = tier === 0 ? '#121836' : '#0d1229';
        for (const b of SKYLINE_BUILDINGS) {
          if (b.tier !== tier) continue;
          const bx = b.xNorm * w;
          const bw = b.wNorm * w;
          const bh = b.hNorm * h;
          const by = horizonY - bh;

          ctx.fillStyle = fill;
          ctx.fillRect(bx, by, bw, bh + 4);

          // Subtle roof rim
          ctx.fillStyle = 'rgba(186, 200, 245, 0.08)';
          ctx.fillRect(bx, by, bw, 1.2);

          // Spire & gentle blinking warm aviation beacon
          if (b.hasSpire) {
            const sx = bx + bw * 0.5;
            ctx.strokeStyle = '#1c2447';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx, by);
            ctx.lineTo(sx, by - 14);
            ctx.stroke();

            const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.time * 2.1 + bx));
            ctx.fillStyle = `rgba(251, 113, 133, ${blink})`;
            ctx.beginPath();
            ctx.arc(sx, by - 14, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }

          // Twinkling warm golden windows
          const winW = Math.max(2, bw * 0.14);
          const winH = Math.max(2.2, Math.min(4.2, bh * 0.055));
          for (const win of b.windows) {
            const tw = 0.68 + 0.32 * Math.sin(s.time * 0.9 + win.phase);
            ctx.fillStyle = win.warm
              ? `rgba(253, 224, 138, ${0.62 * tw})`
              : `rgba(254, 243, 199, ${0.42 * tw})`;
            ctx.fillRect(
              bx + win.rx * bw - winW * 0.5,
              by + win.ry * bh,
              winW,
              winH,
            );
          }
        }
      }

      // Tasteful glowing coral & amber vertical signboards
      const signs = [
        { x: w * 0.06, y: h * 0.29, sw: 11, sh: 34, color: '#fb7185', ph: 0.4 },
        { x: w * 0.19, y: h * 0.35, sw: 10, sh: 28, color: '#fbbf24', ph: 1.7 },
        { x: w * 0.78, y: h * 0.33, sw: 10, sh: 30, color: '#fb923c', ph: 2.9 },
        { x: w * 0.91, y: h * 0.27, sw: 11, sh: 36, color: '#fb7185', ph: 4.1 },
      ];
      for (const sg of signs) {
        const pulse = 0.88 + 0.12 * Math.sin(s.time * 1.8 + sg.ph);
        // Soft warm sign halo
        const halo = ctx.createRadialGradient(
          sg.x + sg.sw * 0.5,
          sg.y + sg.sh * 0.5,
          2,
          sg.x + sg.sw * 0.5,
          sg.y + sg.sh * 0.5,
          sg.sh * 0.9,
        );
        halo.addColorStop(0, hexToRgba(sg.color, 0.32 * pulse));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(sg.x - sg.sh, sg.y - sg.sh * 0.5, sg.sh * 2.3, sg.sh * 2);

        // Sign frame
        ctx.fillStyle = '#19142b';
        drawRoundedRect(ctx, sg.x - 1.5, sg.y - 1.5, sg.sw + 3, sg.sh + 3, 2.5);
        ctx.fill();

        // Warm backlit sign face
        ctx.fillStyle = hexToRgba(sg.color, 0.82 * pulse);
        drawRoundedRect(ctx, sg.x, sg.y, sg.sw, sg.sh, 1.8);
        ctx.fill();

        // Stylized warm-dark vertical glyph bars inside signboard
        ctx.fillStyle = 'rgba(26, 16, 36, 0.72)';
        for (let k = 0; k < 4; k++) {
          const gy = sg.y + 4 + k * ((sg.sh - 8) / 4);
          ctx.fillRect(sg.x + 2.2, gy, sg.sw - 4.4, 2);
          ctx.fillRect(sg.x + sg.sw * 0.42, gy, 1.6, 4.5);
        }
      }

      // Rooftop exhaust vents along far ledge
      const ventXs = [w * 0.14, w * 0.52, w * 0.86];
      ctx.fillStyle = '#171c33';
      for (const vx of ventXs) {
        ctx.fillRect(vx - 8, horizonY - 12, 16, 12);
        ctx.fillStyle = 'rgba(255, 224, 178, 0.12)';
        ctx.fillRect(vx - 7, horizonY - 11, 14, 1.5);
        ctx.fillStyle = '#171c33';
      }

      // Rooftop terrace floor & parapet overlook rail
      const gGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      gGrad.addColorStop(0, pal.groundTop);
      gGrad.addColorStop(1, pal.groundBottom);
      ctx.fillStyle = gGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Subtle rooftop iron railing
      ctx.strokeStyle = 'rgba(180, 194, 235, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, horizonY - 4);
      ctx.lineTo(w, horizonY - 4);
      ctx.stroke();

      // Subtle terrace paving joints
      ctx.strokeStyle = 'rgba(8, 10, 22, 0.35)';
      ctx.lineWidth = 1;
      for (let r = 1; r <= 5; r++) {
        const py = horizonY + ((h - horizonY) * r) / 5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }
    };

    // ----- Overhead Catenary Lantern Strings -----
    const drawPaperLantern = (
      anchorX: number,
      anchorY: number,
      scale: number,
      primaryColor: string,
      phase: number,
      rushBlend: number,
    ) => {
      const s = sceneRef.current;
      const sway = Math.sin(s.time * 1.45 + phase) * (0.06 + rushBlend * 0.035);
      const tasselSway = Math.sin(s.time * 1.45 + phase - 0.65) * 0.14;
      const cord = 6.5 * scale;
      const rx = 6.6 * scale;
      const ry = 9.0 * scale;

      ctx.save();
      ctx.translate(anchorX, anchorY);
      ctx.rotate(sway);

      // Hanging cord
      ctx.strokeStyle = 'rgba(20, 14, 28, 0.85)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, cord);
      ctx.stroke();

      const cy = cord + ry + 1.5 * scale;

      // Soft warm radial halo
      const haloR = (26 + rushBlend * 11) * scale;
      const halo = ctx.createRadialGradient(0, cy, 2, 0, cy, haloR);
      halo.addColorStop(0, hexToRgba(primaryColor, 0.36 + rushBlend * 0.18));
      halo.addColorStop(0.5, hexToRgba(primaryColor, 0.11 + rushBlend * 0.08));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Paper lantern oval body with warm glowing interior gradient
      const bodyGrad = ctx.createRadialGradient(0, cy - ry * 0.12, 1, 0, cy, ry * 1.15);
      bodyGrad.addColorStop(0, '#fff9db');
      bodyGrad.addColorStop(0.42, primaryColor);
      bodyGrad.addColorStop(1, '#9a3412');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Subtle curved vertical ribs
      ctx.strokeStyle = 'rgba(92, 32, 14, 0.28)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx * 0.48, ry * 0.98, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy - ry + 1);
      ctx.lineTo(0, cy + ry - 1);
      ctx.stroke();

      // Wooden top & bottom caps
      ctx.fillStyle = '#261414';
      drawRoundedRect(ctx, -rx * 0.56, cy - ry - 1.5 * scale, rx * 1.12, 2.8 * scale, 1);
      ctx.fill();
      drawRoundedRect(ctx, -rx * 0.48, cy + ry - 1.1 * scale, rx * 0.96, 2.5 * scale, 1);
      ctx.fill();

      // Tiny swaying silk tassel
      ctx.save();
      ctx.translate(0, cy + ry + 1.3 * scale);
      ctx.rotate(tasselSway);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.1 * scale;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 5.2 * scale);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    };

    const drawOverheadLanternStrings = (w: number, h: number) => {
      const s = sceneRef.current;
      const { district: dist, lanternCount: lc } = propsRef.current;
      const pal = DISTRICTS[dist].palette;
      const visible = Math.min(20, Math.max(4, Math.round(lc)));
      const baseScale = Math.max(0.76, Math.min(1.06, Math.min(w / 390, h / 230)));

      const drawString = (
        count: number,
        yLeft: number,
        yRight: number,
        sag: number,
        layerScale: number,
        phaseOffset: number,
      ) => {
        // Catenary wire
        ctx.strokeStyle = 'rgba(18, 13, 26, 0.85)';
        ctx.lineWidth = 1.35 * layerScale;
        ctx.beginPath();
        ctx.moveTo(0, yLeft);
        ctx.quadraticCurveTo(w * 0.5, (yLeft + yRight) * 0.5 + sag * 2, w, yRight);
        ctx.stroke();

        // Lanterns evenly along wire
        for (let i = 0; i < count; i++) {
          const u = count === 1 ? 0.5 : 0.07 + (i / (count - 1)) * 0.86;
          const lx = u * w;
          const ly = catenaryY(u, yLeft, yRight, sag);
          const color =
            (i + phaseOffset) % 3 === 1 ? pal.lanternSecondary : pal.lanternPrimary;
          drawPaperLantern(
            lx,
            ly,
            baseScale * layerScale,
            color,
            i * 0.85 + phaseOffset,
            s.rushBlend,
          );
        }
      };

      if (visible <= 10) {
        drawString(
          visible,
          h * 0.088,
          h * 0.102,
          Math.min(h * 0.135, 36),
          1.0,
          0,
        );
      } else {
        const backCount = Math.floor(visible * 0.45);
        const frontCount = visible - backCount;
        drawString(
          backCount,
          h * 0.052,
          h * 0.066,
          Math.min(h * 0.085, 22),
          0.76,
          3,
        );
        drawString(
          frontCount,
          h * 0.11,
          h * 0.124,
          Math.min(h * 0.135, 36),
          1.0,
          0,
        );
      }
    };

    // ----- 6 Illustrated Market Stalls -----
    const drawStall = (rect: StallRect, level: number) => {
      const s = sceneRef.current;
      const stallDef = STALLS[rect.stallId];
      const { x, y, w, h, cx, groundY } = rect;
      const unlocked = level > 0;

      if (!unlocked) {
        // Cozy dark shadowed wooden alcove / folded awning outline
        ctx.save();
        ctx.fillStyle = 'rgba(13, 12, 24, 0.72)';
        drawRoundedRect(ctx, x + 2, y + h * 0.22, w - 4, h * 0.78, 2.5);
        ctx.fill();

        // Dark timber side posts
        ctx.fillStyle = 'rgba(26, 20, 34, 0.9)';
        ctx.fillRect(x + 2, y + h * 0.22, 3.2, h * 0.78);
        ctx.fillRect(x + w - 5.2, y + h * 0.22, 3.2, h * 0.78);

        // Shuttered wooden lower counter & folded awning slats
        ctx.strokeStyle = 'rgba(92, 86, 120, 0.22)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const sy = y + h * (0.58 + k * 0.12);
          ctx.beginPath();
          ctx.moveTo(x + 5, sy);
          ctx.lineTo(x + w - 5, sy);
          ctx.stroke();
        }

        // Folded awning / roof silhouette
        ctx.fillStyle = '#151427';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.07, y + h * 0.26);
        ctx.lineTo(x + w * 0.08, y + h * 0.06);
        ctx.lineTo(x + w * 0.92, y + h * 0.06);
        ctx.lineTo(x + w * 1.07, y + h * 0.26);
        ctx.closePath();
        ctx.fill();

        // Faint moonlight roof edge
        ctx.strokeStyle = 'rgba(176, 190, 232, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.08, y + h * 0.06);
        ctx.lineTo(x + w * 0.92, y + h * 0.06);
        ctx.stroke();

        // Tiny unlit hanging lantern silhouette
        ctx.fillStyle = 'rgba(28, 24, 42, 0.85)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.92, y + h * 0.36, 2.8, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      const bounce = s.stallBounce[rect.stallId];
      const glowPulse = s.stallGlowPulse[rect.stallId];
      const warmthBoost = 1 + glowPulse * 0.35 + s.rushBlend * 0.22;

      // Ground warm glowing light puddle beneath unlocked stall
      const poolRx = w * 0.72;
      const poolRy = Math.max(8, h * 0.18);
      const poolGrad = ctx.createRadialGradient(cx, groundY + 3, 2, cx, groundY + 3, poolRx);
      poolGrad.addColorStop(0, `rgba(255, 206, 118, ${0.34 * warmthBoost})`);
      poolGrad.addColorStop(0.55, hexToRgba(stallDef.accentColor, 0.14 * warmthBoost));
      poolGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 3, poolRx, poolRy, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      if (bounce > 0.001) {
        const spring = Math.sin(bounce * Math.PI);
        ctx.translate(cx, groundY);
        ctx.scale(1 - spring * 0.045, 1 + spring * 0.075);
        ctx.translate(-cx, -groundY);
      }

      const roofBottomY = y + h * 0.24;
      const counterTopY = y + h * 0.62;
      const innerX = x + 4;
      const innerW = w - 8;

      // Warm glowing interior window / counter light
      const intGrad = ctx.createLinearGradient(0, roofBottomY, 0, counterTopY);
      intGrad.addColorStop(0, '#fff7d6');
      intGrad.addColorStop(0.55, '#fbbf24');
      intGrad.addColorStop(1, '#c26d1c');
      ctx.fillStyle = intGrad;
      ctx.fillRect(innerX, roofBottomY, innerW, counterTopY - roofBottomY + 2);

      // Soft warm bloom around counter window
      const winBloom = ctx.createRadialGradient(
        cx,
        (roofBottomY + counterTopY) * 0.5,
        2,
        cx,
        (roofBottomY + counterTopY) * 0.5,
        w * 0.72,
      );
      winBloom.addColorStop(0, `rgba(255, 232, 162, ${0.22 * warmthBoost})`);
      winBloom.addColorStop(1, 'rgba(255, 190, 92, 0)');
      ctx.fillStyle = winBloom;
      ctx.fillRect(x - w * 0.25, y, w * 1.5, h * 1.05);

      // Charming chef silhouette bobbing subtly behind the counter
      const bobSpeed = s.rushBlend > 0.3 ? 5.2 : 2.9;
      const chefBob = Math.sin(s.time * bobSpeed + rect.slotIndex * 1.4) * 1.6;
      const chefSway = Math.cos(s.time * (bobSpeed * 0.5) + rect.slotIndex) * 1.2;
      const chefX = cx + chefSway;
      const chefBaseY = counterTopY + 1;
      const headR = Math.max(3.2, Math.min(5.2, w * 0.095));

      ctx.fillStyle = '#331b12';
      // Rounded shoulders
      ctx.beginPath();
      ctx.arc(chefX, chefBaseY + headR * 0.35 + chefBob * 0.6, headR * 1.55, Math.PI, 0, false);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(chefX, chefBaseY - headR * 1.55 + chefBob, headR, 0, Math.PI * 2);
      ctx.fill();
      // Cute white hachimaki headband
      ctx.fillStyle = 'rgba(255, 248, 235, 0.88)';
      ctx.fillRect(
        chefX - headR * 0.88,
        chefBaseY - headR * 1.9 + chefBob,
        headR * 1.76,
        Math.max(1.2, headR * 0.32),
      );

      // Stall-specific charming counter props
      if (rect.stallId === 'yakitori') {
        // Glowing charcoal grill bed
        const grillGlow = 0.75 + 0.25 * Math.sin(s.time * 6 + 1);
        ctx.fillStyle = '#29150f';
        ctx.fillRect(innerX + 2, counterTopY - 4, innerW * 0.56, 4.5);
        ctx.fillStyle = `rgba(251, 113, 36, ${0.9 * grillGlow})`;
        ctx.fillRect(innerX + 3.5, counterTopY - 3.5, innerW * 0.5, 2.2);
      } else if (rect.stallId === 'ramen') {
        // Copper stockpot & ceramic bowl
        ctx.fillStyle = '#92400e';
        drawRoundedRect(ctx, innerX + 3, counterTopY - 7, 10, 7, 1.5);
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(innerX + innerW - 7, counterTopY - 2, 4, 0, Math.PI, false);
        ctx.fill();
      } else if (rect.stallId === 'dumplings') {
        // Stacked round cedar bamboo steamers
        ctx.fillStyle = '#d99b4e';
        ctx.strokeStyle = '#6b3e18';
        ctx.lineWidth = 0.8;
        for (let st = 0; st < 2; st++) {
          drawRoundedRect(ctx, innerX + 3, counterTopY - 4.5 - st * 4, 11, 4, 1);
          ctx.fill();
          ctx.stroke();
        }
      } else if (rect.stallId === 'boba') {
        // Glowing matcha/tea canister & boba cup
        ctx.fillStyle = '#34d399';
        drawRoundedRect(ctx, innerX + 3, counterTopY - 8, 6.5, 8, 1.5);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        drawRoundedRect(ctx, innerX + innerW - 9, counterTopY - 6.5, 5, 6.5, 1);
        ctx.fill();
      } else if (rect.stallId === 'taiyaki') {
        // Warm iron taiyaki mold & golden pastry tray
        ctx.fillStyle = '#3f2724';
        ctx.fillRect(innerX + 3, counterTopY - 3.5, innerW * 0.48, 3.5);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(innerX + innerW - 8, counterTopY - 2.5, 4.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (rect.stallId === 'izakaya') {
        // Warm red-lacquer tasting tray & sake flask
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(innerX + 3, counterTopY - 3, innerW * 0.5, 3);
        ctx.fillStyle = '#fef3c7';
        drawRoundedRect(ctx, innerX + innerW - 8, counterTopY - 7, 4, 7, 1.5);
        ctx.fill();
      }

      // Distinctive colored Noren cloth curtains hanging across upper opening
      const norenCount = w > 54 ? 4 : 3;
      const norenGap = 1.6;
      const norenW = (innerW - norenGap * (norenCount - 1)) / norenCount;
      const norenH = Math.max(8, h * 0.175);
      const norenSway = Math.sin(s.time * 1.8 + rect.slotIndex * 1.1) * 1.2;

      for (let n = 0; n < norenCount; n++) {
        const nx = innerX + n * (norenW + norenGap);
        ctx.fillStyle = stallDef.norenColor;
        ctx.beginPath();
        ctx.moveTo(nx, roofBottomY);
        ctx.lineTo(nx + norenW, roofBottomY);
        ctx.lineTo(nx + norenW + norenSway, roofBottomY + norenH);
        ctx.lineTo(nx + norenSway, roofBottomY + norenH);
        ctx.closePath();
        ctx.fill();

        // Tiny cream mon/emblem dot on each curtain flap
        ctx.fillStyle = 'rgba(255, 247, 224, 0.72)';
        ctx.beginPath();
        ctx.arc(
          nx + norenW * 0.5 + norenSway * 0.55,
          roofBottomY + norenH * 0.54,
          Math.max(1.2, norenW * 0.15),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Wooden timber side pillars
      ctx.fillStyle = '#472818';
      ctx.fillRect(x + 1, roofBottomY, 3.6, groundY - roofBottomY);
      ctx.fillRect(x + w - 4.6, roofBottomY, 3.6, groundY - roofBottomY);

      // Warm wooden lower counter & plank lines
      const counterH = groundY - counterTopY;
      const woodGrad = ctx.createLinearGradient(0, counterTopY, 0, groundY);
      woodGrad.addColorStop(0, '#6b3e24');
      woodGrad.addColorStop(1, '#3b2013');
      ctx.fillStyle = woodGrad;
      ctx.fillRect(x + 1, counterTopY, w - 2, counterH);

      // Counter ledge overhang
      ctx.fillStyle = '#8c5330';
      drawRoundedRect(ctx, x - 1.5, counterTopY - 1.5, w + 3, 3.8, 1.2);
      ctx.fill();

      // Horizontal wood slats
      ctx.strokeStyle = 'rgba(32, 16, 10, 0.45)';
      ctx.lineWidth = 0.8;
      for (let sl = 1; sl <= 2; sl++) {
        const sy = counterTopY + (counterH * sl) / 3;
        ctx.beginPath();
        ctx.moveTo(x + 2, sy);
        ctx.lineTo(x + w - 2, sy);
        ctx.stroke();
      }

      // Cute small stall menu plaque on front counter
      const plaqueW = Math.min(18, w * 0.34);
      const plaqueH = Math.min(10, counterH * 0.52);
      ctx.fillStyle = '#2a1a14';
      drawRoundedRect(
        ctx,
        cx - plaqueW * 0.5,
        counterTopY + (counterH - plaqueH) * 0.52,
        plaqueW,
        plaqueH,
        1.5,
      );
      ctx.fill();
      ctx.strokeStyle = hexToRgba(stallDef.accentColor, 0.72);
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Sloped shingled roof with curved eaves
      const roofOver = w * 0.095;
      const roofGrad = ctx.createLinearGradient(0, y, 0, roofBottomY + 2);
      roofGrad.addColorStop(0, rect.stallId === 'izakaya' ? '#3d191e' : '#262034');
      roofGrad.addColorStop(1, rect.stallId === 'izakaya' ? '#240f13' : '#181422');
      ctx.fillStyle = roofGrad;
      ctx.beginPath();
      ctx.moveTo(x - roofOver, roofBottomY + 1);
      ctx.quadraticCurveTo(x - roofOver * 0.4, roofBottomY - 3, x + w * 0.08, y + 2);
      ctx.lineTo(x + w * 0.92, y + 2);
      ctx.quadraticCurveTo(x + w + roofOver * 0.4, roofBottomY - 3, x + w + roofOver, roofBottomY + 1);
      ctx.closePath();
      ctx.fill();

      // Subtle roof shingle ridges
      ctx.strokeStyle = 'rgba(255, 224, 180, 0.1)';
      ctx.lineWidth = 0.8;
      for (let sr = 1; sr <= 2; sr++) {
        const frac = sr / 3;
        const ry = y + 2 + (roofBottomY - y) * frac;
        ctx.beginPath();
        ctx.moveTo(x - roofOver * frac + 2, ry);
        ctx.lineTo(x + w + roofOver * frac - 2, ry);
        ctx.stroke();
      }

      // Roof ridge beam & warm under-eave fascia light
      ctx.fillStyle = rect.stallId === 'izakaya' ? '#b45309' : '#3a2a38';
      drawRoundedRect(ctx, x + w * 0.06, y, w * 0.88, 3, 1.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 206, 128, 0.35)';
      ctx.fillRect(x, roofBottomY - 1, w, 1.6);

      // Tiny glowing hanging stall lantern (chochin) under right eave
      const chX = x + w + roofOver * 0.25;
      const chY = roofBottomY + 6.5;
      const chSway = Math.sin(s.time * 2.1 + rect.slotIndex) * 0.8;
      const chHalo = ctx.createRadialGradient(chX + chSway, chY, 1, chX + chSway, chY, 12);
      chHalo.addColorStop(0, hexToRgba(stallDef.accentColor, 0.45 * warmthBoost));
      chHalo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = chHalo;
      ctx.beginPath();
      ctx.arc(chX + chSway, chY, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#241414';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(chX, roofBottomY);
      ctx.lineTo(chX + chSway, chY - 3.5);
      ctx.stroke();

      ctx.fillStyle = '#fff5cc';
      ctx.beginPath();
      ctx.ellipse(chX + chSway, chY, 3.1, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(stallDef.accentColor, 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    // ----- Strolling Patrons -----
    const drawPatrons = (h: number) => {
      const s = sceneRef.current;
      // Depth-sort by yNorm so foreground patrons draw cleanly over farther patrons
      const sorted = [...s.patrons].sort((a, b) => a.yNorm - b.yNorm);
      const baseScale = Math.max(0.82, Math.min(1.12, h / 235));

      for (const p of sorted) {
        const py = p.yNorm * h;
        const sc = p.scale * baseScale;
        const walking = p.state === 'walking';
        const stepBob = walking ? Math.abs(Math.sin(p.walkPhase)) * 2.2 * sc : Math.sin(p.walkPhase) * 0.45 * sc;
        const footSwing = walking ? Math.sin(p.walkPhase) * 3.0 * sc : 0;

        // Soft ground shadow
        ctx.fillStyle = 'rgba(8, 6, 16, 0.42)';
        ctx.beginPath();
        ctx.ellipse(p.x, py + 1.5, 6.2 * sc, 2.3 * sc, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(p.x, py - stepBob);

        // Little stepping feet
        ctx.fillStyle = '#14101e';
        ctx.beginPath();
        ctx.arc(-2 * sc + footSwing, 0, 1.5 * sc, 0, Math.PI * 2);
        ctx.arc(2 * sc - footSwing, 0, 1.5 * sc, 0, Math.PI * 2);
        ctx.fill();

        // Cozy haori / kimono coat body silhouette
        ctx.fillStyle = p.coatColor;
        ctx.beginPath();
        ctx.moveTo(-5.8 * sc, -1 * sc);
        ctx.quadraticCurveTo(-5.2 * sc, -12.5 * sc, 0, -13.5 * sc);
        ctx.quadraticCurveTo(5.2 * sc, -12.5 * sc, 5.8 * sc, -1 * sc);
        ctx.closePath();
        ctx.fill();

        // Obi / cozy scarf accent band
        ctx.fillStyle = p.accentColor;
        drawRoundedRect(ctx, -4.4 * sc, -11.5 * sc, 8.8 * sc, 2.3 * sc, 1);
        ctx.fill();

        // Head
        ctx.fillStyle = '#251a2b';
        ctx.beginPath();
        ctx.arc(0, -16.8 * sc, 4.1 * sc, 0, Math.PI * 2);
        ctx.fill();

        // Warm rim-light highlight along top of head & shoulders from alley lanterns
        ctx.strokeStyle = 'rgba(255, 224, 152, 0.42)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(0, -16.8 * sc, 4.1 * sc, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();

        // Hat or hair silhouette variation
        if (p.hatType === 'conical') {
          ctx.fillStyle = '#47332a';
          ctx.beginPath();
          ctx.moveTo(-7.2 * sc, -18.2 * sc);
          ctx.lineTo(0, -23.2 * sc);
          ctx.lineTo(7.2 * sc, -18.2 * sc);
          ctx.closePath();
          ctx.fill();
        } else if (p.hatType === 'beanie') {
          ctx.fillStyle = p.accentColor;
          ctx.beginPath();
          ctx.arc(0, -18.2 * sc, 4.1 * sc, Math.PI, 0, false);
          ctx.fill();
        } else if (p.hatType === 'bun') {
          ctx.fillStyle = '#1e1424';
          ctx.beginPath();
          ctx.arc(-p.dir * 2.4 * sc, -20.5 * sc, 2.0 * sc, 0, Math.PI * 2);
          ctx.fill();
        }

        // Optional tiny handheld paper lantern!
        if (p.hasLantern) {
          const lx = p.dir * 7.5 * sc;
          const ly = -8.5 * sc + Math.sin(p.walkPhase) * 0.9;
          const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 11 * sc);
          lg.addColorStop(0, 'rgba(255, 224, 130, 0.48)');
          lg.addColorStop(1, 'rgba(255, 200, 90, 0)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.arc(lx, ly, 11 * sc, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.ellipse(lx, ly, 2.3 * sc, 3.1 * sc, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    };

    // ----- Interactive Golden Paper Lantern -----
    const drawGoldenLantern = (w: number, h: number) => {
      const s = sceneRef.current;
      const { goldenLantern: gl, lanternCount: lc } = propsRef.current;
      if (!gl) {
        s.goldenPos = null;
        return;
      }

      const pos = getGoldenLanternPosition(gl, w, h, lc);
      s.goldenPos = pos;

      const remainingMs = gl.expiresAt - Date.now();
      const urgent = remainingMs > 0 && remainingMs < 3200;
      const pulseSpeed = urgent ? 6.5 : 3.2;
      const pulse = 0.5 + 0.5 * Math.sin(s.time * pulseSpeed);
      const sway = Math.sin(s.time * 2.1) * 0.085;
      const scale = Math.max(0.92, Math.min(1.18, h / 230));
      const rx = 10.5 * scale;
      const ry = 13.8 * scale;

      // Expanding pulsing golden ring
      const ringPhase = (s.time * (urgent ? 1.5 : 0.85)) % 1;
      ctx.strokeStyle = `rgba(254, 240, 138, ${(1 - ringPhase) * 0.55})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 16 * scale + ringPhase * 28 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Radiant multi-stop golden halo
      const haloR = (44 + pulse * 12) * scale;
      const halo = ctx.createRadialGradient(pos.x, pos.y, 3, pos.x, pos.y, haloR);
      halo.addColorStop(0, `rgba(255, 250, 210, ${0.72 + pulse * 0.2})`);
      halo.addColorStop(0.35, `rgba(251, 191, 36, ${0.38 + pulse * 0.16})`);
      halo.addColorStop(0.7, 'rgba(245, 158, 11, 0.12)');
      halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Hanging cord from wire to golden lantern
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.wireY);
      ctx.lineTo(pos.x, pos.y - ry);
      ctx.stroke();

      // Swaying Golden Paper Lantern body
      ctx.save();
      ctx.translate(pos.x, pos.y - ry);
      ctx.rotate(sway);

      const cy = ry;
      const bodyGrad = ctx.createRadialGradient(0, cy - 2, 1.5, 0, cy, ry * 1.12);
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(0.32, '#fef08a');
      bodyGrad.addColorStop(0.72, '#fbbf24');
      bodyGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Delicate warm gold ribs
      ctx.strokeStyle = 'rgba(146, 64, 14, 0.34)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx * 0.5, ry * 0.97, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy - ry + 1);
      ctx.lineTo(0, cy + ry - 1);
      ctx.stroke();

      // Ornate bronze-gold caps
      ctx.fillStyle = '#78350f';
      drawRoundedRect(ctx, -rx * 0.58, cy - ry - 2.2, rx * 1.16, 3.6, 1.2);
      ctx.fill();
      drawRoundedRect(ctx, -rx * 0.5, cy + ry - 1.2, rx * 1.0, 3.2, 1.2);
      ctx.fill();

      // Shimmering golden tassel
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, cy + ry + 2);
      ctx.lineTo(Math.sin(s.time * 2.5 - 0.5) * 2.2, cy + ry + 9.5 * scale);
      ctx.stroke();
      ctx.restore();

      // Orbiting sparkle dots & 4-point stars
      for (let i = 0; i < 6; i++) {
        const ang = s.time * 1.65 + (i * Math.PI * 2) / 6;
        const orbR = (19 + (i % 2) * 5) * scale;
        const ox = pos.x + Math.cos(ang) * orbR;
        const oy = pos.y + Math.sin(ang) * orbR * 0.82;
        const spAlpha = 0.55 + 0.45 * Math.sin(s.time * 4.5 + i * 1.7);
        ctx.fillStyle = `rgba(255, 251, 214, ${spAlpha})`;
        if (i % 2 === 0) {
          drawFourPointStar(ctx, ox, oy, 3.6 * scale, s.time * 1.4 + i);
        } else {
          ctx.beginPath();
          ctx.arc(ox, oy, 1.7 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Inviting "TAP!" shimmer cue pill below lantern
      const cueY = pos.y + ry + 17 * scale + Math.sin(s.time * 3.8) * 1.8;
      const cueW = 36 * scale;
      const cueH = 14.5 * scale;
      ctx.save();
      ctx.fillStyle = 'rgba(28, 16, 10, 0.78)';
      drawRoundedRect(ctx, pos.x - cueW * 0.5, cueY - cueH * 0.5, cueW, cueH, cueH * 0.5);
      ctx.fill();
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.font = `700 ${Math.round(9.5 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fef9c3';
      ctx.fillText('TAP!', pos.x, cueY + 0.5);
      ctx.restore();
    };

    // ----- Atmospheric Overlays & Event Particles -----
    const drawAtmosphereAndParticles = (w: number, h: number) => {
      const s = sceneRef.current;
      const { district: dist } = propsRef.current;

      // Drifting sakura petals (Blossom Courtyard)
      if (dist === 'blossom-courtyard') {
        for (const p of s.petals) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          const flutter = 0.55 + 0.45 * Math.cos(s.time * 3.1 + p.swayPhase);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.56 * flutter, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Soft curling steam puffs
      for (const st of s.steam) {
        const prog = st.age / st.life;
        const fade = prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8;
        const rad = st.radius + (st.maxRadius - st.radius) * prog;
        const alpha = st.alpha * Math.max(0, fade);
        const grad = ctx.createRadialGradient(st.x, st.y, 0.5, st.x, st.y, rad);
        grad.addColorStop(0, hexToRgba(st.tint, alpha));
        grad.addColorStop(1, hexToRgba(st.tint, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(st.x, st.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rush firefly / golden ember motes
      if (s.rushBlend > 0.02) {
        for (const f of s.fireflies) {
          const fx = f.xNorm * w;
          const fy = f.yNorm * h;
          const glow = 0.45 + 0.55 * Math.sin(s.time * 3.4 + f.phase);
          const alpha = glow * s.rushBlend * 0.88;
          const color = f.warmGold ? '#fde047' : '#fb923c';
          const r = f.size * 4.2;
          const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, r);
          fg.addColorStop(0, hexToRgba(color, alpha));
          fg.addColorStop(1, hexToRgba(color, 0));
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx, fy, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 252, 232, ${alpha})`;
          ctx.beginPath();
          ctx.arc(fx, fy, f.size * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Expanding shock rings (Golden Lantern bursts)
      for (const rg of s.rings) {
        const prog = rg.age / rg.life;
        ctx.strokeStyle = hexToRgba(rg.color, (1 - prog) * 0.72);
        ctx.lineWidth = 2.2 * (1 - prog * 0.6);
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Spark & star particles
      for (const sp of s.sparks) {
        const prog = sp.age / sp.life;
        const alpha = Math.max(0, 1 - prog * prog);
        ctx.fillStyle = hexToRgba(sp.color, alpha);
        if (sp.shape === 'star') {
          drawFourPointStar(ctx, sp.x, sp.y, sp.size * (1 - prog * 0.35), sp.rotation);
        } else if (sp.shape === 'ember') {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * (1 - prog * 0.45), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * (1 - prog * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Crisp floating event labels (+¥12, dish emoji, etc.)
      for (const lb of s.labels) {
        const prog = lb.age / lb.life;
        const alpha = prog < 0.14 ? prog / 0.14 : Math.max(0, 1 - (prog - 0.14) / 0.86);
        const fontSize = Math.round(12.5 * lb.scale);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(18, 12, 24, 0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(lb.text, lb.x, lb.y);
        ctx.fillStyle = lb.color;
        ctx.fillText(lb.text, lb.x, lb.y);
        ctx.restore();
      }
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      updateSimulation(dt);

      const s = sceneRef.current;
      const w = s.width;
      const h = s.height;
      const { district: dist, stallLevels: levels } = propsRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 1. Sky, twinkling stars, crescent moon, rush sky shimmer
      drawSkyAndMoon(w, h);

      // 2. Distinct animated district backdrop & ground
      switch (dist) {
        case 'lantern-alley':
          drawLanternAlleyBackdrop(w, h);
          break;
        case 'harbor-pier':
          drawHarborPierBackdrop(w, h);
          break;
        case 'blossom-courtyard':
          drawBlossomCourtyardBackdrop(w, h);
          break;
        case 'neon-rooftop':
          drawNeonRooftopBackdrop(w, h);
          break;
      }

      // 3. 6 Illustrated market stalls across the midground alley
      for (let i = 0; i < STALL_ORDER.length; i++) {
        const stallId = STALL_ORDER[i];
        const rect = getStallRect(i, w, h);
        drawStall(rect, levels[stallId] ?? 0);
      }

      // 4. Strolling night-market patrons along foreground lane
      drawPatrons(h);

      // 5. Overhead catenary lantern strings
      drawOverheadLanternStrings(w, h);

      // 6. Interactive Golden Paper Lantern (above wires so always unmistakable)
      drawGoldenLantern(w, h);

      // 7. Steam, sakura petals, rush fireflies, sparks, and floating event labels
      drawAtmosphereAndParticles(w, h);

      // Subtle cozy edge vignette framing the night market
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.min(w, h) * 0.35,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.78,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(8, 6, 18, 0.28)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none"
      style={{ touchAction: 'manipulation' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="block h-full w-full"
        aria-label="Lantern Alley night market scene"
      />
    </div>
  );
}

export default AlleyCanvas;
