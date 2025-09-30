import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_BACKEND_URL; // http://localhost:3000

const brl = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const progresso = (v) => (v.meta == null ? 0 : Math.min(1, v.vendido / v.meta));
const status = (v) => {
  if (v.meta == null) return "Sem meta";
  const p = progresso(v);
  if (p >= 1) return "Meta batida";
  if (p >= 0.8) return "No ritmo";
  return "Em risco";
};

export default function MetasPorVendedor() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let abort = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`${API}/api/dashboard/monthly`, { signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const vendedores = (json.employees || []).map(e => ({
          id: e.employee_id,
          nome: e.name,
          vendido: e.sold_amount,
          qtd: e.sale_count,
          meta: 50000,
        }));
        setRows(vendedores);
        setErr(null);
      } catch (e) {
        setErr("Falha ao carregar dados");
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => abort.abort();
  }, []);

  const data = useMemo(() => [...rows].sort((a,b)=>b.vendido-a.vendido), [rows]);

  if (loading) return <div className="rounded-lg border p-8 text-center">Carregando…</div>;
  if (err) return <div className="rounded-lg border p-8 text-center text-red-600">{err}</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Metas por Vendedor</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full divide-y">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Vendedor</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase">Vendido</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase">Meta</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Progresso</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase">Qtde vendas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map(v => {
              const p = progresso(v), st = status(v);
              return (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{v.nome}</td>
                  <td className="px-4 py-3 text-right">{brl(v.vendido)}</td>
                  <td className="px-4 py-3 text-right">{v.meta == null ? "—" : brl(v.meta)}</td>
                  <td className="px-4 py-3">
                    {v.meta == null ? (
                      <span className="text-gray-500">Defina a meta</span>
                    ) : (
                      <div className="w-full">
                        <div className="h-2 w-full rounded bg-gray-200">
                          <div
                            className={`h-2 rounded ${p>=1?'bg-green-600':p>=0.8?'bg-blue-600':'bg-yellow-500'}`}
                            style={{ width: `${Math.min(p*100,100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-gray-600">{Math.round(p*100)}%</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {st === "Meta batida" && <span className="rounded bg-green-100 px-2 py-1 text-xs">Meta batida</span>}
                    {st === "No ritmo" && <span className="rounded bg-blue-100 px-2 py-1 text-xs">No ritmo</span>}
                    {st === "Em risco" && <span className="rounded bg-yellow-100 px-2 py-1 text-xs">Em risco</span>}
                    {st === "Sem meta" && <span className="rounded bg-gray-100 px-2 py-1 text-xs">Sem meta</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{v.qtd}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
