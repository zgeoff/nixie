export type TopicMoveCode =
  | 'CHANGED_SINCE_SHOWN'
  | 'EMPTY_MOVE'
  | 'INVISIBLE_CHARACTER'
  | 'PINNED_SUBJECT_MOVE'
  | 'SAME_TOPIC'
  | 'TOPIC_TOO_LONG'
  | 'UNKNOWN_ITEM'
  | 'UNKNOWN_TOPIC';

// A refusal of a topic write, such as a move of nothing or a fold order for a topic that no item
// holds. The message names what the model passed, and the code names the refusal.
export class TopicMoveError extends Error {
  override readonly name = 'TopicMoveError';

  readonly code: TopicMoveCode;

  constructor(code: TopicMoveCode, message: string) {
    super(message);

    this.code = code;
  }
}
