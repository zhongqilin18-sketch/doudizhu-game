'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HandAnalyzer,
  HandComparator,
  HAND_TYPES,
  cards
} = require('./test-helpers.js');

function pattern(...ranks) {
  const result = HandAnalyzer.analyzeHand(cards(...ranks));
  assert.equal(result.valid, true, result.reason);
  return result;
}

test('同类普通牌按主体点数比较', () => {
  const cases = [
    { lower: [3], higher: [4], type: HAND_TYPES.SINGLE },
    { lower: [3, 3], higher: [4, 4], type: HAND_TYPES.PAIR },
    { lower: [3, 3, 3], higher: [4, 4, 4], type: HAND_TYPES.TRIPLE },
    { lower: [3, 3, 3, 17], higher: [4, 4, 4, 5], type: HAND_TYPES.TRIPLE_SINGLE },
    { lower: [3, 3, 3, 14, 14], higher: [4, 4, 4, 5, 5], type: HAND_TYPES.TRIPLE_PAIR },
    { lower: [3, 4, 5, 6, 7], higher: [4, 5, 6, 7, 8], type: HAND_TYPES.STRAIGHT },
    { lower: [3, 3, 4, 4, 5, 5], higher: [4, 4, 5, 5, 6, 6], type: HAND_TYPES.PAIR_STRAIGHT },
    { lower: [3, 3, 3, 4, 4, 4], higher: [4, 4, 4, 5, 5, 5], type: HAND_TYPES.PLANE },
    { lower: [3, 3, 3, 4, 4, 4, 14, 15], higher: [4, 4, 4, 5, 5, 5, 3, 6], type: HAND_TYPES.PLANE_SINGLE },
    { lower: [3, 3, 3, 4, 4, 4, 14, 14, 15, 15], higher: [4, 4, 4, 5, 5, 5, 3, 3, 6, 6], type: HAND_TYPES.PLANE_PAIR },
    { lower: [3, 3, 3, 3, 14, 15], higher: [4, 4, 4, 4, 5, 6], type: HAND_TYPES.FOUR_TWO_SINGLES },
    { lower: [3, 3, 3, 3, 13, 13, 14, 14], higher: [4, 4, 4, 4, 5, 5, 6, 6], type: HAND_TYPES.FOUR_TWO_PAIRS }
  ];

  for (const item of cases) {
    const lower = pattern(item.lower);
    const higher = pattern(item.higher);
    assert.equal(lower.type, item.type);
    assert.equal(higher.type, item.type);
    assert.equal(HandComparator.canBeat(higher, lower), true, item.type);
    assert.equal(HandComparator.canBeat(lower, higher), false, item.type);
    assert.equal(HandComparator.compareHands(higher, lower), HandComparator.COMPARISON.STRONGER);
    assert.equal(HandComparator.compareHands(lower, higher), HandComparator.COMPARISON.WEAKER);
  }
});

test('相同主体点数不能互相压制，附件大小不参与比较', () => {
  const tripleLowWing = pattern(7, 7, 7, 3);
  const tripleHighWing = pattern(7, 7, 7, 17);
  assert.equal(HandComparator.compareHands(tripleLowWing, tripleHighWing), HandComparator.COMPARISON.EQUAL);
  assert.equal(HandComparator.canBeat(tripleHighWing, tripleLowWing), false);

  const planeLowWings = pattern(3, 3, 3, 4, 4, 4, 5, 6);
  const planeHighWings = pattern(3, 3, 3, 4, 4, 4, 14, 15);
  assert.equal(HandComparator.compareHands(planeLowWings, planeHighWings), HandComparator.COMPARISON.EQUAL);

  const fourLowWings = pattern(8, 8, 8, 8, 3, 4);
  const fourHighWings = pattern(8, 8, 8, 8, 14, 15);
  assert.equal(HandComparator.compareHands(fourLowWings, fourHighWings), HandComparator.COMPARISON.EQUAL);
});

test('不同长度的顺子不能互相比较', () => {
  const five = pattern(3, 4, 5, 6, 7);
  const six = pattern(4, 5, 6, 7, 8, 9);
  assert.equal(HandComparator.canBeat(six, five), false);
  assert.equal(HandComparator.canBeat(five, six), false);
  assert.equal(HandComparator.compareHands(six, five), HandComparator.COMPARISON.INCOMPARABLE);
});

test('不同长度的连对不能互相比较', () => {
  const threePairs = pattern(3, 3, 4, 4, 5, 5);
  const fourPairs = pattern(4, 4, 5, 5, 6, 6, 7, 7);
  assert.equal(HandComparator.canBeat(fourPairs, threePairs), false);
  assert.equal(HandComparator.canBeat(threePairs, fourPairs), false);
  assert.equal(HandComparator.compareHands(fourPairs, threePairs), HandComparator.COMPARISON.INCOMPARABLE);
});

