'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

let activeBrowser = null;

async function snapshotState(page) {
  return page.evaluate(() => {
    const state = window.DDZ.app.engine.state;
    return {
      phase: state.phase,
      roundId: state.roundId,
      revision: state.revision,
      currentPlayer: state.currentPlayer,
      landlordIndex: state.landlordIndex,
      highestBid: state.highestBid,
      bottomRevealed: state.bottomRevealed,
      handCounts: state.players.map((player) => player.hand.length),
      names: state.players.map((player) => player.name),
      coins: state.players.map((player) => player.coins),
      multipliers: state.players.map((player) => player.multiplier),
      playedCounts: state.players.map((player) => player.playedCards.length),
      lastPlay: state.lastPlay ? state.lastPlay.pattern.type : null,
      selectedCount: window.DDZ.app.selectedIds.size,
      autoPlay: window.DDZ.app.autoPlay
    };
  });
}

async function waitForRevision(page, before, timeout = 5000) {
  await page.waitForFunction(
    ({ roundId, revision }) => {
      const state = window.DDZ && window.DDZ.app && window.DDZ.app.engine.state;
      return state && (state.roundId !== roundId || state.revision > revision);
    },
    before,
    { timeout }
  );
}

async function reachPlaying(page) {
  for (let step = 0; step < 60; step += 1) {
    const state = await snapshotState(page);
    if (state.phase === 'playing' || state.phase === 'finished') return state;
    if (state.phase === 'doubling') {
      assert.equal(await page.locator('#phase-overlay').isVisible(), true, '倍率阶段应显示中央五秒倒计时');
      if (state.multipliers[0] === null) await page.locator('[data-multiplier="2"]').click();
      await page.waitForFunction(() => window.DDZ.app.engine.state.phase !== 'doubling');
      continue;
    }
    if (state.phase === 'landlordReveal') {
      assert.equal(await page.locator('#phase-overlay').isVisible(), true, '地主产生后应显示中央三秒倒计时');
      assert.equal(await page.locator(`#player-${state.landlordIndex} [data-field="crown"]`).isVisible(), true, '地主应戴上皇冠');
      await page.waitForFunction(() => window.DDZ.app.engine.state.phase !== 'landlordReveal');
      continue;
    }
    assert.equal(state.phase, 'bidding', `预期叫分阶段，实际为 ${state.phase}`);
    assert.equal(await page.locator('#phase-overlay').isVisible(), true, '叫分阶段应显示中央十秒倒计时');
    if (state.currentPlayer === 0) {
      const bidThree = page.locator('[data-bid="3"]');
      if (await bidThree.isEnabled()) await bidThree.click();
      else await page.locator('[data-bid="0"]').click();
    } else {
      await waitForRevision(page, state);
    }
  }
  throw new Error('叫地主阶段未能在有限步骤内结束');
}

async function waitForHumanOrEnd(page) {
  await page.waitForFunction(() => {
    const state = window.DDZ.app.engine.state;
    return state.phase === 'finished' || (state.phase === 'playing' && state.currentPlayer === 0);
  }, null, { timeout: 10000 });
  return snapshotState(page);
}

