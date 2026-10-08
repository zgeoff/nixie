# Spike: which spans of a message the owner pasted

This spike records, in a text box, which spans of a message the owner typed and which arrived by
paste, drop or another route, and keeps those spans correct through later edits. The memory write
rules need the record: a quote from a pasted span never counts as the owner's evidence.

- Bun 1.4.2, `playwright-core` 1.61.0, with Chromium build 1228 and Firefox build 1532

## Question

Can a text box in the web client tell typed text from pasted text reliably, keep the spans right
when the owner edits around and inside a paste, and fail closed when it cannot tell? What does a
React Native text input offer for the same job?

## Run it

Run each command from this directory.

```bash
bun install
bun test
bun browser.ts
```

- [spans.ts](./spans.ts) holds the span logic. It takes the text before and after an edit, plus the
  caret before the edit, finds the edit, shifts and splits the existing spans, and labels the
  inserted text with a source: `typed`, `pasted`, `dropped` or `unknown`.
- [page.ts](./page.ts) runs in the page. It reads the caret on `beforeinput` and the source from
  `InputEvent.inputType` on `input`.
- [browser.ts](./browser.ts) drives a textarea with real key presses and a real clipboard copy and
  paste.

## Answer

In Chromium and Firefox, `InputEvent.inputType` names a paste as `insertFromPaste`, and the spans
stay right through every edit the run made. Both browsers printed the same spans:

```text
chromium
  type, paste                    typed:"hello " pasted:"PASTED"
  type after the paste           typed:"hello " pasted:"PASTED" typed:" world"
  type inside the paste          typed:"hello " pasted:"PAS" typed:"x" pasted:"TED" typed:" world"
  delete the pasted text         typed:"hello  world"
  undo the delete                typed:"hello " unknown:"PASxTED" typed:" world"
  insertText (as an IME would)   typed:"hello  café world"
  paste over a selection         pasted:"PASTED" typed:"  café world"
  inputTypes: insertText, insertFromPaste, deleteContentBackward, historyUndo
```

- **The source comes from `inputType`, not the `paste` event.** One mapping covers paste, drop and
  autocorrect (`insertReplacementText`). Undo and redo arrive as `historyUndo` and `historyRedo`,
  which say nothing about where the restored text came from, so the mapping labels them `unknown`.
- **Fail closed.** Every input type outside the typed list becomes `unknown`, so evidence under 0011
  needs an affirmative `typed`. Undoing the delete of a paste brings the text back as `unknown`, not
  as `typed`.
- **The caret anchors each edit.** Comparing the 2 strings alone is ambiguous next to repeated text:
  pasting `ba` into `a|b` gives `abab`, and a plain diff labels the pasted `b` as typed. The unit
  tests show the case, and reading the caret on `beforeinput` resolves it.
- **The logic is small and portable.** It needs 2 strings and a caret, so a React Native input can
  share it with a different source for each edit.

### React Native

React Native's `TextInput` has no paste event; its docs mention paste only in an iOS spacing option
([TextInput](https://reactnative.dev/docs/textinput)). The routes are:

- a native paste hook, such as `@mattermost/react-native-paste-input` 2.0.1, which needs the new
  architecture, or a small Expo module of nixie's own that catches the paste menu action
- a clipboard comparison through `expo-clipboard`, which on iOS shows the system's paste prompt
- a rule that labels every insertion longer than one character `unknown` unless a native paste hook
  named it

On Android, a keyboard's clipboard suggestion inserts text as if it were typed, without the paste
menu, so a native paste hook alone misses it. Swipe typing and suggestions insert whole words the
same way. The safe default on native is therefore the last rule: a multi-character insertion that no
hook named counts as `unknown`, and the cost is that a swiped or suggested word never serves as
evidence.

## Untested

- WebKit, which failed to launch for lack of system libraries on the host.
- A real drag and drop, which the run did not perform; the mapping labels `insertFromDrop` as
  `dropped`.
- IME composition with a real input method, beyond Playwright's `insertText`.
- Any React Native input on a device: the paste hook, a keyboard clipboard suggestion, swipe typing,
  autocorrect and voice typing on Android.
