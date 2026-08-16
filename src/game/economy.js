(function attachEconomy(root, factory) {
  'use strict';

  const api = factory();

  if (root) {
    root.DDZ = root.DDZ || {};
    root.DDZ.Economy = api;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createEconomy() {
  'use strict';

  const PLAYER_COUNT = 3;
  const INITIAL_BALANCE = 10000;
  const BASE_STAKE = 100;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function assertSafeInteger(value, name, minimum) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}.`);
    }
  }

  function validateBalances(balances) {
    if (!Array.isArray(balances) || balances.length !== PLAYER_COUNT) {
      throw new TypeError(`balances must contain exactly ${PLAYER_COUNT} player balances.`);
    }
    balances.forEach((balance, index) => {
      if (!Number.isSafeInteger(balance)) {
        throw new TypeError(`balances[${index}] must be a safe integer.`);
      }
    });
  }

  function validatePlayerIndex(index, name) {
    if (!Number.isInteger(index) || index < 0 || index >= PLAYER_COUNT) {
      throw new RangeError(`${name} must be a player index from 0 to ${PLAYER_COUNT - 1}.`);
    }
  }

  function validateSuccessfulPlayCounts(counts) {
    if (!Array.isArray(counts) || counts.length !== PLAYER_COUNT) {
      throw new TypeError(`successfulPlayCounts must contain exactly ${PLAYER_COUNT} counts.`);
    }
    counts.forEach((count, index) => {
      assertSafeInteger(count, `successfulPlayCounts[${index}]`, 0);
    });
  }

  function validatePlayerMultipliers(values) {
    if (!Array.isArray(values) || values.length !== PLAYER_COUNT || values.some((value) => ![1, 2, 3].includes(value))) {
      throw new RangeError('playerMultipliers must contain exactly three values chosen from 1, 2, or 3.');
    }
  }

  function safeMultiply(left, right, label) {
    const product = left * right;
    if (!Number.isSafeInteger(product)) {
      throw new RangeError(`${label} exceeds the safe integer range.`);
    }
    return product;
  }

  function safeAdd(left, right, label) {
    const sum = left + right;
    if (!Number.isSafeInteger(sum)) {
      throw new RangeError(`${label} exceeds the safe integer range.`);
    }
    return sum;
  }

  function createInitialBalances() {
    return Object.freeze(Array(PLAYER_COUNT).fill(INITIAL_BALANCE));
  }

  function isBlocked(balance) {
    if (!Number.isSafeInteger(balance)) {
      throw new TypeError('balance must be a safe integer.');
    }
    return balance <= 0;
  }

  function getEligibility(balances) {
    validateBalances(balances);
    const players = balances.map((balance, playerIndex) => ({
      playerIndex,
      balance,
      blocked: balance <= 0
    }));
    const blockedPlayerIndexes = players
      .filter((player) => player.blocked)
      .map((player) => player.playerIndex);

    return deepFreeze({
      allowed: blockedPlayerIndexes.length === 0,
      blocked: blockedPlayerIndexes.length > 0,
      blockedPlayerIndexes,
      players
    });
  }

  function canStart(balances) {
    return getEligibility(balances).allowed;
  }

  function getMultiplierBreakdown(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('multiplier options are required.');
    }

    const {
      landlordIndex,
      winnerIndex,
      highestBid,
      bombCount = 0,
      successfulPlayCounts
    } = options;

    validatePlayerIndex(landlordIndex, 'landlordIndex');
    validatePlayerIndex(winnerIndex, 'winnerIndex');
    if (![1, 2, 3].includes(highestBid)) {
      throw new RangeError('highestBid must be 1, 2, or 3.');
    }
    assertSafeInteger(bombCount, 'bombCount', 0);
    validateSuccessfulPlayCounts(successfulPlayCounts);

    const landlordWon = winnerIndex === landlordIndex;
    const landlordSuccessfulPlayCount = successfulPlayCounts[landlordIndex];
    const farmerSuccessfulPlayCount = successfulPlayCounts.reduce((total, count, playerIndex) => (
      playerIndex === landlordIndex
        ? total
        : safeAdd(total, count, 'farmer successful play count')
    ), 0);
    const bombMultiplier = 2 ** bombCount;
    if (!Number.isSafeInteger(bombMultiplier)) {
      throw new RangeError('bomb multiplier exceeds the safe integer range.');
    }

    let springType = null;
    if (landlordWon && farmerSuccessfulPlayCount === 0) {
      springType = 'landlord-spring';
    } else if (!landlordWon && landlordSuccessfulPlayCount === 1) {
      springType = 'farmer-spring';
    }

    const springMultiplier = springType ? 2 : 1;
    const bidAndBombMultiplier = safeMultiply(highestBid, bombMultiplier, 'bid and bomb multiplier');
    const totalMultiplier = safeMultiply(
      bidAndBombMultiplier,
      springMultiplier,
      'total multiplier'
    );

    return deepFreeze({
      bid: highestBid,
      bombs: bombMultiplier,
      spring: springMultiplier,
      total: totalMultiplier,
      bombCount,
      springType,
      landlordSuccessfulPlayCount,
      farmerSuccessfulPlayCount
    });
  }

  function settle(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('settlement options are required.');
    }

    const {
      balances,
      landlordIndex,
      winnerIndex,
      highestBid,
      bombCount = 0,
      successfulPlayCounts,
      playerMultipliers = [1, 1, 1],
      baseStake = BASE_STAKE
    } = options;

    validateBalances(balances);
    assertSafeInteger(baseStake, 'baseStake', 1);
    validatePlayerMultipliers(playerMultipliers);

    const multipliers = getMultiplierBreakdown({
      landlordIndex,
      winnerIndex,
      highestBid,
      bombCount,
      successfulPlayCounts
    });
    const landlordWon = winnerIndex === landlordIndex;
    const unit = safeMultiply(baseStake, multipliers.total, 'single-farmer settlement before player doubling');
    const landlordMultiplier = playerMultipliers[landlordIndex];
    const unitsByPlayer = Array(PLAYER_COUNT).fill(0);
    for (let playerIndex = 0; playerIndex < PLAYER_COUNT; playerIndex += 1) {
      if (playerIndex === landlordIndex) continue;
      unitsByPlayer[playerIndex] = safeMultiply(
        safeMultiply(unit, landlordMultiplier, 'landlord doubling'),
        playerMultipliers[playerIndex],
        `farmer ${playerIndex} doubling`
      );
    }
    const landlordAmount = unitsByPlayer.reduce((total, amount) => safeAdd(total, amount, 'landlord settlement'), 0);
    const deltas = Array(PLAYER_COUNT).fill(0);

    for (let playerIndex = 0; playerIndex < PLAYER_COUNT; playerIndex += 1) {
      if (playerIndex === landlordIndex) {
        deltas[playerIndex] = landlordWon ? landlordAmount : -landlordAmount;
      } else {
        deltas[playerIndex] = landlordWon ? -unitsByPlayer[playerIndex] : unitsByPlayer[playerIndex];
      }
    }

    const previousBalances = balances.slice();
    const endingBalances = previousBalances.map((balance, playerIndex) => (
      safeAdd(balance, deltas[playerIndex], `ending balance for player ${playerIndex}`)
    ));
    const totalBefore = previousBalances.reduce((total, balance) => safeAdd(total, balance, 'starting total'), 0);
    const totalAfter = endingBalances.reduce((total, balance) => safeAdd(total, balance, 'ending total'), 0);
    if (totalBefore !== totalAfter) {
      throw new Error('Settlement invariant failed: total currency must be conserved.');
    }

    const winnerSide = landlordWon ? 'landlord' : 'farmers';
    const players = endingBalances.map((balance, playerIndex) => ({
      playerIndex,
      role: playerIndex === landlordIndex ? 'landlord' : 'farmer',
      won: landlordWon ? playerIndex === landlordIndex : playerIndex !== landlordIndex,
      previousBalance: previousBalances[playerIndex],
      delta: deltas[playerIndex],
      balance,
      blocked: balance <= 0
    }));
    const blockedPlayerIndexes = players
      .filter((player) => player.blocked)
      .map((player) => player.playerIndex);
    const formulaParts = [String(baseStake), String(multipliers.bid)];
    if (multipliers.bombCount > 0) formulaParts.push(String(multipliers.bombs));
    if (multipliers.springType) formulaParts.push(String(multipliers.spring));

    return deepFreeze({
      ok: true,
      winnerSide,
      landlordIndex,
      winnerIndex,
      previousBalances,
      balances: endingBalances,
      deltas,
      unit,
      unitsByPlayer,
      playerMultipliers: playerMultipliers.slice(),
      landlordAmount,
      multipliers,
      springType: multipliers.springType,
      blocked: blockedPlayerIndexes.length > 0,
      blockedPlayerIndexes,
      canContinue: blockedPlayerIndexes.length === 0,
      players,
      breakdown: {
        baseStake,
        highestBid,
        bombCount,
        bombMultiplier: multipliers.bombs,
        springType: multipliers.springType,
        springMultiplier: multipliers.spring,
        totalMultiplier: multipliers.total,
        unit,
        unitsByPlayer: unitsByPlayer.slice(),
        playerMultipliers: playerMultipliers.slice(),
        landlordAmount,
        successfulPlayCounts: successfulPlayCounts.slice(),
        formula: formulaParts.join(' × '),
        totalBefore,
        totalAfter,
        conserved: true
      }
    });
  }

  return deepFreeze({
    PLAYER_COUNT,
    INITIAL_BALANCE,
    BASE_STAKE,
    createInitialBalances,
    isBlocked,
    getEligibility,
    canStart,
    canStartRound: canStart,
    getMultiplierBreakdown,
    settle,
    settleRound: settle,
    calculateSettlement: settle
  });
}));
