import { useState } from 'react';
import ChatScreen from './screens/ChatScreen';
import LoginScreen from './screens/LoginScreen';

export default function App() {
  const [usuario, setUsuario] = useState(null);

  if (!usuario) {
    return <LoginScreen onLogin={setUsuario} />;
  }
  return <ChatScreen usuario={usuario} onSair={() => setUsuario(null)} />;
}