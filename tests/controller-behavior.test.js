'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cards, HandAnalyzer } = require('./test-helpers.js');

// These browser scripts deliberately attach their APIs to globalThis.DDZ.  Loading
// the small dependency chain here lets us exercise controller helpers without a DOM.
require('../src/game/cards.js');
require('../src/game/hand-analyzer.js');
require('../src/game/hand-comparator.js');
require('../src/ai/strategies.js');
require('../src/game/game-controller.js');

const { GameController } = globalThis.DDZ;

function withRandom(value, callback) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

function createSelectionController(hand, selectedRanks, previousPattern) {
  return Object.assign(Object.create(GameController.prototype), {
    selectedIds: new Set(hand.filter((card) => selectedRanks.includes(card.rank)).map((card) => card.id)),
    engine: {
      state: {
        phase: 'playing',
        currentPlayer: 0,
        players: [{ hand }],
        lastPlay: previousPattern ? { pattern: previousPattern } : null
      }
    },
    canHumanSelect() { return true; },
    audio: { play() {} }
  });
}

test('AI 出牌延时遵循 5/10/20/20/20/20/5 分布，且正常出牌不为 0 秒', () => {
  const controller = Object.create(GameController.prototype);
  const passState = { lastPlay: { pattern: { type: 'single' } } };
  const playState = { lastPlay: { pattern: { type: 'single' } } };

  assert.equal(withRandom(0, () => controller.sampleAIPlayDelay(null, null, passState)), 0);
  assert.equal(withRandom(0.0499, () => controller.sampleAIPlayDelay(null, null, passState)), 0);
  assert.equal(withRandom(0.05, () => controller.sampleAIPlayDelay(null, null, passState)), 1000);
  assert.equal(withRandom(0.1499, () => controller.sampleAIPlayDelay(null, null, passState)), 1000);
  assert.equal(withRandom(0.15, () => controller.sampleAIPlayDelay(null, null, passState)), 2000);
  assert.equal(withRandom(0.9499, () => controller.sampleAIPlayDelay(null, null, passState)), 5000);
  assert.equal(withRandom(0.95, () => controller.sampleAIPlayDelay(null, null, passState)), 6000);
  assert.equal(withRandom(0, () => controller.sampleAIPlayDelay(null, { cards: [] }, playState)), 1000);
});

test('自动补单顺默认恰好补成五张；回应顺子时补到上家长度', () => {
  const leadHand = cards(3, 4, 5, 6, 7, 8, 9);
  const leadController = createSelectionController(leadHand, [3, 4, 5]);
  assert.equal(leadController.autoCompleteSequenceSelection(), true);
  assert.deepEqual(
    leadHand.filter((card) => leadController.selectedIds.has(card.id)).map((card) => card.rank),
    [3, 4, 5, 6, 7]
  );

  const previousPattern = HandAnalyzer.analyzeHand(cards(3, 4, 5, 6, 7, 8));
  const responseHand = cards(4, 5, 6, 7, 8, 9, 10);
  const responseController = createSelectionController(responseHand, [4, 5, 6], previousPattern);
  assert.equal(responseController.autoCompleteSequenceSelection(), true);
  assert.deepEqual(
    responseHand.filter((card) => responseController.selectedIds.has(card.id)).map((card) => card.rank),
    [4, 5, 6, 7, 8, 9]
  );
});
