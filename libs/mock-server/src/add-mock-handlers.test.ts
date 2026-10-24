import { expect, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { addMockHandlers } from './add-mock-handlers';
import { mockServer } from './mock-server';

test('it keeps an added handler through a reset', async () => {
  const handlersBefore = mockServer.listHandlers();

  onTestFinished(() => {
    mockServer.resetHandlers(...handlersBefore);
  });

  addMockHandlers(http.get('https://harbour.test/tide', () => HttpResponse.text('high')));

  mockServer.resetHandlers();

  const response = await fetch('https://harbour.test/tide');
  const text = await response.text();

  expect(text).toBe('high');
});

test('it keeps the handlers that were there before', async () => {
  const handlersBefore = mockServer.listHandlers();

  onTestFinished(() => {
    mockServer.resetHandlers(...handlersBefore);
  });

  addMockHandlers(http.get('https://harbour.test/tide', () => HttpResponse.text('high')));
  addMockHandlers(http.get('https://harbour.test/wind', () => HttpResponse.text('calm')));

  const response = await fetch('https://harbour.test/tide');
  const text = await response.text();

  expect(text).toBe('high');
});
