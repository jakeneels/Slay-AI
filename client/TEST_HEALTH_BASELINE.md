# Test Health Baseline

Snapshot date: 2026-02-17

## Coverage snapshot (latest local artifact)

- Overall statements: 33.47% (`850/2539`)
- Core statements: 96.18% (`706/734`)
- Rendering statements: 0% (`0/666`)
- Data statements: 96.18% (`126/131`)

Sources:
- `client/coverage/index.html`
- `client/coverage/client/src/core/index.html`
- `client/coverage/client/src/rendering/index.html`

## Test inventory

- Unit tests: 15 files under `client/src/__tests__/`
- Framework: Vitest (`jsdom`)
- E2E tests: none (no Playwright/Cypress config)
- CI workflows: none under `.github/workflows/`

## Risk matrix (scope vs confidence)

| Scope | Current confidence | Risk | Why |
| --- | --- | --- | --- |
| Combat core (`core/combat.ts`) | High | P1 | Large suite exists, but one skipped enemy-turn case remains. |
| Status/block/deck/card core | High | P2 | Well-covered unit behavior and stable helper tests. |
| Wave generation (`core/waveGenerator.ts`) | Low | P0 | No direct tests for budget jitter, force-inclusion, composition rerolls. |
| Wave transition (`core/waveTransition.ts`) | Low | P0 | No direct tests for wave reset, spawn invariants, or cleanup. |
| Pre-fight (`core/preFight.ts`) | Low | P0 | No direct tests for lineup validity/deck shaping and transition correctness. |
| Modifier registry (`core/modifiers.ts`) | Low | P0 | No direct tests for op ordering/scope/condition semantics. |
| Rendering (`src/rendering/*`) | Low | P1 | Mostly utility checks; functional render paths untested in aggregate. |
| Delivery gates (CI, coverage thresholds) | Low | P1 | No PR automation or enforced thresholds. |

## Immediate action priorities

1. Add direct tests for `waveGenerator`, `waveTransition`, `preFight`, and `modifiers`.
2. Turn on full-source coverage accounting and thresholds in Vitest.
3. Add CI workflow with lint/typecheck/test/coverage.
4. Add renderer/hand integration tests and remove skipped core test.
5. Remove hardcoded debug telemetry calls from runtime combat/wave path.