test('不同长度的飞机不能互相比较', () => {
  const two = pattern(3, 3, 3, 4, 4, 4);
  const three = pattern(4, 4, 4, 5, 5, 5, 6, 6, 6);
  assert.equal(HandComparator.canBeat(three, two), false);
  assert.equal(HandComparator.compareHands(three, two), HandComparator.COMPARISON.INCOMPARABLE);

  const twoWithSingles = pattern(3, 3, 3, 4, 4, 4, 7, 8);
  const threeWithSingles = pattern(4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 8, 9);
  assert.equal(HandComparator.canBeat(threeWithSingles, twoWithSingles), false);
});

test('不同普通牌型不能互相比较', () => {
  const pair = pattern(8, 8);
  const singles = pattern(9);
  const tripleSingle = pattern(8, 8, 8, 3);
  const bombLikeLength = pattern(3, 4, 5, 6, 7);
  assert.equal(HandComparator.compareHands(pair, singles), HandComparator.COMPARISON.INCOMPARABLE);
  assert.equal(HandComparator.compareHands(tripleSingle, bombLikeLength), HandComparator.COMPARISON.INCOMPARABLE);
  assert.equal(HandComparator.canBeat(pair, singles), false);
});

test('普通牌不能压炸弹，炸弹可以压任意普通牌', () => {
  const ordinary = pattern(10, 11, 12, 13, 14);
  const bomb = pattern(3, 3, 3, 3);
  assert.equal(HandComparator.canBeat(ordinary, bomb), false);
  assert.equal(HandComparator.canBeat(bomb, ordinary), true);
  assert.equal(HandComparator.compareHands(ordinary, bomb), HandComparator.COMPARISON.WEAKER);
  assert.equal(HandComparator.compareHands(bomb, ordinary), HandComparator.COMPARISON.STRONGER);
});

test('炸弹之间仅按点数比较', () => {
  const threes = pattern(3, 3, 3, 3);
  const aces = pattern(14, 14, 14, 14);
  const twos = pattern(15, 15, 15, 15);
  assert.equal(HandComparator.canBeat(aces, threes), true);
  assert.equal(HandComparator.canBeat(twos, aces), true);
  assert.equal(HandComparator.canBeat(threes, twos), false);
  assert.equal(HandComparator.compareHands(aces, aces), HandComparator.COMPARISON.EQUAL);
});

test('王炸大于所有牌且没有牌能压王炸', () => {
  const rocket = pattern(16, 17);
  const largestBomb = pattern(15, 15, 15, 15);
  const ordinary = pattern(17);
  assert.equal(HandComparator.canBeat(rocket, largestBomb), true);
  assert.equal(HandComparator.canBeat(rocket, ordinary), true);
  assert.equal(HandComparator.canBeat(largestBomb, rocket), false);
  assert.equal(HandComparator.canBeat(rocket, rocket), false);
  assert.equal(HandComparator.compareHands(rocket, rocket), HandComparator.COMPARISON.EQUAL);
});

test('比较器接受卡牌数组、{cards} 和 {pattern} 包装', () => {
  const lowerCards = cards(3, 3);
  const higherCards = cards(4, 4);
  const higherPattern = HandAnalyzer.analyzeHand(higherCards);
  assert.equal(HandComparator.canBeat(higherCards, lowerCards), true);
  assert.equal(HandComparator.canBeat({ cards: higherCards }, { cards: lowerCards }), true);
  assert.equal(HandComparator.canBeat({ pattern: higherPattern }, lowerCards), true);
});

test('非法牌型或缺失目标不可比较', () => {
  const valid = pattern(3);
  const invalid = HandAnalyzer.analyzeHand(cards(3, 4));
  assert.equal(invalid.valid, false);
  assert.equal(HandComparator.canBeat(valid, invalid), false);
  assert.equal(HandComparator.canBeat(invalid, valid), false);
  assert.equal(HandComparator.compareHands(valid, invalid), HandComparator.COMPARISON.INCOMPARABLE);
  assert.equal(HandComparator.compareHands(valid, null), HandComparator.COMPARISON.INCOMPARABLE);
});

test('比较关系在同型同长度内满足反对称与传递性', () => {
  const low = pattern(3, 3);
  const middle = pattern(8, 8);
  const high = pattern(15, 15);
  assert.equal(HandComparator.canBeat(middle, low), true);
  assert.equal(HandComparator.canBeat(high, middle), true);
  assert.equal(HandComparator.canBeat(high, low), true);
  assert.equal(HandComparator.canBeat(low, middle), false);
  assert.equal(HandComparator.canBeat(middle, high), false);
});
