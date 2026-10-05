import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import './styles/app.css';
// Loaded after app.css so the dark-theme overrides win the cascade for the
// global (non-module) rules both files share (body, ::selection, focus ring).
import './styles/theme.css';
// Loaded after theme.css so [data-theme='dark'] overrides win the cascade for
// the global rules. See the file header for how this is scoped.
import './styles/dark.css';
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
