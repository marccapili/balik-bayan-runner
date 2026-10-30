---
name: mobile-game-ui-ux
description: Use when building or changing HTML/CSS overlays — lobby, HUD, panels, buttons, joystick, responsive layout, Gen Z copy.
---
# Mobile game UI/UX

## When to use
Lobby, HUD, shop, missions, pause, results, settings, touch controls, any copywriting.

## Procedure
1. UI is HTML/CSS in `#ui` over the canvas (`src/ui/`). Styles in `ui/styles.css` using the CSS variables in `:root`.
2. Containers have `pointer-events: none`; interactive elements opt back in with `pointer-events: auto`.
3. Buttons use `data-act` + one delegated click handler per component. **Every visible button must do something.**
4. Touch targets ≥ 44 px; respect `env(safe-area-inset-*)`; test 844×390 landscape and 390×844 portrait.
5. Keep the left 55% of the screen free during play (joystick zone); action buttons go bottom-right.
6. Copy: playful Taglish (e.g. "Tuloy na! ▶", "Chill lang"), short. History text stays formal and accurate.

## Standards
- Fonts: Baloo 2 (display), Poppins (body). Colours: midnight, gold, flag red/blue.
- Animations ≤ 250 ms for taps; honour `prefers-reduced-motion`.
- States: selected, locked (🔒 + price), owned, disabled must look different.

## Common failures
- Overlay swallowing touches meant for the joystick.
- Text overflow on 360 px wide phones — use `clamp()` and ellipsis.
- Focus not moved to the primary button when a modal opens (keyboard users).

## Verify
E2E taps every button in both phone viewports; screenshots reviewed for overlap/cut-off text.
