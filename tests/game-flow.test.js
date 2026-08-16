'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.DDZ = {};
require('../src/game/cards.js');
require('../src/game/deck.js');
require('../src/game/hand-analyzer.js');
require('../src/game/hand-comparator.js');
require('../src/game/rules.js');
require('../src/ai/strategies.js');
require('../src/ai/ai-player.js');
require('../src/game/game-state.js');

const { DDZ } = globalThis;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1103515245 + 12345) >>> 0;
    return value / 0x100000000;
  };
}

function assertUnchanged(game, action) {
  const before = game.getSnapshot();
  const result = action();
  assert.equal(result.ok, false);
  assert.deepEqual(game.getSnapshot(), before);
  return result;
}

function startPlaying(seed, landlordIndex) {
  const game = new DDZ.GameState({ random: seededRandom(seed), difficulty: 'normal' });
  game.startRound({ bidStarter: landlordIndex });
  const result = game.placeBid(landlordIndex, 3);
  assert.equal(result.ok, true);
  assert.equal(game.state.phase, 'doubling');
  game.chooseMultiplier(0, 1);
  game.chooseMultiplier(1, 1);
  game.chooseMultiplier(2, 1);
  assert.equal(game.beginPlaying().ok, true);
  return game;
}

test('发牌生成 54 张唯一牌、三家各 17 张并保留 3 张底牌', () => {
  const game = new DDZ.GameState({ random: seededRandom(7) });
  game.startRound({ bidStarter: 0 });
  assert.deepEqual(game.state.players.map((player) => player.hand.length), [17, 17, 17]);
  assert.equal(game.state.bottomCards.length, 3);
  const all = [...game.state.players.flatMap((player) => player.hand), ...game.state.bottomCards];
  assert.equal(all.length, 54);
  assert.equal(new Set(all.map((card) => card.id)).size, 54);
});

test('3 分立即产生地主，皇冠揭晓阶段后地主获得底牌并先出', () => {
  const game = new DDZ.GameState({ random: seededRandom(8) });
  game.startRound({ bidStarter: 1 });
  const bottomIds = game.state.bottomCards.map((card) => card.id);
  const result = game.placeBid(1, 3);
  assert.equal(result.ok, true);
  assert.equal(game.state.phase, 'doubling');
  assert.equal(game.state.landlordIndex, 1);
  assert.equal(game.state.currentPlayer, null);
  assert.equal(game.state.players[1].hand.length, 20);
  assert.ok(bottomIds.every((id) => game.state.players[1].hand.some((card) => card.id === id)));
  assert.equal(game.state.players.filter((player) => player.role === 'landlord').length, 1);
  assert.equal(game.chooseMultiplier(0, 2).ok, true);
  assert.equal(game.chooseMultiplier(1, 1).ok, true);
  const doubling = game.chooseMultiplier(2, 3);
  assert.equal(doubling.completed, true);
  assert.equal(game.state.phase, 'landlordReveal');
  assert.equal(game.state.currentPlayer, 1);
  assert.deepEqual(game.state.players.map((player) => player.multiplier), [2, 1, 3]);
  assert.deepEqual(game.state.players.map((player) => player.lastAction), ['加倍', '不加倍', '超级加倍']);
  assert.equal(game.beginPlaying().ok, true);
  assert.equal(game.state.phase, 'playing');
});

test('三人按逆时针叫分结束后最高叫分者成为地主', () => {
  const game = new DDZ.GameState({ random: seededRandom(9) });
  game.startRound({ bidStarter: 0 });
  assert.equal(game.placeBid(0, 1).ok, true);
  assert.equal(game.state.currentPlayer, 2);
  assert.equal(game.placeBid(2, 0).ok, true);
  assert.equal(game.state.currentPlayer, 1);
  assert.equal(game.placeBid(1, 2).ok, true);
  assert.equal(game.state.phase, 'doubling');
  assert.equal(game.state.landlordIndex, 1);
  assert.equal(game.state.highestBid, 2);
});

