import { Schema } from 'effect';

export const ToolDefinition = Schema.Struct({
  type: Schema.Literal('function'),
  function: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    parameters: Schema.Unknown, // JSON Schema
  }),
});
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>;

export const ExecuteToolRequest = Schema.Struct({
  name: Schema.String,
  arguments: Schema.Unknown,
});
export type ExecuteToolRequest = Schema.Schema.Type<typeof ExecuteToolRequest>;
