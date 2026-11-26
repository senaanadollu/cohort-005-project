#!/usr/bin/env node
// Fails when a staged file is estimated to be over the token limit.
// Tokens are estimated as bytes / 4 of the staged content, which is cheap
// and close enough for a size gate.
import { execFileSync } from "node:child_process";

const TOKEN_LIMIT = 5000;
const BYTES_PER_TOKEN = 4;

// Generated files nobody splits by hand.
const EXEMPT = [/^package-lock\.json$/, /^drizzle\//];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// One record per staged file: "<added>\t<deleted>\t<path>\0".
// Binary files report "-" for both counts.
const staged = git([
  "diff",
  "--cached",
  "--numstat",
  "--no-renames",
  "--diff-filter=ACM",
  "-z",
])
  .split("\0")
  .filter(Boolean)
  .map((record) => {
    const [added, deleted, ...pathParts] = record.split("\t");
    return {
      path: pathParts.join("\t"),
      isBinary: added === "-" && deleted === "-",
    };
  });

const offenders = staged
  .filter((file) => !file.isBinary)
  .filter((file) => !EXEMPT.some((pattern) => pattern.test(file.path)))
  .map((file) => {
    const bytes = Number(git(["cat-file", "-s", `:${file.path}`]).trim());
    return { path: file.path, tokens: Math.ceil(bytes / BYTES_PER_TOKEN) };
  })
  .filter((file) => file.tokens > TOKEN_LIMIT)
  .sort((a, b) => b.tokens - a.tokens);

if (offenders.length === 0) process.exit(0);

const list = offenders
  .map((file) => `  ${file.path}  (~${file.tokens} tokens)`)
  .join("\n");

console.error(`
File size check failed: ${offenders.length} staged file(s) are over ${TOKEN_LIMIT} tokens (estimated as bytes / ${BYTES_PER_TOKEN}).

${list}

A file this large costs an agent a big share of its context every time it is
read. Split it before committing:

1. Find the seams first. Read the file and list the separate responsibilities
   in it. Split along those, never at an arbitrary line count.
2. Route files (app/routes/*): move loader and action logic into a module
   under app/modules/ (read app/modules/README.md first; import a module only
   through its entry point), and move sub-components into their own files
   under app/components/. Leave the route as thin wiring.
3. Library and module files: group functions by the concept they serve and
   give each group its own file. Keep the public entry point small and
   re-export from it so callers do not change.
4. Test files: split by the behaviour under test, one file per unit or
   feature area. Move shared fixtures and builders into a helper file that
   the split tests import.
5. Large inline data (fixtures, seed rows, long constant tables): move it to
   its own file and import it.
6. Each new file must also be under ${TOKEN_LIMIT} tokens and have a name that says what
   it holds. Do not create "part1/part2" or "utils2" files.
7. Make the split its own commit with no behaviour change, then run
   \`npm run check\`.

Do not bypass this with --no-verify, and do not shrink a file by deleting
comments or tests. If the file is generated, add its path to EXEMPT in
scripts/check-file-tokens.mjs instead.
`);
process.exit(1);
