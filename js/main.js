/* ---------------------------------------------------------------------------
   Entry point
   --------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const canvas = document.getElementById('game');
  const game = new global.Radius.Game(canvas);
  game.start();

  // Handy for debugging and for the presentation: window.radius.game
  global.radius = { game };
})(window);
