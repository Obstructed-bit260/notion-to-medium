const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

/**
 * Download all images found in markdown, save locally, and rewrite URLs.
 * This fixes Notion's temporary signed S3 URLs that expire after ~1 hour.
 */
async function downloadAndReplaceImages(markdown, outputDir) {
  const imgDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // Match both markdown images ![alt](url) and raw <img src="url"> tags
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const htmlImageRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g;

  // Collect all unique image URLs
  const images = new Map(); // url → local filename
  let match;

  while ((match = mdImageRegex.exec(markdown)) !== null) {
    const url = match[2].trim();
    if (!images.has(url) && url.startsWith('http')) {
      const ext = guessExtension(url);
      const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
      images.set(url, `img-${hash}${ext}`);
    }
  }

  while ((match = htmlImageRegex.exec(markdown)) !== null) {
    const url = match[1].trim();
    if (!images.has(url) && url.startsWith('http')) {
      const ext = guessExtension(url);
      const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
      images.set(url, `img-${hash}${ext}`);
    }
  }

  if (images.size === 0) return markdown;

  console.log(`🖼️  Downloading ${images.size} image(s)...`);

  // Download all images in parallel
  const downloads = [];
  for (const [url, filename] of images) {
    const localPath = path.join(imgDir, filename);
    downloads.push(
      downloadFile(url, localPath)
        .then(() => {
          console.log(`   ✓ ${filename}`);
          return { url, filename, success: true };
        })
        .catch((err) => {
          console.log(`   ✗ ${filename} — ${err.message}`);
          return { url, filename, success: false };
        })
    );
  }

  const results = await Promise.all(downloads);

  // Replace URLs in markdown with local paths
  let updated = markdown;
  for (const { url, filename, success } of results) {
    if (success) {
      // Escape special regex characters in the URL
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updated = updated.replace(new RegExp(escaped, 'g'), `images/${filename}`);
    }
  }

  return updated;
}

/**
 * Download a file from a URL to a local path, following redirects.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      };

    const request = protocol.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Guess file extension from URL (strip query params first)
 */
function guessExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext)) {
      return ext;
    }
  } catch {}
  return '.png'; // default fallback
}

module.exports = { downloadAndReplaceImages };
