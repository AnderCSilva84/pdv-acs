import { confirmarSenhaAtual } from "../services/auth";
import { useEffect, useMemo, useState } from "react";
import {
  deleteCaixa,
  fecharCaixa,
  subscribeCaixasGerencia,
} from "../services/caixas";
import { subscribeProdutos } from "../services/produtos";
import { FiHome } from "react-icons/fi";

function dataFortaleza(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const valor = tipo => partes.find(parte => parte.type === tipo).value;
  return valor("year") + "-" + valor("month") + "-" + valor("day");
}

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateLabel(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}/${mes}/${ano}`;
}

function formatDateTimeLabel(valor) {
  if (!valor) return "";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  }

  if (valor instanceof Date) {
    return valor.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

export default function Gerencia({ uid, loja, onNavigate }) {
  const [produtos, setProdutos] = useState([]);
  const [caixasHoje, setCaixasHoje] = useState([]);
  const [periodo, setPeriodo] = useState(() => ({ inicio: dataFortaleza(), fim: dataFortaleza() }));
  const [filtroPeriodo, setFiltroPeriodo] = useState(periodo);
  const [carregandoCaixas, setCarregandoCaixas] = useState(true);
  const [erroConsulta, setErroConsulta] = useState("");
  const [erroPeriodo, setErroPeriodo] = useState("");
  const [acaoCaixa, setAcaoCaixa] = useState(null);
  const [senhaGerencia, setSenhaGerencia] = useState("");
  const [feedbackAcaoCaixa, setFeedbackAcaoCaixa] = useState("");
  const [salvandoAcaoCaixa, setSalvandoAcaoCaixa] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return subscribeProdutos(uid, setProdutos);
  }, [uid]);

  useEffect(() => {
    return subscribeCaixasGerencia(uid, periodo.inicio, periodo.fim, items => {
      setCaixasHoje(items);
      setCarregandoCaixas(false);
    }, error => {
      setCaixasHoje([]);
      setCarregandoCaixas(false);
      setErroConsulta(error?.code === "permission-denied"
        ? "Sem permissao para consultar os caixas deste estabelecimento."
        : "Nao foi possivel atualizar os caixas. Confira a conexao e os indices do Firestore e recarregue a pagina.");
    });
  }, [uid, periodo]);

  function aplicarPeriodo(event) {
    event.preventDefault();
    if (!filtroPeriodo.inicio || !filtroPeriodo.fim || filtroPeriodo.inicio > filtroPeriodo.fim) {
      setErroPeriodo("Informe um periodo valido.");
      return;
    }
    setErroPeriodo("");
    setCaixasHoje([]);
    setAcaoCaixa(null);
    setSenhaGerencia("");
    setErroConsulta("");
    setCarregandoCaixas(true);
    setPeriodo({ ...filtroPeriodo });
  }

  const caixasAbertos = useMemo(
    () => caixasHoje.filter((item) => item.status === "aberto"),
    [caixasHoje]
  );
  const estoqueBaixo = useMemo(
    () =>
      produtos.filter((produto) => {
        const estoque = Number(produto.estoque || 0);
        return produto.ativo !== false && estoque > 0 && estoque <= 5;
      }),
    [produtos]
  );
  const semEstoque = useMemo(
    () =>
      produtos.filter((produto) => produto.ativo !== false && Number(produto.estoque || 0) === 0),
    [produtos]
  );
  const totalAlertasEstoque = estoqueBaixo.length + semEstoque.length;
  const caixasDoDia = useMemo(
    () =>
      [...caixasHoje].sort((a, b) => {
        if (a?.status !== b?.status) return a?.status === "aberto" ? -1 : 1;
        return String(a?.atendenteNome || "").localeCompare(String(b?.atendenteNome || ""));
      }),
    [caixasHoje]
  );

  function abrirAcaoCaixa(tipo, caixa) {
    setAcaoCaixa({ tipo, caixa });
    setSenhaGerencia("");
    setFeedbackAcaoCaixa("");
  }

  function fecharPainelAcao() {
    setAcaoCaixa(null);
    setSenhaGerencia("");
    setFeedbackAcaoCaixa("");
    setSalvandoAcaoCaixa(false);
  }

  async function confirmarAcaoCaixa() {
    if (!acaoCaixa?.caixa?.id) return;

    try { await confirmarSenhaAtual(senhaGerencia); } catch { setFeedbackAcaoCaixa("Senha invalida. Confirme a senha da sua conta."); return; }
    setSalvandoAcaoCaixa(true);
    setFeedbackAcaoCaixa("");

    try {
      if (acaoCaixa.tipo === "fechar") {
        const caixa = acaoCaixa.caixa;

        await fecharCaixa(caixa.id, {
          totalVendas: Number(caixa.totalVendas || 0),
          totalItens: Number(caixa.totalItens || 0),
          totalDinheiro: Number(caixa.totalDinheiro || 0),
          totalRetiradas: Number(caixa.totalRetiradas || 0),
          valorEmCaixa: Number(caixa.valorEmCaixa || 0),
        });

        setCaixasHoje((prev) =>
          prev.map((item) =>
            item.id === caixa.id
              ? {
                  ...item,
                  status: "fechado",
                  fechadoEm: new Date(),
                }
              : item
          )
        );
      }

      if (acaoCaixa.tipo === "excluir") {
        await deleteCaixa(acaoCaixa.caixa.id, uid);
        setCaixasHoje((prev) => prev.filter((item) => item.id !== acaoCaixa.caixa.id));
      }

      fecharPainelAcao();
    } catch {
      setFeedbackAcaoCaixa("Nao foi possivel concluir a acao no caixa.");
      setSalvandoAcaoCaixa(false);
    }
  }


  return (
    <div className="dashboard-screen">
      <div className="gerencia-hero section-card">
        <div>
          <span className="pdv-eyebrow">Central Gerencial</span>
          <h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiHome /> Hub de operacao</h1>
          <p className="screen-description">
            Use esta tela para acompanhar alertas, caixas abertos e acessos rapidos. Os detalhes financeiros ficam no Fluxo e no Relatorio.
          </p>
        </div>
        <span className="screen-badge">{loja?.nome || uid} · {formatDateLabel(dataFortaleza())} (Fortaleza)</span>
      </div>

      <div className="stats-grid gerencia-stats-grid gerencia-stats-grid-compact">
        <div className="section-card stat-card">
          <span className="stat-label">Caixas abertos</span>
          <strong className="stat-value">{caixasAbertos.length}</strong>
          <small className="stat-note">Turnos em operacao neste momento.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Alertas</span>
          <strong className={`stat-value ${totalAlertasEstoque ? "negative" : "positive"}`}>
            {totalAlertasEstoque}
          </strong>
          <small className="stat-note">Produtos sem estoque ou abaixo do limite.</small>
        </div>
      </div>

      <div className="gerencia-micro-grid">
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">PDV</span>
          <strong>{caixasAbertos.length ? "Turnos ativos" : "Sem turno aberto"}</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Fluxo</span>
          <strong>Conferencia financeira</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Estoque</span>
          <strong>{totalAlertasEstoque ? `${totalAlertasEstoque} alertas` : "Sem alertas"}</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Relatorio</span>
          <strong>Analise consolidada</strong>
        </div>
      </div>

      <div className="gerencia-actions gerencia-actions-compact">
        <button className="action-btn action-btn-primary" type="button" onClick={() => onNavigate("pdv")}>
          PDV
        </button>
        <button className="action-btn action-btn-warning" type="button" onClick={() => onNavigate("fluxo")}>
          Fluxo
        </button>
        <button className="action-btn action-btn-info" type="button" onClick={() => onNavigate("estoque")}>
          Estoque
        </button>
        <button className="action-btn action-btn-secondary" type="button" onClick={() => onNavigate("relatorio")}>
          Relatorio
        </button>
      </div>

      <div className="screen-grid gerencia-focus-grid">
        <div className="section-card gerencia-focus-card">
          <div className="section-header">
            <div className="section-title">Acoes rapidas</div>
            <span className="section-subtitle">Atalhos principais</span>
          </div>
          <div className="gerencia-focus-list">
            <div className="gerencia-focus-item">
              <span>PDV</span>
              <strong>{caixasAbertos.length ? "Em uso" : "Disponivel"}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Fluxo de caixa</span>
              <strong>Conferir</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Estoque</span>
              <strong>{totalAlertasEstoque ? "Atencao" : "Normal"}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Relatorio</span>
              <strong>Consultar</strong>
            </div>
          </div>
        </div>

        <div className="section-card gerencia-focus-card">
          <div className="section-header">
            <div className="section-title">Caixas do periodo e turnos ainda abertos</div>
            <span className="section-subtitle">{carregandoCaixas ? "Atualizando..." : `${caixasDoDia.length} registros`}</span>
          </div>
          <form className="section-actions" onSubmit={aplicarPeriodo}>
            <label>De <input className="input" type="date" required value={filtroPeriodo.inicio} onChange={event => setFiltroPeriodo(prev => ({ ...prev, inicio: event.target.value }))} /></label>
            <label>Ate <input className="input" type="date" required value={filtroPeriodo.fim} onChange={event => setFiltroPeriodo(prev => ({ ...prev, fim: event.target.value }))} /></label>
            <button className="action-btn action-btn-primary" type="submit">Consultar</button>
          </form>
          <p className="section-subtitle">{formatDateLabel(periodo.inicio)} a {formatDateLabel(periodo.fim)} (data de abertura). Inclui turnos ainda abertos fora do periodo. Horarios de Fortaleza.</p>
          {erroPeriodo ? <p className="inline-feedback" role="alert">{erroPeriodo}</p> : null}
          {erroConsulta ? <p className="inline-feedback" role="alert">{erroConsulta}</p> : null}
          <div className="scroll-list" aria-busy={carregandoCaixas}>
            {caixasDoDia.map((caixa) => (
              <div className="list-row" key={caixa.id}>
                <div>
                  <strong>{caixa.atendenteNome}</strong>
                  <small>
                    Fundo <span className="positive">{formatMoney(caixa.fundoCaixa || 0)}</span> • {formatDateLabel(caixa.data)}
                  </small>
                  {caixa.status === "aberto" && (caixa.data < periodo.inicio || caixa.data > periodo.fim) ? <small>Turno ainda aberto fora do periodo selecionado</small> : null}
                  <small>Abertura: {formatDateTimeLabel(caixa.abertoEm) || "Nao disponivel"}</small>
                  <small>
                    Fechamento: {caixa.status === "fechado" ? formatDateTimeLabel(caixa.fechadoEm) || "Nao disponivel" : "Em aberto"}
                  </small>
                </div>
                <div className="list-row-actions">
                  <strong className={caixa.status === "aberto" ? "positive" : ""}>
                    {caixa.status === "aberto" ? "Aberto" : "Fechado"}
                  </strong>
                  {caixa.status === "aberto" ? (
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => abrirAcaoCaixa("fechar", caixa)}
                    >
                      Fechar
                    </button>
                  ) : (
                    <button
                      className="mini-btn danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Deseja realmente excluir o caixa de ${caixa.atendenteNome}?`)) abrirAcaoCaixa("excluir", caixa);
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!carregandoCaixas && !erroConsulta && !caixasDoDia.length && <p className="empty-state">Nenhum caixa no periodo ou turno ainda aberto neste estabelecimento.</p>}
          </div>
        </div>
      </div>

      {acaoCaixa ? (
        <div className="section-card gerencia-action-card">
          <div className="section-header">
            <div className="section-title">
              {acaoCaixa.tipo === "fechar" ? "Fechar caixa pela gerencia" : "Excluir caixa pela gerencia"}
            </div>
            <span className="section-subtitle">{acaoCaixa.caixa.atendenteNome}</span>
          </div>
          <div className="stack-form">
            <p className="screen-description gerencia-action-description">
              Digite a senha da gerencia para {acaoCaixa.tipo === "fechar" ? "fechar" : "excluir"} este caixa.
            </p>
            <input
              className="input"
              type="password"
              value={senhaGerencia}
              onChange={(e) => setSenhaGerencia(e.target.value)}
              placeholder="Senha da gerencia"
            />
            <div className="section-actions gerencia-action-buttons">
              <button
                className="action-btn action-btn-secondary"
                type="button"
                onClick={fecharPainelAcao}
                disabled={salvandoAcaoCaixa}
              >
                Cancelar
              </button>
              <button
                className={acaoCaixa.tipo === "fechar" ? "action-btn action-btn-warning" : "action-btn action-btn-danger"}
                type="button"
                onClick={confirmarAcaoCaixa}
                disabled={salvandoAcaoCaixa}
              >
                {salvandoAcaoCaixa
                  ? "Processando..."
                  : acaoCaixa.tipo === "fechar"
                    ? "Confirmar fechamento"
                    : "Confirmar exclusao"}
              </button>
            </div>
            {feedbackAcaoCaixa ? <p className="inline-feedback">{feedbackAcaoCaixa}</p> : null}
          </div>
        </div>
      ) : null}

      <details className="section-card gerencia-disclosure" open>
        <summary className="gerencia-disclosure-summary">
          <div>
            <strong>Estoque em alerta</strong>
            <small>{totalAlertasEstoque} produtos em atencao</small>
          </div>
        </summary>
        <div className="scroll-list gerencia-disclosure-body">
          {semEstoque.map((produto) => (
            <div className="list-row stock-low" key={`zero-${produto.id}`}>
              <div>
                <strong>{produto.nome}</strong>
                <small>Sem estoque • venda <span className="positive">{formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</span></small>
              </div>
              <strong className="negative">0</strong>
            </div>
          ))}
          {estoqueBaixo.map((produto) => (
            <div className="list-row stock-low" key={`low-${produto.id}`}>
              <div>
                <strong>{produto.nome}</strong>
                <small>Estoque baixo • venda <span className="positive">{formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</span></small>
              </div>
              <strong className="negative">{produto.estoque}</strong>
            </div>
          ))}
          {!estoqueBaixo.length && !semEstoque.length && (
            <p className="empty-state">Nenhum alerta de estoque no momento.</p>
          )}
        </div>
      </details>
    </div>
  );
}
