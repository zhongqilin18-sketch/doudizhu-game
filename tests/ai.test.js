'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.DDZ = {};
require('../src/game/cards.js');
require('../src/game/deck.js');
require('../src/game/hand-analyzer.js');
require('../src/game/hand-comparator.js');
require('../src/game/rules.js');
require('../src/ai/strategies.js');
require('../src/ai/endgame-solver.js');
require('../src/ai/ai-player.js');
require('../src/game/game-state.js');

const { DDZ } = globalThis;

function cardsFromRanks(ranks) {
  const deck = DDZ.Cards.createDeck();
  const used = new Set();
  return ranks.map((rank) => {
    const card = deck.find((candidate) => candidate.rank === rank && !used.has(candidate.id));
    assert.ok(card, `牌组中应存在点数 ${rank}`);
    used.add(card.id);
    return card;
  });
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

test('AI 生成的所有候选都是合法、唯一且属于手牌', () => {
  const hand = cardsFromRanks([3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 16, 17]);
  const moves = DDZ.AIPlayer.listLegalMoves(hand);
  assert.ok(moves.length > 20);
  const handIds = new Set(hand.map((card) => card.id));
  const signatures = new Set();
  for (const move of moves) {
    assert.equal(move.pattern.valid, true);
    assert.equal(DDZ.HandAnalyzer.analyzeHand(move.cards).valid, true);
    assert.equal(new Set(move.cards.map((card) => card.id)).size, move.cards.length);
    assert.ok(move.cards.every((card) => handIds.has(card.id)));
    assert.ok(!signatures.has(move.signature), `候选不应重复：${move.signature}`);
    signatures.add(move.signature);
  }
});

test('AI 的所有跟牌候选都能压过目标牌', () => {
  const hand = cardsFromRanks([4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15]);
  const target = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([3, 3]));
  const moves = DDZ.AIPlayer.listLegalMoves(hand, target);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((move) => DDZ.HandComparator.canBeat(move.pattern, target)));
});

test('目标为王炸时 AI 没有可出的牌', () => {
  const hand = cardsFromRanks([3, 3, 3, 3, 15, 15, 14, 14]);
  const rocket = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([16, 17]));
  assert.deepEqual(DDZ.AIPlayer.listLegalMoves(hand, rocket), []);
  assert.equal(DDZ.AIStrategies.chooseMove(hand, rocket, {}, 'hard'), null);
});

test('有普通最小解时 AI 不浪费炸弹', () => {
  const hand = cardsFromRanks([4, 4, 4, 4, 6, 7]);
  const target = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([5]));
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const move = DDZ.AIStrategies.chooseMove(hand, target, {}, difficulty);
    assert.ok(move);
    assert.equal(move.pattern.type, 'single');
    assert.equal(move.pattern.mainRank, 6);
  }
});

test('AI 首家能够主动出牌，三档难度都返回合法动作', () => {
  const hand = cardsFromRanks([3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const move = DDZ.AIStrategies.chooseMove(hand, null, {}, difficulty);
    assert.ok(move, `${difficulty} 难度应主动出牌`);
    assert.equal(move.pattern.valid, true);
  }
});

test('普通和困难 AI 会给即将走完的农民队友让牌', () => {
  const hand = cardsFromRanks([5, 7, 9]);
  const previousCards = cardsFromRanks([4]);
  const previousPattern = DDZ.HandAnalyzer.analyzeHand(previousCards);
  const context = {
    playerIndex: 1,
    lastPlay: { playerIndex: 2, cards: previousCards, pattern: previousPattern },
    players: [
      { role: 'landlord', hand: cardsFromRanks([10, 11, 12, 13]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([3]) }
    ]
  };
  assert.equal(DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'normal'), null);
  assert.equal(DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'hard'), null);
  assert.ok(DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'easy'));
});

test('农民队友用 K/A/2/小王控住单张时，农民 AI 不用更大牌抢权', () => {
  for (const rank of [13, 14, 15, 16]) {
    const hand = cardsFromRanks([rank + 1, 6, 6, 6, 6]);
    const previousCards = cardsFromRanks([rank]);
    const previousPattern = DDZ.HandAnalyzer.analyzeHand(previousCards);
    const context = {
      playerIndex: 1,
      lastPlay: { playerIndex: 2, cards: previousCards, pattern: previousPattern },
      players: [
        { role: 'landlord', hand: cardsFromRanks([3, 4, 5, 7, 8, 9]) },
        { role: 'farmer', hand },
        { role: 'farmer', hand: cardsFromRanks([3, 4, 5, 7]) }
      ]
    };
    assert.equal(DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'hard'), null);
  }
});

