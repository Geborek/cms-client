# @wesports/cms-client

Pure-TypeScript reader for the Thevea CMS, consumed by WeSports storefronts in `frontend-suite/`. No React, no Next.js — just typed fetch wrappers.

## Install

```bash
npm install github:Geborek/cms-client
```

## Usage

```typescript
import { getSingleton, listEntries, type CmsConfig } from '@wesports/cms-client';

const config: CmsConfig = {
  apiUrl: process.env.CMS_API_URL!,
  locale: 'sv-SE',
  token: process.env.CMS_API_TOKEN,
  workspace: process.env.CMS_WORKSPACE,
};

const home = await getSingleton('home-page', config);
const banners = await listEntries('banner', config, { limit: 10 });
```

Each storefront's `lib/cms.ts` is the recommended construction site for `CmsConfig` (reads env + Next.js cookies).

## Workspace scoping

The CMS enforces per-workspace scoping on all entry CRUD as of 2026-05-24. Set `workspace` on `CmsConfig` so every call sends the `X-Workspace` header.

## Migrate content between CMS instances

`scripts/migrate.ts` walks a source CMS (locales → content types → fields → entries) and upserts everything onto a target CMS for one workspace. Idempotent; never deletes anything on the target.

Run from any consuming repo (the package's `scripts/` lands in `node_modules` via the github: install):

```bash
set -a
SOURCE_CMS_URL=http://localhost:9000
SOURCE_CMS_USERNAME=admin
SOURCE_CMS_PASSWORD=admin
TARGET_CMS_URL=https://cms.ecomatic.se
TARGET_CMS_USERNAME=...
TARGET_CMS_PASSWORD=...
WORKSPACE=outdoorexperten
set +a

# Dry run first (logs every action, writes nothing)
DRY_RUN=true npx tsx node_modules/@wesports/cms-client/scripts/migrate.ts

# Real run
npx tsx node_modules/@wesports/cms-client/scripts/migrate.ts
```

Both sides use admin JWT auth (workaround for the known `cms_*`-token-on-list-endpoints bug). Workspace + locales must already exist on the target — see `infrastructure/deploy/runbooks/cms-secrets.md`.

Entry matching: singletons by content type; collection entries by their natural key (`key` or `slug` field in `data`). Entries without either are skipped with a warning.

Out of scope: media uploads (binary files), workspace provisioning. Media must be re-uploaded separately.

Flags:
- `DRY_RUN=true` — log all actions, no writes
- `ONLY=home-page,banner` — restrict to specific content-type slugs
- `SKIP_LOCALES=true` — don't touch `/api/locales`
