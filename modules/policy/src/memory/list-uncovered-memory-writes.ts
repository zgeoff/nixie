import { isPatternMatch } from '../rule/is-pattern-match';
import { isRuleMatch } from '../rule/is-rule-match';
import type { Rule, RuleCall, RuleCheck, RuleContext, RuleSource } from '../types';
import type { RuleNeed } from './is-need-met';
import { isNeedMet } from './is-need-met';

type WriteSubject = 'owner' | 'shared' | 'self';

interface WriteKind {
  readonly phrase: string;
  readonly tool: string;
  readonly subjects: readonly WriteSubject[];
  readonly need: RuleNeed;
  readonly hasImage: boolean;

  // the source lists the decision point can give the write
  readonly sources: readonly (readonly RuleSource[])[];
}

const typedOrNot: WriteKind['sources'] = [['owner'], ['outside']];
const untyped: WriteKind['sources'] = [['outside']];
const nonSelf: WriteKind['subjects'] = ['owner', 'shared'];

// a pin or a retirement adds no text, so its item may have any subject
const anySubject: WriteKind['subjects'] = ['owner', 'shared', 'self'];

const writeKinds: readonly WriteKind[] = [
  {
    phrase: 'a new fact',
    tool: 'memory.remember',
    subjects: nonSelf,
    need: 'none',
    hasImage: false,
    sources: typedOrNot,
  },
  {
    phrase: 'a text edit',
    tool: 'memory.edit',
    subjects: nonSelf,
    need: 'none',
    hasImage: false,
    sources: typedOrNot,
  },
  {
    phrase: 'a label-only edit',
    tool: 'memory.edit',
    subjects: nonSelf,
    need: 'none',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a new self-note',
    tool: 'memory.remember',
    subjects: ['self'],
    need: 'self_note',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a self-note text edit',
    tool: 'memory.edit',
    subjects: ['self'],
    need: 'self_note',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a self-note label edit',
    tool: 'memory.edit',
    subjects: ['self'],
    need: 'self_note',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a move of an item into self',
    tool: 'memory.edit',
    subjects: ['self'],
    need: 'self_note',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a move of an item out of self',
    tool: 'memory.edit',
    subjects: nonSelf,
    need: 'none',
    hasImage: false,
    sources: typedOrNot,
  },
  {
    phrase: 'a re-file of items to another topic',
    tool: 'memory.retopic',
    subjects: nonSelf,
    need: 'none',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a re-file of items into self',
    tool: 'memory.retopic',
    subjects: ['self'],
    need: 'self_note',
    hasImage: false,
    sources: untyped,
  },
  {
    phrase: 'a write from a photo',
    tool: 'memory.remember',
    subjects: nonSelf,
    need: 'photo',
    hasImage: true,
    sources: untyped,
  },
  {
    phrase: 'a pin',
    tool: 'memory.pin',
    subjects: anySubject,
    need: 'none',
    hasImage: false,
    sources: [[]],
  },
  {
    phrase: 'a retirement',
    tool: 'memory.retire',
    subjects: anySubject,
    need: 'none',
    hasImage: false,
    sources: typedOrNot,
  },
];

interface Place {
  readonly context: RuleContext;
  readonly suffix: string;
  readonly extraSources: readonly RuleSource[];
}

const places: readonly Place[] = [
  { context: 'conversation', suffix: ' from the conversation', extraSources: [] },
  { context: 'task', suffix: ' from a task', extraSources: ['task'] },
];

// A check on an argument other than subject or image narrows a rule in a way the list cannot know,
// so the list ignores it.
export function listUncoveredMemoryWrites(rule: Omit<Rule, 'id'>): readonly string[] {
  if (rule.outcome !== 'allow' || !isMemoryRule(rule)) {
    return [];
  }

  return writeKinds.flatMap((kind) => {
    const uncovered = places.filter((place) => !isKindCovered(rule, kind, place));

    return uncovered.length === places.length
      ? [kind.phrase]
      : uncovered.map((place) => `${kind.phrase}${place.suffix}`);
  });
}

const memoryToolNames = [...writeKinds.map((kind) => kind.tool), 'memory.unpin'];

function isMemoryRule(rule: Omit<Rule, 'id'>): boolean {
  return (
    rule.effects?.includes('memory_write') === true ||
    rule.tools?.some((pattern) => memoryToolNames.some((tool) => isPatternMatch(pattern, tool))) ===
      true
  );
}

function isKindCovered(rule: Omit<Rule, 'id'>, kind: WriteKind, place: Place): boolean {
  const checks = rule.checks ?? [];

  const narrowed: Rule = {
    ...rule,
    id: 'uncovered-check',
    checks: checks.filter((check) => isKeptCheck(check, kind)),
  };

  const isMatched = kind.subjects.some((subject) =>
    kind.sources.some((sources) =>
      isRuleMatch(narrowed, buildBestCall(rule, kind, place, { subject, sources })),
    ),
  );

  return isMatched && isNeedMet({ checks }, kind.need);
}

// A photo write carries an image the list invents, so a check on the image's own values cannot be
// told apart from a rule that fits a real photo.
function isKeptCheck(check: RuleCheck, kind: WriteKind): boolean {
  return check.arg === 'subject' || (check.arg.startsWith('image.') && !kind.hasImage);
}

interface Variant {
  readonly subject: WriteSubject;
  readonly sources: readonly RuleSource[];
}

// The time sits before any expiry, so a rule that expires still counts while it lasts.
function buildBestCall(
  rule: Omit<Rule, 'id'>,
  kind: WriteKind,
  place: Place,
  variant: Variant,
): RuleCall {
  return {
    tool: kind.tool,
    effects: ['memory_write'],
    context: place.context,
    task: place.context === 'task' ? (rule.definitions?.[0] ?? 'definition') : null,
    args: {
      subject: variant.subject,
      ...(kind.hasImage ? { image: { eventID: '1', number: 1 } } : {}),
    },
    destinations: [],
    sources: [...variant.sources, ...place.extraSources],
    at: Number.MIN_SAFE_INTEGER,
  };
}
