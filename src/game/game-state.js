(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  const PLAYER_TEMPLATES = Object.freeze([
    Object.freeze({ id: 'human', name: '你', isHuman: true, seat: 'bottom' }),
    Object.freeze({ id: 'ai-left', name: '阿竹', isHuman: false, seat: 'left' }),
    Object.freeze({ id: 'ai-right', name: '小满', isHuman: false, seat: 'right' })
  ]);

  const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function failure(code, message) {
    return Object.freeze({ ok: false, code, message });
  }

  class GameState {
    constructor(options) {
      const config = options || {};
      this.random = typeof config.random === 'function' ? config.random : Math.random;
      this.state = this._menuState(DIFFICULTIES.includes(config.difficulty) ? config.difficulty : 'normal');
    }

    _menuState(difficulty) {
      return {
        phase: 'menu',
        roundId: 0,
        revision: 0,
        difficulty,
        players: PLAYER_TEMPLATES.map((player) => ({ ...player, role: null, hand: [], bid: null, lastAction: null })),
        bottomCards: [],
        bottomRevealed: false,
        bidStarter: null,
        bidCount: 0,
        bidHistory: [],
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
        message: '准备开始一局经典斗地主'
      };
    }

    getSnapshot() {
      return clone(this.state);
    }

    setDifficulty(difficulty) {
      if (!DIFFICULTIES.includes(difficulty)) return failure('INVALID_DIFFICULTY', '请选择有效的难度');
      this.state.difficulty = difficulty;
      this._touch();
      return { ok: true, state: this.state };
    }

    startRound(options) {
      const config = options || {};
      const dealt = DDZ.Deck.deal(this.random);
      const previousRound = this.state.roundId || 0;
      const previousRevision = this.state.revision || 0;
      const starter = Number.isInteger(config.bidStarter)
        ? ((config.bidStarter % 3) + 3) % 3
        : Math.floor(this.random() * 3);

      this.state = {
        ...this._menuState(this.state.difficulty),
        phase: 'bidding',
        roundId: previousRound + 1,
        revision: previousRevision + 1,
        players: PLAYER_TEMPLATES.map((player, index) => ({
          ...player,
          role: null,
          hand: dealt.hands[index],
          bid: null,
          lastAction: null
        })),
        bottomCards: [...dealt.bottomCards],
        bidStarter: starter,
        currentPlayer: starter,
        message: `${PLAYER_TEMPLATES[starter].name}先叫地主`
      };
      return { ok: true, state: this.state, redealt: Boolean(config.redealt) };
    }

    returnToMenu() {
      const difficulty = this.state.difficulty;
      const roundId = this.state.roundId;
      const revision = this.state.revision + 1;
      this.state = this._menuState(difficulty);
      this.state.roundId = roundId;
      this.state.revision = revision;
      return { ok: true, state: this.state };
    }

    placeBid(playerIndex, score) {
      if (this.state.phase !== 'bidding') return failure('WRONG_PHASE', '当前不是叫地主阶段');
      if (playerIndex !== this.state.currentPlayer) return failure('NOT_YOUR_TURN', '还没有轮到这位玩家叫分');
      if (!Number.isInteger(score) || score < 0 || score > 3) return failure('INVALID_BID', '叫分只能是不叫、1分、2分或3分');
      if (score > 0 && score <= this.state.highestBid) return failure('BID_TOO_LOW', '叫分必须高于当前最高分');
      if (this.state.players[playerIndex].bid !== null) return failure('ALREADY_BID', '这位玩家本轮已经叫过分');

      const player = this.state.players[playerIndex];
      player.bid = score;
      player.lastAction = score === 0 ? '不叫' : `${score}分`;
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
          const nextStarter = (this.state.bidStarter + 1) % 3;
          return this.startRound({ bidStarter: nextStarter, redealt: true });
        }
        const landlordIndex = this.state.highestBidder;
        this._finalizeLandlord(landlordIndex);
        this._touch();
        return { ok: true, state: this.state, landlordIndex };
      }

      this.state.currentPlayer = (playerIndex + 1) % 3;
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
      });
      const landlord = this.state.players[landlordIndex];
      landlord.hand = DDZ.Cards.sortCards([...landlord.hand, ...this.state.bottomCards]);
      this.state.phase = 'playing';
      this.state.currentPlayer = landlordIndex;
      this.state.lastPlay = null;
      this.state.passCount = 0;
      this.state.message = `${landlord.name}成为地主，获得底牌并先出`;
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
          bid: this.state.highestBid,
          bombCount: this.state.bombCount
        };
        this.state.message = humanWon ? '恭喜，你所在的阵营获胜！' : '本局惜败，再来一局吧';
        this._touch();
        return { ok: true, state: this.state, finished: true, pattern };
      }

      this.state.currentPlayer = (playerIndex + 1) % 3;
      this.state.message = `${player.name}打出${pattern.name}`;
      this._touch();
      return { ok: true, state: this.state, pattern };
    }

    passTurn(playerIndex) {
      if (this.state.phase !== 'playing') return failure('WRONG_PHASE', '当前不是出牌阶段');
      if (playerIndex !== this.state.currentPlayer) return failure('NOT_YOUR_TURN', '还没有轮到这位玩家操作');
      if (!this.state.lastPlay) return failure('CANNOT_PASS_ON_LEAD', '新一轮由你先出，不能不出');

      const player = this.state.players[playerIndex];
      player.lastAction = '不出';
      this.state.playHistory.push({ playerIndex, pass: true, trickNumber: this.state.trickNumber });
      const nextPassCount = this.state.passCount + 1;

      if (nextPassCount >= 2) {
        const leader = this.state.lastPlay.playerIndex;
        this.state.lastPlay = null;
        this.state.passCount = 0;
        this.state.trickNumber += 1;
        this.state.currentPlayer = leader;
        this.state.message = `两家不出，${this.state.players[leader].name}获得新的出牌权`;
      } else {
        this.state.passCount = nextPassCount;
        this.state.currentPlayer = (playerIndex + 1) % 3;
        this.state.message = `${player.name}选择不出`;
      }
      this._touch();
      return { ok: true, state: this.state, pass: true };
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
      if (this.state.phase === 'playing' || this.state.phase === 'finished') {
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
  DDZ.GameConstants = Object.freeze({ PLAYER_TEMPLATES, DIFFICULTIES });
})(globalThis);
