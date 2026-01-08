const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

let browser = null;
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
 * Get or create a browser instance
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
  }
  return browser;
}

/**
 * Use Claude to find the best product page URL
 */
async function findProductPageUrl(manufacturer, model, productName) {
  const anthropic = getClient();
  if (!anthropic) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Find the official product page URL for this broadcast equipment:
Manufacturer: ${manufacturer || 'Unknown'}
Model: ${model || 'Unknown'}
Product Name: ${productName || 'N/A'}

Known manufacturer websites:
- Ross Video: rossvideo.com
- Blackmagic Design: blackmagicdesign.com
- AJA: aja.com
- Novastar: novastar.tech or novastartech.com
- Brompton: bromptontech.com
- Tektronix: tek.com
- Panasonic: pro-av.panasonic.net
- Arista: arista.com

Return ONLY a JSON object:
{
  "url": "the most likely product page URL",
  "confidence": "high/medium/low"
}

If you cannot determine a URL, return:
{"url": null, "confidence": "none"}`
        }
      ]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('Find product URL error:', error);
    return null;
  }
}

/**
 * Take a screenshot of a product page and extract the main product image
 */
async function screenshotProductPage(url, outputDir) {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit for images to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to find and screenshot the main product image
    // Look for common product image selectors
    const imageSelectors = [
      '.product-image img',
      '.product-hero img',
      '.main-image img',
      '#product-image',
      '[data-product-image]',
      '.gallery-image img',
      '.product-photo img',
      'article img',
      '.hero img',
      'main img'
    ];

    let imageElement = null;
    for (const selector of imageSelectors) {
      try {
        imageElement = await page.$(selector);
        if (imageElement) {
          const box = await imageElement.boundingBox();
          if (box && box.width > 200 && box.height > 200) {
            break;
          }
          imageElement = null;
        }
      } catch (e) {
        continue;
      }
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `${uuidv4()}.png`;
    const filepath = path.join(outputDir, filename);

    if (imageElement) {
      // Screenshot just the product image element
      await imageElement.screenshot({ path: filepath });
    } else {
      // Take a cropped screenshot of the upper portion (where product images usually are)
      await page.screenshot({
        path: filepath,
        clip: {
          x: 200,
          y: 100,
          width: 800,
          height: 600
        }
      });
    }

    // Verify the screenshot was created and has content
    const stats = fs.statSync(filepath);
    if (stats.size < 5000) {
      fs.unlinkSync(filepath);
      throw new Error('Screenshot too small');
    }

    return {
      success: true,
      filename,
      filepath,
      size: stats.size
    };

  } catch (error) {
    console.error('Screenshot error:', error);
    throw error;
  } finally {
    await page.close();
  }
}

/**
 * Full flow: find product page and take screenshot
 */
async function captureProductImage(manufacturer, model, productName, outputDir) {
  try {
    // Find the product page URL
    const urlResult = await findProductPageUrl(manufacturer, model, productName);

    if (!urlResult || !urlResult.url) {
      return {
        success: false,
        error: 'Could not find product page URL'
      };
    }

    console.log(`Found product URL: ${urlResult.url}`);

    // Take screenshot
    const screenshotResult = await screenshotProductPage(urlResult.url, outputDir);

    return {
      success: true,
      filename: screenshotResult.filename,
      filepath: screenshotResult.filepath,
      source_url: urlResult.url,
      method: 'screenshot'
    };

  } catch (error) {
    console.error('Capture product image error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Close the browser instance (call on server shutdown)
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = {
  findProductPageUrl,
  screenshotProductPage,
  captureProductImage,
  closeBrowser
};