async function playHumanTurn(page) {
  const before = await snapshotState(page);
  assert.equal(before.phase, 'playing');
  assert.equal(before.currentPlayer, 0);
  await page.evaluate(() => {
    window.DDZ.app.hint();
    if (window.DDZ.app.selectedIds.size > 0) window.DDZ.app.submitPlay();
    else window.DDZ.app.pass();
  });
  await waitForRevision(page, before);
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  await context.addInitScript(() => {
    let seed = 20260711;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(Number(delay) || 0, 35), ...args);
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('AudioContext encountered an error from the audio device')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });

  const indexUrl = pathToFileURL(path.join(process.cwd(), 'index.html')).href;
  await page.goto(indexUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DDZ && window.DDZ.app);
  assert.equal(await page.title(), '麒麟斗地主 · 单机版');
  assert.equal(await page.locator('#menu-screen').isVisible(), true);
  assert.equal(await page.locator('#game-screen').isHidden(), true);
  assert.equal(await page.locator('#menu-coin-value').textContent(), '10,000');
  assert.equal(await page.locator('#menu-music').isChecked(), true);
  assert.equal(await page.evaluate(() => window.DDZ.app.settings.soundVolume), 20);
  assert.equal(await page.evaluate(() => window.DDZ.app.settings.musicVolume), 20);
  assert.equal(await page.locator('#setting-sound-volume').getAttribute('max'), '30');
  assert.equal(await page.locator('#setting-music-volume').getAttribute('max'), '30');
  await page.screenshot({ path: path.join('output', 'playwright', 'menu-1440x900.png') });

  await page.locator('#open-rules').click();
  assert.equal(await page.evaluate(() => {
    const music = window.DDZ.app.audio.musicAudio;
    return !music || !music.paused;
  }), true, '首次用户交互后，已开启的菜单背景音乐应开始循环播放');
  assert.equal(await page.locator('#modal-rules').evaluate((dialog) => dialog.open), true);
  await page.locator('[data-close-modal="modal-rules"]').first().click();
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#modal-settings').evaluate((dialog) => dialog.open), true);
  await page.locator('[data-close-modal="modal-settings"]').first().click();

  await page.locator('#menu-card-counter').check();

  await page.locator('label[for="difficulty-hard"]').click();
  await page.locator('#start-game').click();
  assert.equal(await page.locator('#game-screen').isVisible(), true);
  assert.equal(await page.locator('#turn-pointer').isVisible(), true, '叫分阶段也应显示当前回合指针');
  await page.screenshot({ path: path.join('output', 'playwright', 'bidding-1440x900.png') });
  await page.locator('#toggle-autoplay').click();
  assert.equal(await page.locator('#autoplay-indicator').isVisible(), true, '开启后应明显显示电脑托管提示');
  assert.equal(await page.locator('#game-screen').getAttribute('class').then((value) => value.includes('is-autoplay')), true);
  await page.screenshot({ path: path.join('output', 'playwright', 'autoplay-1440x900.png') });
  await page.waitForFunction(() => window.DDZ.app.engine.state.phase === 'playing', null, { timeout: 10000 });
  let state = await snapshotState(page);
  assert.equal(state.autoPlay, true);
  await page.locator('#toggle-autoplay').click();
  assert.equal(await page.locator('#autoplay-indicator').isHidden(), true, '关闭后托管提示应消失');
  state = await snapshotState(page);
  assert.equal(state.autoPlay, false);
  await page.evaluate(() => window.DDZ.app.restart());
  state = await reachPlaying(page);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.names, ['麒麟', '掘开', '旭旭宝宝']);
  assert.equal(state.bottomRevealed, true);
  assert.equal(state.handCounts[state.landlordIndex], 20);
  assert.ok(state.multipliers.every((value) => [1, 2, 3].includes(value)));
  assert.equal(state.handCounts.reduce((sum, count) => sum + count, 0), 54);

  state = await waitForHumanOrEnd(page);
  assert.equal(state.phase, 'playing');
  assert.equal(state.currentPlayer, 0);
  assert.equal(await page.locator('#human-hand .playing-card').count(), state.handCounts[0]);
  assert.equal(await page.locator('#table-message').count(), 0, '牌桌中央不应再显示流程提示方框');
  assert.equal(await page.locator('#turn-pointer').isVisible(), true, '当前回合指针应清晰可见');
  assert.equal(await page.locator('#turn-pointer').getAttribute('data-player'), '0');
  assert.equal(await page.locator('#player-1 [data-field="cards"] .card-back').count(), state.handCounts[1]);
  assert.equal(await page.locator('#player-2 [data-field="cards"] .card-back').count(), state.handCounts[2]);
  const separatedOpponentZones = await page.evaluate(() => [1, 2].map((index) => {
    const seat = document.querySelector(`#player-${index}`).getBoundingClientRect();
    const backsElement = document.querySelector(`#player-${index} [data-field="cards"]`);
    const backs = backsElement.getBoundingClientRect();
    const play = document.querySelector(`#play-zone-${index}`).getBoundingClientRect();
    const overlaps = !(backs.right <= play.left || backs.left >= play.right || backs.bottom <= play.top || backs.top >= play.bottom);
    return {
      horizontal: getComputedStyle(backsElement).transform === 'none',
      belowSeat: backs.top >= seat.bottom - 2,
      overlaps
    };
  }));
  assert.ok(separatedOpponentZones.every((item) => item.horizontal && item.belowSeat && !item.overlaps), '电脑剩余牌应水平位于头像框下方，且不得与出牌区重叠');
  const seatSizes = await page.locator('.player-seat').evaluateAll((seats) => seats.map((seat) => {
    const rect = seat.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }));
  assert.ok(Math.max(...seatSizes.map((seat) => seat.width)) - Math.min(...seatSizes.map((seat) => seat.width)) <= 2, '三位玩家头像框宽度应一致');
  assert.ok(Math.max(...seatSizes.map((seat) => seat.height)) - Math.min(...seatSizes.map((seat) => seat.height)) <= 2, '三位玩家头像框高度应一致');
  assert.equal(await page.locator('#card-counter').isVisible(), true);
  assert.equal(await page.locator('#card-counter-list .counter-chip').count(), 15);
  assert.equal(await page.locator('#player-0 .avatar-photo img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator('#player-1 .avatar-photo img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator('#player-2 .avatar-photo img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
  await page.evaluate(() => { window.DDZ.app.turnSeconds = 20; window.DDZ.app.render(); window.DDZ.app.startTurnClock(); });
  const timerProgress = await page.locator('#turn-timer-0').evaluate((timer) => ({
    start: timer.style.getPropertyValue('--turn-angle'),
    next: timer.style.getPropertyValue('--turn-next-angle'),
    background: getComputedStyle(timer).backgroundImage
  }));
  assert.equal(timerProgress.start, '360deg');
  assert.equal(timerProgress.next, '342deg');
  assert.ok(timerProgress.background.includes('conic-gradient'), '倒计时应使用随时间逆向收缩的圆环');

  const sequenceAssist = await page.evaluate(() => {
    const app = window.DDZ.app;
    const state = app.engine.state;
    const originalHand = state.players[0].hand;
    const originalLastPlay = state.lastPlay;
    const deck = window.DDZ.Cards.createDeck();
    const hand = [];
    for (let rank = 3; rank <= 10; rank += 1) hand.push(deck.find((card) => card.rank === rank));
    state.players[0].hand = hand;
    state.lastPlay = null;
    app.selectedIds = new Set(hand.filter((card) => [3, 4, 5].includes(card.rank)).map((card) => card.id));
    const leadingCompleted = app.autoCompleteSequenceSelection();
    const leadingRanks = hand.filter((card) => app.selectedIds.has(card.id)).map((card) => card.rank).sort((a, b) => a - b);

    const targetDeck = window.DDZ.Cards.createDeck();
    const targetCards = [];
    for (let rank = 3; rank <= 8; rank += 1) targetCards.push(targetDeck.find((card) => card.rank === rank));
    state.lastPlay = { playerIndex: 1, cards: targetCards, pattern: window.DDZ.HandAnalyzer.analyzeHand(targetCards) };
    app.selectedIds = new Set(hand.filter((card) => [4, 5, 6].includes(card.rank)).map((card) => card.id));
    const followingCompleted = app.autoCompleteSequenceSelection();
    const followingRanks = hand.filter((card) => app.selectedIds.has(card.id)).map((card) => card.rank).sort((a, b) => a - b);

    state.players[0].hand = originalHand;
    state.lastPlay = originalLastPlay;
    app.selectedIds.clear();
    app.render();
    return { leadingCompleted, leadingRanks, followingCompleted, followingRanks };
  });
  assert.equal(sequenceAssist.leadingCompleted, true);
  assert.deepEqual(sequenceAssist.leadingRanks, [3, 4, 5, 6, 7], '领牌时单顺应默认只补成五张');
  assert.equal(sequenceAssist.followingCompleted, true);
  assert.deepEqual(sequenceAssist.followingRanks, [4, 5, 6, 7, 8, 9], '跟六张顺子时只应补足六张');

  const hintCycle = await page.evaluate(() => {
    const app = window.DDZ.app;
    const state = app.engine.state;
    const originalHand = state.players[0].hand;
    const originalLastPlay = state.lastPlay;
    const originalHistory = state.playHistory;
    const deck = window.DDZ.Cards.createDeck();
    const used = new Set();
    const take = (rank) => {
      const card = deck.find((candidate) => candidate.rank === rank && !used.has(candidate.id));
      used.add(card.id);
      return card;
    };
    state.players[0].hand = [take(7), take(7), take(7), take(3), take(4), take(5), take(14), take(15), take(16), take(17)];
    const target = [take(6), take(6), take(6), take(5)];
    state.lastPlay = { playerIndex: 1, cards: target, pattern: window.DDZ.HandAnalyzer.analyzeHand(target) };
    state.playHistory = [];
    app.selectedIds.clear();
    app.resetHintCycle();
    app.hint();
    const total = app.hintCandidates.length;
    const signatures = [window.DDZ.Cards.cardSignature(state.players[0].hand.filter((card) => app.selectedIds.has(card.id)))];
    const firstAttachment = state.players[0].hand.filter((card) => app.selectedIds.has(card.id) && card.rank !== 7).map((card) => card.rank);
    for (let index = 1; index < total; index += 1) {
      app.hint();
      signatures.push(window.DDZ.Cards.cardSignature(state.players[0].hand.filter((card) => app.selectedIds.has(card.id))));
    }
    app.hint();
    const cleared = app.selectedIds.size === 0;
    state.players[0].hand = originalHand;
    state.lastPlay = originalLastPlay;
    state.playHistory = originalHistory;
    app.selectedIds.clear();
    app.resetHintCycle();
    app.render();
    return { total, unique: new Set(signatures).size, cleared, firstAttachment };
  });
  assert.ok(hintCycle.total >= 2, '应提供多个合理提示候选');
  assert.equal(hintCycle.unique, hintCycle.total, '重复点击提示应逐个切换不同候选');
  assert.equal(hintCycle.cleared, true, '合理候选穷尽后应清空选牌');
  assert.deepEqual(hintCycle.firstAttachment, [3], '三带一首先应使用最小附件');

  const invalidIds = await page.evaluate(() => {
    const hand = window.DDZ.app.engine.state.players[0].hand;
    for (let left = 0; left < hand.length; left += 1) {
      for (let right = left + 1; right < hand.length; right += 1) {
        if (hand[left].rank !== hand[right].rank && !(hand[left].rank === 16 && hand[right].rank === 17) && !(hand[left].rank === 17 && hand[right].rank === 16)) {
          return [hand[left].id, hand[right].id];
        }
      }
    }
    return [];
  });
  if (invalidIds.length === 2) {
    const invalidAttempt = await page.evaluate((ids) => {
      const app = window.DDZ.app;
      const before = {
        revision: app.engine.state.revision,
        handCount: app.engine.state.players[0].hand.length
      };
      ids.forEach((id) => app.selectedIds.add(id));
      app.render();
      app.submitPlay();
      return {
        before,
        revision: app.engine.state.revision,
        handCount: app.engine.state.players[0].hand.length,
        toastVisible: !document.querySelector('#toast').hidden
      };
    }, invalidIds);
    assert.equal(invalidAttempt.revision, invalidAttempt.before.revision, '非法出牌不得改变 revision');
    assert.equal(invalidAttempt.handCount, invalidAttempt.before.handCount, '非法出牌不得减少手牌');
    assert.equal(invalidAttempt.toastVisible, true);
  }

  await page.evaluate(() => { window.DDZ.app.selectedIds.clear(); window.DDZ.app.render(); });
  const dragCards = page.locator('#human-hand [data-card-id]:not(:disabled)');
  if (await dragCards.count() >= 3) {
    const firstBox = await dragCards.nth(0).boundingBox();
    const thirdBox = await dragCards.nth(2).boundingBox();
    if (firstBox && thirdBox) {
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.ok(await page.evaluate(() => window.DDZ.app.selectedIds.size >= 1), '长按滑动应至少选中一张牌');
      await page.evaluate(() => { window.DDZ.app.selectedIds.clear(); window.DDZ.app.render(); });
    }
  }
  assert.equal(await page.locator('#sort-hand').count(), 0, '不再显示牌力/花色切换按钮');

  const timeoutBefore = await snapshotState(page);
  await page.evaluate(() => {
    window.DDZ.app.turnSeconds = 1;
    window.DDZ.app.startTurnClock();
  });
  await waitForRevision(page, timeoutBefore);
  const timeoutAfter = await snapshotState(page);
  assert.notEqual(timeoutAfter.revision, timeoutBefore.revision, '20 秒倒计时结束后必须自动行动');
  if (timeoutAfter.phase !== 'finished') await waitForHumanOrEnd(page);

  for (const type of ['bomb', 'rocket', 'plane']) {
    const feedback = await page.evaluate((patternType) => {
      window.DDZ.app.animator.special({ type: patternType });
      const layer = document.querySelector('#fx-layer');
      return {
        active: layer.classList.contains(`fx-${patternType}`),
        text: layer.textContent
      };
    }, type);
    assert.equal(feedback.active, true, `${type} 应触发专属动态效果`);
    assert.ok(feedback.text.length > 0, `${type} 应显示牌型反馈`);
  }

  await page.screenshot({ path: path.join('output', 'playwright', 'layout-game-1440x900.png') });
  await page.screenshot({ path: path.join('docs', 'game-screenshot.png') });

  let humanTurns = 0;
  for (let step = 0; step < 250; step += 1) {
    state = await snapshotState(page);
    if (state.phase === 'finished') break;
    state = await waitForHumanOrEnd(page);
    if (state.phase === 'finished') break;
    await playHumanTurn(page);
    humanTurns += 1;
  }
  state = await snapshotState(page);
  assert.equal(state.phase, 'finished', `完整浏览器对局未结束，真人回合数 ${humanTurns}`);
  assert.ok(await page.evaluate(() => (
    window.DDZ.app.engine.state.playHistory
      .filter((entry) => entry.playerIndex === 1 || entry.playerIndex === 2)
      .some((entry) => Array.isArray(entry.cards) && entry.cards.length > 0)
  )), '电脑玩家应在完整对局中作出实际出牌决策');
  const settledCoins = [...state.coins];
  await page.waitForFunction(() => document.querySelector('#modal-result')?.open === true);
  assert.equal(await page.locator('#modal-result').evaluate((dialog) => dialog.open), true);
  assert.equal(await page.locator('#hand-zone').isHidden(), true, '终局时常规手牌区应让位给三人的余牌展示区');
  for (let playerIndex = 0; playerIndex < 3; playerIndex += 1) {
    assert.ok((await page.locator(`#play-zone-${playerIndex}`).textContent()).trim().length > 0, `玩家${playerIndex}终局出牌区应展示余牌或胜方标识`);
  }
  assert.match(await page.locator('[data-result="title"]').textContent(), /(地主|农民)胜利/);
  assert.match(await page.locator('[data-result="summary"]').textContent(), /(地主|农民)失败/);
  assert.notDeepEqual(state.coins, [10000, 10000, 10000]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join('output', 'playwright', 'result-1440x900.png') });

  const finishedRoundId = state.roundId;
  await page.locator('#result-restart').click();
  state = await snapshotState(page);
  assert.ok(state.roundId > finishedRoundId);
  assert.ok(['bidding', 'doubling', 'landlordReveal', 'playing'].includes(state.phase));

  await reachPlaying(page);
  const viewportChecks = [];
  for (const viewport of [
    { width: 568, height: 320, name: '568x320' },
    { width: 640, height: 360, name: '640x360' },
    { width: 844, height: 390, name: '844x390' },
    { width: 667, height: 375, name: '667x375' },
    { width: 915, height: 412, name: '915x412' },
    { width: 320, height: 568, name: '320x568' },
    { width: 360, height: 640, name: '360x640' },
    { width: 375, height: 667, name: '375x667' },
    { width: 390, height: 844, name: '390x844' },
    { width: 412, height: 915, name: '412x915' }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => {
      const app = window.DDZ.app;
      app.selectedIds.clear();
      const hand = app.engine.state.players[0].hand;
      if (hand.length > 0) app.selectedIds.add(hand[Math.floor(hand.length / 2)].id);
      app.render();
    });
    await page.screenshot({ path: path.join('output', 'playwright', `layout-game-${viewport.name}.png`) });
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element || element.hidden) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const potentialRect = (selector) => {
        const element = document.querySelector(selector);
        if (!element || element.hidden) return null;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const overlaps = (first, second, gap = 2) => Boolean(first && second
        && first.left < second.right + gap
        && first.right > second.left - gap
        && first.top < second.bottom + gap
        && first.bottom > second.top - gap);
      const visiblePairs = [
        ['left seat / right seat', '#player-1', '#player-2'],
        ['left seat / human seat', '#player-1', '#player-0'],
        ['right seat / human seat', '#player-2', '#player-0'],
        ['human seat / actions', '#player-0', '#interaction-zone'],
        ['human seat / hand', '#player-0', '#hand-zone'],
        ['actions / hand', '#interaction-zone', '#hand-zone'],
        ['actions / raised card', '#interaction-zone', '#human-hand .playing-card.is-selected'],
        ['bottom cards / card counter', '.bottom-card-zone', '#card-counter'],
        ['bottom cards / left seat', '.bottom-card-zone', '#player-1'],
        ['bottom cards / right seat', '.bottom-card-zone', '#player-2'],
        ['human crown / left seat', '#player-0 [data-field="crown"]', '#player-1'],
        ['human crown / left remaining cards', '#player-0 [data-field="crown"]', '#player-1 [data-field="cards"]'],
        ['left crown / HUD', '#player-1 [data-field="crown"]', '.game-hud'],
        ['right crown / HUD', '#player-2 [data-field="crown"]', '.game-hud'],
        ['left remaining cards / card counter', '#player-1 [data-field="cards"]', '#card-counter'],
        ['right remaining cards / card counter', '#player-2 [data-field="cards"]', '#card-counter'],
        ['left remaining cards / human seat', '#player-1 [data-field="cards"]', '#player-0'],
        ['right remaining cards / human play', '#player-2 [data-field="cards"]', '#play-zone-0'],
        ['left remaining cards / left play', '#player-1 [data-field="cards"]', '#play-zone-1'],
        ['right remaining cards / right play', '#player-2 [data-field="cards"]', '#play-zone-2'],
        ['left play / human seat', '#play-zone-1', '#player-0'],
        ['right play / human play', '#play-zone-2', '#play-zone-0'],
        ['human seat / human play', '#player-0', '#play-zone-0'],
        ['human play / actions', '#play-zone-0', '#interaction-zone'],
        ['turn pointer / bottom cards', '#turn-pointer', '.bottom-card-zone'],
        ['turn pointer / card counter', '#turn-pointer', '#card-counter'],
        ['turn pointer / left play', '#turn-pointer', '#play-zone-1'],
        ['turn pointer / right play', '#turn-pointer', '#play-zone-2'],
        ['turn pointer / human seat', '#turn-pointer', '#player-0'],
        ['turn pointer / human play', '#turn-pointer', '#play-zone-0'],
        ['turn pointer / actions', '#turn-pointer', '#interaction-zone']
      ];
      const collisions = visiblePairs
        .filter(([, first, second]) => overlaps(rect(first), rect(second)))
        .map(([label]) => label);
      const potentialPlayPairs = [
        ['potential left play / right play', '#play-zone-1', '#play-zone-2'],
        ['potential left play / human seat', '#play-zone-1', '#player-0'],
        ['potential right play / human play', '#play-zone-2', '#play-zone-0'],
        ['potential turn pointer / left play', '#turn-pointer', '#play-zone-1'],
        ['potential turn pointer / right play', '#turn-pointer', '#play-zone-2']
      ];
      collisions.push(...potentialPlayPairs
        .filter(([, first, second]) => overlaps(potentialRect(first), potentialRect(second)))
        .map(([label]) => label));
      const controls = [...document.querySelectorAll('#playing-actions button:not([hidden])')]
        .filter((button) => getComputedStyle(button).display !== 'none')
        .map((button) => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
      const handCards = [...document.querySelectorAll('#human-hand .playing-card')]
        .map((card) => card.getBoundingClientRect());
      const handSpread = handCards.length > 0
        ? Math.max(...handCards.map((card) => card.right)) - Math.min(...handCards.map((card) => card.left))
        : 0;
      return {
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        actionVisible: Boolean(document.querySelector('#playing-actions')?.getBoundingClientRect().height),
        handVisible: Boolean(document.querySelector('#human-hand')?.getBoundingClientRect().height),
        collisions,
        controls,
        handCardCount: handCards.length,
        handSpread,
        handClass: document.querySelector('#human-hand')?.className || '',
        handCardLefts: handCards.map((card) => Math.round(card.left * 10) / 10),
        boxes: {
          humanSeat: rect('#player-0'),
          humanPlay: rect('#play-zone-0'),
          leftPlay: rect('#play-zone-1'),
          rightPlay: rect('#play-zone-2'),
          turnPointer: rect('#turn-pointer'),
          actions: rect('#interaction-zone'),
          hand: rect('#hand-zone'),
          raisedCard: rect('#human-hand .playing-card.is-selected')
        }
      };
    });
    assert.ok(layout.scrollWidth <= layout.width + 1, `${viewport.name}: ${JSON.stringify(layout)}`);
    assert.ok(layout.bodyScrollWidth <= layout.width + 1, `${viewport.name}: ${JSON.stringify(layout)}`);
    assert.equal(layout.actionVisible, true, viewport.name);
    assert.equal(layout.handVisible, true, viewport.name);
    await page.evaluate(() => {
      document.querySelector('#game-screen').classList.add('is-autoplay');
      document.querySelector('#autoplay-indicator').hidden = false;
    });
    const autoplayCollisions = await page.evaluate(() => {
      const indicator = document.querySelector('#autoplay-indicator').getBoundingClientRect();
      return ['#player-0', '#player-1', '#player-2', '.bottom-card-zone', '#card-counter']
        .filter((selector) => {
          const element = document.querySelector(selector);
          if (!element || element.hidden || getComputedStyle(element).display === 'none') return false;
          const box = element.getBoundingClientRect();
          return indicator.left < box.right + 2 && indicator.right > box.left - 2
            && indicator.top < box.bottom + 2 && indicator.bottom > box.top - 2;
        });
    });
    await page.evaluate(() => {
      document.querySelector('#game-screen').classList.remove('is-autoplay');
      document.querySelector('#autoplay-indicator').hidden = true;
      window.DDZ.app.selectedIds.clear();
      window.DDZ.app.render();
    });
    viewportChecks.push({ viewport: viewport.name, ...layout, autoplayCollisions });
  }

  const collisionFailures = viewportChecks
    .filter((layout) => layout.collisions.length > 0 || layout.autoplayCollisions.length > 0)
    .map((layout) => ({ viewport: layout.viewport, collisions: layout.collisions, autoplayCollisions: layout.autoplayCollisions, boxes: layout.boxes }));
  assert.deepEqual(collisionFailures, [], `mobile collision failures: ${JSON.stringify(collisionFailures)}`);
  const undersizedControls = viewportChecks
    .filter((layout) => layout.controls.some((control) => control.width < 44 || control.height < 44))
    .map((layout) => ({ viewport: layout.viewport, controls: layout.controls }));
  assert.deepEqual(undersizedControls, [], `undersized mobile controls: ${JSON.stringify(undersizedControls)}`);
  const crampedHands = viewportChecks
    .filter((layout) => layout.handCardCount > 1 && layout.handSpread < Math.min(layout.width * 0.72, 40 + layout.handCardCount * 12))
    .map((layout) => ({ viewport: layout.viewport, handCardCount: layout.handCardCount, handSpread: layout.handSpread, handClass: layout.handClass, handCardLefts: layout.handCardLefts }));
  assert.deepEqual(crampedHands, [], `cramped mobile hands: ${JSON.stringify(crampedHands)}`);

  await page.locator('#back-menu').click();
  assert.equal(await page.locator('#modal-confirm').evaluate((dialog) => dialog.open), true);
  const confirmMetrics = await page.locator('#modal-confirm').evaluate((dialog) => {
    const button = dialog.querySelector('#confirm-ok');
    const dialogStyle = getComputedStyle(dialog);
    const buttonStyle = getComputedStyle(button);
    const dialogRect = dialog.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      dialogDisplay: dialogStyle.display,
      dialogVisibility: dialogStyle.visibility,
      dialogOpacity: dialogStyle.opacity,
      dialogRect: { x: dialogRect.x, y: dialogRect.y, width: dialogRect.width, height: dialogRect.height },
      buttonDisplay: buttonStyle.display,
      buttonVisibility: buttonStyle.visibility,
      buttonOpacity: buttonStyle.opacity,
      buttonRect: { x: buttonRect.x, y: buttonRect.y, width: buttonRect.width, height: buttonRect.height }
    };
  });
  assert.equal(await page.locator('#confirm-ok').isVisible(), true, JSON.stringify(confirmMetrics));
  await page.locator('#confirm-ok').click();
  assert.equal(await page.locator('#menu-screen').isVisible(), true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.DDZ && window.DDZ.app);
  assert.equal(await page.locator('#menu-screen').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.DDZ.app.engine.getBalances()), settledCoins, '刷新后应保留结算后的麒麟币');

  await page.evaluate(() => {
    localStorage.setItem('kirin-ddz-wallet-v1', JSON.stringify([0, 10000, 10000]));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.DDZ && window.DDZ.app);
  assert.equal(await page.locator('#start-game').isDisabled(), true);
  assert.equal(await page.locator('#bankrupt-message').isVisible(), true);
  await page.locator('#open-settings').click();
  await page.locator('#reset-coins').click();
  assert.equal(await page.locator('#modal-confirm').evaluate((dialog) => dialog.open), true);
  await page.locator('#confirm-ok').click();
  assert.equal(await page.locator('#start-game').isEnabled(), true);
  assert.equal(await page.locator('#menu-coin-value').textContent(), '10,000');

  assert.deepEqual(pageErrors, [], `pageerror: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
  assert.deepEqual(externalRequests, [], `出现外部请求: ${externalRequests.join(' | ')}`);

  const summary = {
    menu: true,
    rulesDialog: true,
    settingsDialog: true,
    bidding: true,
    landlordBottomCards: true,
    invalidPlayStable: true,
    turnTimeoutFallback: true,
    specialCardEffects: true,
    hintAndPlay: true,
    completeGame: true,
    restart: true,
    currencyPersistenceAndReset: true,
    returnToMenu: true,
    responsiveViewports: viewportChecks,
    humanTurns,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    externalRequests: externalRequests.length
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  await browser.close();
  activeBrowser = null;
}

main().catch(async (error) => {
  console.error(error);
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  process.exitCode = 1;
});
