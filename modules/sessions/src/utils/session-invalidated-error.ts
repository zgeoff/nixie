// The reason a cleanup aborts a turn with. A turn that ends on it keeps the replies it wrote,
// because the user already read them, and its step runs again without answering those messages.
export class SessionInvalidatedError extends Error {
  constructor() {
    super('a forget invalidated the session');

    this.name = 'SessionInvalidatedError';
  }
}
