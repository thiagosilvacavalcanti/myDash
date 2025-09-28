import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());

// Permitir o frontend local (porta do Vite geralmente 5173)
app.use(cors({ origin: ["http://localhost:5173"], credentials: false }));

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
