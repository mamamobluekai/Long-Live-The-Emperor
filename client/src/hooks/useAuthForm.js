import { useState } from 'react';
import { loginUser, registerUser } from '../api/authApi';

export function useAuthForm(onAuthSuccess) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    studentId: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (message) setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setLoginSuccess(null);

    try {
      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : {
            studentId: form.studentId,
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            password: form.password,
            confirmPassword: form.confirmPassword,
            phone: form.phone,
          };

      const data = mode === 'login'
        ? await loginUser(payload)
        : await registerUser(payload);

      if (mode === 'login') {
        onAuthSuccess?.(data);
        setLoginSuccess(data.user?.role || null);
        setMessage(`Welcome back, ${data.user?.first_name || data.user?.email || 'student'}!`);
      } else {
        setMessage(data.message || 'Account created successfully.');
      }

      setForm({
        studentId: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
      });
    } catch (err) {
      setError(err.message || 'Unable to complete request.');
    } finally {
      setLoading(false);
    }
  };

  return { mode, setMode, form, handleChange, loading, message, error, handleSubmit, loginSuccess };
}