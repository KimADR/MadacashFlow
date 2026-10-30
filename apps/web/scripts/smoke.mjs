import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const appName = packageJson.name;

if (!appName || appName !== '@mada-cash/web') {
  throw new Error('Nom du package web invalide pour le smoke test');
}

console.log(`Web smoke OK: ${appName}`);
