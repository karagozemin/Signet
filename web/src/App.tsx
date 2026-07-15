import { Routes, Route } from 'react-router-dom';
import { Landing } from './routes/Landing';
import { AppTheatre } from './routes/AppTheatre';
import { Proof } from './routes/Proof';
import DarkVeil from './components/DarkVeil';
import { useLenis } from './hooks/useLenis';

export function App() {
  useLenis();
  return (
    <div className="app-root">
      <div className="darkveil-wrap">
        <DarkVeil hueShift={-28} speed={0.4} warpAmount={0.12} scanlineIntensity={0.04} noiseIntensity={0.02} />
      </div>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppTheatre />} />
        <Route path="/proof" element={<Proof />} />
      </Routes>
    </div>
  );
}
