(function (global) {
  'use strict';

  function boot() {
    const controller = new global.DDZ.GameController();
    controller.init();
    global.DDZ.app = controller;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(globalThis);
