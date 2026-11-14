export type SpoolFileName =
  | {
      readonly kind: 'part';
      readonly captureID: string;
      readonly writer: string;
      readonly counter: number;
    }
  | {
      readonly kind: 'cap';
      readonly captureID: string;
      readonly writer: string;
      readonly counter: number;
      readonly upstreamStatus: number;
    }
  | {
      readonly kind: 'miss';
      readonly captureID: string;
      readonly writer: string;
      readonly counter: number;
    };
