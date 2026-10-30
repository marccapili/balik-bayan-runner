import { LOBBY } from '../data/lobby';

/**
 * Full-screen time-portal wipe used between the lobby and the museum.
 * `cover()` swirls the portal open over the screen; `reveal()` collapses it to show the new scene.
 */
export class Transition {
  private readonly el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'portal-wipe';
    this.el.innerHTML = '<div class="pw-swirl"></div><div class="pw-ring"></div><div class="pw-flash"></div>';
    host.appendChild(this.el);
  }

  private run(cls: string, seconds: number): Promise<void> {
    this.el.style.setProperty('--pw-dur', `${seconds}s`);
    this.el.className = `portal-wipe ${cls}`;
    return new Promise((r) => window.setTimeout(r, seconds * 1000));
  }

  cover(): Promise<void> {
    return this.run('covering', LOBBY.portalIn);
  }

  async reveal(): Promise<void> {
    await this.run('revealing', LOBBY.portalOut);
    this.el.className = 'portal-wipe';
  }

  get busy(): boolean {
    return this.el.classList.contains('covering') || this.el.classList.contains('revealing');
  }
}
