import { FileSystem } from '@effect/platform';
import { Effect, Schema } from 'effect';

import { defineTool, forEachFile } from '@yuji/server/helpers/ToolHelper';

const WriteFileSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String.annotations({ description: 'The file path for the write operation.' }),
      content: Schema.String.annotations({ description: 'The complete and final textual payload for the file.' }),
    }),
  ).pipe(Schema.minItems(1), Schema.maxItems(20), Schema.annotations({ description: 'A list of files to write.' })),
});

export const WriteFile = defineTool(
  'write_file',
  `USE this for the wholesale creation of a new file or the complete and total replacement of an existing file's contents. This tool operates on the principle of absolute overwrite; it does not perform partial edits or diffs.`,
  WriteFileSchema,
  ({ files }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* forEachFile(files, ({ path, content }) =>
        Effect.gen(function* () {
          yield* fs.writeFileString(path, content);
          return { path, status: 'success' };
        }),
      );
    }),
);
