'use strict';

const HandAnalyzer = require('../src/game/hand-analyzer.js');
const HandComparator = require('../src/game/hand-comparator.js');
const Rules = require('../src/game/rules.js');

const SUITS = Object.freeze(['spades', 'hearts', 'clubs', 'diamonds']);
const TEST_RANKS = Object.freeze({
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  TWO: 15,
  SJ: 16,
  BJ: 17
});

let cardSequence = 0;

function normalizeTestRank(value) {
  if (Number.isInteger(value)) return value;
  const normalized = String(value).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(TEST_RANKS, normalized)) return TEST_RANKS[normalized];
  if (/^\d+$/.test(normalized)) return Number(normalized);
  throw new TypeError(`无法识别测试点数：${value}`);
}

function cards(...rankValues) {
  const ranks = rankValues.flat(Infinity).map(normalizeTestRank);
  const occurrences = new Map();

  return ranks.map((rank) => {
    const occurrence = occurrences.get(rank) || 0;
    const maximum = rank >= 16 ? 1 : 4;
    if (occurrence >= maximum) {
      throw new RangeError(`点数 ${rank} 超过一副牌的物理数量`);
    }
    occurrences.set(rank, occurrence + 1);
    cardSequence += 1;
    return Object.freeze({
      id: `test-${cardSequence}`,
      suit: rank >= 16 ? 'joker' : SUITS[occurrence],
      rank,
      label: HandAnalyzer.rankLabel(rank)
    });
  });
}

function orderVariants(inputCards) {
  const original = [...inputCards];
  const reversed = [...inputCards].reverse();
  const rotated = inputCards.length > 1
    ? [...inputCards.slice(1), inputCards[0]]
    : [...inputCards];
  const zigzag = inputCards.filter((_, index) => index % 2 === 0)
    .concat(inputCards.filter((_, index) => index % 2 === 1));
  const variants = [original, reversed, rotated, zigzag];
  const seen = new Set();
  return variants.filter((variant) => {
    const signature = variant.map((card) => card.id).join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function patternSummary(pattern) {
  return {
    valid: pattern.valid,
    type: pattern.type,
    name: pattern.name,
    mainRank: pattern.mainRank,
    cardCount: pattern.cardCount,
    chainLength: pattern.chainLength,
    wingType: pattern.wingType
  };
}

module.exports = Object.freeze({
  HandAnalyzer,
  HandComparator,
  Rules,
  HAND_TYPES: HandAnalyzer.HAND_TYPES,
  TEST_RANKS,
  cards,
  orderVariants,
  patternSummary
});
