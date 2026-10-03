# Multi-Window Share View and Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-window nutrient schedules, frozen read-only share links, and a polished print/PDF report while keeping the GitHub Pages app backend-free.

**Architecture:** Keep `index.html` as the UI shell, but move schedule/snapshot rules into a small dependency-free `app-core.js` that works in both browsers and Node tests. The editor stores each nutrient as nutrient-level identity plus `windows[]`; all timeline/day/phase/total logic reads those windows, while nutrient array order remains manual mixing order. Snapshot URLs serialize only source state + presentation settings into `#view=<payload>`; view mode reuses the same render/calculation path with editing controls suppressed, and print mode is CSS-only.

**Tech Stack:** Static HTML/CSS/vanilla JavaScript, GitHub Pages, Node built-in `node:test`; no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-share-view-print-design.md`

## Global Constraints

- No accounts, authentication, permissions, database, server, external storage, or backend for version 1.
- Snapshot links are frozen, self-contained, versioned, encoded but not encrypted.
- Nutrient array order is the user-controlled mixing order and must never be auto-sorted by window dates.
- Windows within one nutrient are schedule segments and may be sorted chronologically by start day.
- Gaps are valid pauses; adjacent windows are valid; overlapping windows are invalid and excluded from calculations until corrected.
- All windows for one nutrient share that nutrient's dry/liquid type.
- Editor, snapshot view, and print report share one calculation path.
- View mode freezes formula, language, dry unit, liquid unit, nutrient order, colors, and windows.
- Print output uses the view/report presentation and removes editor controls, sticky positioning, and horizontal scrolling.
- Do not add a framework or runtime library.

## Review Focus

- **Three-way overlap:** if several windows overlap, every conflicting window must be marked invalid/excluded, not just the first pair. Task 1 tests this in `evaluateWindows()`.
- **Cycle shrink:** a previously valid window that moves outside the shortened cycle must remain in state, become invalid, and stop contributing to totals. Task 2 tests/validates this through the editor-to-core integration.
- **Adjacent rate change:** `1–14 @ 6` followed by `15–28 @ 4` must create a phase boundary at day 15 even though the nutrient never pauses. Task 1 tests this in `computePhases()`.
- **Unicode snapshot data:** Chinese nutrient names and frozen Chinese presentation must survive snapshot encode/decode exactly. Task 3 tests the codec round trip.
- **Zero rate:** rate `0` is valid, remains visible/active for schedule semantics, contributes zero amount, and must not be treated as incomplete. Task 1 tests validation and totals.

---

### Task 1: Pure multi-window schedule core and test harness

**Files:**
- Create: `app-core.js`
- Create: `tests/app-core.test.js`
- Create: `package.json`

**Interfaces:**
- Produces: `NuteCore.sortWindowsByStart(windows) -> Window[]`
- Produces: `NuteCore.evaluateWindows(windows, days) -> WindowEvaluation[]`
- Produces: `NuteCore.activeWindowAt(nutrient, day, days) -> Window|null`
- Produces: `NuteCore.nutrientStats(nutrient, days, gal) -> {activeDays,total,validWindowCount}`
- Produces: `NuteCore.computePhases(nutrients, days) -> Phase[]`
- `app-core.js` exposes `window.NuteCore` in browsers and `module.exports` in Node.

- [ ] **Step 1: Add the failing schedule-core tests**

In `tests/app-core.test.js`, use `node:test` + `node:assert/strict` and add tests named:

```js
test('sortWindowsByStart keeps nutrient order irrelevant and sorts only windows', ...)
test('evaluateWindows accepts gaps and adjacent windows', ...)
test('evaluateWindows rejects every member of overlapping windows', ...)
test('evaluateWindows rejects out-of-cycle windows without deleting them', ...)
test('nutrientStats sums active days and amount across valid windows', ...)
test('nutrientStats accepts a zero rate', ...)
test('activeWindowAt returns the matching rate segment for the day', ...)
test('computePhases splits on adjacent rate changes', ...)
```

Use a representative nutrient with windows `1–14 @ 6`, `15–28 @ 4`, gap `29–35`, `36–63 @ 5`. Assert active days = `56` and total at `300 gal/day` = `(14*6 + 14*4 + 28*5)*300`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/app-core.test.js`

