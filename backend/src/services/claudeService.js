const Anthropic = require('@anthropic-ai/sdk');

let client = null;

// Only initialize client if API key is configured
function getClient() {
  if (!process.env.CLAUDE_API_KEY) {
    return null;
  }
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });
  }
  return client;
}

/**
 * Search assistant - analyzes query with context and provides helpful response
 */
async function searchAssistant(userQuery, context, includeWeb = false) {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error('Claude API key not configured');
  }

  try {
    const systemPrompt = `You are a broadcast engineering technical support assistant for a professional AV knowledge base.
You specialize in Ross Video, Novastar, LED panels, Brompton, Blackmagic, AJA, Tektronix, Panasonic projectors, Arista switches, video fiber, 12G/3G SDI, and broadcast networking.

Guidelines:
- Be concise and practical with broadcast-specific solutions
- Provide step-by-step troubleshooting when applicable
- Reference specific information from the context provided
- Include relevant menu paths, settings, or CLI commands when helpful
- If the context doesn't have enough information, provide general broadcast engineering guidance
- Suggest related topics the user might want to explore
- Format your response with clear sections and bullet points when appropriate`;

    let userMessage = `User question: ${userQuery}`;

    if (context) {
      userMessage += `\n\nContext from knowledge base:\n${context}`;
    }

    if (includeWeb) {
      userMessage += `\n\nPlease also consider general best practices and common solutions for this type of problem.`;
    }

    const response = await anthropic.messages.create({
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
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const categoryList = categories.map(c => `- ${c.name}: ${c.description || 'No description'}`).join('\n');

    const response = await anthropic.messages.create({
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
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    if (existingIssues.length === 0) return null;

    const issueList = existingIssues.slice(0, 10).map((issue, i) =>
      `${i + 1}. [ID: ${issue.id}] ${issue.title}`
    ).join('\n');

    const response = await anthropic.messages.create({
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
  const anthropic = getClient();
  if (!anthropic) return content.substring(0, maxLength);

  try {
    const response = await anthropic.messages.create({
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
  const anthropic = getClient();
  if (!anthropic) return [];

  try {
    const issueList = allIssues.slice(0, 20).map((i, idx) =>
      `${idx + 1}. ${i.title}`
    ).join('\n');

    const response = await anthropic.messages.create({
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
  const anthropic = getClient();
  if (!anthropic) {
    return { mappings: {}, confidence: 'low', notes: 'AI not configured' };
  }

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

    const response = await anthropic.messages.create({
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

/**
 * Suggest a solution for a new issue based on similar issues, documentation, and web knowledge
 */
async function suggestSolution(problemDescription, context, conversationHistory = []) {
  const anthropic = getClient();
  if (!anthropic) {
    return null;
  }

  try {
    const systemPrompt = `You are an expert broadcast engineering and professional AV technical support assistant. You specialize in:

CORE EQUIPMENT KNOWLEDGE:
- Ross Video (Carbonite, Ultrix, XPression, Dashboard, NK routers, openGear)
- Novastar (LED controllers, MCTRL series, VX series, NovaLCT)
- LED video walls and panels (calibration, mapping, color management)
- Brompton Technology (Tessera processors, LED processing)
- Blackmagic Design (ATEM switchers, HyperDeck, DeckLink, Teranex, Smart Videohub)
- AJA (FS converters, Ki Pro, Corvid, KUMO routers)
- Tektronix (waveform monitors, rasterizers, signal analysis)
- Panasonic broadcast projectors (PT-RQ/RZ series, geometry, edge blending)
- Video servers and playback systems
- Arista networking switches (configuration, VLANs, multicast)
- Video over IP (SMPTE 2110, NDI, Dante)
- SDI infrastructure (12G-SDI, 3G-SDI, fiber transport, signal distribution)
- Video fiber systems and SFP modules

Your job is to help solve broadcast/AV problems BEFORE they need to submit an issue ticket. Use:
1. The provided context from similar resolved issues and documentation
2. Your deep knowledge of broadcast video standards, protocols, and equipment
3. Common troubleshooting approaches from manufacturer documentation and broadcast engineering practices

Response Guidelines:
- If you have enough information to suggest a solution, provide clear actionable steps
- Ask about signal flow, error codes, firmware versions, or connection types if relevant
- Reference any similar resolved issues from the knowledge base
- Include specific menu paths, commands, or settings when applicable
- Mention known firmware issues or compatibility considerations
- Keep responses focused and practical (under 300 words)

When asking clarifying questions, format them as:
QUESTIONS:
1. [Your question here]
2. [Another question if needed]

After questions, still provide any preliminary suggestions you can based on available information.`;

    let messages = [];

    // Add conversation history if exists
    if (conversationHistory.length > 0) {
      messages = [...conversationHistory];
    }

    // Build the current user message
    let userMessage = `Problem: ${problemDescription}`;

    if (context) {
      userMessage += `\n\n${context}`;
    }

    if (conversationHistory.length === 0) {
      userMessage += `\n\nAnalyze this problem using your broad technical knowledge. If you need more information to provide a better solution, ask specific clarifying questions. Also provide any preliminary suggestions based on what you know.`;
    }

    messages.push({ role: 'user', content: userMessage });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: messages
    });

    const responseText = response.content[0].text;

    // Parse out questions if any
    const hasQuestions = responseText.includes('QUESTIONS:') || responseText.includes('Question:') || responseText.match(/\?\s*\n/g)?.length >= 2;

    // Extract questions
    let questions = [];
    const questionsMatch = responseText.match(/QUESTIONS:\s*([\s\S]*?)(?=\n\n|$)/i);
    if (questionsMatch) {
      const questionLines = questionsMatch[1].split('\n').filter(line => line.trim());
      questions = questionLines.map(q => q.replace(/^\d+\.\s*/, '').trim()).filter(q => q);
    }

    return {
      suggestion: responseText,
      hasQuestions,
      questions,
      conversationHistory: messages
    };
  } catch (error) {
    console.error('Solution suggestion error:', error);
    throw error;
  }
}

/**
 * Continue conversation with Claude for issue resolution
 */
async function continueSolutionConversation(answer, conversationHistory) {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error('Claude API key not configured');
  }

  try {
    const systemPrompt = `You are an expert broadcast engineering support assistant continuing to help solve a technical problem. You specialize in Ross Video, Novastar, LED panels, Brompton, Blackmagic, AJA, Tektronix, Panasonic projectors, Arista switches, video fiber, and SDI infrastructure.

Based on the user's response:
1. Provide a more targeted solution now that you have more information
2. Include specific troubleshooting steps with menu paths or commands where applicable
3. Reference any relevant knowledge from the conversation
4. Consider signal flow, firmware versions, and compatibility issues
5. If you still need clarification, ask ONE more focused question
6. Be practical and action-oriented

Keep your response under 300 words.`;

    const messages = [
      ...conversationHistory,
      { role: 'user', content: `User's response: ${answer}` }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.slice(-6) // Keep last 6 messages for context
    });

    const responseText = response.content[0].text;
    const hasQuestions = responseText.includes('?') && (responseText.includes('QUESTION:') || responseText.match(/\?\s*$/m));

    return {
      suggestion: responseText,
      hasQuestions,
      conversationHistory: messages
    };
  } catch (error) {
    console.error('Conversation continuation error:', error);
    throw error;
  }
}

/**
 * Analyze an image attached to an issue for troubleshooting
 */
async function analyzeIssueImage(base64Image, mimeType, issueTitle, issueDescription, additionalContext = '') {
  const anthropic = getClient();
  if (!anthropic) {
    throw new Error('Claude API key not configured');
  }

  try {
    const systemPrompt = `You are an expert broadcast engineering diagnostic assistant specializing in professional AV equipment analysis. You're analyzing an image attached to a support issue.

Your expertise includes:
- Ross Video equipment (Carbonite, Ultrix, XPression, openGear)
- Novastar LED controllers and processors
- LED panels and video walls
- Brompton Tessera processors
- Blackmagic Design (ATEM, HyperDeck, converters)
- AJA converters and routers
- Tektronix waveform monitors and scopes
- Panasonic broadcast projectors
- Arista network switches
- SDI signals, fiber connections, video waveforms
- Error messages, status LEDs, and diagnostic screens

When analyzing images:
1. Identify the equipment, display, or issue shown
2. Note any error messages, warning lights, or abnormal indicators
3. Analyze signal displays, waveforms, or diagnostic information if visible
4. Identify potential causes based on visual evidence
5. Suggest specific troubleshooting steps
6. Reference relevant settings or menu paths when applicable

Be specific and technical in your analysis. If you can identify the exact equipment model, mention it.`;

    let userContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Image
        }
      },
      {
        type: 'text',
        text: `Please analyze this image in the context of the following issue:

Issue Title: ${issueTitle}
Issue Description: ${issueDescription}
${additionalContext ? `\nAdditional Context: ${additionalContext}` : ''}

What do you see in the image? What might be causing the problem? What troubleshooting steps would you recommend based on this visual evidence?`
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userContent }
      ]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Image analysis error:', error);
    throw new Error('Failed to analyze image');
  }
}

module.exports = {
  searchAssistant,
  suggestCategory,
  checkDuplicate,
  summarizeContent,
  suggestRelatedIssues,
  suggestColumnMappings,
  suggestSolution,
  continueSolutionConversation,
  analyzeIssueImage
};
