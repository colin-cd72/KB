const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const { authenticate, isTechnician, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/rma');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Status flow
const STATUS_ORDER = ['pending', 'approved', 'shipped', 'received', 'complete'];
const RESOLUTIONS = ['replaced', 'repaired', 'returned'];

// Get all RMAs with filters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      whereClause += ` AND r.status = $${paramCount++}`;
      params.push(status);
    }

    if (search) {
      whereClause += ` AND (
        r.rma_number ILIKE $${paramCount} OR
        r.item_name ILIKE $${paramCount} OR
        r.serial_number ILIKE $${paramCount} OR
        r.part_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT r.*,
             u.name as created_by_name,
             e.name as equipment_name,
             (SELECT COUNT(*) FROM rma_images WHERE rma_id = r.id) as image_count,
             (SELECT file_path FROM rma_images WHERE rma_id = r.id ORDER BY created_at LIMIT 1) as thumbnail
      FROM rmas r
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN equipment e ON r.equipment_id = e.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount}
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) FROM rmas r ${whereClause}
    `, params.slice(0, -2));

    res.json({
      rmas: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    next(error);
  }
});

// Get single RMA with all details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT r.*,
             u.name as created_by_name,
             e.name as equipment_name,
             e.model as equipment_model
      FROM rmas r
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN equipment e ON r.equipment_id = e.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'RMA not found' });
    }

    const rma = result.rows[0];

    // Get images
    const images = await query(`
      SELECT * FROM rma_images WHERE rma_id = $1 ORDER BY created_at
    `, [id]);
    rma.images = images.rows;

    // Get notes
    const notes = await query(`
      SELECT n.*, u.name as user_name
      FROM rma_notes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.rma_id = $1
      ORDER BY n.created_at DESC
    `, [id]);
    rma.notes = notes.rows;

    // Get history
    const history = await query(`
      SELECT h.*, u.name as user_name
      FROM rma_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.rma_id = $1
      ORDER BY h.created_at DESC
    `, [id]);
    rma.history = history.rows;

    res.json(rma);
  } catch (error) {
    next(error);
  }
});

