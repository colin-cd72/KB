const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, isTechnician, isViewer, isAdmin } = require('../middleware/auth');
const { suggestColumnMappings } = require('../services/claudeService');

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
    const { page = 1, limit = 20, search, location } = req.query;
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

    params.push(limit, offset);

    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open', 'in_progress')) as open_issue_count,
              (SELECT COUNT(*) FROM manuals WHERE equipment_id = e.id) as manual_count
       FROM equipment e
       ${whereClause}
       ORDER BY e.name
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

// Execute the import with column mappings
router.post('/import/execute', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { tempFile, mappings, skipDuplicates = true } = req.body;

    if (!tempFile || !mappings) {
      return res.status(400).json({ error: 'Missing tempFile or mappings' });
    }

    // Validate that at least 'name' is mapped
    const mappedFields = Object.values(mappings);
    if (!mappedFields.includes('name')) {
      return res.status(400).json({ error: 'Equipment name field must be mapped' });
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

    const headers = data[0].map(h => String(h || '').trim());
    const rows = data.slice(1);

    // Build reverse mapping: equipmentField -> headerIndex
    const fieldToIndex = {};
    const mappedHeaders = new Set();
    for (const [header, field] of Object.entries(mappings)) {
      if (field && field !== 'skip') {
        const headerIndex = headers.indexOf(header);
        if (headerIndex !== -1) {
          fieldToIndex[field] = headerIndex;
          mappedHeaders.add(header);
        }
      }
    }

    // Find unmapped columns (for custom_fields)
    const unmappedColumns = headers.filter(h => h && !mappedHeaders.has(h));

    const results = {
      imported: 0,
      skipped: 0,
      errors: [],
      customFieldsAdded: unmappedColumns.length > 0 ? unmappedColumns : []
    };

    // Get existing serial numbers if checking for duplicates
    let existingSerials = new Set();
    if (skipDuplicates && fieldToIndex.serial_number !== undefined) {
      const existing = await query('SELECT serial_number FROM equipment WHERE serial_number IS NOT NULL AND serial_number != \'\'');
      existingSerials = new Set(existing.rows.map(r => r.serial_number.toLowerCase()));
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed, +1 for header)

      try {
        const name = fieldToIndex.name !== undefined ? String(row[fieldToIndex.name] || '').trim() : '';

        if (!name) {
          results.errors.push({ row: rowNum, error: 'Missing name' });
          results.skipped++;
          continue;
        }

        const model = fieldToIndex.model !== undefined ? String(row[fieldToIndex.model] || '').trim() : null;
        const serial_number = fieldToIndex.serial_number !== undefined ? String(row[fieldToIndex.serial_number] || '').trim() : null;
        const manufacturer = fieldToIndex.manufacturer !== undefined ? String(row[fieldToIndex.manufacturer] || '').trim() : null;
        const location = fieldToIndex.location !== undefined ? String(row[fieldToIndex.location] || '').trim() : null;
        const description = fieldToIndex.description !== undefined ? String(row[fieldToIndex.description] || '').trim() : null;

        // Collect unmapped columns into custom_fields
        const custom_fields = {};
        for (const colName of unmappedColumns) {
          const colIndex = headers.indexOf(colName);
          if (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
            custom_fields[colName] = String(row[colIndex]).trim();
          }
        }

        // Check for duplicate serial number
        if (skipDuplicates && serial_number && existingSerials.has(serial_number.toLowerCase())) {
          results.errors.push({ row: rowNum, error: `Duplicate serial number: ${serial_number}` });
          results.skipped++;
          continue;
        }

        // Generate QR code
        const qrCode = `KB-${uuidv4().substring(0, 8).toUpperCase()}`;

        // Insert the equipment with custom fields
        await query(
          `INSERT INTO equipment (name, model, serial_number, manufacturer, location, description, qr_code, created_by, custom_fields)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [name, model || null, serial_number || null, manufacturer || null, location || null, description || null, qrCode, req.user.id, JSON.stringify(custom_fields)]
        );

        results.imported++;

        // Add to existing set to prevent duplicates within same import
        if (serial_number) {
          existingSerials.add(serial_number.toLowerCase());
        }
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

module.exports = router;
