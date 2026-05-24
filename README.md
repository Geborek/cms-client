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
