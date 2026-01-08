const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, isTechnician, isViewer, isAdmin } = require('../middleware/auth');
const { suggestColumnMappings, searchEquipmentManual, matchManualToEquipment } = require('../services/claudeService');
const { fetchEquipmentImage } = require('../services/imageService');

// Configure multer for Excel file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/imports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `import-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv'
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all equipment
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, location, sortBy = 'name', sortOrder = 'asc' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE is_active = true';
    const params = [];
    let paramCount = 1;

    if (search) {
      whereClause += ` AND (name ILIKE $${paramCount} OR model ILIKE $${paramCount} OR serial_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (location) {
      whereClause += ` AND location ILIKE $${paramCount++}`;
      params.push(`%${location}%`);
    }

    // Validate sort column to prevent SQL injection
    const validSortColumns = ['name', 'model', 'location', 'manufacturer', 'serial_number', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const sortDirection = sortOrder === 'desc' ? 'DESC' : 'ASC';

    params.push(limit, offset);

    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open', 'in_progress')) as open_issue_count,
              (SELECT COUNT(*) FROM manuals WHERE equipment_id = e.id) as manual_count
       FROM equipment e
       ${whereClause}
       ORDER BY e.${sortColumn} ${sortDirection} NULLS LAST
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM equipment e ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      equipment: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get equipment by QR code
router.get('/qr/:code', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open', 'in_progress')) as open_issue_count
       FROM equipment e
       WHERE e.qr_code = $1`,
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get single equipment
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.*, u.name as created_by_name
       FROM equipment e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    // Get recent issues
    const issues = await query(
      `SELECT id, title, status, priority, created_at
       FROM issues
       WHERE equipment_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.params.id]
    );

    // Get related manuals
    const manuals = await query(
      `SELECT id, title, version, created_at
       FROM manuals
       WHERE equipment_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      equipment: result.rows[0],
      recent_issues: issues.rows,
      manuals: manuals.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create equipment
router.post('/',
  authenticate,
  isTechnician,
  [
    body('name').trim().notEmpty(),
    body('model').optional().trim(),
    body('serial_number').optional().trim(),
    body('manufacturer').optional().trim(),
    body('location').optional().trim(),
    body('description').optional().trim()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, model, serial_number, manufacturer, location, description } = req.body;

      // Generate unique QR code
      const qrCode = `KB-${uuidv4().substring(0, 8).toUpperCase()}`;

      const result = await query(
        `INSERT INTO equipment (name, model, serial_number, manufacturer, location, description, qr_code, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [name, model, serial_number, manufacturer, location, description, qrCode, req.user.id]
      );

      res.status(201).json({ equipment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update equipment
router.put('/:id',
  authenticate,
  isTechnician,
  [
    body('name').optional().trim().notEmpty(),
    body('model').optional().trim(),
    body('serial_number').optional().trim(),
    body('manufacturer').optional().trim(),
    body('location').optional().trim(),
    body('description').optional().trim(),
    body('is_active').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, model, serial_number, manufacturer, location, description, is_active } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      const fields = { name, model, serial_number, manufacturer, location, description };
      for (const [field, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${field} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (typeof is_active === 'boolean') {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      const result = await query(
        `UPDATE equipment SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Equipment not found' });
      }

      res.json({ equipment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete equipment (soft delete)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE equipment SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ message: 'Equipment deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// Regenerate QR code
router.post('/:id/regenerate-qr', authenticate, isTechnician, async (req, res, next) => {
  try {
    const qrCode = `KB-${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await query(
      'UPDATE equipment SET qr_code = $1 WHERE id = $2 RETURNING *',
      [qrCode, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get unique locations (for filtering)
router.get('/meta/locations', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT location FROM equipment WHERE location IS NOT NULL AND location != '' ORDER BY location`
    );

    res.json({ locations: result.rows.map(r => r.location) });
  } catch (error) {
    next(error);
  }
});

// Upload and preview Excel/CSV file for import
router.post('/import/preview', authenticate, isTechnician, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    // Read the file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length === 0) {
      // Clean up file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'File is empty' });
    }

    // Get headers (first row)
    const headers = data[0].map(h => String(h || '').trim()).filter(h => h);

    // Get preview rows (up to 10)
    const previewRows = data.slice(1, 11).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    });

    const equipmentFields = ['name', 'model', 'serial_number', 'manufacturer', 'location', 'description'];

    // First, try basic pattern matching for fallback
    const basicMappings = {};
    headers.forEach(header => {
      const headerLower = header.toLowerCase().replace(/[_\s-]/g, '');

      if (headerLower.includes('name') || headerLower === 'equipment' || headerLower === 'item') {
        basicMappings[header] = 'name';
      } else if (headerLower.includes('model') || headerLower === 'modelnumber') {
        basicMappings[header] = 'model';
      } else if (headerLower.includes('serial') || headerLower === 'sn' || headerLower === 'serialno') {
        basicMappings[header] = 'serial_number';
      } else if (headerLower.includes('manufacturer') || headerLower.includes('make') || headerLower === 'brand' || headerLower === 'vendor') {
        basicMappings[header] = 'manufacturer';
      } else if (headerLower.includes('location') || headerLower === 'loc' || headerLower === 'site' || headerLower === 'room') {
        basicMappings[header] = 'location';
      } else if (headerLower.includes('description') || headerLower.includes('desc') || headerLower === 'notes' || headerLower === 'details') {
        basicMappings[header] = 'description';
      }
    });

    // Try AI-powered column mapping
    let aiResult = null;
    let suggestedMappings = basicMappings;

    try {
      aiResult = await suggestColumnMappings(headers, previewRows, equipmentFields);
      if (aiResult && Object.keys(aiResult.mappings).length > 0) {
        suggestedMappings = aiResult.mappings;
      }
    } catch (aiError) {
      console.error('AI mapping failed, using basic matching:', aiError.message);
      // Fall back to basic mappings
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      tempFile: req.file.filename,
      totalRows: data.length - 1, // Exclude header row
      sheetNames: workbook.SheetNames,
      headers,
      previewRows,
      suggestedMappings,
      equipmentFields,
      aiAnalysis: aiResult ? {
        confidence: aiResult.confidence,
        notes: aiResult.notes
      } : null
    });
  } catch (error) {
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

// Helper function to sanitize column names for PostgreSQL
function sanitizeColumnName(name) {
  // Convert to lowercase, replace spaces and special chars with underscores
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 63); // PostgreSQL max identifier length
}

