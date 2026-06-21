import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Study from '@/pages/Study'
import ErrorBank from '@/pages/ErrorBank'
import Stats from '@/pages/Stats'
import Practice from '@/pages/Practice'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/study" element={<Study />} />
        <Route path="/error-bank" element={<ErrorBank />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/practice" element={<Practice />} />
      </Routes>
    </BrowserRouter>
  )
}
