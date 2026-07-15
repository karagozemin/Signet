import { Routes, Route } from 'react-router-dom';
import { useLenis } from './hooks/useLenis';
import { Landing } from './routes/Landing';
import { AppTheatre } from './routes/AppTheatre';
import { Proof } from './routes/Proof';

export function App() {
  useLenis();
  return (
    <div className="grain vignette">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppTheatre />} />
        <Route path="/proof" element={<Proof />} />
      </Routes>
    </div>
  );
}
