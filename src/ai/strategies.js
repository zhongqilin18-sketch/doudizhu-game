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
    easy: Object.freeze({
      structureWeight: 0.55,
      cardWeight: 0.75,
      turnWeight: 8,
      bombPenalty: 82,
      partnerAware: false,
      threatAware: true
    }),
    normal: Object.freeze({
      structureWeight: 1.35,
      cardWeight: 1.2,
      turnWeight: 18,
      bombPenalty: 126,
      partnerAware: true,
      threatAware: true
    }),
    hard: Object.freeze({
      structureWeight: 2,
      cardWeight: 1.6,
      turnWeight: 28,
      bombPenalty: 158,
      partnerAware: true,
      threatAware: true
    })
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
    // 默认不截断：20 张手牌下飞机带单/带对的组合数最多约 C(13,5)=1287，
    // 全部枚举既正确也足够快。仅在显式传入正数上限时才截断。
    const cap = Number.isFinite(limit) && limit > 0 ? limit : Infinity;
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
      for (const wings of combinations(singleWingRanks, bodyRanks.length)) {
        add([...body, ...wings.map((rank) => groups.get(rank)[0])]);
      }
      const pairWingRanks = ranks.filter((rank) => !bodyRanks.includes(rank) && groups.get(rank).length >= 2);
      for (const wings of combinations(pairWingRanks, bodyRanks.length)) {
        add([...body, ...wings.flatMap((rank) => groups.get(rank).slice(0, 2))]);
      }
    }

    for (const bombRank of ranks.filter((rank) => groups.get(rank).length === 4)) {
      const body = groups.get(bombRank);
      const otherRanks = ranks.filter((rank) => rank !== bombRank);
      for (const rank of otherRanks.filter((item) => groups.get(item).length >= 2)) {
        add([...body, ...groups.get(rank).slice(0, 2)]);
      }
      for (const wings of combinations(otherRanks, 2)) {
        add([...body, groups.get(wings[0])[0], groups.get(wings[1])[0]]);
      }
      const pairAttachments = otherRanks.filter((rank) => groups.get(rank).length >= 2);
      for (const wings of combinations(pairAttachments, 2)) {
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

  function maximalRuns(ranks, minimumLength) {
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
    return runs;
  }

  // This is deliberately an inexpensive decomposition estimate rather than a
  // game-tree search. It lets the AI compare every legal move while still
  // valuing hands that can be shed as a long straight, pair-straight or plane.
  function summarizeHand(cards) {
    if (!cards.length) {
      return Object.freeze({
        turns: 0,
        looseSingles: 0,
        highSingles: 0,
        chainCards: 0,
        premiumGroups: 0
      });
    }

    const original = groupByRank(cards);
    const counts = new Map([...original.entries()].map(([rank, bucket]) => [rank, bucket.length]));
    let turns = 0;
    let chainCards = 0;
    let premiumGroups = [...counts.values()].filter((count) => count === 4).length;

    if ((counts.get(16) || 0) > 0 && (counts.get(17) || 0) > 0) {
      counts.set(16, counts.get(16) - 1);
      counts.set(17, counts.get(17) - 1);
      turns += 1;
      premiumGroups += 1;
    }

    const planeRuns = maximalRuns(
      [...counts.keys()].filter((rank) => rank <= 14 && (counts.get(rank) || 0) >= 3),
      2
    );
    for (const run of planeRuns) {
      run.forEach((rank) => counts.set(rank, counts.get(rank) - 3));
      turns += 1;
      chainCards += run.length * 3;

      const excluded = new Set(run);
      const singles = [...counts.keys()]
        .filter((rank) => !excluded.has(rank) && counts.get(rank) >= 1)
        .sort((left, right) => counts.get(left) - counts.get(right) || left - right);
      const pairs = [...counts.keys()]
        .filter((rank) => !excluded.has(rank) && counts.get(rank) >= 2)
        .sort((left, right) => counts.get(left) - counts.get(right) || left - right);
      const wings = singles.length >= run.length ? singles : pairs.length >= run.length ? pairs : null;
      if (wings) {
        const wingSize = singles.length >= run.length ? 1 : 2;
        wings.slice(0, run.length).forEach((rank) => counts.set(rank, counts.get(rank) - wingSize));
        chainCards += run.length * wingSize;
      }
    }

    const pairRuns = maximalRuns(
      [...counts.keys()].filter((rank) => rank <= 14 && (counts.get(rank) || 0) >= 2),
      3
    );
    for (const run of pairRuns) {
      run.forEach((rank) => counts.set(rank, counts.get(rank) - 2));
      turns += 1;
      chainCards += run.length * 2;
    }

    const straightRuns = maximalRuns(
      [...counts.keys()].filter((rank) => rank <= 14 && (counts.get(rank) || 0) >= 1),
      5
    );
    for (const run of straightRuns) {
      run.forEach((rank) => counts.set(rank, counts.get(rank) - 1));
      turns += 1;
      chainCards += run.length;
    }

    // A remaining triple can carry one otherwise independent single or pair.
    const tripleRanks = [...counts.keys()].filter((rank) => counts.get(rank) === 3);
    for (const tripleRank of tripleRanks) {
      const attachment = [...counts.keys()].find((rank) => (
        rank !== tripleRank && (counts.get(rank) === 1 || counts.get(rank) === 2)
      ));
      if (attachment !== undefined) counts.set(attachment, 0);
    }

    const leftovers = [...counts.entries()].filter((entry) => entry[1] > 0);
    turns += leftovers.length;
    const looseSingles = leftovers.filter((entry) => entry[1] === 1).length;
    const highSingles = leftovers.filter(([rank, count]) => count === 1 && rank >= 15).length;
    return Object.freeze({ turns, looseSingles, highSingles, chainCards, premiumGroups });
  }

  function structureCost(cards) {
    const shape = summarizeHand(cards);
    return shape.turns * 3
      + shape.looseSingles * 1.25
      + shape.highSingles * 0.45
      - shape.chainCards * 0.22
      - shape.premiumGroups * 1.6;
  }

  function breaksPremiumGroup(hand, move) {
    const before = groupByRank(hand);
    const used = groupByRank(move.cards);
    let penalty = 0;
    for (const [rank, cards] of used.entries()) {
      const original = before.get(rank).length;
      if (original === 4 && cards.length < 4) penalty += 24;
      else if (original === 4 && move.pattern.type !== 'bomb') penalty += 10;
      else if (original === 3 && cards.length < 3) penalty += cards.length === 1 ? 3.5 : 5;
      else if (original === 2 && cards.length === 1) penalty += 2.4;
    }
    if (before.has(16)
      && before.has(17)
      && move.pattern.type !== 'rocket'
      && move.cards.some((card) => card.rank === 16 || card.rank === 17)) penalty += 48;
    return penalty;
  }

  // 带牌牌型的主体点数不能只靠 mainRank 判断：飞机有连续的三张主体，
  // 四带二则是四张主体。把附件单独找出来，才能明确惩罚“用控制牌当翅膀”。
  function attachmentCardsForMove(move) {
    if (!move || !move.pattern || !Array.isArray(move.cards)) return [];
    const { pattern } = move;
    const bodyRanks = new Set();

    if (pattern.type === 'tripleSingle' || pattern.type === 'triplePair') {
      bodyRanks.add(pattern.mainRank);
    } else if (pattern.type === 'planeSingle' || pattern.type === 'planePair') {
      const firstRank = pattern.mainRank - (pattern.chainLength || 1) + 1;
      for (let rank = firstRank; rank <= pattern.mainRank; rank += 1) bodyRanks.add(rank);
    } else if (pattern.type === 'fourTwoSingles' || pattern.type === 'fourTwoPairs') {
      bodyRanks.add(pattern.mainRank);
    } else {
      return [];
    }

    return move.cards.filter((card) => !bodyRanks.has(card.rank));
  }

  function attachmentPenalty(hand, move, remaining) {
    const attachments = attachmentCardsForMove(move);
    if (!attachments.length) return 0;

    const before = groupByRank(hand);
    const used = groupByRank(attachments);
    const isPairWing = ['triplePair', 'planePair', 'fourTwoPairs'].includes(move.pattern.type);
    const endgame = remaining.length <= 2 || summarizeHand(remaining).turns <= 1;
    let penalty = 0;

    for (const [rank, cards] of used.entries()) {
      const originalCount = (before.get(rank) || []).length;
      const usedCount = cards.length;

      // 附件应先使用最小的散单 / 完整小对子。K、A、2 与双王都是
      // 争夺牌权的控制资源，除非这一手能结束或进入极端残局，不应轻易送掉。
      if (rank >= 17) penalty += 220;
      else if (rank === 16) penalty += 190;
      else if (rank === 15) penalty += isPairWing ? 155 : 125;
      else if (rank === 14) penalty += isPairWing ? 88 : 70;
      else if (rank === 13) penalty += isPairWing ? 42 : 34;
      else if (rank === 12) penalty += 12;
      else penalty += Math.max(0, rank - 3) * 2.4;

      // 用一张对子、两张三条或部分炸弹做附件，会把本来可直接走掉的
      // 结构拆散；这比“附件点数稍大”更不划算。
      if (originalCount === 4 && usedCount < 4) penalty += 66;
      else if (originalCount === 3 && usedCount < 3) penalty += isPairWing ? 42 : 31;
      else if (originalCount === 2 && usedCount === 1) penalty += 18;
    }

    if (hasRocket(hand) && attachments.some((card) => card.rank === 16 || card.rank === 17)) {
      penalty += 220;
    }

    // 剩两张以内时，先把手牌压缩到可一轮走完通常比保留控制牌更重要。
    return endgame ? penalty * 0.18 : penalty;
  }

  function prematureHighComboPenalty(move, remaining, previousPattern) {
    if (previousPattern || remaining.length <= 2) return 0;
    if (!['triple', 'tripleSingle', 'triplePair', 'plane', 'planeSingle', 'planePair'].includes(move.pattern.type)) return 0;
    if (summarizeHand(remaining).turns <= 1) return 0;

    // 主动领出三张 A / 2 往往只是替对手清牌。保留高三张，直到能收尾、
    // 对手告急或必须跟牌，通常更接近真人打法。
    if (move.pattern.mainRank >= 15) return 54;
    if (move.pattern.mainRank === 14) return 18;
    return 0;
  }

  function opponentsFor(context) {
    if (!context || !context.players) return [];
    const self = context.players[context.playerIndex];
    if (!self) return [];
    return context.players.filter((player, index) => {
      if (index === context.playerIndex) return false;
      if (!self.role || !player.role) return true;
      return player.role !== self.role;
    });
  }

  function isOpponentThreat(context) {
    // 对手只剩三手以内时，牌权比保留大牌更重要：不能再轻易放走。
    return opponentsFor(context).some((player) => Array.isArray(player.hand) && player.hand.length <= 3);
  }

  function isLandlordEmergency(context) {
    if (!context || !context.players || !context.lastPlay) return false;
    const self = context.players[context.playerIndex];
    const landlordIndex = context.players.findIndex((player) => player.role === 'landlord');
    if (!self || self.role !== 'farmer' || landlordIndex < 0) return false;
    const landlord = context.players[landlordIndex];
    return context.lastPlay.playerIndex === landlordIndex
      && Array.isArray(landlord.hand)
      && landlord.hand.length <= 3;
  }

  function shouldYieldToPartner(context, moves, level) {
    if (!level.partnerAware || !context || !context.lastPlay || !context.players) return false;
    const previous = context.players[context.lastPlay.playerIndex];
    const self = context.players[context.playerIndex];
    // 让牌只用于队友已经接近走完的残局。过去阈值过大，会让农民在
    // 队友还有三、四张牌时也频繁放过地主，导致实际牌局显得消极。
    if (!previous || !self || previous.role !== self.role || previous.hand.length > 2) return false;
    return !moves.some((move) => move.cards.length === self.hand.length);
  }

  function previousPlayer(context) {
    if (!context || !context.lastPlay || !Array.isArray(context.players)) return null;
    return context.players[context.lastPlay.playerIndex] || null;
  }

  function isFarmerPartnerLead(context) {
    if (!context || !context.lastPlay || !Array.isArray(context.players)) return false;
    const self = context.players[context.playerIndex];
    const previous = previousPlayer(context);
    return Boolean(self && previous && self.role === 'farmer' && previous.role === 'farmer');
  }

  function shouldKeepPartnerControl(hand, context, moves) {
    if (!isFarmerPartnerLead(context)) return false;
    // 只有这一手能直接出完时，才允许为了胜利接管农民队友已建立的牌权。
    if (moves.some((move) => removeCards(hand, move).length === 0)) return false;
    const pattern = context.lastPlay && context.lastPlay.pattern;
    if (!pattern) return false;
    if (isPowerMove({ pattern })) return true;
    // 队友用 K、A、2 或小王领住单张/对子时，贸然用更大的控制牌顶掉，
    // 通常只会把出牌权交回地主，因此默认让牌。
    return ['single', 'pair'].includes(pattern.type)
      && pattern.mainRank >= 13
      && pattern.mainRank <= 16;
  }

  function isLandlordUpperSeat(context) {
    if (!context || !Array.isArray(context.players)) return false;
    const self = context.players[context.playerIndex];
    const landlordIndex = context.players.findIndex((player) => player.role === 'landlord');
    if (!self || self.role !== 'farmer' || landlordIndex < 0) return false;
    // 牌局按逆时针 (index + 2) % 3 轮转。当前玩家的下一家若是地主，
    // 则该农民正处在地主上家，适合在手牌允许时给地主施加牌权压力。
    return (context.playerIndex + 2) % 3 === landlordIndex;
  }

  function landlordResponseCountForControl(landlordHand, move) {
    if (!['single', 'pair'].includes(move.pattern.type)) return null;
    const groups = groupByRank(landlordHand);
    let count = 0;
    for (const [rank, cards] of groups.entries()) {
      if (move.pattern.type === 'single' && rank > move.pattern.mainRank) count += 1;
      if (move.pattern.type === 'pair' && rank > move.pattern.mainRank && cards.length >= 2) count += 1;
    }
    // 较小的炸弹仍可压普通牌，双王也始终可压。这里仅需判断是否有应手，
    // 不需要为每个候选再次生成整套组合，保证每回合仍然足够快。
    if ([...groups.values()].some((cards) => cards.length === 4)) count += 1;
    if (groups.has(16) && groups.has(17)) count += 1;
    return count;
  }

  function landlordPressureBonus(context, move, remaining, beforeCost, previousPattern) {
    // 上家堵地主只发生在自己重新领牌时；跟队友或抢跟牌权都会适得其反。
    if (previousPattern || !isLandlordUpperSeat(context)) return 0;
    if (!['single', 'pair'].includes(move.pattern.type) || isPowerMove(move)) return 0;

    const landlord = context.players.find((player) => player.role === 'landlord');
    if (!landlord || !Array.isArray(landlord.hand)) return 0;
    const shape = summarizeHand(remaining);
    const handCanContinue = remaining.length <= 8
      || shape.turns <= 4
      || structureCost(remaining) <= beforeCost + 0.35;
    if (!handCanContinue) return 0;

    const replyCount = landlordResponseCountForControl(landlord.hand, move);
    if (replyCount > 0) {
      // 地主仅有一种应手且即将走完时，稍稍偏向这张牌；不把它当成硬规则。
      if (replyCount === 1 && landlord.hand.length <= 5 && move.pattern.mainRank <= 14) return 3;
      return 0;
    }

    const rank = move.pattern.mainRank;
    let bonus = 0;
    // 选择“刚好压住地主”的中高牌，而非无脑甩 2 或王。
    if (rank >= 8 && rank <= 14) bonus = 18 - Math.max(0, rank - 10) * 2;
    else if (rank >= 15) bonus = 2;
    else bonus = 4;
    if (landlord.hand.length <= 5) bonus *= 1.4;
    if (remaining.length <= 5) bonus += 8;
    return Math.max(0, bonus);
  }

  function previousPlayIsByOpponent(context) {
    const self = context && context.players && context.players[context.playerIndex];
    const previous = previousPlayer(context);
    if (!self || !previous) return false;
    // 角色尚未写入的测试/分析场景按对手处理，保证跟牌策略不会意外弃权。
    return !self.role || !previous.role || self.role !== previous.role;
  }

  function isPowerMove(move) {
    return move && (move.pattern.type === 'bomb' || move.pattern.type === 'rocket');
  }

  function hasRocket(hand) {
    return hand.some((card) => card.rank === 16) && hand.some((card) => card.rank === 17);
  }

  function splitsRocket(hand, move) {
    return hasRocket(hand)
      && move.pattern.type !== 'rocket'
      && move.cards.some((card) => card.rank === 16 || card.rank === 17);
  }

  function lastOwnPlayWonTrick(context) {
    const history = context && Array.isArray(context.playHistory) ? context.playHistory : [];
    if (history.length < 3) return false;
    const recent = history.slice(-3);
    const lead = recent[0];
    return lead
      && lead.playerIndex === context.playerIndex
      && Array.isArray(lead.cards)
      && recent[1] && recent[1].pass === true
      && recent[2] && recent[2].pass === true;
  }

  function lastOwnPlayWasUncontestedSmallJoker(context) {
    if (!lastOwnPlayWonTrick(context)) return false;
    const lead = context.playHistory.slice(-3)[0];
    return lead.cards.length === 1 && lead.cards[0].rank === 16;
  }

  function partnerTailCount(context) {
    if (!context || !context.players) return Infinity;
    const self = context.players[context.playerIndex];
    if (!self || self.role !== 'farmer') return Infinity;
    const partner = context.players.find((player, index) => index !== context.playerIndex && player.role === 'farmer');
    return partner && Array.isArray(partner.hand) ? partner.hand.length : Infinity;
  }

  function opponentTailCount(context) {
    const counts = opponentsFor(context)
      .filter((player) => Array.isArray(player.hand))
      .map((player) => player.hand.length);
    return counts.length ? Math.min(...counts) : Infinity;
  }

  function chooseMove(hand, previousPattern, context, difficulty) {
    const mode = LEVELS[difficulty] ? difficulty : 'normal';
    const level = LEVELS[mode];
    const legalMoves = generateLegalMoves(hand, previousPattern);
    if (!legalMoves.length) return null;
    const moveContext = { ...(context || {}), difficulty: mode };

    // 完全信息残局精确求解：信息完整（真实对局带 passCount/角色）且进入残局时，
    // 若存在必胜动作则直接采用，否则照常走启发式。
    if (DDZ.EndgameSolver) {
      const solved = DDZ.EndgameSolver.solveForContext(moveContext);
      if (solved && !solved.aborted && solved.value > 0) {
        return solved.move;
      }
    }

    const opponentLed = previousPattern && previousPlayIsByOpponent(moveContext);
    const opponentTail = opponentTailCount(moveContext);
    const urgentBlock = Boolean(opponentLed && opponentTail <= 3);
    const powerBlockRequired = Boolean(opponentLed && opponentTail <= 4);
    const farmerPartnerLed = previousPattern && isFarmerPartnerLead(moveContext);
    if (previousPattern && shouldKeepPartnerControl(hand, moveContext, legalMoves)) return null;
    if (previousPattern && shouldYieldToPartner(moveContext, legalMoves, level) && !isOpponentThreat(moveContext)) return null;

    let moves = legalMoves;
    // 农民永不以炸弹/王炸抢农民队友的牌权，除非该手就是自己直接走完。
    if (farmerPartnerLed && !legalMoves.some((move) => removeCards(hand, move).length === 0)) {
      const noPowerReplies = moves.filter((move) => !isPowerMove(move));
      if (!noPowerReplies.length) return null;
      moves = noPowerReplies;
    }
    const emergency = isLandlordEmergency(moveContext);
    if (hasRocket(hand) && moves.length > 1 && !emergency && !urgentBlock) {
      const protectedMoves = moves.filter((move) => {
        if (!splitsRocket(hand, move)) return true;
        return removeCards(hand, move).length === 0;
      });
      if (protectedMoves.length) moves = protectedMoves;
    }

    // 面对对手时优先用同型普通牌争夺牌权；只有没有普通解时才考虑炸弹。
    // 若对手手牌尚多，单纯为压一手而拆炸弹/王炸通常得不偿失，理性选择不出。
    if (opponentLed) {
      const ordinaryReplies = moves.filter((move) => !isPowerMove(move));
      if (ordinaryReplies.length) {
        moves = ordinaryReplies;
      } else {
        const finishingPowerMove = moves.some((move) => removeCards(hand, move).length === 0);
        if (!powerBlockRequired && !finishingPowerMove) return null;
      }
    }

    if (!previousPattern && lastOwnPlayWasUncontestedSmallJoker(moveContext) && moves.length > 1) {
      const alternatives = moves.filter((move) => !(
        move.pattern.type === 'single'
        && move.pattern.mainRank === 17
      ));
      const ordinaryAlternative = alternatives.some((move) => !['bomb', 'rocket'].includes(move.pattern.type));
      if (ordinaryAlternative) moves = alternatives;
    }

    const scored = rankMoves(moves, hand, previousPattern, moveContext, level, mode);
    return scored[0].move;
  }

  // 统一评分入口：给定一组候选（已过滤），按「越低越好」的启发式评分排序。
  // chooseMove（出牌决策）与 rankHintMoves（提示轮换）共用，保证两者口径一致。
  function rankMoves(moves, hand, previousPattern, moveContext, level, mode) {
    const threatened = level.threatAware && isOpponentThreat(moveContext);
    const partnerTail = partnerTailCount(moveContext);
    const opponentTail = opponentTailCount(moveContext);
    const emergency = isLandlordEmergency(moveContext);
    const regainedControl = !previousPattern && lastOwnPlayWonTrick(moveContext);
    const hasSameTypeResponse = Boolean(previousPattern && moves.some((move) => move.pattern.type === previousPattern.type));
    const beforeCost = structureCost(hand);

    const scored = moves.map((move) => {
      const remaining = removeCards(hand, move);
      if (remaining.length === 0) return { move, score: -100000 };
      const shape = summarizeHand(remaining);
      let score = shape.turns * level.turnWeight;
      score += shape.looseSingles * level.structureWeight * 1.7;
      score += shape.highSingles * level.structureWeight * 0.8;
      score += remaining.length * 0.12;
      score += move.pattern.mainRank * (previousPattern ? 0.78 : 0.2);
      score -= move.cards.length * level.cardWeight;
      score += (structureCost(remaining) - beforeCost) * level.structureWeight;
      const splitPenaltyScale = emergency && splitsRocket(hand, move) ? 0.06 : 1;
      score += breaksPremiumGroup(hand, move) * level.structureWeight * splitPenaltyScale;
      score += attachmentPenalty(hand, move, remaining) * level.structureWeight;
      score += prematureHighComboPenalty(move, remaining, previousPattern) * level.structureWeight;
      score -= landlordPressureBonus(moveContext, move, remaining, beforeCost, previousPattern) * level.structureWeight;

      if (shape.turns === 1) score -= mode === 'hard' ? 66 : mode === 'normal' ? 44 : 18;
      if (move.pattern.type === 'bomb' || move.pattern.type === 'rocket') {
        const bombScale = threatened ? (hasSameTypeResponse ? 0.72 : 0.12) : 1;
        score += level.bombPenalty * bombScale;
        if (move.pattern.type === 'rocket' && !threatened) score += 18;
      }
      if (previousPattern && move.pattern.type === previousPattern.type) score -= 14;
      if (threatened && move.pattern.mainRank >= 15) score -= 9;
      if (emergency && splitsRocket(hand, move) && move.pattern.type === previousPattern.type) score -= 24;

      if (['straight', 'pairStraight', 'plane', 'planeSingle', 'planePair'].includes(move.pattern.type)) {
        score -= (move.cards.length * 0.9 + move.pattern.chainLength * 1.8) * level.structureWeight;
      }

      if (!previousPattern && ['single', 'pair'].includes(move.pattern.type) && move.pattern.mainRank >= 15) {
        score += (move.pattern.mainRank - 14) * 8 * level.structureWeight;
      }

      if (regainedControl) {
        if (['single', 'pair'].includes(move.pattern.type)) {
          score += Math.max(0, move.pattern.mainRank - 10) * 10 * level.structureWeight;
          if (move.pattern.mainRank <= 10) score -= 12;
        } else if (move.cards.length >= 3) {
          score -= move.cards.length * 2.2 * level.structureWeight;
        }
        if (shape.looseSingles >= 3 && move.cards.length === 1 && move.pattern.mainRank >= 14) score += 32;
      }

      if (!previousPattern && opponentTail <= 2) {
        if (move.cards.length > opponentTail) score -= 36;
        else if (move.pattern.type === 'single') score -= move.pattern.mainRank * 1.7;
      }

      if (!previousPattern && partnerTail <= 2 && !threatened) {
        if (move.cards.length === partnerTail) score -= 25;
        if (move.pattern.type === 'single' || move.pattern.type === 'pair') score += move.pattern.mainRank * 0.55;
      }

      if (!previousPattern
        && lastOwnPlayWasUncontestedSmallJoker(moveContext)
        && move.pattern.type === 'single'
        && move.pattern.mainRank === 17) score += 1000;

      score += (TYPE_ORDER[move.pattern.type] || 20) * 0.01;
      return { move, score };
    });

    scored.sort((a, b) => a.score - b.score || a.move.signature.localeCompare(b.move.signature));
    return scored;
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
    rankMoves,
    evaluateBid,
    chooseBid,
    structureCost
  });
})(globalThis);
