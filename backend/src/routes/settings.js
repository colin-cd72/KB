const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

const envPath = path.join(__dirname, '../../.env');

// Helper to read .env file
function readEnvFile() {
  try {
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });
    return env;
  } catch (error) {
    console.error('Error reading .env:', error);
    return {};
  }
}

// Helper to write .env file
function writeEnvFile(envVars) {
  try {
    const content = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(envPath, content + '\n');
    return true;
  } catch (error) {
    console.error('Error writing .env:', error);
    return false;
  }
}

// Mask API key for display
function maskApiKey(key) {
  if (!key) return null;
  if (key.length <= 12) return '****';
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
}

// Get AI settings (admin only)
router.get('/ai', authenticate, isAdmin, async (req, res, next) => {
  try {
    const envVars = readEnvFile();
    const apiKey = envVars.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;

    res.json({
      has_api_key: !!apiKey,
      api_key_masked: maskApiKey(apiKey),
      model: 'claude-sonnet-4-20250514'
    });
  } catch (error) {
    next(error);
  }
});

// Update AI API key (admin only)
router.put('/ai', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { api_key } = req.body;

    if (!api_key || !api_key.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid API key format. Key should start with "sk-"' });
    }

    // Read existing env vars
    const envVars = readEnvFile();

    // Update the API key
    envVars.CLAUDE_API_KEY = api_key;

    // Write back
    if (!writeEnvFile(envVars)) {
      return res.status(500).json({ error: 'Failed to save API key' });
    }

    // Update process.env for immediate use
    process.env.CLAUDE_API_KEY = api_key;

    res.json({
      success: true,
      message: 'API key updated successfully',
      api_key_masked: maskApiKey(api_key)
    });
  } catch (error) {
    next(error);
  }
});

// Test AI API key (admin only)
router.post('/ai/test', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { api_key } = req.body;

    // Use provided key or existing one
    const keyToTest = api_key || process.env.CLAUDE_API_KEY;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        error: 'No API key configured'
      });
    }

    // Test the API key
    const client = new Anthropic({ apiKey: keyToTest });

    const startTime = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'Say "API key is working!" in exactly those words.' }
      ]
    });
    const responseTime = Date.now() - startTime;

    const reply = response.content[0].text;

    res.json({
      success: true,
      message: 'API key is valid and working',
      response: reply,
      response_time_ms: responseTime,
      model: response.model,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      }
    });
  } catch (error) {
    console.error('API key test error:', error);

    let errorMessage = 'Failed to connect to Claude API';
    if (error.status === 401) {
      errorMessage = 'Invalid API key - authentication failed';
    } else if (error.status === 403) {
      errorMessage = 'API key does not have permission to use this model';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit exceeded - too many requests';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
});

module.exports = router;
