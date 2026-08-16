(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  const INITIAL_COINS = 10000;
  const PLAYER_TEMPLATES = Object.freeze([
    Object.freeze({ id: 'human', name: '麒麟', isHuman: true, seat: 'bottom', avatar: '麒麟.jpg' }),
    Object.freeze({ id: 'ai-left', name: '掘开', isHuman: false, seat: 'left', avatar: '掘开.jpg' }),
    Object.freeze({ id: 'ai-right', name: '旭旭宝宝', isHuman: false, seat: 'right', avatar: '旭旭宝宝.jpg' })
  ]);
  const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function failure(code, message) {
    return Object.freeze({ ok: false, code, message });
  }

  function nextCounterClockwise(playerIndex) {
    return (playerIndex + 2) % 3;
  }

  function normalizeBalances(value) {
    if (!Array.isArray(value) || value.length !== 3) return [INITIAL_COINS, INITIAL_COINS, INITIAL_COINS];
    return value.map((coins) => Number.isSafeInteger(Number(coins)) ? Number(coins) : INITIAL_COINS);
  }

  class GameState {
    constructor(options) {
      const config = options || {};
      this.random = typeof config.random === 'function' ? config.random : Math.random;
      this.state = this._menuState(
        DIFFICULTIES.includes(config.difficulty) ? config.difficulty : 'normal',
        normalizeBalances(config.balances)
      );
    }

    _players(balances) {
      return PLAYER_TEMPLATES.map((player, index) => ({
        ...player,
        coins: balances[index],
        role: null,
        hand: [],
        bid: null,
        multiplier: null,
        lastAction: null,
        lastPatternType: null,
        playedCards: [],
        successfulPlays: 0
      }));
    }

    _menuState(difficulty, balances) {
      const wallet = normalizeBalances(balances);
      return {
        phase: 'menu',
        roundId: 0,
        revision: 0,
        difficulty,
        players: this._players(wallet),
        bottomCards: [],
        bottomRevealed: false,
        bidStarter: null,
        bidCount: 0,
        bidHistory: [],
        multiplierCount: 0,
        highestBid: 0,
        highestBidder: null,
        landlordIndex: null,
        currentPlayer: null,
        lastPlay: null,
        passCount: 0,
        trickNumber: 0,
        playHistory: [],
        bombCount: 0,
        winner: null,
        result: null,
        settlement: null,
        message: '准备开始一局麒麟斗地主'
      };
    }

    getSnapshot() {
      return clone(this.state);
    }

    getBalances() {
      return this.state.players.map((player) => player.coins);
    }

    setBalances(balances) {
      const wallet = normalizeBalances(balances);
      this.state.players.forEach((player, index) => { player.coins = wallet[index]; });
      this._touch();
      return { ok: true, state: this.state };
    }

    setDifficulty(difficulty) {
      if (!DIFFICULTIES.includes(difficulty)) return failure('INVALID_DIFFICULTY', '请选择有效的难度');
      this.state.difficulty = difficulty;
      this._touch();
      return { ok: true, state: this.state };
    }

    startRound(options) {
      const config = options || {};
      const balances = this.getBalances();
      if (balances.some((coins) => coins <= 0)) {
        return failure('INSUFFICIENT_COINS', '有玩家的麒麟币已经用完，请重置麒麟币后再开始');
      }

      const dealt = DDZ.Deck.deal(this.random);
      const previousRound = this.state.roundId || 0;
      const previousRevision = this.state.revision || 0;
      const starter = Number.isInteger(config.bidStarter)
        ? ((config.bidStarter % 3) + 3) % 3
        : Math.floor(this.random() * 3);

      this.state = {
        ...this._menuState(this.state.difficulty, balances),
        phase: 'bidding',
        roundId: previousRound + 1,
        revision: previousRevision + 1,
        players: this._players(balances).map((player, index) => ({ ...player, hand: dealt.hands[index] })),
        bottomCards: [...dealt.bottomCards],
        bidStarter: starter,
        currentPlayer: starter,
        message: `${PLAYER_TEMPLATES[starter].name}先叫地主`
      };
      return { ok: true, state: this.state, redealt: Boolean(config.redealt) };
    }

    returnToMenu() {
      const difficulty = this.state.difficulty;
      const balances = this.getBalances();
      const roundId = this.state.roundId;
      const revision = this.state.revision + 1;
      this.state = this._menuState(difficulty, balances);
      this.state.roundId = roundId;
      this.state.revision = revision;
      return { ok: true, state: this.state };
    }

    placeBid(playerIndex, score) {
      if (this.state.phase !== 'bidding') return failure('WRONG_PHASE', '当前不是叫地主阶段');
      if (playerIndex !== this.state.currentPlayer) return failure('NOT_YOUR_TURN', '还没有轮到这位玩家叫分');
      if (!Number.isInteger(score) || score < 0 || score > 3) return failure('INVALID_BID', '叫分只能是不叫、1 分、2 分或 3 分');
      if (score > 0 && score <= this.state.highestBid) return failure('BID_TOO_LOW', '叫分必须高于当前最高分');
      if (this.state.players[playerIndex].bid !== null) return failure('ALREADY_BID', '这位玩家本轮已经叫过分');

      const player = this.state.players[playerIndex];
      player.bid = score;
      player.lastAction = score === 0 ? '不叫' : `${score} 分`;
      this.state.bidHistory.push({ playerIndex, score });
      this.state.bidCount += 1;
      if (score > this.state.highestBid) {
        this.state.highestBid = score;
        this.state.highestBidder = playerIndex;
      }

      if (score === 3) {
        this._finalizeLandlord(playerIndex);
        this._touch();
        return { ok: true, state: this.state, landlordIndex: playerIndex };
      }

      if (this.state.bidCount >= 3) {
        if (this.state.highestBidder === null) {
          const nextStarter = nextCounterClockwise(this.state.bidStarter);
          return this.startRound({ bidStarter: nextStarter, redealt: true });
        }
        const landlordIndex = this.state.highestBidder;
        this._finalizeLandlord(landlordIndex);
        this._touch();
        return { ok: true, state: this.state, landlordIndex };
      }

      this.state.currentPlayer = nextCounterClockwise(playerIndex);
      this.state.message = `${this.state.players[this.state.currentPlayer].name}正在考虑叫分`;
      this._touch();
      return { ok: true, state: this.state };
    }

    _finalizeLandlord(landlordIndex) {
      this.state.landlordIndex = landlordIndex;
      this.state.bottomRevealed = true;
      this.state.players.forEach((player, index) => {
        player.role = index === landlordIndex ? 'landlord' : 'farmer';
        player.lastAction = null;
        player.lastPatternType = null;
        player.playedCards = [];
      });
      const landlord = this.state.players[landlordIndex];
      landlord.hand = DDZ.Cards.sortCards([...landlord.hand, ...this.state.bottomCards]);
      this.state.phase = 'doubling';
      this.state.currentPlayer = null;
      this.state.lastPlay = null;
      this.state.passCount = 0;
      this.state.multiplierCount = 0;
      this.state.message = `${landlord.name}成为地主，请选择本局倍率`;
    }

    chooseMultiplier(playerIndex, multiplier) {
      if (this.state.phase !== 'doubling') return failure('WRONG_PHASE', '当前不是倍率选择阶段');
      if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 2) return failure('INVALID_PLAYER', '玩家编号无效');
      if (![1, 2, 3].includes(multiplier)) return failure('INVALID_MULTIPLIER', '倍率只能是不加倍、加倍或超级加倍');
      const player = this.state.players[playerIndex];
      if (player.multiplier !== null) return failure('ALREADY_MULTIPLIED', '这位玩家已经选择过倍率');

      player.multiplier = multiplier;
      player.lastAction = multiplier === 3 ? '超级加倍' : (multiplier === 2 ? '加倍' : '不加倍');
      this.state.multiplierCount += 1;
      if (this.state.multiplierCount >= 3) {
        this.state.phase = 'landlordReveal';
        this.state.currentPlayer = this.state.landlordIndex;
        this.state.message = '倍率选择完成，3 秒后正式开始';
        this._touch();
        return { ok: true, state: this.state, completed: true };
      }
      this.state.message = `已有 ${this.state.multiplierCount}/3 位玩家选择倍率`;
      this._touch();
      return { ok: true, state: this.state, completed: false };
    }

    beginPlaying() {
      if (this.state.phase !== 'landlordReveal') return failure('WRONG_PHASE', '当前不在地主揭晓阶段');
      this.state.phase = 'playing';
      this.state.players[this.state.currentPlayer].playedCards = [];
      this.state.players.forEach((player) => { player.lastAction = null; });
      this.state.message = `${this.state.players[this.state.currentPlayer].name}先出牌`;
      this._touch();
      return { ok: true, state: this.state };
    }

    _beginTurn(playerIndex) {
      this.state.currentPlayer = playerIndex;
      this.state.players[playerIndex].playedCards = [];
      this.state.players[playerIndex].lastAction = null;
      this.state.players[playerIndex].lastPatternType = null;
    }

    playCards(playerIndex, cardIds) {
      if (this.state.phase !== 'playing') return failure('WRONG_PHASE', '当前不是出牌阶段');
      if (playerIndex !== this.state.currentPlayer) return failure('NOT_YOUR_TURN', '还没有轮到这位玩家出牌');
      if (!Array.isArray(cardIds) || cardIds.length === 0) return failure('NO_CARDS', '请先选择要出的牌');
      if (new Set(cardIds).size !== cardIds.length) return failure('DUPLICATE_CARD', '选牌中包含重复牌');

      const player = this.state.players[playerIndex];
      const handById = new Map(player.hand.map((card) => [card.id, card]));
      const selectedCards = cardIds.map((id) => handById.get(id));
      if (selectedCards.some((card) => !card)) return failure('CARD_NOT_IN_HAND', '所选牌不全在当前手牌中');

      const pattern = DDZ.HandAnalyzer.analyzeHand(selectedCards);
      if (!pattern.valid) return failure(pattern.code || 'INVALID_PATTERN', pattern.reason || '所选牌不构成合法牌型');
      if (this.state.lastPlay && !DDZ.HandComparator.canBeat(pattern, this.state.lastPlay.pattern)) {
        return failure('CANNOT_BEAT', '这手牌无法压过桌面上的上一手牌');
      }

      const selectedSet = new Set(cardIds);
      player.hand = player.hand.filter((card) => !selectedSet.has(card.id));
      player.lastAction = pattern.name;
      player.lastPatternType = pattern.type;
      player.playedCards = DDZ.Cards.sortCards(selectedCards);
      player.successfulPlays += 1;
      const play = {
        playerIndex,
        cards: DDZ.Cards.sortCards(selectedCards),
        pattern,
        trickNumber: this.state.trickNumber
      };
      this.state.lastPlay = play;
      this.state.playHistory.push(play);
      this.state.passCount = 0;
      if (pattern.type === 'bomb' || pattern.type === 'rocket') this.state.bombCount += 1;

      if (player.hand.length === 0) {
        this.state.phase = 'finished';
        this.state.winner = playerIndex;
        const winnerRole = player.role;
        const humanWon = this.state.players[0].role === winnerRole;
        this.state.result = {
          winnerIndex: playerIndex,
          winnerRole,
          humanWon,
          bid: this.state.highestBid || 1,
          bombCount: this.state.bombCount,
          successfulPlayCounts: this.state.players.map((entry) => entry.successfulPlays),
          playerMultipliers: this.state.players.map((entry) => entry.multiplier || 1)
        };
        this.state.message = `${winnerRole === 'landlord' ? '地主胜利' : '农民胜利'}！正在展示本局结果`;
        this._touch();
        return { ok: true, state: this.state, finished: true, pattern };
      }

      this._beginTurn(nextCounterClockwise(playerIndex));
      this.state.message = ['single', 'pair'].includes(pattern.type)
        ? `${player.name}已出牌`
        : `${player.name}打出${pattern.name}`;
      this._touch();
      return { ok: true, state: this.state, pattern };
    }

    passTurn(playerIndex) {
      if (this.state.phase !== 'playing') return failure('WRONG_PHASE', '当前不是出牌阶段');
      if (playerIndex !== this.state.currentPlayer) return failure('NOT_YOUR_TURN', '还没有轮到这位玩家操作');
      if (!this.state.lastPlay) return failure('CANNOT_PASS_ON_LEAD', '新一轮由你先出，不能不出');

      const player = this.state.players[playerIndex];
      player.lastAction = '不出';
      player.lastPatternType = null;
      player.playedCards = [];
      this.state.playHistory.push({ playerIndex, pass: true, trickNumber: this.state.trickNumber });
      const nextPassCount = this.state.passCount + 1;

      if (nextPassCount >= 2) {
        const leader = this.state.lastPlay.playerIndex;
        this.state.lastPlay = null;
        this.state.passCount = 0;
        this.state.trickNumber += 1;
        this._beginTurn(leader);
        this.state.message = `两家不出，${this.state.players[leader].name}获得新的出牌权`;
      } else {
        this.state.passCount = nextPassCount;
        this._beginTurn(nextCounterClockwise(playerIndex));
        this.state.message = `${player.name}选择不出`;
      }
      this._touch();
      return { ok: true, state: this.state, pass: true };
    }

    applySettlement(settlement) {
      if (this.state.phase !== 'finished') return failure('WRONG_PHASE', '只有本局结束后才能结算麒麟币');
      if (!settlement || !Array.isArray(settlement.balances) || settlement.balances.length !== 3) {
        return failure('INVALID_SETTLEMENT', '麒麟币结算结果无效');
      }
      settlement.balances.forEach((coins, index) => { this.state.players[index].coins = Math.trunc(coins); });
      this.state.settlement = clone(settlement);
      this.state.result = { ...(this.state.result || {}), settlement: clone(settlement) };
      this._touch();
      return { ok: true, state: this.state };
    }

    isTeammate(firstIndex, secondIndex) {
      const first = this.state.players[firstIndex];
      const second = this.state.players[secondIndex];
      return Boolean(first && second && first.role && first.role === second.role);
    }

    validateInvariants() {
      const errors = [];
      const handCards = this.state.players.flatMap((player) => player.hand);
      const ids = handCards.map((card) => card.id);
      if (new Set(ids).size !== ids.length) errors.push('不同玩家的手牌出现重复 ID');
      if (!this.state.players.every((player) => DDZ.Cards.hasUniqueCardIds(player.hand))) errors.push('玩家手牌内部出现重复 ID');
      if (this.state.currentPlayer !== null && (this.state.currentPlayer < 0 || this.state.currentPlayer > 2)) errors.push('currentPlayer 越界');
      if (['doubling', 'landlordReveal', 'playing', 'finished'].includes(this.state.phase)) {
        if (this.state.players.filter((player) => player.role === 'landlord').length !== 1) errors.push('地主数量不是 1');
      }
      if (this.state.passCount < 0 || this.state.passCount > 1) errors.push('passCount 必须为 0 或 1');
      if (this.state.phase === 'finished') {
        if (this.state.winner === null) errors.push('结束状态缺少赢家');
        else if (this.state.players[this.state.winner].hand.length !== 0) errors.push('赢家仍有手牌');
      }
      return { ok: errors.length === 0, errors };
    }

    _touch() {
      this.state.revision += 1;
    }
  }

  DDZ.GameState = GameState;
  DDZ.GameConstants = Object.freeze({ PLAYER_TEMPLATES, DIFFICULTIES, INITIAL_COINS, nextCounterClockwise });
})(globalThis);
