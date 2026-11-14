export interface ItemPage<Item> {
  readonly items: readonly Item[];

  readonly next: number | null;
}

// One loop walks the pages, because a `yield*` per page passes each item through one generator
// frame for every page before it.
export async function* readPages<Item>(
  readPage: (after: number) => Promise<ItemPage<Item>>,
): AsyncGenerator<Item, void, undefined> {
  let after: number | null = 0;

  while (after !== null) {
    const page: ItemPage<Item> = await readPage(after);

    yield* page.items;
    after = page.next;
  }
}