test('农民 AI 不会用炸弹压农民队友，除非该手直接出完', () => {
  const hand = cardsFromRanks([4, 6, 6, 6, 6]);
  const previousCards = cardsFromRanks([5]);
  const previousPattern = DDZ.HandAnalyzer.analyzeHand(previousCards);
  const context = {
    playerIndex: 1,
    lastPlay: { playerIndex: 2, cards: previousCards, pattern: previousPattern },
    players: [
      { role: 'landlord', hand: cardsFromRanks([7, 8, 9, 10, 11]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([3, 4, 8, 9]) }
    ]
  };
  const protectedMove = DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'hard');
  assert.ok(protectedMove);
  assert.notEqual(protectedMove.pattern.type, 'bomb');

  const winningHand = cardsFromRanks([6, 6, 6, 6]);
  context.players[1].hand = winningHand;
  const winningMove = DDZ.AIStrategies.chooseMove(winningHand, previousPattern, context, 'hard');
  assert.ok(winningMove);
  assert.equal(winningMove.pattern.type, 'bomb');
});

test('队友尚有三张牌时 AI 不会消极让牌，会用最小普通牌争夺牌权', () => {
  const hand = cardsFromRanks([5, 7, 9]);
  const previousCards = cardsFromRanks([4]);
  const previousPattern = DDZ.HandAnalyzer.analyzeHand(previousCards);
  const context = {
    playerIndex: 1,
    lastPlay: { playerIndex: 2, cards: previousCards, pattern: previousPattern },
    players: [
      { role: 'landlord', hand: cardsFromRanks([10, 11, 12, 13, 14, 15]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([3, 6, 8]) }
    ]
  };
  const move = DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'hard');
  assert.ok(move);
  assert.equal(move.pattern.type, 'single');
  assert.equal(move.pattern.mainRank, 5);
});

