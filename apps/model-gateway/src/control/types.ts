// the one route or provider that a raise or a count change names
export type LimitTarget =
  | { readonly kind: 'route'; readonly id: string }
  | { readonly kind: 'provider'; readonly id: string };
