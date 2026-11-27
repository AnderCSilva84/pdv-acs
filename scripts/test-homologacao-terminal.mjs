import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarTextoComprovante } from '../src/services/textoComprovante.js';
import { buildAtendenteEmail } from '../src/utils/loginAtendente.js';

const sample = { loja: { nome: 'Future Shop', documento: '123', endereco: 'Rua de teste' }, venda: { vendaGrupoId: 'id123', itens: [{ nome: 'Produto com nome muito longo para testar quebra de linhas no comprovante', quantidade: 1, precoUnitario: 10, subtotal: 10 }], total: 10, pagamentos: [{ forma: 'Dinheiro', valor: 10 }], valorRecebido: 20, troco: 10 } };
const previousAt = Array.prototype.at;
let text;
try { Array.prototype.at = undefined; text = montarTextoComprovante(sample); }
finally { Array.prototype.at = previousAt; }
assert.ok(text.includes('Future Shop') && text.includes('TOTAL:') && text.includes('Troco:'));
assert.ok(text.endsWith('\n'));
assert.ok(text.split('\n').every(line => line.length <= 32));

// Exercise the existing JS-to-native receipt route with an isolated printer stub.
const wrapperSource = fs.readFileSync('src/services/comprovanteTermico.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
const nativeWrapper = printer => new Function('usaImpressoraInterna', 'imprimirTextoNativo', 'montarTextoComprovante', wrapperSource + ';return imprimirComprovanteTermico;')(() => true, printer, montarTextoComprovante);
let received;
await nativeWrapper(async text => { received = text; return {}; })(sample);
assert.equal(received, text);

// Run the actual sale handler, substituting only IO and React state setters.
const source = fs.readFileSync('src/screens/Caixa.jsx', 'utf8');
const sale = source.slice(source.indexOf('  async function registrarVenda(e) {'), source.indexOf('  async function reimprimirUltimoComprovante()'));
async function checkSale({ printerFails = false, backendFails = false, pending = false } = {}) {
  const calls = [], feedback = [];
  let cached, loading = false;
  const noop = () => {};
  const env = {
    gravandoVenda: { current: false }, caixaAtual: { id: 'cash' }, atendenteLogado: { id: 'att' }, temOperacaoPendente: () => pending, recuperarVendaPendente: async () => { calls.push('recover'); },
    itensVendaDetalhados: [{ produto: { id: 'product', estoque: 5 }, nome: 'Produto', quantidade: 1, subtotalValido: true, subtotal: 10, precoUnitario: 10 }], pagamentos: [{ forma: 'Dinheiro', valor: '20' }], parseDecimalInput: Number, totalCarrinho: 10, totalPagamentosInformado: 20, temPagamentoEmDinheiro: true, accessRole: 'atendente', isManagementRole: () => false, hojeISO: () => '2026-11-27', vendaForm: {}, uid: 'future-shop',
    operacaoPersistente: async () => { calls.push('sale'); if (backendFails) throw Error('Backend unavailable'); return { id: 'sale-1', ...sample.venda }; },
    setSalvandoVenda: value => loading = value, setFeedbackVenda: value => feedback.push(value), setImprimindo: noop, setUltimoComprovante: value => cached = value, resetVendaForm: noop, setToastVenda: noop, loja: { ...sample.loja, impressaoHabilitada: false }, terminalNativo: true,
    imprimirComprovanteTermico: nativeWrapper(async () => { calls.push('print'); if (printerFails) throw Error('Sem papel'); return {}; }), formatMoney: String,
  };
  await new Function(...Object.keys(env), sale + ';return registrarVenda({preventDefault(){}});')(...Object.values(env));
  assert.equal(loading, false);
  assert.equal(env.gravandoVenda.current, false);
  if (pending) { assert.deepEqual(calls, ['recover']); return; }
  if (backendFails) { assert.deepEqual(calls, ['sale']); return; }
  assert.deepEqual(calls, ['sale', 'print']);
  assert.equal(cached.loja.nome, 'Future Shop');
  assert.ok(feedback.some(v => v.includes(printerFails ? 'Falha na impress' : 'Comprovante enviado')));
}
await checkSale();
await checkSale({ printerFails: true });
await checkSale({ backendFails: true });
await checkSale({ pending: true });

// Alias lookup uses one exact document and never returns a private email.
const loginSource = fs.readFileSync('src/services/loginsAtendentes.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export { buildAtendenteEmail };', '').replace('export async function', 'async function');
function resolver(data, error) {
  return new Function('doc', 'getDoc', 'db', 'buildAtendenteEmail', loginSource + ';return resolverEmailAtendente;')((...args) => args, async () => { if (error) throw error; return { exists: () => data !== null, data: () => data }; }, {}, buildAtendenteEmail);
}
assert.equal(await resolver(null)('future-shop', 'Maria Silva'), 'atendente.future-shop.maria-silva@acs.local');
assert.equal(await resolver({ email: 'atendente.origin.maria-silva@acs.local' })('future-shop', 'Maria Silva'), 'atendente.origin.maria-silva@acs.local');
await assert.rejects(resolver({ email: 'private@example.com' })('future-shop', 'Maria Silva'));
assert.equal(await resolver(null, { code: 'permission-denied' })('future-shop', 'Maria Silva'), 'atendente.future-shop.maria-silva@acs.local');
console.log('OK: comprovante sem Array.at, 32 colunas, dados dinamicos e chamada nativa.');
console.log('OK: venda unica antes de imprimir, falhas isoladas e recuperacao sem duplicacao.');
console.log('OK: usuario existente, alias entre lojas, fallback legado e recusa de email privado.');
