// A literal prefix, one character class repeated, and nothing after it. A prefix character is any
// character with no meaning in a pattern, or a backslash before ASCII punctuation.
const classPattern =
  /^\^(?<prefix>(?:[^\\[\](){}.*+?^$|]|\\[!-/:-@[-`{-~])*)\[(?<members>[^\]]+)\](?<repeat>[+*])\$$/u;

const openPattern = /^\^(?<prefix>(?:[^\\[\](){}.*+?^$|]|\\[!-/:-@[-`{-~])*)\.(?<repeat>[+*])\$$/u;

// Each class member is a printable ASCII character other than `.`, `\`, `]` and `^`, a range of
// them, \w, \d, or a backslash before ASCII punctuation. Such a class never opens with `^`, and
// never matches a line terminator, the one kind of character `.` refuses.
const safeMembers = /^(?:[ -\-/-[_-~]|\\[wd]|\\[!-/:-@[-`{-~])+$/u;

// True when every string the released pattern accepts, the current one accepts too: the current
// pattern keeps the released prefix and opens the class after it to any character but a line
// terminator. A `+` that becomes `*` widens too; a `*` that becomes `+` refuses the empty rest.
export function isWidenedPattern(released: string, current: string): boolean {
  const before = classPattern.exec(released)?.groups;
  const after = openPattern.exec(current)?.groups;

  if (before === undefined || after === undefined) {
    return false;
  }

  const isRepeatKept = after['repeat'] === '*' || before['repeat'] === '+';

  return (
    before['prefix'] === after['prefix'] &&
    safeMembers.test(before['members'] ?? '') &&
    isRepeatKept
  );
}
