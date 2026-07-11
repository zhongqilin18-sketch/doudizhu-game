(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  class Interactions {
    constructor(controller) {
      this.controller = controller;
    }

    on(id, eventName, handler) {
      const element = document.getElementById(id);
      if (element) element.addEventListener(eventName, handler);
    }

    bind() {
      this.on('start-game', 'click', () => this.controller.startGame());
      this.on('sort-hand', 'click', () => this.controller.sortHand());
      this.on('hint-play', 'click', () => this.controller.hint());
      this.on('pass-play', 'click', () => this.controller.pass());
      this.on('submit-play', 'click', () => this.controller.submitPlay());
      this.on('restart-game', 'click', () => this.controller.requestRestart());
      this.on('back-menu', 'click', () => this.controller.requestMenu());
      this.on('result-restart', 'click', () => this.controller.restart());
      this.on('result-menu', 'click', () => this.controller.returnToMenu());
      this.on('confirm-ok', 'click', () => this.controller.runConfirmedAction());
      this.on('confirm-cancel', 'click', () => this.controller.renderer.closeModal('modal-confirm'));
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
      this.on('setting-volume', 'input', (event) => {
        const output = document.getElementById('setting-volume-value');
        if (output) output.textContent = `${event.target.value}%`;
      });

      document.querySelectorAll('[data-bid]').forEach((button) => {
        button.addEventListener('click', () => this.controller.bid(Number(button.dataset.bid)));
      });
      document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => this.controller.renderer.closeModal(button.dataset.closeModal));
      });

      const hand = document.getElementById('human-hand');
      if (hand) {
        hand.addEventListener('click', (event) => {
          const card = event.target.closest('[data-card-id]');
          if (card && !card.disabled) this.controller.toggleCard(card.dataset.cardId);
        });
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

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const openModal = document.querySelector('.modal-shell.is-open');
        if (openModal && openModal.id !== 'modal-result') this.controller.renderer.closeModal(openModal.id);
      });
    }
  }

  DDZ.Interactions = Interactions;
})(globalThis);
