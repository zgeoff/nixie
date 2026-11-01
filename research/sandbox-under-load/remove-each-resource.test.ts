import { expect, mock, test } from 'bun:test';
import { removeEachResource } from './remove-each-resource';

test('it removes the secret when the imp removal fails, then reports the failure', async () => {
  const removeBox = mock(() => Promise.reject(new Error('impz rm exited 1: invented failure')));
  const removeSecret = mock(() => Promise.resolve(''));

  const removal = removeEachResource([removeBox, removeSecret]).then(
    () => null,
    (error: unknown) => error,
  );

  expect(await removal).toStrictEqual(
    new Error('cleanup left resources in impd:\nError: impz rm exited 1: invented failure'),
  );
  expect(removeSecret).toHaveBeenCalledTimes(1);
});

test('it reports every removal that fails', () => {
  const removeBox = mock(() => Promise.reject(new Error('impz rm exited 1: box busy')));
  const removeSecret = mock(() => Promise.reject(new Error('impz secret rm exited 1: no host')));

  expect(removeEachResource([removeBox, removeSecret])).rejects.toThrow(
    'cleanup left resources in impd:\nError: impz rm exited 1: box busy\nError: impz secret rm exited 1: no host',
  );
});

test('it resolves when every removal succeeds', () => {
  const removeBox = mock(() => Promise.resolve(''));
  const removeSecret = mock(() => Promise.resolve(''));

  expect(removeEachResource([removeBox, removeSecret])).resolves.toBeUndefined();
});
