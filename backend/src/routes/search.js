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
    const results = { issues: [], manuals: [], equipment: [], articles: [] };

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

    // Search articles
    if (!type || type === 'articles') {
      const articleResults = await query(
        `SELECT a.id, a.title, a.slug, a.summary, a.is_published, a.created_at,
                c.name as category_name,
                e.name as equipment_name,
                ts_headline('english', a.title || ' ' || COALESCE(a.content, ''), plainto_tsquery('english', $1), 'MaxFragments=2, MaxWords=30') as snippet,
                ts_rank(COALESCE(a.search_vector, to_tsvector('english', a.title || ' ' || COALESCE(a.content, ''))), plainto_tsquery('english', $1)) as rank
         FROM articles a
         LEFT JOIN categories c ON a.category_id = c.id
         LEFT JOIN equipment e ON a.equipment_id = e.id
         WHERE a.is_published = true AND (a.title ILIKE $2 OR a.content ILIKE $2 OR a.summary ILIKE $2)
         ORDER BY rank DESC, a.created_at DESC
         LIMIT $3`,
        [q, searchTerm, limit]
      );
      results.articles = articleResults.rows;
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

    // Get relevant articles
    const relevantArticles = await query(
      `SELECT title, content, summary
       FROM articles
       WHERE is_published = true
         AND (search_vector @@ plainto_tsquery('english', $1)
              OR title ILIKE $2 OR content ILIKE $2)
       ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
       LIMIT 3`,
      [userQuery, `%${userQuery.split(' ').join('%')}%`]
    );

    if (relevantArticles.rows.length > 0) {
      context += '\n\nRelevant how-to articles:\n';
      relevantArticles.rows.forEach((article, i) => {
        context += `\n${i + 1}. "${article.title}"\n`;
        if (article.summary) {
          context += `   Summary: ${article.summary}\n`;
        }
        context += `   Content: ${article.content?.substring(0, 500)}...\n`;
      });
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

// Find similar resolved issues and get AI suggestions for new issue
router.post('/similar-issues', authenticate, isViewer, async (req, res, next) => {
  try {
    const { title, description, conversationHistory } = req.body;

    if (!title && !description) {
      return res.json({ similarIssues: [], aiSuggestion: null });
    }

    const searchText = `${title || ''} ${description || ''}`.trim();
    if (searchText.length < 10) {
      return res.json({ similarIssues: [], aiSuggestion: null });
    }

    // Create safe LIKE pattern - escape special characters
    const words = searchText.split(/\s+/).slice(0, 3).filter(w => w.length > 0);
    const likePattern = words.length > 0 ? `%${words.join('%')}%` : `%${searchText}%`;

    // Search for similar resolved issues with accepted solutions
    let similarIssues = { rows: [] };
    try {
      similarIssues = await query(
        `SELECT i.id, i.title, i.description, i.status, i.priority,
                i.created_at, i.resolved_at,
                s.content as solution,
                s.rating as solution_rating,
                e.name as equipment_name,
                c.name as category_name,
                ts_rank(to_tsvector('english', i.title || ' ' || COALESCE(i.description, '')),
                        plainto_tsquery('english', $1)) as rank
         FROM issues i
         LEFT JOIN solutions s ON s.issue_id = i.id AND s.is_accepted = true
         LEFT JOIN equipment e ON i.equipment_id = e.id
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.status IN ('resolved', 'closed')
           AND (i.title ILIKE $2 OR i.description ILIKE $2
                OR to_tsvector('english', i.title || ' ' || COALESCE(i.description, '')) @@ plainto_tsquery('english', $1))
         ORDER BY rank DESC, i.resolved_at DESC NULLS LAST
         LIMIT 5`,
        [searchText, likePattern]
      );
    } catch (dbError) {
      console.error('Similar issues query error:', dbError.message);
      // Continue with empty results
    }

    // Get AI suggestion if Claude is configured
    let aiResponse = null;
    try {
      if (similarIssues.rows.length > 0 || searchText.length >= 20) {
        // Build context from similar issues
        let context = '';
        if (similarIssues.rows.length > 0) {
          context = 'Similar resolved issues from knowledge base:\n\n';
          similarIssues.rows.forEach((issue, i) => {
            context += `${i + 1}. "${issue.title}"\n`;
            context += `   Problem: ${issue.description?.substring(0, 200) || 'N/A'}...\n`;
            if (issue.solution) {
              context += `   Solution: ${issue.solution.substring(0, 400)}...\n`;
            }
            context += '\n';
          });
        }

        // Get manual content that might be relevant
        const manualPages = await query(
          `SELECT m.title as manual_title, mp.page_number, mp.content
           FROM manual_pages mp
           JOIN manuals m ON mp.manual_id = m.id
           WHERE mp.search_vector @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(mp.search_vector, plainto_tsquery('english', $1)) DESC
           LIMIT 2`,
          [searchText]
        );

        if (manualPages.rows.length > 0) {
          context += '\nRelevant documentation:\n';
          manualPages.rows.forEach((page) => {
            context += `From "${page.manual_title}" (Page ${page.page_number}): ${page.content?.substring(0, 300)}...\n`;
          });
        }

        // Get relevant articles
        const relevantArticles = await query(
          `SELECT title, content, summary
           FROM articles
           WHERE is_published = true
             AND (search_vector @@ plainto_tsquery('english', $1)
                  OR title ILIKE $2 OR content ILIKE $2)
           ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
           LIMIT 2`,
          [searchText, `%${searchText.split(' ').slice(0, 3).join('%')}%`]
        );

        if (relevantArticles.rows.length > 0) {
          context += '\nRelevant how-to articles:\n';
          relevantArticles.rows.forEach((article) => {
            context += `"${article.title}": ${article.content?.substring(0, 400)}...\n`;
          });
        }

        // Call Claude for suggestion with conversation history
        aiResponse = await claudeService.suggestSolution(searchText, context, conversationHistory || []);
      }
    } catch (aiError) {
      console.error('AI suggestion error:', aiError.message);
      // Continue without AI suggestion
    }

    res.json({
      similarIssues: similarIssues.rows,
      aiSuggestion: aiResponse?.suggestion || null,
      hasQuestions: aiResponse?.hasQuestions || false,
      questions: aiResponse?.questions || [],
      conversationHistory: aiResponse?.conversationHistory || []
    });
  } catch (error) {
    next(error);
  }
});

// Continue AI conversation for issue resolution
router.post('/continue-conversation', authenticate, isViewer, async (req, res, next) => {
  try {
    const { answer, conversationHistory } = req.body;

    if (!answer || !conversationHistory) {
      return res.status(400).json({ error: 'Answer and conversation history required' });
    }

    const response = await claudeService.continueSolutionConversation(answer, conversationHistory);

    res.json({
      aiSuggestion: response.suggestion,
      hasQuestions: response.hasQuestions,
      conversationHistory: response.conversationHistory
    });
  } catch (error) {
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

    // Get article suggestions
    const articleSuggestions = await query(
      `SELECT DISTINCT title as text, 'article' as type
       FROM articles
       WHERE title ILIKE $1 AND is_published = true
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
      ...articleSuggestions.rows,
      ...popularSearches.rows
    ];

    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

// ============= SEARCH HISTORY & SAVED SEARCHES =============

// Get user's search history
router.get('/history', authenticate, isViewer, async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const result = await query(
      `SELECT id, query, search_type, results_count, created_at
       FROM search_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

// Clear search history
router.delete('/history', authenticate, isViewer, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM search_history WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get user's saved searches
router.get('/saved', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, query, filters, search_type, created_at
       FROM saved_searches
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ searches: result.rows });
  } catch (error) {
    next(error);
  }
});

// Save a search
router.post('/saved', authenticate, isViewer, async (req, res, next) => {
  try {
    const { name, query: searchQuery, filters, search_type = 'global' } = req.body;

    if (!name || !searchQuery) {
      return res.status(400).json({ error: 'Name and query are required' });
    }

    const result = await query(
      `INSERT INTO saved_searches (user_id, name, query, filters, search_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name, searchQuery, filters || {}, search_type]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete a saved search
router.delete('/saved/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Quick search endpoint for command palette (fast, lightweight)
router.get('/quick', authenticate, isViewer, async (req, res, next) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ results: [] });
    }

    const searchTerm = `${q}%`;
    const results = [];

    // Search issues (title only for speed)
    const issues = await query(
      `SELECT id, title, status, priority, 'issue' as type
       FROM issues
       WHERE title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [searchTerm, limit]
    );
    results.push(...issues.rows);

    // Search articles
    const articles = await query(
      `SELECT id, title, slug, 'article' as type
       FROM articles
       WHERE is_published = true AND title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [searchTerm, limit]
    );
    results.push(...articles.rows);

    // Search equipment
    const equipment = await query(
      `SELECT id, name as title, 'equipment' as type
       FROM equipment
       WHERE is_active = true AND name ILIKE $1
       ORDER BY name
       LIMIT $2`,
      [searchTerm, limit]
    );
    results.push(...equipment.rows);

    // Search manuals
    const manuals = await query(
      `SELECT id, title, 'manual' as type
       FROM manuals
       WHERE title ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [searchTerm, limit]
    );
    results.push(...manuals.rows);

    res.json({ results: results.slice(0, limit * 2) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
