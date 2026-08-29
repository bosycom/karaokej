import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { markBootOk, showBootError } from './bootStatus';
import { SessionProvider } from './session/SessionProvider';
import { applyUiScale, readUiScale } from './uiScale';
import './styles.css';

applyUiScale(readUiScale());

const rootEl = document.getElementById('root');
if (!rootEl) {
  showBootError('Missing #root element.');
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <SessionProvider>
              <App />
            </SessionProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>,
    );
    markBootOk();
  } catch (error) {
    showBootError(error instanceof Error ? error.message : String(error));
  }
}
