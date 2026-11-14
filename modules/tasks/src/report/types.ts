export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

// The closed table of keywords that a field of a report shape takes. A nested object also carries
// additionalProperties: false, which nixie adds and a caller never writes.
export type FieldSchema = Readonly<{
  readonly type: FieldType;
  readonly description?: string;
  readonly enum?: readonly (string | number)[];
  readonly items?: FieldSchema;
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly required?: readonly string[];
  readonly maxLength?: number;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly additionalProperties?: false;
}>;

export type FieldKeyword = Exclude<keyof FieldSchema, 'additionalProperties'>;

// A report shape as a task run pins it: sorted keys, with every object closed.
export type ReportShape = Readonly<{
  readonly type: 'object';
  readonly properties: Readonly<Record<string, FieldSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}>;

export type ShapeFault =
  | { readonly fault: 'keyword'; readonly path: string; readonly keyword: string }
  | { readonly fault: 'value'; readonly path: string; readonly keyword: string }
  | { readonly fault: 'required'; readonly path: string; readonly name: string }
  | { readonly fault: 'size'; readonly size: number; readonly max: number };
