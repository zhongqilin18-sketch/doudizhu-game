(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  // 各难度的目标 rollout 次数上限（真实 rollout 受时间预算约束，实际次数
  // 可能小于该上限；统计中的 simulations 记录的是实际完成的次数）。
  const SEARCH_ITERATIONS = Object.freeze({ easy: 5000, normal: 10000, hard: 20000 });
  const SEARCH_TIME_BUDGETS = Object.freeze({ easy: 20, normal: 30, hard: 55 });
  const SEARCH_MAX_CANDIDATES = 8;
  const SEARCH_MAX_ROLLOUT_STEPS = 60;
  const SEARCH_MIN_SAMPLES = 3;
  let lastSearchStats = null;

  function nextTurn(index) { return (index + 2) % 3; }
  function teamOf(landlordIndex, index) { return index === landlordIndex ? 'landlord' : 'farmer'; }

  function decideMultiplier(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return 1;
    const quality = DDZ.AIStrategies.evaluateBid(player.hand, state.difficulty);
    if (quality >= 3) return 3;
    if (quality >= 2) return 2;
    return 1;
  }

  function decideBid(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return 0;
    return DDZ.AIStrategies.chooseBid(player.hand, state.highestBid, state.difficulty);
  }

  function buildMoveContext(state, playerIndex) {
    return {
      playerIndex,
      players: state.players,
      lastPlay: state.lastPlay,
      playHistory: state.playHistory,
      trickNumber: state.trickNumber,
      passCount: state.passCount,
      landlordIndex: state.landlordIndex
    };
  }

  function isEndgamePosition(state) {
    const total = (state.players || []).reduce((sum, player) => (
      sum + (player && Array.isArray(player.hand) ? player.hand.length : 0)
    ), 0);
    const limit = DDZ.EndgameSolver ? DDZ.EndgameSolver.CARD_LIMIT : 0;
    return limit > 0 && total <= limit;
  }

  function decideMove(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return null;
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    const context = buildMoveContext(state, playerIndex);
    const heuristic = DDZ.AIStrategies.chooseMove(player.hand, previousPattern, context, state.difficulty);

    // 一手直接出完无需搜索。
    if (heuristic && heuristic.cards.length === player.hand.length) return heuristic;
    // 残局由 chooseMove 内的精确求解器接管，无需蒙特卡洛。
    if (isEndgamePosition(state)) return heuristic;
    // 中盘：普通/困难难度用真实 rollout 蒙特卡洛做一次轻量精修；
    // searchMove 内部在无法有效改善时会回退到启发式结果。
    if (state.difficulty !== 'easy') return searchMove(state, playerIndex);

    return heuristic;
  }

  function hint(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return null;
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    return DDZ.AIStrategies.chooseMove(
      player.hand,
      previousPattern,
      {
        playerIndex,
        players: state.players,
        lastPlay: state.lastPlay,
        playHistory: state.playHistory,
        trickNumber: state.trickNumber,
        passCount: state.passCount,
        landlordIndex: state.landlordIndex
      },
      state.difficulty || 'normal'
    );
  }

  function attachmentCards(move) {
    const pattern = move && move.pattern;
    if (!pattern) return [];
    if (['tripleSingle', 'triplePair', 'fourTwoSingles', 'fourTwoPairs'].includes(pattern.type)) {
      return move.cards.filter((card) => card.rank !== pattern.mainRank);
    }
    if (['planeSingle', 'planePair'].includes(pattern.type)) {
      const length = pattern.chainLength || 0;
      const first = pattern.mainRank - length + 1;
      return move.cards.filter((card) => card.rank < first || card.rank > pattern.mainRank);
    }
    return [];
  }

  function attachmentPenalty(move, hand) {
    const attachments = attachmentCards(move);
    if (!attachments.length) return 0;
    const handGroups = DDZ.AIStrategies.groupByRank(hand);
    const attachmentGroups = DDZ.AIStrategies.groupByRank(attachments);
    const pairWing = ['triplePair', 'planePair', 'fourTwoPairs'].includes(move.pattern.type);
    let penalty = 0;
    for (const [rank, cards] of attachmentGroups.entries()) {
      if (rank >= 17) penalty += 52;
      else if (rank === 16) penalty += 44;
      else if (rank === 15) penalty += pairWing ? 38 : 28;
      else if (rank === 14) penalty += pairWing ? 11 : 8;
      else if (rank === 13) penalty += 3;
      const originalCount = (handGroups.get(rank) || []).length;
      if (originalCount === 4 && cards.length < 4) penalty += 30;
      else if (originalCount === 3 && cards.length < 3) penalty += 7;
      else if (originalCount === 2 && cards.length === 1) penalty += 3;
    }
    return penalty;
  }

  function rankHintMoves(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return [];
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    const legalMoves = DDZ.AIStrategies.generateLegalMoves(player.hand, previousPattern);
    if (!legalMoves.length) return [];

    // 与实战决策共用同一套评分（rankMoves），提示的难度跟随当前难度。
    const mode = DDZ.AIStrategies.LEVELS[state.difficulty] ? state.difficulty : 'normal';
    const level = DDZ.AIStrategies.LEVELS[mode];
    const moveContext = {
      playerIndex,
      players: state.players,
      lastPlay: state.lastPlay,
      playHistory: state.playHistory,
      trickNumber: state.trickNumber,
      difficulty: mode
    };
    const ranked = DDZ.AIStrategies.rankMoves(
      legalMoves, player.hand, previousPattern, moveContext, level, mode
    );

    // 同结构（同型/同主牌/同张数）只保留附件最合理的一个，避免提示在
    // 仅在附件上不同的变体之间来回切换。
    const minimumAttachment = new Map();
    return ranked
      .map((entry) => {
        const pattern = entry.move.pattern;
        const key = `${pattern.type}:${pattern.mainRank}:${pattern.cardCount}:${pattern.chainLength || 0}`;
        const attachment = attachmentPenalty(entry.move, player.hand);
        minimumAttachment.set(key, Math.min(minimumAttachment.get(key) ?? Infinity, attachment));
        return { entry, key, attachment };
      })
      .filter((item) => item.attachment <= minimumAttachment.get(item.key) + 4)
      .map((item) => item.entry.move);
  }

  function applyCandidateMove(hands, playerIndex, lastPlay, passCount, move) {
    if (move === null) {
      const nextPassCount = passCount + 1;
      if (nextPassCount >= 2) {
        return {
          hands: hands.slice(),
          turn: lastPlay.playerIndex,
          lastPlay: null,
          passCount: 0,
          winNow: false
        };
      }
      return {
        hands: hands.slice(),
        turn: nextTurn(playerIndex),
        lastPlay,
        passCount: nextPassCount,
        winNow: false
      };
    }

    const remaining = hands[playerIndex].filter(
      (card) => !move.cards.some((played) => played.id === card.id)
    );
    const nextHands = hands.slice();
    nextHands[playerIndex] = remaining;
    return {
      hands: nextHands,
      turn: nextTurn(playerIndex),
      lastPlay: { playerIndex, cards: move.cards, pattern: move.pattern },
      passCount: 0,
      winNow: remaining.length === 0
    };
  }

  // 真实 rollout：用合法动作生成器模拟后续回合，直到有人出完（返回该玩家
  // 下标）或步数耗尽（返回 -1）。随机策略保证这是货真价实的蒙特卡洛采样，
  // 而不是对「预估手数」加噪声。
  function rolloutOnce(hands, turn, lastPlay, passCount, landlordIndex, maxSteps) {
    let currentTurn = turn;
    let currentLastPlay = lastPlay;
    let currentPassCount = passCount;
    const currentHands = hands.slice();

    for (let step = 0; step < maxSteps; step += 1) {
      const hand = currentHands[currentTurn];
      const pattern = currentLastPlay ? currentLastPlay.pattern : null;
      const moves = DDZ.AIStrategies.generateLegalMoves(hand, pattern);
      let move = null;
      if (moves.length) {
        const finishers = moves.filter((entry) => entry.cards.length === hand.length);
        const pool = finishers.length ? finishers : moves;
        move = pool[Math.floor(Math.random() * pool.length)];
      }

      if (move) {
        const remaining = hand.filter((card) => !move.cards.some((played) => played.id === card.id));
        currentHands[currentTurn] = remaining;
        if (remaining.length === 0) return currentTurn;
        currentLastPlay = { playerIndex: currentTurn, cards: move.cards, pattern: move.pattern };
        currentPassCount = 0;
        currentTurn = nextTurn(currentTurn);
      } else if (currentLastPlay) {
        currentPassCount += 1;
        if (currentPassCount >= 2) {
          const leader = currentLastPlay.playerIndex;
          currentLastPlay = null;
          currentPassCount = 0;
          currentTurn = leader;
        } else {
          currentTurn = nextTurn(currentTurn);
        }
      } else {
        // 自由出牌却无合法动作（正常不可能），终止本次 rollout。
        return -1;
      }
    }
    return -1;
  }

  // 真实 rollout 蒙特卡洛：对每个候选（含不出）在时间预算内做真实对局采样，
  // 按本方阵营胜率选择。无法有效采样或与启发式无差异时回退启发式结果。
  function searchMove(state, playerIndex, options) {
    const now = () => (global.performance && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now());
    const startedAt = now();
    const player = state.players[playerIndex];
    if (!player) return null;

    const difficulty = SEARCH_ITERATIONS[state.difficulty] ? state.difficulty : 'normal';
    const timeBudgetMs = options && Number.isFinite(options.timeBudgetMs) && options.timeBudgetMs > 0
      ? options.timeBudgetMs
      : SEARCH_TIME_BUDGETS[difficulty];
    const rollupCeiling = SEARCH_ITERATIONS[difficulty];
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    const context = buildMoveContext(state, playerIndex);
    const heuristic = DDZ.AIStrategies.chooseMove(player.hand, previousPattern, context, difficulty);

    const legalMoves = DDZ.AIStrategies.generateLegalMoves(player.hand, previousPattern);
    if (!legalMoves.length) {
      lastSearchStats = Object.freeze({ simulations: 0, candidates: 0, durationMs: 0, selected: 'pass', difficulty });
      return null;
    }

    const landlordIndex = Number.isInteger(state.landlordIndex)
      ? state.landlordIndex
      : state.players.findIndex((entry) => entry && entry.role === 'landlord');
    if (landlordIndex < 0) return heuristic;

    const mode = DDZ.AIStrategies.LEVELS[difficulty] ? difficulty : 'normal';
    const level = DDZ.AIStrategies.LEVELS[mode];
    const ranked = DDZ.AIStrategies.rankMoves(
      legalMoves, player.hand, previousPattern, context, level, mode
    ).slice(0, SEARCH_MAX_CANDIDATES);
    const candidates = ranked.map((entry) => ({ move: entry.move, wins: 0, runs: 0 }));
    if (previousPattern) candidates.push({ move: null, wins: 0, runs: 0 });

    const team = teamOf(landlordIndex, playerIndex);
    const hands = state.players.map((entry) => entry.hand);
    const passCount = Number.isInteger(state.passCount) ? state.passCount : 0;
    const lastPlay = state.lastPlay || null;

    let totalRollouts = 0;
    let cursor = 0;
    while (totalRollouts < rollupCeiling && now() - startedAt < timeBudgetMs) {
      const candidate = candidates[cursor % candidates.length];
      cursor += 1;
      const next = applyCandidateMove(hands, playerIndex, lastPlay, passCount, candidate.move);
      let winner = -1;
      if (next.winNow) {
        winner = playerIndex;
      } else {
        winner = rolloutOnce(next.hands, next.turn, next.lastPlay, next.passCount, landlordIndex, SEARCH_MAX_ROLLOUT_STEPS);
      }
      candidate.runs += 1;
      totalRollouts += 1;
      if (winner >= 0 && teamOf(landlordIndex, winner) === team) candidate.wins += 1;
    }

    const endedAt = now();
    if (totalRollouts === 0) {
      lastSearchStats = Object.freeze({
        simulations: 0,
        candidates: candidates.length,
        durationMs: Math.max(0, endedAt - startedAt),
        selected: heuristic ? heuristic.signature : 'pass',
        difficulty
      });
      return heuristic;
    }

    candidates.sort((left, right) => (right.wins / right.runs) - (left.wins / left.runs));
    const best = candidates[0];
    lastSearchStats = Object.freeze({
      simulations: totalRollouts,
      candidates: candidates.length,
      durationMs: Math.max(0, endedAt - startedAt),
      selected: best.move ? best.move.signature : 'pass',
      difficulty
    });

    // 样本太少或与启发式一致时，不冒险替换，回退启发式。
    if (best.runs < SEARCH_MIN_SAMPLES) return heuristic;
    if (best.move && heuristic && best.move.signature === heuristic.signature) return heuristic;
    return best.move;
  }

  DDZ.AIPlayer = Object.freeze({
    decideBid,
    decideMultiplier,
    decideMove,
    searchMove,
    hint,
    rankHintMoves,
    SEARCH_ITERATIONS,
    getLastSearchStats() { return lastSearchStats; },
    listLegalMoves(hand, previousPattern) {
      return DDZ.AIStrategies.generateLegalMoves(hand, previousPattern || null);
    }
  });
})(globalThis);
