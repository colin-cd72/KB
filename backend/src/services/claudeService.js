const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

/**
 * Search assistant - analyzes query with context and provides helpful response
 */
async function searchAssistant(userQuery, context, includeWeb = false) {
  try {
    const systemPrompt = `You are a helpful technical support assistant for a knowledge base system.
Your role is to help users troubleshoot problems and find solutions.

Guidelines:
- Be concise and practical
- Provide step-by-step solutions when applicable
- Reference specific information from the context provided
- If the context doesn't have enough information, say so and provide general guidance
- Suggest related topics the user might want to explore
- Format your response with clear sections and bullet points when appropriate`;

    let userMessage = `User question: ${userQuery}`;

    if (context) {
      userMessage += `\n\nContext from knowledge base:\n${context}`;
    }

    if (includeWeb) {
      userMessage += `\n\nPlease also consider general best practices and common solutions for this type of problem.`;
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });

    const answer = response.content[0].text;

    // Extract suggestions (look for patterns like "You might also..." or "Related:")
    const suggestions = [];
    const suggestionMatch = answer.match(/(?:related|you might also|see also|consider):?\s*([^\n]+)/gi);
    if (suggestionMatch) {
      suggestionMatch.forEach(s => {
        const cleaned = s.replace(/^(related|you might also|see also|consider):?\s*/i, '').trim();
        if (cleaned) suggestions.push(cleaned);
      });
    }

    return {
      answer,
      sources: context ? ['Knowledge Base'] : [],
      suggestions
    };
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to get AI response');
  }
}

/**
 * Categorize an issue based on title and description
 */
async function suggestCategory(title, description, categories) {
  try {
    const categoryList = categories.map(c => `- ${c.name}: ${c.description || 'No description'}`).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Based on this issue, suggest the most appropriate category.

Issue Title: ${title}
Issue Description: ${description}

Available categories:
${categoryList}

Respond with ONLY the category name, nothing else.`
        }
      ]
    });

    const suggestedName = response.content[0].text.trim();
    const category = categories.find(c =>
      c.name.toLowerCase() === suggestedName.toLowerCase()
    );

    return category ? category.id : null;
  } catch (error) {
    console.error('Category suggestion error:', error);
    return null;
  }
}

/**
 * Check for duplicate issues
 */
async function checkDuplicate(title, description, existingIssues) {
  try {
    if (existingIssues.length === 0) return null;

    const issueList = existingIssues.slice(0, 10).map((issue, i) =>
      `${i + 1}. [ID: ${issue.id}] ${issue.title}`
    ).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Determine if this new issue is a duplicate of any existing issues.

New Issue:
Title: ${title}
Description: ${description}

Existing Issues:
${issueList}

If this is likely a duplicate, respond with the number of the matching issue (e.g., "1" or "3").
If this is NOT a duplicate, respond with "NONE".
Only respond with a number or "NONE", nothing else.`
        }
      ]
    });

    const result = response.content[0].text.trim();

    if (result === 'NONE') return null;

    const index = parseInt(result) - 1;
    if (index >= 0 && index < existingIssues.length) {
      return existingIssues[index];
    }

    return null;
  } catch (error) {
    console.error('Duplicate check error:', error);
    return null;
  }
}

/**
 * Summarize manual content for better search
 */
async function summarizeContent(content, maxLength = 500) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Summarize the following technical documentation content in ${maxLength} characters or less. Focus on key topics, procedures, and terminology that would be useful for search indexing:

${content.substring(0, 3000)}

Provide a concise summary:`
        }
      ]
    });

    return response.content[0].text.trim();
  } catch (error) {
    console.error('Summarization error:', error);
    return content.substring(0, maxLength);
  }
}

/**
 * Generate related issue suggestions
 */
async function suggestRelatedIssues(issue, allIssues) {
  try {
    const issueList = allIssues.slice(0, 20).map((i, idx) =>
      `${idx + 1}. ${i.title}`
    ).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Given this issue, identify up to 3 related issues from the list.

Current Issue: ${issue.title}
Description: ${issue.description?.substring(0, 200)}

Other Issues:
${issueList}

Respond with ONLY the numbers of related issues, comma-separated (e.g., "1,5,12").
If no related issues, respond with "NONE".`
        }
      ]
    });

    const result = response.content[0].text.trim();
    if (result === 'NONE') return [];

    return result.split(',')
      .map(n => parseInt(n.trim()) - 1)
      .filter(i => i >= 0 && i < allIssues.length)
      .map(i => allIssues[i].id);
  } catch (error) {
    console.error('Related issues error:', error);
    return [];
  }
}

/**
 * AI-powered column mapping for equipment import
 * Analyzes headers and sample data to suggest the best field mappings
 */
async function suggestColumnMappings(headers, sampleRows, equipmentFields) {
  try {
    // Build a representation of the data
    const sampleData = headers.map(header => {
      const samples = sampleRows
        .map(row => row[header])
        .filter(v => v && v.trim())
        .slice(0, 3);
      return `Column: "${header}"\nSample values: ${samples.length > 0 ? samples.join(', ') : '(empty)'}`;
    }).join('\n\n');

    const fieldDescriptions = {
      name: 'Equipment name/title (required) - the primary identifier for the equipment',
      model: 'Model number or product model name',
      serial_number: 'Serial number or unique identifier for individual units',
      manufacturer: 'Manufacturer, brand, or vendor name',
      location: 'Physical location, room, building, or site where equipment is located',
      description: 'General description, notes, or additional details about the equipment'
    };

    const fieldList = equipmentFields.map(f => `- ${f}: ${fieldDescriptions[f] || f}`).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are helping map spreadsheet columns to equipment database fields for an import.

Analyze these spreadsheet columns and their sample values:

${sampleData}

Available equipment fields to map to:
${fieldList}

For each spreadsheet column, determine the best matching equipment field based on:
1. The column header name
2. The actual data values in the samples
3. The meaning and purpose of each field

Respond in this exact JSON format (no markdown, just the JSON object):
{
  "mappings": {
    "Column Header 1": "field_name or null",
    "Column Header 2": "field_name or null"
  },
  "confidence": "high/medium/low",
  "notes": "Brief explanation of any uncertain mappings"
}

Use null for columns that don't match any equipment field. Each equipment field should only be mapped once (to its best match).`
        }
      ]
    });

    const text = response.content[0].text.trim();

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      // Convert null values to empty strings and filter valid mappings
      const mappings = {};
      for (const [header, field] of Object.entries(result.mappings || {})) {
        if (field && equipmentFields.includes(field)) {
          mappings[header] = field;
        }
      }

      return {
        mappings,
        confidence: result.confidence || 'medium',
        notes: result.notes || ''
      };
    }

    return { mappings: {}, confidence: 'low', notes: 'Could not parse AI response' };
  } catch (error) {
    console.error('AI column mapping error:', error);
    return { mappings: {}, confidence: 'low', notes: 'AI analysis failed' };
  }
}

module.exports = {
  searchAssistant,
  suggestCategory,
  checkDuplicate,
  summarizeContent,
  suggestRelatedIssues,
  suggestColumnMappings
};
