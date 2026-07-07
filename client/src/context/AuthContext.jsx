import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem('wim-user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('wim-token') || '');

  useEffect(() => {
    if (user) {
      localStorage.setItem('wim-user', JSON.stringify(user));
    } else {
      localStorage.removeItem('wim-user');
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('wim-token', token);
    } else {
      localStorage.removeItem('wim-token');
    }
  }, [token]);

  const login = (authData) => {
    const nextUser = authData?.user || null;
    setUser(nextUser);
    setToken(authData?.accessToken || '');
  };

  const logout = () => {
    setUser(null);
    setToken('');
  };

  const value = useMemo(() => ({ user, token, login, logout, isAuthenticated: Boolean(user) }), [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
