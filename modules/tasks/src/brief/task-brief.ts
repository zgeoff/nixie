// The brief of a started task. A brief with the origin message is a task_message record, and one
// with the origin created sits in the task.created record of a task that the release before
// started. body is null once a forget removes it.
export type TaskBrief =
  | {
      readonly origin: 'message';
      readonly messageID: string;
      readonly from: string;
      readonly sequence: number;
      readonly sentAt: Date;
      readonly body: string | null;
    }
  | {
      readonly origin: 'created';
      readonly taskID: string;
      readonly from: string;
      readonly sequence: number;
      readonly sentAt: Date;
      readonly body: string | null;
    };
