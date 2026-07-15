import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Landing } from './routes/Landing';
import { AppTheatre } from './routes/AppTheatre';
import { Proof } from './routes/Proof';
import { PageTransition } from './components/PageTransition';
import DarkVeil from './components/DarkVeil';

export function App() {
  const location = useLocation();
  return (
    <div className="app-root">
      <div className="darkveil-wrap">
        <DarkVeil hueShift={-28} speed={0.4} warpAmount={0.12} scanlineIntensity={0.04} noiseIntensity={0.02} />
      </div>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/app" element={<PageTransition><AppTheatre /></PageTransition>} />
          <Route path="/proof" element={<PageTransition><Proof /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}
