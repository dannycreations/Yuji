import { Effect, FileSystem, Schema } from 'effect';

import { defineTool } from '@yuji/server/helpers/ToolHelper';

const ListFileSchema = Schema.Struct({
  path: Schema.String.annotate({ description: 'The directory path for inspection.' }),
  recursive: Schema.Boolean.annotate({
    description: 'Set to `true` for a recursive, deep listing of all contents; `false` for a top-level-only listing.',
  }),
});

export const ListFile = defineTool(
  'list_file',
  `USE this to survey the contents of a directory or to verify the existence of a file or directory. This function provides a structural overview without the unnecessary overhead of reading file content.`,
  ListFileSchema,
  ({ path, recursive }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(path);
      if (!exists) {
        return { path, error: `Directory not found: ${path}` };
      }

      const files = yield* fs.readDirectory(path, { recursive });
      return { path, files };
    }).pipe(Effect.catch((error) => Effect.succeed({ path, error: String(error) }))),
);
