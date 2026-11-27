import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { podeOperarCaixa } from "../utils/caixaAccess";
import { isManagementRole } from "../utils/access";
import { executarOperacao, operacaoPersistente } from "./operacoes";


const caixasRef = collection(db, "caixas");
const retiradasRef = collection(db, "retiradas_caixa");

function rangeQuery(uid, inicio, fim = inicio) {
  return query(caixasRef, where("uid", "==", uid), where("data", ">=", inicio), where("data", "<=", fim));
}

function filterPeriod(items, dataInicio, dataFim = dataInicio) {
  return items.filter((item) => String(item?.data || "") >= dataInicio && String(item?.data || "") <= dataFim);
}

function retiradaDayQuery(data) {
  return query(retiradasRef, where("data", "==", data));
}

function sortByDateAndStatus(items) {
  return items.filter(item => item.status !== "arquivado" && item.status !== "cancelada").sort((a, b) => {
    const dataA = String(a?.data || "");
    const dataB = String(b?.data || "");
    const byDate = dataB.localeCompare(dataA);
    if (byDate !== 0) return byDate;

    if (a?.status === b?.status) return 0;
    return a?.status === "aberto" ? -1 : 1;
  });
}

export async function abrirCaixa(uid, dados) {
  return operacaoPersistente('abrirCaixa', uid + ':' + dados.atendenteId, { uid, ...dados });
}

export async function fecharCaixa(id, dados) {
  return executarOperacao('fecharCaixa', { caixaId: id, dinheiroContado: dados?.dinheiroContado ?? null });
}

