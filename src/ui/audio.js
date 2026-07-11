(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  const SOUND_PATTERNS = Object.freeze({
    click: [[480, 0, 0.045, 'sine']],
    bid: [[420, 0, 0.08, 'triangle'], [620, 0.06, 0.09, 'triangle']],
    play: [[300, 0, 0.07, 'triangle'], [460, 0.05, 0.08, 'sine']],
    pass: [[260, 0, 0.08, 'sine'], [210, 0.07, 0.09, 'sine']],
    bomb: [[92, 0, 0.3, 'sawtooth'], [150, 0.03, 0.22, 'square'], [58, 0.08, 0.34, 'sine']],
    win: [[392, 0, 0.14, 'triangle'], [494, 0.12, 0.14, 'triangle'], [587, 0.24, 0.22, 'triangle'], [784, 0.4, 0.32, 'sine']],
    lose: [[330, 0, 0.16, 'sine'], [277, 0.14, 0.17, 'sine'], [220, 0.3, 0.28, 'triangle']],
    error: [[170, 0, 0.08, 'square'], [145, 0.08, 0.1, 'square']]
  });

  class AudioManager {
    constructor(settings) {
      this.settings = { sound: true, music: false, volume: 0.5, ...(settings || {}) };
      this.context = null;
      this.musicTimer = null;
      this.musicStep = 0;
      this.unlocked = false;
      this._unlockHandler = () => this.unlock();
      document.addEventListener('pointerdown', this._unlockHandler, { once: true, passive: true });
      document.addEventListener('keydown', this._unlockHandler, { once: true });
    }

    unlock() {
      if (this.unlocked) return;
      try {
        const AudioContextClass = global.AudioContext || global.webkitAudioContext;
        if (!AudioContextClass) return;
        this.context = this.context || new AudioContextClass();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
        this.unlocked = true;
        if (this.settings.music) this.startMusic();
      } catch (error) {
        this.context = null;
      }
    }

    configure(nextSettings) {
      this.settings = { ...this.settings, ...(nextSettings || {}) };
      if (this.settings.music) this.startMusic();
      else this.stopMusic();
    }

    _tone(frequency, offset, duration, waveform, gainScale) {
      if (!this.context) return;
      try {
        const start = this.context.currentTime + offset;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = waveform || 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        const peak = Math.max(0.0001, (gainScale || 0.1) * this.settings.volume);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(this.context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      } catch (error) {
        // Audio feedback is optional and must never interrupt the game.
      }
    }

    play(name) {
      if (!this.settings.sound) return;
      this.unlock();
      const pattern = SOUND_PATTERNS[name] || SOUND_PATTERNS.click;
      const gain = name === 'bomb' ? 0.075 : 0.055;
      pattern.forEach(([frequency, offset, duration, waveform]) => {
        this._tone(frequency, offset, duration, waveform, gain);
      });
    }

    startMusic() {
      if (!this.settings.music) return;
      this.unlock();
      if (!this.context || this.musicTimer) return;
      const melody = [196, 220, 262, 294, 330, 294, 262, 220];
      const tick = () => {
        if (!this.settings.music || !this.context) return;
        const note = melody[this.musicStep % melody.length];
        this._tone(note, 0, 0.42, 'sine', 0.012);
        this._tone(note * 1.5, 0.08, 0.28, 'triangle', 0.005);
        this.musicStep += 1;
      };
      tick();
      this.musicTimer = global.setInterval(tick, 720);
    }

    stopMusic() {
      if (this.musicTimer) global.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    destroy() {
      this.stopMusic();
      if (this.context) this.context.close().catch(() => {});
      this.context = null;
    }
  }

  DDZ.AudioManager = AudioManager;
})(globalThis);