test('地主剩牌很少且没有普通解时，农民会用炸弹强制拦截', () => {
  const hand = cardsFromRanks([3, 6, 6, 6, 6]);
  const previousCards = cardsFromRanks([15]);
  const previousPattern = DDZ.HandAnalyzer.analyzeHand(previousCards);
  const context = {
    playerIndex: 1,
    lastPlay: { playerIndex: 0, cards: previousCards, pattern: previousPattern },
    players: [
      { role: 'landlord', hand: cardsFromRanks([7, 8, 9]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([4, 5, 10, 11]) }
    ]
  };
  const move = DDZ.AIStrategies.chooseMove(hand, previousPattern, context, 'hard');
  assert.ok(move);
  assert.equal(move.pattern.type, 'bomb');
});

test('叫地主评估由牌质决定而不是随机出分', () => {
  const strong = cardsFromRanks([17, 16, 15, 15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9]);
  const weak = cardsFromRanks([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 3, 4, 5, 6, 7, 8]);
  const strongScore = DDZ.AIStrategies.evaluateBid(strong, 'normal');
  const weakScore = DDZ.AIStrategies.evaluateBid(weak, 'normal');
  assert.ok(strongScore > weakScore);
  assert.equal(DDZ.AIStrategies.chooseBid(strong, 2, 'normal'), 3);
  assert.equal(DDZ.AIStrategies.chooseBid(weak, 3, 'normal'), 0);
});

test('三个固定种子的全 AI 对局都能在有限步内正常结束', { timeout: 30000 }, () => {
  const difficulties = ['easy', 'normal', 'hard'];
  difficulties.forEach((difficulty, index) => {
    const game = new DDZ.GameState({ random: seededRandom(20260711 + index), difficulty });
    game.startRound({ bidStarter: index });

    let biddingSteps = 0;
    while (game.state.phase === 'bidding' && biddingSteps < 100) {
      const playerIndex = game.state.currentPlayer;
      const score = DDZ.AIPlayer.decideBid(game.state, playerIndex);
      const result = game.placeBid(playerIndex, score);
      assert.equal(result.ok, true, result.message);
      biddingSteps += 1;
    }
    assert.equal(game.state.phase, 'doubling', `${difficulty} 应结束叫分并进入倍率选择`);
    game.chooseMultiplier(0, DDZ.AIPlayer.decideMultiplier(game.state, 0));
    game.chooseMultiplier(1, DDZ.AIPlayer.decideMultiplier(game.state, 1));
    game.chooseMultiplier(2, DDZ.AIPlayer.decideMultiplier(game.state, 2));
    assert.equal(game.state.phase, 'landlordReveal');
    assert.equal(game.beginPlaying().ok, true);
    assert.equal(game.state.phase, 'playing');

    let playSteps = 0;
    while (game.state.phase === 'playing' && playSteps < 500) {
      const playerIndex = game.state.currentPlayer;
      const beforeCount = game.state.players[playerIndex].hand.length;
      const move = DDZ.AIPlayer.decideMove(game.state, playerIndex);
      const result = move
        ? game.playCards(playerIndex, move.cards.map((card) => card.id))
        : game.passTurn(playerIndex);
      assert.equal(result.ok, true, `${difficulty}: ${result.message || 'AI 动作失败'}`);
      if (move) assert.equal(game.state.players[playerIndex].hand.length, beforeCount - move.cards.length);
      assert.equal(game.validateInvariants().ok, true, game.validateInvariants().errors.join('; '));
      playSteps += 1;
    }
    assert.equal(game.state.phase, 'finished', `${difficulty} 应在有限步内结束，实际走了 ${playSteps} 步`);
    assert.ok(playSteps < 500);
  });
});

test('AI 不会把完整王炸拆成小王或大王去跟普通单张', () => {
  const hand = cardsFromRanks([16, 17, 3, 3, 4, 5]);
  const target = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([14]));
  const context = {
    playerIndex: 1,
    players: [
      { role: 'landlord', hand: cardsFromRanks([6, 7, 8, 9]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([10, 11, 12]) }
    ],
    lastPlay: { playerIndex: 0, cards: cardsFromRanks([14]), pattern: target },
    playHistory: []
  };
  for (const difficulty of ['normal', 'hard']) {
    const move = DDZ.AIStrategies.chooseMove(hand, target, context, difficulty);
    assert.ok(move);
    assert.equal(move.pattern.type, 'rocket');
  }
});

test('小王无人跟后获得新出牌权，AI 不会紧接着再单出大王', () => {
  const hand = cardsFromRanks([17, 3, 3, 4, 4, 5]);
  const smallJoker = cardsFromRanks([16]);
  const context = {
    playerIndex: 1,
    players: [
      { role: 'landlord', hand: cardsFromRanks([6, 7, 8, 9]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([10, 11, 12]) }
    ],
    lastPlay: null,
    playHistory: [
      { playerIndex: 1, cards: smallJoker, pattern: DDZ.HandAnalyzer.analyzeHand(smallJoker) },
      { playerIndex: 0, pass: true },
      { playerIndex: 2, pass: true }
    ]
  };
  for (const difficulty of ['normal', 'hard']) {
    const move = DDZ.AIStrategies.chooseMove(hand, null, context, difficulty);
    assert.ok(move);
    assert.notEqual(move.pattern.mainRank, 17);
  }
});

test('重新获得出牌权后优先清理低牌，不连续领出控制大牌', () => {
  const hand = cardsFromRanks([3, 3, 4, 4, 12, 14, 15]);
  const previousControl = cardsFromRanks([15]);
  const context = {
    playerIndex: 0,
    players: [
      { role: 'landlord', hand },
      { role: 'farmer', hand: cardsFromRanks([5, 6, 7, 8, 9]) },
      { role: 'farmer', hand: cardsFromRanks([6, 7, 8, 9, 10]) }
    ],
    lastPlay: null,
    playHistory: [
      { playerIndex: 0, cards: previousControl },
      { playerIndex: 1, pass: true },
      { playerIndex: 2, pass: true }
    ],
    trickNumber: 2
  };
  const move = DDZ.AIStrategies.chooseMove(hand, null, context, 'hard');
  assert.ok(move);
  assert.ok(move.pattern.mainRank <= 4 || move.cards.length >= 3, `不应继续领出点数 ${move.pattern.mainRank} 的控制牌`);
});

test('提示三带一和三带二时默认使用最小附件并避开王和对2', () => {
  const tripleSingleHand = cardsFromRanks([7, 7, 7, 3, 4, 14, 15, 16, 17]);
  const tripleSingleTarget = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([6, 6, 6, 5]));
  const singleHints = DDZ.AIPlayer.rankHintMoves({
    players: [
      { role: 'landlord', hand: tripleSingleHand },
      { role: 'farmer', hand: [] },
      { role: 'farmer', hand: [] }
    ],
    lastPlay: { playerIndex: 1, cards: [], pattern: tripleSingleTarget },
    playHistory: [],
    trickNumber: 1,
    difficulty: 'hard',
    landlordIndex: 0
  }, 0);
  assert.equal(singleHints[0].pattern.type, 'tripleSingle');
  assert.deepEqual(singleHints[0].cards.filter((card) => card.rank !== 7).map((card) => card.rank), [3]);

  const triplePairHand = cardsFromRanks([7, 7, 7, 3, 3, 4, 4, 14, 14, 15, 15]);
  const triplePairTarget = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([6, 6, 6, 5, 5]));
  const pairHints = DDZ.AIPlayer.rankHintMoves({
    players: [
      { role: 'landlord', hand: triplePairHand },
      { role: 'farmer', hand: [] },
      { role: 'farmer', hand: [] }
    ],
    lastPlay: { playerIndex: 1, cards: [], pattern: triplePairTarget },
    playHistory: [],
    trickNumber: 1,
    difficulty: 'hard',
    landlordIndex: 0
  }, 0);
  assert.equal(pairHints[0].pattern.type, 'triplePair');
  assert.deepEqual(pairHints[0].cards.filter((card) => card.rank !== 7).map((card) => card.rank), [3, 3]);
});

