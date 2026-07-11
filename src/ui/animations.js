(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  class Animator {
    constructor() {
      this.enabled = true;
      this.reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    setEnabled(value) {
      this.enabled = Boolean(value);
      document.documentElement.classList.toggle('animations-off', !this.enabled);
    }

    _pulse(element, className, duration) {
      if (!element || !this.enabled || this.reducedMotion) return;
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      global.setTimeout(() => element.classList.remove(className), duration || 450);
    }

    deal() {
      this._pulse(document.getElementById('game-table'), 'is-dealing', 950);
    }

    play() {
      this._pulse(document.getElementById('last-play-cards'), 'cards-enter', 320);
    }

    special(pattern) {
      if (!pattern || !['bomb', 'rocket'].includes(pattern.type)) return;
      const layer = document.getElementById('fx-layer');
      const table = document.getElementById('game-table');
      if (layer) layer.textContent = pattern.type === 'rocket' ? '王 炸' : '炸 弹';
      this._pulse(layer, 'fx-burst', 650);
      this._pulse(table, 'table-shake', 430);
    }

    invalid() {
      this._pulse(document.getElementById('human-hand'), 'hand-shake', 360);
    }

    result() {
      this._pulse(document.querySelector('#modal-result .modal-card'), 'result-pop', 420);
    }
  }

  DDZ.Animator = Animator;
})(globalThis);
