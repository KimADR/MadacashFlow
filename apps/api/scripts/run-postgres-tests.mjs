import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated local test database.');
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
if (
  !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
  !['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) ||
  databaseName !== 'madacash_test'
) {
  throw new Error(
    'PostgreSQL integration tests only run against localhost database madacash_test.',
  );
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
};

function run(command, args) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? process.env.ComSpec ?? 'cmd.exe' : command;
  const commandArgs = isWindows
    ? ['/d', '/s', '/c', `${command} ${args.join(' ')}`]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('pnpm', [
  'exec',
  'prisma',
  'migrate',
  'deploy',
  '--schema',
  'prisma/schema.prisma',
]);
run('pnpm', [
  'exec',
  'jest',
  '--config',
  'jest.postgres.config.js',
  '--runInBand',
]);
