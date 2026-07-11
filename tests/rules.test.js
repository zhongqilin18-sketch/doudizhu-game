'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HandAnalyzer,
  Rules,
  HAND_TYPES,
  cards,
  orderVariants,
  patternSummary
} = require('./test-helpers.js');

function expectType(inputCards, expectedType, expected) {
  const pattern = HandAnalyzer.analyzeHand(inputCards);
  assert.equal(pattern.valid, true, pattern.reason);
  assert.equal(pattern.type, expectedType);
  if (expected) {
    for (const [key, value] of Object.entries(expected)) assert.equal(pattern[key], value, key);
  }
  return pattern;
}

function expectInvalid(inputCards, expectedCode) {
  const pattern = HandAnalyzer.analyzeHand(inputCards);
  assert.equal(pattern.valid, false, `意外识别为 ${pattern.name}`);
  assert.equal(pattern.type, HAND_TYPES.INVALID);
  assert.equal(typeof pattern.reason, 'string');
  assert.ok(pattern.reason.length > 0);
  if (expectedCode) assert.equal(pattern.code, expectedCode);
  return pattern;
}

test('单张：普通牌、最大单张与错误张数', () => {
  expectType(cards(3), HAND_TYPES.SINGLE, { mainRank: 3, cardCount: 1, chainLength: 1 });
  expectType(cards(17), HAND_TYPES.SINGLE, { mainRank: 17 });
  expectInvalid(cards(3, 4));
});

test('对子：普通对子、对2与不同点数', () => {
  expectType(cards(3, 3), HAND_TYPES.PAIR, { mainRank: 3, cardCount: 2 });
  expectType(cards(15, 15), HAND_TYPES.PAIR, { mainRank: 15 });
  expectInvalid(cards(14, 15));
});

test('三张：普通三张、三个2与混合点数', () => {
  expectType(cards(7, 7, 7), HAND_TYPES.TRIPLE, { mainRank: 7, cardCount: 3 });
  expectType(cards(15, 15, 15), HAND_TYPES.TRIPLE, { mainRank: 15 });
  expectInvalid(cards(7, 7, 8));
});

test('三带一：正确、含王边界与错误的两对', () => {
  expectType(cards(3, 3, 3, 4), HAND_TYPES.TRIPLE_SINGLE, { mainRank: 3, wingType: 'single' });
  expectType(cards(15, 15, 15, 17), HAND_TYPES.TRIPLE_SINGLE, { mainRank: 15 });
  expectInvalid(cards(3, 3, 4, 4));
  assert.equal(HandAnalyzer.analyzeHand(cards(3, 3, 3, 3)).type, HAND_TYPES.BOMB);
});

test('三带二：正确、三个2带A对与错误附件', () => {
  expectType(cards(3, 3, 3, 4, 4), HAND_TYPES.TRIPLE_PAIR, { mainRank: 3, wingType: 'pair' });
  expectType(cards(15, 15, 15, 14, 14), HAND_TYPES.TRIPLE_PAIR, { mainRank: 15 });
  expectInvalid(cards(3, 3, 3, 4, 5));
});

test('顺子：最短顺子与最高合法顺子', () => {
  expectType(cards(3, 4, 5, 6, 7), HAND_TYPES.STRAIGHT, {
    mainRank: 7,
    cardCount: 5,
    chainLength: 5
  });
  expectType(cards(10, 11, 12, 13, 14), HAND_TYPES.STRAIGHT, { mainRank: 14 });
  expectType(cards(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14), HAND_TYPES.STRAIGHT, {
    mainRank: 14,
    cardCount: 12
  });
});

test('顺子：A2345、含2、含王、重复点数和不足五张均非法', () => {
  expectInvalid(cards(14, 15, 3, 4, 5));
  expectInvalid(cards(11, 12, 13, 14, 15));
  expectInvalid(cards(10, 11, 12, 13, 16));
  expectInvalid(cards(3, 4, 5, 6, 6));
  expectInvalid(cards(3, 4, 5, 6));
});

