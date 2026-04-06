import { Navigate } from 'react-router-dom';

/**
 * Home page now redirects to Dashboard.
 * The dashboard IS the home page in the new design.
 */
export default function Home() {
  return <Navigate to="/dashboard" replace />;
}
