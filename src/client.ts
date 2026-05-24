import type { CmsConfig } from './config';

export interface CmsEntry<TData = Record<string, unknown>> {
  id: number;
  content_type: string;
  data: TData;
  status: 'draft' | 'in_review' | 'changes_requested' | 'published' | 'archived';
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface CmsListResponse<TData = Record<string, unknown>> {
  data: CmsEntry<TData>[];
  meta: { total: number; page?: number; limit?: number };
}

export interface CmsItemResponse<TData = Record<string, unknown>> {
  data: CmsEntry<TData>;
}

export interface ListOptions {
  status?: 'published' | 'draft' | 'in_review' | 'archived';
  limit?: number;
  page?: number;
  sort?: string;
  populate?: string[];
  filters?: Record<string, Record<string, string | number | boolean>>;
}

function buildHeaders(config: CmsConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.workspace) headers['X-Workspace'] = config.workspace;
  return headers;
}

function buildQuery(config: CmsConfig, options: ListOptions = {}): string {
  const params = new URLSearchParams();
  params.set('locale', config.locale);
  if (options.status) params.set('status', options.status);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.sort) params.set('sort', options.sort);
  if (options.populate?.length) params.set('populate', options.populate.join(','));
  if (options.filters) {
    for (const [field, ops] of Object.entries(options.filters)) {
      for (const [op, value] of Object.entries(ops)) {
        params.set(`filters[${field}][${op}]`, String(value));
      }
    }
  }
  if (config.previewToken) params.set('token', config.previewToken);
  return params.toString();
}

async function request<T>(url: string, config: CmsConfig): Promise<T> {
  const res = await fetch(url, { headers: buildHeaders(config), cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CMS request failed: ${res.status} ${res.statusText} — ${url}\n${body}`);
  }
  return res.json() as Promise<T>;
}

/** Returns entries from a content type with optional filters, sorting, and pagination. */
export async function listEntries<TData = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
  options: ListOptions = {},
): Promise<CmsListResponse<TData>> {
  const qs = buildQuery(config, options);
  return request<CmsListResponse<TData>>(`${config.apiUrl}/api/${contentTypeSlug}/entries?${qs}`, config);
}

/** Returns a single entry by its numeric ID. */
export async function getEntry<TData = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
  id: number,
): Promise<CmsEntry<TData>> {
  const qs = buildQuery(config);
  const res = await request<CmsItemResponse<TData>>(
    `${config.apiUrl}/api/${contentTypeSlug}/entries/${id}?${qs}`,
    config,
  );
  return res.data;
}

/** Returns a single entry matching the given slug, or null if not found. */
export async function getEntryBySlug<TData extends { slug?: string } = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
  slug: string,
): Promise<CmsEntry<TData> | null> {
  const list = await listEntries<TData>(config, contentTypeSlug, {
    filters: { slug: { eq: slug } },
    limit: 1,
  });
  return list.data[0] ?? null;
}

/** Returns a single entry matching the given field value, or null if not found. */
export async function getEntryByKey<TData = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
  fieldName: string,
  value: string,
): Promise<CmsEntry<TData> | null> {
  const list = await listEntries<TData>(config, contentTypeSlug, {
    filters: { [fieldName]: { eq: value } },
    limit: 1,
  });
  return list.data[0] ?? null;
}

/** Returns the first entry of a singleton content type, or null if none exist. */
export async function getSingleton<TData = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
): Promise<CmsEntry<TData> | null> {
  const list = await listEntries<TData>(config, contentTypeSlug, { limit: 1 });
  return list.data[0] ?? null;
}

/** Returns all entries of a content type by auto-paging through results with configurable page size. */
export async function listAllPaginated<TData = Record<string, unknown>>(
  config: CmsConfig,
  contentTypeSlug: string,
  options?: Omit<ListOptions, 'limit' | 'page'> & { pageSize?: number },
): Promise<CmsEntry<TData>[]> {
  const pageSize = options?.pageSize ?? 100;
  const results: CmsEntry<TData>[] = [];
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const response = await listEntries<TData>(config, contentTypeSlug, {
      ...options,
      limit: pageSize,
      page,
    });

    results.push(...response.data);

    if (response.data.length < pageSize) {
      break;
    }

    page++;
  }

  return results;
}
