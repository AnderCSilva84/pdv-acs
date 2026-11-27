import assert from 'node:assert/strict';
import { podeOperarCaixa, atendentesPermitidosNoCaixa } from '../src/utils/caixaAccess.js';
const erika = { id: 'erika', ativo: true };
const paula = { id: 'paula', ativo: true };
const caixas = [{ uid: 'cafe', atendenteId: 'erika' }, { uid: 'cafe', atendenteId: 'paula' }];
for (const usuario of [erika, paula]) {
  assert.equal(podeOperarCaixa(caixas.find(c => c.atendenteId === usuario.id), 'cafe', usuario, 'atendente'), true);
  assert.equal(podeOperarCaixa(caixas.find(c => c.atendenteId !== usuario.id), 'cafe', usuario, 'atendente'), false);
  assert.deepEqual(atendentesPermitidosNoCaixa([erika, paula], usuario, 'atendente'), [usuario]);
}
assert.equal(podeOperarCaixa(caixas[0], 'outra-loja', erika, 'atendente'), false);
assert.equal(podeOperarCaixa(caixas[0], 'cafe', null, 'atendente'), false);
assert.equal(podeOperarCaixa(caixas[0], 'cafe', paula, 'gerencia'), true);
assert.deepEqual(atendentesPermitidosNoCaixa([erika, paula, { id: 'inativo', ativo: false }], erika, 'gerencia'), [erika, paula]);
console.log('Caixa: mesmos controles para todos os atendentes; somente caixa proprio; isolamento por loja; gerencia preservada.');
