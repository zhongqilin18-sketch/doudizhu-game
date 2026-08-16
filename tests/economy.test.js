'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.DDZ = {};
const Economy = require('../src/game/economy.js');

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

test('CommonJS 与浏览器命名空间暴露同一份 Economy API', () => {
  assert.equal(globalThis.DDZ.Economy, Economy);
  assert.equal(typeof Economy.settle, 'function');
  assert.equal(Economy.settleRound, Economy.settle);
  assert.equal(Economy.calculateSettlement, Economy.settle);
});

test('三位玩家初始各有 10000 麒麟币，余额大于 0 才能开局', () => {
  assert.deepEqual(Economy.createInitialBalances(), [10000, 10000, 10000]);
  assert.equal(Economy.canStart([1, 2, 3]), true);
  assert.equal(Economy.canStart([1, 0, 3]), false);
  assert.deepEqual(Economy.getEligibility([1, 0, -2]).blockedPlayerIndexes, [1, 2]);
  assert.equal(Economy.isBlocked(0), true);
  assert.equal(Economy.isBlocked(-1), true);
  assert.equal(Economy.isBlocked(1), false);
});

test('地主获胜时获得两份，两个农民各失去一份', () => {
  const result = Economy.settle({
    balances: [10000, 10000, 10000],
    landlordIndex: 0,
    winnerIndex: 0,
    highestBid: 2,
    bombCount: 0,
    successfulPlayCounts: [5, 1, 2]
  });

  assert.equal(result.winnerSide, 'landlord');
  assert.equal(result.unit, 200);
  assert.deepEqual(result.deltas, [400, -200, -200]);
  assert.deepEqual(result.balances, [10400, 9800, 9800]);
  assert.deepEqual(result.multipliers, {
    bid: 2,
    bombs: 1,
    spring: 1,
    total: 2,
    bombCount: 0,
    springType: null,
    landlordSuccessfulPlayCount: 5,
    farmerSuccessfulPlayCount: 3
  });
  assert.equal(sum(result.previousBalances), sum(result.balances));
  assert.equal(result.breakdown.conserved, true);
});

test('炸弹与王炸均计入 bombCount，每次令结算翻倍', () => {
  const result = Economy.settle({
    balances: [10000, 10000, 10000],
    landlordIndex: 1,
    winnerIndex: 1,
    highestBid: 3,
    bombCount: 2,
    successfulPlayCounts: [0, 4, 0]
  });

  assert.equal(result.springType, 'landlord-spring');
  assert.deepEqual(result.multipliers, {
    bid: 3,
    bombs: 4,
    spring: 2,
    total: 24,
    bombCount: 2,
    springType: 'landlord-spring',
    landlordSuccessfulPlayCount: 4,
    farmerSuccessfulPlayCount: 0
  });
  assert.equal(result.unit, 2400);
  assert.deepEqual(result.deltas, [-2400, 4800, -2400]);
  assert.deepEqual(result.balances, [7600, 14800, 7600]);
  assert.equal(result.breakdown.formula, '100 × 3 × 4 × 2');
});

test('农民获胜且地主全局只成功出一手时触发反春天', () => {
  const result = Economy.settle({
    balances: [10000, 10000, 10000],
    landlordIndex: 2,
    winnerIndex: 0,
    highestBid: 1,
    bombCount: 1,
    successfulPlayCounts: [4, 3, 1]
  });

  assert.equal(result.winnerSide, 'farmers');
  assert.equal(result.springType, 'farmer-spring');
  assert.deepEqual(result.multipliers, {
    bid: 1,
    bombs: 2,
    spring: 2,
    total: 4,
    bombCount: 1,
    springType: 'farmer-spring',
    landlordSuccessfulPlayCount: 1,
    farmerSuccessfulPlayCount: 7
  });
  assert.equal(result.unit, 400);
  assert.deepEqual(result.deltas, [400, 400, -800]);
  assert.deepEqual(result.balances, [10400, 10400, 9200]);
});

test('地主成功出过两手时农民获胜不算反春天', () => {
  const result = Economy.settle({
    balances: [10000, 10000, 10000],
    landlordIndex: 2,
    winnerIndex: 1,
    highestBid: 3,
    bombCount: 0,
    successfulPlayCounts: [3, 4, 2]
  });

  assert.equal(result.springType, null);
  assert.equal(result.multipliers.total, 3);
  assert.equal(result.unit, 300);
  assert.deepEqual(result.deltas, [300, 300, -600]);
});

