import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Activity } from './pages/Activity'
import { Home } from './pages/Home'
import { Recipients } from './pages/Recipients'
import { Send } from './pages/Send'
import { Success } from './pages/Success'

function Layout() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/send" element={<Send />} />
          <Route path="/recipients" element={<Recipients />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/success/:id" element={<Success />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>© {new Date().getFullYear()} Kudi · Demo remittance UI (Germany → Nigeria)</span>
        <span>Not a licensed money transmitter — demo only</span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