test('三家都不叫会原子地重新洗牌发牌', () => {
  const game = new DDZ.GameState({ random: seededRandom(10) });
  game.startRound({ bidStarter: 0 });
  const previousRound = game.state.roundId;
  const oldIds = game.state.players[0].hand.map((card) => card.id).join('|');
  game.placeBid(0, 0);
  game.placeBid(2, 0);
  const result = game.placeBid(1, 0);
  assert.equal(result.ok, true);
  assert.equal(result.redealt, true);
  assert.equal(game.state.roundId, previousRound + 1);
  assert.equal(game.state.phase, 'bidding');
  assert.equal(game.state.bidCount, 0);
  assert.equal(game.state.highestBid, 0);
  assert.equal(game.state.lastPlay, null);
  assert.notEqual(game.state.players[0].hand.map((card) => card.id).join('|'), oldIds);
  const all = [...game.state.players.flatMap((player) => player.hand), ...game.state.bottomCards];
  assert.equal(new Set(all.map((card) => card.id)).size, 54);
});

test('叫分不得平叫、降叫、重复叫或由非当前玩家操作', () => {
  const game = new DDZ.GameState({ random: seededRandom(11) });
  game.startRound({ bidStarter: 0 });
  assertUnchanged(game, () => game.placeBid(1, 1));
  assert.equal(game.placeBid(0, 2).ok, true);
  assertUnchanged(game, () => game.placeBid(2, 2));
  assertUnchanged(game, () => game.placeBid(2, 1));
  assert.equal(game.placeBid(2, 0).ok, true);
  assertUnchanged(game, () => game.placeBid(2, 3));
});

test('非当前玩家、重复 ID、手牌外卡和非法牌型都不改变状态', () => {
  const game = startPlaying(12, 0);
  const leader = game.state.players[0];
  const first = leader.hand[0];
  assertUnchanged(game, () => game.playCards(1, [game.state.players[1].hand[0].id]));
  assertUnchanged(game, () => game.playCards(0, [first.id, first.id]));
  assertUnchanged(game, () => game.playCards(0, ['not-a-real-card']));
  const distinct = leader.hand.find((card) => card.rank !== first.rank);
  assert.ok(distinct);
  assertUnchanged(game, () => game.playCards(0, [first.id, distinct.id]));
});

test('压不过上一手时不改变状态', () => {
  const game = startPlaying(13, 0);
  const highest = [...game.state.players[0].hand].sort((a, b) => b.rank - a.rank)[0];
  assert.equal(game.playCards(0, [highest.id]).ok, true);
  assert.equal(game.state.currentPlayer, 2);
  const follower = game.state.players[2];
  const lowest = [...follower.hand].sort((a, b) => a.rank - b.rank)[0];
  const result = assertUnchanged(game, () => game.playCards(2, [lowest.id]));
  assert.equal(result.code, 'CANNOT_BEAT');
});

test('首家不能不出；连续两家不出后上一成功者重新自由出牌', () => {
  const game = startPlaying(14, 0);
  assertUnchanged(game, () => game.passTurn(0));
  const card = [...game.state.players[0].hand].sort((a, b) => a.rank - b.rank)[0];
  assert.equal(game.playCards(0, [card.id]).ok, true);
  assert.equal(game.state.currentPlayer, 2);
  assert.equal(game.passTurn(2).ok, true);
  assert.equal(game.state.passCount, 1);
  assert.ok(game.state.lastPlay);
  assert.equal(game.passTurn(1).ok, true);
  assert.equal(game.state.passCount, 0);
  assert.equal(game.state.lastPlay, null);
  assert.equal(game.state.currentPlayer, 0);
});