test('实战 AI 三带一优先带最小散单，宁可留下对子也不拆对子或带控制牌', () => {
  const hand = cardsFromRanks([7, 7, 7, 3, 3, 4, 14, 15, 16, 17]);
  const targetCards = cardsFromRanks([6, 6, 6, 5]);
  const target = DDZ.HandAnalyzer.analyzeHand(targetCards);
  const move = DDZ.AIStrategies.chooseMove(hand, target, {}, 'hard');

  assert.ok(move);
  assert.equal(move.pattern.type, 'tripleSingle');
  assert.equal(move.pattern.mainRank, 7);
  assert.deepEqual(move.cards.filter((card) => card.rank !== 7).map((card) => card.rank), [4]);
});

test('实战 AI 三带二优先带最小完整对子，不用 A、2 等控制对子作附件', () => {
  const hand = cardsFromRanks([7, 7, 7, 3, 3, 4, 4, 13, 13, 14, 14, 15, 15]);
  const targetCards = cardsFromRanks([6, 6, 6, 5, 5]);
  const target = DDZ.HandAnalyzer.analyzeHand(targetCards);
  const move = DDZ.AIStrategies.chooseMove(hand, target, {}, 'hard');

  assert.ok(move);
  assert.equal(move.pattern.type, 'triplePair');
  assert.equal(move.pattern.mainRank, 7);
  assert.deepEqual(move.cards.filter((card) => card.rank !== 7).map((card) => card.rank), [3, 3]);
});

test('实战 AI 只有一手可走完时允许三带大王，不会为了保留大牌错过直接结束', () => {
  const hand = cardsFromRanks([7, 7, 7, 17]);
  const move = DDZ.AIStrategies.chooseMove(hand, null, {}, 'hard');

  assert.ok(move);
  assert.equal(move.pattern.type, 'tripleSingle');
  assert.equal(move.pattern.mainRank, 7);
  assert.equal(move.cards.length, hand.length);
});

test('地主上家的农民在领先且手牌可续时，用恰好封住地主的中高牌施压', () => {
  const hand = cardsFromRanks([3, 5, 7, 11, 15]);
  const context = {
    playerIndex: 1,
    players: [
      { role: 'landlord', hand: cardsFromRanks([3, 4, 5, 6, 7, 8, 9, 10]) },
      { role: 'farmer', hand },
      { role: 'farmer', hand: cardsFromRanks([3, 4, 5, 6, 7, 8]) }
    ],
    lastPlay: null,
    playHistory: []
  };
  const move = DDZ.AIStrategies.chooseMove(hand, null, context, 'hard');

  assert.ok(move);
  assert.equal(move.pattern.type, 'single');
  assert.equal(move.pattern.mainRank, 11);
});

test('蒙特卡洛搜索在时间预算内做真实 rollout 且返回合法动作', () => {
  const game = new DDZ.GameState({ random: seededRandom(20260712), difficulty: 'easy' });
  game.startRound({ bidStarter: 1 });
  game.placeBid(1, 3);
  game.chooseMultiplier(0, 1);
  game.chooseMultiplier(1, 2);
  game.chooseMultiplier(2, 1);
  game.beginPlaying();
  const playerIndex = game.state.currentPlayer;
  const move = DDZ.AIPlayer.searchMove(game.state, playerIndex);
  const stats = DDZ.AIPlayer.getLastSearchStats();
  assert.ok(move);
  assert.equal(move.pattern.valid, true);
  assert.ok(stats.simulations > 0, '应在时间预算内完成若干次真实 rollout');
  assert.ok(stats.simulations <= DDZ.AIPlayer.SEARCH_ITERATIONS.easy, 'rollout 次数不应超过目标上限');
  assert.equal(DDZ.AIPlayer.SEARCH_ITERATIONS.easy, 5000);
  assert.equal(DDZ.AIPlayer.SEARCH_ITERATIONS.normal, 10000);
  assert.equal(DDZ.AIPlayer.SEARCH_ITERATIONS.hard, 20000);
});

