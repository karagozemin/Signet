import { Routes, Route } from 'react-router-dom';
import { useLenis } from './hooks/useLenis';
import { Landing } from './routes/Landing';

export function App() {
  useLenis();
  return (
    <div className="grain vignette">
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </div>
  );
}
