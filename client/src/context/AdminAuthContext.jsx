import { useAuth } from './AuthContext';
import { AdminAuthContext } from './adminAuthContextValue';
import { loginAdmin, logoutAdmin } from '../api/adminApi';

export function AdminAuthProvider({ children }) {
  const auth = useAuth();

  const adminLogin = async (credentials) => {
    const data = await loginAdmin(credentials);
    auth.login(data);
    return data;
  };

  // Role-aware so a single logout entry point can serve every dashboard: only a
  // real admin revokes through /admin/logout, everyone else goes through the
  // base context, which clears state and revokes /users/logout itself.
  const adminLogout = async () => {
    if (auth.user?.role !== 'admin') {
      await auth.logout();
      return;
    }

    try {
      await logoutAdmin();
    } catch (e) {
      console.error('Admin logout error:', e.message);
    }
    await auth.logout();
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

