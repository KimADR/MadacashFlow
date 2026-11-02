import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const sourceUrl = process.env.RESTORE_SOURCE_URL;
const targetUrl = process.env.RESTORE_TARGET_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error('RESTORE_SOURCE_URL and RESTORE_TARGET_URL are required.');
}

function parseLocalDatabase(value, expectedDatabase) {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    database !== expectedDatabase
  ) {
    throw new Error(
      `Restore verification only permits localhost database ${expectedDatabase}.`,
    );
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

const source = parseLocalDatabase(sourceUrl, 'madacash_restore_source');
const target = parseLocalDatabase(targetUrl, 'madacash_restore_target');
if (source.host !== target.host || source.port !== target.port || source.user !== target.user) {
  throw new Error('Restore source and target must use the same local PostgreSQL instance and user.');
}

const table = `restore_probe_${randomUUID().replaceAll('-', '')}`;
const backupPath = join(tmpdir(), `madacash-restore-${randomUUID()}.dump`);
const useDockerPgTools = process.env.PG_TOOLS_IN_DOCKER === 'true';
const runnerUid = process.getuid?.();
const runnerGid = process.getgid?.();

if (useDockerPgTools && (runnerUid === undefined || runnerGid === undefined)) {
  throw new Error('Docker PostgreSQL tools require a Unix runner.');
}

function run(command, args, database) {
  const executable = useDockerPgTools ? 'docker' : command;
  const commandArgs = useDockerPgTools
    ? [
        'run',
        '--rm',
        '--network',
        'host',
        '--user',
        `${runnerUid}:${runnerGid}`,
        '--volume',
        `${tmpdir()}:${tmpdir()}`,
        '--env',
        'PGPASSWORD',
        'postgres:16-alpine',
        command,
        ...args,
      ]
    : args;
  const result = spawnSync(executable, commandArgs, {
    env: { ...process.env, PGPASSWORD: database.password },
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${command} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function connectionArgs(database) {
  return ['--host', database.host, '--port', database.port, '--username', database.user];
}

const sourceArgs = connectionArgs(source);
const targetArgs = connectionArgs(target);
const psql = (database, sql) =>
  run(
    'psql',
    [
      ...connectionArgs(database),
      '--dbname',
      database.database,
      '--set=ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--quiet',
      '--command',
      sql,
    ],
    database,
  );

try {
  const targetRelations = psql(
    target,
    "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S');",
  );
  if (targetRelations !== '0') {
    throw new Error('Restore target is not empty; refusing to overwrite database objects.');
  }

  psql(
    source,
    `CREATE TABLE public.${table} (id integer PRIMARY KEY, amount_ar bigint NOT NULL, label text NOT NULL); INSERT INTO public.${table} VALUES (1, 9000000000000001, 'fictitious-restore-check');`,
  );
  run(
    'pg_dump',
    [
      ...sourceArgs,
      '--dbname',
      source.database,
      '--format=custom',
      `--table=public.${table}`,
      `--file=${backupPath}`,
    ],
    source,
  );
  run(
    'pg_restore',
    [
      ...targetArgs,
      '--dbname',
      target.database,
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      backupPath,
    ],
    target,
  );

  const restored = psql(
    target,
    `SELECT amount_ar::text || ':' || label FROM public.${table} WHERE id = 1;`,
  );
  if (restored !== '9000000000000001:fictitious-restore-check') {
    throw new Error('Restored data does not match the synthetic backup probe.');
  }
  console.log('PostgreSQL backup/restore verification passed for the synthetic probe.');
} finally {
  psql(source, `DROP TABLE IF EXISTS public.${table};`);
  psql(target, `DROP TABLE IF EXISTS public.${table};`);
  rmSync(backupPath, { force: true });
}
