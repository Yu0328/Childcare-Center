# One save per click — Implementation Plan

**Goal:** A double click on any add/save/export/confirm button runs its action once.

**Spec:** `docs/superpowers/specs/2026-09-30-click-once-design.md`

### Task 1: `oneAtATime` helper

- Create `src/ui/oneAtATime.js`, test `tests/oneAtATime.test.js`:
  - a second call while the first is pending is ignored (handler runs once);
  - the clicked button / form submit button is disabled during the run, restored after;
  - a button already disabled before the click stays disabled after;
  - an ignored submit is still `preventDefault`ed;
  - after a rejected run the handler can run again.

### Task 2: apply it

- Wrap every async click/submit handler listed in the spec (`src/ui/*.js`, `src/app.js`).
- Add view-level tests that dispatch two submits/clicks back-to-back and expect one stored record,
  for: add child, add 總表 form, add 總表 entry, confirm import (總表).

### Task 3: verify

- `npx vitest run tests/` green.
- `npm run build`, Playwright: double-click each add button in the real app, one record each.