test('连对：最短连对与最高合法连对', () => {
  expectType(cards(3, 3, 4, 4, 5, 5), HAND_TYPES.PAIR_STRAIGHT, {
    mainRank: 5,
    cardCount: 6,
    chainLength: 3
  });
  expectType(cards(10, 10, 11, 11, 12, 12, 13, 13, 14, 14), HAND_TYPES.PAIR_STRAIGHT, {
    mainRank: 14,
    chainLength: 5
  });
});

test('连对：不足三对、不连续、含2与计数不齐均非法', () => {
  expectInvalid(cards(3, 3, 4, 4));
  expectInvalid(cards(3, 3, 4, 4, 6, 6));
  expectInvalid(cards(13, 13, 14, 14, 15, 15));
  expectInvalid(cards(3, 3, 4, 4, 5, 6));
});

test('纯飞机：最短、长飞机与最高主体边界', () => {
  expectType(cards(3, 3, 3, 4, 4, 4), HAND_TYPES.PLANE, {
    mainRank: 4,
    cardCount: 6,
    chainLength: 2
  });
  expectType(cards(3, 3, 3, 4, 4, 4, 5, 5, 5), HAND_TYPES.PLANE, {
    mainRank: 5,
    chainLength: 3
  });
  expectType(cards(10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14), HAND_TYPES.PLANE, {
    mainRank: 14,
    chainLength: 5
  });
});

test('纯飞机：主体不连续、只有一组三张、包含2均非法', () => {
  expectInvalid(cards(3, 3, 3, 5, 5, 5));
  assert.equal(HandAnalyzer.analyzeHand(cards(3, 3, 3)).type, HAND_TYPES.TRIPLE);
  expectInvalid(cards(14, 14, 14, 15, 15, 15));
});

test('飞机带单：严格使用等量、异点且主体外的单牌', () => {
  expectType(cards(3, 3, 3, 4, 4, 4, 5, 6), HAND_TYPES.PLANE_SINGLE, {
    mainRank: 4,
    cardCount: 8,
    chainLength: 2,
    wingType: 'single'
  });
  expectType(cards(10, 10, 10, 11, 11, 11, 15, 16), HAND_TYPES.PLANE_SINGLE, {
    mainRank: 11,
    chainLength: 2
  });
  expectType(cards(3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 7, 8), HAND_TYPES.PLANE_SINGLE, {
    mainRank: 5,
    chainLength: 3
  });
});

test('飞机带单：对子翼、主体四张、不连续主体和错误翼数均非法', () => {
  expectInvalid(cards(3, 3, 3, 4, 4, 4, 5, 5));
  expectInvalid(cards(3, 3, 3, 3, 4, 4, 5, 6));
  expectInvalid(cards(3, 3, 3, 5, 5, 5, 6, 7));
  expectInvalid(cards(3, 3, 3, 4, 4, 4, 5));
});

test('飞机带对：正确、主体到A与多组边界', () => {
  expectType(cards(3, 3, 3, 4, 4, 4, 5, 5, 6, 6), HAND_TYPES.PLANE_PAIR, {
    mainRank: 4,
    cardCount: 10,
    chainLength: 2,
    wingType: 'pair'
  });
  expectType(cards(13, 13, 13, 14, 14, 14, 12, 12, 15, 15), HAND_TYPES.PLANE_PAIR, {
    mainRank: 14,
    chainLength: 2
  });
  expectType(cards(3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8), HAND_TYPES.PLANE_PAIR, {
    mainRank: 5,
    chainLength: 3
  });
});

test('飞机带对：单牌混入、主体不连续和错误翼数均非法', () => {
  expectInvalid(cards(3, 3, 3, 4, 4, 4, 5, 5, 6, 7));
  expectInvalid(cards(3, 3, 3, 5, 5, 5, 6, 6, 7, 7));
  expectInvalid(cards(3, 3, 3, 4, 4, 4, 5, 5));
});

test('四带二单：两张不同单牌、一个对子和大小王均可作附件', () => {
  expectType(cards(4, 4, 4, 4, 5, 6), HAND_TYPES.FOUR_TWO_SINGLES, {
    mainRank: 4,
    cardCount: 6,
    wingType: 'single'
  });
  expectType(cards(4, 4, 4, 4, 5, 5), HAND_TYPES.FOUR_TWO_SINGLES, { mainRank: 4 });
  expectType(cards(15, 15, 15, 15, 16, 17), HAND_TYPES.FOUR_TWO_SINGLES, { mainRank: 15 });
  expectInvalid(cards(4, 4, 4, 4, 5));
});

