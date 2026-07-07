import AuthForm from '../../components/auth/AuthForm';
import './LoginAndFRegister.css';

function LoginAndFRegister({ onAuthSuccess }) {
  return <AuthForm onAuthSuccess={onAuthSuccess} />;
}

export default LoginAndFRegister;
