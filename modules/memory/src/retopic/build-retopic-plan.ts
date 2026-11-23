import { pickTopicSpelling } from '../label/pick-topic-spelling';
import type { TopicMoveCode } from '../utils/error/topic-move-error';
import type { RetopicItem, RetopicMove, RetopicPlan, RetopicSource, RetopicTarget } from './types';

export type RetopicPlanResult =
  | { readonly status: 'planned'; readonly plan: RetopicPlan }
  | { readonly status: 'refused'; readonly code: TopicMoveCode; readonly message: string };

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
  const long = moves.find((move) => [...move.toTopic].length > topicLimit);

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

function refuse(
  code: TopicMoveCode,
  message: string,
): { readonly status: 'refused'; readonly code: TopicMoveCode; readonly message: string } {
  return { status: 'refused', code, message };
}

type ChosenItems =
  | { readonly status: 'chosen'; readonly items: readonly RetopicItem[] }
  | { readonly status: 'refused'; readonly code: TopicMoveCode; readonly message: string };

function pickSourceItems(items: readonly RetopicItem[], source: RetopicSource): ChosenItems {
  if (source.kind === 'items') {
    if (source.items.length === 0) {
      return refuse('EMPTY_MOVE', 'refused: pass at least one item to move');
    }

    const found = source.items.map((ref) => items.find((item) => item.itemID === ref.itemID));
    const missing = source.items.find((_ref, index) => found[index] === undefined);

    if (missing !== undefined) {
      return refuse('UNKNOWN_ITEM', `refused: no memory item ${missing.shortID} to move`);
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
    gist: item.labels.gist,
    fromSubject: item.subject,
    fromTopic: item.labels.topic,
    toTopic: source.kind === 'topic' ? topic + item.labels.topic.slice(source.topic.length) : topic,
  };
}

function buildSentence(
  source: RetopicSource,
  to: RetopicTarget,
  moves: readonly RetopicMove[],
): string {
  const origins = [...new Set(moves.map((move) => `${move.fromSubject}/${move.fromTopic}`))];
  const from = source.kind === 'topic' ? `${source.subject}/${source.topic}` : joinOrigins(origins);
  const count = `${String(moves.length)} ${moves.length === 1 ? 'item' : 'items'}`;

  return `${from} → ${to.subject}/${to.topic}, ${count}`;
}

function joinOrigins(origins: readonly string[]): string {
  const [only] = origins;

  return origins.length === 1 && only !== undefined ? only : `${String(origins.length)} topics`;
}
