import './ui/styles.css';
import { Game } from './core/Game';

const bar = document.getElementById('load-bar') as HTMLElement;
const label = document.getElementById('load-label') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-device');

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  try {
    const game = new Game(canvas, ui);
    (window as unknown as { __bbr: Game }).__bbr = game;
    await game.start((p, text) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      label.textContent = text;
    });
    loading.classList.add('done');
    window.setTimeout(() => loading.remove(), 600);
  } catch (err) {
    console.error(err);
    label.textContent = 'Ay, may error sa pag-load 😭 Try i-refresh or gumamit ng ibang browser (kailangan ng WebGL).';
    loading.classList.add('error');
  }
}

void boot();
