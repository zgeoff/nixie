/* oxlint-disable sort-vars -- each value depends on the one before it */
// Runs every case through the code checks and prints one line per case.
import { CASES } from './cases.ts';
import { checkWrite } from './checks.ts';

let failures = 0;
for (const sample of CASES) {
  const verdict = checkWrite(sample.message, sample.write),
    matched = verdict.ok === sample.expect,
    outcome = verdict.ok
      ? `pass  tokens=[${verdict.tokens.join(', ')}]`
      : `fail  ${verdict.reason}`;
  if (!matched) {
    failures += 1;
  }
  console.log(`${matched ? 'ok ' : 'BAD'} ${sample.name}: ${outcome}`);
  if (verdict.ok && sample.checker !== undefined) {
    console.log(`      checker must judge: ${sample.checker}`);
  }
}
console.log(`\n${CASES.length - failures} of ${CASES.length} cases as expected`);
process.exitCode = failures === 0 ? 0 : 1;
