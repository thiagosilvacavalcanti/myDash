import { Routes, Route } from "react-router-dom";
import MetasPorVendedor from "./pages/MetasPorVendedor";
import SalesDashboard from "./pages/SalesDashboard"; // se existir

export default function App() {
  return (
    <Routes>
      <Route path="/adm/*" element={<SalesDashboard />} />
      <Route path="/painel/metas" element={<MetasPorVendedor />} />
      {/* rota default opcional */}
      <Route path="*" element={<MetasPorVendedor />} />
    </Routes>
  );
}
