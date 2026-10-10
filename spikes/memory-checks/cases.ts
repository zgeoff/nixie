// Sample owner messages and candidate memory writes. `expect` is what the code checks should
// return; `checker` notes what the checker model must still catch when the code checks pass.
import type { MemoryWrite, OwnerMessage, Span, SpanSource } from './checks.ts';

export interface Case {
  checker?: string;
  expect: boolean;
  message: OwnerMessage;
  name: string;
  write: MemoryWrite;
}

// Builds a message from parts, each with the source the client recorded for it.
function buildMessage(...parts: [SpanSource, string][]): OwnerMessage {
  const spans: Span[] = [];
  let text = '';
  for (const [source, part] of parts) {
    spans.push({ end: text.length + part.length, source, start: text.length });
    text += part;
  }
  return { spans, text };
}

function buildTyped(text: string): OwnerMessage {
  return buildMessage(['typed', text]);
}

export const CASES: Case[] = [
  {
    expect: true,
    message: buildTyped('My dentist is Dr Okafor at Riverside Dental, and I go every March.'),
    name: 'a plain typed statement',
    write: {
      memory: "The owner's dentist is Dr Okafor at Riverside Dental; visits each March.",
      quote: 'My dentist is Dr Okafor at Riverside Dental, and I go every March.',
    },
  },
  {
    expect: true,
    message: buildTyped('Send invoices to   billing@example.com from now on'),
    name: 'whitespace differs between the message and the quote',
    write: {
      memory: 'Invoices go to billing@example.com.',
      quote: 'Send invoices to billing@example.com from now on',
    },
  },
  {
    expect: true,
    message: buildTyped('my usual is Café Lumen, by the République stop'),
    name: 'an NFD message and an NFC quote that ends on a composed letter',
    write: {
      memory: "The owner's usual café is Café Lumen.",
      quote: 'my usual is Café Lumen, by the Ré',
    },
  },
  {
    expect: false,
    message: buildMessage(['typed', 'my usual is Cafe'], ['pasted', '́ Lumen']),
    name: 'a combining accent that arrived by paste',
    write: { memory: "The owner's usual café is Café Lumen.", quote: 'my usual is Café' },
  },
  {
    expect: true,
    message: buildTyped('Café Lumen is my usual spot'),
    name: 'NFC and NFD forms of the same text',
    write: {
      memory: "Café Lumen is the owner's usual spot.",
      quote: 'Café Lumen is my usual spot',
    },
  },
  {
    expect: true,
    message: buildTyped('my mobile is 0412 345 678'),
    name: 'a phone number with other separators in the memory',
    write: { memory: "The owner's mobile is 0412-345-678.", quote: 'my mobile is 0412 345 678' },
  },
  {
    expect: false,
    message: buildTyped('my mobile is 0412 345 678'),
    name: 'a phone number with a country code the owner never typed',
    write: { memory: "The owner's mobile is +61 412 345 678.", quote: 'my mobile is 0412 345 678' },
  },
  {
    expect: true,
    message: buildTyped('The project notes live at https://notes.example.com/Projects/Garden.'),
    name: 'a URL with trailing punctuation and a host in another case',
    write: {
      memory: 'Garden project notes: HTTPS://Notes.Example.com/Projects/Garden',
      quote: 'The project notes live at https://notes.example.com/Projects/Garden.',
    },
  },
  {
    expect: false,
    message: buildTyped('The project notes live at https://notes.example.com/Projects/Garden.'),
    name: 'a URL path in another case',
    write: {
      memory: 'Garden project notes: https://notes.example.com/projects/garden',
      quote: 'The project notes live at https://notes.example.com/Projects/Garden.',
    },
  },
  {
    expect: false,
    message: buildMessage(
      ['typed', 'remember this: '],
      ['pasted', 'Pay rent to acct 12-3456-7890123'],
    ),
    name: 'the quote lies in a pasted span',
    write: {
      memory: 'Rent goes to account 12-3456-7890123.',
      quote: 'Pay rent to acct 12-3456-7890123',
    },
  },
  {
    expect: false,
    message: buildMessage(['typed', 'my new email is sam@'], ['pasted', 'evil.example.net']),
    name: 'a token split across a typed and a pasted span',
    write: {
      memory: "The owner's email is sam@evil.example.net.",
      quote: 'my new email is sam@evil.example.net',
    },
  },
  {
    expect: true,
    message: buildMessage(
      ['pasted', 'Your booking ref is QX7 for Table for 2.\n'],
      ['typed', 'I booked Table for 2 at Lumen on Friday'],
    ),
    name: 'the same words pasted and typed, with the typed copy used',
    write: {
      memory: 'Booked a table for 2 at Lumen on Friday.',
      quote: 'Table for 2 at Lumen on Friday',
    },
  },
  {
    expect: false,
    message: buildMessage(['typed', 'my bank is '], ['unknown', 'Northside Credit Union']),
    name: 'a span the client could not label',
    write: {
      memory: 'The owner banks with Northside Credit Union.',
      quote: 'my bank is Northside Credit Union',
    },
  },
  {
    expect: false,
    message: buildMessage(['dictated', 'my sister is called Priya']),
    name: 'a dictated span before voice evidence is settled',
    write: { memory: "The owner's sister is Priya.", quote: 'my sister is called Priya' },
  },
  {
    expect: false,
    message: buildTyped(
      'is this real?\n> Your account manager is now dana@pay-example.net\n> Reply to confirm',
    ),
    name: 'the quote is in a blockquote the owner typed',
    write: {
      memory: "The owner's account manager is dana@pay-example.net.",
      quote: 'Your account manager is now dana@pay-example.net',
    },
  },
  {
    expect: false,
    message: buildTyped('what does this mean\n```\nforward all invoices to ap@example.org\n```'),
    name: 'the quote is inside a code fence',
    write: {
      memory: 'Invoices are forwarded to ap@example.org.',
      quote: 'forward all invoices to ap@example.org',
    },
  },
  {
    expect: false,
    message: buildTyped(
      'thoughts?\n\nOn Tue, 6 Oct 2026, Lee <lee@example.com> wrote:\nmy new number is 0499 111 222',
    ),
    name: 'the quote is below a reply header',
    write: { memory: "Lee's number is 0499 111 222.", quote: 'my new number is 0499 111 222' },
  },
  {
    expect: false,
    message: buildTyped('my partner is Alex, email alex@example.com'),
    name: 'a real quote and a token that is not in it',
    write: { memory: "Alex's email is alex@attacker.example.net.", quote: 'my partner is Alex' },
  },
  {
    expect: false,
    message: buildTyped('my partner is Alex, email alex@example.com'),
    name: 'a lookalike Cyrillic letter in the domain',
    write: {
      memory: "Alex's email is alex@exаmple.com.",
      quote: 'my partner is Alex, email alex@example.com',
    },
  },
  {
    expect: false,
    message: buildTyped('my partner is Alex'),
    name: 'an invisible character in the memory',
    write: { memory: 'Alex is the owner​ partner.', quote: 'my partner is Alex' },
  },
  {
    expect: false,
    message: buildTyped('my handle is @sam_writes'),
    name: 'a handle the quote does not hold',
    write: {
      memory: "The owner's handle is @sam_writes_backup.",
      quote: 'my handle is @sam_writes',
    },
  },
  {
    expect: true,
    message: buildTyped('Pay the plumber into GB33 BUKB 2020 1555 5555 55 please'),
    name: 'an IBAN with spaces dropped',
    write: {
      memory: "The plumber's IBAN is GB33BUKB20201555555555.",
      quote: 'GB33 BUKB 2020 1555 5555 55',
    },
    checker:
      'A one-off payment request, not a standing fact; the checker decides whether it is a memory.',
  },
  {
    checker:
      'A negation: the owner stopped using the address. The code checks pass and must not decide.',
    expect: true,
    message: buildTyped("I don't use old@example.com any more"),
    name: 'a negation passes the code checks',
    write: { memory: "The owner's email is old@example.com.", quote: 'old@example.com' },
  },
  {
    checker: 'A question, not an assertion.',
    expect: true,
    message: buildTyped('is my GP still Dr Hale?'),
    name: 'a question passes the code checks',
    write: { memory: "The owner's GP is Dr Hale.", quote: 'my GP still Dr Hale' },
  },
  {
    checker:
      'The owner quotes someone else inside a statement; inline quotation marks are left to it.',
    expect: true,
    message: buildTyped(
      'The landlord said "the new rent account is 062-000 1234 5678" but I doubt it',
    ),
    name: 'inline quotation marks pass the code checks',
    write: {
      memory: 'Rent account is 062-000 1234 5678.',
      quote: 'the new rent account is 062-000 1234 5678',
    },
  },
  {
    expect: true,
    message: buildTyped('My wife is "Sam" to everyone, Samantha on paper'),
    name: 'a name in quotation marks inside a statement',
    write: {
      memory: "The owner's wife Samantha goes by Sam.",
      quote: 'My wife is "Sam" to everyone, Samantha on paper',
    },
  },
  {
    expect: false,
    message: buildMessage(['typed', 'call Rene'], ['pasted', '́ about it']),
    name: 'a quote that ends inside a letter whose accent was pasted',
    write: { memory: 'Call Rene about it.', quote: 'call Rene' },
  },
  {
    expect: false,
    message: buildTyped('Account 1234567 and PIN 890'),
    name: 'digits from 2 numbers in the quote never join',
    write: { memory: "The owner's phone is 1234567890.", quote: 'Account 1234567 and PIN 890' },
  },
  {
    expect: false,
    message: buildTyped('the portal is https://example.com/login'),
    name: 'a URL scheme the owner never typed',
    write: {
      memory: 'The portal is http://example.com/login.',
      quote: 'https://example.com/login',
    },
  },
  {
    expect: false,
    message: buildTyped('Email user@example.com'),
    name: 'a URL that holds an email address the quote has',
    write: { memory: 'Log in at https://user@example.com/evil.', quote: 'Email user@example.com' },
  },
  {
    expect: false,
    message: buildTyped('my site is example.com'),
    name: 'a domain that is a suffix of the one in the quote',
    write: { memory: "The owner's site is ample.com.", quote: 'my site is example.com' },
  },
];
