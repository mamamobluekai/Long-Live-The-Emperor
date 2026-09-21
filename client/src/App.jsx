import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import './styles/app.css';
import { ChatUnreadProvider } from './context/ChatUnreadProvider';

function App() {
  return (
    <BrowserRouter>
      <ChatUnreadProvider>
        <AppRoutes />
      </ChatUnreadProvider>
    </BrowserRouter>
  );
}

export default App;
