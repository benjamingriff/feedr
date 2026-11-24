// Where this checkout and the main checkout live. In a git worktree they differ; in the main
// checkout they're the same.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const root = resolve(import.meta.dirname, '../..');

export const mainCheckout = dirname(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
);

/** The variables in an env file, or {} when there isn't one. */
export const readEnv = (path) => (existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {});
