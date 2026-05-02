import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Header from './components/Layout/Header'
import Analysis from './pages/Analysis'
import Home from './pages/Home'
import Results from './pages/Results'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/results" element={<Results />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
