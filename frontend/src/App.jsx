import { useState } from 'react';
import ChatScreen from './screens/ChatScreen';
import LoginScreen from './screens/LoginScreen';
import PlanejamentoScreen from './screens/PlanejamentoScreen';
import PlanoAulaScreen from './screens/PlanoAulaScreen';
import ErrorBoundary from './components/ErrorBoundary';
import './tela-planejamento.css';
import './tela-plano-aula.css';
import './tela-erro.css';
import './acabamento.css';

// Abas liberadas por cargo. Professor é o único com acesso ao planejamento.
const ABAS_POR_CARGO = {
  professor: [
    { id: 'documento', rotulo: 'Plano de Aula Mensal', icone: '📄' },
    { id: 'planos', rotulo: 'Planejamento de Aulas', icone: '📚' },
    { id: 'chat', rotulo: 'Coordenador Pedagógico', icone: '🎓' },
  ],
};

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('bertha.usuario')) || null; }
    catch { return null; }
  });
  function entrar(dados) {
    sessionStorage.setItem('bertha.usuario', JSON.stringify(dados));
    setUsuario(dados);
  }
  function sair() {
    sessionStorage.removeItem('bertha.usuario');
    setUsuario(null);
    setAba('documento');
  }
  const [aba, setAba] = useState('documento');

  if (!usuario) {
    return <LoginScreen onLogin={entrar} />;
  }

  const abas = ABAS_POR_CARGO[usuario.cargo];
  if (!abas) {
    return <ChatScreen usuario={usuario} onSair={sair} />;
  }

  return (
    <div className="prof-shell">
      <nav className="prof-nav">
        <div className="prof-nav-marca">
          <img src="/logo2.jpeg" alt="Logotipo da instituição" className="prof-nav-logo" />
          <span className="prof-nav-nome">Dona Bertha</span>
        </div>

        <div className="prof-nav-abas" role="tablist" aria-label="Áreas do professor">
          {abas.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={aba === item.id}
              className={`prof-nav-aba ${aba === item.id ? 'prof-nav-aba-ativa' : ''}`}
              onClick={() => setAba(item.id)}
            >
              <span aria-hidden="true">{item.icone}</span>
              {item.rotulo}
            </button>
          ))}
        </div>

        <div className="prof-nav-usuario">
          <div className="prof-nav-identidade">
            <span className="avatar">{usuario.nome?.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{usuario.nome}</strong>
              <small>Professor(a)</small>
            </div>
          </div>
          <button type="button" className="botao-sair" onClick={sair}>
            Sair
          </button>
        </div>
      </nav>

      <div className="prof-conteudo">
        {/* A barreira troca de key junto com a aba: se uma tela falhar, o
            professor troca de aba (ou clica em "Tentar de novo") e volta —
            sem página branca nem recarga completa. */}
        <ErrorBoundary key={aba}>
          {aba === 'documento' ? (
            <PlanoAulaScreen usuario={usuario} />
          ) : aba === 'planos' ? (
            <PlanejamentoScreen usuario={usuario} />
          ) : (
            <ChatScreen usuario={usuario} onSair={sair} mostrarPerfilNaSidebar={false} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

/*
 V   V  III   CCC  TTTTT  OOO  RRRR
 V   V   I   C      T   O   O R   R
  V V    I   C      T   O   O RRRR
   V    III   CCC   T    OOO  R   R
*/
