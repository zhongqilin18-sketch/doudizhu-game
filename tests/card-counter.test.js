'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CardCounter = require('../src/ui/card-counter.js');

let sequence = 0;

function cards(...ranks) {
  return ranks.flat().map((rank) => ({
    id: `counter-card-${sequence += 1}`,
    rank
  }));
}

function stateWith(humanHand, playHistory, humanRole) {
  return {
    players: [
      { role: humanRole || 'farmer', hand: humanHand || [] },
      { role: humanRole === 'landlord' ? 'farmer' : 'landlord', hand: [] },
      { role: 'farmer', hand: [] }
    ],
    playHistory: playHistory || []
  };
}

function countAt(result, rank) {
  return result.find((entry) => entry.rank === rank).count;
}

test('导出中文标签、有序点数和全局 CardCounter API', () => {
  assert.deepEqual(CardCounter.RANK_ORDER, [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17
  ]);
  assert.equal(CardCounter.RANK_LABELS[11], 'J');
  assert.equal(CardCounter.RANK_LABELS[14], 'A');
  assert.equal(CardCounter.RANK_LABELS[16], '小王');
  assert.equal(CardCounter.RANK_LABELS[17], '大王');
  assert.equal(globalThis.DDZ.CardCounter, CardCounter);
});

test('真人是地主时，底牌已并入手牌并从记牌器中扣除', () => {
  const humanHand = cards(3, 3, 4, 16, 17);
  const result = CardCounter.calculate(stateWith(humanHand, [], 'landlord'));

  assert.equal(countAt(result, 3), 2);
  assert.equal(countAt(result, 4), 3);
  assert.equal(countAt(result, 5), 4);
  assert.equal(countAt(result, 16), 0);
  assert.equal(countAt(result, 17), 0);
  assert.equal(CardCounter.total(result), 49);
});

test('真人是农民时，未见的地主底牌仍计入其他玩家未出牌', () => {
  const humanHand = cards(3, 4, 5, 6);
  const result = CardCounter.calculate(stateWith(humanHand, [], 'farmer'));

  assert.equal(countAt(result, 3), 3);
  assert.equal(countAt(result, 6), 3);
  assert.equal(countAt(result, 7), 4);
  assert.equal(CardCounter.total(result), 50);
});

test('所有成功出牌会更新计数，pass 记录不会扣牌', () => {
  const humanHand = cards(3, 4);
  const history = [
    { playerIndex: 1, cards: cards(7, 7) },
    { playerIndex: 2, pass: true },
    { playerIndex: 0, cards: cards(5) },
    { playerIndex: 1, cards: cards(10, 10, 10) }
  ];
  const result = CardCounter.calculate(stateWith(humanHand, history));

  assert.equal(countAt(result, 3), 3);
  assert.equal(countAt(result, 5), 3);
  assert.equal(countAt(result, 7), 2);
  assert.equal(countAt(result, 10), 1);
  assert.equal(CardCounter.total(result), 46);
});

test('大小王分别统计，打出后对应数量归零', () => {
  const before = CardCounter.calculate(stateWith(cards(3), []));
  assert.equal(countAt(before, 16), 1);
  assert.equal(countAt(before, 17), 1);

  const afterSmall = CardCounter.calculate(stateWith(cards(3), [
    { playerIndex: 1, cards: cards(16) }
  ]));
  assert.equal(countAt(afterSmall, 16), 0);
  assert.equal(countAt(afterSmall, 17), 1);

  const afterRocket = CardCounter.calculate(stateWith(cards(3), [
    { playerIndex: 1, cards: cards(16, 17) }
  ]));
  assert.equal(countAt(afterRocket, 16), 0);
  assert.equal(countAt(afterRocket, 17), 0);
});

test('异常重复历史不会产生负数，返回总数等于各点数之和', () => {
  const impossibleHistory = [
    { playerIndex: 1, cards: cards(3, 3, 3, 3, 3, 16, 16) }
  ];
  const result = CardCounter.calculate(stateWith(cards(3, 16), impossibleHistory));

  assert.ok(result.every((entry) => entry.count >= 0));
  assert.equal(countAt(result, 3), 0);
  assert.equal(countAt(result, 16), 0);
  assert.equal(CardCounter.total(result), result.reduce((sum, entry) => sum + entry.count, 0));
});

