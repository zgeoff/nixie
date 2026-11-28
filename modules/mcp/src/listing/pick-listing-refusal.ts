import type { ToolForm } from '../types';

export const listingLimits = {
  tools: 200,
  listingBytes: 1024 * 1024,
  schemaBytes: 64 * 1024,
  pages: 20,
} as const;

// What the pages of a listing hold so far.
export interface ListingTotals {
  readonly pages: number;
  readonly toolCount: number;
  readonly bytes: number;

  // the names of the tools read so far
  readonly names: ReadonlySet<string>;
}

export interface PageContents {
  // the size of the page as the server sent it, cursor included
  readonly bytes: number;
  readonly forms: readonly ToolForm[];

  // whether the page names a page after it
  readonly hasNextPage: boolean;
}

// Why a listing is refused whole once this page joins it, or null. A page that names a page after
// the last one allowed refuses the listing before that page is fetched. A server decides the size of its
// listing, so nixie bounds it before it compiles or stores any of it.
export function pickListingRefusal(totals: ListingTotals, page: PageContents): string | null {
  if (
    totals.pages + 1 > listingLimits.pages ||
    (page.hasNextPage && totals.pages + 1 >= listingLimits.pages)
  ) {
    return `the listing runs over ${String(listingLimits.pages)} pages`;
  }

  if (totals.toolCount + page.forms.length > listingLimits.tools) {
    return `the listing holds more than ${String(listingLimits.tools)} tools`;
  }

  if (totals.bytes + page.bytes > listingLimits.listingBytes) {
    return `the listing is larger than ${String(listingLimits.listingBytes)} bytes`;
  }

  const seen = new Set(totals.names);

  for (const form of page.forms) {
    if (seen.has(form.name)) {
      return `the listing holds two forms of the tool ${form.name}`;
    }

    seen.add(form.name);

    const oversized = [form.inputSchema, form.outputSchema].some(
      (schema) =>
        schema !== null && Buffer.byteLength(JSON.stringify(schema)) > listingLimits.schemaBytes,
    );

    if (oversized) {
      return `a schema of the tool ${form.name} is larger than ${String(listingLimits.schemaBytes)} bytes`;
    }
  }

  return null;
}
