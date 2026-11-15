import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    // A 401 here just means "signed out"; it is not shown as an error.
    api.me()
      .then((data) => { if (active) setCustomer(data.customer); })
      .catch(() => { if (active) setCustomer(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    customer,
    checking,
    async login(credentials) { const data = await api.login(credentials); setCustomer(data.customer); return data.customer; },
    async register(account) { const data = await api.register(account); setCustomer(data.customer); return data.customer; },
    async logout() { await api.logout().catch(() => null); setCustomer(null); }
  }), [customer, checking]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
