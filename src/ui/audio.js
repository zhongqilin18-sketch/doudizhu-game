(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  const MEDIA_FILES = Object.freeze({ deal: '发牌.mp3', play: '出牌.mp3', select: '点牌.mp3' });
  const SOUND_PATTERNS = Object.freeze({
    start: [[330, 0, 0.1, 'triangle'], [494, 0.08, 0.12, 'triangle'], [659, 0.18, 0.18, 'sine']],
    bid: [[420, 0, 0.08, 'triangle'], [620, 0.06, 0.09, 'triangle']],
    pass: [[260, 0, 0.08, 'sine'], [210, 0.07, 0.09, 'sine']],
    bomb: [[76, 0, 0.42, 'sawtooth'], [125, 0.02, 0.32, 'square'], [48, 0.08, 0.55, 'sine']],
    rocket: [[110, 0, 0.5, 'sawtooth'], [340, 0.18, 0.38, 'sawtooth'], [680, 0.32, 0.42, 'triangle']],
    plane: [[180, 0, 0.12, 'sawtooth'], [300, 0.2, 0.13, 'sawtooth'], [520, 0.42, 0.2, 'sine']],
    win: [[392, 0, 0.14, 'triangle'], [494, 0.12, 0.14, 'triangle'], [587, 0.24, 0.22, 'triangle'], [784, 0.4, 0.32, 'sine']],
    lose: [[330, 0, 0.16, 'sine'], [277, 0.14, 0.17, 'sine'], [220, 0.3, 0.28, 'triangle']],
    error: [[170, 0, 0.08, 'square'], [145, 0.08, 0.1, 'square']]
  });

  class AudioManager {
    constructor(settings) {
      this.settings = { sound: true, music: true, soundVolume: 20, musicVolume: 20, ...(settings || {}) };
      this.context = null;
      this.compressor = null;
      this.masterGain = null;
      this.unlocked = false;
      this.activeEffects = new Set();
      this.effectSources = {};
      Object.entries(MEDIA_FILES).forEach(([name, source]) => {
        if (typeof global.Audio !== 'function') return;
        const audio = new global.Audio(source);
        audio.preload = 'auto';
        this.effectSources[name] = audio;
      });
      this.musicAudio = typeof global.Audio === 'function' ? new global.Audio('背景音乐.mp3') : null;
      if (this.musicAudio) {
        this.musicAudio.loop = true;
        this.musicAudio.preload = 'auto';
      }
      this._unlockHandler = () => this.unlock();
      document.addEventListener('pointerdown', this._unlockHandler, { once: true, passive: true });
      document.addEventListener('keydown', this._unlockHandler, { once: true });
      this.configure(this.settings);
      // 主菜单加载后先尝试播放；受浏览器自动播放政策限制时，首次用户交互
      // 会通过上方的解锁监听器再次发起播放。
      if (this.settings.music) this.startMusic();
    }

    volumeFor(kind) {
      const value = kind === 'music' ? this.settings.musicVolume : this.settings.soundVolume;
      return Math.min(1, Math.max(0, Number(value) || 0) / 30);
    }

    unlock() {
      try {
        if (!this.unlocked) {
          const AudioContextClass = global.AudioContext || global.webkitAudioContext;
          if (AudioContextClass) {
            this.context = this.context || new AudioContextClass();
            this.compressor = this.context.createDynamicsCompressor();
            this.compressor.threshold.value = -20;
            this.compressor.ratio.value = 12;
            this.masterGain = this.context.createGain();
            this.masterGain.gain.value = 0.9;
            this.compressor.connect(this.masterGain).connect(this.context.destination);
          }
          this.unlocked = true;
        }
        if (this.context && this.context.state === 'suspended') this.context.resume().catch(() => {});
        if (this.settings.music) this.startMusic();
      } catch (error) {
        this.context = null;
      }
    }

    configure(nextSettings) {
      this.settings = { ...this.settings, ...(nextSettings || {}) };
      this.settings.soundVolume = Math.min(30, Math.max(0, Number(this.settings.soundVolume) || 0));
      this.settings.musicVolume = Math.min(30, Math.max(0, Number(this.settings.musicVolume) || 0));
      if (this.musicAudio) this.musicAudio.volume = this.volumeFor('music');
      if (this.settings.music && this.unlocked) this.startMusic();
      else if (!this.settings.music) this.stopMusic();
    }

    playMedia(name) {
      const source = this.effectSources[name];
      if (!source) return;
      try {
        const audio = source.cloneNode(true);
        audio.volume = this.volumeFor('sound');
        this.activeEffects.add(audio);
        const cleanup = () => this.activeEffects.delete(audio);
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
        audio.play().catch(cleanup);
      } catch (error) {
        // 媒体音效失败时不影响牌局。
      }
    }

    _tone(frequency, offset, duration, waveform, baseGain) {
      if (!this.context || !this.compressor || this.settings.soundVolume <= 0) return;
      try {
        const start = this.context.currentTime + offset;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = waveform || 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        const peak = Math.max(0.0001, (baseGain || 0.025) * this.settings.soundVolume);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(this.compressor);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.04);
      } catch (error) {
        // 程序音效失败时不影响牌局。
      }
    }

    play(name) {
      if (!this.settings.sound || this.settings.soundVolume <= 0) return;
      this.unlock();
      if (MEDIA_FILES[name]) {
        this.playMedia(name);
        return;
      }
      const pattern = SOUND_PATTERNS[name];
      if (!pattern) return;
      const strong = ['bomb', 'rocket', 'plane'].includes(name);
      pattern.forEach(([frequency, offset, duration, waveform]) => {
        this._tone(frequency, offset, duration, waveform, strong ? 0.038 : 0.0275);
      });
    }

    startMusic() {
      if (!this.settings.music || !this.musicAudio || this.settings.musicVolume <= 0) return;
      this.musicAudio.volume = this.volumeFor('music');
      if (!this.musicAudio.paused) return;
      this.musicAudio.play().catch(() => {});
    }

    stopMusic() {
      if (this.musicAudio) this.musicAudio.pause();
    }

    destroy() {
      this.stopMusic();
      this.activeEffects.forEach((audio) => audio.pause());
      this.activeEffects.clear();
      if (this.context) this.context.close().catch(() => {});
      this.context = null;
    }
  }

  DDZ.AudioManager = AudioManager;
})(globalThis);
