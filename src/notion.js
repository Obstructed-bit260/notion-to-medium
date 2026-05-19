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
   * List pages from a Notion database, optionally filtered by status
   */
  async getDatabasePages(databaseId, statusFilter) {
    let filter;
    if (statusFilter) {
      // Try to find the status property name by querying the database schema
      const db = await this.client.databases.retrieve({
        database_id: databaseId,
      });
      const statusPropEntry = Object.entries(db.properties).find(
        ([, v]) => v.type === 'status' || v.type === 'select'
      );

      if (statusPropEntry) {
        const [propName, propDef] = statusPropEntry;
        filter = {
          property: propName,
          [propDef.type]: { equals: statusFilter },
        };
      }
    }

    const response = await this.client.databases.query({
      database_id: databaseId,
      filter,
    });

    return response.results.map((page) => ({
      id: page.id,
      ...this._extractMeta(page),
    }));
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
