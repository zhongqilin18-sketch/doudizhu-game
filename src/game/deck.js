(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  function shuffle(cards, random) {
    const rng = typeof random === 'function' ? random : Math.random;
    const result = [...cards];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function deal(random) {
    const deck = shuffle(DDZ.Cards.createDeck(), random);
    const hands = [[], [], []];
    for (let index = 0; index < 51; index += 1) {
      hands[index % 3].push(deck[index]);
    }
    return Object.freeze({
      hands: hands.map((hand) => DDZ.Cards.sortCards(hand)),
      bottomCards: Object.freeze(deck.slice(51)),
      deck: Object.freeze(deck)
    });
  }

  DDZ.Deck = Object.freeze({ shuffle, deal });
})(globalThis);
