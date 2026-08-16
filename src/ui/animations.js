(function (global) {
  'use strict';

  const DDZ = (global.DDZ = global.DDZ || {});

  class Animator {
    constructor() {
      this.enabled = true;
      this.fxToken = 0;
      this.reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    setEnabled(value) {
      this.enabled = Boolean(value);
      document.documentElement.classList.toggle('animations-off', !this.enabled);
      if (!this.enabled) {
        this.fxToken += 1;
        const layer = document.getElementById('fx-layer');
        if (layer) {
          layer.classList.remove('fx-bomb', 'fx-rocket', 'fx-plane');
          layer.replaceChildren();
        }
      }
    }

    _pulse(element, className, duration) {
      if (!element || !this.enabled || this.reducedMotion) return;
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      global.setTimeout(() => element.classList.remove(className), duration || 450);
    }

    deal() {
      const table = document.getElementById('game-table');
      if (table) table.classList.remove('result-win', 'result-lose');
      this._pulse(document.getElementById('game-table'), 'is-dealing', 950);
    }

    play(playerIndex) {
      this._pulse(document.getElementById(`play-zone-${Number.isInteger(playerIndex) ? playerIndex : 0}`), 'cards-enter', 420);
    }

    special(pattern) {
      if (!pattern || !this.enabled) return;
      let kind = null;
      if (pattern.type === 'rocket') kind = 'rocket';
      else if (pattern.type === 'bomb') kind = 'bomb';
      else if (String(pattern.type).startsWith('plane')) kind = 'plane';
      if (!kind) return;

      const layer = document.getElementById('fx-layer');
      const table = document.getElementById('game-table');
      if (!layer) return;
      const token = ++this.fxToken;
      layer.classList.remove('fx-bomb', 'fx-rocket', 'fx-plane');
      layer.replaceChildren();
      const visual = document.createElement('span');
      visual.className = `fx-visual fx-visual-${kind}`;
      visual.textContent = kind === 'rocket' ? '🚀' : (kind === 'bomb' ? '💣' : '✈️');
      const word = document.createElement('strong');
      word.className = 'fx-special-word';
      word.textContent = kind === 'rocket' ? '王炸！火箭升空' : (kind === 'bomb' ? '炸弹！' : '飞机起飞！');
      layer.append(visual, word);
      void layer.offsetWidth;
      layer.classList.add(`fx-${kind}`);
      if (kind !== 'plane') this._pulse(table, 'table-shake', 560);
      global.setTimeout(() => {
        if (token !== this.fxToken) return;
        layer.classList.remove(`fx-${kind}`);
        layer.replaceChildren();
      }, kind === 'rocket' ? 1550 : 1250);
    }

    invalid() {
      this._pulse(document.getElementById('human-hand'), 'hand-shake', 360);
    }

    result(humanWon) {
      const table = document.getElementById('game-table');
      if (table) {
        table.classList.toggle('result-win', Boolean(humanWon));
        table.classList.toggle('result-lose', !humanWon);
      }
      this._pulse(document.querySelector('#modal-result .modal-card'), 'result-pop', 520);
    }
  }

  DDZ.Animator = Animator;
})(globalThis);
