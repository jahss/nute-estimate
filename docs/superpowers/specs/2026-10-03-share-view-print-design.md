# Shareable View Snapshots and Print-Ready Reports

Date: 2026-10-03

## Summary

Add a frozen, read-only sharing mode and a print-ready report mode to the existing static nutrient calculator without introducing a backend.

The editor remains the normal interactive experience. A new **Share View** action serializes the current formula and presentation choices into a versioned snapshot embedded in the URL hash. Opening that URL reconstructs the exact snapshot, switches the app into read-only view mode, and exposes only report-oriented actions such as **Print / Save PDF** and **Copy Link**.

The same read-only view becomes the source for a dedicated print stylesheet so browser printing produces a polished landscape report rather than a printout of the editor UI.

## Goals

- Preserve the current editable calculator as the default experience.
- Create frozen, shareable snapshot links that do not change when the editor is modified later.
- Freeze both formula data and presentation choices.
- Keep snapshot links self-contained and backend-free.
- Render snapshots as read-only reports.
- Produce a clean, print-ready layout for paper or PDF.
- Keep old snapshot versions loadable as the app evolves.

## Non-goals

- No accounts, authentication, permissions, or true access control.
- No database, server, or external storage.
- No mutable shared documents.
- No short-link service.
- No revocation or expiration.
- No collaborative editing or revision history.
- No guarantee that a technically knowledgeable user cannot alter a copied snapshot URL.

## Current Architecture

The app is a single static HTML document deployed on GitHub Pages. Application state lives in browser JavaScript and drives the nutrient register, timeline, day card, batching table, totals, language, unit presentation, and nutrient order.

The new feature should preserve that architecture. Snapshot generation and restoration happen entirely in the browser.

## Product Model

The application gains two runtime modes:

### Edit mode

Normal visits without a valid snapshot open the existing editor.

Edit mode retains:
- nutrient add/delete
- drag reorder
- rate/type editing
- window editing
- language controls
- dry/liquid display-unit controls
- all current interactive timeline behavior
- Share View
- Print / Save PDF if desired

### View mode

Visits with a valid snapshot open a read-only report.

View mode:
- loads state from the snapshot instead of defaults
- freezes language and unit presentation to the saved values
- displays nutrient values as plain read-only content
- hides add/delete/reorder/edit controls
- hides language and display-unit controls
- keeps Print / Save PDF
- keeps Copy Link
- preserves the timeline and batching report content
- does not write changes back into the snapshot

View mode is a presentation constraint, not a security boundary.

## Snapshot Contents

Snapshots store only source state and presentation choices, never derived calculations.

Version 1 stores:

```text
v
days
gal
lang
dryUnit
liquidUnit
nutrients[]
  name
  rate
  kind
  start
  end
  color
```

The nutrient array order is significant and must be preserved.

Derived values such as total required, phases, daily mixes, timeline geometry, and grand totals are recomputed on load from the frozen inputs.

Internal runtime-only fields such as temporary drag state or pinned hover state are not required in the snapshot.

## Snapshot Versioning

Every snapshot contains a numeric version field, beginning with `v: 1`.

Decoding dispatches by version. Version 1 remains supported after future editor changes. New optional fields added in later versions must receive explicit defaults when loading older snapshots.

Unsupported future versions must fail clearly rather than silently falling back to the editable default state.

## URL Format

Use the URL hash fragment so the snapshot stays fully client-side:

```text
https://jahss.github.io/nute-estimate/#view=<encoded-snapshot>
```

The hash is preferred because:
- GitHub Pages requires no route handling
- no backend is needed
- the snapshot is not sent to the host as part of the normal HTTP request path
- normal editor URLs remain unchanged

The snapshot payload is compact JSON encoded into a URL-safe string using browser-native APIs. No dependency is added.

## Share View Flow

When the user clicks **Share View**:

1. Normalize the current editable state into the versioned snapshot schema.
2. Include the currently active language, dry unit, liquid unit, nutrient order, colors, cycle length, reservoir volume, rates, types, and windows.
3. Serialize the snapshot.
4. Encode it into the URL hash.
5. Build the full view URL.
6. Copy the URL to the clipboard.
7. Show the existing toast pattern confirming that the view link was copied.

Creating a new snapshot does not modify previously shared URLs.

## Snapshot Load Flow

At startup:

1. Inspect the URL hash.
2. If no `view` snapshot exists, continue with the existing edit-mode boot path.
3. If a snapshot exists, decode it.
4. Validate the decoded data.
5. Load normalized state.
6. Apply the frozen language and dry/liquid unit choices.
7. Enter view mode before rendering interactive controls.
8. Recompute all derived calculations from the restored state.
9. Render the read-only report.

The app must not silently use defaults when a view snapshot was present but invalid.

## Validation

Snapshot decoding must validate:
- supported version
- finite positive cycle length
- finite non-negative gallons/day
- supported language
- supported dry unit
- supported liquid unit
- nutrient array shape
- nutrient names as strings
- finite non-negative rates
- kind as dry or liquid
- finite start/end values
- valid color strings within the app's accepted representation

The decoder should normalize safe values where practical but reject malformed payloads that cannot represent a valid formula.

