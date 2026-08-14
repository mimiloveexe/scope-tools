# Scope Tools

A [Caido](https://caido.io/) plugin for cleaning up Sitemap and HTTP History
against one or more scope presets, and for re-importing requests from a
Caido "Export requests" JSON file.

## Features

- **Sitemap**: preview and delete every Sitemap domain (and everything
  under it) whose host doesn't match any of the selected scope presets'
  allowlist/denylist.
- **HTTP History**: same idea, applied to HTTP History entries. Scans the
  full history and deletes anything out of scope.
- **Import**: reconstructs requests from a Caido "Export requests" JSON
  file via the `createRequest` API, tagged `source: Import`.

Both prune tabs work as preview-then-confirm: click **Preview** to see the
exact list of what would be deleted before committing to **Delete
out-of-scope entries**.

## Where imported requests show up

Caido's HTTP History tab only ever displays traffic that was actually
proxied live through Caido — there is no API to make a request appear
there after the fact. Imported requests are real `Request` rows (with
`source: Import`), so they're fully queryable, exportable, and usable
elsewhere in Caido — they just live in **Search**, not History.

To see them:

1. Open **Search**
2. Click **Advanced**
3. Under **Source**, check **Import**

Note that `req.source` is only a valid HTTPQL field once at least one
Source checkbox is enabled under Advanced options — that checkbox is what
opts you into filtering/querying by source at all. Before that, a query
like `req.source.eq:"import"` will be rejected as invalid.

## Installation

1. Download `plugin_package.zip` from a [release](../../releases) (or build
   it yourself, see below).
2. In Caido, go to **Plugins → Install Package** and select the zip.

## Development

```bash
pnpm install
pnpm build      # produces dist/plugin_package.zip
pnpm watch      # hot-reload during development (requires the DevTools plugin)
pnpm typecheck
pnpm lint
```

Project layout:

```
packages/
  backend/    HTTPQL/GraphQL logic: scope matching, sitemap/history pruning, import
  frontend/   Vue + PrimeVue UI: three tabs under a "Scope Tools" sidebar page
```

The backend talks to Caido's GraphQL API directly via `sdk.graphql.execute`
for operations with no dedicated SDK method (`sitemapRootEntries`,
`sitemapDescendantEntries`, `deleteSitemapEntries`, `interceptEntries`,
`deleteInterceptEntry`, `createRequest`). Scope matching (allowlist/denylist
glob patterns) is done client-side rather than trusting the `scopeId`
argument some of these accept, since that argument is undocumented and
filters *to* the scope rather than excluding it.

## License

MIT — see [LICENSE](./LICENSE).
