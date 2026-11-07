interface OverlayEntry<Value> {
  readonly key: string;
  readonly hash: string;
  readonly value: Value;
}

interface OverlayChange<Value> {
  readonly key: string;
  readonly hash: string | null;
  readonly value: Value;
}

interface OverlaidChange<Seeded, Change> {
  readonly change: Change;
  readonly beneath: Seeded | null;
}

export interface RuntimeOverlay<Seeded, Change> {
  readonly inForce: readonly OverlaidChange<Seeded, Change>[];
  readonly adopted: readonly Change[];
}

export interface RuntimeOverlayInput<Seeded, Change> {
  readonly seeded: readonly OverlayEntry<Seeded>[];
  readonly changes: readonly OverlayChange<Change>[];
}

export function buildRuntimeOverlay<Seeded, Change>(
  input: RuntimeOverlayInput<Seeded, Change>,
): RuntimeOverlay<Seeded, Change> {
  const seeded = new Map(input.seeded.map((entry) => [entry.key, entry]));

  const inForce: OverlaidChange<Seeded, Change>[] = [];
  const adopted: Change[] = [];

  for (const change of input.changes) {
    const beneath = seeded.get(change.key) ?? null;

    if ((beneath?.hash ?? null) === change.hash) {
      adopted.push(change.value);
    } else {
      inForce.push({ change: change.value, beneath: beneath?.value ?? null });
    }
  }

  return { inForce, adopted };
}