test('第二位玩家出牌会把已有 passCount 重置为 0', () => {
  const game = startPlaying(15, 0);
  const lead = [...game.state.players[0].hand].sort((a, b) => a.rank - b.rank)[0];
  game.playCards(0, [lead.id]);
  game.passTurn(2);
  const follower = game.state.players[1].hand
    .filter((card) => card.rank > lead.rank)
    .sort((a, b) => a.rank - b.rank)[0];
  if (!follower) {
    game.passTurn(1);
    assert.equal(game.state.passCount, 0);
    return;
  }
  assert.equal(game.playCards(1, [follower.id]).ok, true);
  assert.equal(game.state.passCount, 0);
  assert.equal(game.state.lastPlay.playerIndex, 1);
});

test('出完最后一张立即结束，结束后任何动作均被拒绝且状态不变', () => {
  const game = startPlaying(16, 0);
  const winningCard = game.state.players[0].hand[0];
  game.state.players[0].hand = [winningCard];
  const result = game.playCards(0, [winningCard.id]);
  assert.equal(result.ok, true);
  assert.equal(result.finished, true);
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.winner, 0);
  assert.equal(game.state.players[0].hand.length, 0);
  assertUnchanged(game, () => game.passTurn(0));
  assertUnchanged(game, () => game.playCards(0, [winningCard.id]));
});

test('合法出牌过程中牌 ID 守恒且引擎不变量成立', () => {
  const game = startPlaying(17, 2);
  for (let step = 0; step < 30 && game.state.phase === 'playing'; step += 1) {
    const index = game.state.currentPlayer;
    const move = DDZ.AIPlayer.decideMove(game.state, index);
    const result = move
      ? game.playCards(index, move.cards.map((card) => card.id))
      : game.passTurn(index);
    assert.equal(result.ok, true);
    assert.equal(game.validateInvariants().ok, true, game.validateInvariants().errors.join('; '));
    const remaining = game.state.players.flatMap((player) => player.hand);
    const played = game.state.playHistory.filter((entry) => entry.cards).flatMap((entry) => entry.cards);
    const ids = [...remaining, ...played].map((card) => card.id);
    assert.equal(ids.length, 54);
    assert.equal(new Set(ids).size, 54);
  }
});

test('固定玩家名称、初始麒麟币与逆时针座次保持正确', () => {
  const game = new DDZ.GameState({ random: seededRandom(18), balances: [10000, 8200, 6400] });
  assert.deepEqual(game.state.players.map((player) => player.name), ['麒麟', '掘开', '旭旭宝宝']);
  assert.deepEqual(game.getBalances(), [10000, 8200, 6400]);
  game.startRound({ bidStarter: 0 });
  assert.equal(game.placeBid(0, 1).ok, true);
  assert.equal(game.state.currentPlayer, 2);
  assert.equal(game.placeBid(2, 0).ok, true);
  assert.equal(game.state.currentPlayer, 1);
  game.returnToMenu();
  assert.deepEqual(game.getBalances(), [10000, 8200, 6400]);
});

test('任一玩家麒麟币不大于 0 时不能开始新一局且状态不变', () => {
  const game = new DDZ.GameState({ balances: [10000, 0, 10000] });
  const result = assertUnchanged(game, () => game.startRound({ bidStarter: 0 }));
  assert.equal(result.code, 'INSUFFICIENT_COINS');
});

test('每位玩家的出牌区保持到本人下一回合开始才清空', () => {
  const game = startPlaying(19, 0);
  const lead = [...game.state.players[0].hand].sort((a, b) => a.rank - b.rank)[0];
  assert.equal(game.playCards(0, [lead.id]).ok, true);
  assert.deepEqual(game.state.players[0].playedCards.map((card) => card.id), [lead.id]);
  assert.equal(game.state.players[0].successfulPlays, 1);
  assert.equal(game.passTurn(2).ok, true);
  assert.equal(game.state.players[0].playedCards.length, 1);
  assert.equal(game.passTurn(1).ok, true);
  assert.equal(game.state.currentPlayer, 0);
  assert.equal(game.state.players[0].playedCards.length, 0);
  assert.equal(game.state.players[0].lastAction, null);
});
