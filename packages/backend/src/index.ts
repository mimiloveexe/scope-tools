import type { DefineAPI, SDK } from "caido:plugin";

export type Result<T> =
  { kind: "Ok"; value: T } | { kind: "Error"; error: string };

type ScopeInfo = {
  id: string;
  name: string;
  allowlist: string[];
  denylist: string[];
};

type SitemapEntryNode = {
  id: string;
  label: string;
  kind: string;
  hasDescendants: boolean;
  request?: { host: string } | undefined;
};

type InterceptEntryNode = {
  id: string;
  request: { id: string; host: string; method: string; path: string };
};

async function gql<T>(
  sdk: SDK,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await sdk.graphql.execute<T>(query, variables ?? {});
  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors.map((e) => e.message).join("; "));
  }
  if (response.data === undefined) {
    throw new Error("GraphQL response had no data");
  }
  return response.data;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function isHostInScope(host: string, scope: ScopeInfo): boolean {
  const allowed =
    scope.allowlist.length === 0
      ? true
      : scope.allowlist.some((p) => globToRegExp(p).test(host));
  if (!allowed) return false;
  return !scope.denylist.some((p) => globToRegExp(p).test(host));
}

// A host is treated as in-scope if it matches ANY of the selected presets,
// so picking multiple presets widens what's kept rather than narrowing it.
function isHostInAnyScope(host: string, scopes: ScopeInfo[]): boolean {
  return scopes.some((scope) => isHostInScope(host, scope));
}

async function getScopes(sdk: SDK, scopeIds: string[]): Promise<ScopeInfo[]> {
  const all = await sdk.scope.getAll();
  const idSet = new Set(scopeIds);
  const matches = all
    .filter((s) => idSet.has(String(s.id)))
    .map((s) => ({
      id: String(s.id),
      name: s.name,
      allowlist: s.allowlist,
      denylist: s.denylist,
    }));
  if (matches.length === 0) {
    throw new Error("No matching scopes found");
  }
  return matches;
}

function listScopes(sdk: SDK): Promise<Result<ScopeInfo[]>> {
  return sdk.scope.getAll().then((scopes) => ({
    kind: "Ok" as const,
    value: scopes.map((s) => ({
      id: String(s.id),
      name: s.name,
      allowlist: s.allowlist,
      denylist: s.denylist,
    })),
  }));
}

// Sitemap entries form a tree (DOMAIN -> DIRECTORY -> REQUEST/REQUEST_QUERY/REQUEST_BODY).
// Scope patterns match hosts, so a whole DOMAIN subtree is either fully in or fully out of
// scope. We collect every id in an out-of-scope subtree explicitly rather than relying on
// deleteSitemapEntries to cascade, since that behavior isn't documented.
async function collectSitemapSubtreeIds(
  sdk: SDK,
  rootId: string,
): Promise<string[]> {
  const ids: string[] = [rootId];
  const query = `
    query($parentId: ID!) {
      sitemapDescendantEntries(parentId: $parentId, depth: ALL) {
        nodes { id hasDescendants }
      }
    }
  `;
  const data = await gql<{
    sitemapDescendantEntries: { nodes: Array<{ id: string }> };
  }>(sdk, query, { parentId: rootId });
  for (const node of data.sitemapDescendantEntries.nodes) {
    ids.push(node.id);
  }
  return ids;
}

async function findOutOfScopeSitemapDomains(
  sdk: SDK,
  scopes: ScopeInfo[],
): Promise<Array<{ id: string; host: string }>> {
  const query = `
    query {
      sitemapRootEntries {
        nodes { id label kind hasDescendants request { host } }
      }
    }
  `;
  const data = await gql<{ sitemapRootEntries: { nodes: SitemapEntryNode[] } }>(
    sdk,
    query,
  );
  const nodes = data.sitemapRootEntries.nodes;

  const outOfScope: Array<{ id: string; host: string }> = [];
  for (const node of nodes) {
    if (node.kind !== "DOMAIN") continue;
    const host = node.request?.host ?? node.label;
    if (!isHostInAnyScope(host, scopes)) {
      outOfScope.push({ id: node.id, host });
    }
  }
  return outOfScope;
}

async function previewSitemapPrune(
  sdk: SDK,
  scopeIds: string[],
): Promise<Result<{ domains: string[]; entryCount: number }>> {
  const scopes = await getScopes(sdk, scopeIds);
  const domains = await findOutOfScopeSitemapDomains(sdk, scopes);

  let entryCount = 0;
  for (const domain of domains) {
    const ids = await collectSitemapSubtreeIds(sdk, domain.id);
    entryCount += ids.length;
  }

  return {
    kind: "Ok",
    value: { domains: domains.map((d) => d.host), entryCount },
  };
}

async function pruneSitemap(
  sdk: SDK,
  scopeIds: string[],
): Promise<Result<{ deletedCount: number }>> {
  const scopes = await getScopes(sdk, scopeIds);
  const domains = await findOutOfScopeSitemapDomains(sdk, scopes);

  const allIds: string[] = [];
  for (const domain of domains) {
    const ids = await collectSitemapSubtreeIds(sdk, domain.id);
    allIds.push(...ids);
  }

  if (allIds.length === 0) {
    return { kind: "Ok", value: { deletedCount: 0 } };
  }

  const mutation = `
    mutation($ids: [ID!]!) {
      deleteSitemapEntries(ids: $ids) { deletedIds }
    }
  `;
  await gql(sdk, mutation, { ids: allIds });

  return { kind: "Ok", value: { deletedCount: allIds.length } };
}

