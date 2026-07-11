(function attachRules(root, factory) {
  'use strict';

  const analyzer = typeof module === 'object' && module.exports
    ? require('./hand-analyzer.js')
    : (root && root.DDZ);
  const comparator = typeof module === 'object' && module.exports
    ? require('./hand-comparator.js')
    : (root && root.DDZ);
  const ownApi = factory(analyzer, comparator);
  const api = Object.freeze(Object.assign({}, analyzer, comparator, ownApi));

  if (root) {
    root.DDZ = root.DDZ || {};
    Object.assign(root.DDZ, api);
    root.DDZ.Rules = api;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRules(analyzer, comparator) {
  'use strict';

  if (!analyzer || !comparator) {
    throw new Error('rules.js 必须在 hand-analyzer.js 与 hand-comparator.js 之后加载。');
  }

  const RULE_VARIANT = Object.freeze({
    planeSingleWingsUseDistinctRanks: true,
    planeWingsMayUseBodyRanks: false,
    fourWithTwoSinglesMayUsePair: true,
    sequenceMaximumRank: analyzer.RANK.ACE
  });

  const VALIDATION_CODES = Object.freeze({
    OK: 'OK',
    EMPTY_SELECTION: 'EMPTY_SELECTION',
    INVALID_SELECTION: 'INVALID_SELECTION',
    DUPLICATE_CARD: 'DUPLICATE_CARD',
    CARD_NOT_IN_HAND: 'CARD_NOT_IN_HAND',
    INVALID_HAND: 'INVALID_HAND',
    INVALID_TARGET: 'INVALID_TARGET',
    CANNOT_BEAT: 'CANNOT_BEAT'
  });

  function success(pattern, targetPattern) {
    return Object.freeze({
      ok: true,
      valid: true,
      code: VALIDATION_CODES.OK,
      reason: '',
      pattern,
      targetPattern: targetPattern || null
    });
  }

  function failure(code, reason, pattern, targetPattern) {
    return Object.freeze({
      ok: false,
      valid: false,
      code,
      reason,
      pattern: pattern || null,
      targetPattern: targetPattern || null
    });
  }

  function hasUsableId(card) {
    return Boolean(card && typeof card === 'object' && card.id !== undefined && card.id !== null);
  }

  function idKey(card) {
    return `${typeof card.id}:${String(card.id)}`;
  }

  function rankMultiset(cards) {
    const counts = new Map();
    for (const card of cards) {
      const rank = analyzer.normalizeRank(card);
      if (rank === null) return null;
      counts.set(rank, (counts.get(rank) || 0) + 1);
    }
    return counts;
  }

  function isSelectionSubsetOfHand(selectedCards, handCards) {
    if (!Array.isArray(selectedCards) || !Array.isArray(handCards)) return false;

    if (selectedCards.every(hasUsableId) && handCards.every(hasUsableId)) {
      const available = new Map();
      for (const card of handCards) {
        const key = idKey(card);
        available.set(key, (available.get(key) || 0) + 1);
      }
      for (const card of selectedCards) {
        const key = idKey(card);
        const remaining = available.get(key) || 0;
        if (remaining < 1) return false;
        available.set(key, remaining - 1);
      }
      return true;
    }

    const selectedRanks = rankMultiset(selectedCards);
    const handRanks = rankMultiset(handCards);
    if (!selectedRanks || !handRanks) return false;
    for (const [rank, count] of selectedRanks) {
      if ((handRanks.get(rank) || 0) < count) return false;
    }
    return true;
  }

  function resolveTargetPattern(previousPlay) {
    if (!previousPlay) return null;
    return comparator.normalizeHandPattern(previousPlay);
  }

  function validateSelection(selectedCards, handCards, previousPlay) {
    if (!Array.isArray(selectedCards) || selectedCards.length === 0) {
      return failure(VALIDATION_CODES.EMPTY_SELECTION, '请先选择要出的牌。');
    }

    const pattern = analyzer.analyzeHand(selectedCards);
    if (!pattern.valid) {
      const code = pattern.code === analyzer.ANALYZE_ERROR_CODES.DUPLICATE_CARD
        ? VALIDATION_CODES.DUPLICATE_CARD
        : (pattern.code === analyzer.ANALYZE_ERROR_CODES.INVALID_HAND
          ? VALIDATION_CODES.INVALID_HAND
          : VALIDATION_CODES.INVALID_SELECTION);
      return failure(code, pattern.reason, pattern);
    }

    if (Array.isArray(handCards) && !isSelectionSubsetOfHand(selectedCards, handCards)) {
      return failure(VALIDATION_CODES.CARD_NOT_IN_HAND, '所选牌不全在当前玩家的手牌中。', pattern);
    }

    const targetPattern = resolveTargetPattern(previousPlay);
    if (previousPlay && (!targetPattern || !targetPattern.valid)) {
      return failure(VALIDATION_CODES.INVALID_TARGET, '上一手牌状态无效，无法比较。', pattern, targetPattern);
    }

    if (targetPattern && !comparator.canBeat(pattern, targetPattern)) {
      const sameOrdinaryType = pattern.type === targetPattern.type
        && pattern.type !== analyzer.HAND_TYPES.BOMB
        && pattern.type !== analyzer.HAND_TYPES.ROCKET;
      const reason = sameOrdinaryType && pattern.cardCount !== targetPattern.cardCount
        ? `${pattern.name}必须与上一手牌张数相同。`
        : `${pattern.name}无法压过上一手的${targetPattern.name}。`;
      return failure(VALIDATION_CODES.CANNOT_BEAT, reason, pattern, targetPattern);
    }

    return success(pattern, targetPattern);
  }

  return Object.freeze({
    RULE_VARIANT,
    VALIDATION_CODES,
    isSelectionSubsetOfHand,
    validateSelection,
    validatePlay: validateSelection
  });
}));
