const fs = require('fs');
const pdf = require('pdf-parse');
const { query, transaction } = require('../config/database');

/**
 * Process a PDF manual - extract text and store for searching
 */
async function processManual(manualId, filePath) {
  try {
    console.log(`Processing manual ${manualId} from ${filePath}`);

    // Read PDF file
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);

    // Update manual with page count
    await query(
      'UPDATE manuals SET page_count = $1, is_indexed = false WHERE id = $2',
      [pdfData.numpages, manualId]
    );

    // Clear existing pages
    await query('DELETE FROM manual_pages WHERE manual_id = $1', [manualId]);

    // Split text by pages (approximate - pdf-parse doesn't give exact page breaks)
    // We'll store the full text as page 1 for now, with chunking for better search
    const fullText = pdfData.text;
    const chunkSize = 2000; // Characters per "page"
    const chunks = [];

    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push(fullText.substring(i, i + chunkSize));
    }

    // Insert pages
    await transaction(async (client) => {
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i].trim();
        if (content.length > 0) {
          await client.query(
            `INSERT INTO manual_pages (manual_id, page_number, content)
             VALUES ($1, $2, $3)`,
            [manualId, i + 1, content]
          );
        }
      }

      // Mark as indexed
      await client.query(
        'UPDATE manuals SET is_indexed = true WHERE id = $1',
        [manualId]
      );
    });

    console.log(`Manual ${manualId} processed: ${chunks.length} chunks created`);
    return { success: true, pageCount: chunks.length };
  } catch (error) {
    console.error(`Error processing manual ${manualId}:`, error);

    // Mark as failed
    await query(
      'UPDATE manuals SET is_indexed = false WHERE id = $1',
      [manualId]
    );

    return { success: false, error: error.message };
  }
}

/**
 * Extract metadata from PDF
 */
async function extractMetadata(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);

    return {
      pageCount: pdfData.numpages,
      info: pdfData.info || {},
      metadata: pdfData.metadata || {}
    };
  } catch (error) {
    console.error('PDF metadata extraction error:', error);
    return null;
  }
}

/**
 * Get text from a specific page range
 */
async function getPageText(manualId, startPage, endPage) {
  try {
    const result = await query(
      `SELECT page_number, content
       FROM manual_pages
       WHERE manual_id = $1 AND page_number >= $2 AND page_number <= $3
       ORDER BY page_number`,
      [manualId, startPage, endPage]
    );

    return result.rows;
  } catch (error) {
    console.error('Get page text error:', error);
    return [];
  }
}

/**
 * Search for text within a manual
 */
async function searchManual(manualId, searchQuery) {
  try {
    const result = await query(
      `SELECT page_number,
              ts_headline('english', content, plainto_tsquery('english', $1),
                'MaxFragments=2, MaxWords=30, StartSel=<b>, StopSel=</b>') as snippet,
              ts_rank(search_vector, plainto_tsquery('english', $1)) as relevance
       FROM manual_pages
       WHERE manual_id = $2 AND search_vector @@ plainto_tsquery('english', $1)
       ORDER BY relevance DESC
       LIMIT 20`,
      [searchQuery, manualId]
    );

    return result.rows;
  } catch (error) {
    console.error('Manual search error:', error);
    return [];
  }
}

/**
 * Reprocess all unindexed manuals
 */
async function reprocessUnindexed() {
  try {
    const result = await query(
      'SELECT id, file_path FROM manuals WHERE is_indexed = false'
    );

    console.log(`Found ${result.rows.length} unindexed manuals`);

    for (const manual of result.rows) {
      const filePath = manual.file_path.startsWith('/')
        ? manual.file_path
        : require('path').join(__dirname, '../..', manual.file_path);

      if (fs.existsSync(filePath)) {
        await processManual(manual.id, filePath);
      } else {
        console.warn(`File not found: ${filePath}`);
      }
    }

    return { processed: result.rows.length };
  } catch (error) {
    console.error('Reprocess error:', error);
    return { error: error.message };
  }
}

module.exports = {
  processManual,
  extractMetadata,
  getPageText,
  searchManual,
  reprocessUnindexed
};
