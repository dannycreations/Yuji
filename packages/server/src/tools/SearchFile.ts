import { Effect, Schema, Stream } from 'effect';
import { ChildProcess } from 'effect/process';

import { defineTool } from '@yuji/server/helpers/ToolHelper';

const SearchFileSchema = Schema.Struct({
  path: Schema.String.annotate({ description: 'The root directory path for the recursive search operation.' }),
  glob: Schema.String.annotate({ description: 'A glob pattern to constrain the search to specific file types (e.g., `*.ts`).' }),
  regex: Schema.String.annotate({ description: 'The Rust-compatible regular expression pattern to be matched.' }),
});

export const SearchFile = defineTool(
  'search_file',
  `USE this to execute a recursive search for a regular expression pattern within the file system. When the directive is to locate content matching a specific pattern across multiple files (e.g., finding all 'API_KEY' declarations), this is the only sanctioned instrument. It is superior to manual file-by-file inspection.`,
  SearchFileSchema,
  ({ path, glob, regex }) =>
    Effect.gen(function* () {
      // rg --column --line-number --no-heading --color never --glob 'pattern' 'regex' 'path'
      const stdout = yield* ChildProcess.make('rg', [
        '--column',
        '--line-number',
        '--no-heading',
        '--color',
        'never',
        '--glob',
        glob,
        regex,
        path,
      ]).pipe(Effect.flatMap((child) => Stream.runCollect(Stream.decodeText(child.stdout))));

      return { path, results: stdout.join('') };
    }).pipe(Effect.catch((error) => Effect.succeed({ path, error: String(error) }))),
);
