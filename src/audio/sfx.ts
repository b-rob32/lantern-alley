export type SfxKind =
  | 'tap'
  | 'cook'
  | 'upgrade'
  | 'craving'
  | 'lantern'
  | 'festival'
  | 'error';

export type HapticKind = 'light' | 'medium' | 'success';

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioCtx) {
    const AudioCtor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      audioCtx = new AudioCtor();
    } catch {
      return null;
    }
  }

  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function playTone(
  ctx: AudioContext,
  opts: {
    type: OscillatorType;
    freqStart: number;
    freqEnd?: number;
    startTime: number;
    duration: number;
    gainPeak: number;
    attack?: number;
    filterFreq?: number;
  },
): void {
  const {
    type,
    freqStart,
    freqEnd,
    startTime,
    duration,
    gainPeak,
    attack = 0.008,
    filterFreq,
  } = opts;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      startTime + duration,
    );
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  if (filterFreq !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    osc.connect(filter);
    filter.connect(gain);
  } else {
    osc.connect(gain);
  }

  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playSfx(kind: SfxKind, muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (kind) {
    case 'tap': {
      // Soft wooden marimba tick
      playTone(ctx, {
        type: 'triangle',
        freqStart: 440,
        freqEnd: 290,
        startTime: now,
        duration: 0.048,
        gainPeak: 0.09,
        attack: 0.003,
        filterFreq: 1600,
      });
      playTone(ctx, {
        type: 'sine',
        freqStart: 880,
        freqEnd: 620,
        startTime: now,
        duration: 0.028,
        gainPeak: 0.035,
        attack: 0.002,
      });
      break;
    }

    case 'cook': {
      // Warm gentle pop + tiny filtered sizzle
      playTone(ctx, {
        type: 'sine',
        freqStart: 270,
        freqEnd: 460,
        startTime: now,
        duration: 0.075,
        gainPeak: 0.1,
        attack: 0.005,
      });

      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(3400, now);
      bandpass.Q.setValueAtTime(1.4, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, now + 0.01);
      nGain.gain.linearRampToValueAtTime(0.045, now + 0.025);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

      noise.connect(bandpass);
      bandpass.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now + 0.008);
      noise.stop(now + 0.14);
      break;
    }

    case 'upgrade': {
      // Cozy 2-note pentatonic chime (D5 -> A5)
      const notes = [587.33, 880.0];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.085;
        playTone(ctx, {
          type: 'triangle',
          freqStart: freq,
          startTime: t,
          duration: 0.26,
          gainPeak: 0.1,
          attack: 0.008,
          filterFreq: 3200,
        });
        playTone(ctx, {
          type: 'sine',
          freqStart: freq * 2,
          startTime: t,
          duration: 0.16,
          gainPeak: 0.025,
          attack: 0.006,
        });
      });
      break;
    }

    case 'craving': {
      // Joyful 3-note warm arpeggio (D5 -> F#5 -> A5)
      const notes = [587.33, 739.99, 880.0];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.08;
        const isLast = idx === notes.length - 1;
        playTone(ctx, {
          type: 'triangle',
          freqStart: freq,
          startTime: t,
          duration: isLast ? 0.42 : 0.22,
          gainPeak: 0.11,
          attack: 0.008,
          filterFreq: 3600,
        });
        playTone(ctx, {
          type: 'sine',
          freqStart: freq * 2,
          startTime: t,
          duration: isLast ? 0.34 : 0.14,
          gainPeak: 0.03,
          attack: 0.006,
        });
      });
      break;
    }

    case 'lantern': {
      // Shimmering golden bell chord
      const chord = [587.33, 880.0, 1108.73, 1318.51, 1760.0];
      chord.forEach((freq, idx) => {
        const t = now + idx * 0.035;
        playTone(ctx, {
          type: 'sine',
          freqStart: freq,
          startTime: t,
          duration: 0.72 - idx * 0.06,
          gainPeak: idx < 3 ? 0.075 : 0.04,
          attack: 0.01,
        });
      });
      break;
    }

    case 'festival': {
      // Deep resonant cozy gong + pentatonic cascade
      playTone(ctx, {
        type: 'sine',
        freqStart: 110,
        freqEnd: 106,
        startTime: now,
        duration: 1.5,
        gainPeak: 0.16,
        attack: 0.025,
      });
      playTone(ctx, {
        type: 'triangle',
        freqStart: 165,
        freqEnd: 160,
        startTime: now,
        duration: 1.25,
        gainPeak: 0.08,
        attack: 0.02,
        filterFreq: 700,
      });
      playTone(ctx, {
        type: 'sine',
        freqStart: 247,
        freqEnd: 242,
        startTime: now + 0.01,
        duration: 0.9,
        gainPeak: 0.045,
        attack: 0.015,
      });

      const cascade = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];
      cascade.forEach((freq, idx) => {
        const t = now + 0.14 + idx * 0.085;
        playTone(ctx, {
          type: 'triangle',
          freqStart: freq,
          startTime: t,
          duration: idx === cascade.length - 1 ? 0.65 : 0.34,
          gainPeak: 0.085,
          attack: 0.01,
          filterFreq: 3800,
        });
      });
      break;
    }

    case 'error': {
      // Soft muted low wooden thud
      playTone(ctx, {
        type: 'triangle',
        freqStart: 160,
        freqEnd: 92,
        startTime: now,
        duration: 0.095,
        gainPeak: 0.11,
        attack: 0.004,
        filterFreq: 340,
      });
      break;
    }
  }
}

export function triggerHaptic(kind: HapticKind, enabled: boolean): void {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }

  try {
    if (kind === 'light') {
      navigator.vibrate(10);
    } else if (kind === 'medium') {
      navigator.vibrate(20);
    } else {
      navigator.vibrate([14, 36, 22]);
    }
  } catch {
    // Ignore vibration errors on restricted browsers
  }
}
