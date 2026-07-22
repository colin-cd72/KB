# Inventory: Asset Tags + Scan-to-Register

**Date:** 2026-07-22
**Status:** Draft — awaiting review
**Scope:** Asset tags and the scan flow only. Recovery of other dropped import columns is explicitly out of scope.

## Problem

The Equipment registry has no asset number. The `equipment` table carries `name`, `model`,
`serial_number`, `manufacturer`, `location`, `description`, `qr_code`, image paths, and an
unused `custom_fields` JSONB. The only identifier the system owns is `qr_code`
(`KB-A1B2C3D4`), which the app generates at creation time — it corresponds to nothing
physically attached to the equipment.

TMRW applies pre-printed barcode stickers from a bulk roll. Those numbers exist in the
source spreadsheet but were discarded on import. Registering equipment today means typing
six fields by hand.

## Goals

1. Store the asset tag from the physical sticker as a first-class, unique field.
2. Backfill the tags that already exist in the source spreadsheet.
3. Let a technician scan a tag with a phone, photograph the unit, and have AI pre-populate
   the fields for human confirmation.

## Non-goals

- Recovering the other 24 dropped spreadsheet columns (Parent/Slot/Port, Type, Status,
  dates, MAC addresses). Documented below for a future project.
- Rewriting the CSV/XLSX importer.
- Generating or printing tags. Tags are externally sourced; the app only ever receives them.

## Prerequisites (blocking)

These must be resolved before the AI portion can be built or tested.

1. **`CLAUDE_API_KEY` is invalid in production.** The key in `backend/.env` is well-formed
   (`sk-ant-api03-`, 108 chars) but rejected with `authentication_error`. Confirmed in the
   live `kb` pm2 logs. All 14 Claude call sites are currently failing: AI search, solution
   suggestion, import column mapping, product image lookup, screenshot capture. Failures are
   silent because every call site catches and returns an empty result. A working key is
   required.

2. **Barcode symbology is unknown.** The physical roll's encoding (Code 39 vs Code 128 vs
   other) determines scanner configuration. Data format is known: 3–6 digit numeric,
   typically 4 digits zero-padded (`0075`).

## Findings that shaped this design

Measured against production (`82.25.86.219`) and
`D:\Fat Brain\Business\TMRW Sports\Asset Management\TMRW ASSET MANAGEMENT.xlsx`.

### The spreadsheet is the import source, and the join is positional

The sheet has 2,068 rows (2,067 data + header); the `equipment` table has exactly 2,067
rows. Every row has a distinct `created_at`, so ordering is deterministic.

Comparing the DB `Model` sequence (ordered by `created_at, id`) against sheet row order:
**2,067 of 2,067 match.** The one apparent mismatch is sheet row 1945, which contains a date
in the Model column — Excel stores it as serial `45659`, which is exactly what the DB holds.

The importer preserved sheet order, including 53 entirely blank rows that became empty
equipment records.

**This positional join is the backfill key.** Coverage comparison for the 374 clean tags:

| Join key | Coverage |
|---|---|
| Position (`created_at, id` ↔ sheet row) | **374 / 374 (100%)** |
| `serial_number` | 335 (90%) |
| `name` / Mnemonic, unique values only | 169 (45%) |

Positional joining is only valid while neither side has been reordered. See Backfill below.

### The tag column is dirty

The Asset Tag column has 559 non-empty values, but only 397 are genuine tags:

| Value | Rows | Handling |
|---|---:|---|
| 3–6 digit numeric | 397 | Genuine tag |
| `N/A` | 155 | Not a tag. Consumables — CABLE, XLR, CAT6, BNC, LED, power cords |
| `Removed` | 4 | Decommission status recorded in the wrong column |
| `IDF-04`, `FUTURE` | 3 | Location / placeholder |
| `` `0550 `` | 1 | Leading-backtick Excel text artifact; real value `0550` |

Of the 397 genuine tags, 384 values are distinct. **10 values collide across 23 rows** and
must not be auto-imported:

- `0438` × 5 — FS-HD-1 through FS-HD-5, five distinct units sharing one tag
- `0018`, `0019`, `0047`, `0071`, `0072`, `0157`, `0477`, `0480`, `0530` — × 2 each

**374 tags import cleanly.** 23 rows require human resolution.

### Other dropped columns (context, not scope)

| Column | Rows | Note |
|---|---:|---|
| Type | 2,008 | Hardware / Software / Consumable |
| Status | 1,471 | |
| Date Received / Installed | 1,454 / 1,433 | |
| Parent / Slot / Port | 896 / 804 / 262 | Rack topology (`FRM-401.03`, slot `1/2`) |
| MAC addresses, QTY, SIZE, COLOR, NOTE | 7–195 | |

Eight further columns are entirely empty and represent no data loss.

Because the positional join is exact, any of these can be recovered later by the same
mechanism.

## Design

### Schema

```sql
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(32);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS asset_photo_path TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ai_identification JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_asset_tag_key
  ON equipment (asset_tag) WHERE asset_tag IS NOT NULL;
