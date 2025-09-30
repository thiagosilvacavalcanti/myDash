import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ==========================
// CONFIG
// ==========================
// Troque para false quando conectar na sua API/proxy (server.js)
const MOCK_MODE = false;

// Ajuste aqui a URL do seu backend/proxy seguro (NUNCA chame a API externa direto do front)
const BACKEND_URL = import.meta?.env?.VITE_BACKEND_URL || "http://localhost:3000";

const LOJAS = [
  { id: 428885, nome: "Poá" },
  { id: 338180, nome: "Guaianazes" },
];

// ==========================
// HELPERS
// ==========================
const brl = (v) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR");

const yyyy_mm_01_end = (yyyyMm) => {
  // yyyyMm ex: "2025-09"
  const [y, m] = yyyyMm.split("-").map((n) => parseInt(n));
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // último dia do mês
  const toStr = (dt) => dt.toISOString().slice(0, 10);
  return { data_inicio: toStr(start), data_fim: toStr(end) };
};
// --- normalizações para tipo e data ---
function normalizeTipo(v) {
  const t = String(v.tipo || v.tipo_venda || "").toLowerCase();
  if (t.includes("servi")) return "servico";
  if (t.includes("balc")) return "vendas_balcao";
  if (v.tipo_id === 2) return "servico";
  if (v.tipo_id === 3) return "vendas_balcao";
  return "produto";
}

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw);
  // 2025-09-28 / 2025-09-28 14:23:11
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // 28/09/2025
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  return null;
}

// ==========================
// MOCK DATA (somente para preview)
// ==========================
function makeMockData({ loja_id, yyyyMm, tipo }) {
  const funcionarios = [
    { id: 10, nome: "Gabi" },
    { id: 11, nome: "Matheus" },
    { id: 12, nome: "Bruno" },
    { id: 13, nome: "Paula" },
  ];

  const diasNoMes = new Date(parseInt(yyyyMm.split("-")[0]), parseInt(yyyyMm.split("-")[1]), 0).getDate();

  const tipos = ["produto", "servico", "vendas_balcao"]; // três tipos oficiais

  const vendas = [];
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const n = Math.floor(Math.random() * 5) + 2; // 2-6 vendas/dia
    for (let i = 0; i < n; i++) {
      const func = funcionarios[Math.floor(Math.random() * funcionarios.length)];
      const t = tipos[Math.floor(Math.random() * tipos.length)];
      const valor = t === "servico" ? 120 + Math.random() * 380 : 500 + Math.random() * 3500;
      vendas.push({
        id: `${yyyyMm}-${dia}-${i}-${loja_id}`,
        data: `${yyyyMm}-${String(dia).padStart(2, "0")}`,
        funcionario_id: func.id,
        funcionario_nome: func.nome,
        tipo: t,
        valor_total: Math.round(valor),
        loja_id,
        cliente: ["João", "Maria", "Ana", "Carlos"][Math.floor(Math.random() * 4)],
        codigo: Math.floor(Math.random() * 99999),
      });
    }
  }

  // filtro tipo (produto|servico|vendas_balcao|todos)
  const filtraPorTipo = (row) => {
    if (tipo === "todos") return true;
    return row.tipo === tipo;
  };

  const filtradas = vendas.filter(filtraPorTipo);
  return { funcionarios, vendas: filtradas };
}
// ==========================
// API CLIENT (real)
// ==========================
async function fetchVendas({ loja_id, yyyyMm, tipo }) {
  if (MOCK_MODE) return makeMockData({ loja_id, yyyyMm, tipo });

  const { data_inicio, data_fim } = yyyy_mm_01_end(yyyyMm);

  async function fetchPagina(tipoParam, pagina = 1) {
    const params = new URLSearchParams({
      loja_id: String(loja_id),
      data_inicio,
      data_fim,
      pagina: String(pagina),
      ordenacao: "codigo",
      direcao: "desc",
    });
    if (tipoParam) params.set("tipo", tipoParam); // produto|servico|vendas_balcao
    const res = await fetch(`${BACKEND_URL}/proxy/vendas?${params.toString()}`);
    return res.json();
  }

  async function fetchTodasPaginas(tipoParam) {
    const out = [];
    let pagina = 1;
    while (true) {
      const json = await fetchPagina(tipoParam, pagina);
      const rows = Array.isArray(json?.data) ? json.data : [];
      out.push(...rows);
      const prox = json?.meta?.proxima_pagina;
      if (!prox) break;
      pagina = Number(prox);
    }
    return out;
  }

  let vendasRaw = [];
  if (tipo === "todos") {
    const [prods, servs, balc] = await Promise.all([
      fetchTodasPaginas("produto"),
      fetchTodasPaginas("servico"),
      fetchTodasPaginas("vendas_balcao"),
    ]);
    vendasRaw = [...prods, ...servs, ...balc];
  } else {
    vendasRaw = await fetchTodasPaginas(tipo);
  }

  // funcionários
  let funcionarios = [];
  try {
    const resFuncs = await fetch(`${BACKEND_URL}/proxy/funcionarios`);
    const jsonFuncs = await resFuncs.json();
    funcionarios = (jsonFuncs?.data || []).map((f) => ({ id: f.id, nome: f.nome }));
  } catch (_) {
    const uniq = new Map();
    (vendasRaw || []).forEach((v) => {
      if (v.funcionario_id && v.funcionario_nome) {
        uniq.set(v.funcionario_id, { id: v.funcionario_id, nome: v.funcionario_nome });
      }
    });
    funcionarios = [...uniq.values()];
  }
  const funcMap = new Map((funcionarios || []).map((f) => [String(f.id), f.nome]));

  // normalização final
  const vendas = (vendasRaw || []).map((v) => {
    const idRaw = v.funcionario_id ?? v.vendedor_id ?? v.usuario_id ?? v.atendente_id ?? v.user_id ?? null;
    const idStr = idRaw != null ? String(idRaw) : null;
    const nomeFromVenda = v.funcionario_nome ?? v.vendedor_nome ?? v.usuario_nome ?? v.atendente_nome ?? null;
    const nomeJoin = idStr ? funcMap.get(idStr) : null;

    const dataVenda = normalizeDate(
      v.data || v.data_venda || v.data_emissao || v.emissao || v.created_at || v.atualizado_em
    );

    return {
      id: v.id,
      data: dataVenda,                                  // YYYY-MM-DD
      funcionario_id: idStr,
      funcionario_nome: nomeFromVenda || nomeJoin || "Desconhecido",
      tipo: normalizeTipo(v),                           // produto | servico | vendas_balcao
      valor_total: Number(v.valor_total ?? v.total ?? v.valor ?? 0),
      loja_id: Number(loja_id),
      cliente: v.cliente_nome || v.cliente || "Cliente",
      codigo: v.codigo || v.numero || v.documento || 0,
    };
  });

  return { funcionarios, vendas };
}