test('完全信息残局求解器给出精确胜负与合法动作', () => {
  const hands = [cardsFromRanks([5]), cardsFromRanks([6]), cardsFromRanks([7])];
  const lastPlay = { playerIndex: 0, cards: cardsFromRanks([4]), pattern: DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([4])) };
  const result = DDZ.EndgameSolver.solve(hands, 1, lastPlay, 0, 0);
  assert.ok(result);
  assert.equal(result.aborted, false);
  assert.ok(result.value > 0, '农民阵营应存在必胜路径');
  assert.ok(result.move);
  assert.equal(result.move.pattern.type, 'single');
  assert.equal(result.move.pattern.mainRank, 6);
});

test('残局求解器在剩余牌数超过阈值时返回 null', () => {
  const hands = [
    cardsFromRanks([3, 4, 5]),
    cardsFromRanks([6, 7, 8]),
    cardsFromRanks([9, 10, 11])
  ];
  assert.equal(DDZ.EndgameSolver.solve(hands, 0, null, 0, 0), null);
});

test('solveForContext 仅在信息完整（带 passCount 与角色）时启用', () => {
  const hands = [cardsFromRanks([5]), cardsFromRanks([6]), cardsFromRanks([7])];
  const lastPlay = { playerIndex: 0, cards: cardsFromRanks([4]), pattern: DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([4])) };
  const context = {
    playerIndex: 1,
    passCount: 0,
    landlordIndex: 0,
    players: [
      { role: 'landlord', hand: hands[0] },
      { role: 'farmer', hand: hands[1] },
      { role: 'farmer', hand: hands[2] }
    ],
    lastPlay
  };
  assert.ok(DDZ.EndgameSolver.solveForContext(context));
  assert.equal(DDZ.EndgameSolver.solveForContext({ ...context, passCount: undefined }), null);
});

test('generateLegalMoves 完整枚举飞机带单的每种翅膀组合（不截断）', () => {
  // 两组连续三张 [5,6] + 六个不同点数的散单，飞机带单的翅膀应为 C(6,2)=15 种。
  const hand = cardsFromRanks([5, 5, 5, 6, 6, 6, 3, 4, 7, 8, 9, 10]);
  const moves = DDZ.AIPlayer.listLegalMoves(hand);
  const planeSingles = moves.filter((move) => move.pattern.type === 'planeSingle');
  assert.equal(planeSingles.length, 15);
});

test('提示与实战决策共用同一评分，难度跟随当前难度', () => {
  const hand = cardsFromRanks([7, 7, 7, 3, 4, 14, 15, 16, 17]);
  const target = DDZ.HandAnalyzer.analyzeHand(cardsFromRanks([6, 6, 6, 5]));
  const players = [
    { role: 'landlord', hand },
    { role: 'farmer', hand: [] },
    { role: 'farmer', hand: [] }
  ];
  const context = {
    playerIndex: 0,
    players,
    lastPlay: { playerIndex: 1, cards: [], pattern: target },
    playHistory: [],
    trickNumber: 1
  };
  const decision = DDZ.AIStrategies.chooseMove(hand, target, context, 'normal');
  const state = {
    players,
    lastPlay: { playerIndex: 1, cards: [], pattern: target },
    playHistory: [],
    trickNumber: 1,
    difficulty: 'normal',
    landlordIndex: 0
  };
  const hints = DDZ.AIPlayer.rankHintMoves(state, 0);
  assert.ok(decision);
  assert.ok(hints.length > 0);
  assert.equal(hints[0].signature, decision.signature);
  assert.deepEqual(hints[0].cards.filter((card) => card.rank !== 7).map((card) => card.rank), [3]);
});

test('电脑倍率选择会随手牌质量提高', () => {
  const strong = cardsFromRanks([17, 16, 15, 15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9]);
  const weak = cardsFromRanks([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 3, 4, 5, 6, 7, 8]);
  assert.ok(DDZ.AIPlayer.decideMultiplier({ players: [{ hand: strong }], difficulty: 'normal' }, 0)
    > DDZ.AIPlayer.decideMultiplier({ players: [{ hand: weak }], difficulty: 'normal' }, 0));
});
