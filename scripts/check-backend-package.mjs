import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies })) {
  assert(!/^(file:|link:)/.test(version), `Backend deve ser independente: remover ${name} (${version}).`);
}
console.log('Pacote do backend independente: sem referencias locais ao aplicativo.');
