const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const { captureProductImage } = require('./screenshotService');

let client = null;

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
 * Get product image URL suggestions using Claude
 */
async function findProductImageUrl(manufacturer, model, productName = '') {
  const anthropic = getClient();
  if (!anthropic) {
    return { found: false, error: 'Claude API key not configured' };
  }

  try {
    const systemPrompt = `You are a broadcast equipment image finder. Your task is to provide the most likely official product image URL for professional AV equipment.

Focus on these manufacturer image sources:
- Ross Video: rossvideo.com product pages (look for /files/ or /images/)
- Blackmagic Design: blackmagicdesign.com/products images
- AJA: aja.com product images
- Novastar: novastar.tech product images
- Brompton: bromptontech.com product images
- Tektronix: tek.com product images
- Panasonic: pro-av.panasonic.net product images
- Arista: arista.com product images

Return ONLY a JSON object with this format:
{
  "found": true/false,
  "image_url": "direct URL to product image (jpg/png/webp)",
  "source": "manufacturer website or other source",
  "confidence": "high/medium/low"
}

Important:
- Only return URLs that are likely to be direct image files
- Prefer official manufacturer product images
- If you cannot find a specific image URL, set found to false`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Find an official product image URL for:
Manufacturer: ${manufacturer || 'Unknown'}
Model: ${model || 'Unknown'}
Product Name: ${productName || 'N/A'}

Return the JSON response only.`
        }
      ]
    });

    const text = response.content[0].text.trim();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        found: result.found || false,
        image_url: result.image_url || null,
        source: result.source || null,
        confidence: result.confidence || 'low'
      };
    }

    return { found: false, error: 'Could not parse response' };
  } catch (error) {
    console.error('Product image search error:', error);
    return { found: false, error: error.message };
  }
}

/**
 * Download an image from URL and save locally
 */
async function downloadImage(imageUrl, destinationDir) {
  return new Promise((resolve, reject) => {
    try {
      // Validate URL
      let parsedUrl;
      try {
        parsedUrl = new URL(imageUrl);
      } catch (e) {
        return reject(new Error('Invalid URL'));
      }

      // Ensure destination directory exists
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }

      // Determine file extension from URL
      let ext = path.extname(parsedUrl.pathname).toLowerCase();
      if (!ext || !['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        ext = '.jpg'; // Default to jpg
      }

      const filename = `${uuidv4()}${ext}`;
      const filepath = path.join(destinationDir, filename);
      const file = fs.createWriteStream(filepath);

      const protocol = imageUrl.startsWith('https') ? https : http;

      const request = protocol.get(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': parsedUrl.origin
        },
        timeout: 15000
      }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
          return downloadImage(response.headers.location, destinationDir)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          // Verify it's a valid image (check file size)
          try {
            const stats = fs.statSync(filepath);
            if (stats.size < 1000) {
              fs.unlinkSync(filepath);
              return reject(new Error('Downloaded file too small, likely not an image'));
            }
            resolve({
              filename,
              filepath,
              size: stats.size
            });
          } catch (e) {
            reject(new Error('Failed to verify downloaded file'));
          }
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        reject(new Error('Request timeout'));
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Fetch product image for equipment - tries direct download first, then screenshot
 */
async function fetchEquipmentImage(manufacturer, model, productName, uploadDir) {
  // Method 1: Try direct image download
  try {
    const searchResult = await findProductImageUrl(manufacturer, model, productName);

    if (searchResult.found && searchResult.image_url) {
      try {
        const downloadResult = await downloadImage(searchResult.image_url, uploadDir);
        return {
          success: true,
          filename: downloadResult.filename,
          filepath: downloadResult.filepath,
          source: searchResult.source,
          original_url: searchResult.image_url,
          method: 'direct_download'
        };
      } catch (downloadError) {
        console.log('Direct download failed, trying screenshot:', downloadError.message);
      }
    }
  } catch (error) {
    console.log('Image URL search failed, trying screenshot:', error.message);
  }

  // Method 2: Try screenshot capture
  try {
    const screenshotResult = await captureProductImage(manufacturer, model, productName, uploadDir);

    if (screenshotResult.success) {
      return {
        success: true,
        filename: screenshotResult.filename,
        filepath: screenshotResult.filepath,
        source: screenshotResult.source_url,
        method: 'screenshot'
      };
    }

    return {
      success: false,
      error: screenshotResult.error || 'Both download and screenshot failed'
    };
  } catch (error) {
    console.error('Fetch equipment image error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  findProductImageUrl,
  downloadImage,
  fetchEquipmentImage
};