Expected: FAIL because `../app-core.js` or the required functions do not exist.

- [ ] **Step 3: Implement the minimal pure schedule core**

Create `app-core.js` with the exact interfaces above.

Rules pinned by the spec:
- integer day bounds
- `1 <= start <= end <= days`
- finite `rate >= 0`
- overlap detection is per nutrient
- adjacent windows do not overlap
- `sortWindowsByStart` returns a sorted copy and does not mutate the nutrient array
- invalid windows are preserved in evaluations but ignored by stats/active-window/phase math
- `computePhases` returns maximal day ranges where the active nutrient+window/rate set is unchanged

- [ ] **Step 4: Add package test command**

Create `package.json` with no dependencies and:

```json
{
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 5: Run the schedule tests GREEN**

Run: `npm test`

Expected: all Task 1 tests PASS, zero failures.

- [ ] **Step 6: Commit**

```bash
git add app-core.js tests/app-core.test.js package.json
git commit -m "Add multi-window schedule core"
```

### Task 2: Migrate the editor and calculations to `windows[]`

**Files:**
- Modify: `index.html` (state/defaults, nutrient register, calculations, timeline, day card, phases, tally, summary, translations)
- Modify: `tests/app-core.test.js` only if an integration-facing core regression needs pinning

**Interfaces:**
- Consumes: all Task 1 `NuteCore` schedule APIs.
- Produces: browser state shape `nutrient = {id,name,kind,color,windows:[{rate,start,end},...]}`.
- Produces: inline `Add window` / remove-window UI.
- Preserves: existing nutrient drag order as mixing order.

- [ ] **Step 1: Add failing source/integration assertions for the new state shape and controls**

Extend `tests/app-core.test.js` with a source-level test that reads `index.html` and asserts:
- `<script src="app-core.js"></script>` is loaded before the app script
- defaults use `windows:[...]`, not nutrient-level `rate/start/end`
- register markup/code includes `add-window` and `remove-window`
- nutrient drag code still exists

Run: `npm test`

Expected: FAIL on the HTML assertions.

- [ ] **Step 2: Migrate defaults and calculations**

Modify `index.html` to:
- load `app-core.js`
- convert each current default nutrient to one window, preserving the exact current schedules
- replace single-window helpers with Task 1 core calls
- derive row total and active days from `nutrientStats`
- derive day mix from `activeWindowAt`
- derive phase boundaries/rates from `computePhases`
- sum dry/liquid totals from all valid windows

Keep `state.nutrients` order untouched by all schedule normalization.

- [ ] **Step 3: Implement inline multi-window editing**

In the register:
- keep nutrient identity/type/reorder/delete on the parent row
- show first rate/window inline
- render additional windows as compact indented rows
- add **Add window** under/within the nutrient group
- remove-window is available for additional windows
- if removing would leave zero windows, replace with one blank/default window rather than deleting the nutrient
- after start-day editing completes, sort only that nutrient's `windows[]` by start day and rebuild the group
- overlap/out-of-cycle/incomplete windows get an inline invalid state and reason
- invalid windows remain editable and visible

- [ ] **Step 4: Update timeline, day card, phases, summary**

Ensure:
- timeline renders multiple bars on one nutrient row
- each bar label uses its own window rate
- day tooltip/card uses the active window's rate
- batching phases use the active window's rate per nutrient
- copied text summary prints one line per window plus aggregate nutrient totals
- nutrient ordering everywhere still follows `state.nutrients`

- [ ] **Step 5: Add/adjust bilingual strings**

Add EN/ZH strings for:
- Add window
- Remove window
- overlapping window
- outside cycle
- incomplete window

Do not expose a separate window reorder interaction.

- [ ] **Step 6: Run tests and syntax checks**

Run: `npm test`

Expected: PASS.

Run a JavaScript syntax parse for both `app-core.js` and inline scripts (for example `node -c app-core.js` plus a small Node extraction/check for inline scripts).

Expected: zero syntax errors.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/app-core.test.js
git commit -m "Add multi-window nutrient editing"
```

