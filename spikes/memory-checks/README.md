# Spike: the quote check and the destination-token check

This spike writes the code half of the memory write gate from
[0011](../../docs/decisions/0011-memory-writes.md) and runs it over sample owner messages: the quote
check, the destination-token check, and the server's detection of quoted blocks, which the client
leaves to the server. The [memory writes design](../../docs/design/memory/writes.md) rests on it.

- Bun 1.4.2, no other dependencies

## Question

Can code decide the first 2 checks from 0011 exactly, with the paste spans the client records? Where
does it fail closed, and which messages pass both checks while still needing the checker model?

## Run it

Run each command from this directory.

```bash
bun install
bun run.ts
bun test
```

- [checks.ts](./checks.ts) holds the 2 checks and the quoted-block finder.
- [cases.ts](./cases.ts) holds 31 owner messages, each with its spans and a candidate memory write,
  and the expected verdict.

## Answer

Code decides both checks with a few rules, and all 31 cases gave the expected verdict:

```text
ok  a plain typed statement: pass  tokens=[]
ok  whitespace differs between the message and the quote: pass  tokens=[billing@example.com]
ok  an NFD message and an NFC quote that ends on a composed letter: pass  tokens=[]
ok  a combining accent that arrived by paste: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  NFC and NFD forms of the same text: pass  tokens=[]
ok  a phone number with other separators in the memory: pass  tokens=[0412-345-678]
ok  a phone number with a country code the owner never typed: fail  the phone +61 412 345 678 is not in the quote
ok  a URL with trailing punctuation and a host in another case: pass  tokens=[HTTPS://Notes.Example.com/Projects/Garden]
ok  a URL path in another case: fail  the url https://notes.example.com/projects/garden is not in the quote
ok  the quote lies in a pasted span: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  a token split across a typed and a pasted span: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  the same words pasted and typed, with the typed copy used: pass  tokens=[]
ok  a span the client could not label: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  a dictated span before voice evidence is settled: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  the quote is in a blockquote the owner typed: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  the quote is inside a code fence: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  the quote is below a reply header: fail  the quote is in the message but not wholly in typed text outside a quoted block
ok  a real quote and a token that is not in it: fail  the email alex@attacker.example.net is not in the quote
ok  a lookalike Cyrillic letter in the domain: fail  the email alex@exаmple.com is not in the quote
ok  an invisible character in the memory: fail  the memory holds an invisible character
ok  a handle the quote does not hold: fail  the handle @sam_writes_backup is not in the quote
ok  an IBAN with spaces dropped: pass  tokens=[GB33BUKB20201555555555]
      checker must judge: A one-off payment request, not a standing fact; the checker decides whether it is a memory.
ok  a negation passes the code checks: pass  tokens=[old@example.com]
      checker must judge: A negation: the owner stopped using the address. The code checks pass and must not decide.
ok  a question passes the code checks: pass  tokens=[]
      checker must judge: A question, not an assertion.
ok  inline quotation marks pass the code checks: pass  tokens=[062-000 1234 5678]
      checker must judge: The owner quotes someone else inside a statement; inline quotation marks are left to it.
ok  a name in quotation marks inside a statement: pass  tokens=[]
ok  a quote that ends inside a letter whose accent was pasted: fail  the quote is not in the message
ok  digits from 2 numbers in the quote never join: fail  the phone 1234567890 is not in the quote
ok  a URL scheme the owner never typed: fail  the url http://example.com/login is not in the quote
ok  a URL that holds an email address the quote has: fail  the url https://user@example.com/evil is not in the quote
ok  a domain that is a suffix of the one in the quote: fail  the domain ample.com is not in the quote

31 of 31 cases as expected
```

- **Matching.** Both strings are compared in NFC, with each run of whitespace collapsed to one
  space, and nothing else is relaxed. NFC composes only within a grapheme, so the check normalises
  the message one grapheme at a time and keeps each grapheme's original offset, which maps a match
  back onto the spans. A match must start and end on grapheme boundaries. A quote passes when any
  one of its occurrences lies wholly in `typed` spans, so a pasted copy elsewhere in the message
  never hides a typed one.
- **Fail closed.** A quote that touches a pasted, dropped, unknown or dictated character fails, even
  by one combining accent. A token split between a typed and a pasted span fails the same way.
- **Quoted blocks.** Blockquote lines, code fences and everything below a reply or forward header
  never count. Inline quotation marks are left to the checker model, because owners quote names and
  titles inside their own statements, as the last case shows.
- **Tokens.** Emails, URLs, handles, phone numbers, IBAN-style account numbers and bare domains are
  found in the memory and must appear in the quote. Phone and account numbers compare by digits with
  each number in the quote on its own, so separators may differ, but a country code the owner never
  typed fails and digits from 2 numbers never join. Emails, handles, domains and a URL's scheme and
  host compare without case, a URL's scheme must match, and its path keeps its case. A URL is found
  before an email inside it, and a bare domain must equal a host in the quote. A lookalike letter
  from another script fails, and an invisible format character in the memory or the quote fails at
  once.
- **The checker is needed.** A negation, a question and a quotation of someone else all pass both
  code checks. The code checks bound which destinations a memory can name; only the checker can tell
  whether the owner asserted it.

## Untested

- The checker model itself, and its accuracy on real owner messages, which the memory checker spike
  in [open items](../../docs/design/open-items.md#spikes-and-design-tasks) measures.
- Token patterns beyond these kinds, such as local account formats without an IBAN, postal
  addresses, crypto wallet addresses and short codes.
- Real paste spans from the clients; the cases build spans by hand.
- Messages in scripts other than Latin, where the grapheme segmenter and whitespace rules matter
  more.