test('四带二对：正确、四个2边界与错误对子结构', () => {
  expectType(cards(4, 4, 4, 4, 5, 5, 6, 6), HAND_TYPES.FOUR_TWO_PAIRS, {
    mainRank: 4,
    cardCount: 8,
    wingType: 'pair'
  });
  expectType(cards(15, 15, 15, 15, 13, 13, 14, 14), HAND_TYPES.FOUR_TWO_PAIRS, { mainRank: 15 });
  expectInvalid(cards(4, 4, 4, 4, 5, 5, 5, 6));
  expectInvalid(cards(4, 4, 4, 4, 5, 5, 5, 5));
});

test('炸弹：普通炸弹、最大炸弹及非四同点', () => {
  expectType(cards(7, 7, 7, 7), HAND_TYPES.BOMB, { mainRank: 7, cardCount: 4 });
  expectType(cards(15, 15, 15, 15), HAND_TYPES.BOMB, { mainRank: 15 });
  expectInvalid(cards(7, 7, 8, 8));
  assert.equal(HandAnalyzer.analyzeHand(cards(7, 7, 7, 8)).type, HAND_TYPES.TRIPLE_SINGLE);
});

test('王炸：仅大小王两张，其他两张散牌非法', () => {
  expectType(cards(16, 17), HAND_TYPES.ROCKET, { mainRank: 17, cardCount: 2 });
  expectInvalid(cards(16, 14));
  const duplicateSmallJoker = [
    { id: 'joker-a', suit: 'joker', rank: 16 },
    { id: 'joker-b', suit: 'joker', rank: 16 }
  ];
  expectInvalid(duplicateSmallJoker, HandAnalyzer.ANALYZE_ERROR_CODES.IMPOSSIBLE_CARD_COUNT);
});

test('重点歧义：四带二不会误判飞机，两副炸弹不能一起出', () => {
  assert.equal(HandAnalyzer.analyzeHand(cards(4, 4, 4, 4, 5, 5)).type, HAND_TYPES.FOUR_TWO_SINGLES);
  assert.equal(HandAnalyzer.analyzeHand(cards(4, 4, 4, 4, 5, 5, 6, 6)).type, HAND_TYPES.FOUR_TWO_PAIRS);
  expectInvalid(cards(3, 3, 3, 3, 4, 4, 4, 4));
});

test('重点歧义：四组连续三张只识别为纯飞机', () => {
  const pattern = expectType(
    cards(3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6),
    HAND_TYPES.PLANE,
    { mainRank: 6, cardCount: 12, chainLength: 4, wingType: null }
  );
  assert.equal(pattern.name, '飞机');
});

test('牌型识别与输入排列无关', () => {
  const samples = [
    { input: cards(3), type: HAND_TYPES.SINGLE },
    { input: cards(3, 3), type: HAND_TYPES.PAIR },
    { input: cards(3, 3, 3), type: HAND_TYPES.TRIPLE },
    { input: cards(3, 3, 3, 4), type: HAND_TYPES.TRIPLE_SINGLE },
    { input: cards(3, 3, 3, 4, 4), type: HAND_TYPES.TRIPLE_PAIR },
    { input: cards(3, 4, 5, 6, 7), type: HAND_TYPES.STRAIGHT },
    { input: cards(3, 3, 4, 4, 5, 5), type: HAND_TYPES.PAIR_STRAIGHT },
    { input: cards(3, 3, 3, 4, 4, 4), type: HAND_TYPES.PLANE },
    { input: cards(3, 3, 3, 4, 4, 4, 5, 6), type: HAND_TYPES.PLANE_SINGLE },
    { input: cards(3, 3, 3, 4, 4, 4, 5, 5, 6, 6), type: HAND_TYPES.PLANE_PAIR },
    { input: cards(4, 4, 4, 4, 5, 6), type: HAND_TYPES.FOUR_TWO_SINGLES },
    { input: cards(4, 4, 4, 4, 5, 5, 6, 6), type: HAND_TYPES.FOUR_TWO_PAIRS },
    { input: cards(7, 7, 7, 7), type: HAND_TYPES.BOMB },
    { input: cards(16, 17), type: HAND_TYPES.ROCKET }
  ];

  for (const sample of samples) {
    const expected = patternSummary(HandAnalyzer.analyzeHand(sample.input));
    for (const variant of orderVariants(sample.input)) {
      const actual = HandAnalyzer.analyzeHand(variant);
      assert.equal(actual.type, sample.type);
      assert.deepEqual(patternSummary(actual), expected);
    }
  }
});