// Execute the import with column mappings
router.post('/import/execute', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { tempFile, mappings, skipDuplicates = true } = req.body;

    if (!tempFile) {
      return res.status(400).json({ error: 'Missing tempFile' });
    }

    const filePath = path.join(__dirname, '../../uploads/imports', tempFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Temporary file not found. Please upload again.' });
    }

    // Read the file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headers = data[0].map(h => String(h || '').trim()).filter(h => h);
    const rows = data.slice(1);

    // Get existing columns in equipment table
    const existingColsResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'equipment'
    `);
    const existingColumns = new Set(existingColsResult.rows.map(r => r.column_name));

    // Reserved/system columns that shouldn't be overwritten
    const reservedColumns = new Set(['id', 'qr_code', 'created_by', 'created_at', 'updated_at', 'is_active', 'custom_fields']);

    // Build column mapping: Excel header -> DB column name
    const columnMap = {}; // excelHeader -> { dbColumn, isNew }
    const newColumnsToCreate = [];

    for (const header of headers) {
      // Check if there's an explicit mapping to a standard field
      const mappedField = mappings[header];

      if (mappedField && mappedField !== '') {
        // Explicitly mapped to a standard field
        columnMap[header] = { dbColumn: mappedField, isNew: false };
      } else {
        // Not mapped - create as new column or use sanitized name
        const sanitized = sanitizeColumnName(header);

        if (reservedColumns.has(sanitized)) {
          // Skip reserved columns
          continue;
        }

        if (!existingColumns.has(sanitized)) {
          // Need to create this column
          newColumnsToCreate.push(sanitized);
        }

        columnMap[header] = { dbColumn: sanitized, isNew: !existingColumns.has(sanitized) };
      }
    }

    // Create new columns in the database
    for (const colName of newColumnsToCreate) {
      try {
        await query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS "${colName}" TEXT`);
        console.log(`Created new column: ${colName}`);
      } catch (err) {
        console.error(`Failed to create column ${colName}:`, err.message);
      }
    }

    // Find the name column (optional - will fallback to model or generate one)
    let nameHeader = null;
    let modelHeader = null;
    for (const [header, mapping] of Object.entries(columnMap)) {
      if (mapping.dbColumn === 'name') {
        nameHeader = header;
      }
      if (mapping.dbColumn === 'model') {
        modelHeader = header;
      }
    }

    // If no name mapped, try to find one automatically
    if (!nameHeader) {
      for (const header of headers) {
        const lower = header.toLowerCase();
        if (lower.includes('name') || lower === 'equipment' || lower === 'item') {
          nameHeader = header;
          columnMap[header] = { dbColumn: 'name', isNew: false };
          break;
        }
      }
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [],
      columnsCreated: newColumnsToCreate
    };

    // Get existing serial numbers if checking for duplicates
    let existingSerials = new Set();
    const serialHeader = Object.entries(columnMap).find(([h, m]) => m.dbColumn === 'serial_number')?.[0];
    if (skipDuplicates && serialHeader) {
      const existing = await query('SELECT serial_number FROM equipment WHERE serial_number IS NOT NULL AND serial_number != \'\'');
      existingSerials = new Set(existing.rows.map(r => r.serial_number.toLowerCase()));
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        // Get name value - fallback to model if no name mapped/provided
        let name = '';
        if (nameHeader) {
          const nameIndex = headers.indexOf(nameHeader);
          name = nameIndex !== -1 ? String(row[nameIndex] || '').trim() : '';
        }

        // Fallback to model if name is empty
        if (!name && modelHeader) {
          const modelIndex = headers.indexOf(modelHeader);
          name = modelIndex !== -1 ? String(row[modelIndex] || '').trim() : '';
        }

        // Generate name from row number if still empty
        if (!name) {
          name = `Equipment ${rowNum - 1}`;
        }

        // Check for duplicate serial number
        if (skipDuplicates && serialHeader) {
          const serialIndex = headers.indexOf(serialHeader);
          const serialValue = serialIndex !== -1 ? String(row[serialIndex] || '').trim() : '';
          if (serialValue && existingSerials.has(serialValue.toLowerCase())) {
            results.errors.push({ row: rowNum, error: `Duplicate serial number: ${serialValue}` });
            results.skipped++;
            continue;
          }
          if (serialValue) {
            existingSerials.add(serialValue.toLowerCase());
          }
        }

        // Build INSERT statement dynamically
        const columns = ['qr_code', 'created_by'];
        const values = [`KB-${uuidv4().substring(0, 8).toUpperCase()}`, req.user.id];
        let paramIndex = 3;

        for (const [header, mapping] of Object.entries(columnMap)) {
          const headerIndex = headers.indexOf(header);
          if (headerIndex === -1) continue;

          const value = row[headerIndex];
          const strValue = value !== undefined && value !== null ? String(value).trim() : null;

          if (strValue || mapping.dbColumn === 'name') {
            columns.push(`"${mapping.dbColumn}"`);
            values.push(strValue || '');
          }
        }

        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
        const insertSQL = `INSERT INTO equipment (${columns.join(', ')}) VALUES (${placeholders})`;

        await query(insertSQL, values);
        results.imported++;

      } catch (err) {
        results.errors.push({ row: rowNum, error: err.message });
        results.skipped++;
      }
    }

    // Clean up temp file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    next(error);
  }
});

