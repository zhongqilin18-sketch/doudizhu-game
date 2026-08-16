(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  // 完全信息残局精确求解器。
  //
  // 斗地主是「地主 vs 两位农民」的二人零和博弈（两位农民共享同一目标，
  // 出牌时各自操作但都最大化农民阵营的胜负）。因此可以把整局建模成
  // 两阵营零和博弈，用「以当前行动方阵营为视角」的团队 negamax 精确求解：
  //
  //   * 叶子：某位玩家打完手牌，若其阵营等于当前视角阵营则为胜，否则为负。
  //   * 轮到同阵营队友时，价值视角不变（不取反）；轮到对手时取反。
  //   * 记忆化（转置表）只存精确值，配合「两次不出重置出牌权」的完整状态，
  //     保证无环、可精确缓存。
  //
  // 求解只在剩余总牌数 <= CARD_LIMIT 时触发，且受节点预算保护，预算耗尽
  // 会中止并让调用方回退到启发式，绝不会卡住主线程。

  const CARD_LIMIT = 8;
  const MAX_NODES = 200000;
  const WIN = 10000;
  const LOSS = -10000;

  function nextCounterClockwise(index) {
    return (index + 2) % 3;
  }

  function teamOf(landlordIndex, playerIndex) {
    return playerIndex === landlordIndex ? 'landlord' : 'farmer';
  }

  function stateKey(hands, turn, lastPlay, passCount) {
    const handsKey = hands.map((hand) => DDZ.Cards.cardSignature(hand)).join('|');
    const playKey = lastPlay
      ? `${lastPlay.playerIndex}:${DDZ.Cards.cardSignature(lastPlay.cards || [])}`
      : 'lead';
    return `${turn}|${passCount}|${playKey}|${handsKey}`;
  }

  // 应用一个动作（move 为出牌对象，null 表示不出），返回下一步的状态。
  // winNow 表示这一手是否直接打完（当前行动方获胜）。
  function applyMove(hands, turn, lastPlay, passCount, move) {
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
        turn: nextCounterClockwise(turn),
        lastPlay,
        passCount: nextPassCount,
        winNow: false
      };
    }

    const remaining = hands[turn].filter(
      (card) => !move.cards.some((played) => played.id === card.id)
    );
    const nextHands = hands.slice();
    nextHands[turn] = remaining;
    return {
      hands: nextHands,
      turn: nextCounterClockwise(turn),
      lastPlay: { playerIndex: turn, cards: move.cards, pattern: move.pattern },
      passCount: 0,
      winNow: remaining.length === 0
    };
  }

  function computeValue(hands, turn, lastPlay, passCount, landlordIndex, memo, budget) {
    budget.nodes -= 1;
    if (budget.nodes <= 0) {
      budget.aborted = true;
      return 0;
    }

    const key = stateKey(hands, turn, lastPlay, passCount);
    if (memo.has(key)) return memo.get(key);

    const previousPattern = lastPlay ? lastPlay.pattern : null;
    const moves = DDZ.AIStrategies.generateLegalMoves(hands[turn], previousPattern);
    const team = teamOf(landlordIndex, turn);

    if (moves.length === 0 && !lastPlay) {
      // 自由出牌却无合法动作（正常不可能，单张永远合法），视为负。
      memo.set(key, LOSS);
      return LOSS;
    }

    let best = LOSS;

    for (const move of moves) {
      const next = applyMove(hands, turn, lastPlay, passCount, move);
      let childValue;
      if (next.winNow) {
        childValue = WIN;
      } else {
        const value = computeValue(
          next.hands, next.turn, next.lastPlay, next.passCount,
          landlordIndex, memo, budget
        );
        if (budget.aborted) return 0;
        const childTeam = teamOf(landlordIndex, next.turn);
        childValue = childTeam === team ? value : -value;
      }
      if (childValue > best) best = childValue;
      if (best === WIN) break;
    }

    if (lastPlay) {
      const pass = applyMove(hands, turn, lastPlay, passCount, null);
      const value = computeValue(
        pass.hands, pass.turn, pass.lastPlay, pass.passCount,
        landlordIndex, memo, budget
      );
      if (budget.aborted) return 0;
      const childTeam = teamOf(landlordIndex, pass.turn);
      const childValue = childTeam === team ? value : -value;
      if (childValue > best) best = childValue;
    }

    memo.set(key, best);
    return best;
  }

  function childValueOf(hands, turn, lastPlay, passCount, landlordIndex, memo, budget, move) {
    const next = applyMove(hands, turn, lastPlay, passCount, move);
    if (next.winNow) return WIN;
    const value = computeValue(
      next.hands, next.turn, next.lastPlay, next.passCount,
      landlordIndex, memo, budget
    );
    if (budget.aborted) return 0;
    const team = teamOf(landlordIndex, turn);
    const childTeam = teamOf(landlordIndex, next.turn);
    return childTeam === team ? value : -value;
  }

  // 尝试求解残局。返回：
  //   null         —— 未进入残局（剩余牌数超过阈值）或信息不足。
  //   { aborted }  —— 预算耗尽，结果不可用，调用方应回退启发式。
  //   { value, move } —— value 为当前阵营视角的精确胜负（正=必胜，负=必败），
  //                       move 为最优动作（null 表示不出）。
  function solve(hands, turn, lastPlay, passCount, landlordIndex) {
    if (!Array.isArray(hands) || hands.length !== 3) return null;
    if (!Number.isInteger(turn) || turn < 0 || turn > 2) return null;
    if (!Number.isInteger(landlordIndex) || landlordIndex < 0 || landlordIndex > 2) return null;
    if (!hands.every((hand) => Array.isArray(hand))) return null;
    const total = hands.reduce((sum, hand) => sum + hand.length, 0);
    if (total > CARD_LIMIT) return null;

    const memo = new Map();
    const budget = { nodes: MAX_NODES, aborted: false };

    const previousPattern = lastPlay ? lastPlay.pattern : null;
    const moves = DDZ.AIStrategies.generateLegalMoves(hands[turn], previousPattern);

    let best = -Infinity;
    let bestMove = null;

    for (const move of moves) {
      const value = childValueOf(hands, turn, lastPlay, passCount, landlordIndex, memo, budget, move);
      if (budget.aborted) return { value: 0, move: null, aborted: true };
      if (value > best) {
        best = value;
        bestMove = move;
      }
      if (best === WIN) break;
    }

    if (lastPlay) {
      const value = childValueOf(hands, turn, lastPlay, passCount, landlordIndex, memo, budget, null);
      if (budget.aborted) return { value: 0, move: null, aborted: true };
      if (value > best) {
        best = value;
        bestMove = null;
      }
    }

    if (bestMove === null && lastPlay) {
      // 唯一最优是「不出」。
      return { value: best, move: null, aborted: false };
    }
    if (bestMove === null && !lastPlay) {
      // 自由出牌没有动作（不应发生）。
      return { value: best, move: null, aborted: false };
    }
    return { value: best, move: bestMove, aborted: false };
  }

  // 从 chooseMove 的 context 抽取求解所需信息并尝试求解。
  // 仅在信息完整（来自真实对局、带 passCount 与角色）时才启用，避免
  // 干扰单元测试里手工构造的不完整上下文。
  function solveForContext(context) {
    if (!context || !Array.isArray(context.players) || context.players.length !== 3) return null;
    if (!Number.isInteger(context.playerIndex)) return null;
    if (!Number.isInteger(context.passCount)) return null;

    const landlordIndex = Number.isInteger(context.landlordIndex)
      ? context.landlordIndex
      : context.players.findIndex((player) => player && player.role === 'landlord');
    if (landlordIndex < 0) return null;

    const hands = context.players.map((player) => (player && Array.isArray(player.hand) ? player.hand : null));
    if (hands.some((hand) => hand === null)) return null;

    const lastPlay = context.lastPlay
      && Number.isInteger(context.lastPlay.playerIndex)
      && context.lastPlay.pattern
      ? context.lastPlay
      : null;

    return solve(hands, context.playerIndex, lastPlay, context.passCount, landlordIndex);
  }

  DDZ.EndgameSolver = Object.freeze({
    CARD_LIMIT,
    MAX_NODES,
    solve,
    solveForContext
  });
})(globalThis);
