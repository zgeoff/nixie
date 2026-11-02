export interface ProbeTarget {
  readonly directory: string;
  readonly env: Readonly<Record<string, string>>;
}
