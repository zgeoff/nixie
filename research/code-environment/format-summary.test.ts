import { expect, test } from 'bun:test';
import { formatSummary } from './format-summary.ts';

test('it counts the right code runs and takes the median and nearest-rank p90 of each cell', () => {
  expect(
    formatSummary(
      [
        { image: 'box', program: 'node', sample: 1, code: 0, matches: true, runMs: 410, programMs: 82 },
        { image: 'box', program: 'node', sample: 2, code: 0, matches: true, runMs: 300, programMs: 72 },
        { image: 'box', program: 'node', sample: 3, code: 0, matches: true, runMs: 320, programMs: 73 },
        { image: 'box', program: 'node', sample: 4, code: 0, matches: true, runMs: 310, programMs: 72 },
        { image: 'box', program: 'node', sample: 5, code: 0, matches: true, runMs: 305, programMs: 72 },
        { image: 'box', program: 'shell', sample: 1, code: 0, matches: true, runMs: 290, programMs: 8 },
        { image: 'box', program: 'shell', sample: 2, code: 1, matches: false, runMs: 280, programMs: 9 },
        { image: 'box', program: 'shell', sample: 3, code: 0, matches: false, runMs: 295, programMs: 7 },
      ],
      [
        { image: 'box', probe: 'node version', code: 0, programMs: 12, output: 'v20.19.2' },
        {
          image: 'box',
          probe: 'npm install',
          code: 1,
          programMs: 250,
          output: 'npm ERR! code ENOTFOUND\nnpm ERR!     /home/box/.npm/_logs/debug-0.log',
        },
        { image: 'box', probe: 'pipe', code: 0, programMs: 3, output: 'left | right' },
      ],
    ),
  ).toMatchInlineSnapshot(`
    "## Programs

    | Image | Program | Code runs | Right | Total median | Total p90 | Program median | Program p90 |
    | --- | --- | --: | --: | --: | --: | --: | --: |
    | box | node | 5 | 5 | 310 | 410 | 72 | 82 |
    | box | shell | 3 | 1 | 290 | 295 | 8 | 9 |

    ## Probes

    | Image | Probe | Exit | Program ms | Error or last line |
    | --- | --- | --: | --: | --- |
    | box | node version | 0 | 12 | v20.19.2 |
    | box | npm install | 1 | 250 | npm ERR! code ENOTFOUND |
    | box | pipe | 0 | 3 | left \\| right |
    "
  `);
});

test('it gives the same summary for the same code runs', () => {
  expect(
    formatSummary(
      [{ image: 'box', program: 'python', sample: 1, code: 0, matches: true, runMs: 330, programMs: 22 }],
      [{ image: 'box', probe: 'python start', code: 0, programMs: 8, output: '' }],
    ),
  ).toStrictEqual(
    formatSummary(
      [{ image: 'box', program: 'python', sample: 1, code: 0, matches: true, runMs: 330, programMs: 22 }],
      [{ image: 'box', probe: 'python start', code: 0, programMs: 8, output: '' }],
    ),
  );
});
