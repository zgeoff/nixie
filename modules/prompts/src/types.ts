interface PromptOwner {
  readonly name: string | null;
}

export interface PromptContexts {
  readonly writer: {
    readonly persona: string;
    readonly owner: PromptOwner;
    readonly assistant: { readonly name: string | null };
  };
  readonly consolidator: {
    readonly persona: string;
    readonly owner: PromptOwner;
    readonly memory: { readonly maxChanges: number };
  };
  readonly 'content-checker': { readonly owner: PromptOwner };
  readonly 'retirement-checker': Readonly<Record<string, never>>;
  readonly session: {
    readonly persona: string;
    readonly skillCatalog: string | null;
    readonly owner: PromptOwner;
  };
  readonly compaction: {
    readonly owner: PromptOwner;
    readonly summary: { readonly words: number };
  };
}

export type PromptID = keyof PromptContexts;

interface PromptPart<Context> {
  readonly text: string;

  readonly isShown?: (context: Context) => boolean;
}

export interface PromptEntry<Context> {
  readonly paths: readonly string[];

  readonly buildValues: (context: Context) => Readonly<Record<string, string>>;

  readonly parts: Readonly<Record<string, PromptPart<Context>>>;

  readonly template: string;
}

export type PromptValues<Paths extends readonly string[]> = Readonly<Record<Paths[number], string>>;

export interface PromptOverride {
  readonly parts: Readonly<Record<string, string>>;
  readonly template: string | null;
}

export type PromptOverrides = Readonly<Partial<Record<PromptID, PromptOverride>>>;
