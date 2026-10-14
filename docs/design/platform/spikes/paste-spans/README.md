# Spike: which spans of a message you pasted

This spike records, in a text box, which spans of a message you typed and which arrived by paste,
drop or another route, and keeps those spans correct through later edits. The memory write rules
need the record: a quote from a pasted span never counts as your evidence. The page runs the span
logic that the web client ships in `@heynixie/contract`, wired the way the client's composer wires
it.

- Bun 1.4.2, `playwright-core` 1.61.0, with Chromium build 1228, Firefox build 1532 and WebKit build
  2311
- Android 16, Chrome 154.0.8037.126, Gboard 18.4.1.985164140

## Question

Can a text box in the web client tell typed text from pasted text reliably, keep the spans right
when you edit around and inside a paste, and fail closed when it cannot tell? Does any keyboard path
on an Android phone insert pasted text that the client labels as typed?

## Run it

Run each command from this directory. The browser run drives a textarea with real key presses and a
real clipboard copy and paste in Chromium, Firefox and WebKit. WebKit needs system libraries that
Playwright installs only on Ubuntu and Debian, so the run uses Playwright's own image, with the repo
mounted so the page can bundle the shipped span logic:

```bash
bun install
docker run --rm --ipc=host -v "$(git rev-parse --show-toplevel)":/repo \
  -v "$(command -v bun)":/usr/local/bin/bun:ro -w /repo/docs/design/platform/spikes/paste-spans \
  mcr.microsoft.com/playwright:v1.61.0-noble bun browser.ts
```

The device run serves the same page to a phone and appends each `beforeinput`, `input` and
composition event, with the spans after each `input`, to a log file:

```bash
bun device.ts <log_file>
adb reverse tcp:4263 tcp:4263
```

Open `http://localhost:4263/?case=<case_name>&copy=<copy_text>` in the phone's browser. The copy
button puts `<copy_text>` on the clipboard, so a paste or a clipboard suggestion inserts known text.
Drive the keyboard with `adb shell input tap`, `swipe` and `motionevent`, never
`adb shell input text`, which bypasses the keyboard.

- [page.ts](page.ts) runs in the page. It builds the pending input on `beforeinput`, applies it on
  `input` and clears it, as the composer does.
- [browser.ts](browser.ts) holds the desktop steps, and [device.ts](device.ts) the phone server.

## Answer