### Task 3: Versioned frozen snapshot codec

**Files:**
- Modify: `app-core.js`
- Modify: `tests/app-core.test.js`

**Interfaces:**
- Produces: `NuteCore.createSnapshot({days,gal,lang,dryUnit,liquidUnit,nutrients}) -> SnapshotV1`
- Produces: `NuteCore.encodeSnapshot(snapshot) -> string`
- Produces: `NuteCore.decodeSnapshot(encoded) -> SnapshotV1`
- Produces: `NuteCore.parseViewHash(hash) -> {mode:'edit'}|{mode:'view',snapshot:SnapshotV1}`
- Errors: malformed/unsupported snapshots throw an error carrying a stable `code` suitable for UI handling.

- [ ] **Step 1: Add failing snapshot tests**

Add tests for:
- mixed dry/liquid + multiple windows round trip
- nutrient mixing order preserved exactly
- windows normalized chronologically without changing nutrient order
- Chinese nutrient names and `lang:'zh'` survive exactly
- dry/liquid presentation units survive exactly
- malformed base64/JSON rejected
- missing required fields rejected
- overlapping windows rejected as invalid snapshot data
- unsupported `v` rejected
- empty/no `#view=` returns edit mode

Run: `npm test`

Expected: FAIL because snapshot APIs do not exist.

- [ ] **Step 2: Implement snapshot schema + codec**

Implement version `1` only.

Snapshot fields:
`v, days, gal, lang, dryUnit, liquidUnit, nutrients[{name,kind,color,windows[{rate,start,end}]}]`.

Use compact JSON plus browser-native UTF-8/base64url conversion. Do not serialize runtime IDs, pinned day, derived totals, phases, or chart geometry.

Validate supported values:
- `lang`: `en|zh`
- `dryUnit`: `g|kg|lb|oz`
- `liquidUnit`: `ml|l|gal|floz`
- nutrient kind: `dry|liquid`
- at least one window per nutrient
- window values satisfy Task 1 validity/non-overlap rules

- [ ] **Step 3: Run codec tests GREEN**

Run: `npm test`

Expected: all schedule + snapshot tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app-core.js tests/app-core.test.js
git commit -m "Add frozen snapshot codec"
```

### Task 4: Share View and read-only runtime mode

**Files:**
- Modify: `index.html`
- Modify: `tests/app-core.test.js`

**Interfaces:**
- Consumes: Task 3 `createSnapshot`, `encodeSnapshot`, `parseViewHash`.
- Produces: Edit-mode **Share View** action.
- Produces: View-mode **Print / Save PDF** and **Copy Link** actions.
- Produces: invalid snapshot error state with navigation back to normal editor.

- [ ] **Step 1: Add failing HTML/source assertions**

Assert in tests that `index.html` contains:
- `Share View`
- startup call/path through `parseViewHash(location.hash)`
- view-mode class or attribute (choose exactly `body.view-mode`)
- `Print / Save PDF`
- `Copy Link`
- invalid snapshot copy: `This snapshot link is invalid or unsupported.`

Run: `npm test`

Expected: FAIL.

- [ ] **Step 2: Implement startup mode selection**

Before the first full render:
- parse `location.hash`
- normal/no snapshot => existing editable defaults
- valid snapshot => replace formula/presentation state from snapshot, assign runtime IDs, set `body.view-mode`
- invalid snapshot => render the explicit invalid-link state; never fall back to defaults

Apply frozen language and unit selectors before report rendering.

- [ ] **Step 3: Implement Share View**

In edit mode:
- add **Share View**
- call `createSnapshot` with current state + presentation
- encode to `#view=<payload>`
- copy the full URL
- use the existing toast system for confirmation
- do not navigate away from the editor when sharing

- [ ] **Step 4: Implement view-only presentation**

