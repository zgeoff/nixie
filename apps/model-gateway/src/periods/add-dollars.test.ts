import { expect, test } from 'bun:test';
import { addDollars } from './add-dollars';

test('#addDollars adds ten replies of 0.1 dollars to exactly 1 dollar', () => {
  let total = 0;

  for (let reply = 0; reply < 10; reply += 1) {
    total = addDollars(total, 0.1);
  }

  expect(total).toBe(1);
});
