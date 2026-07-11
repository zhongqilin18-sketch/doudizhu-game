(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  function decideBid(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return 0;
    return DDZ.AIStrategies.chooseBid(player.hand, state.highestBid, state.difficulty);
  }

  function decideMove(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return null;
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    return DDZ.AIStrategies.chooseMove(
      player.hand,
      previousPattern,
      { playerIndex, players: state.players, lastPlay: state.lastPlay },
      state.difficulty
    );
  }

  function hint(state, playerIndex) {
    const player = state.players[playerIndex];
    if (!player) return null;
    const previousPattern = state.lastPlay ? state.lastPlay.pattern : null;
    return DDZ.AIStrategies.chooseMove(
      player.hand,
      previousPattern,
      { playerIndex, players: state.players, lastPlay: state.lastPlay },
      'hard'
    );
  }

  DDZ.AIPlayer = Object.freeze({
    decideBid,
    decideMove,
    hint,
    listLegalMoves(hand, previousPattern) {
      return DDZ.AIStrategies.generateLegalMoves(hand, previousPattern || null);
    }
  });
})(globalThis);
