// @ts-nocheck
// Web Audio API Sound Effects Synthesizer for Classroom
class ClassroomSoundEffects {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Tiếng Ting đúng (Correct Chime)
  playCorrect() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.3, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.6);
    });
  }

  // Tiếng Bíp sai (Buzzer)
  playWrong() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.setValueAtTime(120, now + 0.2);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Tiếng Chuông reng reng hết giờ (Bell)
  playBell() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [800, 804, 1600, 2400].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.5);
    });
  }

  // Tiếng Trống hồi hộp (Drumroll)
  playDrumroll() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 20; i++) {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80 + Math.random() * 40, t);
      gain.gain.setValueAtTime(0.1 + (i / 20) * 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  }

  // Tiếng Vỗ tay ròn rã (Applause)
  playApplause() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * 2.5; // 2.5 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Pink/Brown noise with clapping bursts
      const burst = Math.sin(i / 1500) * 0.3 + 0.7;
      data[i] = (Math.random() * 2 - 1) * burst * Math.exp(-i / (bufferSize * 0.8));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }

  // Tiếng Kèn mừng (Fanfare / Tada)
  playFanfare() {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.15, p: 0.0 },
      { f: 659.25, d: 0.15, p: 0.15 },
      { f: 783.99, d: 0.15, p: 0.30 },
      { f: 1046.50, d: 0.6, p: 0.45 },
    ];
    notes.forEach(({ f, d, p }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now + p);
      gain.gain.setValueAtTime(0.2, now + p);
      gain.gain.exponentialRampToValueAtTime(0.001, now + p + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + p);
      osc.stop(now + p + d);
    });
  }
}

export const soundEffects = new ClassroomSoundEffects();

export type SoundEffectType = 'correct' | 'wrong' | 'bell' | 'drumroll' | 'applause' | 'fanfare' | 'tada';

export const SOUND_EFFECTS: { type: SoundEffectType; label: string; icon: string; description: string }[] = [
  { type: 'applause', label: 'Vỗ tay', icon: '👏', description: 'Tiếng vỗ tay khen ngợi' },
  { type: 'fanfare',  label: 'Kèn mừng', icon: '🎉', description: 'Tiếng kèn chúc mừng' },
  { type: 'bell',     label: 'Chuông', icon: '🔔', description: 'Tiếng chuông reo hết giờ' },
  { type: 'correct',  label: 'Ting đúng', icon: '✅', description: 'Âm thanh trả lời đúng' },
  { type: 'drumroll', label: 'Hồi hộp', icon: '🥁', description: 'Tiếng trống hồi hộp' },
  { type: 'wrong',    label: 'Bíp sai', icon: '❌', description: 'Âm thanh trả lời sai' },
];

export function playSound(type: SoundEffectType) {
  switch (type) {
    case 'correct':
      soundEffects.playCorrect();
      break;
    case 'wrong':
      soundEffects.playWrong();
      break;
    case 'bell':
      soundEffects.playBell();
      break;
    case 'drumroll':
      soundEffects.playDrumroll();
      break;
    case 'applause':
      soundEffects.playApplause();
      break;
    case 'fanfare':
    case 'tada':
      soundEffects.playFanfare();
      break;
  }
}
