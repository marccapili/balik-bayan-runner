import './ui/styles.css';
import './ui/polish.css';
import { Game } from './core/Game';
import { installIconizer } from './ui/icons';

const bar = document.getElementById('load-bar') as HTMLElement;
const label = document.getElementById('load-label') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-device');
installIconizer();

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  try {
    const game = new Game(canvas, ui);
    (window as unknown as { __bbr: Game }).__bbr = game;
    const needsTap = await game.start((p, text) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      label.textContent = text;
    });
    const close = (): void => {
      loading.classList.add('done');
      window.setTimeout(() => loading.remove(), 600);
    };
    if (!needsTap) return close();
    // Phones only allow sound after a tap, so the lore intro starts from this button.
    loading.classList.add('ready');
    const btn = document.getElementById('load-start') as HTMLButtonElement;
    btn.focus();
    let started = false;
    const go = (): void => {
      if (started) return;
      started = true;
      void game.beginLore().then(close);
    };
    btn.addEventListener('click', go);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') go();
    });
  } catch (err) {
    console.error(err);
    label.textContent = 'Ay, may error sa pag-load 😭 Try i-refresh or gumamit ng ibang browser (kailangan ng WebGL).';
    loading.classList.add('error');
  }
}

void boot();
