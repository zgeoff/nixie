export interface PeriodCount {
  // the ISO date of the period's first day, which a count change names
  readonly start: string;
  readonly dollars: number;

  // the limit in force in US dollars, null on a route with none
  readonly limit: number | null;
  readonly tripped: boolean;
}

export interface ProviderCounts {
  readonly provider: string;
  readonly day: PeriodCount;
  readonly month: PeriodCount;
}

export interface RouteCounts {
  readonly route: string;

  // the provider whose limits bind the route
  readonly provider: string;
  readonly day: PeriodCount;
  readonly month: PeriodCount;
}
