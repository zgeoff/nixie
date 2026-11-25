import { expect, test } from 'bun:test';
import { makeServerMessageFilter } from './make-server-message-filter';

function setupTest() {
  const holder = { isHolding: false };
  const filter = makeServerMessageFilter({ canInput: () => holder.isHolding });

  const feed = (bytes: readonly number[]) => {
    const result = filter.push(new Uint8Array(bytes));

    return {
      passed: result.forward.flatMap((piece) => [...piece]),
      isMalformed: result.isMalformed,
    };
  };

  // the version, security type 1 with its result, and a ServerInit of 32 bits per pixel and no name
  const handshake = [
    ...new TextEncoder().encode('RFB 003.008\n'),
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    32,
    24,
    0,
    1,
    0,
    255,
    0,
    255,
    0,
    255,
    16,
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];

  return {
    filter,
    holder,
    feed,
    handshake,
    shakeHands: () => {
      feed(handshake);
    },
  };
}

test('it passes the handshake and the announcement of the desktop, and reads its pixel size', () => {
  const ctx = setupTest();

  expect([ctx.feed(ctx.handshake), ctx.filter.readPixelBits()]).toStrictEqual([
    { passed: ctx.handshake, isMalformed: false },
    32,
  ]);
});

test('it reads no pixel size before the desktop announces itself', () => {
  const ctx = setupTest();

  ctx.feed(ctx.handshake.slice(0, 12));

  expect(ctx.filter.readPixelBits()).toBeNull();
});

test.each([
  {
    name: 'a raw rectangle',
    update: [0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    name: 'a CopyRect rectangle',
    update: [0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 1, 0, 1, 0, 2],
  },
  {
    name: 'a ZRLE rectangle',
    update: [0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 16, 0, 0, 0, 3, 9, 9, 9],
  },
  {
    name: 'a cursor rectangle with its picture and mask',
    update: [
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      2,
      0,
      2,
      255,
      255,
      255,
      17,
      ...Array.from({ length: 16 }, () => 7),
      1,
      1,
    ],
  },
  {
    name: 'a desktop size rectangle',
    update: [0, 0, 0, 1, 0, 0, 0, 0, 2, 128, 1, 224, 255, 255, 255, 33],
  },
])('it passes an update of $name, whole or in single bytes, and the message after it', (row) => {
  const bell = [2];
  const whole = setupTest();
  const split = setupTest();

  whole.shakeHands();
  split.shakeHands();

  const piecewise = [...row.update, ...bell].map((byte) => split.feed([byte]));

  expect([
    whole.feed([...row.update, ...bell]),
    piecewise.flatMap((result) => result.passed),
    piecewise.some((result) => result.isMalformed),
  ]).toStrictEqual([
    { passed: [...row.update, ...bell], isMalformed: false },
    [...row.update, ...bell],
    false,
  ]);
});

test('it passes a colour map message and the message after it', () => {
  const ctx = setupTest();
  const colours = [1, 0, 0, 0, 0, 2, ...Array.from({ length: 12 }, () => 3)];

  ctx.shakeHands();

  expect(ctx.feed([...colours, 2])).toStrictEqual({
    passed: [...colours, 2],
    isMalformed: false,
  });
});

test('it drops the clipboard text of the desktop for a viewer that does not hold it', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.feed([3, 0, 0, 0, 0, 0, 0, 3, 97, 98, 99, 2])).toStrictEqual({
    passed: [2],
    isMalformed: false,
  });
});

test('it passes the clipboard text of the desktop to the viewer that holds it', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  expect(ctx.feed([3, 0, 0, 0, 0, 0, 0, 3, 97, 98, 99, 2])).toStrictEqual({
    passed: [3, 0, 0, 0, 0, 0, 0, 3, 97, 98, 99, 2],
    isMalformed: false,
  });
});

test('it sends none of a clipboard text that arrives in pieces when the hold ends before the last', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  const first = ctx.feed([3, 0, 0, 0, 0, 0, 0, 3, 97]);

  ctx.holder.isHolding = false;

  expect([first, ctx.feed([98, 99, 2])]).toStrictEqual([
    { passed: [], isMalformed: false },
    { passed: [2], isMalformed: false },
  ]);
});

test('it drops the clipboard text that starts while the viewer only watches, though a hold starts before its end', () => {
  const ctx = setupTest();

  ctx.shakeHands();
  ctx.feed([3, 0, 0, 0, 0, 0, 0, 3, 97]);

  ctx.holder.isHolding = true;

  expect(ctx.feed([98, 99, 2])).toStrictEqual({ passed: [2], isMalformed: false });
});

test('it drops the clipboard text past a megabyte, and passes the message after it', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  // the length is 1048577, one past the cap
  const dropped = ctx.feed([3, 0, 0, 0, 0, 16, 0, 1, ...Array.from({ length: 1000 }, () => 97)]);
  const rest = ctx.feed([...Array.from({ length: 1_048_577 - 1000 }, () => 97), 2]);

  expect([dropped, rest]).toStrictEqual([
    { passed: [], isMalformed: false },
    { passed: [2], isMalformed: false },
  ]);
});

test.each([
  {
    name: 'another protocol version',
    bytes: [...new TextEncoder().encode('RFB 003.003\n')],
  },
  {
    name: 'an offer of security',
    bytes: [...new TextEncoder().encode('RFB 003.008\n'), 2, 1, 2],
  },
])('it closes on $name', (row) => {
  const ctx = setupTest();

  expect(ctx.feed(row.bytes)).toStrictEqual({ passed: [], isMalformed: true });
});

test.each([
  { name: 'a message type it does not know', bytes: [9] },
  {
    name: 'a rectangle of an encoding it cannot frame',
    bytes: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 5],
  },
])('it closes on $name after the handshake', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.feed(row.bytes)).toStrictEqual({ passed: [], isMalformed: true });
});

test('it passes nothing once it has closed', () => {
  const ctx = setupTest();

  ctx.shakeHands();
  ctx.feed([9]);

  expect(ctx.feed([2])).toStrictEqual({ passed: [], isMalformed: true });
});
