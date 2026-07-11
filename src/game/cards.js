(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  const SUITS = Object.freeze([
    Object.freeze({ key: 'spades', symbol: '♠', name: '黑桃', color: 'black', order: 4 }),
    Object.freeze({ key: 'hearts', symbol: '♥', name: '红桃', color: 'red', order: 3 }),
    Object.freeze({ key: 'clubs', symbol: '♣', name: '梅花', color: 'black', order: 2 }),
    Object.freeze({ key: 'diamonds', symbol: '♦', name: '方块', color: 'red', order: 1 })
  ]);

  const RANK_LABELS = Object.freeze({
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王'
  });

  function createCard(suit, rank) {
    const isJoker = suit === 'joker';
    const suitInfo = isJoker ? null : SUITS.find((item) => item.key === suit);
    const label = RANK_LABELS[rank];
    const id = isJoker ? (rank === 16 ? 'joker-small' : 'joker-big') : `${suit}-${rank}`;
    return Object.freeze({
      id,
      suit,
      rank,
      label,
      symbol: isJoker ? '★' : suitInfo.symbol,
      suitName: isJoker ? '王' : suitInfo.name,
      color: isJoker ? (rank === 16 ? 'black' : 'red') : suitInfo.color,
      suitOrder: isJoker ? 5 : suitInfo.order,
      displayName: isJoker ? label : `${suitInfo.name}${label}`
    });
  }

  function createDeck() {
    const cards = [];
    for (const suit of SUITS) {
      for (let rank = 3; rank <= 15; rank += 1) {
        cards.push(createCard(suit.key, rank));
      }
    }
    cards.push(createCard('joker', 16), createCard('joker', 17));
    return cards;
  }

  function sortCards(cards, mode) {
    const sortMode = mode || 'rank';
    return [...cards].sort((a, b) => {
      if (sortMode === 'suit') {
        if (a.suitOrder !== b.suitOrder) return b.suitOrder - a.suitOrder;
        return b.rank - a.rank;
      }
      if (a.rank !== b.rank) return b.rank - a.rank;
      return b.suitOrder - a.suitOrder;
    });
  }

  function getCardById(cards, id) {
    return cards.find((card) => card.id === id) || null;
  }

  function hasUniqueCardIds(cards) {
    return new Set(cards.map((card) => card.id)).size === cards.length;
  }

  function cardSignature(cards) {
    return sortCards(cards).map((card) => card.id).join('|');
  }

  function rankLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
  }

  DDZ.Cards = Object.freeze({
    SUITS,
    RANK_LABELS,
    createCard,
    createDeck,
    sortCards,
    getCardById,
    hasUniqueCardIds,
    cardSignature,
    rankLabel
  });
})(globalThis);
