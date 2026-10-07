import { useState } from 'react';
import ChatScreen from './screens/ChatScreen';
import LoginScreen from './screens/LoginScreen';
import PlanejamentoScreen from './screens/PlanejamentoScreen';
import PlanoAulaScreen from './screens/PlanoAulaScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OcorrenciaFormScreen from './screens/OcorrenciaFormScreen';
import OcorrenciasListScreen from './screens/OcorrenciasListScreen';
import './tela-planejamento.css';
import './tela-plano-aula.css';
import './tela-erro.css';

const ABAS_POR_CARGO = {
  professor: [
    { id: 'documento', rotulo: 'Plano de Aula Mensal', icone: '📄' },
    { id: 'planos', rotulo: 'Planejamento de Aulas', icone: '📚' },
    { id: 'ocorrencia', rotulo: 'Registrar Ocorrência', icone: '⚠️' },
    { id: 'chat', rotulo: 'Coordenador Pedagógico', icone: '🎓' },
  ],
  direcao: [
    { id: 'chat', rotulo: 'Analista de Gestão', icone: '💬' },
    { id: 'ocorrencias', rotulo: 'Ocorrências (Gestão)', icone: '📋' },
  ],
  secretaria: [
    { id: 'chat', rotulo: 'Analista de Gestão', icone: '💬' },
    { id: 'ocorrencias', rotulo: 'Ocorrências (Gestão)', icone: '📋' },
  ],
};

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [aba, setAba] = useState(null);

  if (!usuario) {
    return <LoginScreen onLogin={(u) => {
      setUsuario(u);
      setAba(ABAS_POR_CARGO[u.cargo]?.[0]?.id || null);
    }} />;
  }

  const abas = ABAS_POR_CARGO[usuario.cargo];
  if (!abas) {
    return <ChatScreen usuario={usuario} onSair={() => setUsuario(null)} />;
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
              <small>{usuario.cargo === 'professor' ? 'Professor(a)' : (usuario.cargo === 'direcao' || usuario.cargo === 'secretaria') ? 'Gestão' : 'Aluno(a)'}</small>
            </div>
          </div>
          <button type="button" className="botao-sair" onClick={() => setUsuario(null)}>
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
          ) : aba === 'ocorrencia' ? (
            <OcorrenciaFormScreen usuario={usuario} />
          ) : aba === 'ocorrencias' ? (
            <OcorrenciasListScreen usuario={usuario} />
          ) : (
            <ChatScreen usuario={usuario} onSair={() => setUsuario(null)} mostrarPerfilNaSidebar={false} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