// ==========================
// UI COMPONENT
// ==========================
export default function SalesDashboard() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [lojaId, setLojaId] = useState(LOJAS[0].id);
  const [month, setMonth] = useState(defaultMonth); // input type=month
  const [tipo, setTipo] = useState("todos"); // todos|produto|servico|vendas_balcao
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ funcionarios: [], vendas: [] });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchVendas({ loja_id: lojaId, yyyyMm: month, tipo })
      .then((d) => mounted && setData(d))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [lojaId, month, tipo]);

  // ==========================
  // DERIVADOS
  // ==========================
const vendasDoDia = useMemo(() => {
  const hojeStr = new Date().toISOString().slice(0, 10);
  const rows = data.vendas.filter((v) => v.data === hojeStr);
  const total = rows.reduce((s, r) => s + (r.valor_total || 0), 0);
  return { quantidade: rows.length, total };
}, [data.vendas]);

 const vendasDoMes = useMemo(() => {
  const total = data.vendas.reduce((s, r) => s + (r.valor_total || 0), 0);
  const qtd = data.vendas.length;
  const porTipo = data.vendas.reduce(
    (acc, r) => {
      const key = r.tipo === "servico" ? "servico" : r.tipo === "vendas_balcao" ? "vendas_balcao" : "produto";
      acc[key].qtd += 1;
      acc[key].total += r.valor_total || 0;
      return acc;
    },
    { produto: { qtd: 0, total: 0 }, servico: { qtd: 0, total: 0 }, vendas_balcao: { qtd: 0, total: 0 } }
  );
  return { total, qtd, porTipo };
}, [data.vendas]);



  const porFuncionario = useMemo(() => {
    const map = new Map();
    data.vendas.forEach((v) => {
      const key = v.funcionario_nome || `ID ${v.funcionario_id}`;
      if (!map.has(key)) map.set(key, { funcionario: key, total: 0, qtd: 0 });
      const obj = map.get(key);
      obj.total += v.valor_total || 0;
      obj.qtd += 1;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data.vendas]);

  const serieMensal = useMemo(() => {
    // soma por dia -> para area chart
    const acc = {};
    data.vendas.forEach((v) => {
      const d = v.data?.slice(0, 10);
      if (!d) return;
      if (!acc[d]) acc[d] = 0;
      acc[d] += v.valor_total || 0;
    });
    return Object.entries(acc)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, total]) => ({ data, total }));
  }, [data.vendas]);

  const ultimas = useMemo(() => {
    return [...data.vendas]
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
      .slice(0, 8);
  }, [data.vendas]);

  // ==========================
  // RENDER
  // ==========================
  return (
    <div className="min-h-screen w-full bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard de Vendas</h1>
            <p className="text-sm opacity-80">Visão consolidada por mês, por funcionário e vendas do dia.</p>
          </div>

          {/* FILTROS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col">
              <label className="text-xs mb-1 opacity-70">Loja</label>
              <select
                value={lojaId}
                onChange={(e) => setLojaId(Number(e.target.value))}
                className="rounded-2xl border border-neutral-300/60 bg-white dark:bg-neutral-800 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                {LOJAS.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs mb-1 opacity-70">Mês</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-2xl border border-neutral-300/60 bg-white dark:bg-neutral-800 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs mb-1 opacity-70">Tipo</label>
          <select
  value={tipo}
  onChange={(e) => setTipo(e.target.value)}
  className="rounded-2xl border border-neutral-300/60 bg-white dark:bg-neutral-800 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
>
  <option value="todos">Todos</option>
  <option value="produto">Produto</option>
  <option value="servico">Serviço</option>
  <option value="vendas_balcao">Vendas de balcão</option>
</select>

            </div>
          </div>
        </header>

        {/* KPI CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card title="Vendas do Dia" loading={loading}>
            <Kpi value={vendasDoDia.quantidade} caption="qtde" />
            <div className="text-sm opacity-80">{brl(vendasDoDia.total)}</div>
          </Card>

          <Card title="Total do Mês" loading={loading}>
            <Kpi value={brl(vendasDoMes.total)} caption="somatório" />
            <div className="text-sm opacity-80">{vendasDoMes.qtd} vendas</div>
          </Card>

          <Card title="Produtos no mês" loading={loading}>
            <Kpi value={brl(vendasDoMes.porTipo.produto.total)} caption={`${vendasDoMes.porTipo.produto.qtd} vendas`} />
          </Card>

          <Card title="Serviços no mês" loading={loading}>
            <Kpi value={brl(vendasDoMes.porTipo.servico.total)} caption={`${vendasDoMes.porTipo.servico.qtd} vendas`} />
          </Card>

          <Card title="Balcão no mês" loading={loading}>
            <Kpi value={brl(vendasDoMes.porTipo.vendas_balcao.total)} caption={`${vendasDoMes.porTipo.vendas_balcao.qtd} vendas`} />
          </Card>
        </section>

        {/* CHARTS */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2">
            <Panel title="Faturamento diário no mês" loading={loading}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serieMensal}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="currentColor" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                    <Tooltip formatter={(v) => brl(v)} labelFormatter={(l) => fmt(l)} />
                    <Area type="monotone" dataKey="total" stroke="currentColor" fill="url(#colorTotal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div>
            <Panel title="Vendas por funcionário (R$)" loading={loading}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porFuncionario}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="funcionario" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                    <Tooltip formatter={(v) => brl(v)} />
                    <Legend />
                    <Bar dataKey="total" name="Faturamento" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </section>

        {/* TABELA */}
        <section>
          <Panel title="Últimas vendas" loading={loading}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-neutral-200/60 dark:border-neutral-800">
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Código</th>
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Funcionário</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimas.map((v) => (
                    <tr key={v.id} className="border-b border-neutral-100/60 dark:border-neutral-800/60 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                      <td className="py-2 pr-4">{fmt(v.data)}</td>
                      <td className="py-2 pr-4">#{v.codigo}</td>
                      <td className="py-2 pr-4">{v.cliente}</td>
                      <td className="py-2 pr-4">{v.funcionario_nome || `ID ${v.funcionario_id}`}</td>
                      <td className="py-2 pr-4 capitalize">{v.tipo}</td>
                      <td className="py-2 pr-0 text-right font-medium">{brl(v.valor_total)}</td>
                    </tr>
                  ))}
                  {!ultimas.length && !loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center opacity-70">Sem vendas para os filtros atuais.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        {/* FOOTER INFO */}
        <footer className="mt-8 text-xs opacity-70">
          <p>
            Dica: mantenha os tokens apenas no backend (proxy) para evitar CORS e proteger segredos. Este painel suporta modo "mock" para testes sem API.
          </p>
        </footer>
      </div>
    </div>
  );
}

// ==========================
// UI SUBCOMPONENTS
// ==========================
function Card({ title, children, loading }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-800 shadow-sm p-4 border border-neutral-200/60 dark:border-neutral-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold opacity-80">{title}</h3>
        {loading && <DotLoader />}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Panel({ title, children, loading }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-800 shadow-sm p-4 border border-neutral-200/60 dark:border-neutral-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {loading && <DotLoader />}
      </div>
      {children}
    </div>
  );
}

function Kpi({ value, caption }) {
  return (
    <div className="text-2xl font-bold leading-tight">
      {value}
      {caption && <div className="text-xs font-normal opacity-70 mt-1">{caption}</div>}
    </div>
  );
}

function DotLoader() {
  return (
    <div className="flex items-center gap-1" aria-label="Carregando">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:120ms]"></span>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:240ms]"></span>
    </div>
  );
}
