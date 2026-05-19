#!/usr/bin/env node

require('dotenv').config();

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { NotionClient } = require('./notion');
const { NotionToMediumConverter } = require('./converter');
const { buildPreviewHtml } = require('./template');

const program = new Command();

program
  .name('notion-to-medium')
  .description('Convert Notion pages to Medium-ready HTML')
  .version('1.0.0');

// ── Helpers ──

function getNotionToken() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error(
      '\n❌ NOTION_TOKEN not found.\n\n' +
        '   1. Create an integration at https://www.notion.so/my-integrations\n' +
        '   2. Copy the token\n' +
        '   3. Create a .env file: cp .env.example .env\n' +
        '   4. Paste your token in .env\n' +
        '   5. Share your Notion pages/database with the integration\n'
    );
    process.exit(1);
  }
  return token;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function exportPage(notion, converter, pageId, outputDir, shouldOpen) {
  // Fetch page info
  console.log(`\n📄 Fetching page: ${pageId}`);
  const info = await notion.getPageInfo(pageId);
  console.log(`   Title: ${info.title}`);
  console.log(`   Tags:  ${info.tags.length ? info.tags.join(', ') : '(none)'}`);

  // Convert to markdown
  console.log('   Converting to markdown...');
  const markdown = await notion.getPageMarkdown(pageId);

  // Convert to HTML
  console.log('   Generating Medium-ready HTML...');
  const html = converter.convert(markdown);
  const wordCount = converter.getWordCount(html);
  console.log(`   Words: ${wordCount}`);

  // Build preview page
  const previewHtml = buildPreviewHtml({
    title: info.title,
    content: html,
    tags: info.tags,
    wordCount,
    notionUrl: info.url,
  });

  // Save to file
  const filename = `${slugify(info.title)}.html`;
  const filepath = path.join(outputDir, filename);
  ensureOutputDir(outputDir);
  fs.writeFileSync(filepath, previewHtml, 'utf-8');
  console.log(`   ✅ Saved: ${filepath}`);

  // Auto-open in browser
  if (shouldOpen) {
    try {
      execSync(`open "${filepath}"`);
      console.log('   🌐 Opened in browser');
    } catch {
      console.log(`   💡 Open manually: file://${path.resolve(filepath)}`);
    }
  }

  return { title: info.title, filepath, wordCount };
}

// ── Commands ──

program
  .command('export <pageId>')
  .description('Export a single Notion page to Medium-ready HTML')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--no-open', 'Do not auto-open in browser')
  .action(async (pageId, opts) => {
    try {
      const token = getNotionToken();
      const notion = new NotionClient(token);
      const converter = new NotionToMediumConverter();

      await exportPage(notion, converter, pageId, opts.output, opts.open);

      console.log(
        '\n🎯 Next: Click "Copy Article" in the browser → paste into Medium editor\n'
      );
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}\n`);
      if (err.code === 'unauthorized') {
        console.error(
          '   Check your NOTION_TOKEN and ensure the page is shared with your integration.'
        );
      }
      process.exit(1);
    }
  });

program
  .command('batch <databaseId>')
  .description('Export all pages from a Notion database')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-s, --status <status>', 'Filter by status property value')
  .option('--no-open', 'Do not auto-open in browser')
  .action(async (databaseId, opts) => {
    try {
      const token = getNotionToken();
      const notion = new NotionClient(token);
      const converter = new NotionToMediumConverter();

      console.log(`\n📚 Querying database: ${databaseId}`);
      if (opts.status) {
        console.log(`   Filter: status = "${opts.status}"`);
      }

      const pages = await notion.getDatabasePages(databaseId, opts.status);
      console.log(`   Found ${pages.length} page(s)\n`);

      if (pages.length === 0) {
        console.log('   No pages matched the filter. Exiting.\n');
        return;
      }

      const results = [];
      for (const page of pages) {
        try {
          const result = await exportPage(
            notion,
            converter,
            page.id,
            opts.output,
            false // don't auto-open each page in batch mode
          );
          results.push(result);
        } catch (err) {
          console.error(`   ⚠️  Failed: ${page.title} — ${err.message}`);
        }
      }

      // Build index page for batch exports
      if (results.length > 0) {
        const indexHtml = buildIndexPage(results);
        const indexPath = path.join(opts.output, '_index.html');
        fs.writeFileSync(indexPath, indexHtml, 'utf-8');
        console.log(`\n📋 Index page: ${indexPath}`);

        if (opts.open) {
          try {
            execSync(`open "${indexPath}"`);
          } catch {}
        }
      }

      console.log(
        `\n✅ Exported ${results.length}/${pages.length} pages to ${opts.output}\n`
      );
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}\n`);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify your Notion token and connection')
  .action(async () => {
    try {
      const token = getNotionToken();
      const { Client } = require('@notionhq/client');
      const client = new Client({ auth: token });

      console.log('\n🔑 Testing Notion connection...');
      const response = await client.users.me({});
      console.log(`   ✅ Connected as: ${response.name || response.id}`);
      console.log(`   Type: ${response.type}`);
      console.log('\n   Your token is working! You can now export pages.\n');
    } catch (err) {
      console.error(`\n❌ Connection failed: ${err.message}\n`);
      process.exit(1);
    }
  });

// ── Index Page for Batch Exports ──

function buildIndexPage(results) {
  const rows = results
    .map(
      (r) =>
        `<tr>
          <td><a href="${path.basename(r.filepath)}">${r.title}</a></td>
          <td>${r.wordCount} words</td>
          <td>${Math.max(1, Math.ceil(r.wordCount / 265))} min</td>
        </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Batch Export Index</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: Inter, sans-serif; max-width: 700px; margin: 60px auto; padding: 0 24px; color: #242424; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #757575; font-size: 14px; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 15px; }
    th { color: #757575; font-weight: 500; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    a { color: #1a8917; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>📚 Batch Export</h1>
  <p>${results.length} articles exported — click to preview, then copy to Medium</p>
  <table>
    <thead><tr><th>Article</th><th>Length</th><th>Read Time</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

program.parse();
