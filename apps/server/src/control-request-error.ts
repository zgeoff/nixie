// a request the socket refuses before the memory gate sees it, with the status it answers
export class ControlRequestError extends Error {
  override readonly name = 'ControlRequestError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
