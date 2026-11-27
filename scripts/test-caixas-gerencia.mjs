import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the real service with local snapshots; no Firebase connection.
const source = fs.readFileSync('src/services/caixas.js', 'utf8')
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];\r?\n/g, '')
  .replace(/export (async )?function/g, '$1function');
function setup() {
  const listeners = [], updates = [], errors = [];
  const subscribe = new Function('collection', 'query', 'where', 'onSnapshot', 'db', source + ';return subscribeCaixasGerencia;')(
    (_, name) => name, (ref, ...filters) => ({ ref, filters }), (field, op, value) => ({ field, op, value }),
    (query, next, error) => { const listener = { query, next, error, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; }, {},
  );
  return { listeners, updates, errors, start: (uid = 'store-one', inicio = '2026-11-27', fim = inicio) => subscribe(uid, inicio, fim, items => updates.push(items), error => errors.push(error)) };
}
const snapshot = rows => ({ docs: rows.map(row => ({ id: row.id, data: () => row })) });
const a = { id: 'a', uid: 'store-one', atendenteId: 'operator-a', data: '2026-11-27', status: 'aberto' };
const b = { id: 'b', uid: 'store-one', atendenteId: 'operator-b', data: '2026-11-27', status: 'fechado' };
const old = { id: 'old', uid: 'store-one', atendenteId: 'operator-c', data: '2026-11-25', status: 'aberto' };
const foreign = { ...a, id: 'foreign', uid: 'store-two' };
const archived = { ...b, id: 'archived', status: 'arquivado' };
const env = setup(), stop = env.start();
assert.equal(env.listeners.length, 2);
for (const listener of env.listeners) {
  assert.equal(listener.query.ref, 'caixas');
  assert.ok(listener.query.filters.some(f => f.field === 'uid' && f.op === '==' && f.value === 'store-one'));
  assert.ok(listener.query.filters.every(f => !['atendenteId', 'autorUid', 'authUid'].includes(f.field)));
}
assert.ok(env.listeners[0].query.filters.some(f => f.field === 'data' && f.op === '>='));
assert.ok(env.listeners[1].query.filters.some(f => f.field === 'status' && f.value === 'aberto'));
assert.ok(env.listeners[1].query.filters.every(f => f.field !== 'data'));
env.listeners[0].next(snapshot([a, b, archived, foreign]));
assert.equal(env.updates.length, 0);
env.listeners[1].next(snapshot([a, old, foreign]));
assert.deepEqual(env.updates.at(-1).map(item => item.id).sort(), ['a', 'b', 'old']);
// A shift opened after the management screen loaded appears without reloading.
const late = { ...a, id: 'late', atendenteId: 'operator-d' };
env.listeners[1].next(snapshot([a, old, late]));
assert.ok(env.updates.at(-1).some(item => item.id === 'late'));
// Closing in-range retains the record; closing an out-of-range shift removes it.
env.listeners[0].next(snapshot([{ ...a, status: 'fechado' }, b, late]));
env.listeners[1].next(snapshot([late]));
assert.equal(env.updates.at(-1).find(item => item.id === 'a').status, 'fechado');
assert.ok(!env.updates.at(-1).some(item => item.id === 'old'));
const count = env.updates.length;
stop();
assert.ok(env.listeners.every(listener => listener.stopped));
env.listeners[0].next(snapshot([]));
assert.equal(env.updates.length, count);
const noContext = setup(); noContext.start(''); assert.equal(noContext.listeners.length, 0);
const reversed = setup(); reversed.start('store-one', '2026-11-28', '2026-11-27'); assert.equal(reversed.listeners.length, 0);
const denied = setup(); denied.start(); denied.listeners[0].error({ code: 'permission-denied' }); denied.listeners[1].next(snapshot([a]));
assert.equal(denied.errors.length, 1); assert.equal(denied.updates.length, 0);

const screen = fs.readFileSync('src/screens/Gerencia.jsx', 'utf8');
const dateSource = screen.slice(screen.indexOf('function dataFortaleza('), screen.indexOf('function formatMoney('));
const date = new Function(dateSource + ';return dataFortaleza;')();
assert.equal(date(new Date('2026-11-28T02:59:59Z')), '2026-11-27');
assert.equal(date(new Date('2026-11-28T03:00:00Z')), '2026-11-28');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const universalExpression = app.match(/const UNIVERSAL = (.*);/)[1].replaceAll('import.meta.env', 'env');
const universal = new Function('env', 'return ' + universalExpression);
assert.equal(universal({ MODE: 'production' }), true);
assert.equal(universal({ MODE: 'universal', VITE_REDE_ID: 'legacy-store' }), true);
assert.equal(universal({ MODE: 'gelato', VITE_REDE_ID: 'legacy-store' }), false);

const parseEnv = file => Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const base = parseEnv('.env');
assert.ok(base.VITE_FIREBASE_PROJECT_ID);
for (const mode of ['gelato', 'cafe-guajara']) {
  const merged = { ...base, ...parseEnv('.env.' + mode) };
  for (const field of ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_AUTH_DOMAIN']) assert.equal(merged[field], base[field], field + ' diverge no modo ' + mode);
}
console.log('OK: consulta por loja, operadores distintos, atualizacao ao vivo, periodo, caixas antigos, deduplicacao e isolamento.');
console.log('OK: encerramento, erros de acesso, descarte de callbacks antigos e fuso de Fortaleza.');
console.log('OK: contexto do PWA generico alinhado ao APK e configuracoes Firebase locais coincidentes.');
