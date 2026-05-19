/**
 * Generates a Medium-style HTML preview page with a "Copy Article" button.
 * The user can review the article, then click Copy → paste into Medium's editor.
 */
function buildPreviewHtml({ title, content, tags, wordCount, notionUrl }) {
  const tagBadges = tags
    .map((t) => `<span class="tag">${t}</span>`)
    .join('');

  const readTime = Math.max(1, Math.ceil(wordCount / 265));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Medium Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Charter:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Charter, Georgia, 'Times New Roman', serif;
      background: #f9f9f9;
      color: #242424;
      line-height: 1.8;
      font-size: 18px;
    }

    /* ── Toolbar ── */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #e6e6e6;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: Inter, sans-serif;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .toolbar-logo {
      font-weight: 600;
      font-size: 14px;
      color: #191919;
      letter-spacing: -0.3px;
    }

    .toolbar-meta {
      font-size: 13px;
      color: #757575;
    }

    .btn-copy {
      font-family: Inter, sans-serif;
      font-size: 14px;
      font-weight: 500;
      padding: 8px 20px;
      border: none;
      border-radius: 20px;
      background: #1a8917;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-copy:hover { background: #156d12; transform: translateY(-1px); }
    .btn-copy:active { transform: translateY(0); }
    .btn-copy.copied { background: #0f730c; }

    /* ── Article Container ── */
    .article-wrapper {
      max-width: 680px;
      margin: 48px auto 120px;
      padding: 0 24px;
    }

    .article-title {
      font-size: 40px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
      color: #191919;
    }

    .article-meta {
      font-family: Inter, sans-serif;
      font-size: 14px;
      color: #757575;
      margin-bottom: 32px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tag {
      display: inline-block;
      background: #f2f2f2;
      color: #424242;
      padding: 3px 10px;
      border-radius: 100px;
      font-size: 13px;
      font-family: Inter, sans-serif;
    }

    /* ── Article Content ── */
    #article-content h1 { font-size: 32px; font-weight: 700; margin: 40px 0 16px; line-height: 1.25; }
    #article-content h2 { font-size: 26px; font-weight: 700; margin: 36px 0 14px; line-height: 1.3; }
    #article-content h3 { font-size: 22px; font-weight: 700; margin: 28px 0 12px; line-height: 1.35; }

    #article-content p { margin-bottom: 20px; }

    #article-content a {
      color: inherit;
      text-decoration: underline;
      text-decoration-color: rgba(0,0,0,0.3);
      text-underline-offset: 3px;
    }
    #article-content a:hover { text-decoration-color: rgba(0,0,0,0.8); }

    #article-content strong { font-weight: 700; }
    #article-content em { font-style: italic; }

    #article-content code {
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      background: #f2f2f2;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 15px;
    }

    #article-content pre {
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 6px;
      padding: 20px 24px;
      overflow-x: auto;
      margin: 24px 0;
      line-height: 1.5;
    }

    #article-content pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      font-size: 14px;
      color: inherit;
    }

    #article-content blockquote {
      border-left: 3px solid #242424;
      padding-left: 20px;
      margin: 24px 0;
      font-style: italic;
      color: #555;
    }

    #article-content ul, #article-content ol {
      margin: 16px 0;
      padding-left: 30px;
    }

    #article-content li { margin-bottom: 8px; }

    #article-content figure {
      margin: 32px 0;
      text-align: center;
    }

    #article-content figure img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    #article-content figcaption {
      font-family: Inter, sans-serif;
      font-size: 14px;
      color: #757575;
      margin-top: 8px;
      text-align: center;
    }

    #article-content hr {
      border: none;
      text-align: center;
      margin: 40px 0;
    }

    #article-content hr::before {
      content: '...';
      font-size: 28px;
      letter-spacing: 0.6em;
      color: #b3b3b3;
    }

    #article-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      font-size: 16px;
    }

    #article-content th, #article-content td {
      border: 1px solid #e0e0e0;
      padding: 10px 14px;
      text-align: left;
    }

    #article-content th {
      background: #f5f5f5;
      font-weight: 600;
    }

    /* ── Toast ── */
    .toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: #191919;
      color: #fff;
      font-family: Inter, sans-serif;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 8px;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* ── Warning banner ── */
    .warning-banner {
      max-width: 680px;
      margin: 0 auto;
      padding: 12px 24px;
      background: #fff8e1;
      border: 1px solid #ffe082;
      border-radius: 8px;
      font-family: Inter, sans-serif;
      font-size: 13px;
      color: #6d4c00;
      margin-top: 24px;
    }
  </style>
</head>
<body>

  <div class="toolbar">
    <div class="toolbar-left">
      <span class="toolbar-logo">Notion → Medium</span>
      <span class="toolbar-meta">${wordCount} words · ${readTime} min read</span>
    </div>
    <button class="btn-copy" id="copyBtn" onclick="copyArticle()">Copy Article</button>
  </div>

  <div class="article-wrapper">
    <div class="warning-banner">
      ⚡ Click <strong>Copy Article</strong> → open Medium → click <strong>Write</strong> → paste (Cmd+V). Images, headings, and code blocks will transfer automatically.
    </div>

    <div id="article-content" style="margin-top: 32px;">
      <h1 class="article-title">${title}</h1>
      ${tagBadges ? `<div class="article-meta">${tagBadges}</div>` : ''}
      ${content}
    </div>
  </div>

  <div class="toast" id="toast">✓ Article copied — paste into Medium editor</div>

  <script>
    function copyArticle() {
      const article = document.getElementById('article-content');
      const range = document.createRange();
      range.selectNodeContents(article);

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      try {
        document.execCommand('copy');
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        showToast();
        setTimeout(() => {
          btn.textContent = 'Copy Article';
          btn.classList.remove('copied');
        }, 3000);
      } catch (err) {
        alert('Copy failed — please use Cmd+A then Cmd+C');
      }

      selection.removeAllRanges();
    }

    function showToast() {
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
}

module.exports = { buildPreviewHtml };
