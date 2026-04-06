import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ccc } from '@ckb-ccc/connector-react';
import { HavenProvider } from '@haven-protocol/ckb-sdk/react';
import App from './App';
import './index.css';

/**
 * HavenProviderBridge — bridges the CCC client into the HavenProvider.
 */
function HavenProviderBridge({ children }: { children: React.ReactNode }) {
  const { client } = ccc.useCcc();
  return (
    <HavenProvider client={client}>
      {children}
    </HavenProvider>
  );
}

/**
 * CCC connector theme — matches the Haven Sovereign design system.
 *
 * The CCC web component exposes these CSS custom properties:
 * --background, --btn-primary, --btn-primary-hover, --btn-secondary,
 * --btn-secondary-hover, --divider, --icon-primary, --icon-secondary, --tip-color
 */
const connectorStyle: React.CSSProperties = {
  // @ts-expect-error CSS custom properties
  '--background': '#1b1c1e',          // surface-container-low
  '--btn-primary': '#d0bcff',          // primary (Sovereign Purple)
  '--btn-primary-hover': '#a078ff',    // primary-container
  '--btn-secondary': '#292a2c',        // surface-container-high
  '--btn-secondary-hover': '#343537',  // surface-container-highest
  '--divider': '#494454',              // outline-variant
  '--icon-primary': '#d0bcff',         // primary
  '--icon-secondary': '#44e2cd',       // secondary (Cyber Teal)
  '--tip-color': '#cbc3d7',            // on-surface-variant
  fontFamily: "'Inter', sans-serif",
  borderRadius: '0.5rem',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ccc.Provider
        name="Haven Protocol"
        hideMark={true}
        connectorProps={{ style: connectorStyle }}
      >
        <HavenProviderBridge>
          <App />
        </HavenProviderBridge>
      </ccc.Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
