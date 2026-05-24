export interface CmsConfig {
  apiUrl: string;
  locale: string;
  token?: string;
  previewToken?: string;
  /**
   * CMS workspace slug. Required by the multi-tenant CMS for all entry
   * read/write endpoints. Sent as `X-Workspace` header.
   */
  workspace?: string;
}
