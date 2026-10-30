---
name: game-testing-qa
description: Use when adding features or finishing a milestone — what to unit test, how to run the browser smoke test, how to report results honestly.
---
# Game testing & QA

## When to use
Any feature change; every milestone report.

## Procedure
1. Unit tests (`tests/unit/*.test.ts`, Vitest): pure logic only — movement, collision, AI decisions, scoring, economy, save migration, state machine.
2. Browser smoke test: `npm run build && npx vite preview --port 4173 &` then `npm run test:e2e`.
   - Use `window.__bbr.debugSnapshot()` for assertions; extend it when adding systems.
   - Drive by condition (`holdUntil`) not fixed sleeps — headless runs at ~10 fps with dt clamping.
   - Phones: `hasTouch`, CDP `Input.dispatchTouchEvent` for joystick drags, `page.tap` for buttons.
3. Look at every screenshot in `tests/e2e/screenshots/` — layout, overlap, colours, facing.
4. Manual on a real phone via the Pages URL (or `npm run dev` on LAN).

## Reporting
- List exactly what passed, with numbers. Say what was not tested (e.g. real-device FPS, audio on iOS).
- Never call something "smooth", "60 fps" or "polished" without having measured/seen it.

## Common failures
- Tests that pass only on fast machines (time-based).
- Forgetting console-error checks — keep `no console errors` assertions per viewport.

## Verify
`npm run build`, `npm test`, `npm run test:e2e` all green before pushing.
