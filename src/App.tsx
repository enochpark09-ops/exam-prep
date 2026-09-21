import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { FlowProvider } from '@/lib/flow';
import { Home } from '@/screens/Home';
import { Capture } from '@/screens/Capture';
import { Verify } from '@/screens/Verify';
import { Diagnosis } from '@/screens/Diagnosis';
import { Card } from '@/screens/Card';
import { Quiz } from '@/screens/Quiz';
import { Done } from '@/screens/Done';

export default function App() {
  return (
    <BrowserRouter>
      <FlowProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/manual" element={<Verify manual />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/card" element={<Card />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/done" element={<Done />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </FlowProvider>
    </BrowserRouter>
  );
}
