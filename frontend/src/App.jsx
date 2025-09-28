import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SalesDashboard from "./pages/SalesDashboard";

function App() {
  const [count, setCount] = useState(0)

  return <SalesDashboard />; 
}

export default App