export async function getCaixa(id) {
  if (!id) return null;
  const snapshot = await getDoc(doc(db, "caixas", id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function subscribeCaixa(id, callback, onError) {
  if (!id) {
    callback(null);
    return () => {};
  }

  return onSnapshot(doc(db, "caixas", id), (snapshot) => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, error => {
    if (onError) onError(error);
    else console.error("Erro ao consultar caixa:", error);
  });
}

export async function getCaixas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(uid, dataInicio, dataFim));
  return sortByDateAndStatus(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export function subscribeCaixasPeriodo(uid, dataInicio, dataFim, callback) {
  if (!dataInicio || !dataFim) {
    callback([]);
    return () => {};
  }

  return onSnapshot(rangeQuery(uid, dataInicio, dataFim), (snapshot) => {
    callback(sortByDateAndStatus(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim)));
  });
}

export function subscribeCaixasAbertos(uid, callback, onError) {
  return onSnapshot(
    query(caixasRef, where("uid", "==", uid), where("status", "==", "aberto")),
    (snapshot) => {
      callback(sortByDateAndStatus(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === "aberto")));
    },
    (error) => {
      console.error("Erro ao ouvir caixas abertos:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

export async function getCaixasAbertos(uid) {
  const snapshot = await getDocs(query(caixasRef, where("uid", "==", uid), where("status", "==", "aberto")));
  return sortByDateAndStatus(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === "aberto"));
}

export async function updateCaixaData(id, data) {
  return executarOperacao('dataCaixa', { caixaId: id, data });
}

export async function getRetiradas(uid, dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(query(retiradasRef, where("uid", "==", uid), where("data", ">=", dataInicio), where("data", "<=", dataFim)));
  return sortByCreatedAt(filterPeriod(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), dataInicio, dataFim));
}

export async function deleteCaixa(id) {
  return executarOperacao('arquivarCaixa', { caixaId: id });
}

function sortByCreatedAt(items) {
  return items.filter(item => item.status !== "cancelada").sort((a, b) => {
    const dateA =
      typeof a?.criadoEm?.toDate === "function" ? a.criadoEm.toDate().getTime() : 0;
    const dateB =
      typeof b?.criadoEm?.toDate === "function" ? b.criadoEm.toDate().getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

export async function addRetiradaCaixa(uid, dados) {
  return operacaoPersistente('retirarCaixa', dados.caixaId, { uid, ...dados });
}

export async function updateRetiradaCaixa(id, dados) {
  return executarOperacao('editarRetirada', { id, ...dados });
}

export async function deleteRetiradaCaixa(id) {
  return executarOperacao('cancelarRetirada', { id });
}

export function subscribeRetiradasCaixa(uid, caixaId, callback, onError) {
  if (!uid || !caixaId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    query(retiradasRef, where("uid", "==", uid), where("caixaId", "==", caixaId)),
    (snapshot) => {
      callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.caixaId === caixaId)));
    },
    (error) => {
      console.error("Erro ao ouvir retiradas do caixa:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

export function subscribeRetiradasDoDia(data, callback, onError) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    retiradaDayQuery(data),
    (snapshot) => {
      callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
    },
    (error) => {
      console.error("Erro ao ouvir retiradas do dia:", error);
      callback([]);
      if (typeof onError === "function") onError(error);
    }
  );
}

// Administrative view: selected opening dates plus every still-open shift.
// Both queries retain the store scope enforced by Firestore rules.
export function subscribeCaixasGerencia(uid, inicio, fim, callback, onError) {
  if (!uid || !inicio || !fim || inicio > fim) {
    callback([]);
    return () => {};
  }
  let ativo = true;
  let falhou = false;
  const grupos = [null, null];
  const receber = (indice) => (snapshot) => {
    if (!ativo || falhou) return;
    grupos[indice] = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    if (grupos.some(grupo => grupo === null)) return;
    const unicos = new Map([...grupos[1], ...grupos[0]].map(item => [item.id, item]));
    callback(sortByDateAndStatus([...unicos.values()].filter(item => item.uid === uid
      && (item.status === "aberto" || (item.data >= inicio && item.data <= fim)))));
  };
  const erro = (error) => {
    if (!ativo) return;
    falhou = true;
    if (onError) onError(error);
  };
  const unsubPeriodo = onSnapshot(rangeQuery(uid, inicio, fim), receber(0), erro);
  const unsubAbertos = onSnapshot(query(caixasRef, where("uid", "==", uid), where("status", "==", "aberto")), receber(1), erro);
  return () => {
    ativo = false;
    unsubPeriodo();
    unsubAbertos();
  };
}

// Read existing registers referenced by movements, even if opened before the range.
// Scoped queries also handle missing/foreign IDs without granting document access.
export async function getCaixasVinculados(uid, movimentos, existentes = []) {
  if (!uid) return [];
  const caixas = new Map(existentes.filter(item => item.uid === uid).map(item => [item.id, item]));
  const ids = [...new Set(movimentos.map(item => String(item.caixaId || "").trim()).filter(Boolean))].filter(id => !caixas.has(id));
  for (let start = 0; start < ids.length; start += 10) {
    const snapshot = await getDocs(query(caixasRef, where("uid", "==", uid), where(documentId(), "in", ids.slice(start, start + 10))));
    snapshot.docs.forEach(item => {
      const caixa = { ...item.data(), id: item.id };
      if (caixa.uid === uid) caixas.set(caixa.id, caixa);
    });
  }
  return [...caixas.values()];
}

// Local storage is a cache. An attendant's existing backend session is authoritative.
export async function recuperarCaixaAtivo(uid, usuario, role, sessao = null) {
  if (!uid || !usuario?.id) return null;
  const validar = caixa => caixa?.status === "aberto" && podeOperarCaixa(caixa, uid, usuario, role);
  const ler = async id => {
    try { return await getCaixa(id); }
    catch (error) {
      if (["permission-denied", "firestore/permission-denied", "not-found"].includes(error?.code)) return null;
      throw error;
    }
  };
  if (sessao?.id && (!sessao.uid || sessao.uid === uid)) {
    const salvo = await ler(sessao.id);
    if (validar(salvo)) return salvo;
  }
  // Management must explicitly choose a register; never attach an arbitrary attendant.
  if (isManagementRole(role)) return null;
  let lock;
  try { lock = await getDoc(doc(db, "caixas_ativos", uid + "__" + usuario.id)); }
  catch (error) {
    if (!["permission-denied", "firestore/permission-denied"].includes(error?.code)) throw error;
  }
  if (lock?.exists() && lock.data().uid === uid && lock.data().caixaId) {
    const ativo = await ler(lock.data().caixaId);
    if (validar(ativo)) return ativo;
  }
  const encontrados = (await getCaixasAbertos(uid)).filter(validar);
  if (encontrados.length > 1) throw new Error("Mais de um caixa aberto para este operador. Solicite conferencia da gerencia.");
  return encontrados[0] || null;
}
