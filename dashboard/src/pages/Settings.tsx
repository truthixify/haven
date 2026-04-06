import { Navigate } from 'react-router-dom';

/**
 * Settings page has been replaced by Identity page.
 * This redirect ensures backward compatibility.
 */
export default function Settings() {
  return <Navigate to="/identity" replace />;
}