// HTTP History entries live behind "InterceptEntry" wrappers whose ids are a distinct
// id space from the underlying Request ids. Only Caido's own proxy engine creates these
// wrappers, so this is the actual delete target for what the UI calls "HTTP History".
async function fetchAllInterceptEntries(
  sdk: SDK,
): Promise<InterceptEntryNode[]> {
  const query = `
    query($after: String) {
      interceptEntries(first: 200, after: $after) {
        nodes { id request { id host method path } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const all: InterceptEntryNode[] = [];
  let after: string | undefined;
  for (;;) {
    const data = await gql<{
      interceptEntries: {
        nodes: InterceptEntryNode[];
        pageInfo: { hasNextPage: boolean; endCursor?: string };
      };
    }>(sdk, query, { after });
    const page = data.interceptEntries;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return all;
}

async function findOutOfScopeHistoryEntries(
  sdk: SDK,
  scopes: ScopeInfo[],
): Promise<InterceptEntryNode[]> {
  const entries = await fetchAllInterceptEntries(sdk);
  return entries.filter((e) => !isHostInAnyScope(e.request.host, scopes));
}

async function previewHistoryPrune(
  sdk: SDK,
  scopeIds: string[],
): Promise<
  Result<{
    entries: Array<{ host: string; method: string; path: string }>;
    entryCount: number;
  }>
> {
  const scopes = await getScopes(sdk, scopeIds);
  const outOfScope = await findOutOfScopeHistoryEntries(sdk, scopes);

  return {
    kind: "Ok",
    value: {
      entries: outOfScope.slice(0, 200).map((e) => ({
        host: e.request.host,
        method: e.request.method,
        path: e.request.path,
      })),
      entryCount: outOfScope.length,
    },
  };
}

async function pruneHistory(
  sdk: SDK,
  scopeIds: string[],
): Promise<Result<{ deletedCount: number; failedCount: number }>> {
  const scopes = await getScopes(sdk, scopeIds);
  const outOfScope = await findOutOfScopeHistoryEntries(sdk, scopes);

  const mutation = `
    mutation($id: ID!) {
      deleteInterceptEntry(id: $id) { deletedId userError { __typename } }
    }
  `;

  let deletedCount = 0;
  let failedCount = 0;
  for (const entry of outOfScope) {
    try {
      const data = await gql<{
        deleteInterceptEntry: { deletedId?: string };
      }>(sdk, mutation, { id: entry.id });
      if (data.deleteInterceptEntry.deletedId !== undefined) {
        deletedCount++;
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  return { kind: "Ok", value: { deletedCount, failedCount } };
}

// Shape matches Caido's own "Export requests" JSON output, so a file exported from one
// project/instance can be fed straight back in here.
type ExportedRequest = {
  host: string;
  method: string;
  path: string;
  port: number;
  raw: string;
  is_tls: boolean;
  query?: string;
  response?: {
    status_code: number;
    raw: string;
  };
};

async function importExportJson(
  sdk: SDK,
  jsonText: string,
): Promise<Result<{ imported: number; failed: number; errors: string[] }>> {
  let records: ExportedRequest[];
  try {
    records = JSON.parse(jsonText);
  } catch (e) {
    return { kind: "Error", error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(records)) {
    return { kind: "Error", error: "Expected a JSON array of request records" };
  }

  const mutation = `
    mutation($input: CreateRequestInput!) {
      createRequest(input: $input) { id }
    }
  `;

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [index, rec] of records.entries()) {
    const input: Record<string, unknown> = {
      host: rec.host,
      method: rec.method,
      path: rec.path,
      port: rec.port,
      isTls: rec.is_tls,
      query: rec.query ?? "",
      raw: rec.raw,
      source: "IMPORT",
      alteration: "NONE",
    };
    if (rec.response) {
      input.response = {
        statusCode: rec.response.status_code,
        raw: rec.response.raw,
        source: "IMPORT",
        alteration: "NONE",
        roundtripTime: 0,
      };
    }

    try {
      await gql(sdk, mutation, { input });
      imported++;
    } catch (e) {
      failed++;
      if (errors.length < 20) {
        errors.push(`record ${index}: ${(e as Error).message}`);
      }
    }
  }

  return { kind: "Ok", value: { imported, failed, errors } };
}

export type API = DefineAPI<{
  listScopes: typeof listScopes;
  previewSitemapPrune: typeof previewSitemapPrune;
  pruneSitemap: typeof pruneSitemap;
  previewHistoryPrune: typeof previewHistoryPrune;
  pruneHistory: typeof pruneHistory;
  importExportJson: typeof importExportJson;
}>;

export function init(sdk: SDK<API>) {
  sdk.api.register("listScopes", listScopes);
  sdk.api.register("previewSitemapPrune", previewSitemapPrune);
  sdk.api.register("pruneSitemap", pruneSitemap);
  sdk.api.register("previewHistoryPrune", previewHistoryPrune);
  sdk.api.register("pruneHistory", pruneHistory);
  sdk.api.register("importExportJson", importExportJson);
}
