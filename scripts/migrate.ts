#!/usr/bin/env tsx
/**
 * Migrate CMS content from a source Thevea CMS to a target.
 *
 * Idempotent. Never deletes anything on the target — only creates and
 * updates. Safe to re-run.
 *
 * Scope per run: one workspace (same slug on source and target).
 *
 * Auth: both sides use admin JWT (via POST /api/auth/login). Long-lived
 * `cms_*` API tokens are not used because their list-endpoint scope is
 * known broken — see frontend-suite/shared/memory/reference_debt.md.
 *
 * Run:
 *   set -a; source .env.migrate; set +a
 *   npx tsx node_modules/@wesports/cms-client/scripts/migrate.ts
 *
 * Required env vars:
 *   SOURCE_CMS_URL          e.g. http://localhost:9000
 *   SOURCE_CMS_USERNAME     admin
 *   SOURCE_CMS_PASSWORD     admin
 *   TARGET_CMS_URL          e.g. https://cms.ecomatic.se
 *   TARGET_CMS_USERNAME
 *   TARGET_CMS_PASSWORD
 *   WORKSPACE               e.g. outdoorexperten
 *
 * Optional:
 *   DRY_RUN=true            log every action, write nothing
 *   ONLY=home-page,banner   restrict to a comma-separated set of content-type slugs
 *   SKIP_LOCALES=true       don't touch /api/locales (assume target is already in sync)
 *
 * Out of scope (not migrated): media uploads (binary files), workspace
 * provisioning. Create the target workspace + locales first via the
 * `infrastructure/deploy/runbooks/cms-secrets.md` runbook.
 */

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) {
    console.error(`[migrate] missing required env var: ${k}`);
    process.exit(1);
  }
  return v;
};

const DRY_RUN = process.env.DRY_RUN === 'true';
const ONLY = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const SKIP_LOCALES = process.env.SKIP_LOCALES === 'true';
const LOCALE = process.env.LOCALE ?? 'sv-SE';

interface Locale {
  code: string;
  name: string;
  is_default?: boolean;
  active?: boolean;
}

interface ContentType {
  id?: number;
  slug: string;
  name: string;
  description?: string;
  singleton?: boolean;
  icon?: string;
}

interface Field {
  id?: number;
  name: string;
  label: string;
  field_type: string;
  required?: boolean;
  options?: Record<string, unknown>;
  order?: number;
}

interface Entry {
  id?: number;
  data: Record<string, unknown>;
  locale?: string;
  status?: string;
  key?: string;
  slug?: string;
}

interface Stats {
  contentTypesCreated: number;
  contentTypesUpdated: number;
  fieldsCreated: number;
  fieldsUpdated: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesSkipped: number;
}

const STATS: Stats = {
  contentTypesCreated: 0,
  contentTypesUpdated: 0,
  fieldsCreated: 0,
  fieldsUpdated: 0,
  entriesCreated: 0,
  entriesUpdated: 0,
  entriesSkipped: 0,
};

class CmsClient {
  constructor(
    private readonly label: 'source' | 'target',
    private readonly baseUrl: string,
    private readonly bearer: string,
    private readonly workspace: string,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        'Content-Type': 'application/json',
        'X-Workspace': this.workspace,
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    if (!res.ok) {
      console.error(`\n[${this.label}] ${method} ${url} → ${res.status}`);
      console.error(`response: ${text.slice(0, 500)}`);
      process.exit(1);
    }
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return (parsed.data ?? parsed) as T;
    } catch {
      console.error(`[${this.label}] failed to parse response from ${url}: ${text.slice(0, 200)}`);
      process.exit(1);
    }
  }

  get<T>(path: string): Promise<T | null> { return this.request<T>('GET', path); }
  post<T>(path: string, body: unknown): Promise<T | null> { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body: unknown): Promise<T | null> { return this.request<T>('PATCH', path, body); }
}

