import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header      from './components/Header';
import LandingPage from './pages/LandingPage';
import VaultPage   from './pages/VaultPage';

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/"      element={<LandingPage />} />
        <Route path="/vault" element={<VaultPage />} />
      </Routes>
    </BrowserRouter>
  );
}
