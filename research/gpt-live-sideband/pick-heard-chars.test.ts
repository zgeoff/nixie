import { expect, test } from 'bun:test';
import { pickHeardChars } from './pick-heard-chars.ts';

test.each([
  ['the spoken words follow the sent text', 'The bus leaves at noon. Bring a coat.', 'The bus leaves at noon.', 22],
  [
    'the speech layer reorders and rewords the opening',
    'This week you have two things. On Monday, the vet.',
    "You've got two things this week. On Monday,",
    40,
  ],
  ['a number comes back as digits', 'The shop opens at nine and closes at five.', 'The shop opens at 9 and', 26],
  [
    'the cut leaves one word that also appears later in the sent text',
    'This week you have four things. On Monday, the plumber. On Friday, dinner.',
    "You've got four things this week. On",
    30,
  ],
  ['nothing was spoken', 'The bus leaves at noon.', '', 0],
])('#pickHeardChars counts the sent text up to the last spoken word when %s', (_, sent, spoken, heardChars) => {
  expect(pickHeardChars(sent, spoken)).toBe(heardChars);
});
