import {
  PLAYER_MODE_EDIT,
  PLAYER_MODE_WALK,
  PLAYER_POINTER_LOCK_MESSAGE,
} from './playerConstants.js';

export class ViewModeUi {
  constructor({ root, controller }) {
    this.root = root;
    this.controller = controller;
    const topbar = root.querySelector('.topbar');
    const viewport = root.querySelector('[data-role="viewport"]');
    if (!topbar || !viewport) {
      throw new Error('View mode UI requires the editor topbar and viewport.');
    }

    this.switcher = document.createElement('div');
    this.switcher.className = 'view-mode-switcher';
    this.switcher.setAttribute('aria-label', 'Camera mode');
    this.switcher.innerHTML = `
      <button type="button" data-view-mode="${PLAYER_MODE_EDIT}">Edit / Orbit</button>
      <button type="button" data-view-mode="${PLAYER_MODE_WALK}">Player</button>
    `;
    topbar.prepend(this.switcher);

    this.hud = document.createElement('div');
    this.hud.className = 'player-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = `
      <span class="player-crosshair" aria-hidden="true"></span>
      <div class="player-help" data-role="player-help"></div>
    `;
    viewport.append(this.hud);
    this.help = this.hud.querySelector('[data-role="player-help"]');

    this.onClick = (event) => {
      const button = event.target.closest('[data-view-mode]');
      if (!button) {
        return;
      }
      controller.setMode(button.dataset.viewMode, {
        requestPointerLock: button.dataset.viewMode === PLAYER_MODE_WALK,
      });
    };
    this.switcher.addEventListener('click', this.onClick);
    this.unsubscribe = controller.subscribe((state) => this.render(state));
  }

  render(state) {
    this.root.dataset.viewMode = state.mode;
    for (const button of this.switcher.querySelectorAll('[data-view-mode]')) {
      button.classList.toggle('is-active', button.dataset.viewMode === state.mode);
    }

    const playerMode = state.mode === PLAYER_MODE_WALK;
    this.hud.hidden = !playerMode;
    if (!playerMode) {
      return;
    }

    this.help.textContent = state.player.pointerLocked
      ? 'WASD move · Shift run · Space jump · Esc release mouse'
      : `${PLAYER_POINTER_LOCK_MESSAGE} WASD move · Shift run · Space jump.`;
  }

  dispose() {
    this.unsubscribe?.();
    this.switcher.removeEventListener('click', this.onClick);
    this.switcher.remove();
    this.hud.remove();
    delete this.root.dataset.viewMode;
  }
}
