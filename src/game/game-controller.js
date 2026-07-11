(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  const SETTINGS_KEY = 'classic-ddz-settings-v1';

  class GameController {
    constructor() {
      this.settings = this.loadSettings();
      this.engine = new DDZ.GameState({ difficulty: 'normal' });
      this.renderer = new DDZ.Renderer();
      this.audio = new DDZ.AudioManager(this.settings);
      this.animator = new DDZ.Animator();
      this.animator.setEnabled(this.settings.animations);
      this.selectedIds = new Set();
      this.sortMode = 'rank';
      this.thinking = '';
      this.aiTimer = null;
      this.sessionToken = 0;
      this.confirmAction = null;
      this.announcedRound = null;
      this.interactions = null;
    }

    init() {
      this.interactions = new DDZ.Interactions(this);
      this.interactions.bind();
      this.syncSettingsControls();
      this.renderer.render(this.engine.state, this.viewState());
      this.updateAudioButtons();
    }

    viewState() {
      return {
        selectedIds: this.selectedIds,
        sortMode: this.sortMode,
        thinking: this.thinking,
        settings: this.settings
      };
    }

    loadSettings() {
      const defaults = { sound: true, music: false, animations: true, volume: 0.5 };
      try {
        const saved = JSON.parse(global.localStorage.getItem(SETTINGS_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return defaults;
        const savedVolume = Number(saved.volume);
        return {
          sound: saved.sound !== false,
          music: saved.music === true,
          animations: saved.animations !== false,
          volume: Number.isFinite(savedVolume)
            ? Math.min(1, Math.max(0, savedVolume))
            : defaults.volume
        };
      } catch (error) {
        return defaults;
      }
    }

    persistSettings() {
      try {
        global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch (error) {
        // File URLs or privacy settings may disable storage; the game still works.
      }
    }

    syncSettingsControls() {
      const setChecked = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.checked = Boolean(value);
      };
      setChecked('menu-sound', this.settings.sound);
      setChecked('menu-music', this.settings.music);
      setChecked('setting-sound', this.settings.sound);
      setChecked('setting-music', this.settings.music);
      setChecked('setting-animations', this.settings.animations);
      const volume = document.getElementById('setting-volume');
      if (volume) volume.value = String(Math.round(this.settings.volume * 100));
      const volumeValue = document.getElementById('setting-volume-value');
      if (volumeValue) volumeValue.textContent = `${Math.round(this.settings.volume * 100)}%`;
    }

    updateSettings(partial, announce) {
      this.settings = { ...this.settings, ...partial };
      this.persistSettings();
      this.syncSettingsControls();
      this.audio.configure(this.settings);
      this.animator.setEnabled(this.settings.animations);
      this.updateAudioButtons();
      if (announce) this.renderer.showToast('设置已保存', 'success');
    }

    updateAudioButtons() {
      const sound = document.getElementById('game-sound');
      const music = document.getElementById('game-music');
      if (sound) {
        sound.classList.toggle('is-off', !this.settings.sound);
        sound.setAttribute('aria-pressed', String(this.settings.sound));
        sound.setAttribute('aria-label', `音效${this.settings.sound ? '已开启' : '已关闭'}`);
      }
      if (music) {
        music.classList.toggle('is-off', !this.settings.music);
        music.setAttribute('aria-pressed', String(this.settings.music));
        music.setAttribute('aria-label', `背景音乐${this.settings.music ? '已开启' : '已关闭'}`);
      }
    }

    startGame() {
      this.cancelAI();
      const checked = document.querySelector('input[name="difficulty"]:checked');
      const difficulty = checked ? checked.value : 'normal';
      this.engine.setDifficulty(difficulty);
      const result = this.engine.startRound();
      this.selectedIds.clear();
      this.sortMode = 'rank';
      this.thinking = '';
      this.announcedRound = null;
      this.audio.unlock();
      if (this.settings.music) this.audio.startMusic();
      this.audio.play('click');
      this.render();
      if (result.ok) this.animator.deal();
      this.scheduleAI();
    }

    render() {
      this.renderer.render(this.engine.state, this.viewState());
    }

    toggleCard(cardId) {
      const state = this.engine.state;
      if (state.phase !== 'playing' || state.currentPlayer !== 0) return;
      if (!state.players[0].hand.some((card) => card.id === cardId)) return;
      if (this.selectedIds.has(cardId)) this.selectedIds.delete(cardId);
      else this.selectedIds.add(cardId);
      this.audio.play('click');
      this.render();
    }

    sortHand() {
      this.sortMode = this.sortMode === 'rank' ? 'suit' : 'rank';
      this.audio.play('click');
      this.render();
      this.renderer.showToast(this.sortMode === 'rank' ? '已按牌力排序' : '已按花色排序');
    }

    hint() {
      const state = this.engine.state;
      if (state.phase !== 'playing' || state.currentPlayer !== 0) return;
      const move = DDZ.AIPlayer.hint(state, 0);
      if (!move) {
        this.selectedIds.clear();
        this.render();
        this.renderer.showToast('没有能压过的牌，可以选择不出', 'info');
        return;
      }
      this.selectedIds = new Set(move.cards.map((card) => card.id));
      this.audio.play('click');
      this.render();
      this.renderer.showToast(`提示：${move.pattern.name}`);
    }

    submitPlay() {
      const result = this.engine.playCards(0, [...this.selectedIds]);
      if (!result.ok) return this.handleFailure(result);
      this.selectedIds.clear();
      this.audio.play(result.pattern.type === 'bomb' || result.pattern.type === 'rocket' ? 'bomb' : 'play');
      this.render();
      this.animator.play();
      this.animator.special(result.pattern);
      this.afterAction(result);
      return result;
    }

    pass() {
      const result = this.engine.passTurn(0);
      if (!result.ok) return this.handleFailure(result);
      this.selectedIds.clear();
      this.audio.play('pass');
      this.render();
      this.scheduleAI();
      return result;
    }

    bid(score) {
      const result = this.engine.placeBid(0, Number(score));
      if (!result.ok) return this.handleFailure(result);
      this.audio.play(score ? 'bid' : 'pass');
      this.render();
      if (result.redealt) {
        this.renderer.showToast('三家都不叫，已重新洗牌发牌');
        this.animator.deal();
      }
      this.scheduleAI();
      return result;
    }

    handleFailure(result) {
      this.audio.play('error');
      this.animator.invalid();
      this.renderer.showToast(result.message || '操作未成功', 'error');
      return result;
    }

    afterAction(result) {
      if (result.finished || this.engine.state.phase === 'finished') {
        this.finishRound();
      } else {
        this.scheduleAI();
      }
    }

    finishRound() {
      this.cancelAI();
      const state = this.engine.state;
      if (this.announcedRound === state.roundId) return;
      this.announcedRound = state.roundId;
      this.audio.play(state.result && state.result.humanWon ? 'win' : 'lose');
      this.render();
      this.renderer.openModal('modal-result');
      this.animator.result();
    }

    scheduleAI() {
      this.cancelAITimerOnly();
      const state = this.engine.state;
      if (!['bidding', 'playing'].includes(state.phase)) return;
      const playerIndex = state.currentPlayer;
      const player = state.players[playerIndex];
      if (!player || player.isHuman) {
        this.thinking = '';
        this.render();
        return;
      }

      const token = this.sessionToken;
      const roundId = state.roundId;
      const revision = state.revision;
      this.thinking = `${player.name} 正在思考…`;
      this.render();
      const delayByDifficulty = { easy: 420, normal: 620, hard: 780 };
      const delay = delayByDifficulty[state.difficulty] || 620;
      this.aiTimer = global.setTimeout(() => {
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.revision !== revision || current.currentPlayer !== playerIndex) return;
        this.thinking = '';
        let result;
        if (current.phase === 'bidding') {
          const score = DDZ.AIPlayer.decideBid(current, playerIndex);
          result = this.engine.placeBid(playerIndex, score);
          if (result.ok) this.audio.play(score ? 'bid' : 'pass');
        } else if (current.phase === 'playing') {
          const move = DDZ.AIPlayer.decideMove(current, playerIndex);
          if (move) {
            result = this.engine.playCards(playerIndex, move.cards.map((card) => card.id));
            if (result.ok) {
              this.audio.play(result.pattern.type === 'bomb' || result.pattern.type === 'rocket' ? 'bomb' : 'play');
              this.animator.special(result.pattern);
              this.animator.play();
            }
          } else {
            result = this.engine.passTurn(playerIndex);
            if (result.ok) this.audio.play('pass');
          }
        }

        if (!result || !result.ok) {
          this.renderer.showToast(result ? result.message : 'AI 操作失败', 'error');
          this.render();
          return;
        }
        this.render();
        if (result.redealt) {
          this.renderer.showToast('三家都不叫，已重新发牌');
          this.animator.deal();
        }
        if (this.engine.state.phase === 'finished') this.finishRound();
        else this.scheduleAI();
      }, delay);
    }

    cancelAITimerOnly() {
      if (this.aiTimer) global.clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }

    cancelAI() {
      this.cancelAITimerOnly();
      this.sessionToken += 1;
      this.thinking = '';
    }

    requestRestart() {
      this.confirm('重新开始当前对局？', '当前进度会丢失，并立即重新洗牌。', () => this.restart());
    }

    restart() {
      this.renderer.closeModal('modal-confirm');
      this.renderer.closeModal('modal-result');
      this.cancelAI();
      this.engine.startRound();
      this.selectedIds.clear();
      this.announcedRound = null;
      this.audio.play('click');
      this.render();
      this.animator.deal();
      this.scheduleAI();
    }

    requestMenu() {
      if (this.engine.state.phase === 'finished' || this.engine.state.phase === 'menu') this.returnToMenu();
      else this.confirm('返回主菜单？', '当前对局进度不会保存。', () => this.returnToMenu());
    }

    returnToMenu() {
      this.renderer.closeModal('modal-confirm');
      this.renderer.closeModal('modal-result');
      this.cancelAI();
      this.audio.stopMusic();
      this.engine.returnToMenu();
      this.selectedIds.clear();
      this.render();
      this.updateAudioButtons();
      const start = document.getElementById('start-game');
      if (start) start.focus();
    }

    confirm(title, body, action) {
      const modal = document.getElementById('modal-confirm');
      if (modal) {
        const titleElement = modal.querySelector('[data-confirm="title"]');
        const bodyElement = modal.querySelector('[data-confirm="body"]');
        if (titleElement) titleElement.textContent = title;
        if (bodyElement) bodyElement.textContent = body;
      }
      this.confirmAction = action;
      this.renderer.openModal('modal-confirm');
    }

    runConfirmedAction() {
      const action = this.confirmAction;
      this.confirmAction = null;
      if (typeof action === 'function') action();
      else this.renderer.closeModal('modal-confirm');
    }

    saveSettingsFromDialog() {
      const sound = document.getElementById('setting-sound');
      const music = document.getElementById('setting-music');
      const animations = document.getElementById('setting-animations');
      const volume = document.getElementById('setting-volume');
      this.updateSettings({
        sound: sound ? sound.checked : this.settings.sound,
        music: music ? music.checked : this.settings.music,
        animations: animations ? animations.checked : this.settings.animations,
        volume: volume ? Number(volume.value) / 100 : this.settings.volume
      }, true);
      this.renderer.closeModal('modal-settings');
    }

    setMenuAudio(kind, value) {
      this.updateSettings({ [kind]: Boolean(value) });
      this.audio.play('click');
    }

    toggleQuickAudio(kind) {
      this.updateSettings({ [kind]: !this.settings[kind] });
      if (kind === 'sound' && this.settings.sound) this.audio.play('click');
    }
  }

  DDZ.GameController = GameController;
})(globalThis);
