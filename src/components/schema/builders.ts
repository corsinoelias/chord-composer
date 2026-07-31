// Typed builders for the JSON-LD shapes that repeat across many pages by hand today —
// only for types that have actually drifted (missing @id on 8 pages' BreadcrumbList;
// page-local WebApplication entities on 20 pages lacking an @id, ambiguous against the
// sitewide one in BaseLayout.astro). One-off schema types (MusicComposition, etc.) stay
// hand-built at the call site and just render through <JsonLd> — not every schema needs
// a builder, only the ones that keep breaking the same way on every new page.

export interface BreadcrumbItem {
  name: string;
  item: string;
}

export function buildBreadcrumbSchema(pageUrl: string, items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: items.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

export interface WebApplicationSchemaInput {
  url: string;
  name: string;
  description: string;
  featureList: string[];
  applicationCategory?: string;
  operatingSystem?: string;
  browserRequirements?: string;
}

// `@id` is scoped to the page's own URL (not the sitewide `#app` id used in
// BaseLayout.astro) so a tool page's WebApplication entity reads as a distinct
// sub-application rather than an unlabeled duplicate of the sitewide one.
export function buildWebApplicationSchema(input: WebApplicationSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${input.url}#app`,
    name: input.name,
    url: input.url,
    applicationCategory: input.applicationCategory ?? 'MusicApplication',
    operatingSystem: input.operatingSystem ?? 'Any',
    description: input.description,
    featureList: input.featureList,
    browserRequirements: input.browserRequirements ?? 'Requires a modern browser with Web Audio API support',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