// Cancel import and clean up temp file
router.post('/import/cancel', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { tempFile } = req.body;

    if (tempFile) {
      const filePath = path.join(__dirname, '../../uploads/imports', tempFile);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Search for equipment manual online using AI
router.post('/:id/find-manual', authenticate, isTechnician, async (req, res, next) => {
  try {
    // Get equipment details
    const equipmentResult = await query(
      'SELECT * FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];

    // Search for manual URLs
    const searchResult = await searchEquipmentManual(
      equipment.manufacturer,
      equipment.model,
      equipment.name
    );

    res.json({
      equipment: {
        id: equipment.id,
        name: equipment.name,
        manufacturer: equipment.manufacturer,
        model: equipment.model
      },
      ...searchResult
    });
  } catch (error) {
    next(error);
  }
});

// Get manual suggestions for equipment (matching existing manuals)
router.get('/:id/manual-suggestions', authenticate, isViewer, async (req, res, next) => {
  try {
    // Get equipment details
    const equipmentResult = await query(
      'SELECT * FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];

    // Get all manuals not already linked to this equipment
    const manualsResult = await query(
      `SELECT id, title, description, file_name, created_at
       FROM manuals
       WHERE equipment_id IS NULL OR equipment_id != $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    const availableManuals = manualsResult.rows;

    // Use AI to find potential matches
    const matchedManual = await matchManualToEquipment(equipment, availableManuals);

    // Also find manuals with similar manufacturer names
    const similarManuals = availableManuals.filter(m => {
      const titleLower = m.title.toLowerCase();
      const descLower = (m.description || '').toLowerCase();
      const mfgLower = (equipment.manufacturer || '').toLowerCase();
      const modelLower = (equipment.model || '').toLowerCase();

      return (mfgLower && (titleLower.includes(mfgLower) || descLower.includes(mfgLower))) ||
             (modelLower && (titleLower.includes(modelLower) || descLower.includes(modelLower)));
    }).slice(0, 5);

    res.json({
      equipment: {
        id: equipment.id,
        name: equipment.name,
        manufacturer: equipment.manufacturer,
        model: equipment.model
      },
      ai_suggested: matchedManual,
      similar_manuals: similarManuals,
      all_available: availableManuals.slice(0, 20)
    });
  } catch (error) {
    next(error);
  }
});

// Link a manual to equipment
router.post('/:id/link-manual', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { manual_id } = req.body;

    if (!manual_id) {
      return res.status(400).json({ error: 'manual_id is required' });
    }

    // Verify equipment exists
    const equipmentResult = await query(
      'SELECT id, name FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    // Update manual to link to equipment
    const result = await query(
      'UPDATE manuals SET equipment_id = $1 WHERE id = $2 RETURNING *',
      [req.params.id, manual_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Manual not found' });
    }

    res.json({
      message: 'Manual linked successfully',
      manual: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Unlink a manual from equipment
router.post('/:id/unlink-manual', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { manual_id } = req.body;

    if (!manual_id) {
      return res.status(400).json({ error: 'manual_id is required' });
    }

    // Update manual to remove equipment link
    const result = await query(
      'UPDATE manuals SET equipment_id = NULL WHERE id = $1 AND equipment_id = $2 RETURNING *',
      [manual_id, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Manual not found or not linked to this equipment' });
    }

    res.json({
      message: 'Manual unlinked successfully',
      manual: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Get all equipment without manuals (for bulk manual assignment)
router.get('/without-manuals/list', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.id, e.name, e.model, e.manufacturer, e.location,
              (SELECT COUNT(*) FROM manuals WHERE equipment_id = e.id) as manual_count
       FROM equipment e
       WHERE e.is_active = true
       AND NOT EXISTS (SELECT 1 FROM manuals WHERE equipment_id = e.id)
       ORDER BY e.manufacturer, e.model, e.name`
    );

    res.json({
      equipment: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    next(error);
  }
});

// Fetch image for single equipment
router.post('/:id/fetch-image', authenticate, isTechnician, async (req, res, next) => {
  try {
    const equipmentResult = await query(
      'SELECT * FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];

    // Check if another equipment with same model already has an image
    if (equipment.model && equipment.manufacturer) {
      const existingImage = await query(
        `SELECT image_path FROM equipment
         WHERE manufacturer = $1 AND model = $2 AND image_path IS NOT NULL
         LIMIT 1`,
        [equipment.manufacturer, equipment.model]
      );

      if (existingImage.rows.length > 0) {
        // Reuse existing image
        await query(
          'UPDATE equipment SET image_path = $1 WHERE id = $2',
          [existingImage.rows[0].image_path, req.params.id]
        );

        return res.json({
          success: true,
          image_path: existingImage.rows[0].image_path,
          reused: true
        });
      }
    }

    // Fetch new image
    const uploadDir = path.join(__dirname, '../../uploads/equipment');
    const result = await fetchEquipmentImage(
      equipment.manufacturer,
      equipment.model,
      equipment.name,
      uploadDir
    );

    if (!result.success) {
      return res.status(404).json({
        error: 'Could not find product image',
        details: result.error
      });
    }

    // Update equipment with image path
    const imagePath = `/uploads/equipment/${result.filename}`;
    await query(
      'UPDATE equipment SET image_path = $1 WHERE id = $2',
      [imagePath, req.params.id]
    );

    // Also update other equipment with same manufacturer/model
    if (equipment.manufacturer && equipment.model) {
      await query(
        `UPDATE equipment SET image_path = $1
         WHERE manufacturer = $2 AND model = $3 AND image_path IS NULL`,
        [imagePath, equipment.manufacturer, equipment.model]
      );
    }

    res.json({
      success: true,
      image_path: imagePath,
      source: result.source,
      reused: false
    });
  } catch (error) {
    next(error);
  }
});

// Bulk fetch images for equipment without images (efficient - groups by model)
router.post('/fetch-images/bulk', authenticate, isTechnician, async (req, res, next) => {
  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  try {
    // Get unique manufacturer/model combinations without images
    const uniqueModels = await query(
      `SELECT DISTINCT manufacturer, model,
              (SELECT id FROM equipment e2 WHERE e2.manufacturer = e.manufacturer AND e2.model = e.model LIMIT 1) as sample_id,
              (SELECT name FROM equipment e2 WHERE e2.manufacturer = e.manufacturer AND e2.model = e.model LIMIT 1) as sample_name,
              COUNT(*) as equipment_count
       FROM equipment e
       WHERE is_active = true
         AND image_path IS NULL
         AND model IS NOT NULL
         AND manufacturer IS NOT NULL
       GROUP BY manufacturer, model
       ORDER BY equipment_count DESC
       LIMIT 10`
    );

    if (uniqueModels.rows.length === 0) {
      return res.json({ ...results, message: 'No equipment without images found' });
    }

    const uploadDir = path.join(__dirname, '../../uploads/equipment');

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    for (const row of uniqueModels.rows) {
      results.processed++;

      try {
        const fetchResult = await fetchEquipmentImage(
          row.manufacturer,
          row.model,
          row.sample_name,
          uploadDir
        );

        if (fetchResult.success) {
          const imagePath = `/uploads/equipment/${fetchResult.filename}`;

          // Update all equipment with this manufacturer/model
          const updateResult = await query(
            `UPDATE equipment SET image_path = $1
             WHERE manufacturer = $2 AND model = $3 AND image_path IS NULL
             RETURNING id`,
            [imagePath, row.manufacturer, row.model]
          );

          results.success++;
          results.details.push({
            manufacturer: row.manufacturer,
            model: row.model,
            updated: updateResult.rows.length,
            image_path: imagePath
          });
        } else {
          results.failed++;
          results.details.push({
            manufacturer: row.manufacturer,
            model: row.model,
            error: fetchResult.error || 'Image not found'
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        results.failed++;
        results.details.push({
          manufacturer: row.manufacturer,
          model: row.model,
          error: err.message
        });
      }
    }

    // Always return results, even partial
    res.json(results);
  } catch (error) {
    // Return partial results even on error
    results.error = error.message;
    res.json(results);
  }
});

// Upload image manually for equipment
const equipmentImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../../uploads/equipment');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${require('uuid').v4()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload image for equipment manually
router.post('/:id/upload-image', authenticate, isTechnician, equipmentImageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const equipmentResult = await query(
      'SELECT * FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];
    const imagePath = `/uploads/equipment/${req.file.filename}`;

    // Update this equipment
    await query(
      'UPDATE equipment SET image_path = $1 WHERE id = $2',
      [imagePath, req.params.id]
    );

    // Optionally update other equipment with same manufacturer/model
    if (req.body.applyToSameModel === 'true' && equipment.manufacturer && equipment.model) {
      await query(
        `UPDATE equipment SET image_path = $1
         WHERE manufacturer = $2 AND model = $3 AND image_path IS NULL AND id != $4`,
        [imagePath, equipment.manufacturer, equipment.model, req.params.id]
      );
    }

    res.json({
      success: true,
      image_path: imagePath
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});

// Delete equipment image
router.delete('/:id/image', authenticate, isTechnician, async (req, res, next) => {
  try {
    const equipmentResult = await query(
      'SELECT id, image_path, manufacturer, model FROM equipment WHERE id = $1',
      [req.params.id]
    );

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];

    if (!equipment.image_path) {
      return res.status(400).json({ error: 'Equipment has no image' });
    }

    // Check if other equipment uses this image
    const othersUsingImage = await query(
      'SELECT COUNT(*) as count FROM equipment WHERE image_path = $1 AND id != $2',
      [equipment.image_path, req.params.id]
    );

    // Clear the image path from this equipment
    await query(
      'UPDATE equipment SET image_path = NULL WHERE id = $1',
      [req.params.id]
    );

    // If no other equipment uses this image, delete the file
    if (parseInt(othersUsingImage.rows[0].count) === 0) {
      const filePath = path.join(__dirname, '../..', equipment.image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get equipment without images
router.get('/without-images/list', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.id, e.name, e.model, e.manufacturer, e.location
       FROM equipment e
       WHERE e.is_active = true AND e.image_path IS NULL
       ORDER BY e.manufacturer, e.model, e.name`
    );

    // Also get unique model count
    const uniqueCount = await query(
      `SELECT COUNT(DISTINCT (manufacturer, model)) as unique_models
       FROM equipment
       WHERE is_active = true AND image_path IS NULL AND model IS NOT NULL`
    );

    res.json({
      equipment: result.rows,
      total: result.rows.length,
      unique_models: parseInt(uniqueCount.rows[0].unique_models) || 0
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