async function loginAsAdmin(label: 'source' | 'target', url: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[${label}] admin login failed: ${res.status} ${body.slice(0, 200)}`);
    process.exit(1);
  }
  const json = (await res.json()) as { access?: string };
  if (!json.access) {
    console.error(`[${label}] admin login returned no access token`);
    process.exit(1);
  }
  return json.access;
}

function stripServerFields(obj: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, created_at: _c, updated_at: _u, workspace_id: _wi, workspace: _w, ...rest } = obj;
  return rest;
}

function naturalKey(entry: Entry): string | null {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const candidate = (entry.key ?? data.key ?? entry.slug ?? data.slug) as string | undefined;
  return candidate && typeof candidate === 'string' ? candidate : null;
}

async function migrateLocales(src: CmsClient, tgt: CmsClient): Promise<void> {
  if (SKIP_LOCALES) {
    console.log('[locales] skipped (SKIP_LOCALES=true)');
    return;
  }
  console.log('[locales]');
  const srcLocales = (await src.get<Locale[]>('/api/locales')) ?? [];
  const tgtLocales = (await tgt.get<Locale[]>('/api/locales')) ?? [];
  const tgtByCode = new Map(tgtLocales.map((l) => [l.code, l]));

  for (const loc of srcLocales) {
    const payload = stripServerFields(loc as unknown as Record<string, unknown>);
    if (tgtByCode.has(loc.code)) {
      const existing = tgtByCode.get(loc.code)!;
      if (existing.is_default !== loc.is_default || existing.active !== loc.active || existing.name !== loc.name) {
        if (DRY_RUN) console.log(`  [dry-run] PATCH /api/locales/${loc.code}`);
        else await tgt.patch(`/api/locales/${loc.code}`, payload);
        console.log(`  ${loc.code}: updated`);
      } else {
        console.log(`  ${loc.code}: in sync`);
      }
    } else {
      if (DRY_RUN) console.log(`  [dry-run] POST /api/locales — ${loc.code}`);
      else await tgt.post('/api/locales', payload);
      console.log(`  ${loc.code}: created`);
    }
  }
}

async function migrateContentTypes(src: CmsClient, tgt: CmsClient): Promise<ContentType[]> {
  console.log('\n[content-types]');
  const srcCts = (await src.get<ContentType[]>('/api/content-types')) ?? [];
  const tgtCts = (await tgt.get<ContentType[]>('/api/content-types')) ?? [];
  const tgtBySlug = new Map(tgtCts.map((ct) => [ct.slug, ct]));

  const targetCts: ContentType[] = [];
  for (const ct of srcCts) {
    if (ONLY && !ONLY.includes(ct.slug)) continue;
    const payload = stripServerFields(ct as unknown as Record<string, unknown>);
    if (tgtBySlug.has(ct.slug)) {
      if (DRY_RUN) console.log(`  [dry-run] PATCH /api/content-types/${ct.slug}`);
      else await tgt.patch(`/api/content-types/${ct.slug}`, payload);
      STATS.contentTypesUpdated++;
      console.log(`  ${ct.slug}: updated`);
    } else {
      if (DRY_RUN) console.log(`  [dry-run] POST /api/content-types — ${ct.slug}`);
      else await tgt.post('/api/content-types', payload);
      STATS.contentTypesCreated++;
      console.log(`  ${ct.slug}: created`);
    }
    targetCts.push(ct);
  }
  return targetCts;
}

async function migrateFields(src: CmsClient, tgt: CmsClient, ct: ContentType): Promise<void> {
  const srcFields = (await src.get<Field[]>(`/api/content-types/${ct.slug}/fields`)) ?? [];
  const tgtFields = (await tgt.get<Field[]>(`/api/content-types/${ct.slug}/fields`)) ?? [];
  const tgtByName = new Map(tgtFields.map((f) => [f.name, f]));

  for (const field of srcFields) {
    const payload = stripServerFields(field as unknown as Record<string, unknown>);
    // Some legacy fields carry label: "" which POST tolerated but PATCH rejects.
    if (!payload.label || payload.label === '') payload.label = field.name;
    const existing = tgtByName.get(field.name);
    if (existing) {
      const path = `/api/content-types/${ct.slug}/fields/${existing.id}`;
      if (DRY_RUN) console.log(`    [dry-run] PATCH ${path}`);
      else await tgt.patch(path, payload);
      STATS.fieldsUpdated++;
    } else {
      if (DRY_RUN) console.log(`    [dry-run] POST /api/content-types/${ct.slug}/fields — ${field.name}`);
      else await tgt.post(`/api/content-types/${ct.slug}/fields`, payload);
      STATS.fieldsCreated++;
    }
  }
}

async function migrateEntries(src: CmsClient, tgt: CmsClient, ct: ContentType): Promise<void> {
  // Cache-bust per the known list-cache bug. Locale filter is critical — list
  // endpoints default to ?locale=en, so omitting it returns 0 for sv-SE content.
  const qs = `?locale=${encodeURIComponent(LOCALE)}&limit=200&_t=${Date.now()}`;
  const srcEntries = (await src.get<Entry[]>(`/api/${ct.slug}/entries${qs}`)) ?? [];
  const tgtEntries = (await tgt.get<Entry[]>(`/api/${ct.slug}/entries${qs}`)) ?? [];

  if (ct.singleton) {
    if (srcEntries.length === 0) {
      console.log(`    [singleton] no source entry — nothing to do`);
      return;
    }
    if (srcEntries.length > 1) {
      console.log(`    [singleton] WARNING source has ${srcEntries.length} entries — migrating the first only`);
    }
    const srcEntry = srcEntries[0]!;
    const payload = stripServerFields(srcEntry as unknown as Record<string, unknown>);
    if (tgtEntries.length > 0) {
      const tgtId = tgtEntries[0]!.id;
      const path = `/api/${ct.slug}/entries/${tgtId}`;
      if (DRY_RUN) console.log(`    [dry-run] PATCH ${path}`);
      else await tgt.patch(path, payload);
      STATS.entriesUpdated++;
      console.log(`    [singleton] updated`);
    } else {
      if (DRY_RUN) console.log(`    [dry-run] POST /api/${ct.slug}/entries`);
      else await tgt.post(`/api/${ct.slug}/entries`, payload);
      STATS.entriesCreated++;
      console.log(`    [singleton] created`);
    }
    return;
  }

  // Collection: match by natural key.
  const tgtByKey = new Map<string, Entry>();
  for (const e of tgtEntries) {
    const k = naturalKey(e);
    if (k) tgtByKey.set(k, e);
  }

  for (const srcEntry of srcEntries) {
    const k = naturalKey(srcEntry);
    if (!k) {
      console.log(`    [skip] source entry id=${srcEntry.id} has no natural key (key/slug field)`);
      STATS.entriesSkipped++;
      continue;
    }
    const payload = stripServerFields(srcEntry as unknown as Record<string, unknown>);
    const existing = tgtByKey.get(k);
    if (existing) {
      const path = `/api/${ct.slug}/entries/${existing.id}`;
      if (DRY_RUN) console.log(`    [dry-run] PATCH ${path} (key=${k})`);
      else await tgt.patch(path, payload);
      STATS.entriesUpdated++;
      console.log(`    [key=${k}] updated`);
    } else {
      if (DRY_RUN) console.log(`    [dry-run] POST /api/${ct.slug}/entries (key=${k})`);
      else await tgt.post(`/api/${ct.slug}/entries`, payload);
      STATS.entriesCreated++;
      console.log(`    [key=${k}] created`);
    }
  }
}

async function main() {
  const workspace = process.env.WORKSPACE;
  const sourceWorkspace = process.env.SOURCE_WORKSPACE ?? workspace;
  const targetWorkspace = process.env.TARGET_WORKSPACE ?? workspace;
  if (!sourceWorkspace || !targetWorkspace) {
    console.error('[migrate] WORKSPACE (or SOURCE_WORKSPACE + TARGET_WORKSPACE) required');
    process.exit(1);
  }
  const sourceUrl = env('SOURCE_CMS_URL');
  const targetUrl = env('TARGET_CMS_URL');
  const sourceUser = env('SOURCE_CMS_USERNAME');
  const sourcePass = env('SOURCE_CMS_PASSWORD');
  const targetUser = env('TARGET_CMS_USERNAME');
  const targetPass = env('TARGET_CMS_PASSWORD');

  console.log(`[migrate] source:    ${sourceUrl}  (workspace: ${sourceWorkspace})`);
  console.log(`[migrate] target:    ${targetUrl}  (workspace: ${targetWorkspace})`);
  console.log(`[migrate] locale:    ${LOCALE}`);
  if (DRY_RUN) console.log(`[migrate] DRY RUN — no writes will happen`);
  if (ONLY) console.log(`[migrate] ONLY:      ${ONLY.join(', ')}`);
  console.log();

  const sourceToken = await loginAsAdmin('source', sourceUrl, sourceUser, sourcePass);
  const targetToken = await loginAsAdmin('target', targetUrl, targetUser, targetPass);

  const src = new CmsClient('source', sourceUrl, sourceToken, sourceWorkspace);
  const tgt = new CmsClient('target', targetUrl, targetToken, targetWorkspace);

  await migrateLocales(src, tgt);

  const cts = await migrateContentTypes(src, tgt);

  console.log('\n[fields]');
  for (const ct of cts) {
    console.log(`  ${ct.slug}`);
    await migrateFields(src, tgt, ct);
  }

  console.log('\n[entries]');
  for (const ct of cts) {
    console.log(`  ${ct.slug}`);
    await migrateEntries(src, tgt, ct);
  }

  console.log('\n[summary]');
  console.log(`  content-types: ${STATS.contentTypesCreated} created, ${STATS.contentTypesUpdated} updated`);
  console.log(`  fields:        ${STATS.fieldsCreated} created, ${STATS.fieldsUpdated} updated`);
  console.log(`  entries:       ${STATS.entriesCreated} created, ${STATS.entriesUpdated} updated, ${STATS.entriesSkipped} skipped (no key)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
