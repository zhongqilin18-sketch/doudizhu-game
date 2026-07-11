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
    assert.equal(game.state.phase, 'playing', `${difficulty} 应结束叫分`);

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
