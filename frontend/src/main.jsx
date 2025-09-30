import React from "react";
import ReactDOM from "react-dom/client"; // ✅ importa do client
import { BrowserRouter } from "react-router-dom"; // se ainda não instalou: npm i react-router-dom
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