```

`asset_tag` is nullable — most equipment is untagged and will stay that way until physically
tagged. The partial unique index enforces uniqueness only over rows that have one.

`asset_photo_path` is deliberately distinct from the existing `image_url` and `image_path`,
which hold the vendor's marketing image fetched by `imageService`. "What this unit looks
like in our rack" and "what this product looks like in the catalog" are different facts.

`ai_identification` records what Claude proposed, its confidence, and when — so a field
value's provenance (typed by a human vs. accepted from AI) is auditable later. This matters
most for serial numbers.

Tags are stored canonically as the digits with leading zeros preserved (`0075`), matching
what is printed on the sticker.

### Backfill

A one-off script, `backend/scripts/backfill-asset-tags.js`, run manually.

1. **Verify the join before writing anything.** Re-run the positional model comparison. If
   the match rate is below 100%, abort and report. The join is only valid while neither side
   has been reordered, and this precondition is what makes it safe.
2. Read the sheet, normalize each Asset Tag: strip leading backtick/apostrophe, trim, reject
   anything not matching `^\d{3,6}$`.
3. Drop values in the not-a-tag set (`N/A`, `Removed`, `FUTURE`, `IDF-04`).
4. Exclude the 10 colliding values entirely; write them to a report file for human
   resolution.
5. Write the remaining 374 in a single transaction.
6. Emit a summary: rows written, rows skipped by reason, collisions deferred.

The script is idempotent and never overwrites a non-null `asset_tag`.

### Backend

**New — `backend/src/services/visionService.js`**

`identifyFromPhoto(buffer, mediaType)` → single Claude vision call returning
`{ manufacturer, model, name, serial_number, label_text, confidence, reasoning }`.

Deliberately separate from `imageService.js`, which runs the opposite direction (model name
in → product image out). Same equipment domain, inverse transform, independently testable.

The prompt carries TMRW's vendor context — Ross Video, Blackmagic Design, AJA, FS.com
already appear in `imageService.js:44-48`.

The model does two things in one call: transcribe visible label/spec-plate text, and
identify the product from physical appearance. Each cross-checks the other; a transcribed
serial plus a recognized chassis is more trustworthy than either alone.

Uses structured outputs rather than the `text.match(/\{[\s\S]*\}/)` JSON-scraping repeated
across the existing call sites.

**Endpoints**

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/equipment/asset-tag/:tag` | Look up by tag. Mirrors the existing `GET /api/equipment/qr/:code` at `equipment.js:122`. 404 if unknown. |
| `POST` | `/api/equipment/identify` | Multipart photo in, AI proposal out. **Writes nothing.** |
| `POST` | `/api/equipment` | Extended to accept `asset_tag` and the photo. 409 on duplicate tag. |
| `PATCH` | `/api/equipment/:id/asset-tag` | Bind a tag to an existing asset. |

### Frontend

New route `frontend/src/pages/ScanAsset.jsx`, mobile-first.

`Equipment.jsx` is untouched. At 1,778 lines it already carries the list, add/edit modal,
CSV import, QR display, detail view, and image upload; a phone camera flow does not belong
in it.

Barcode decoding prefers the native `BarcodeDetector` API where available (Chrome/Android)
and falls back to `@zxing/browser` for Safari/iOS. One new frontend dependency.

**Flow**

```
scan tag ──> known? ──yes──> open that asset
             │
             no
             ↓
      new asset or bind to existing?
             │
     ┌───────┴────────┐
   bind             register
     │                  │
   photo ──> AI ──> shortlist   photo ──> AI ──> prefilled form
   from 2,067 records            │
     │                           │
   pick row ──> bind tag      confirm ──> save
```

The bind path matters because 1,693 assets are already in the database untagged. For the
foreseeable future, "attach a tag to something already recorded" is the common case and
"register something new" is the exception. The AI step turns "which of 2,067 records is this
box?" into a filtered shortlist.

### The rule governing AI output

**Nothing the AI produces is saved without a human confirming it.** The review form
pre-fills, marks which fields came from AI, and requires an explicit save.

Low confidence means fields are shown as suggestions and not pre-filled.

This matters most for `serial_number`. A hallucinated serial that enters the database
silently is worse than a blank field — it is a wrong fact that looks like a real one, and it
will surface months later inside an RMA claim.

### Failure modes

| Failure | Behavior |
|---|---|
| Camera denied / unavailable | Manual tag entry. The whole flow works without a camera. |
| Barcode won't decode (worn, glare) | Manual entry, same form. |
| `CLAUDE_API_KEY` unset | Blank form, no AI step. Follows the existing `getClient()` null pattern. |
| Claude errors or times out | Blank form. Registering an asset never blocks on AI. |
| Low confidence | Suggestions shown, fields not pre-filled. |
| Tag already registered | 409, with an offer to open the existing asset. |
| Tag collides during backfill | Excluded, written to the report, never guessed. |

## Testing

- `visionService` against fixture photos: clear label, worn label, no label, non-equipment.
- Tag normalization: backtick stripping, `N/A` / `Removed` / `FUTURE` rejection, zero-padding
  preserved, 3–6 digit boundaries.
- Backfill: join-verification precondition fails closed; idempotent re-run writes nothing;
  the 10 known collisions are excluded.
- Partial unique index rejects duplicates, permits multiple nulls.
- Duplicate scan returns 409.
- Full no-AI-key path, since that is the degraded mode most likely to occur in the field.

## Out of scope, but found

Recorded here so it is not lost:

1. **`backend/src/routes/search.js:258`** selects `s.rating as solution_rating`. The
   `solutions` table has `rating_sum` and `rating_count` (`migrate.js:78-79`); there is no
   `rating` column. The "similar issues" panel throws on every search:
   `Similar issues query error: column s.rating does not exist`. One-line fix.

2. **All 14 Claude call sites** are pinned to `claude-sonnet-4-20250514`, a deprecated model
   whose published retirement date has passed. Vision requires a current model
   (`claude-sonnet-5` or `claude-opus-4-8`) regardless of what the rest of the app uses.

3. **~53 empty equipment records** exist from blank spreadsheet rows imported as rows.

4. **424 equipment records have a blank `name`**, the field the UI uses as the primary
   display identifier.

5. **Sheet row 1945** has a date in the Model column.

6. `custom_fields` (JSONB) exists on `equipment` and is used by zero rows.
