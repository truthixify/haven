import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Identity from './pages/Identity';
import Leaderboard from './pages/Leaderboard';
import Ecosystem from './pages/Ecosystem';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/identity" element={<Identity />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/ecosystem" element={<Ecosystem />} />
        {/* Legacy routes redirect */}
        <Route path="/settings" element={<Navigate to="/identity" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
