(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  const TYPE_ORDER = Object.freeze({
    straight: 1,
    pairStraight: 2,
    plane: 3,
    planeSingle: 4,
    planePair: 5,
    triplePair: 6,
    tripleSingle: 7,
    pair: 8,
    triple: 9,
    single: 10,
    fourTwoPairs: 11,
    fourTwoSingles: 12,
    bomb: 30,
    rocket: 40
  });

  const LEVELS = Object.freeze({
    easy: Object.freeze({ structureWeight: 0.15, cardWeight: 0.55, bombPenalty: 70, partnerAware: false, threatAware: false }),
    normal: Object.freeze({ structureWeight: 1.1, cardWeight: 1.05, bombPenalty: 110, partnerAware: true, threatAware: true }),
    hard: Object.freeze({ structureWeight: 1.8, cardWeight: 1.45, bombPenalty: 145, partnerAware: true, threatAware: true })
  });

  function groupByRank(cards) {
    const groups = new Map();
    for (const card of DDZ.Cards.sortCards(cards).reverse()) {
      if (!groups.has(card.rank)) groups.set(card.rank, []);
      groups.get(card.rank).push(card);
    }
    return groups;
  }

  function combinations(items, size, limit) {
    const output = [];
    const cap = limit || 1000;
    function walk(start, current) {
      if (output.length >= cap) return;
      if (current.length === size) {
        output.push([...current]);
        return;
      }
      for (let index = start; index <= items.length - (size - current.length); index += 1) {
        current.push(items[index]);
        walk(index + 1, current);
        current.pop();
      }
    }
    if (size === 0) return [[]];
    if (size <= items.length) walk(0, []);
    return output;
  }

  function consecutiveWindows(ranks, minimumLength) {
    const sorted = [...ranks].sort((a, b) => a - b);
    const runs = [];
    let run = [];
    for (const rank of sorted) {
      if (!run.length || rank === run[run.length - 1] + 1) run.push(rank);
      else {
        if (run.length >= minimumLength) runs.push(run);
        run = [rank];
      }
    }
    if (run.length >= minimumLength) runs.push(run);

    const windows = [];
    for (const sequence of runs) {
      for (let length = minimumLength; length <= sequence.length; length += 1) {
        for (let start = 0; start <= sequence.length - length; start += 1) {
          windows.push(sequence.slice(start, start + length));
        }
      }
    }
    return windows;
  }

  function generateLegalMoves(hand, previousPattern) {
    const groups = groupByRank(hand);
    const ranks = [...groups.keys()].sort((a, b) => a - b);
    const moves = [];
    const seen = new Set();

    function add(cards) {
      if (!cards || !cards.length) return;
      const sorted = DDZ.Cards.sortCards(cards);
      const signature = DDZ.Cards.cardSignature(sorted);
      if (seen.has(signature)) return;
      const pattern = DDZ.HandAnalyzer.analyzeHand(sorted);
      if (!pattern.valid) return;
      if (previousPattern && !DDZ.HandComparator.canBeat(pattern, previousPattern)) return;
      seen.add(signature);
      moves.push(Object.freeze({ cards: Object.freeze(sorted), pattern, signature }));
    }

    for (const rank of ranks) {
      const bucket = groups.get(rank);
      add(bucket.slice(0, 1));
      if (bucket.length >= 2) add(bucket.slice(0, 2));
      if (bucket.length >= 3) add(bucket.slice(0, 3));
      if (bucket.length === 4) add(bucket.slice(0, 4));
    }

    if (groups.has(16) && groups.has(17)) add([groups.get(16)[0], groups.get(17)[0]]);

    for (const tripleRank of ranks.filter((rank) => groups.get(rank).length >= 3)) {
      const body = groups.get(tripleRank).slice(0, 3);
      for (const wingRank of ranks.filter((rank) => rank !== tripleRank)) {
        add([...body, groups.get(wingRank)[0]]);
        if (groups.get(wingRank).length >= 2) add([...body, ...groups.get(wingRank).slice(0, 2)]);
      }
    }

    const straightRanks = ranks.filter((rank) => rank <= 14 && groups.get(rank).length >= 1);
    for (const window of consecutiveWindows(straightRanks, 5)) {
      add(window.map((rank) => groups.get(rank)[0]));
    }

    const pairRanks = ranks.filter((rank) => rank <= 14 && groups.get(rank).length >= 2);
    for (const window of consecutiveWindows(pairRanks, 3)) {
      add(window.flatMap((rank) => groups.get(rank).slice(0, 2)));
    }

    const tripleRanks = ranks.filter((rank) => rank <= 14 && groups.get(rank).length >= 3);
    for (const bodyRanks of consecutiveWindows(tripleRanks, 2)) {
      const body = bodyRanks.flatMap((rank) => groups.get(rank).slice(0, 3));
      add(body);
      const singleWingRanks = ranks.filter((rank) => !bodyRanks.includes(rank) && groups.get(rank).length >= 1);
      for (const wings of combinations(singleWingRanks, bodyRanks.length, 600)) {
        add([...body, ...wings.map((rank) => groups.get(rank)[0])]);
      }
      const pairWingRanks = ranks.filter((rank) => !bodyRanks.includes(rank) && groups.get(rank).length >= 2);
      for (const wings of combinations(pairWingRanks, bodyRanks.length, 300)) {
        add([...body, ...wings.flatMap((rank) => groups.get(rank).slice(0, 2))]);
      }
    }

    for (const bombRank of ranks.filter((rank) => groups.get(rank).length === 4)) {
      const body = groups.get(bombRank);
      const otherRanks = ranks.filter((rank) => rank !== bombRank);
      for (const rank of otherRanks.filter((item) => groups.get(item).length >= 2)) {
        add([...body, ...groups.get(rank).slice(0, 2)]);
      }
      for (const wings of combinations(otherRanks, 2, 300)) {
        add([...body, groups.get(wings[0])[0], groups.get(wings[1])[0]]);
      }
      const pairAttachments = otherRanks.filter((rank) => groups.get(rank).length >= 2);
      for (const wings of combinations(pairAttachments, 2, 200)) {
        add([...body, ...wings.flatMap((rank) => groups.get(rank).slice(0, 2))]);
      }
    }

    return moves.sort((a, b) => {
      const typeDifference = (TYPE_ORDER[a.pattern.type] || 20) - (TYPE_ORDER[b.pattern.type] || 20);
      if (typeDifference) return typeDifference;
      if (a.pattern.cardCount !== b.pattern.cardCount) return b.pattern.cardCount - a.pattern.cardCount;
      if (a.pattern.mainRank !== b.pattern.mainRank) return a.pattern.mainRank - b.pattern.mainRank;
      return a.signature.localeCompare(b.signature);
    });
  }

  function removeCards(hand, move) {
    const ids = new Set(move.cards.map((card) => card.id));
    return hand.filter((card) => !ids.has(card.id));
  }

  function structureCost(cards) {
    if (!cards.length) return 0;
    const groups = groupByRank(cards);
    let cost = 0;
    for (const bucket of groups.values()) {
      if (bucket.length === 1) cost += 2.2;
      else if (bucket.length === 2) cost += 1.25;
      else if (bucket.length === 3) cost += 0.7;
      else if (bucket.length === 4) cost -= 2.5;
    }
    if (groups.has(16) && groups.has(17)) cost -= 4;
    const usable = [...groups.keys()].filter((rank) => rank <= 14).sort((a, b) => a - b);
    for (const run of consecutiveWindows(usable, 5)) cost -= Math.min(2.4, run.length * 0.22);
    return cost;
  }

  function breaksPremiumGroup(hand, move) {
    const before = groupByRank(hand);
    const used = groupByRank(move.cards);
    let penalty = 0;
    for (const [rank, cards] of used.entries()) {
      const original = before.get(rank).length;
      if (original === 4 && cards.length < 4) penalty += 16;
      if ((rank === 16 || rank === 17) && before.has(16) && before.has(17) && move.pattern.type !== 'rocket') penalty += 12;
    }
    return penalty;
  }

  function isOpponentThreat(context) {
    if (!context || !context.players) return false;
    const self = context.players[context.playerIndex];
    if (!self || self.role !== 'farmer') return false;
    const landlord = context.players.find((player) => player.role === 'landlord');
    return Boolean(landlord && landlord.hand.length <= 2);
  }

  function shouldYieldToPartner(context, moves, level) {
    if (!level.partnerAware || !context || !context.lastPlay || !context.players) return false;
    const previous = context.players[context.lastPlay.playerIndex];
    const self = context.players[context.playerIndex];
    if (!previous || !self || previous.role !== self.role || previous.hand.length > (context.difficulty === 'hard' ? 3 : 2)) return false;
    return !moves.some((move) => move.cards.length === self.hand.length);
  }

  function chooseMove(hand, previousPattern, context, difficulty) {
    const mode = LEVELS[difficulty] ? difficulty : 'normal';
    const level = LEVELS[mode];
    const moves = generateLegalMoves(hand, previousPattern);
    if (!moves.length) return null;
    const moveContext = { ...(context || {}), difficulty: mode };
    if (previousPattern && shouldYieldToPartner(moveContext, moves, level) && !isOpponentThreat(moveContext)) return null;

    const threatened = level.threatAware && isOpponentThreat(moveContext);
    const beforeCost = structureCost(hand);
    const scored = moves.map((move) => {
      const remaining = removeCards(hand, move);
      if (remaining.length === 0) return { move, score: -100000 };
      let score = 0;
      score += move.pattern.mainRank * (previousPattern ? 0.62 : 0.22);
      score -= move.cards.length * level.cardWeight;
      score += (structureCost(remaining) - beforeCost) * level.structureWeight;
      score += breaksPremiumGroup(hand, move) * level.structureWeight;
      if (move.pattern.type === 'bomb' || move.pattern.type === 'rocket') {
        score += threatened ? level.bombPenalty * 0.16 : level.bombPenalty;
      }
      if (previousPattern && move.pattern.type === previousPattern.type) score -= 8;
      if (threatened && move.pattern.mainRank >= 15) score -= 7;
      if (!previousPattern && ['straight', 'pairStraight', 'plane', 'planeSingle', 'planePair'].includes(move.pattern.type)) score -= 10;
      score += (TYPE_ORDER[move.pattern.type] || 20) * 0.01;
      return { move, score };
    });

    scored.sort((a, b) => a.score - b.score || a.move.signature.localeCompare(b.move.signature));
    return scored[0].move;
  }

  function evaluateBid(hand, difficulty) {
    const groups = groupByRank(hand);
    let quality = 0;
    quality += (groups.get(17) || []).length * 4.2;
    quality += (groups.get(16) || []).length * 3.2;
    quality += (groups.get(15) || []).length * 1.45;
    quality += (groups.get(14) || []).length * 0.65;
    for (const bucket of groups.values()) {
      if (bucket.length === 4) quality += 4.8;
      else if (bucket.length === 3) quality += 0.55;
    }
    if (groups.has(16) && groups.has(17)) quality += 2.6;
    const sequenceRanks = [...groups.keys()].filter((rank) => rank <= 14);
    const longestSequence = consecutiveWindows(sequenceRanks, 5).reduce((max, item) => Math.max(max, item.length), 0);
    quality += Math.max(0, longestSequence - 4) * 0.35;
    const adjustment = difficulty === 'hard' ? 0.4 : difficulty === 'easy' ? -0.35 : 0;
    quality += adjustment;
    if (quality >= 12.5) return 3;
    if (quality >= 8.6) return 2;
    if (quality >= 5.2) return 1;
    return 0;
  }

  function chooseBid(hand, highestBid, difficulty) {
    const desired = evaluateBid(hand, difficulty);
    return desired > highestBid ? desired : 0;
  }

  DDZ.AIStrategies = Object.freeze({
    TYPE_ORDER,
    LEVELS,
    groupByRank,
    combinations,
    consecutiveWindows,
    generateLegalMoves,
    chooseMove,
    evaluateBid,
    chooseBid,
    structureCost
  });
})(globalThis);
