(function attachHandAnalyzer(root, factory) {
  'use strict';

  const api = factory();
  if (root) {
    root.DDZ = root.DDZ || {};
    Object.assign(root.DDZ, api);
    root.DDZ.HandAnalyzer = api;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHandAnalyzer() {
  'use strict';

  const HAND_TYPES = Object.freeze({
    INVALID: 'invalid',
    SINGLE: 'single',
    PAIR: 'pair',
    TRIPLE: 'triple',
    TRIPLE_SINGLE: 'tripleSingle',
    TRIPLE_PAIR: 'triplePair',
    STRAIGHT: 'straight',
    PAIR_STRAIGHT: 'pairStraight',
    PLANE: 'plane',
    PLANE_SINGLE: 'planeSingle',
    PLANE_PAIR: 'planePair',
    FOUR_TWO_SINGLES: 'fourTwoSingles',
    FOUR_TWO_PAIRS: 'fourTwoPairs',
    BOMB: 'bomb',
    ROCKET: 'rocket'
  });

  const HAND_TYPE_NAMES = Object.freeze({
    [HAND_TYPES.INVALID]: '非法牌型',
    [HAND_TYPES.SINGLE]: '单张',
    [HAND_TYPES.PAIR]: '对子',
    [HAND_TYPES.TRIPLE]: '三张',
    [HAND_TYPES.TRIPLE_SINGLE]: '三带一',
    [HAND_TYPES.TRIPLE_PAIR]: '三带二',
    [HAND_TYPES.STRAIGHT]: '顺子',
    [HAND_TYPES.PAIR_STRAIGHT]: '连对',
    [HAND_TYPES.PLANE]: '飞机',
    [HAND_TYPES.PLANE_SINGLE]: '飞机带单牌',
    [HAND_TYPES.PLANE_PAIR]: '飞机带对子',
    [HAND_TYPES.FOUR_TWO_SINGLES]: '四带二单',
    [HAND_TYPES.FOUR_TWO_PAIRS]: '四带二对',
    [HAND_TYPES.BOMB]: '炸弹',
    [HAND_TYPES.ROCKET]: '王炸'
  });

  const ANALYZE_ERROR_CODES = Object.freeze({
    EMPTY_SELECTION: 'EMPTY_SELECTION',
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_CARD: 'INVALID_CARD',
    DUPLICATE_CARD: 'DUPLICATE_CARD',
    IMPOSSIBLE_CARD_COUNT: 'IMPOSSIBLE_CARD_COUNT',
    INVALID_HAND: 'INVALID_HAND'
  });

  const RANK = Object.freeze({
    THREE: 3,
    JACK: 11,
    QUEEN: 12,
    KING: 13,
    ACE: 14,
    TWO: 15,
    SMALL_JOKER: 16,
    BIG_JOKER: 17
  });

  const STRING_RANKS = Object.freeze({
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 11,
    JACK: 11,
    Q: 12,
    QUEEN: 12,
    K: 13,
    KING: 13,
    A: 14,
    ACE: 14,
    '2': 15,
    SJ: 16,
    SMALLJOKER: 16,
    SMALL_JOKER: 16,
    BLACKJOKER: 16,
    BLACK_JOKER: 16,
    '小王': 16,
    BJ: 17,
    BIGJOKER: 17,
    BIG_JOKER: 17,
    REDJOKER: 17,
    RED_JOKER: 17,
    '大王': 17
  });

  function normalizeRank(card) {
    const rawRank = card && typeof card === 'object'
      ? (card.rank !== undefined ? card.rank : card.value)
      : card;

    if (Number.isInteger(rawRank) && rawRank >= RANK.THREE && rawRank <= RANK.BIG_JOKER) {
      return rawRank;
    }

    if (typeof rawRank === 'string') {
      const normalized = rawRank.trim().toUpperCase().replace(/[\s-]/g, '_');
      if (Object.prototype.hasOwnProperty.call(STRING_RANKS, normalized)) {
        return STRING_RANKS[normalized];
      }
      const compact = normalized.replace(/_/g, '');
      if (Object.prototype.hasOwnProperty.call(STRING_RANKS, compact)) {
        return STRING_RANKS[compact];
      }
    }

    return null;
  }

  function rankLabel(rank) {
    if (rank >= 3 && rank <= 10) return String(rank);
    if (rank === RANK.JACK) return 'J';
    if (rank === RANK.QUEEN) return 'Q';
    if (rank === RANK.KING) return 'K';
    if (rank === RANK.ACE) return 'A';
    if (rank === RANK.TWO) return '2';
    if (rank === RANK.SMALL_JOKER) return '小王';
    if (rank === RANK.BIG_JOKER) return '大王';
    return '?';
  }

  function invalidAnalysis(code, reason, cardCount) {
    return Object.freeze({
      valid: false,
      type: HAND_TYPES.INVALID,
      name: HAND_TYPE_NAMES[HAND_TYPES.INVALID],
      typeName: HAND_TYPE_NAMES[HAND_TYPES.INVALID],
      mainRank: null,
      cardCount: Number.isInteger(cardCount) ? cardCount : 0,
      size: Number.isInteger(cardCount) ? cardCount : 0,
      length: Number.isInteger(cardCount) ? cardCount : 0,
      chainLength: 0,
      wingType: null,
      code,
      reason
    });
  }

  function cardIdentity(card) {
    if (!card || typeof card !== 'object') return null;
    if (card.id !== undefined && card.id !== null) {
      return `id:${typeof card.id}:${String(card.id)}`;
    }
    if (card.suit !== undefined && card.suit !== null) {
      const rank = normalizeRank(card);
      return rank === null ? null : `suit:${String(card.suit)}:rank:${rank}`;
    }
    return null;
  }

  function inspectCards(cards) {
    if (!Array.isArray(cards)) {
      return { error: invalidAnalysis(ANALYZE_ERROR_CODES.INVALID_INPUT, '出牌数据必须是数组。', 0) };
    }
    if (cards.length === 0) {
      return { error: invalidAnalysis(ANALYZE_ERROR_CODES.EMPTY_SELECTION, '请先选择要出的牌。', 0) };
    }
    if (cards.length > 20) {
      return { error: invalidAnalysis(ANALYZE_ERROR_CODES.IMPOSSIBLE_CARD_COUNT, '一次出牌不能超过二十张。', cards.length) };
    }

    const ranks = [];
    const identities = new Set();
    const objectReferences = typeof WeakSet === 'function' ? new WeakSet() : null;

    for (const card of cards) {
      const rank = normalizeRank(card);
      if (rank === null) {
        return { error: invalidAnalysis(ANALYZE_ERROR_CODES.INVALID_CARD, '选牌中包含无法识别的扑克牌。', cards.length) };
      }

      const identity = cardIdentity(card);
      if (identity !== null) {
        if (identities.has(identity)) {
          return { error: invalidAnalysis(ANALYZE_ERROR_CODES.DUPLICATE_CARD, '选牌中存在重复的牌。', cards.length) };
        }
        identities.add(identity);
      } else if (objectReferences && card && typeof card === 'object') {
        if (objectReferences.has(card)) {
          return { error: invalidAnalysis(ANALYZE_ERROR_CODES.DUPLICATE_CARD, '选牌中存在重复的牌。', cards.length) };
        }
        objectReferences.add(card);
      }
      ranks.push(rank);
    }

    const counts = new Map();
    for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
    for (const [rank, count] of counts) {
      const maximum = rank >= RANK.SMALL_JOKER ? 1 : 4;
      if (count > maximum) {
        return { error: invalidAnalysis(ANALYZE_ERROR_CODES.IMPOSSIBLE_CARD_COUNT, '选牌数量超出一副扑克牌中该点数的数量。', cards.length) };
      }
    }

    const entries = Array.from(counts.entries()).sort((left, right) => left[0] - right[0]);
    return { ranks, counts, entries };
  }

  function isConsecutive(ranks) {
    if (ranks.length === 0) return false;
    for (let index = 1; index < ranks.length; index += 1) {
      if (ranks[index] !== ranks[index - 1] + 1) return false;
    }
    return true;
  }

  function allCounts(entries, expected) {
    return entries.every((entry) => entry[1] === expected);
  }

  function createPattern(type, cardCount, mainRank, chainLength, wingType, entries, cards) {
    const rankCounts = {};
    for (const [rank, count] of entries) rankCounts[rank] = count;
    const cardIds = cards
      .filter((card) => card && typeof card === 'object' && card.id !== undefined && card.id !== null)
      .map((card) => card.id)
      .sort((left, right) => String(left).localeCompare(String(right)));

    return Object.freeze({
      valid: true,
      type,
      name: HAND_TYPE_NAMES[type],
      typeName: HAND_TYPE_NAMES[type],
      mainRank,
      mainRankLabel: rankLabel(mainRank),
      cardCount,
      size: cardCount,
      length: cardCount,
      chainLength: chainLength || 1,
      wingType: wingType || null,
      uniqueRanks: Object.freeze(entries.map((entry) => entry[0])),
      rankCounts: Object.freeze(rankCounts),
      cardIds: Object.freeze(cardIds)
    });
  }

  function findPlaneWithWings(entries, bodyLength, wingCount) {
    const possibleBodyRanks = entries
      .filter(([rank, count]) => rank <= RANK.ACE && count === 3)
      .map(([rank]) => rank);

    for (let start = 0; start + bodyLength <= possibleBodyRanks.length; start += 1) {
      const bodyRanks = possibleBodyRanks.slice(start, start + bodyLength);
      if (!isConsecutive(bodyRanks)) continue;

      const bodySet = new Set(bodyRanks);
      const wings = entries.filter(([rank]) => !bodySet.has(rank));
      if (wings.length !== bodyLength || !allCounts(wings, wingCount)) continue;
      return bodyRanks;
    }
    return null;
  }

  function analyzeHand(cards) {
    const inspected = inspectCards(cards);
    if (inspected.error) return inspected.error;

    const { counts, entries } = inspected;
    const cardCount = cards.length;
    const uniqueRanks = entries.map((entry) => entry[0]);
    const countValues = entries.map((entry) => entry[1]).sort((left, right) => right - left);
    const oneRank = uniqueRanks.length === 1;

    if (cardCount === 2 && counts.get(RANK.SMALL_JOKER) === 1 && counts.get(RANK.BIG_JOKER) === 1) {
      return createPattern(HAND_TYPES.ROCKET, cardCount, RANK.BIG_JOKER, 1, null, entries, cards);
    }
    if (cardCount === 4 && oneRank && countValues[0] === 4) {
      return createPattern(HAND_TYPES.BOMB, cardCount, uniqueRanks[0], 1, null, entries, cards);
    }
    if (cardCount === 1) {
      return createPattern(HAND_TYPES.SINGLE, cardCount, uniqueRanks[0], 1, null, entries, cards);
    }
    if (cardCount === 2 && oneRank && countValues[0] === 2) {
      return createPattern(HAND_TYPES.PAIR, cardCount, uniqueRanks[0], 1, null, entries, cards);
    }
    if (cardCount === 3 && oneRank && countValues[0] === 3) {
      return createPattern(HAND_TYPES.TRIPLE, cardCount, uniqueRanks[0], 1, null, entries, cards);
    }
    if (cardCount === 4 && countValues.length === 2 && countValues[0] === 3 && countValues[1] === 1) {
      const tripleRank = entries.find((entry) => entry[1] === 3)[0];
      return createPattern(HAND_TYPES.TRIPLE_SINGLE, cardCount, tripleRank, 1, 'single', entries, cards);
    }
    if (cardCount === 5 && countValues.length === 2 && countValues[0] === 3 && countValues[1] === 2) {
      const tripleRank = entries.find((entry) => entry[1] === 3)[0];
      return createPattern(HAND_TYPES.TRIPLE_PAIR, cardCount, tripleRank, 1, 'pair', entries, cards);
    }

    if (cardCount >= 5
      && entries.length === cardCount
      && allCounts(entries, 1)
      && uniqueRanks[uniqueRanks.length - 1] <= RANK.ACE
      && isConsecutive(uniqueRanks)) {
      return createPattern(HAND_TYPES.STRAIGHT, cardCount, uniqueRanks[uniqueRanks.length - 1], cardCount, null, entries, cards);
    }

    if (cardCount >= 6
      && cardCount % 2 === 0
      && entries.length === cardCount / 2
      && allCounts(entries, 2)
      && uniqueRanks[uniqueRanks.length - 1] <= RANK.ACE
      && isConsecutive(uniqueRanks)) {
      return createPattern(HAND_TYPES.PAIR_STRAIGHT, cardCount, uniqueRanks[uniqueRanks.length - 1], cardCount / 2, null, entries, cards);
    }

    if (cardCount >= 6
      && cardCount % 3 === 0
      && entries.length === cardCount / 3
      && allCounts(entries, 3)
      && uniqueRanks[uniqueRanks.length - 1] <= RANK.ACE
      && isConsecutive(uniqueRanks)) {
      return createPattern(HAND_TYPES.PLANE, cardCount, uniqueRanks[uniqueRanks.length - 1], cardCount / 3, null, entries, cards);
    }

    if (cardCount >= 8 && cardCount % 4 === 0) {
      const bodyLength = cardCount / 4;
      const bodyRanks = findPlaneWithWings(entries, bodyLength, 1);
      if (bodyLength >= 2 && bodyRanks) {
        return createPattern(HAND_TYPES.PLANE_SINGLE, cardCount, bodyRanks[bodyRanks.length - 1], bodyLength, 'single', entries, cards);
      }
    }

    if (cardCount >= 10 && cardCount % 5 === 0) {
      const bodyLength = cardCount / 5;
      const bodyRanks = findPlaneWithWings(entries, bodyLength, 2);
      if (bodyLength >= 2 && bodyRanks) {
        return createPattern(HAND_TYPES.PLANE_PAIR, cardCount, bodyRanks[bodyRanks.length - 1], bodyLength, 'pair', entries, cards);
      }
    }

    if (cardCount === 6) {
      const fourRankEntry = entries.filter((entry) => entry[1] === 4);
      if (fourRankEntry.length === 1) {
        return createPattern(HAND_TYPES.FOUR_TWO_SINGLES, cardCount, fourRankEntry[0][0], 1, 'single', entries, cards);
      }
    }

    if (cardCount === 8) {
      const fourRankEntry = entries.filter((entry) => entry[1] === 4);
      const pairEntries = entries.filter((entry) => entry[1] === 2);
      if (fourRankEntry.length === 1 && pairEntries.length === 2 && entries.length === 3) {
        return createPattern(HAND_TYPES.FOUR_TWO_PAIRS, cardCount, fourRankEntry[0][0], 1, 'pair', entries, cards);
      }
    }

    return invalidAnalysis(
      ANALYZE_ERROR_CODES.INVALID_HAND,
      '所选牌不能组成当前规则支持的合法牌型。',
      cardCount
    );
  }

  function isValidHand(cards) {
    return analyzeHand(cards).valid;
  }

  return Object.freeze({
    HAND_TYPES,
    HAND_TYPE_NAMES,
    ANALYZE_ERROR_CODES,
    RANK,
    normalizeRank,
    rankLabel,
    analyzeHand,
    isValidHand
  });
}));
