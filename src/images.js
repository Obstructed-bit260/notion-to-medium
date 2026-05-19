const fs = require('fs');
const https = require('https');
const http = require('http');

/**
 * Download all images found in markdown and embed them as base64 Data URIs.
 * This fixes Notion's expiring URLs and ensures Medium can process the images
 * when the HTML is copy-pasted (Medium accepts base64 images and auto-uploads them).
 */
async function downloadAndReplaceImages(markdown) {
  // Match both markdown images ![alt](url) and raw <img src="url"> tags
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const htmlImageRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g;

  // Collect all unique image URLs
  const images = new Set();
  let match;

  while ((match = mdImageRegex.exec(markdown)) !== null) {
    const url = match[2].trim();
    if (url.startsWith('http')) images.add(url);
  }

  while ((match = htmlImageRegex.exec(markdown)) !== null) {
    const url = match[1].trim();
    if (url.startsWith('http')) images.add(url);
  }

  if (images.size === 0) return markdown;

  console.log(`🖼️  Downloading ${images.size} image(s) to embed directly...`);

  // Download all images in parallel
  const downloads = [];
  for (const url of images) {
    downloads.push(
      downloadAsBase64(url)
        .then((base64Uri) => {
          console.log(`   ✓ Image downloaded and converted`);
          return { url, base64Uri, success: true };
        })
        .catch((err) => {
          console.log(`   ✗ Failed to download image — ${err.message}`);
          return { url, base64Uri: null, success: false };
        })
    );
  }

  const results = await Promise.all(downloads);

  // Replace URLs in markdown with base64 URIs
  let updated = markdown;
  for (const { url, base64Uri, success } of results) {
    if (success && base64Uri) {
      // Escape special regex characters in the URL
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updated = updated.replace(new RegExp(escaped, 'g'), base64Uri);
    }
  }

  return updated;
}

/**
 * Download a file from a URL to a buffer and return as data URI
 */
function downloadAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    const request = protocol.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadAsBase64(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/png';
        const base64 = buffer.toString('base64');
        resolve(`data:${contentType};base64,${base64}`);
      });
      res.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

module.exports = { downloadAndReplaceImages };
