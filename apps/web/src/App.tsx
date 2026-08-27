import { Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from './pages/LibraryPage';
import { KaraokePage } from './pages/KaraokePage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/karaoke" element={<KaraokePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
