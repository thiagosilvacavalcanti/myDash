import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());

// Permitir o frontend local (porta do Vite geralmente 5173)
// ❌ remova/ Substitua isto:
// app.use(cors({ origin: ["http://localhost:5173"], credentials: false }));

// ✅ coloque isto logo depois de `app.use(express.json())`, antes das rotas:
const allowedOrigins = [
  ...(process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(",").map(s => s.trim()) : []),
  "http://localhost:5173",
];

// CORS dinâmico: permite localhost e o(s) domínio(s) do front vindos do .env
app.use(
  cors({
    origin(origin, cb) {
      // sem Origin (curl/Postman) → libera
      if (!origin) return cb(null, true);
      // confere lista
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: false,
  })
);


const api = axios.create({
  baseURL: process.env.BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "access-token": process.env.ACCESS_TOKEN,
    "secret-access-token": process.env.SECRET_ACCESS_TOKEN
  },
  timeout: 30000
});

// Util: repassar erro padronizado
function sendErr(res, err) {
  const status = err?.response?.status || 500;
  const payload = err?.response?.data || { message: err.message || "Erro desconhecido" };
  res.status(status).json(payload);
}

// Proxy de VENDAS: GET /proxy/vendas?loja_id=1&data_inicio=AAAA-MM-DD&data_fim=AAAA-MM-DD&tipo=produto|servico&pagina=1&ordenacao=codigo&direcao=desc
app.get("/proxy/vendas", async (req, res) => {
  try {
    const { data } = await api.get("/vendas", { params: req.query });
    res.json(data);
  } catch (err) {
    sendErr(res, err);
  }
});

// Proxy de FUNCIONÁRIOS (opcional; se não tiver, o front infere pelos dados de vendas)
app.get("/proxy/funcionarios", async (_req, res) => {
  try {
    const { data } = await api.get("/funcionarios", { params: { pagina: 1 } });
    res.json(data);
  } catch (err) {
    sendErr(res, err);
  }
});

// (Opcional) proxy de CLIENTES, PRODUTOS etc. — copie o padrão acima

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy rodando em http://localhost:${port}`);
});

// ---------------------------------------------
// Helpers locais (datas no fuso LOCAL, sem UTC)
// ---------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function monthBoundsNow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startISO: toLocalISO(start), endISO: toLocalISO(end) };
}

// ---------------------------------------------
// Rota AGREGADA: GET /api/dashboard/monthly
// Responde com totals por vendedor (1 chamada p/ front)
// ---------------------------------------------
const STORE_IDS = (process.env.STORE_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const PER_PAGE = 100;

// cache simples em memória (opcional)
let _cacheDash = null;
let _cacheUntil = 0;

app.get("/api/dashboard/monthly", async (req, res) => {
  try {
    const cacheSeconds = Number(process.env.CACHE_SECONDS || 0);
    const now = Date.now();
    if (cacheSeconds > 0 && _cacheDash && now < _cacheUntil) {
      return res.json(_cacheDash);
    }

    // período
    let { start, end } = req.query;
    if (!start || !end) {
      const b = monthBoundsNow();
      start = b.startISO;
      end   = b.endISO;
    }

    // lojas
    const lojas = req.query.loja_id
      ? String(req.query.loja_id).split(",").map(s => s.trim()).filter(Boolean)
      : STORE_IDS;

    if (!lojas.length) {
      return res.status(400).json({ error: "Informe loja_id na query ou defina STORE_IDS no .env" });
    }

    const tudo = [];

    // paginação por loja
    for (const loja_id of lojas) {
      let pagina = 1;
      // loop defensivo; sai quando vier menos que PER_PAGE ou lista vazia
      // (ajuste nomes dos params conforme a sua API: data_inicio/data_fim/pagina/ordenacao/direcao)
      while (true) {
        const { data } = await api.get("/vendas", {
          params: {
            loja_id,
            data_inicio: start,
            data_fim: end,
            pagina,
            ordenacao: "codigo",
            direcao: "desc",
            // se sua API tiver parâmetro de tamanho de página, descomente e ajuste:
            // por_pagina: PER_PAGE,
          },
        });

        // detecta onde estão os itens
        const items = data?.data || data?.items || data?.result || data || [];
        if (!Array.isArray(items) || items.length === 0) break;

        tudo.push(
          ...items.map((x) => ({ ...x, loja_id }))
        );

        if (items.length < PER_PAGE) break;
        pagina += 1;
      }
    }

    // -------------------------
    // agregado por vendedor
    // ajuste os nomes dos campos abaixo conforme a resposta real
    // -------------------------
    const bySeller = new Map();

    for (const s of tudo) {
      const vendedorId =
        s.vendedor_id ?? s.id_vendedor ?? s.usuario_id ?? s.responsavel_id ?? 0;
      const vendedorNome =
        s.vendedor_nome ?? s.nome_vendedor ?? s.usuario_nome ?? s.responsavel_nome ?? "Desconhecido";

      const valor = Number(
        s.valor_total ?? s.total ?? s.valor ?? s.valor_final ?? s.preco_total ?? 0
      );

      const key = `${vendedorId}|${vendedorNome}`;
      const cur =
        bySeller.get(key) || {
          employee_id: vendedorId,
          name: vendedorNome,
          sold_amount: 0,
          sale_count: 0,
          target_amount: null, // metas virão de outra tela no futuro
        };

      cur.sold_amount += isFinite(valor) ? valor : 0;
      cur.sale_count += 1;

      bySeller.set(key, cur);
    }

    const payload = {
      period: { startISO: start, endISO: end },
      employees: Array.from(bySeller.values()).sort((a, b) => b.sold_amount - a.sold_amount),
    };

    if (cacheSeconds > 0) {
      _cacheDash = payload;
      _cacheUntil = now + cacheSeconds * 1000;
    }

    res.json(payload);
  } catch (err) {
    sendErr(res, err);
  }
});
