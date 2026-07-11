(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  const PHASE_NAMES = Object.freeze({
    menu: '主菜单',
    bidding: '叫地主',
    playing: '出牌中',
    finished: '本局结束'
  });

  const DIFFICULTY_NAMES = Object.freeze({ easy: '简单', normal: '普通', hard: '困难' });

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(element, value) {
    if (element) element.textContent = value == null ? '' : String(value);
  }

  function field(panel, name) {
    return panel ? panel.querySelector(`[data-field="${name}"]`) : null;
  }

  function roleName(role) {
    if (role === 'landlord') return '地主';
    if (role === 'farmer') return '农民';
    return '身份待定';
  }

  function cardAria(card, selected) {
    return `${card.displayName}，${selected ? '已选中' : '未选中'}`;
  }

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
        config.compact ? 'is-compact' : '',
        config.selected ? 'is-selected' : ''
      ].filter(Boolean).join(' ');
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
      card.innerHTML = '<span class="card-back-mark" aria-hidden="true">云</span>';
      return card;
    }

    render(state, view) {
      this.showScreen(state.phase === 'menu' ? 'menu' : 'game');
      if (state.phase === 'menu') return;

      setText(byId('phase-chip'), PHASE_NAMES[state.phase] || state.phase);
      setText(byId('game-difficulty'), DIFFICULTY_NAMES[state.difficulty] || '普通');
      const bidText = state.phase === 'bidding'
        ? `当前最高 ${state.highestBid || '无人叫分'}`
        : `本局叫分 ${state.highestBid || 1} 分`;
      setText(byId('bid-summary'), bidText);
      setText(byId('table-message'), view.thinking || state.message);

      this.renderBottomCards(state);
      state.players.forEach((player, index) => this.renderPlayer(state, player, index, view));
      this.renderLastPlay(state);
      this.renderHumanHand(state, view);
      this.renderControls(state, view);
      this.renderSelection(state, view);
      this.renderResult(state);
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
      const label = byId('bottom-label');
      setText(label, state.bottomRevealed ? '已揭晓' : '待揭晓');
    }

    renderPlayer(state, player, index, view) {
      const panel = byId(`player-${index}`);
      if (!panel) return;
      panel.classList.toggle('is-active', state.currentPlayer === index && state.phase !== 'finished');
      panel.classList.toggle('is-landlord', player.role === 'landlord');
      panel.classList.toggle('is-thinking', Boolean(view.thinking) && state.currentPlayer === index);
      setText(field(panel, 'name'), player.name);
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
      if (state.phase === 'finished') setText(status, '本局结束');
      else if (state.currentPlayer === index) setText(status, view.thinking ? '思考中' : (player.isHuman ? '请出牌' : '行动中'));
      else setText(status, '等待中');
      const action = player.lastAction || (player.bid !== null ? (player.bid === 0 ? '不叫' : `${player.bid}分`) : '');
      setText(field(panel, 'action'), action);
      const actionElement = field(panel, 'action');
      if (actionElement) actionElement.hidden = !action;
      const activeText = field(panel, 'active');
      setText(activeText, state.currentPlayer === index && state.phase !== 'finished' ? '行动中' : '');

      const backs = field(panel, 'cards');
      if (backs && !player.isHuman) {
        backs.replaceChildren();
        const visible = Math.min(7, player.hand.length);
        for (let cardIndex = 0; cardIndex < visible; cardIndex += 1) backs.appendChild(this.createCardBack(true));
      }
    }

    renderLastPlay(state) {
      const label = byId('last-play-label');
      const container = byId('last-play-cards');
      if (!container) return;
      container.replaceChildren();
      if (!state.lastPlay) {
        setText(label, state.phase === 'playing' ? '新一轮 · 可自由出牌' : '等待地主产生');
        container.classList.add('is-empty');
        return;
      }
      container.classList.remove('is-empty');
      const player = state.players[state.lastPlay.playerIndex];
      setText(label, `${player.name} · ${state.lastPlay.pattern.name}`);
      const compact = state.lastPlay.cards.length > 10;
      state.lastPlay.cards.forEach((card) => container.appendChild(this.createCard(card, { compact })));
    }

    renderHumanHand(state, view) {
      if (!this.handElement) return;
      const focusedId = document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.cardId
        : null;
      this.handElement.replaceChildren();
      const player = state.players[0];
      const sorted = DDZ.Cards.sortCards(player.hand, view.sortMode);
      const canSelect = state.phase === 'playing' && state.currentPlayer === 0;
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
      this.handElement.setAttribute('aria-label', `你的手牌，共${player.hand.length}张`);
      if (focusedId) {
        const nextFocus = this.handElement.querySelector(`[data-card-id="${CSS.escape(focusedId)}"]`);
        if (nextFocus && !nextFocus.disabled) nextFocus.focus({ preventScroll: true });
      }
    }

    renderControls(state, view) {
      const bidding = byId('bidding-actions');
      const playing = byId('playing-actions');
      const humanBidTurn = state.phase === 'bidding' && state.currentPlayer === 0;
      if (bidding) {
        bidding.hidden = state.phase !== 'bidding';
        bidding.querySelectorAll('[data-bid]').forEach((button) => {
          const score = Number(button.dataset.bid);
          button.disabled = !humanBidTurn || (score > 0 && score <= state.highestBid);
        });
      }
      if (playing) playing.hidden = state.phase !== 'playing';
      const humanPlayTurn = state.phase === 'playing' && state.currentPlayer === 0;
      const submit = byId('submit-play');
      const pass = byId('pass-play');
      const hint = byId('hint-play');
      const sort = byId('sort-hand');
      if (submit) submit.disabled = !humanPlayTurn || view.selectedIds.size === 0;
      if (pass) pass.disabled = !humanPlayTurn || !state.lastPlay;
      if (hint) hint.disabled = !humanPlayTurn;
      if (sort) {
        sort.disabled = state.phase !== 'playing';
        sort.setAttribute('aria-label', view.sortMode === 'rank' ? '当前按牌力排序，点击改为按花色排序' : '当前按花色排序，点击改为按牌力排序');
        const label = sort.querySelector('[data-label]');
        setText(label || sort, view.sortMode === 'rank' ? '按花色' : '按牌力');
      }
    }

    renderSelection(state, view) {
      const element = byId('selection-status');
      if (!element) return;
      if (!view.selectedIds.size) {
        setText(element, state.phase === 'playing' && state.currentPlayer === 0 ? '点击手牌进行选择' : '等待你的回合');
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

    renderResult(state) {
      if (state.phase !== 'finished' || !state.result) return;
      const modal = byId('modal-result');
      if (!modal) return;
      const title = modal.querySelector('[data-result="title"]');
      const summary = modal.querySelector('[data-result="summary"]');
      const detail = modal.querySelector('[data-result="detail"]');
      setText(title, state.result.humanWon ? '漂亮，赢下这一局！' : '这局惜败');
      setText(summary, `${state.result.winnerRole === 'landlord' ? '地主' : '农民'}阵营获胜`);
      setText(detail, `你的身份：${roleName(state.players[0].role)} · 叫分：${state.result.bid}分 · 炸弹/王炸：${state.result.bombCount}次`);
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
      } else {
        modal.hidden = true;
      }
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  DDZ.Renderer = Renderer;
})(globalThis);