## Invalid Snapshot State

If the URL contains a malformed, truncated, or unsupported snapshot, replace the calculator body with a clear report-style error state:

**This snapshot link is invalid or unsupported.**

The page should still allow navigation back to the normal editor.

Do not silently load the built-in formula, because that could make a broken link appear to represent a valid shared recipe.

## Read-Only Rendering

View mode should reuse the existing rendering functions and calculations rather than maintaining a second independent report implementation.

Editing controls become non-interactive presentation:

- nutrient names render as text
- rates render with frozen `g/gal` or `mL/gal`
- windows render as text
- add/delete controls are hidden
- reorder handles are hidden
- editable day/gallon inputs render as text
- language and display-unit selectors are hidden
- timeline hover/pin interactions may remain if they do not imply editability

This keeps one source of truth for calculations and reduces drift between editor and report.

## View Actions

View mode exposes two primary actions:

- **Print / Save PDF** — invokes the browser print dialog.
- **Copy Link** — copies the current snapshot URL exactly as opened.

No edit button is required for the first version. A future **Open as editable copy** action could be added without changing snapshot semantics.

## Print Design

Use a dedicated `@media print` stylesheet layered on the read-only view.

Target presentation:
- landscape orientation
- compact report margins
- no editor controls
- no sticky positioning
- no horizontal scroll containers
- no hover-only affordances
- clean page breaks
- tables expanded to their printable width
- readable headers repeated where browser support allows
- restrained borders and typography consistent with the existing visual identity

### Printed content order

1. Report header
   - Nutrient Batch Ledger
   - cycle length
   - gallons/day
   - total solution volume
   - frozen language and display units if useful as metadata

2. Nutrient schedule
   - nutrient
   - rate
   - window
   - days used
   - total required

3. Application windows
   - existing timeline reformatted for print width
   - labels remain visible

4. Batching phases
   - phase
   - days
   - length
   - volume
   - one nutrient column per saved nutrient order

5. Totals
   - dry total
   - liquid total
   - relevant frozen display units

6. Footer
   - generated-from note
   - snapshot URL text only if it can be included without making the report unreadable

The print layout should prioritize readability over exact screen layout.

## State and Calculation Rules

Snapshot mode must continue to use the same existing calculation functions for:
- effective nutrient windows
- row totals
- phase boundaries
- daily mixes
- dry totals
- liquid totals

Snapshot support must not introduce a second calculation path.

## Language Behavior

The saved language is part of the snapshot and is frozen in view mode.

The existing translation layer should apply after snapshot state is loaded. View mode must not expose the language toggle.

Version 1 supports the same language values already supported by the editor.

## Unit Behavior

The saved dry and liquid display units are part of the snapshot and frozen in view mode.

Dry options:
- g
- kg
- lb
- oz

Liquid options:
- mL
- L
- gal
- fl oz

Rates remain expressed in their nutrient type's per-gallon base unit:
- dry: g/gal
- liquid: mL/gal

## Compatibility and Migration

Version 1 links must keep working after unrelated UI changes.

Future schema changes should:
- preserve the versioned decoder
- provide migration/default logic for older snapshots
- avoid removing interpretation rules for previously issued snapshot versions unless explicitly deprecated

The snapshot schema should remain smaller and more stable than the runtime application state.

## Security and Privacy Characteristics

The snapshot is encoded, not encrypted.

Anyone with the link can view and decode its contents. The link must not be described as private, protected, or tamper-proof.

No snapshot data is intentionally sent to an application backend because no backend exists.

## Testing Strategy

Add small tests around the stable snapshot boundary rather than duplicating UI coverage.

Required test coverage:

1. **Round trip**
   - serialize a mixed dry/liquid formula
   - decode it
   - verify all frozen state and presentation fields survive exactly

2. **Frozen presentation**
   - language, dry unit, and liquid unit restore from the snapshot
   - view mode does not expose their selectors

3. **Nutrient order**
   - reordered nutrients round-trip in the same order

4. **Malformed snapshot**
   - bad encoding, malformed JSON, missing required fields, and unsupported versions show the invalid-snapshot state

5. **Normal editor regression**
   - a normal URL still boots into the editable calculator with the existing defaults and controls

6. **Read-only regression**
   - a valid view URL does not expose add/delete/reorder/input controls

7. **Print regression**
   - print CSS removes interactive controls and sticky/scroll behavior while keeping report sections visible

## Implementation Boundaries

Expected changes should remain within the current static application unless implementation reveals a concrete reason otherwise.

Likely files:
- `index.html`
- optional small test file if separating snapshot encode/decode improves testability

Do not introduce a framework, storage service, or backend for version 1.

## Acceptance Criteria

The feature is complete when:

- the editor can generate a frozen Share View URL
- opening that URL reproduces the exact saved formula and presentation choices
- subsequent edits in the source editor do not affect the shared link
- the snapshot opens read-only
- language and dry/liquid display units are frozen
- nutrient order is preserved
- malformed snapshots fail visibly
- normal visits remain editable
- Print / Save PDF produces a clean report layout without editor controls
- current dry/liquid calculations, timeline, batching phases, and mobile behavior remain intact
