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
 * Use Claude to find the best product page URL with better validation
 */
async function findProductPageUrl(manufacturer, model, productName) {
  const anthropic = getClient();
  if (!anthropic) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `I need to find the official product page URL for this broadcast/AV equipment:

Manufacturer: ${manufacturer || 'Unknown'}
Model: ${model || 'Unknown'}
Product Name: ${productName || 'N/A'}

IMPORTANT RULES:
1. Only return URLs you are HIGHLY confident exist
2. Use the correct official manufacturer website domain
3. If the manufacturer is unknown or you're not sure about the URL, return null
4. Do NOT guess or make up URLs - only return URLs that follow known patterns for that manufacturer

Known manufacturer URL patterns:
- Ross Video: rossvideo.com/products-services/...
- Blackmagic Design: blackmagicdesign.com/products/...
- AJA Video: aja.com/products/...
- Novastar: novastartech.com/products/... or novastar.tech/products/...
- Brompton: bromptontech.com/products/...
- Tektronix: tek.com/products/...
- Panasonic: na.panasonic.com/us/... or pro-av.panasonic.net/...
- Arista: arista.com/en/products/...
- FS.com: fs.com/products/...
- Blackmagic: blackmagicdesign.com/products/...
- Decimator: decimator.com/products/...
- APC: apc.com/...
- Cisco: cisco.com/...
- Sony: pro.sony/...

Return ONLY a JSON object:
{
  "url": "the product page URL or null if uncertain",
  "confidence": "high/medium/low/none",
  "manufacturer_verified": true/false
}

If confidence is low or none, set url to null. Only return a URL if you're reasonably sure it exists.`
        }
      ]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      // Only return URLs with reasonable confidence
      if (result.confidence === 'none' || result.confidence === 'low') {
        return { url: null, confidence: 'none' };
      }
      return result;
    }
    return null;
  } catch (error) {
    console.error('Find product URL error:', error);
    return null;
  }
}

/**
 * Check if a page is a valid product page (not 404, error, etc)
 */
async function isValidProductPage(page) {
  try {
    // Check page title for error indicators
    const title = await page.title();
    const titleLower = title.toLowerCase();

    const errorIndicators = [
      '404', 'not found', 'page not found', 'error',
      'unavailable', 'doesn\'t exist', 'does not exist',
      'sorry', 'oops', 'no longer available'
    ];

    for (const indicator of errorIndicators) {
      if (titleLower.includes(indicator)) {
        console.log(`Page appears to be an error page (title: ${title})`);
        return false;
      }
    }

    // Check for error content in the page body
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      return body.innerText.substring(0, 2000).toLowerCase();
    });

    const bodyErrorIndicators = [
      'page not found', '404 error', 'this page doesn\'t exist',
      'product not found', 'item not found', 'no results',
      'we couldn\'t find', 'sorry, we can\'t find'
    ];

    for (const indicator of bodyErrorIndicators) {
      if (bodyText.includes(indicator)) {
        console.log(`Page appears to be an error page (content match: ${indicator})`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking page validity:', error);
    return true; // Assume valid if we can't check
  }
}

/**
 * Try to find and download the main product image from the page
 */
async function extractProductImage(page, outputDir) {
  try {
    // Look for product images with common selectors and attributes
    const imageSelectors = [
      // Specific product image selectors
      '.product-image img',
      '.product-hero img',
      '.product-photo img',
      '.main-image img',
      '#product-image img',
      '[data-product-image] img',
      '.gallery-image img',
      '.product-media img',
      '.product-gallery img',
      // Hero/main content images
      '.hero-image img',
      'article img',
      '.content-image img',
      // Data attributes commonly used for product images
      'img[data-zoom-image]',
      'img[data-large-image]',
      'img[data-main-image]',
      // Generic but high in page
      'main img',
      '.main-content img'
    ];

    for (const selector of imageSelectors) {
      try {
        const images = await page.$$(selector);

        for (const img of images) {
          const box = await img.boundingBox();

          // Skip small images
          if (!box || box.width < 200 || box.height < 150) continue;

          // Get the image source
          const src = await img.evaluate(el => {
            return el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src');
          });

          if (!src || src.includes('placeholder') || src.includes('loading')) continue;

          // Check if image is visible and reasonable size
          const isVisible = await img.isIntersectingViewport();
          if (!isVisible && box.y > 1500) continue; // Skip images too far down

          // Found a good candidate - screenshot this element
          const filename = `${uuidv4()}.png`;
          const filepath = path.join(outputDir, filename);

          await img.screenshot({ path: filepath });

          // Verify the screenshot
          const stats = fs.statSync(filepath);
          if (stats.size > 5000) { // At least 5KB
            console.log(`Extracted product image from selector: ${selector}`);
            return {
              success: true,
              filename,
              filepath,
              size: stats.size
            };
          } else {
            fs.unlinkSync(filepath);
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting product image:', error);
    return null;
  }
}

/**
 * Take a screenshot of a product page with smart extraction
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
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check HTTP status
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()}`);
    }

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if it's a valid product page
    const isValid = await isValidProductPage(page);
    if (!isValid) {
      throw new Error('Page appears to be an error or not-found page');
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // First, try to extract just the product image
    const extractedImage = await extractProductImage(page, outputDir);
    if (extractedImage) {
      return extractedImage;
    }

    // Fallback: Take a smart screenshot of the product area
    // Try to find the main product container
    const productContainerSelectors = [
      '.product-container',
      '.product-detail',
      '.product-info',
      '.product-main',
      '#product',
      'article.product',
      '.hero-section',
      'main'
    ];

    for (const selector of productContainerSelectors) {
      try {
        const container = await page.$(selector);
        if (container) {
          const box = await container.boundingBox();
          if (box && box.width > 400 && box.height > 300) {
            const filename = `${uuidv4()}.png`;
            const filepath = path.join(outputDir, filename);

            // Screenshot the container with some padding
            await container.screenshot({ path: filepath });

            const stats = fs.statSync(filepath);
            if (stats.size > 10000) {
              console.log(`Captured product container: ${selector}`);
              return {
                success: true,
                filename,
                filepath,
                size: stats.size
              };
            } else {
              fs.unlinkSync(filepath);
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Last resort: Take a cropped screenshot of the upper portion
    const filename = `${uuidv4()}.png`;
    const filepath = path.join(outputDir, filename);

    await page.screenshot({
      path: filepath,
      clip: {
        x: 100,
        y: 100,
        width: 1000,
        height: 700
      }
    });

    const stats = fs.statSync(filepath);
    if (stats.size < 10000) {
      fs.unlinkSync(filepath);
      throw new Error('Screenshot too small or empty');
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
        error: 'Could not find confident product page URL'
      };
    }

    // Skip if confidence is too low
    if (urlResult.confidence === 'low' || urlResult.confidence === 'none') {
      return {
        success: false,
        error: 'Low confidence in product URL - skipping'
      };
    }

    console.log(`Found product URL (${urlResult.confidence}): ${urlResult.url}`);

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
