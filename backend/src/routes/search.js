const express = require('express');
const { query } = require('../config/database');
const { authenticate, isViewer } = require('../middleware/auth');
const claudeService = require('../services/claudeService');

const router = express.Router();

// Global search across issues, manuals, equipment
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const { q, type, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = `%${q}%`;
    const results = { issues: [], manuals: [], equipment: [] };

    // Log search for analytics
    await query(
      'INSERT INTO search_logs (user_id, query) VALUES ($1, $2)',
      [req.user.id, q]
    ).catch(() => {}); // Don't fail on logging error

    // Search issues
    if (!type || type === 'issues') {
      const issueResults = await query(
        `SELECT i.id, i.title, i.description, i.status, i.priority, i.created_at,
                c.name as category_name,
                ts_headline('english', i.title || ' ' || i.description, plainto_tsquery('english', $1), 'MaxFragments=2, MaxWords=30') as snippet,
                ts_rank(to_tsvector('english', i.title || ' ' || i.description), plainto_tsquery('english', $1)) as rank
         FROM issues i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.title ILIKE $2 OR i.description ILIKE $2
         ORDER BY rank DESC, i.created_at DESC
         LIMIT $3`,
        [q, searchTerm, limit]
      );
      results.issues = issueResults.rows;
    }

    // Search manuals
    if (!type || type === 'manuals') {
      const manualResults = await query(
        `SELECT m.id, m.title, m.description, m.file_name, m.created_at,
                c.name as category_name
         FROM manuals m
         LEFT JOIN categories c ON m.category_id = c.id
         WHERE m.title ILIKE $1 OR m.description ILIKE $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [searchTerm, limit]
      );
      results.manuals = manualResults.rows;
    }

    // Search equipment
    if (!type || type === 'equipment') {
      const equipmentResults = await query(
        `SELECT id, name, model, serial_number, manufacturer, location
         FROM equipment
         WHERE is_active = true AND (
           name ILIKE $1 OR model ILIKE $1 OR serial_number ILIKE $1 OR manufacturer ILIKE $1
         )
         ORDER BY name
         LIMIT $2`,
        [searchTerm, limit]
      );
      results.equipment = equipmentResults.rows;
    }

    res.json({ results, query: q });
  } catch (error) {
    next(error);
  }
});

// Search manual content (full-text search through extracted PDF text)
router.get('/manuals/content', authenticate, isViewer, async (req, res, next) => {
  try {
    const { q, manual_id, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    let whereClause = 'WHERE search_vector @@ plainto_tsquery(\'english\', $1)';
    const params = [q];
    let paramCount = 2;

    if (manual_id) {
      whereClause += ` AND mp.manual_id = $${paramCount++}`;
      params.push(manual_id);
    }

    params.push(limit);

    const results = await query(
      `SELECT mp.id, mp.manual_id, mp.page_number, m.title as manual_title,
              ts_headline('english', mp.content, plainto_tsquery('english', $1), 'MaxFragments=3, MaxWords=50, StartSel=<mark>, StopSel=</mark>') as snippet,
              ts_rank(mp.search_vector, plainto_tsquery('english', $1)) as rank
       FROM manual_pages mp
       JOIN manuals m ON mp.manual_id = m.id
       ${whereClause}
       ORDER BY rank DESC
       LIMIT $${paramCount}`,
      params
    );

    res.json({ results: results.rows, query: q });
  } catch (error) {
    next(error);
  }
});

// AI-powered search using Claude
router.post('/ai', authenticate, isViewer, async (req, res, next) => {
  try {
    const { query: userQuery, include_web = false, include_manuals = true } = req.body;

    if (!userQuery || userQuery.trim().length < 5) {
      return res.status(400).json({ error: 'Query must be at least 5 characters' });
    }

    // Log search
    await query(
      'INSERT INTO search_logs (user_id, query) VALUES ($1, $2)',
      [req.user.id, `[AI] ${userQuery}`]
    ).catch(() => {});

    // Gather context from database
    let context = '';

    // Get relevant issues
    const relevantIssues = await query(
      `SELECT title, description,
              (SELECT content FROM solutions WHERE issue_id = i.id AND is_accepted = true LIMIT 1) as solution
       FROM issues i
       WHERE i.title ILIKE $1 OR i.description ILIKE $1
       ORDER BY i.created_at DESC
       LIMIT 5`,
      [`%${userQuery.split(' ').join('%')}%`]
    );

    if (relevantIssues.rows.length > 0) {
      context += 'Related issues from knowledge base:\n';
      relevantIssues.rows.forEach((issue, i) => {
        context += `\n${i + 1}. ${issue.title}\n   Description: ${issue.description?.substring(0, 200)}...\n`;
        if (issue.solution) {
          context += `   Solution: ${issue.solution.substring(0, 300)}...\n`;
        }
      });
    }

    // Get relevant manual pages if requested
    if (include_manuals) {
      const manualPages = await query(
        `SELECT m.title as manual_title, mp.page_number, mp.content
         FROM manual_pages mp
         JOIN manuals m ON mp.manual_id = m.id
         WHERE mp.search_vector @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(mp.search_vector, plainto_tsquery('english', $1)) DESC
         LIMIT 3`,
        [userQuery]
      );

      if (manualPages.rows.length > 0) {
        context += '\n\nRelevant manual sections:\n';
        manualPages.rows.forEach((page, i) => {
          context += `\n${i + 1}. From "${page.manual_title}" (Page ${page.page_number}):\n`;
          context += `   ${page.content?.substring(0, 500)}...\n`;
        });
      }
    }

    // Call Claude
    const response = await claudeService.searchAssistant(userQuery, context, include_web);

    res.json({
      answer: response.answer,
      sources: response.sources || [],
      suggestions: response.suggestions || []
    });
  } catch (error) {
    console.error('AI search error:', error);
    next(error);
  }
});

// Get search suggestions (autocomplete)
router.get('/suggestions', authenticate, isViewer, async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = `${q}%`;

    // Get issue title suggestions
    const issueSuggestions = await query(
      `SELECT DISTINCT title as text, 'issue' as type
       FROM issues
       WHERE title ILIKE $1
       LIMIT 5`,
      [searchTerm]
    );

    // Get equipment suggestions
    const equipmentSuggestions = await query(
      `SELECT DISTINCT name as text, 'equipment' as type
       FROM equipment
       WHERE name ILIKE $1 AND is_active = true
       LIMIT 3`,
      [searchTerm]
    );

    // Get popular searches
    const popularSearches = await query(
      `SELECT query as text, 'recent' as type, COUNT(*) as count
       FROM search_logs
       WHERE query ILIKE $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY query
       ORDER BY count DESC
       LIMIT 3`,
      [searchTerm]
    );

    const suggestions = [
      ...issueSuggestions.rows,
      ...equipmentSuggestions.rows,
      ...popularSearches.rows
    ];

    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
