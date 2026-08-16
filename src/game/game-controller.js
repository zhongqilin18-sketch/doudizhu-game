(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  const SETTINGS_KEY = 'kirin-ddz-settings-v2';
  const WALLET_KEY = 'kirin-ddz-wallet-v1';
  const INITIAL_COINS = 10000;
  const BASE_STAKE = 100;
  const TURN_SECONDS = 20;
  const BID_SECONDS = 10;
  const MULTIPLIER_SECONDS = 5;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  class GameController {
    constructor() {
      this.settings = this.loadSettings();
      this.wallet = this.loadWallet();
      this.engine = new DDZ.GameState({ difficulty: 'normal', balances: this.wallet });
      this.renderer = new DDZ.Renderer();
      this.audio = new DDZ.AudioManager(this.settings);
      this.animator = new DDZ.Animator();
      this.animator.setEnabled(this.settings.animations);
      this.selectedIds = new Set();
      this.thinking = '';
      this.aiTimer = null;
      this.turnTimer = null;
      this.phaseTimer = null;
      this.resultTimer = null;
      this.phaseAITimers = new Set();
      this.sessionToken = 0;
      this.aiComputing = false;
      this.confirmAction = null;
      this.announcedRound = null;
      this.interactions = null;
      this.turnSeconds = null;
      this.bidSeconds = null;
      this.multiplierSeconds = null;
      this.revealCountdown = null;
      this.settlementCountdown = null;
      this.autoPlay = false;
      this.hintCandidates = [];
      this.hintIndex = 0;
      this.hintStateKey = '';
    }

    init() {
      this.interactions = new DDZ.Interactions(this);
      this.interactions.bind();
      this.syncSettingsControls();
      this.render();
      this.updateAudioButtons();
      // 在主菜单也尝试开始循环音乐；若浏览器拦截自动播放，AudioManager
      // 会在用户第一次点击或按键后自动重试。
      if (this.settings.music) this.audio.startMusic();
    }

    viewState() {
      const counter = this.settings.cardCounter && DDZ.CardCounter
        ? DDZ.CardCounter.calculate(this.engine.state, 0)
        : [];
      return {
        selectedIds: this.selectedIds,
        thinking: this.thinking,
        settings: this.settings,
        turnSeconds: this.turnSeconds,
        bidSeconds: this.bidSeconds,
        multiplierSeconds: this.multiplierSeconds,
        revealCountdown: this.revealCountdown,
        settlementCountdown: this.settlementCountdown,
        autoPlay: this.autoPlay,
        cardCounter: counter
      };
    }

    loadSettings() {
      const defaults = { sound: true, music: true, animations: true, soundVolume: 20, musicVolume: 20, cardCounter: false };
      try {
        const saved = JSON.parse(global.localStorage.getItem(SETTINGS_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return defaults;
        const legacyVolume = Number.isFinite(Number(saved.volume)) ? Number(saved.volume) : 20;
        return {
          sound: saved.sound !== false,
          music: saved.music !== false,
          animations: saved.animations !== false,
          soundVolume: clamp(Number.isFinite(Number(saved.soundVolume)) ? Number(saved.soundVolume) : legacyVolume, 0, 30),
          musicVolume: clamp(Number.isFinite(Number(saved.musicVolume)) ? Number(saved.musicVolume) : legacyVolume, 0, 30),
          cardCounter: saved.cardCounter === true
        };
      } catch (error) {
        return defaults;
      }
    }

    loadWallet() {
      try {
        const saved = JSON.parse(global.localStorage.getItem(WALLET_KEY) || 'null');
        if (!Array.isArray(saved) || saved.length !== 3) return [INITIAL_COINS, INITIAL_COINS, INITIAL_COINS];
        return saved.map((coins) => Number.isSafeInteger(Number(coins)) ? Number(coins) : INITIAL_COINS);
      } catch (error) {
        return [INITIAL_COINS, INITIAL_COINS, INITIAL_COINS];
      }
    }

    persistSettings() {
      try { global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (error) { /* optional */ }
    }

    persistWallet() {
      this.wallet = this.engine.getBalances();
      try { global.localStorage.setItem(WALLET_KEY, JSON.stringify(this.wallet)); } catch (error) { /* optional */ }
    }

    syncSettingsControls() {
      const setChecked = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.checked = Boolean(value);
      };
      setChecked('menu-sound', this.settings.sound);
      setChecked('menu-music', this.settings.music);
      setChecked('menu-card-counter', this.settings.cardCounter);
      setChecked('setting-sound', this.settings.sound);
      setChecked('setting-music', this.settings.music);
      setChecked('setting-animations', this.settings.animations);
      setChecked('setting-card-counter', this.settings.cardCounter);
      this.syncVolumeControl('setting-sound-volume', 'setting-sound-volume-value', this.settings.soundVolume);
      this.syncVolumeControl('setting-music-volume', 'setting-music-volume-value', this.settings.musicVolume);
    }

    syncVolumeControl(inputId, outputId, value) {
      const input = document.getElementById(inputId);
      const output = document.getElementById(outputId);
      if (input) input.value = String(value);
      if (output) output.textContent = `${value}×`;
    }

    updateSettings(partial, announce) {
      this.settings = { ...this.settings, ...partial };
      this.settings.soundVolume = clamp(Number(this.settings.soundVolume) || 0, 0, 30);
      this.settings.musicVolume = clamp(Number(this.settings.musicVolume) || 0, 0, 30);
      this.persistSettings();
      this.syncSettingsControls();
      this.audio.configure(this.settings);
      this.animator.setEnabled(this.settings.animations);
      this.updateAudioButtons();
      this.render();
      if (announce) this.renderer.showToast('设置已保存', 'success');
    }

    previewVolume(kind, value) {
      const next = clamp(Number(value) || 0, 0, 30);
      this.audio.configure({ ...this.settings, [kind]: next });
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
      this.cancelAllTimers();
      this.engine.setBalances(this.wallet);
      const checked = document.querySelector('input[name="difficulty"]:checked');
      this.engine.setDifficulty(checked ? checked.value : 'normal');
      const result = this.engine.startRound();
      if (!result.ok) return this.handleFailure(result);
      this.resetRoundView();
      this.audio.unlock();
      if (this.settings.music) this.audio.startMusic();
      this.audio.play('deal');
      this.render();
      this.animator.deal();
      this.beginBiddingTurn();
      return result;
    }

    resetRoundView() {
      this.selectedIds.clear();
      this.resetHintCycle();
      this.thinking = '';
      this.announcedRound = null;
      this.turnSeconds = null;
      this.bidSeconds = null;
      this.multiplierSeconds = null;
      this.revealCountdown = null;
      this.settlementCountdown = null;
    }

    render() {
      this.renderer.render(this.engine.state, this.viewState());
    }

    canHumanSelect() {
      return !this.autoPlay && this.engine.state.phase === 'playing' && this.engine.state.currentPlayer === 0;
    }

    toggleAutoplay() {
      this.autoPlay = !this.autoPlay;
      this.selectedIds.clear();
      if (!this.autoPlay) {
        if (this.engine.state.currentPlayer === 0) this.cancelAITimerOnly();
        this.thinking = '';
        this.render();
        return;
      }
      this.renderer.showToast('电脑托管已开启，可随时点击按钮取消', 'info');
      this.render();
      const state = this.engine.state;
      if (state.phase === 'doubling' && state.players[0].multiplier === null) {
        this.scheduleMultiplierDecision(0, this.sessionToken, state.roundId);
      } else if (['bidding', 'playing'].includes(state.phase) && state.currentPlayer === 0) {
        this.scheduleAI();
      }
    }

    setCardSelected(cardId, selected, renderNow) {
      if (!this.canHumanSelect()) return false;
      if (!this.engine.state.players[0].hand.some((card) => card.id === cardId)) return false;
      const changed = selected ? !this.selectedIds.has(cardId) : this.selectedIds.has(cardId);
      if (selected) this.selectedIds.add(cardId);
      else this.selectedIds.delete(cardId);
      if (changed) this.audio.play('select');
      if (renderNow !== false) this.render();
      return true;
    }

    toggleCard(cardId) {
      const selected = !this.selectedIds.has(cardId);
      this.resetHintCycle();
      const changed = this.setCardSelected(cardId, selected, false);
      if (changed && selected) this.autoCompleteSequenceSelection();
      this.render();
      return changed;
    }

    finishDragSelection() {
      if (!this.canHumanSelect()) return;
      this.resetHintCycle();
      this.autoCompleteSequenceSelection();
      this.render();
    }

    hint() {
      const state = this.engine.state;
      if (state.phase !== 'playing' || state.currentPlayer !== 0 || this.autoPlay) return;
      const stateKey = `${state.roundId}:${state.revision}:${state.lastPlay ? DDZ.Cards.cardSignature(state.lastPlay.cards) : 'lead'}:${state.players[0].hand.map((card) => card.id).join(',')}`;
      if (stateKey !== this.hintStateKey) {
        this.hintStateKey = stateKey;
        this.hintCandidates = DDZ.AIPlayer.rankHintMoves(state, 0);
        this.hintIndex = 0;
      }
      if (!this.hintCandidates.length) {
        this.selectedIds.clear();
        this.render();
        this.renderer.showToast('没有能压过的牌，可以选择不出', 'info');
        return;
      }
      if (this.hintIndex >= this.hintCandidates.length) {
        this.selectedIds.clear();
        this.hintIndex = 0;
        this.render();
        this.renderer.showToast('合理提示已全部展示，已清空选牌', 'info');
        return;
      }
      const move = this.hintCandidates[this.hintIndex];
      this.hintIndex += 1;
      this.selectedIds = new Set(move.cards.map((card) => card.id));
      this.audio.play('select');
      this.render();
      this.renderer.showToast(`提示 ${this.hintIndex}/${this.hintCandidates.length}：${move.pattern.name}`);
    }

    resetHintCycle() {
      this.hintCandidates = [];
      this.hintIndex = 0;
      this.hintStateKey = '';
    }

    autoCompleteSequenceSelection() {
      const state = this.engine.state;
      if (!this.canHumanSelect() || !this.selectedIds.size) return false;
      const hand = state.players[0].hand;
      const selected = hand.filter((card) => this.selectedIds.has(card.id));
      const groups = DDZ.AIStrategies.groupByRank(selected);
      const ranks = [...groups.keys()].sort((left, right) => left - right);
      if (!ranks.length || ranks.some((rank) => rank > 14)) return false;
      const unit = groups.get(ranks[0]).length;
      if (![1, 2, 3].includes(unit) || ranks.some((rank) => groups.get(rank).length !== unit)) return false;
      const triggerGroups = unit === 1 ? 3 : 2;
      if (ranks.length < triggerGroups) return false;
      for (let index = 1; index < ranks.length; index += 1) {
        if (ranks[index] !== ranks[index - 1] + 1) return false;
      }

      const expectedTypes = { 1: 'straight', 2: 'pairStraight', 3: 'plane' };
      const minimumGroups = { 1: 5, 2: 3, 3: 2 };
      const previous = state.lastPlay ? state.lastPlay.pattern : null;
      let targetGroups;
      if (previous) {
        if (previous.type !== expectedTypes[unit]) return false;
        targetGroups = previous.chainLength || previous.cardCount / unit;
        if (ranks.length > targetGroups) return false;
      } else {
        const handGroups = DDZ.AIStrategies.groupByRank(hand);
        let endRank = ranks[0];
        while (endRank <= 14 && (handGroups.get(endRank) || []).length >= unit) endRank += 1;
        const availableGroups = endRank - ranks[0];
        // 单顺默认只补成五张，避免一次选中就把整段长顺子全部带上。
        // 连对、飞机仍保持原有的“尽量连成完整主体”辅助行为。
        targetGroups = unit === 1 ? minimumGroups[unit] : availableGroups;
        if (availableGroups < targetGroups) return false;
      }

      const endRank = ranks[0] + targetGroups - 1;
      if (endRank > 14 || ranks.some((rank) => rank > endRank)) return false;
      const nextIds = new Set();
      for (let rank = ranks[0]; rank <= endRank; rank += 1) {
        const bucket = DDZ.Cards.sortCards(hand.filter((card) => card.rank === rank));
        if (bucket.length < unit) return false;
        const alreadySelected = bucket.filter((card) => this.selectedIds.has(card.id));
        const chosen = [...alreadySelected, ...bucket.filter((card) => !this.selectedIds.has(card.id))].slice(0, unit);
        chosen.forEach((card) => nextIds.add(card.id));
      }
      const completedCards = hand.filter((card) => nextIds.has(card.id));
      const pattern = DDZ.HandAnalyzer.analyzeHand(completedCards);
      if (!pattern.valid || pattern.type !== expectedTypes[unit]) return false;
      if (previous && !DDZ.HandComparator.canBeat(pattern, previous)) return false;
      const added = [...nextIds].some((id) => !this.selectedIds.has(id));
      if (!added) return false;
      this.selectedIds = nextIds;
      this.audio.play('select');
      return true;
    }

    playPatternAudio(pattern) {
      this.audio.play('play');
      if (!pattern) return;
      if (pattern.type === 'rocket') this.audio.play('rocket');
      else if (pattern.type === 'bomb') this.audio.play('bomb');
      else if (String(pattern.type).startsWith('plane')) this.audio.play('plane');
    }

    submitPlay() {
      this.cancelTurnTimer();
      const result = this.engine.playCards(0, [...this.selectedIds]);
      if (!result.ok) {
        this.startTurnClock();
        return this.handleFailure(result);
      }
      this.turnSeconds = null;
      this.selectedIds.clear();
      this.playPatternAudio(result.pattern);
      this.render();
      this.animator.play(0);
      this.animator.special(result.pattern, 0);
      this.afterAction(result);
      return result;
    }

    pass() {
      this.cancelTurnTimer();
      const result = this.engine.passTurn(0);
      if (!result.ok) {
        this.startTurnClock();
        return this.handleFailure(result);
      }
      this.turnSeconds = null;
      this.selectedIds.clear();
      this.audio.play('pass');
      this.render();
      this.beginCurrentTurn();
      return result;
    }

    bid(score) {
      this.cancelTurnTimer();
      const result = this.engine.placeBid(0, Number(score));
      if (!result.ok) {
        this.startBidClock();
        return this.handleFailure(result);
      }
      this.bidSeconds = null;
      this.audio.play(score ? 'bid' : 'pass');
      this.render();
      this.afterBid(result);
      return result;
    }

    chooseMultiplier(multiplier) {
      const result = this.engine.chooseMultiplier(0, Number(multiplier));
      if (!result.ok) return this.handleFailure(result);
      this.audio.play('bid');
      this.render();
      if (result.completed) this.startLandlordReveal();
      return result;
    }

    handleFailure(result) {
      this.audio.play('error');
      this.animator.invalid();
      this.renderer.showToast(result.message || '操作未成功', 'error');
      return result;
    }

    beginBiddingTurn() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      if (this.engine.state.phase !== 'bidding') return;
      this.bidSeconds = BID_SECONDS;
      this.thinking = '';
      this.render();
      this.startBidClock();
      this.scheduleAI();
    }

    startBidClock() {
      this.cancelTurnTimer();
      const state = this.engine.state;
      if (state.phase !== 'bidding') return;
      if (!Number.isFinite(this.bidSeconds) || this.bidSeconds <= 0) this.bidSeconds = BID_SECONDS;
      const token = this.sessionToken;
      const roundId = state.roundId;
      const revision = state.revision;
      const playerIndex = state.currentPlayer;
      const tick = () => {
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.revision !== revision || current.currentPlayer !== playerIndex || current.phase !== 'bidding') return;
        this.bidSeconds -= 1;
        if (this.bidSeconds <= 0) {
          this.bidSeconds = null;
          this.cancelAITimerOnly();
          const result = this.engine.placeBid(playerIndex, 0);
          if (result.ok) this.audio.play('pass');
          this.render();
          if (result.ok) this.afterBid(result);
          return;
        }
        this.render();
        this.turnTimer = global.setTimeout(tick, 1000);
      };
      this.turnTimer = global.setTimeout(tick, 1000);
    }

    afterBid(result) {
      if (result.redealt) {
        this.renderer.showToast('三家都不叫，已重新洗牌发牌');
        this.audio.play('deal');
        this.animator.deal();
      }
      if (this.engine.state.phase === 'doubling') this.startDoublingPhase();
      else this.beginBiddingTurn();
    }

    startDoublingPhase() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      this.cancelPhaseTimers();
      if (this.engine.state.phase !== 'doubling') return;
      this.multiplierSeconds = MULTIPLIER_SECONDS;
      this.thinking = '请选择本局倍率';
      this.render();
      const token = this.sessionToken;
      const roundId = this.engine.state.roundId;
      (this.autoPlay ? [0, 1, 2] : [1, 2]).forEach((playerIndex) => {
        this.scheduleMultiplierDecision(playerIndex, token, roundId);
      });

      const tick = () => {
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.phase !== 'doubling') return;
        this.multiplierSeconds -= 1;
        if (this.multiplierSeconds <= 0) {
          this.multiplierSeconds = null;
          current.players.forEach((player, playerIndex) => {
            if (this.engine.state.phase === 'doubling' && player.multiplier === null) {
              this.engine.chooseMultiplier(playerIndex, 1);
            }
          });
          this.render();
          if (this.engine.state.phase === 'landlordReveal') this.startLandlordReveal();
          return;
        }
        this.render();
        this.phaseTimer = global.setTimeout(tick, 1000);
      };
      this.phaseTimer = global.setTimeout(tick, 1000);
    }

    scheduleMultiplierDecision(playerIndex, token, roundId) {
      const timer = global.setTimeout(() => {
        this.phaseAITimers.delete(timer);
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.phase !== 'doubling') return;
        if (current.players[playerIndex].multiplier !== null) return;
        if (playerIndex === 0 && !this.autoPlay) return;
        const multiplier = DDZ.AIPlayer.decideMultiplier(current, playerIndex);
        const result = this.engine.chooseMultiplier(playerIndex, multiplier);
        if (result.ok) this.audio.play('bid');
        this.render();
        if (result.completed) this.startLandlordReveal();
      }, this.randomDelay(1000, 3000));
      this.phaseAITimers.add(timer);
    }

    startLandlordReveal() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      this.cancelPhaseTimers();
      if (this.engine.state.phase !== 'landlordReveal') return;
      this.multiplierSeconds = null;
      this.revealCountdown = 3;
      this.thinking = '';
      this.render();
      const token = this.sessionToken;
      const roundId = this.engine.state.roundId;
      const tick = () => {
        if (token !== this.sessionToken || this.engine.state.roundId !== roundId || this.engine.state.phase !== 'landlordReveal') return;
        this.revealCountdown -= 1;
        if (this.revealCountdown <= 0) {
          this.revealCountdown = null;
          const result = this.engine.beginPlaying();
          if (result.ok) {
            this.audio.play('start');
            this.render();
            this.beginCurrentTurn();
          }
          return;
        }
        this.render();
        this.phaseTimer = global.setTimeout(tick, 1000);
      };
      this.phaseTimer = global.setTimeout(tick, 1000);
    }

    beginCurrentTurn() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      if (this.engine.state.phase !== 'playing') return;
      this.selectedIds.clear();
      this.resetHintCycle();
      this.turnSeconds = TURN_SECONDS;
      this.thinking = '';
      this.render();
      this.startTurnClock();
      this.scheduleAI();
    }

    startTurnClock() {
      this.cancelTurnTimer();
      const state = this.engine.state;
      if (state.phase !== 'playing') return;
      if (!Number.isFinite(this.turnSeconds) || this.turnSeconds <= 0) this.turnSeconds = TURN_SECONDS;
      const token = this.sessionToken;
      const roundId = state.roundId;
      const revision = state.revision;
      const playerIndex = state.currentPlayer;
      const tick = () => {
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.revision !== revision || current.currentPlayer !== playerIndex || current.phase !== 'playing') return;
        this.turnSeconds -= 1;
        if (this.turnSeconds <= 0) {
          if (this.aiComputing && (!current.players[playerIndex].isHuman || this.autoPlay)) {
            this.turnSeconds = 1;
            this.render();
            this.turnTimer = global.setTimeout(tick, 1000);
            return;
          }
          this.turnSeconds = null;
          this.render();
          this.handleTurnTimeout(playerIndex);
          return;
        }
        this.render();
        this.turnTimer = global.setTimeout(tick, 1000);
      };
      this.turnTimer = global.setTimeout(tick, 1000);
    }

    handleTurnTimeout(playerIndex) {
      this.cancelAITimerOnly();
      const state = this.engine.state;
      if (state.phase !== 'playing' || state.currentPlayer !== playerIndex) return;
      let result;
      if (state.lastPlay) {
        result = this.engine.passTurn(playerIndex);
        if (result.ok) this.audio.play('pass');
      } else {
        let move = DDZ.AIPlayer.hint(state, playerIndex);
        if (!move || !move.cards || !move.cards.length) {
          const sorted = DDZ.Cards.sortCards(state.players[playerIndex].hand);
          move = { cards: [sorted[sorted.length - 1]] };
        }
        result = this.engine.playCards(playerIndex, move.cards.map((card) => card.id));
        if (result.ok) {
          this.playPatternAudio(result.pattern);
          this.animator.play(playerIndex);
          this.animator.special(result.pattern, playerIndex);
        }
      }
      if (!result || !result.ok) return this.handleFailure(result || { message: '超时自动操作失败' });
      this.selectedIds.clear();
      this.render();
      this.afterAction(result);
    }

    afterAction(result) {
      if (result.finished || this.engine.state.phase === 'finished') this.finishRound();
      else this.beginCurrentTurn();
    }

    finishRound() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      const state = this.engine.state;
      if (this.announcedRound === state.roundId) return;
      if (!state.settlement && DDZ.Economy) {
        try {
          const safeBalances = state.players.map((player) => Number.isSafeInteger(player.coins) ? player.coins : INITIAL_COINS);
          const settlement = DDZ.Economy.settle({
            balances: safeBalances,
            landlordIndex: state.landlordIndex,
            winnerIndex: state.winner,
            highestBid: state.highestBid || 1,
            bombCount: state.bombCount,
            successfulPlayCounts: state.players.map((player) => player.successfulPlays),
            playerMultipliers: state.players.map((player) => player.multiplier || 1),
            baseStake: BASE_STAKE
          });
          this.engine.applySettlement(settlement);
        } catch (error) {
          this.renderer.showToast('本局已结束，但麒麟币结算异常；余额保持不变', 'error');
        }
        this.persistWallet();
      }
      this.announcedRound = state.roundId;
      const finishedState = this.engine.state;
      this.audio.play(finishedState.result && finishedState.result.humanWon ? 'win' : 'lose');
      this.settlementCountdown = 5;
      this.render();
      this.animator.result(finishedState.result && finishedState.result.humanWon);
      const token = this.sessionToken;
      const roundId = finishedState.roundId;
      const tick = () => {
        if (token !== this.sessionToken || this.engine.state.roundId !== roundId || this.engine.state.phase !== 'finished') return;
        this.settlementCountdown -= 1;
        if (this.settlementCountdown <= 0) {
          this.settlementCountdown = null;
          this.render();
          this.renderer.openModal('modal-result');
          this.animator.result(finishedState.result && finishedState.result.humanWon);
          return;
        }
        this.render();
        this.resultTimer = global.setTimeout(tick, 1000);
      };
      this.resultTimer = global.setTimeout(tick, 1000);
    }

    randomDelay(minimum, maximum) {
      return Math.round(minimum + Math.random() * (maximum - minimum));
    }

    sampleAIBaseDelay(canPass) {
      const roll = Math.random();
      const distribution = [
        [0.05, 0], [0.15, 1], [0.35, 2], [0.55, 3], [0.75, 4], [0.95, 5], [1, 6]
      ];
      const seconds = distribution.find(([limit]) => roll < limit)[1];
      // 0 秒仅限“不出”。正常出牌抽到该档时改为 1 秒，确保出牌动作
      // 不会显得瞬移，也不改变其他档位的采样权重。
      return (seconds === 0 && !canPass ? 1 : seconds) * 1000;
    }

    sampleAIPlayDelay(player, move, state) {
      return this.sampleAIBaseDelay(Boolean(!move && state && state.lastPlay));
    }

    scheduleAI() {
      this.cancelAITimerOnly();
      const state = this.engine.state;
      if (!['bidding', 'playing'].includes(state.phase)) return;
      const playerIndex = state.currentPlayer;
      const player = state.players[playerIndex];
      if (!player || (player.isHuman && !this.autoPlay)) {
        this.thinking = '';
        this.render();
        return;
      }
      const token = this.sessionToken;
      const roundId = state.roundId;
      const revision = state.revision;

      if (state.phase === 'bidding') {
        this.thinking = `${player.name} 正在考虑叫分…`;
        this.render();
        this.aiTimer = global.setTimeout(() => {
          const current = this.engine.state;
          if (token !== this.sessionToken || current.roundId !== roundId || current.revision !== revision || current.currentPlayer !== playerIndex || current.phase !== 'bidding') return;
          this.cancelTurnTimer();
          this.thinking = '';
          const score = DDZ.AIPlayer.decideBid(current, playerIndex);
          const result = this.engine.placeBid(playerIndex, score);
          if (result.ok) this.audio.play(score ? 'bid' : 'pass');
          this.render();
          if (result.ok) this.afterBid(result);
        }, this.randomDelay(2000, 4000));
        return;
      }

      const turnStartedAt = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now();
      this.aiComputing = true;
      this.thinking = `${player.name} 正在判断牌权…`;
      this.render();
      this.aiTimer = global.setTimeout(() => {
        const current = this.engine.state;
        if (token !== this.sessionToken || current.roundId !== roundId || current.revision !== revision || current.currentPlayer !== playerIndex || current.phase !== 'playing') return;
        // 实战回合采用确定性的牌权策略：它会结合阵营、剩牌、牌型结构和
        // 关键牌保留快速决策，避免大量随机模拟带来的无意义“不出”。
        const move = DDZ.AIPlayer.decideMove(current, playerIndex);
        this.aiComputing = false;
        const now = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now();
        const elapsed = now - turnStartedAt;
        const desiredDelay = this.sampleAIPlayDelay(player, move, current);
        const remainingDelay = Math.max(0, desiredDelay - elapsed);
        this.thinking = `${player.name} 正在选择出牌…`;
        this.render();
        this.aiTimer = global.setTimeout(() => {
          const latest = this.engine.state;
          if (token !== this.sessionToken || latest.roundId !== roundId || latest.revision !== revision || latest.currentPlayer !== playerIndex || latest.phase !== 'playing') return;
          this.cancelTurnTimer();
          this.turnSeconds = null;
          this.thinking = '';
          let result;
          if (move) {
            result = this.engine.playCards(playerIndex, move.cards.map((card) => card.id));
            if (result.ok) {
              this.playPatternAudio(result.pattern);
              this.animator.play(playerIndex);
              this.animator.special(result.pattern, playerIndex);
            }
          } else if (latest.lastPlay) {
            result = this.engine.passTurn(playerIndex);
            if (result.ok) this.audio.play('pass');
          } else {
            const sorted = DDZ.Cards.sortCards(latest.players[playerIndex].hand);
            result = this.engine.playCards(playerIndex, [sorted[sorted.length - 1].id]);
            if (result.ok) this.playPatternAudio(result.pattern);
          }
          if (!result || !result.ok) {
            this.renderer.showToast(result ? result.message : '电脑玩家操作失败', 'error');
            this.render();
            this.startTurnClock();
            return;
          }
          this.render();
          this.afterAction(result);
        }, remainingDelay);
      }, 0);
    }

    cancelAITimerOnly() {
      if (this.aiTimer) global.clearTimeout(this.aiTimer);
      this.aiTimer = null;
      this.aiComputing = false;
    }

    cancelTurnTimer() {
      if (this.turnTimer) global.clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    cancelPhaseTimers() {
      if (this.phaseTimer) global.clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
      this.phaseAITimers.forEach((timer) => global.clearTimeout(timer));
      this.phaseAITimers.clear();
    }

    cancelAllTimers() {
      this.cancelAITimerOnly();
      this.cancelTurnTimer();
      this.cancelPhaseTimers();
      if (this.resultTimer) global.clearTimeout(this.resultTimer);
      this.resultTimer = null;
      this.sessionToken += 1;
      this.thinking = '';
    }

    requestRestart() {
      this.confirm('重新开始当前对局？', '当前进度会丢失，并立即重新洗牌；本局未结算的麒麟币不会改变。', () => this.restart());
    }

    restart() {
      this.renderer.closeModal('modal-confirm');
      this.renderer.closeModal('modal-result');
      this.cancelAllTimers();
      this.engine.setBalances(this.wallet);
      const result = this.engine.startRound();
      if (!result.ok) return this.handleFailure(result);
      this.resetRoundView();
      this.audio.play('deal');
      this.render();
      this.animator.deal();
      this.beginBiddingTurn();
      return result;
    }

    requestMenu() {
      if (this.engine.state.phase === 'finished' || this.engine.state.phase === 'menu') this.returnToMenu();
      else this.confirm('返回主菜单？', '当前对局进度不会保存，本局未结算的麒麟币不会改变。', () => this.returnToMenu());
    }

    returnToMenu() {
      this.renderer.closeModal('modal-confirm');
      this.renderer.closeModal('modal-result');
      this.cancelAllTimers();
      this.engine.returnToMenu();
      this.engine.setBalances(this.wallet);
      this.autoPlay = false;
      this.selectedIds.clear();
      this.resetRoundView();
      this.render();
      this.updateAudioButtons();
      if (this.settings.music) this.audio.startMusic();
      const start = document.getElementById('start-game');
      if (start) start.focus();
    }

    resetCoins() {
      const endsRound = !['menu', 'finished'].includes(this.engine.state.phase);
      const body = `麒麟、掘开和旭旭宝宝都会恢复为 10000 麒麟币。${endsRound ? '当前未完成的对局也会结束。' : ''}`;
      this.confirm('重置全部麒麟币？', body, () => {
        this.cancelAllTimers();
        this.wallet = [INITIAL_COINS, INITIAL_COINS, INITIAL_COINS];
        this.engine.returnToMenu();
        this.engine.setBalances(this.wallet);
        this.autoPlay = false;
        this.persistWallet();
        this.renderer.closeModal('modal-confirm');
        this.renderer.closeModal('modal-settings');
        this.render();
        this.renderer.showToast('全部玩家已恢复 10000 麒麟币', 'success');
      });
    }

    cancelSettings() {
      this.syncSettingsControls();
      this.audio.configure(this.settings);
      this.renderer.closeModal('modal-settings');
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
      const counter = document.getElementById('setting-card-counter');
      const soundVolume = document.getElementById('setting-sound-volume');
      const musicVolume = document.getElementById('setting-music-volume');
      this.updateSettings({
        sound: sound ? sound.checked : this.settings.sound,
        music: music ? music.checked : this.settings.music,
        animations: animations ? animations.checked : this.settings.animations,
        cardCounter: counter ? counter.checked : this.settings.cardCounter,
        soundVolume: soundVolume ? Number(soundVolume.value) : this.settings.soundVolume,
        musicVolume: musicVolume ? Number(musicVolume.value) : this.settings.musicVolume
      }, true);
      this.renderer.closeModal('modal-settings');
    }

    setMenuAudio(kind, value) {
      this.updateSettings({ [kind]: Boolean(value) });
      if (kind === 'sound' && value) this.audio.play('select');
    }

    setCardCounter(value) {
      this.updateSettings({ cardCounter: Boolean(value) });
    }

    toggleQuickAudio(kind) {
      this.updateSettings({ [kind]: !this.settings[kind] });
      if (kind === 'sound' && this.settings.sound) this.audio.play('select');
    }
  }

  DDZ.GameController = GameController;
})(globalThis);