On the desktop, all 3 browsers label a paste right and keep the spans right through every edit. On
Android, 2 Gboard paths insert pasted text as `insertText`, and the client labels it `typed`: the
clipboard chip and Gboard's own undo. The mapping of that run could not tell them from typing, and
the client now applies the rule in [the client fix](#the-client-fix).

### Desktop browsers

Chromium, Firefox and WebKit printed the same spans:

```text
type, paste                    typed:"hello " pasted:"PASTED"
type after the paste           typed:"hello " pasted:"PASTED" typed:" world"
type inside the paste          typed:"hello " pasted:"PAS" typed:"x" pasted:"TED" typed:" world"
delete the pasted text         typed:"hello  world"
undo the delete                typed:"hello " unknown:"PASxTED" typed:" world"
insertText (as an IME would)   typed:"hello  café world"
paste over a selection         pasted:"PASTED" typed:"  café world"
inputTypes: insertText, insertFromPaste, deleteContentBackward, historyUndo
```

Firefox delivers Playwright's `insertText` as `insertCompositionText`, which the mapping also labels
`typed`.

- **Source:** it comes from `inputType`, not the `paste` event. One mapping covers paste, drop and
  autocorrect. Undo and redo arrive as `historyUndo` and `historyRedo`, which say nothing about
  where the restored text came from, so the mapping labels them `unknown`.
- **Failing closed:** every input type outside the typed list becomes `unknown`, so evidence under
  0011 needs an affirmative `typed`.
- **Selection:** it pins each edit. Comparing the 2 strings alone is ambiguous next to repeated
  text, and each ambiguity can leave a pasted character labelled typed. Reading the selection and
  the direction of a delete on `beforeinput` resolves each one, and the contract package's unit
  tests cover the cases.

### Android, Gboard in Chrome

Gboard is the only keyboard on the test phone. Each case below shows the `inputType` and `data` of
every `input` event, and the spans after it. Every event arrived with `isComposing` false, and no
composition event fired, so Gboard in Chrome sends each key, each suggestion and each swiped word as
one `insertText`.

```text
typing         insertText "H" "e" "l" "l" "o" " " ...  typed:"Hello there "
prediction     insertText "tomorrow "                  typed:"See you tomorrow "
autocorrect    insertText "h"                          typed:"I saw teh"
               deleteContentBackward                   typed:"I saw "
               insertText "the "                       typed:"I saw the "
swipe          insertText "works"                      typed:"Hi works"
long-press     insertFromPaste "pasted words"          typed:"See " pasted:"pasted words"
edit inside    insertText "x"                          typed:"See " pasted:"pasted" typed:"x" pasted:" words"
undo           deleteContentBackward                   typed:"See "
               insertText "pastedx words"              typed:"See pastedx words"
chip           insertText "chip test words"            typed:"chip test words"
```

The swipe traced the keys of "world", and Gboard read the path as "works"; the case tests the route,
not the recognizer.

- **Clipboard chip:** tapping Gboard's clipboard suggestion inserts the copied text as one
  `insertText`, the same event as a tapped prediction, so the mapping labels all 3 copied words
  `typed`.
- **Gboard's undo:** after a delete, Ctrl+Z through Gboard produced no `historyUndo` event. The
  deleted text came back as one `insertText`, so a deleted and restored paste comes back `typed`.
- **Selection fallback:** it never fired. Each insertion landed at the selection that `beforeinput`
  reported, autocorrect's included, because Gboard deletes the wrong word as its own edit first.

### The client fix

A rule that a single `insertText` of more than one word counts as `unknown` catches both bad cases
in the log, the chip with 3 words and the undo with 2. It demotes none of the typed cases, because a
prediction, an autocorrection and a swiped word each insert one word, with at most a trailing space.
The rule needs the event's `data` in the pending input, which `beforeinput` carries.

The rule leaves one gap: a clipboard item of one word, or an undo that restores one word, still
lands `typed`.

### Android, a second run

A second run on the same phone, with Chrome 155.0.8059.79 and the same Gboard, tested the rule
itself. The page in the first run never passed the event's `data` to the span logic, so its chip row
shows the labels from before the rule. The page now passes it, logs the key events and the text
after each edit, and walks through the cases with `?guided`. The contract package's fixtures hold
each recorded sequence, and its tests replay them through the shipped logic.

```text
typing         insertText "T" "h" "e" " " ...       typed:"The blue kettle is warm"
completion     insertText "le " after "Kett"        typed:"Kettle warm "
prediction     insertText "luck " "with " "the "    typed:"Good luck with the "
tapped fix     deleteContentBackward [8, 11]        typed:"The kettis warm "
               insertText "le "                     typed:"The kettle is warm "
split          deleteContentBackward [4, 14]        typed:"The "
               insertText "garden gate "            typed:"The garden gate "
long-press     insertFromPaste                      pasted:"long-press test words"
chip           insertText "chip test words"         unknown:"chip test words"
```

- **Split of a run-together word:** typing "gardengate" made Gboard delete the word and insert
  "garden gate " as one `insertText` of 2 words. The multi-word rule labelled those typed words
  `unknown`, so a quote over them failed as not typed. This was the one path in the run that turned
  typed text `unknown`. The rule now counts such an insert as typed when it lands where the delete
  before it removed typed text, and holds the same characters apart from whitespace.
- **Key events:** Chrome fired a keydown with key code 229 before every Gboard insert, the chip's
  included, so key events tell no route apart.
- **A tapped fix:** tapping a misspelled word deleted the wrong letters at that word, then inserted
  the fix there, so the selection pinned it and the fix stayed typed.

A split that also changes a letter, such as "gardengste" to "garden gate", or a capital, stays
`unknown`.

### React Native

The Android run tested the web client in Chrome, not a React Native input. React Native's
`TextInput` has no paste event; its docs mention paste only in an iOS spacing option
([TextInput](https://reactnative.dev/docs/textinput)). The routes are:

- a native paste hook, such as `@mattermost/react-native-paste-input` 2.0.1, which needs the new
  architecture, or a small Expo module of nixie's own that catches the paste menu action
- a clipboard comparison through `expo-clipboard`, which on iOS shows the system's paste prompt
- a rule that labels every insertion longer than one character `unknown` unless a native paste hook
  named it

A native paste hook misses the clipboard chip, which inserts text as if it were typed, without the
paste menu. Swipe typing and suggestions insert whole words the same way. The safe default on native
is therefore the last rule: a multi-character insertion that no hook named counts as `unknown`, and
the cost is that a swiped or suggested word never serves as evidence.

## Untested

- Voice typing, because the test phone's microphone did not work.
- Phrase suggestions of several words, which Gboard on the test phone never offered.
- An undo by touch alone; the run reached Gboard's undo through Ctrl+Z.
- Keyboards other than Gboard, and browsers on Android other than Chrome.
- A real drag and drop; the mapping labels `insertFromDrop` as `dropped`.
- Any React Native input on a device.
