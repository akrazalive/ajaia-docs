import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { api } from './api.js';
import { ToastProvider } from './components/Toasts.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './pages/Editor.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking the session

  useEffect(() => {
    api.me().then(({ user }) => setUser(user)).catch(() => setUser(null));
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) {
    return <div className="boot"><LoaderCircle className="spin" size={20} /></div>;
  }

  return (
    <AuthContext.Provider value={{ user, setUser, signOut }}>
      <ToastProvider>
        {user ? (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/d/:id" element={<Editor />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <Login />
        )}
      </ToastProvider>
    </AuthContext.Provider>
  );
}
