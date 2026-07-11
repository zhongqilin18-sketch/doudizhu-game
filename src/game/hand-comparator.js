(function attachHandComparator(root, factory) {
  'use strict';

  const analyzer = typeof module === 'object' && module.exports
    ? require('./hand-analyzer.js')
    : (root && root.DDZ);
  const api = factory(analyzer);

  if (root) {
    root.DDZ = root.DDZ || {};
    Object.assign(root.DDZ, api);
    root.DDZ.HandComparator = api;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHandComparator(analyzer) {
  'use strict';

  if (!analyzer || typeof analyzer.analyzeHand !== 'function') {
    throw new Error('hand-comparator.js 必须在 hand-analyzer.js 之后加载。');
  }

  const { HAND_TYPES, analyzeHand } = analyzer;

  const COMPARISON = Object.freeze({
    WEAKER: -1,
    EQUAL: 0,
    STRONGER: 1,
    INCOMPARABLE: null
  });

  function normalizeHandPattern(value) {
    if (!value) return null;
    if (value.valid === true && typeof value.type === 'string') return value;
    if (value.valid === false && typeof value.type === 'string') return value;
    if (value.pattern) return normalizeHandPattern(value.pattern);
    if (Array.isArray(value)) return analyzeHand(value);
    if (Array.isArray(value.cards)) return analyzeHand(value.cards);
    return null;
  }

  function compareHands(challengerValue, targetValue) {
    const challenger = normalizeHandPattern(challengerValue);
    const target = normalizeHandPattern(targetValue);

    if (!challenger || !challenger.valid || !target || !target.valid) {
      return COMPARISON.INCOMPARABLE;
    }

    if (challenger.type === HAND_TYPES.ROCKET) {
      return target.type === HAND_TYPES.ROCKET ? COMPARISON.EQUAL : COMPARISON.STRONGER;
    }
    if (target.type === HAND_TYPES.ROCKET) return COMPARISON.WEAKER;

    if (challenger.type === HAND_TYPES.BOMB) {
      if (target.type !== HAND_TYPES.BOMB) return COMPARISON.STRONGER;
      return Math.sign(challenger.mainRank - target.mainRank);
    }
    if (target.type === HAND_TYPES.BOMB) return COMPARISON.WEAKER;

    if (challenger.type !== target.type || challenger.cardCount !== target.cardCount) {
      return COMPARISON.INCOMPARABLE;
    }

    return Math.sign(challenger.mainRank - target.mainRank);
  }

  function canBeat(challenger, target) {
    return compareHands(challenger, target) === COMPARISON.STRONGER;
  }

  function areComparable(first, second) {
    return compareHands(first, second) !== COMPARISON.INCOMPARABLE;
  }

  return Object.freeze({
    COMPARISON,
    normalizeHandPattern,
    compareHands,
    comparePatterns: compareHands,
    canBeat,
    areComparable
  });
}));
