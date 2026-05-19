const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');

class NotionClient {
  constructor(token) {
    this.client = new Client({ auth: token });
    this.n2m = new NotionToMarkdown({ notionClient: this.client });
  }

  /**
   * Retrieve page metadata (title, tags, cover image, etc.)
   */
  async getPageInfo(pageId) {
    const page = await this.client.pages.retrieve({ page_id: pageId });

    // Extract title from the title-type property
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === 'title'
    );
    const title =
      titleProp?.title?.map((t) => t.plain_text).join('') || 'Untitled';

    // Extract tags from any multi_select property
    const tagsProp = Object.values(page.properties).find(
      (p) => p.type === 'multi_select'
    );
    const tags = tagsProp?.multi_select?.map((t) => t.name) || [];

    // Cover image
    const cover = page.cover?.external?.url || page.cover?.file?.url || null;

    return { id: pageId, title, tags, cover, url: page.url };
  }

  /**
   * Convert a Notion page to markdown using notion-to-md
   */
  async getPageMarkdown(pageId) {
    const mdBlocks = await this.n2m.pageToMarkdown(pageId);
    const mdString = this.n2m.toMarkdownString(mdBlocks);
    // notion-to-md v3 returns { parent: string } object
    return typeof mdString === 'string' ? mdString : mdString.parent;
  }

  /**
   * Fetch all blocks from a page, handling pagination.
   * Returns flat list of top-level blocks.
   */
  async getAllBlocks(pageId) {
    let blocks = [];
    let cursor;
    do {
      const res = await this.client.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      });
      blocks = blocks.concat(res.results);
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor);
    return blocks;
  }

  /**
   * Extract image URLs from blocks.
   * Returns a map of block ID → image URL.
   * Handles both file (Notion-hosted) and external images.
   */
  async getImageUrls(pageId) {
    const blocks = await this.getAllBlocks(pageId);
    const imageMap = new Map();

    for (const block of blocks) {
      if (block.type !== 'image') continue;

      const img = block.image;
      let url = null;

      if (img.type === 'file' && img.file?.url) {
        url = img.file.url;
      } else if (img.type === 'external' && img.external?.url) {
        url = img.external.url;
      } else if (img.type === 'file_upload' && img.file_upload?.url) {
        url = img.file_upload.url;
      }

      const caption =
        img.caption?.map((c) => c.plain_text).join('') || '';

      imageMap.set(block.id, { url, caption });
    }

    return imageMap;
  }

  _extractMeta(page) {
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === 'title'
    );
    const title =
      titleProp?.title?.map((t) => t.plain_text).join('') || 'Untitled';

    const tagsProp = Object.values(page.properties).find(
      (p) => p.type === 'multi_select'
    );
    const tags = tagsProp?.multi_select?.map((t) => t.name) || [];

    return { title, tags };
  }
}

module.exports = { NotionClient };
