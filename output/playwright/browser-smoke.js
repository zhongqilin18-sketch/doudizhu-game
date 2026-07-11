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
      lastPlay: state.lastPlay ? state.lastPlay.pattern.type : null,
      selectedCount: window.DDZ.app.selectedIds.size
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
    assert.equal(state.phase, 'bidding', `预期叫分阶段，实际为 ${state.phase}`);
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
  await page.locator('#hint-play').click();
  const selectedCount = await page.evaluate(() => window.DDZ.app.selectedIds.size);
  if (selectedCount > 0) await page.locator('#submit-play').click();
  else await page.locator('#pass-play').click();
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
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });

  const indexUrl = pathToFileURL(path.join(process.cwd(), 'index.html')).href;
  await page.goto(indexUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.DDZ && window.DDZ.app);
  assert.equal(await page.title(), '经典斗地主 · 单机版');
  assert.equal(await page.locator('#menu-screen').isVisible(), true);
  assert.equal(await page.locator('#game-screen').isHidden(), true);

  await page.locator('#open-rules').click();
  assert.equal(await page.locator('#modal-rules').evaluate((dialog) => dialog.open), true);
  await page.locator('[data-close-modal="modal-rules"]').first().click();
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#modal-settings').evaluate((dialog) => dialog.open), true);
  await page.locator('[data-close-modal="modal-settings"]').first().click();

  await page.locator('label[for="difficulty-hard"]').click();
  await page.locator('#start-game').click();
  assert.equal(await page.locator('#game-screen').isVisible(), true);
  let state = await reachPlaying(page);
  assert.equal(state.phase, 'playing');
  assert.equal(state.bottomRevealed, true);
  assert.equal(state.handCounts[state.landlordIndex], 20);
  assert.equal(state.handCounts.reduce((sum, count) => sum + count, 0), 54);

  state = await waitForHumanOrEnd(page);
  assert.equal(state.phase, 'playing');
  assert.equal(state.currentPlayer, 0);
  assert.equal(await page.locator('#human-hand .playing-card').count(), state.handCounts[0]);

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
    for (const id of invalidIds) {
      await page.locator(`[data-card-id="${id}"]`).click({ position: { x: 8, y: 16 } });
    }
    const beforeInvalid = await snapshotState(page);
    await page.locator('#submit-play').click();
    const afterInvalid = await snapshotState(page);
    assert.equal(afterInvalid.revision, beforeInvalid.revision, '非法出牌不得改变 revision');
    assert.equal(afterInvalid.handCounts[0], beforeInvalid.handCounts[0], '非法出牌不得减少手牌');
    assert.equal(await page.locator('#toast').isVisible(), true);
    for (const id of invalidIds) {
      await page.locator(`[data-card-id="${id}"]`).click({ position: { x: 8, y: 16 } });
    }
  }

  const sortModeBefore = await page.evaluate(() => window.DDZ.app.sortMode);
  await page.locator('#sort-hand').click();
  assert.notEqual(await page.evaluate(() => window.DDZ.app.sortMode), sortModeBefore);
  await page.locator('#sort-hand').click();

  await page.screenshot({ path: path.join('output', 'playwright', 'game-1440x900.png') });
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
  assert.equal(await page.locator('#modal-result').evaluate((dialog) => dialog.open), true);
  assert.match(await page.locator('[data-result="summary"]').textContent(), /(地主|农民)阵营获胜/);

  const finishedRoundId = state.roundId;
  await page.locator('#result-restart').click();
  state = await snapshotState(page);
  assert.ok(state.roundId > finishedRoundId);
  assert.ok(['bidding', 'playing'].includes(state.phase));

  await reachPlaying(page);
  const viewportChecks = [];
  for (const viewport of [
    { width: 844, height: 390, name: '844x390' },
    { width: 667, height: 375, name: '667x375' },
    { width: 390, height: 844, name: '390x844' }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: path.join('output', 'playwright', `game-${viewport.name}.png`) });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      actionVisible: Boolean(document.querySelector('#playing-actions')?.getBoundingClientRect().height),
      handVisible: Boolean(document.querySelector('#human-hand')?.getBoundingClientRect().height)
    }));
    assert.ok(layout.scrollWidth <= layout.width + 1, `${viewport.name}: ${JSON.stringify(layout)}`);
    assert.ok(layout.bodyScrollWidth <= layout.width + 1, `${viewport.name}: ${JSON.stringify(layout)}`);
    assert.equal(layout.actionVisible, true, viewport.name);
    assert.equal(layout.handVisible, true, viewport.name);
    viewportChecks.push({ viewport: viewport.name, ...layout });
  }

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
    hintAndPlay: true,
    completeGame: true,
    restart: true,
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