// Create new RMA
router.post('/', authenticate, isTechnician, async (req, res, next) => {
  try {
    const {
      item_name,
      serial_number,
      part_number,
      equipment_id,
      reason,
      description,
      contact_name,
      contact_email,
      contact_phone,
      manufacturer_rma_number
    } = req.body;

    if (!item_name || !reason) {
      return res.status(400).json({ error: 'Item name and reason are required' });
    }

    // Generate RMA number
    const rmaNumberResult = await query('SELECT generate_rma_number() as rma_number');
    const rma_number = rmaNumberResult.rows[0].rma_number;

    const result = await query(`
      INSERT INTO rmas (rma_number, item_name, serial_number, part_number, equipment_id, reason, description, created_by, contact_name, contact_email, contact_phone, manufacturer_rma_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [rma_number, item_name, serial_number, part_number, equipment_id || null, reason, description, req.user.id, contact_name || null, contact_email || null, contact_phone || null, manufacturer_rma_number || null]);

    const rma = result.rows[0];

    // Log creation
    await query(`
      INSERT INTO rma_history (rma_id, user_id, action, new_value)
      VALUES ($1, $2, 'created', $3)
    `, [rma.id, req.user.id, JSON.stringify({ status: 'pending', item_name })]);

    res.status(201).json(rma);
  } catch (error) {
    next(error);
  }
});

// Update RMA
router.put('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      item_name,
      serial_number,
      part_number,
      equipment_id,
      reason,
      description,
      resolution,
      resolution_notes,
      tracking_number,
      manufacturer_rma_number,
      contact_name,
      contact_email,
      contact_phone,
      shipped_at
    } = req.body;

    // Get current RMA
    const current = await query('SELECT * FROM rmas WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'RMA not found' });
    }

    const result = await query(`
      UPDATE rmas SET
        item_name = COALESCE($1, item_name),
        serial_number = COALESCE($2, serial_number),
        part_number = COALESCE($3, part_number),
        equipment_id = $4,
        reason = COALESCE($5, reason),
        description = COALESCE($6, description),
        resolution = COALESCE($7, resolution),
        resolution_notes = COALESCE($8, resolution_notes),
        tracking_number = COALESCE($9, tracking_number),
        manufacturer_rma_number = COALESCE($10, manufacturer_rma_number),
        contact_name = COALESCE($11, contact_name),
        contact_email = COALESCE($12, contact_email),
        contact_phone = COALESCE($13, contact_phone),
        shipped_at = COALESCE($14, shipped_at),
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `, [item_name, serial_number, part_number, equipment_id || null, reason, description, resolution, resolution_notes, tracking_number, manufacturer_rma_number, contact_name, contact_email, contact_phone, shipped_at || null, id]);

    // Log update
    await query(`
      INSERT INTO rma_history (rma_id, user_id, action, old_value, new_value)
      VALUES ($1, $2, 'updated', $3, $4)
    `, [id, req.user.id, JSON.stringify(current.rows[0]), JSON.stringify(result.rows[0])]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update RMA status
router.post('/:id/status', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!STATUS_ORDER.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get current RMA
    const current = await query('SELECT * FROM rmas WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'RMA not found' });
    }

    const oldStatus = current.rows[0].status;

    // Set timestamp fields based on status
    let timestampField = '';
    if (status === 'approved') timestampField = ', approved_at = NOW()';
    else if (status === 'shipped') timestampField = ', shipped_at = NOW()';
    else if (status === 'received') timestampField = ', received_at = NOW()';
    else if (status === 'complete' || status === 'rejected') timestampField = ', completed_at = NOW()';

    const result = await query(`
      UPDATE rmas SET status = $1, updated_at = NOW() ${timestampField}
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    // Log status change
    await query(`
      INSERT INTO rma_history (rma_id, user_id, action, old_value, new_value)
      VALUES ($1, $2, 'status_changed', $3, $4)
    `, [id, req.user.id, oldStatus, status]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Upload image to RMA
router.post('/:id/images', authenticate, isTechnician, upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Verify RMA exists
    const rma = await query('SELECT id FROM rmas WHERE id = $1', [id]);
    if (rma.rows.length === 0) {
      return res.status(404).json({ error: 'RMA not found' });
    }

    const filePath = `/uploads/rma/${req.file.filename}`;

    const result = await query(`
      INSERT INTO rma_images (rma_id, file_path, original_name, file_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, filePath, req.file.originalname, req.file.mimetype]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Link existing image to RMA (from AI analysis)
router.post('/:id/images/link', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { image_path } = req.body;

    if (!image_path) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Verify RMA exists
    const rma = await query('SELECT id FROM rmas WHERE id = $1', [id]);
    if (rma.rows.length === 0) {
      return res.status(404).json({ error: 'RMA not found' });
    }

    // Extract filename from path
    const filename = path.basename(image_path);

    const result = await query(`
      INSERT INTO rma_images (rma_id, file_path, original_name, file_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, image_path, filename, 'image/jpeg']);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// AI analyze image
router.post('/analyze-image', authenticate, isTechnician, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'AI features not configured. Please add Claude API key in Settings.' });
    }

    // Read image and convert to base64
    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype;

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Analyze this image of equipment or a part for RMA (Return Merchandise Authorization) purposes.

Please identify and extract the following information if visible:
1. Serial Number - Look for labels, stickers, or engravings with S/N, Serial, or similar
2. Part Number - Look for P/N, Part No., Model No., or similar identifiers
3. Item/Equipment Name - What type of equipment or part is this?
4. Manufacturer/Brand - Any visible brand names or logos
5. Condition - Describe any visible damage, wear, or issues
6. Additional Details - Any other relevant information visible

Respond in JSON format:
{
  "serial_number": "extracted serial number or null",
  "part_number": "extracted part number or null",
  "item_name": "identified equipment/part name",
  "manufacturer": "brand/manufacturer or null",
  "condition": "description of visible condition",
  "confidence": "high/medium/low",
  "notes": "any additional observations"
}`
            }
          ]
        }
      ]
    });

    const analysisText = response.content[0].text;

    // Try to parse JSON from response
    let analysis;
    try {
      // Extract JSON from response (it might have markdown code blocks)
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = { raw_response: analysisText };
      }
    } catch (e) {
      analysis = { raw_response: analysisText };
    }

    // Return the file path along with analysis
    const filePath = `/uploads/rma/${req.file.filename}`;

    res.json({
      analysis,
      image_path: filePath,
      original_name: req.file.originalname
    });
  } catch (error) {
    console.error('AI image analysis error:', error);
    next(error);
  }
});

// Add note to RMA
router.post('/:id/notes', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const result = await query(`
      INSERT INTO rma_notes (rma_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, req.user.id, content]);

    // Get user name
    const note = result.rows[0];
    note.user_name = req.user.name;

    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

// Delete RMA (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get images to delete files
    const images = await query('SELECT file_path FROM rma_images WHERE rma_id = $1', [id]);

    // Delete from database (cascade will handle related tables)
    await query('DELETE FROM rmas WHERE id = $1', [id]);

    // Delete image files
    images.rows.forEach(img => {
      const filePath = path.join(__dirname, '../..', img.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// AI lookup product info from model/part number with web search verification
router.post('/lookup-model', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { model_number, part_number } = req.body;

    if (!model_number && !part_number) {
      return res.status(400).json({ error: 'Model number or part number is required' });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'AI features not configured. Please add Claude API key in Settings.' });
    }

    const searchTerm = model_number || part_number;
    const client = new Anthropic({ apiKey });

    // Use web search to find and verify the part number
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Search for this part/model number: "${searchTerm}"

I need you to:
1. Search the web to find what product this part number belongs to
2. Verify the results are real products that actually exist
3. If you find multiple possible matches, list them all
4. Include the source URLs where you found the information

After searching, respond with ONLY valid JSON in this exact format:
{
  "suggestions": [
    {
      "item_name": "Full Product Name",
      "manufacturer": "Brand/Manufacturer",
      "part_number": "The actual part number",
      "confidence": "high/medium/low",
      "source_url": "URL where you found this"
    }
  ],
  "search_summary": "Brief explanation of what you found"
}

Rules:
- Only include products you actually found in search results with real URLs
- "high" confidence = exact part number match found on manufacturer or retailer site
- "medium" confidence = partial match or found on forum/secondary source
- "low" confidence = uncertain match, might be similar product
- If nothing found, return empty suggestions array
- List up to 5 possible matches, ordered by confidence`
        }
      ]
    });

    // Extract text response (may have web search results interspersed)
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // Parse JSON from response
    let result;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = { suggestions: [], search_summary: 'Could not parse response' };
      }
    } catch (e) {
      result = { suggestions: [], search_summary: 'Could not parse response' };
    }

    // Ensure suggestions array exists
    if (!result.suggestions) {
      result.suggestions = [];
    }

    res.json(result);
  } catch (error) {
    console.error('AI model lookup error:', error);
    next(error);
  }
});

// Get previous contacts (for auto-suggest)
router.get('/contacts', authenticate, async (req, res, next) => {
  try {
    const { search, part_number } = req.query;

    // First, check if this part number has been sent to a contact before
    let suggestedContact = null;
    if (part_number) {
      const partMatch = await query(`
        SELECT DISTINCT contact_name, contact_email, contact_phone
        FROM rmas
        WHERE part_number ILIKE $1
          AND contact_name IS NOT NULL
          AND contact_name != ''
        ORDER BY MAX(created_at) DESC
        LIMIT 1
      `, [`%${part_number}%`]);

      if (partMatch.rows.length > 0) {
        suggestedContact = partMatch.rows[0];
      }
    }

    // Get all unique contacts for auto-complete
    let contactsQuery = `
      SELECT DISTINCT ON (contact_name, contact_email)
        contact_name, contact_email, contact_phone,
        COUNT(*) as rma_count
      FROM rmas
      WHERE contact_name IS NOT NULL AND contact_name != ''
    `;
    const params = [];

    if (search) {
      contactsQuery += ` AND (
        contact_name ILIKE $1 OR
        contact_email ILIKE $1 OR
        contact_phone ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    contactsQuery += `
      GROUP BY contact_name, contact_email, contact_phone
      ORDER BY contact_name, contact_email, MAX(created_at) DESC
      LIMIT 10
    `;

    const contacts = await query(contactsQuery, params);

    res.json({
      contacts: contacts.rows,
      suggested_contact: suggestedContact
    });
  } catch (error) {
    next(error);
  }
});

// Get RMA report data
router.get('/reports', authenticate, async (req, res, next) => {
  try {
    const { start_date, end_date, status, contact_name, group_by } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (start_date) {
      whereClause += ` AND r.created_at >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ` AND r.created_at <= $${paramCount++}`;
      params.push(end_date + 'T23:59:59');
    }

    if (status) {
      whereClause += ` AND r.status = $${paramCount++}`;
      params.push(status);
    }

    if (contact_name) {
      whereClause += ` AND r.contact_name ILIKE $${paramCount++}`;
      params.push(`%${contact_name}%`);
    }

    // Get detailed RMA data for report
    const rmas = await query(`
      SELECT r.*,
             u.name as created_by_name,
             CASE
               WHEN r.shipped_at IS NOT NULL AND r.received_at IS NOT NULL
               THEN EXTRACT(DAY FROM (r.received_at - r.shipped_at))
               WHEN r.shipped_at IS NOT NULL
               THEN EXTRACT(DAY FROM (NOW() - r.shipped_at))
               ELSE NULL
             END as days_out
      FROM rmas r
      LEFT JOIN users u ON r.created_by = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `, params);

    // Get summary stats
    const summary = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE status = 'received') as received,
        COUNT(*) FILTER (WHERE status = 'complete') as complete,
        AVG(CASE
          WHEN shipped_at IS NOT NULL AND received_at IS NOT NULL
          THEN EXTRACT(DAY FROM (received_at - shipped_at))
          ELSE NULL
        END)::numeric(10,1) as avg_days_out
      FROM rmas r
      ${whereClause}
    `, params);

    // Get by contact summary
    const byContact = await query(`
      SELECT
        contact_name,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'complete') as completed,
        AVG(CASE
          WHEN shipped_at IS NOT NULL AND received_at IS NOT NULL
          THEN EXTRACT(DAY FROM (received_at - shipped_at))
          ELSE NULL
        END)::numeric(10,1) as avg_days_out
      FROM rmas r
      ${whereClause}
      AND contact_name IS NOT NULL AND contact_name != ''
      GROUP BY contact_name
      ORDER BY count DESC
      LIMIT 20
    `, params);

    res.json({
      rmas: rmas.rows,
      summary: summary.rows[0],
      by_contact: byContact.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get RMA statistics
router.get('/stats/summary', authenticate, async (req, res, next) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE status = 'received') as received,
        COUNT(*) FILTER (WHERE status = 'complete') as complete,
        COUNT(*) as total
      FROM rmas
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
