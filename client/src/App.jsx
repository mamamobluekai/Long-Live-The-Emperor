import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import './styles/app.css';
// Loaded after app.css so the dark-theme overrides win the cascade for the
// global (non-module) rules both files share (body, ::selection, focus ring).
import './styles/theme.css';
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
