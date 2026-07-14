import { Routes, Route } from 'react-router-dom';
import { SignetCursor } from './components/SignetCursor';
import { useLenis } from './hooks/useLenis';
import { Landing } from './routes/Landing';

export function App() {
  useLenis();
  return (
    <div className="grain vignette">
      <SignetCursor />
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </div>
  );
}