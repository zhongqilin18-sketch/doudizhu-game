(function attachCardCounter(root, factory) {
  'use strict';

  const api = factory();
  if (root) {
    root.DDZ = root.DDZ || {};
    root.DDZ.CardCounter = api;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCardCounter() {
  'use strict';

  const RANK_ORDER = Object.freeze([
    3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17
  ]);

  const RANK_LABELS = Object.freeze({
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: 'J',
    12: 'Q',
    13: 'K',
    14: 'A',
    15: '2',
    16: '小王',
    17: '大王'
  });

  const FULL_DECK_COUNTS = Object.freeze(RANK_ORDER.reduce((counts, rank) => {
    counts[rank] = rank >= 16 ? 1 : 4;
    return counts;
  }, {}));

  function cardRank(card) {
    if (!card) return null;
    const rank = Number(card.rank);
    return Number.isInteger(rank) && rank >= 3 && rank <= 17 ? rank : null;
  }

  function subtractCards(counts, cards) {
    if (!Array.isArray(cards)) return;
    cards.forEach((card) => {
      const rank = cardRank(card);
      if (rank !== null) counts[rank] -= 1;
    });
  }

  /**
   * 计算真人看不到、且仍未打出的牌。
   *
   * 经典记牌器口径：完整牌组 - 真人当前手牌 - 所有成功出牌记录。
   * 不出记录没有 cards 字段，因此不会错误扣牌。
   */
  function calculate(state, humanIndex) {
    const playerIndex = Number.isInteger(humanIndex) ? humanIndex : 0;
    const counts = { ...FULL_DECK_COUNTS };
    const players = state && Array.isArray(state.players) ? state.players : [];
    const human = players[playerIndex];

    subtractCards(counts, human && human.hand);

    const history = state && Array.isArray(state.playHistory) ? state.playHistory : [];
    history.forEach((entry) => {
      if (entry && entry.pass !== true) subtractCards(counts, entry.cards);
    });

    return Object.freeze(RANK_ORDER.map((rank) => Object.freeze({
      rank,
      label: RANK_LABELS[rank],
      count: Math.max(0, counts[rank])
    })));
  }

  function total(result) {
    if (!Array.isArray(result)) return 0;
    return result.reduce((sum, entry) => {
      const count = entry && Number.isFinite(entry.count) ? entry.count : 0;
      return sum + Math.max(0, count);
    }, 0);
  }

  return Object.freeze({
    RANK_ORDER,
    RANK_LABELS,
    FULL_DECK_COUNTS,
    calculate,
    total
  });
}));