Under `body.view-mode`:
- replace or visually render inputs as plain report values
- hide add/delete/window edit/reorder/language/unit controls
- retain report/timeline/day/phase content
- show **Print / Save PDF** => `window.print()`
- show **Copy Link** => copy `location.href`
- do not mutate the frozen snapshot state through report interactions

- [ ] **Step 5: Run tests and manual URL round trip**

Run: `npm test`

Expected: PASS.

Manual check:
1. create a formula with a dry nutrient, liquid nutrient, a paused multi-window nutrient, Chinese name, custom units, and reordered nutrients
2. generate Share View
3. open generated URL
4. verify read-only state exactly matches source snapshot
5. change editor afterward and confirm the old URL is unchanged

- [ ] **Step 6: Commit**

```bash
git add index.html tests/app-core.test.js
git commit -m "Add frozen share view mode"
```

### Task 5: Print/PDF report styling

**Files:**
- Modify: `index.html`
- Modify: `tests/app-core.test.js`

**Interfaces:**
- Consumes: `body.view-mode` from Task 4.
- Produces: dedicated `@media print` landscape report.
- Preserves: nutrient mixing order and per-nutrient multi-window lines.

- [ ] **Step 1: Add failing print-source assertions**

Assert that `index.html` contains a print stylesheet with:
- `@media print`
- `@page` landscape
- hiding interactive controls
- resetting sticky positioning
- removing horizontal scrolling
- print-visible nutrient schedule, timeline, phases, and totals

Run: `npm test`

Expected: FAIL on missing print rules.

- [ ] **Step 2: Implement the print layout**

Add print CSS that:
- uses landscape orientation and compact margins
- hides Share/Copy/Print buttons and all editor-only controls
- removes sticky positioning from register/phase columns
- sets scroll wrappers to visible overflow
- preserves colors where browsers allow `print-color-adjust`
- avoids splitting nutrient groups awkwardly where practical
- keeps timeline labels visible
- keeps phase table headers readable/repeatable
- prints dry/liquid totals separately
- keeps the visual identity restrained and report-like

Ensure multi-window nutrient schedule prints one rate/window line per segment, with aggregate days and total for the nutrient.

- [ ] **Step 3: Verify print preview manually**

From a representative snapshot URL, open browser print preview and verify:
- no editor controls
- no clipped table columns
- no horizontal scrollbar artifacts
- timeline fits
- multi-window schedule is legible
- batching phases retain nutrient mixing order
- totals are present
- Save as PDF preview is usable without manual page surgery

- [ ] **Step 4: Run full tests**

Run: `npm test`

Expected: PASS, zero failures.

Run JavaScript syntax checks again.

Expected: zero syntax errors.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/app-core.test.js
git commit -m "Add print-ready snapshot report"
```

### Task 6: Final regression and deployment verification

**Files:**
- Modify: `README.md` only if the public usage instructions need Share View / Print additions.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified main-branch release behavior.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS, zero failures.

- [ ] **Step 2: Run final behavior checklist**

Verify:
- current default V/F/R schedules remain unchanged after migration
- nutrient drag reorder still works desktop/touch and controls mixing order
- multi-window Add/remove/edit works
- window chronology never reorders nutrients
- overlaps visibly invalidate only schedule segments and exclude them from math
- dry/liquid unit behavior remains correct
- mobile frozen nutrient/phase columns still work in edit mode
- snapshot preserves formula + presentation
- malformed snapshot shows explicit error
- view mode is read-only
- print preview is report-ready

- [ ] **Step 3: Update README if needed and commit**

If user-facing controls changed enough to warrant documentation, add a concise Share View / Print note.

```bash
git add README.md
git commit -m "Document share and print workflow"
```

Skip the commit if README needs no change.

- [ ] **Step 4: Push/deploy and verify GitHub Pages**

Confirm the deployment workflow for the final commit concludes successfully, then open the live GitHub Pages URL and exercise one normal edit URL plus one frozen snapshot URL.

Expected: both load successfully and match the verified behavior above.
