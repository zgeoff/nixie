export interface WindowGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isViewable: boolean;
}

// Reads what xwininfo prints for a window: where its client area sits on the display, its size, and
// whether it is mapped. Output with no size is null.
export function parseWindowGeometry(output: string): WindowGeometry | null {
  const x = findNumber(output, 'Absolute upper-left X');
  const y = findNumber(output, 'Absolute upper-left Y');
  const width = findNumber(output, 'Width');
  const height = findNumber(output, 'Height');

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return { x, y, width, height, isViewable: /Map State:\s*IsViewable/u.test(output) };
}

function findNumber(output: string, label: string): number | null {
  const found = new RegExp(`${label}:\\s*(?<value>-?\\d+)`, 'u').exec(output);

  return found?.groups?.['value'] === undefined ? null : Number(found.groups['value']);
}
