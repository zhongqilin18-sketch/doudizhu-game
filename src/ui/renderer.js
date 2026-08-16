(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});
  const PHASE_NAMES = Object.freeze({
    menu: '主菜单',
    bidding: '叫地主',
    doubling: '选择倍率',
    landlordReveal: '地主揭晓',
    playing: '出牌中',
    finished: '结算展示'
  });
  const DIFFICULTY_NAMES = Object.freeze({ easy: '简单', normal: '普通', hard: '困难' });

  function byId(id) { return document.getElementById(id); }
  function setText(element, value) { if (element) element.textContent = value == null ? '' : String(value); }
  function field(panel, name) { return panel ? panel.querySelector(`[data-field="${name}"]`) : null; }
  function roleName(role) {
    if (role === 'landlord') return '地主';
    if (role === 'farmer') return '农民';
    return '身份待定';
  }
  function multiplierActionLabel(multiplier) {
    if (multiplier === 3) return '超级加倍';
    if (multiplier === 2) return '加倍';
    if (multiplier === 1) return '不加倍';
    return '';
  }
  function playerActionLabel(state, player) {
    if (state.phase === 'bidding' && player.bid !== null) return player.bid === 0 ? '不叫' : `${player.bid} 分`;
    if (['doubling', 'landlordReveal'].includes(state.phase) && player.multiplier !== null) return multiplierActionLabel(player.multiplier);
    if (state.phase === 'playing' && player.lastAction === '不出') return '不出';
    return '';
  }
  function formatCoins(value) { return Math.trunc(Number(value) || 0).toLocaleString('zh-CN'); }
  function cardAria(card, selected) { return `${card.displayName}，${selected ? '已选中' : '未选中'}`; }

  class Renderer {
    constructor() {
      this.menuScreen = byId('menu-screen');
      this.gameScreen = byId('game-screen');
      this.handElement = byId('human-hand');
      this.toastTimer = null;
    }

    showScreen(name) {
      const menuActive = name === 'menu';
      if (this.menuScreen) {
        this.menuScreen.hidden = !menuActive;
        this.menuScreen.classList.toggle('is-active', menuActive);
      }
      if (this.gameScreen) {
        this.gameScreen.hidden = menuActive;
        this.gameScreen.classList.toggle('is-active', !menuActive);
      }
    }

    createCard(card, options) {
      const config = options || {};
      const interactive = Boolean(config.interactive);
      const element = document.createElement(interactive ? 'button' : 'div');
      const isJoker = card.suit === 'joker';
      element.className = [
        'playing-card',
        card.color === 'red' ? 'is-red' : 'is-black',
        isJoker ? 'is-joker' : '',
        isJoker && card.rank === 17 ? 'is-big-joker' : '',
        config.compact ? 'is-compact' : '',
        config.micro ? 'is-micro' : '',
        config.selected ? 'is-selected' : ''
      ].filter(Boolean).join(' ');
      element.dataset.rank = String(card.rank);
      if (interactive) {
        element.type = 'button';
        element.dataset.cardId = card.id;
        element.setAttribute('aria-label', cardAria(card, config.selected));
        element.setAttribute('aria-pressed', String(Boolean(config.selected)));
        element.disabled = Boolean(config.disabled);
        element.style.setProperty('--card-index', String(config.index || 0));
        element.style.setProperty('--card-count', String(config.count || 1));
      }

      if (isJoker) {
        const jokerLabel = document.createElement('span');
        jokerLabel.className = 'joker-label';
        jokerLabel.textContent = card.label;
        const star = document.createElement('span');
        star.className = 'joker-star';
        star.textContent = card.rank === 17 ? '★' : '☆';
        element.append(jokerLabel, star);
      } else {
        const top = document.createElement('span');
        top.className = 'card-corner card-corner-top';
        const rank = document.createElement('strong');
        rank.textContent = card.label;
        const suit = document.createElement('span');
        suit.textContent = card.symbol;
        top.append(rank, suit);
        const center = document.createElement('span');
        center.className = 'card-suit-center';
        center.textContent = card.symbol;
        const bottom = top.cloneNode(true);
        bottom.className = 'card-corner card-corner-bottom';
        element.append(top, center, bottom);
      }
      return element;
    }

    createCardBack(compact) {
      const card = document.createElement('div');
      card.className = `playing-card card-back${compact ? ' is-compact' : ''}`;
      card.setAttribute('aria-label', '牌背');
      card.innerHTML = '<span class="card-back-mark" aria-hidden="true">麟</span>';
      return card;
    }

    render(state, view) {
      this.showScreen(state.phase === 'menu' ? 'menu' : 'game');
      this.renderMenu(state);
      if (state.phase === 'menu') return;

      setText(byId('phase-chip'), PHASE_NAMES[state.phase] || state.phase);
      this.renderAutomation(view);
      setText(byId('game-difficulty'), DIFFICULTY_NAMES[state.difficulty] || '普通');
      const multiplierSummary = state.players.map((player) => player.multiplier ? `×${player.multiplier}` : '待选').join(' / ');
      setText(byId('bid-summary'), state.phase === 'bidding'
        ? `底注 100 · 当前最高 ${state.highestBid ? `${state.highestBid} 分` : '无人叫分'}`
        : `底注 100 · ${state.highestBid || 1} 分 · ${multiplierSummary}`);
      this.renderBottomCards(state);
      this.renderCardCounter(state, view);
      const finished = state.phase === 'finished';
      const handZone = byId('hand-zone');
      const interactionZone = byId('interaction-zone');
      if (handZone) handZone.hidden = finished;
      if (interactionZone) interactionZone.hidden = finished;
      const restartButton = byId('restart-game');
      if (restartButton) restartButton.disabled = finished && state.players.some((player) => player.coins <= 0);
      state.players.forEach((player, index) => this.renderPlayer(state, player, index, view));
      this.renderTurnPointer(state);
      this.renderHumanHand(state, view);
      this.renderControls(state, view);
      this.renderSelection(state, view);
      this.renderPhaseOverlay(state, view);
      this.renderResult(state);
    }

    renderAutomation(view) {
      const enabled = Boolean(view.autoPlay);
      const screen = byId('game-screen');
      const button = byId('toggle-autoplay');
      const indicator = byId('autoplay-indicator');
      if (screen) screen.classList.toggle('is-autoplay', enabled);
      if (button) {
        button.classList.toggle('is-active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
        button.setAttribute('aria-label', enabled ? '关闭电脑托管' : '开启电脑托管');
      }
      if (indicator) indicator.hidden = !enabled;
    }

    renderMenu(state) {
      const human = state.players[0];
      setText(byId('menu-coin-value'), formatCoins(human ? human.coins : 0));
      const blocked = state.players.some((player) => player.coins <= 0);
      const start = byId('start-game');
      if (start) {
        start.disabled = blocked;
        start.setAttribute('aria-describedby', blocked ? 'bankrupt-message' : 'menu-wallet');
      }
      const warning = byId('bankrupt-message');
      if (warning) {
        warning.hidden = !blocked;
        setText(warning, blocked ? '有玩家的麒麟币已用完，请在设置中重置后继续。' : '');
      }
    }

    renderBottomCards(state) {
      const container = byId('bottom-cards');
      if (!container) return;
      container.replaceChildren();
      if (state.bottomRevealed) {
        state.bottomCards.forEach((card) => container.appendChild(this.createCard(card, { compact: true })));
        container.setAttribute('aria-label', `地主底牌：${state.bottomCards.map((card) => card.displayName).join('、')}`);
      } else {
        for (let index = 0; index < 3; index += 1) container.appendChild(this.createCardBack(true));
        container.setAttribute('aria-label', '三张地主底牌，尚未揭晓');
      }
      setText(byId('bottom-label'), state.bottomRevealed ? '已揭晓' : '待揭晓');
    }

    renderCardCounter(state, view) {
      const counter = byId('card-counter');
      const list = byId('card-counter-list');
      if (!counter || !list) return;
      const visible = Boolean(view.settings.cardCounter) && ['doubling', 'landlordReveal', 'playing', 'finished'].includes(state.phase);
      counter.hidden = !visible;
      list.replaceChildren();
      if (!visible) return;
      view.cardCounter.forEach((entry) => {
        const chip = document.createElement('span');
        chip.className = `counter-chip${entry.count === 0 ? ' is-zero' : ''}`;
        chip.innerHTML = `<strong>${entry.label}</strong><b>${entry.count}</b>`;
        chip.setAttribute('aria-label', `${entry.label}还剩${entry.count}张`);
        list.appendChild(chip);
      });
    }

    renderPlayer(state, player, index, view) {
      const panel = byId(`player-${index}`);
      if (!panel) return;
      const active = state.currentPlayer === index && ['bidding', 'playing'].includes(state.phase);
      panel.classList.toggle('is-active', active);
      panel.classList.toggle('is-landlord', player.role === 'landlord');
      panel.classList.toggle('is-thinking', Boolean(view.thinking) && active);
      panel.setAttribute('aria-current', String(active));
      setText(field(panel, 'name'), player.name);
      setText(field(panel, 'coins'), formatCoins(player.coins));

      const roleElement = field(panel, 'role');
      setText(roleElement, roleName(player.role));
      if (roleElement) {
        roleElement.classList.toggle('is-landlord', player.role === 'landlord');
        roleElement.classList.toggle('is-farmer', player.role === 'farmer');
        roleElement.classList.toggle('is-pending', !player.role);
        roleElement.dataset.role = player.role || 'pending';
      }
      setText(field(panel, 'count'), `${player.hand.length} 张`);

      const status = field(panel, 'status');
      if (state.phase === 'finished') setText(status, state.winner === index ? '本局胜方' : '展示余牌');
      else if (state.phase === 'doubling') setText(status, player.multiplier ? `已选${multiplierActionLabel(player.multiplier)}` : '选择倍率中');
      else if (active) setText(status, view.autoPlay && player.isHuman ? '电脑托管中' : (view.thinking ? '思考中' : `轮到${player.name}`));
      else setText(status, '等待中');

      const actionElement = field(panel, 'action');
      const action = playerActionLabel(state, player);
      setText(actionElement, action);
      if (actionElement) actionElement.hidden = !action;

      const crown = field(panel, 'crown');
      if (crown) crown.hidden = player.role !== 'landlord';
      const activeText = field(panel, 'active');
      setText(activeText, active ? (state.phase === 'bidding' ? '叫分' : '行动中') : '');

      const backs = field(panel, 'cards');
      if (backs && !player.isHuman) {
        backs.replaceChildren();
        backs.setAttribute('aria-label', `${player.name}剩余${player.hand.length}张牌`);
        for (let cardIndex = 0; cardIndex < player.hand.length; cardIndex += 1) {
          const back = this.createCardBack(true);
          back.style.setProperty('--back-index', String(cardIndex));
          backs.appendChild(back);
        }
      }
      this.renderPlayZone(state, player, index, view);
    }

    renderTurnPointer(state) {
      const pointer = byId('turn-pointer');
      if (!pointer) return;
      let playerIndex = null;
      let label = '';
      if (['bidding', 'playing'].includes(state.phase) && Number.isInteger(state.currentPlayer)) {
        playerIndex = state.currentPlayer;
        label = state.phase === 'bidding'
          ? `轮到 ${state.players[playerIndex].name} 叫分`
          : `轮到 ${state.players[playerIndex].name} 出牌`;
      } else if (state.phase === 'landlordReveal' && Number.isInteger(state.landlordIndex)) {
        playerIndex = state.landlordIndex;
        label = `${state.players[playerIndex].name} 是本局地主`;
      }
      pointer.hidden = !Number.isInteger(playerIndex);
      if (!Number.isInteger(playerIndex)) {
        pointer.dataset.player = '';
        pointer.dataset.phase = '';
        return;
      }
      pointer.dataset.player = String(playerIndex);
      pointer.dataset.phase = state.phase;
      setText(pointer.querySelector('[data-turn-pointer-label]'), label);
      pointer.setAttribute('aria-label', label);
    }

    renderPlayZone(state, player, index, view) {
      const container = byId(`play-zone-${index}`);
      if (!container) return;
      container.replaceChildren();
      const reveal = state.phase === 'finished';
      const cards = reveal && state.winner === index ? (player.playedCards || []) : (reveal ? player.hand : (player.playedCards || []));
      container.classList.toggle('is-revealed-hand', reveal);
      container.classList.toggle('is-empty', cards.length === 0);
      const showTimer = state.phase === 'playing' && state.currentPlayer === index && Number.isFinite(view.turnSeconds);
      if (showTimer) {
        const timer = document.createElement('span');
        timer.className = `play-zone-countdown${view.turnSeconds <= 5 ? ' is-urgent' : ''}`;
        timer.id = `turn-timer-${index}`;
        timer.textContent = String(view.turnSeconds);
        const startAngle = Math.max(0, Math.min(360, view.turnSeconds / 20 * 360));
        const endAngle = Math.max(0, Math.min(360, (view.turnSeconds - 1) / 20 * 360));
        timer.style.setProperty('--turn-angle', `${startAngle}deg`);
        timer.style.setProperty('--turn-next-angle', `${endAngle}deg`);
        timer.setAttribute('aria-label', `剩余${view.turnSeconds}秒`);
        container.appendChild(timer);
      }
      const mobileAction = playerActionLabel(state, player);
      if (mobileAction && !showTimer) {
        const action = document.createElement('strong');
        action.className = 'mobile-action-bubble';
        action.textContent = mobileAction;
        container.appendChild(action);
      }
      if (cards.length) {
        const label = document.createElement('span');
        label.className = 'play-zone-label';
        if (reveal && state.winner === index) label.textContent = `${player.name}最后一手`;
        else if (reveal) label.textContent = `${player.name}剩余 ${cards.length} 张`;
        else if (!['single', 'pair'].includes(player.lastPatternType)) label.textContent = player.lastAction || '已出牌';
        if (label.textContent) container.appendChild(label);
        const row = document.createElement('div');
        row.className = 'personal-card-row';
        cards.forEach((card) => row.appendChild(this.createCard(card, { micro: cards.length > 10, compact: cards.length <= 10 })));
        container.appendChild(row);
      } else if (reveal && state.winner === index) {
        const winner = document.createElement('strong');
        winner.className = 'winner-empty-hand';
        winner.textContent = '已出完 · 胜方';
        container.appendChild(winner);
      }
    }

    renderHumanHand(state, view) {
      if (!this.handElement) return;
      const focusedId = document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.cardId
        : null;
      this.handElement.replaceChildren();
      const player = state.players[0];
      const sorted = DDZ.Cards.sortCards(player.hand, 'rank');
      this.handElement.classList.toggle('is-compact', sorted.length >= 18);
      this.handElement.classList.toggle('is-ultra-compact', sorted.length >= 20);
      const canSelect = state.phase === 'playing' && state.currentPlayer === 0 && !view.autoPlay;
      sorted.forEach((card, index) => {
        const selected = view.selectedIds.has(card.id);
        this.handElement.appendChild(this.createCard(card, {
          interactive: true,
          selected,
          disabled: !canSelect,
          index,
          count: sorted.length
        }));
      });
      this.handElement.style.setProperty('--hand-count', String(sorted.length));
      this.handElement.setAttribute('aria-label', `麒麟的手牌，共${player.hand.length}张；可点击或按住滑动选择`);
      if (focusedId && global.CSS && CSS.escape) {
        const nextFocus = this.handElement.querySelector(`[data-card-id="${CSS.escape(focusedId)}"]`);
        if (nextFocus && !nextFocus.disabled) nextFocus.focus({ preventScroll: true });
      }
    }

    renderControls(state, view) {
      const bidding = byId('bidding-actions');
      const multipliers = byId('multiplier-actions');
      const playing = byId('playing-actions');
      const humanBidTurn = state.phase === 'bidding' && state.currentPlayer === 0 && !view.autoPlay;
      if (bidding) {
        bidding.hidden = state.phase !== 'bidding';
        bidding.querySelectorAll('[data-bid]').forEach((button) => {
          const score = Number(button.dataset.bid);
          button.disabled = !humanBidTurn || (score > 0 && score <= state.highestBid);
        });
      }
      if (multipliers) {
        multipliers.hidden = state.phase !== 'doubling';
        multipliers.querySelectorAll('[data-multiplier]').forEach((button) => {
          button.disabled = state.phase !== 'doubling' || state.players[0].multiplier !== null || view.autoPlay;
        });
      }
      if (playing) playing.hidden = state.phase !== 'playing';
      const humanPlayTurn = state.phase === 'playing' && state.currentPlayer === 0 && !view.autoPlay;
      const submit = byId('submit-play');
      const pass = byId('pass-play');
      const hint = byId('hint-play');
      if (submit) submit.disabled = !humanPlayTurn || view.selectedIds.size === 0;
      if (pass) pass.disabled = !humanPlayTurn || !state.lastPlay;
      if (hint) hint.disabled = !humanPlayTurn;
    }

    renderSelection(state, view) {
      const element = byId('selection-status');
      if (!element) return;
      if (!view.selectedIds.size) {
        const message = view.autoPlay
          ? '电脑托管中，麒麟将由电脑自动操作'
          : (state.phase === 'playing' && state.currentPlayer === 0
          ? '按住手牌并滑动即可连续选择'
          : (state.phase === 'doubling' ? '请选择本局倍率' : (state.phase === 'landlordReveal' ? '倍率已确定，准备开局' : '等待你的回合')));
        setText(element, message);
        element.classList.remove('is-valid', 'is-invalid');
        return;
      }
      const selected = state.players[0].hand.filter((card) => view.selectedIds.has(card.id));
      const pattern = DDZ.HandAnalyzer.analyzeHand(selected);
      if (pattern.valid) {
        setText(element, `已选 ${selected.length} 张 · ${pattern.name} · 主牌 ${DDZ.Cards.rankLabel(pattern.mainRank)}`);
        element.classList.add('is-valid');
        element.classList.remove('is-invalid');
      } else {
        setText(element, `已选 ${selected.length} 张 · 暂未构成合法牌型`);
        element.classList.add('is-invalid');
        element.classList.remove('is-valid');
      }
    }

    renderPhaseOverlay(state, view) {
      const overlay = byId('phase-overlay');
      const title = byId('phase-overlay-title');
      const number = byId('phase-overlay-number');
      if (!overlay) return;
      if (state.phase === 'bidding') {
        overlay.hidden = false;
        overlay.dataset.tone = 'bidding';
        setText(title, `${state.players[state.currentPlayer].name}叫分倒计时`);
        setText(number, `${view.bidSeconds || 10}`);
      } else if (state.phase === 'doubling') {
        overlay.hidden = false;
        overlay.dataset.tone = 'multiplier';
        setText(title, '选择本局倍率');
        setText(number, `${view.multiplierSeconds || 5}`);
      } else if (state.phase === 'landlordReveal') {
        overlay.hidden = false;
        overlay.dataset.tone = 'landlord';
        setText(title, `${state.players[state.landlordIndex].name}成为地主`);
        setText(number, `${view.revealCountdown || 3}`);
      } else if (state.phase === 'finished') {
        overlay.hidden = false;
        const winnerText = state.result && state.result.winnerRole === 'landlord' ? '地主胜利' : '农民胜利';
        overlay.dataset.tone = state.result && state.result.humanWon ? 'win' : 'lose';
        setText(title, `${winnerText}！`);
        setText(number, Number.isFinite(view.settlementCountdown) ? `${view.settlementCountdown}` : '结算完成');
      } else {
        overlay.hidden = true;
        overlay.dataset.tone = '';
        setText(title, '');
        setText(number, '');
      }
    }

    renderResult(state) {
      if (state.phase !== 'finished' || !state.result) return;
      const modal = byId('modal-result');
      if (!modal) return;
      const title = modal.querySelector('[data-result="title"]');
      const summary = modal.querySelector('[data-result="summary"]');
      const detail = modal.querySelector('[data-result="detail"]');
      const settlement = state.settlement || state.result.settlement;
      const winnerSide = state.result.winnerRole === 'landlord' ? '地主' : '农民';
      const loserSide = state.result.winnerRole === 'landlord' ? '农民' : '地主';
      setText(title, `${winnerSide}胜利！`);
      setText(summary, `${loserSide}失败`);
      if (settlement) {
        const delta = settlement.deltas[0];
        const spring = settlement.springType === 'landlord-spring' ? ' · 春天×2' : (settlement.springType === 'farmer-spring' ? ' · 反春×2' : '');
        const humanMultiplier = settlement.playerMultipliers ? settlement.playerMultipliers[0] : 1;
        setText(detail, `麒麟币 ${delta >= 0 ? '+' : ''}${formatCoins(delta)} · 底注 100 · 叫分×${settlement.multipliers.bid} · 麒麟×${humanMultiplier} · 炸弹×${settlement.multipliers.bombs}${spring} · 余额 ${formatCoins(settlement.balances[0])}`);
      } else {
        setText(detail, `身份：${roleName(state.players[0].role)} · 叫分：${state.result.bid}分 · 炸弹/王炸：${state.result.bombCount}次`);
      }
      const emblem = byId('result-emblem');
      setText(emblem, state.result.humanWon ? '胜' : '败');
      modal.classList.toggle('is-win', state.result.humanWon);
      modal.classList.toggle('is-lose', !state.result.humanWon);
      const restart = byId('result-restart');
      if (restart) {
        const blocked = state.players.some((player) => player.coins <= 0);
        restart.disabled = blocked;
        restart.textContent = blocked ? '麒麟币已用完' : '再来一局';
      }
    }

    showToast(message, tone) {
      const toast = byId('toast');
      if (!toast) return;
      global.clearTimeout(this.toastTimer);
      toast.textContent = message;
      toast.dataset.tone = tone || 'info';
      toast.hidden = false;
      toast.classList.add('is-visible');
      this.toastTimer = global.setTimeout(() => {
        toast.classList.remove('is-visible');
        global.setTimeout(() => { toast.hidden = true; }, 180);
      }, 2400);
    }

    openModal(id) {
      const modal = byId(id);
      if (!modal) return;
      modal.removeAttribute('hidden');
      if (typeof modal.showModal === 'function' && !modal.open) modal.showModal();
      else if (typeof modal.showModal !== 'function') modal.hidden = false;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      const focusTarget = modal.querySelector('[autofocus], button, input, [tabindex="0"]');
      if (focusTarget) global.setTimeout(() => focusTarget.focus(), 0);
    }

    closeModal(id) {
      const modal = byId(id);
      if (!modal) return;
      if (typeof modal.close === 'function') {
        if (modal.open) modal.close();
        modal.removeAttribute('hidden');
      } else modal.hidden = true;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  DDZ.Renderer = Renderer;
})(globalThis);