test('结算可使余额降到 0 或负数，并返回下一局 blocked 标记', () => {
  const originalBalances = [300, 100, 100];
  const originalCounts = [2, 1, 2];
  const result = Economy.settle({
    balances: originalBalances,
    landlordIndex: 0,
    winnerIndex: 1,
    highestBid: 3,
    bombCount: 0,
    successfulPlayCounts: originalCounts
  });

  assert.deepEqual(originalBalances, [300, 100, 100]);
  assert.deepEqual(originalCounts, [2, 1, 2]);
  assert.deepEqual(result.balances, [-300, 400, 400]);
  assert.equal(result.blocked, true);
  assert.equal(result.canContinue, false);
  assert.deepEqual(result.blockedPlayerIndexes, [0]);
  assert.equal(result.players[0].blocked, true);
  assert.equal(sum(result.previousBalances), sum(result.balances));

  const reachesZero = Economy.settle({
    balances: [400, 100, 100],
    landlordIndex: 0,
    winnerIndex: 2,
    highestBid: 2,
    bombCount: 0,
    successfulPlayCounts: [2, 1, 1]
  });
  assert.deepEqual(reachesZero.balances, [0, 300, 300]);
  assert.equal(reachesZero.blocked, true);
  assert.deepEqual(reachesZero.blockedPlayerIndexes, [0]);
});

test('农民阵营任意一人获胜，两个农民的结算完全相同', () => {
  const common = {
    balances: [9000, 11000, 10000],
    landlordIndex: 0,
    highestBid: 2,
    bombCount: 1,
    successfulPlayCounts: [3, 2, 4]
  };
  const firstFarmerWins = Economy.settle({ ...common, winnerIndex: 1 });
  const secondFarmerWins = Economy.settle({ ...common, winnerIndex: 2 });

  assert.deepEqual(firstFarmerWins.deltas, [-800, 400, 400]);
  assert.deepEqual(secondFarmerWins.deltas, firstFarmerWins.deltas);
  assert.deepEqual(secondFarmerWins.balances, firstFarmerWins.balances);
});

test('地主倍率与每位农民倍率分别作用于对应输赢', () => {
  const result = Economy.settle({
    balances: [10000, 10000, 10000],
    landlordIndex: 0,
    winnerIndex: 0,
    highestBid: 1,
    bombCount: 0,
    successfulPlayCounts: [4, 1, 1],
    playerMultipliers: [3, 2, 1]
  });
  assert.equal(result.unit, 100);
  assert.deepEqual(result.unitsByPlayer, [0, 600, 300]);
  assert.deepEqual(result.deltas, [900, -600, -300]);
  assert.deepEqual(result.balances, [10900, 9400, 9700]);
  assert.deepEqual(result.playerMultipliers, [3, 2, 1]);
  assert.equal(sum(result.previousBalances), sum(result.balances));
});

test('允许覆盖底分但拒绝会产生错误或不安全结算的输入', () => {
  const custom = Economy.settle({
    balances: [100, 100, 100],
    landlordIndex: 0,
    winnerIndex: 0,
    highestBid: 1,
    bombCount: 0,
    successfulPlayCounts: [2, 1, 0],
    baseStake: 10
  });
  assert.equal(custom.unit, 10);
  assert.deepEqual(custom.balances, [120, 90, 90]);

  assert.throws(() => Economy.settle({}), /balances/);
  assert.throws(() => Economy.canStart([100, 100]), /exactly 3/);
  assert.throws(() => Economy.settle({
    balances: [100, 100, 100],
    landlordIndex: 0,
    winnerIndex: 0,
    highestBid: 0,
    bombCount: 0,
    successfulPlayCounts: [1, 0, 0]
  }), /highestBid/);
  assert.throws(() => Economy.settle({
    balances: [100, 100, 100],
    landlordIndex: 0,
    winnerIndex: 0,
    highestBid: 1,
    bombCount: -1,
    successfulPlayCounts: [1, 0, 0]
  }), /bombCount/);
});
