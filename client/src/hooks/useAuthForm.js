import { useState } from 'react';
import { loginUser, registerUser } from '../api/authApi';
import { getErrorMessage, getLoginErrorTitle } from '../utils/errors';
import { getPasswordFormProblem } from '../utils/passwordPolicy';
import { useToast } from '../components/admin/toastContext';

// The tabs the sign-in form offers. Must match the `id` values the server stores
// on a user row, otherwise the automatic tab switch below cannot apply.
const ROLES = ['student', 'teacher', 'coordinator', 'supervisor'];

export function useAuthForm(onAuthSuccess) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('student');
  const [form, setForm] = useState({
    studentId: '',
    firstName: '',
    middleName: '',
    lastName: '',
    section: '',
    strand: '',
    school: '',
    gender: '',
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

    // The student picks their own password at registration and keeps it. Check
    // it here as well as on the server so the rule is explained before submit
    // rather than after a round trip.
    if (mode === 'register') {
      const problem = getPasswordFormProblem(form.password, form.confirmPassword);
      if (problem) {
        setError(problem);
        setLoading(false);
        return;
      }
    }

    try {
      const payload = mode === 'login'
        ? { email: form.email, password: form.password, role }
        : {
            studentId: form.studentId,
            firstName: form.firstName,
            middleName: form.middleName,
            lastName: form.lastName,
            section: form.section,
            strand: form.strand,
            school: form.school,
            gender: form.gender,
            email: form.email,
            password: form.password,
            confirmPassword: form.confirmPassword,
            phone: form.phone,
            role,
          };

      const data = mode === 'login'
        ? await loginUser(payload)
        : await registerUser(payload);

      if (mode === 'login') {
        onAuthSuccess?.(data);
        setLoginSuccess(data.user?.role || null);
        // A toast rather than an inline banner: the form navigates away on the
        // next tick, so an inline message would flash and vanish unread.
        showToast(
          `Welcome back, ${data.user?.first_name || data.user?.email || 'student'}!`,
          'success',
        );
      } else {
        setMessage(data.message || 'Account created successfully.');
      }

      setForm({
        studentId: '',
        firstName: '',
        middleName: '',
        lastName: '',
        section: '',
        strand: '',
        school: '',
        gender: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
      });
    } catch (err) {
      if (mode === 'login') {
        // Sign-in failures go to a toast. err.code says which one it was -
        // wrong password, wrong role tab, locked, pending - and err.message is
        // the server's explanation of what to do about it.
        showToast(`${getLoginErrorTitle(err.code)}: ${err.message}`, 'error', 7000);

        // Signing in on the wrong role tab is the most common mistake, and the
        // server tells us the account's real role. Move the user to it instead
        // of leaving them to find it themselves.
        const actualRole = err.data?.actualRole;
        if (actualRole && ROLES.some((r) => r.id === actualRole)) {
          setRole(actualRole);
          showToast(`Switched to the ${actualRole} tab for you.`, 'info', 5000);
        }
      } else {
        // Registration keeps its inline alert: it sits on the form next to the
        // fields that caused it, and the user stays on the page to fix them.
        setError(getErrorMessage(err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  return { mode, setMode, role, setRole, form, handleChange, loading, message, setMessage, error, setError, handleSubmit, loginSuccess };
}