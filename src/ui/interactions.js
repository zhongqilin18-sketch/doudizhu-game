(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  class Interactions {
    constructor(controller) {
      this.controller = controller;
      this.drag = null;
      this.longPressTimer = null;
      this.suppressClickUntil = 0;
    }

    on(id, eventName, handler, options) {
      const element = document.getElementById(id);
      if (element) element.addEventListener(eventName, handler, options);
    }

    bind() {
      this.on('start-game', 'click', () => this.controller.startGame());
      this.on('hint-play', 'click', () => this.controller.hint());
      this.on('pass-play', 'click', () => this.controller.pass());
      this.on('submit-play', 'click', () => this.controller.submitPlay());
      this.on('restart-game', 'click', () => this.controller.requestRestart());
      this.on('toggle-autoplay', 'click', () => this.controller.toggleAutoplay());
      this.on('back-menu', 'click', () => this.controller.requestMenu());
      this.on('result-restart', 'click', () => this.controller.restart());
      this.on('result-menu', 'click', () => this.controller.returnToMenu());
      this.on('confirm-ok', 'click', () => this.controller.runConfirmedAction());
      this.on('confirm-cancel', 'click', () => this.controller.renderer.closeModal('modal-confirm'));
      this.on('reset-coins', 'click', (event) => {
        event.preventDefault();
        this.controller.resetCoins();
      });
      this.on('open-rules', 'click', () => this.controller.renderer.openModal('modal-rules'));
      this.on('open-settings', 'click', () => {
        this.controller.syncSettingsControls();
        this.controller.renderer.openModal('modal-settings');
      });
      this.on('open-rules-game', 'click', () => this.controller.renderer.openModal('modal-rules'));
      this.on('open-settings-game', 'click', () => {
        this.controller.syncSettingsControls();
        this.controller.renderer.openModal('modal-settings');
      });
      this.on('save-settings', 'click', () => this.controller.saveSettingsFromDialog());
      this.on('game-sound', 'click', () => this.controller.toggleQuickAudio('sound'));
      this.on('game-music', 'click', () => this.controller.toggleQuickAudio('music'));

      this.on('menu-sound', 'change', (event) => this.controller.setMenuAudio('sound', event.target.checked));
      this.on('menu-music', 'change', (event) => this.controller.setMenuAudio('music', event.target.checked));
      this.on('menu-card-counter', 'change', (event) => this.controller.setCardCounter(event.target.checked));
      this.on('setting-sound-volume', 'input', (event) => {
        const output = document.getElementById('setting-sound-volume-value');
        if (output) output.textContent = `${event.target.value}×`;
        this.controller.previewVolume('soundVolume', event.target.value);
      });
      this.on('setting-music-volume', 'input', (event) => {
        const output = document.getElementById('setting-music-volume-value');
        if (output) output.textContent = `${event.target.value}×`;
        this.controller.previewVolume('musicVolume', event.target.value);
      });

      document.querySelectorAll('[data-bid]').forEach((button) => {
        button.addEventListener('click', () => this.controller.bid(Number(button.dataset.bid)));
      });
      document.querySelectorAll('[data-multiplier]').forEach((button) => {
        button.addEventListener('click', () => this.controller.chooseMultiplier(Number(button.dataset.multiplier)));
      });
      document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => {
          if (button.dataset.closeModal === 'modal-settings') this.controller.cancelSettings();
          else this.controller.renderer.closeModal(button.dataset.closeModal);
        });
      });

      const hand = document.getElementById('human-hand');
      if (hand) this.bindHand(hand);

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const openModal = document.querySelector('.modal-shell.is-open');
        if (openModal && openModal.id !== 'modal-result') {
          if (openModal.id === 'modal-settings') this.controller.cancelSettings();
          else this.controller.renderer.closeModal(openModal.id);
        }
      });
    }

    bindHand(hand) {
      hand.addEventListener('click', (event) => {
        if (Date.now() < this.suppressClickUntil) {
          event.preventDefault();
          return;
        }
        const card = event.target.closest('[data-card-id]');
        if (card && !card.disabled) this.controller.toggleCard(card.dataset.cardId);
      });

      hand.addEventListener('pointerdown', (event) => {
        const card = event.target.closest('[data-card-id]');
        if (!card || card.disabled || event.button > 0) return;
        this.drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          firstCard: card,
          select: !this.controller.selectedIds.has(card.dataset.cardId),
          active: true,
          visited: new Set()
        };
        this.activateDrag(hand);
      });

      hand.addEventListener('pointermove', (event) => {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        this.applyDragAt(hand, event.clientX, event.clientY);
      });

      const finish = (event) => {
        if (!this.drag || this.drag.pointerId !== event.pointerId) return;
        const wasActive = this.drag.active;
        this.cancelDrag(wasActive);
        if (wasActive) {
          this.suppressClickUntil = Date.now() + 450;
          this.controller.finishDragSelection();
        }
      };
      hand.addEventListener('pointerup', finish);
      hand.addEventListener('pointercancel', finish);

      hand.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const cards = [...hand.querySelectorAll('[data-card-id]:not(:disabled)')];
        if (!cards.length) return;
        const currentIndex = Math.max(0, cards.indexOf(document.activeElement));
        let nextIndex = currentIndex;
        if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
        if (event.key === 'ArrowRight') nextIndex = Math.min(cards.length - 1, currentIndex + 1);
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = cards.length - 1;
        event.preventDefault();
        cards[nextIndex].focus();
      });
    }

    activateDrag(hand) {
      if (!this.drag) return;
      this.drag.active = true;
      hand.classList.add('is-drag-selecting');
      try { hand.setPointerCapture(this.drag.pointerId); } catch (error) { /* not required */ }
      this.applyCardDuringDrag(this.drag.firstCard);
    }

    applyDragAt(hand, x, y) {
      const target = document.elementFromPoint(x, y);
      const card = target && target.closest ? target.closest('[data-card-id]') : null;
      if (card && hand.contains(card) && !card.disabled) this.applyCardDuringDrag(card);
    }

    applyCardDuringDrag(card) {
      if (!this.drag || !card || this.drag.visited.has(card.dataset.cardId)) return;
      this.drag.visited.add(card.dataset.cardId);
      if (!this.controller.setCardSelected(card.dataset.cardId, this.drag.select, false)) return;
      card.classList.toggle('is-selected', this.drag.select);
      card.setAttribute('aria-pressed', String(this.drag.select));
      card.setAttribute('aria-label', card.getAttribute('aria-label').replace(this.drag.select ? '未选中' : '已选中', this.drag.select ? '已选中' : '未选中'));
    }

    cancelLongPress() {
      if (this.longPressTimer) global.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    cancelDrag(active) {
      this.cancelLongPress();
      const hand = document.getElementById('human-hand');
      if (hand) {
        hand.classList.remove('is-drag-selecting');
        if (this.drag) {
          try { hand.releasePointerCapture(this.drag.pointerId); } catch (error) { /* not required */ }
        }
      }
      if (!active) this.drag = null;
      else this.drag = null;
    }
  }

  DDZ.Interactions = Interactions;
})(globalThis);
