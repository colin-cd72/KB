const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, isViewer, isTechnician } = require('../middleware/auth');

const router = express.Router();

// Detail lists are capped so a bad data day can't return an unbounded payload.
const DETAIL_CAP = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Surface data-quality problems in the active equipment set.
router.get('/issues', authenticate, isViewer, async (req, res, next) => {
  try {
    // Asset tags held by more than one active row. There are only a
    // handful of these in practice, so every colliding tag is returned.
    // An empty/whitespace tag is not a real tag (see untagged below) and
    // must never form a collision group of its own.
    const collisionsResult = await query(
      `SELECT asset_tag,
              json_agg(
                json_build_object(
                  'id', id, 'name', name, 'model', model,
                  'serial_number', serial_number, 'location', location
                ) ORDER BY id
              ) AS units
         FROM equipment
        WHERE is_active = true AND asset_tag IS NOT NULL AND btrim(asset_tag) <> ''
        GROUP BY asset_tag
       HAVING count(*) > 1
        ORDER BY asset_tag`
    );

    // Active rows with no usable asset tag. Production has no unique index
    // on asset_tag yet, so an empty-string value is possible and must be
    // treated the same as NULL here.
    const untaggedCount = await query(
      `SELECT count(*) FROM equipment WHERE is_active = true AND (asset_tag IS NULL OR btrim(asset_tag) = '')`
    );
    const untaggedSample = await query(
      `SELECT id, name, model
         FROM equipment
        WHERE is_active = true AND (asset_tag IS NULL OR btrim(asset_tag) = '')
        ORDER BY id
        LIMIT $1`,
      [DETAIL_CAP]
    );
    const untaggedTotal = parseInt(untaggedCount.rows[0].count, 10);

    // Active rows with no usable name.
    const blankNamesCount = await query(
      `SELECT count(*) FROM equipment WHERE is_active = true AND (name IS NULL OR btrim(name) = '')`
    );
    const blankNamesRows = await query(
      `SELECT id, model, serial_number, asset_tag
         FROM equipment
        WHERE is_active = true AND (name IS NULL OR btrim(name) = '')
        ORDER BY id
        LIMIT $1`,
      [DETAIL_CAP]
    );
    const blankNamesTotal = parseInt(blankNamesCount.rows[0].count, 10);

    // Serial numbers shared by more than one active row. NULL, blank, and
    // 'N/A' (case-insensitive) are placeholders, not real duplicates.
    const duplicateSerialsResult = await query(
      `SELECT serial_number,
              json_agg(
                json_build_object(
                  'id', id, 'name', name, 'model', model, 'asset_tag', asset_tag
                ) ORDER BY id
              ) AS rows
         FROM equipment
        WHERE is_active = true
          AND serial_number IS NOT NULL
          AND btrim(serial_number) <> ''
          AND upper(btrim(serial_number)) <> 'N/A'
        GROUP BY serial_number
       HAVING count(*) > 1
        ORDER BY serial_number
        LIMIT $1`,
      [DETAIL_CAP]
    );

    // Active rows with no usable serial number.
    const missingSerialsCount = await query(
      `SELECT count(*)
         FROM equipment
        WHERE is_active = true
          AND (serial_number IS NULL
               OR btrim(serial_number) = ''
               OR upper(btrim(serial_number)) = 'N/A')`
    );

    res.json({
      collisions: collisionsResult.rows,
      untagged: {
        count: untaggedTotal,
        sample: untaggedSample.rows,
        truncated: untaggedTotal > DETAIL_CAP,
      },
      blank_names: {
        count: blankNamesTotal,
        rows: blankNamesRows.rows,
        truncated: blankNamesTotal > DETAIL_CAP,
      },
      duplicate_serials: duplicateSerialsResult.rows,
      missing_serials: {
        count: parseInt(missingSerialsCount.rows[0].count, 10),
        truncated: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Resolve an asset-tag collision by keeping the tag on one row and
// clearing it from every other active row currently holding it.
router.post('/resolve-collision', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { tag, keep_id: keepId } = req.body;

    if (typeof tag !== 'string' || tag.trim() === '' ||
        typeof keepId !== 'string' || keepId.trim() === '') {
      return res.status(400).json({ error: 'tag and keep_id are required' });
    }

    if (!UUID_RE.test(keepId)) {
      return res.status(400).json({ error: 'keep_id must be a valid equipment id' });
    }

    // Check-then-update inside one transaction so a concurrent resolution
    // can't slip in between the precondition check and the clear.
    const cleared = await transaction(async (client) => {
      const holder = await client.query(
        `SELECT id FROM equipment WHERE id = $1 AND asset_tag = $2 AND is_active = true`,
        [keepId, tag]
      );

      if (holder.rows.length === 0) {
        const err = new Error(
          `keep_id ${keepId} does not currently hold asset tag ${tag}; refresh and try again`
        );
        err.statusCode = 409;
        throw err;
      }

      const result = await client.query(
        `UPDATE equipment SET asset_tag = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE asset_tag = $1 AND id <> $2 AND is_active = true`,
        [tag, keepId]
      );

      return result.rowCount;
    });

    res.json({ kept: keepId, tag, cleared });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
