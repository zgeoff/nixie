export type ControlOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'above_cap'; readonly route: string; readonly cap: number }
  | { readonly kind: 'period_ended' }
  | { readonly kind: 'unknown_route' }
  | { readonly kind: 'unknown_sandbox' };
