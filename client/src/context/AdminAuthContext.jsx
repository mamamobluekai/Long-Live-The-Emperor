import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { loginAdmin, logoutAdmin } from '../api/adminApi';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const auth = useAuth();

  const adminLogin = async (credentials) => {
    const data = await loginAdmin(credentials);
    auth.login(data);
    return data;
  };

  const adminLogout = async () => {
    try {
      await logoutAdmin();
    } catch (e) {
      console.error('Admin logout error:', e.message);
    }
    auth.logout();
  };

  const value = {
    user: auth.user,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    isAdmin: auth.user?.role === 'admin',
    login: adminLogin,
    logout: adminLogout,
    loading: auth.loading,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
