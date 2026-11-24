import { pickTopicSpelling } from '../label/pick-topic-spelling';
import type { TopicMoveCode } from '../utils/error/topic-move-error';
import { countMoved } from './count-moved';
import { formatMovedCounts } from './format-moved-counts';
import type {
  RetopicItem,
  RetopicMove,
  RetopicPlanResult,
  RetopicSource,
  RetopicTarget,
} from './types';

const topicLimit = 40;
const invisible = /\p{Cf}/u;

// A whole-topic move rewrites the part of each topic that matches `from`, so `people/friends`
// follows `people` to its new name. Items already under the target topic and subject stay out of
// the move, and a move with none left is refused.
export function buildRetopicPlan(
  items: readonly RetopicItem[],
  source: RetopicSource,
  target: RetopicTarget,
): RetopicPlanResult {
  const topic = pickTopicSpelling(
    target.topic,
    items.map((item) => item.labels.topic),
  );

  if (invisible.test(topic)) {
    return refuse('INVISIBLE_CHARACTER', 'refused: the new topic holds an invisible character');
  }

  const chosen = pickSourceItems(items, source);

  if (chosen.status === 'refused') {
    return chosen;
  }

  const moves = chosen.items.map((item) => buildMove(item, source, topic));
  const long = moves.find((move) => (move.toTopic.match(/./gsu)?.length ?? 0) > topicLimit);

  if (long !== undefined) {
    return refuse(
      'TOPIC_TOO_LONG',
      `refused: item ${long.shortID} would take the topic ${long.toTopic}, which is longer than ${String(topicLimit)} characters`,
    );
  }

  const due = moves.filter(
    (move, index) =>
      chosen.items[index]?.subject !== target.subject ||
      move.toTopic.toLowerCase() !== move.fromTopic.toLowerCase(),
  );

  if (due.length === 0) {
    return refuse(
      'SAME_TOPIC',
      `refused: ${source.kind === 'topic' ? 'the topic is' : 'every item is'} already under ${target.subject}/${topic}`,
    );
  }

  const pinned = chosen.items.find(
    (item) =>
      item.isPinned &&
      item.subject !== target.subject &&
      due.some((move) => move.itemID === item.itemID),
  );

  if (pinned !== undefined) {
    return refuse(
      'PINNED_SUBJECT_MOVE',
      `refused: item ${pinned.shortID} is pinned, so it stays under its subject until you unpin it`,
    );
  }

  const to = { topic, subject: target.subject };

  return { status: 'planned', plan: { to, moves: due, sentence: buildSentence(source, to, due) } };
}

type RefusedPlan = Extract<RetopicPlanResult, { readonly status: 'refused' }>;

function refuse(code: TopicMoveCode, message: string): RefusedPlan {
  return { status: 'refused', code, message };
}

type ChosenItems =
  | { readonly status: 'chosen'; readonly items: readonly RetopicItem[] }
  | RefusedPlan;

function pickSourceItems(items: readonly RetopicItem[], source: RetopicSource): ChosenItems {
  if (source.kind === 'items') {
    const shortIDs = [...new Set(source.shortIDs)];

    if (shortIDs.length === 0) {
      return refuse('EMPTY_MOVE', 'refused: pass at least one item to move');
    }

    const found = shortIDs.map((shortID) => items.find((item) => item.shortID === shortID));
    const missing = shortIDs.find((_shortID, index) => found[index] === undefined);

    if (missing !== undefined) {
      return refuse('UNKNOWN_ITEM', `refused: no memory item ${missing} to move`);
    }

    return { status: 'chosen', items: found.filter((item) => item !== undefined) };
  }

  const wanted = source.topic.toLowerCase();

  const matched = items.filter((item) => {
    const held = item.labels.topic.toLowerCase();

    return item.subject === source.subject && (held === wanted || held.startsWith(`${wanted}/`));
  });

  return matched.length === 0
    ? refuse('EMPTY_MOVE', `refused: no item has the topic ${source.topic} under ${source.subject}`)
    : { status: 'chosen', items: matched };
}

function buildMove(item: RetopicItem, source: RetopicSource, topic: string): RetopicMove {
  return {
    itemID: item.itemID,
    shortID: item.shortID,
    state: item.state,
    gist: item.labels.gist,
    fromSubject: item.subject,
    fromTopic: item.labels.topic,
    toTopic:
      source.kind === 'topic' ? topic + getSubTopicSuffix(item.labels.topic, source.topic) : topic,
  };
}

// The sub-topics that follow the matched prefix, as the item spells them. The prefix matches in
// lower case, where a letter can change length, so the suffix is cut at a slash, never at a length.
function getSubTopicSuffix(held: string, prefix: string): string {
  const rest = held.split('/').slice(prefix.split('/').length);

  return rest.length === 0 ? '' : `/${rest.join('/')}`;
}

function buildSentence(
  source: RetopicSource,
  to: RetopicTarget,
  moves: readonly RetopicMove[],
): string {
  const origins = [...new Set(moves.map((move) => `${move.fromSubject}/${move.fromTopic}`))];
  const from = source.kind === 'topic' ? `${source.subject}/${source.topic}` : joinOrigins(origins);

  return `${from} → ${to.subject}/${to.topic}, ${formatMovedCounts(countMoved(moves))}`;
}

function joinOrigins(origins: readonly string[]): string {
  const [only] = origins;

  return origins.length === 1 && only !== undefined ? only : `${String(origins.length)} topics`;
}
