const { marked } = require('marked');

class NotionToMediumConverter {
  constructor() {
    this._configureMarked();
  }

  _configureMarked() {
    const self = this;
    const renderer = {
      // Images → <figure> with optional caption (Medium handles these well)
      image(href, title, text) {
        let html = '<figure>';
        html += `<img src="${href}" alt="${text || ''}"`;
        if (title) html += ` title="${title}"`;
        html += ' />';
        if (text && text !== href) {
          html += `<figcaption>${text}</figcaption>`;
        }
        html += '</figure>';
        return html;
      },

      // Code blocks with language tag
      code(code, language) {
        const escaped = self._escapeHtml(code);
        const langClass = language ? ` class="language-${language}"` : '';
        return `<pre><code${langClass}>${escaped}</code></pre>\n`;
      },
    };

    marked.use({ renderer, gfm: true, breaks: false });
  }

  /**
   * Convert Notion markdown → Medium-compatible HTML
   */
  convert(markdown) {
    let md = this._preProcess(markdown);
    let html = marked.parse(md);
    html = this._postProcess(html);
    return html;
  }

  /**
   * Pre-process Notion-specific markdown before marked parsing
   */
  _preProcess(md) {
    // Expand <details>/<summary> toggles (Medium doesn't support collapsibles)
    md = md.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `\n**${summary.trim()}**\n${content.trim()}\n`
    );

    // Strip HTML comments
    md = md.replace(/<!--[\s\S]*?-->/g, '');

    // Handle notion-to-md callout format: > ℹ️ text → blockquote
    // (notion-to-md already converts callouts to blockquotes, so this is fine)

    // Collapse 4+ consecutive newlines to 2
    md = md.replace(/\n{4,}/g, '\n\n');

    return md;
  }

  /**
   * Post-process HTML for Medium compatibility
   */
  _postProcess(html) {
    // Remove empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Ensure figures aren't wrapped in <p> tags
    html = html.replace(/<p>\s*(<figure>)/g, '$1');
    html = html.replace(/(<\/figure>)\s*<\/p>/g, '$1');

    // Convert markdown-style dividers that survived
    html = html.replace(/<p>---<\/p>/g, '<hr>');

    return html.trim();
  }

  _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Count words in HTML content (for metadata display)
   */
  getWordCount(html) {
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.split(' ').filter((w) => w.length > 0).length;
  }
}

module.exports = { NotionToMediumConverter };
