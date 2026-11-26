export type ControlOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'replaced'; readonly replacedMicros: number }
  | {
      readonly kind: 'above_cap';
      readonly route: string | null;
      readonly provider: string | null;
      readonly cap: number;
    }
  | { readonly kind: 'no_route_limit'; readonly route: string }
  | { readonly kind: 'unknown_provider' }
  | { readonly kind: 'period_ended' }
  | { readonly kind: 'unknown_route' }
  | { readonly kind: 'unknown_sandbox' }
  | { readonly kind: 'revision_changed' };