test('无效输入、重复ID和不可能的点数数量会被拒绝', () => {
  assert.equal(HandAnalyzer.analyzeHand(null).code, HandAnalyzer.ANALYZE_ERROR_CODES.INVALID_INPUT);
  assert.equal(HandAnalyzer.analyzeHand([]).code, HandAnalyzer.ANALYZE_ERROR_CODES.EMPTY_SELECTION);
  expectInvalid([{ id: 'bad', suit: 'spades', rank: 18 }], HandAnalyzer.ANALYZE_ERROR_CODES.INVALID_CARD);
  const repeated = { id: 'same-card', suit: 'spades', rank: 3 };
  expectInvalid([repeated, repeated], HandAnalyzer.ANALYZE_ERROR_CODES.DUPLICATE_CARD);
  expectInvalid([
    { id: 'a', rank: 3 }, { id: 'b', rank: 3 }, { id: 'c', rank: 3 },
    { id: 'd', rank: 3 }, { id: 'e', rank: 3 }
  ], HandAnalyzer.ANALYZE_ERROR_CODES.IMPOSSIBLE_CARD_COUNT);
});

test('分析器不修改输入数组或卡牌对象', () => {
  const input = cards(3, 3, 3, 4, 4, 4, 5, 6);
  const idsBefore = input.map((card) => card.id);
  Object.freeze(input);
  const pattern = HandAnalyzer.analyzeHand(input);
  assert.equal(pattern.valid, true);
  assert.deepEqual(input.map((card) => card.id), idsBefore);
  assert.equal(Object.isFrozen(pattern), true);
  assert.equal(Object.isFrozen(pattern.uniqueRanks), true);
  assert.equal(Object.isFrozen(pattern.rankCounts), true);
});

test('validateSelection：首出、手牌归属与非法牌型', () => {
  const hand = cards(3, 3, 4, 5, 6, 7, 8);
  const lead = Rules.validateSelection(hand.slice(2), hand, null);
  assert.equal(lead.ok, true);
  assert.equal(lead.pattern.type, HAND_TYPES.STRAIGHT);

  const outside = cards(3, 3);
  assert.equal(
    Rules.validateSelection(outside, hand, null).code,
    Rules.VALIDATION_CODES.CARD_NOT_IN_HAND
  );
  assert.equal(
    Rules.validateSelection([hand[0], hand[0]], hand, null).code,
    Rules.VALIDATION_CODES.DUPLICATE_CARD
  );
  assert.equal(
    Rules.validateSelection([hand[0], hand[2]], hand, null).code,
    Rules.VALIDATION_CODES.INVALID_HAND
  );
});

test('validateSelection：跟牌必须同型同长度且能压过', () => {
  const hand = cards(4, 4, 5, 5, 6, 6, 7, 7, 7, 7);
  const targetPair = HandAnalyzer.analyzeHand(cards(3, 3));
  assert.equal(Rules.validateSelection(hand.slice(0, 2), hand, targetPair).ok, true);
  assert.equal(
    Rules.validateSelection(hand.slice(2, 4), hand, HandAnalyzer.analyzeHand(cards(6, 6))).code,
    Rules.VALIDATION_CODES.CANNOT_BEAT
  );

  const targetStraight = HandAnalyzer.analyzeHand(cards(3, 4, 5, 6, 7));
  const longerStraightHand = cards(4, 5, 6, 7, 8, 9);
  assert.equal(
    Rules.validateSelection(longerStraightHand, longerStraightHand, targetStraight).code,
    Rules.VALIDATION_CODES.CANNOT_BEAT
  );

  const bomb = hand.slice(6);
  assert.equal(Rules.validateSelection(bomb, hand, targetStraight).ok, true);
});
