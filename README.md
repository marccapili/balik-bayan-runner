# Balik Bayan Runner ☀️

A 3D Philippine-history arcade survival game for the browser. Filipino heroes time-travel into a modern
history museum — run from security, grab coins, and discover real history along the way.

**Play:** https://marccapili.github.io/balik-bayan-runner/ (deployed by GitHub Actions on every push to `main`)

## Controls
| | Desktop | Phone |
|---|---|---|
| Move | WASD / Arrow keys | Drag anywhere on the left side (floating joystick) |
| Pause | Esc / P | ❚❚ button |
| Preview other heroes (dev) | 1–4 | Tap the hero chip |
| FPS meter | F (or `?debug` in URL) | `?debug` in URL |

## Setup
```bash
npm ci
npm run dev        # http://localhost:5173 (also on your LAN — open it on your phone)
npm run build      # production build in dist/
npm test           # unit tests
npx vite preview --port 4173 & npm run test:e2e   # browser smoke test + screenshots
```

## Deploying
Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck → unit tests → build → GitHub Pages.
If Pages isn't enabled yet: repo **Settings → Pages → Source: GitHub Actions**.
Any static host works too — upload the `dist/` folder (paths are relative).

## Docs
- `docs/DESIGN.md` — design summary & milestone plan
- `docs/CHANGELOG.md` — what's done, what was tested, known issues
- `docs/ASSETS.md` — asset sources & licenses
- `CLAUDE.md` + `.claude/skills/` — guidance for continued development with Claude Code
