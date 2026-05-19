#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { NotionClient } = require('./notion');
const { NotionToMediumConverter } = require('./converter');
const { buildPreviewHtml } = require('./template');
const { downloadAndReplaceImages } = require('./images');

// ── Get page ID from args ──

const pageId = process.argv[2];

if (!pageId || pageId === '--help' || pageId === '-h') {
  console.log(`
  Usage:  node src/cli.js <notion-page-id>

  Example:
    node src/cli.js abc123def456

  The page ID is the hex string at the end of your Notion page URL:
  https://notion.so/My-Page-Title-abc123def456
                                  ^^^^^^^^^^^^^^
  `);
  process.exit(pageId ? 0 : 1);
}

// ── Validate token ──

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error(`
❌ NOTION_TOKEN not found.

  1. Create an integration at https://www.notion.so/my-integrations
  2. Copy the token
  3. Create a .env file:  cp .env.example .env
  4. Paste your token in .env
  5. Share your Notion page with the integration
  `);
  process.exit(1);
}

// ── Run ──

(async () => {
  try {
    const notion = new NotionClient(token);
    const converter = new NotionToMediumConverter();
    const outputDir = path.join(__dirname, '..', 'output');

    // 1. Fetch page info
    console.log(`\n📄 Fetching page...`);
    const info = await notion.getPageInfo(pageId);
    console.log(`   "${info.title}"`);
    if (info.tags.length) console.log(`   Tags: ${info.tags.join(', ')}`);

    // 2. Fetch image URLs directly from blocks API
    console.log('🖼️  Fetching images...');
    const imageMap = await notion.getImageUrls(pageId);
    const imagesWithUrls = [...imageMap.values()].filter((v) => v.url);
    const imagesWithoutUrls = [...imageMap.values()].filter((v) => !v.url);

    if (imageMap.size > 0) {
      console.log(`   Found ${imageMap.size} image(s)`);
      if (imagesWithUrls.length > 0)
        console.log(`   ✓ ${imagesWithUrls.length} with URLs`);
      if (imagesWithoutUrls.length > 0)
        console.log(
          `   ⚠ ${imagesWithoutUrls.length} missing URLs (check integration "Files & media" capability)`
        );
    }

    // 3. Convert to markdown
    console.log('⚙️  Converting...');
    let markdown = await notion.getPageMarkdown(pageId);

    // 4. Inject real image URLs into markdown
    //    notion-to-md produces ![alt]() with empty URLs when API doesn't return them
    //    If we have URLs from the blocks API, inject them sequentially
    if (imagesWithUrls.length > 0) {
      let urlIndex = 0;
      markdown = markdown.replace(
        /!\[([^\]]*)\]\(([^)]*)\)/g,
        (match, alt, url) => {
          // If URL is empty or missing, inject from our image map
          if (!url || url.trim() === '') {
            if (urlIndex < imagesWithUrls.length) {
              const img = imagesWithUrls[urlIndex++];
              const caption = alt || img.caption || 'image';
              return `![${caption}](${img.url})`;
            }
          }
          return match;
        }
      );
    }

    // 5. Convert to Medium HTML
    const html = converter.convert(markdown);
    const wordCount = converter.getWordCount(html);
    const readTime = Math.max(1, Math.ceil(wordCount / 265));
    console.log(`   ${wordCount} words · ${readTime} min read`);

    // 7. Build preview
    const previewHtml = buildPreviewHtml({
      title: info.title,
      content: html,
      tags: info.tags,
      wordCount,
      notionUrl: info.url,
    });

    // 8. Save
    const slug = info.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const filepath = path.join(outputDir, `${slug}.html`);
    fs.writeFileSync(filepath, previewHtml, 'utf-8');

    // 9. Open in browser
    try {
      execSync(`open "${filepath}"`);
    } catch {}

    console.log(`\n✅ Done! Opened in browser.`);
    console.log(`   Click "Copy Article" → paste into Medium.\n`);
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    if (err.code === 'unauthorized' || err.status === 401) {
      console.error(
        '   Check your NOTION_TOKEN and ensure the page is shared with your integration.'
      );
    }
    if (err.code === 'object_not_found' || err.status === 404) {
      console.error(
        "   Page not found. Check the page ID and ensure it's shared with your integration."
      );
    }
    process.exit(1);
  }
})();
