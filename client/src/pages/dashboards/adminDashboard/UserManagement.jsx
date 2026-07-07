import { useEffect, useState } from 'react';
import { getAllUsers, approveStaff, disapproveStaff, deleteUser, getUsersByStatus } from '../../../api/adminApi';
import styles from './UserManagement.module.css';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchUsers = async () => {
      if (!mounted) return;
      setLoading(true);
      setError('');
      try {
        const data = statusFilter === 'all' 
          ? await getAllUsers() 
          : await getUsersByStatus(statusFilter);
        if (mounted) setUsers(data.users || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchUsers();
    return () => { mounted = false; };
  }, [statusFilter]);

  const refreshUsers = () => {
    const fetchUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const data = statusFilter === 'all' 
          ? await getAllUsers() 
          : await getUsersByStatus(statusFilter);
        setUsers(data.users || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  };

  const handleApprove = async (id) => {
    try {
      await approveStaff(id);
      setMessage('User approved successfully.');
      refreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisapprove = async (id) => {
    try {
      await disapproveStaff(id);
      setMessage('User disapproved successfully.');
      refreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await deleteUser(id);
      setMessage('User deleted successfully.');
      refreshUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.last_name && u.last_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q)) ||
      (u.identifier && u.identifier.toLowerCase().includes(q))
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>User Management</h2>
        <div className={styles.controls}>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
            <option value="all">All Users</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="disapproved">Disapproved</option>
          </select>
        </div>
      </div>
      
      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Identifier</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.first_name} {user.last_name}</td>
                <td>{user.email}</td>
                <td>{user.identifier}</td>
                <td>{user.role}</td>
                <td>{user.status}</td>
                <td>
                  {user.status === 'pending' && (user.role === 'teacher' || user.role === 'supervisor' || user.role === 'coordinator') && (
                    <>
                      <button onClick={() => handleApprove(user.id)} className={styles.btnApprove}>Approve</button>
                      <button onClick={() => handleDisapprove(user.id)} className={styles.btnDisapprove}>Disapprove</button>
                    </>
                  )}
                  <button onClick={() => handleDelete(user.id)} className={styles.btnDelete}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default UserManagement;