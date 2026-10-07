import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { arquivoParaBase64, buscarHistorico, enviarChat } from '../api';
import CadastroAlunoModal from '../components/CadastroAlunoModal';

const GAP_DE_NOVA_SESSAO_MS = 30 * 60 * 1000; // 30 minutos sem mensagens = nova conversa

const TIPOS_DE_ARQUIVO = '.csv,.xlsx,.xls,.txt,.html,.md,.pdf,.doc,.docx';

const TITULO_POR_CARGO = {
  aluno: 'Tutor Acadêmico',
  secretaria: 'Analista de Gestão',
  professor: 'Coordenador Pedagógico',
  direcao: 'Analista de Gestão',
};

const DESCRICAO_POR_CARGO = {
  aluno: 'Tiro dúvidas, explico conteúdos e te acompanho nos estudos.',
  secretaria: 'Analiso arquivos e dados para apoiar a gestão escolar.',
  professor: 'Apoio seu planejamento didático e uso os planos de aula que você já elaborou aqui.',
  direcao: 'Analiso arquivos e dados consolidados da escola.',
};

// Nome do perfil exibido na interface, a partir do cargo normalizado.
const ROTULO_POR_CARGO = {
  aluno: 'Aluno(a)',
  secretaria: 'Secretaria',
  professor: 'Professor(a)',
  direcao: 'Direção',
};

// Apenas Secretaria e Direção cadastram alunos; Professor não.
const CARGOS_COM_CADASTRO = ['secretaria', 'direcao'];

function criarSessoes(mensagens) {
  const sessoes = [];
  let atual = null;
  let tempoAnterior = null;

  for (const mensagem of mensagens) {
    const tempo = mensagem.criadoEm ? new Date(mensagem.criadoEm).getTime() : Date.now();
    const sessionId = mensagem.sessionId;
    
    // É nova se: 1) não tem sessão atual, 2) tem sessionId diferente da atual, 
    // ou 3) não tem sessionId e passou 30 minutos
    let ehNova = false;
    if (!atual) {
      ehNova = true;
    } else if (sessionId && atual.id !== sessionId) {
      ehNova = true;
    } else if (!sessionId && !atual.id.startsWith('sessao-') && atual.id !== sessionId) {
      // Se a atual tem um ID real mas essa mensagem não tem, ou vice-versa (fallback)
      ehNova = true;
    } else if (!sessionId && tempoAnterior !== null && tempo - tempoAnterior > GAP_DE_NOVA_SESSAO_MS) {
      ehNova = true;
    }

    if (ehNova) {
      atual = { id: sessionId || `sessao-${sessoes.length}`, inicio: tempo, mensagens: [mensagem] };
      sessoes.push(atual);
    } else {
      atual.mensagens.push(mensagem);
    }
    tempoAnterior = tempo;
  }
  return sessoes;
}

function formatarData(iso) {
  const data = new Date(iso);
  const agora = new Date();
  const mesmoDia = data.toDateString() === agora.toDateString();
  const ontem = new Date(agora.getTime() - 86400000);
  let dia;
  if (mesmoDia) dia = 'Hoje';
  else if (data.toDateString() === ontem.toDateString()) dia = 'Ontem';
  else dia = data.toLocaleDateString('pt-BR');
  return `${dia}, ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ChatScreen({ usuario, onSair, mostrarPerfilNaSidebar = true }) {
  const [sessoes, setSessoes] = useState([]);
  const [sessaoAtiva, setSessaoAtiva] = useState(null);
  const [entrada, setEntrada] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  const fimDaLista = useRef(null);
  const inputArquivo = useRef(null);

  const ehAluno = usuario.cargo === 'aluno';
  const podeAnexar = usuario.cargo !== 'aluno';
  const podeCadastrar = CARGOS_COM_CADASTRO.includes(usuario.cargo);
  const tituloAssistant = TITULO_POR_CARGO[usuario.cargo] || 'Assistente';
  const rotuloCargo = ROTULO_POR_CARGO[usuario.cargo] || 'Assistente';
  const sessaoSelecionada = sessoes[sessaoAtiva] || null;

  function rolarParaOFim() {
    requestAnimationFrame(() => {
      fimDaLista.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  async function recarregarHistorico() {
    try {
      const dados = await buscarHistorico(usuario.userId);
      const novas = criarSessoes(dados.mensagens || []);
      setSessoes(novas);
      if (novas.length > 0) {
        setSessaoAtiva(novas.length - 1);
      } else {
        setSessaoAtiva(null);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario.userId]);

  useEffect(() => {
    if (!carregando) rolarParaOFim();
  }, [sessaoAtiva, carregando, enviando]);

  const botaoEnviarHabilitado = useMemo(
    () => Boolean(entrada.trim()) && !enviando,
    [entrada, enviando],
  );

  async function enviar(evento) {
    evento.preventDefault();
    const texto = entrada.trim();
    if ((!texto && !arquivo) || enviando) return;

    setErro('');
    setEnviando(true);

    const gerarId = () => Math.random().toString(36).substring(2, 15);
    
    // Determinar a sessão:
    // Se sessaoAtiva é null (nova janela), cria um ID novo.
    // Se é a sessão atual, pega o ID dela. Se for "sessao-X" (placeholder sem ID real), gera um novo.
    let sessionIdAtual = null;
    if (sessaoAtiva !== null && sessoes[sessaoAtiva]) {
      sessionIdAtual = sessoes[sessaoAtiva].id;
      if (sessionIdAtual.startsWith('sessao-')) {
        sessionIdAtual = gerarId();
      }
    } else {
      sessionIdAtual = gerarId();
    }

    const mensagemLocal = {
      role: 'user',
      text: texto || '(enviou um arquivo)',
      fileName: arquivo?.name,
      sessionId: sessionIdAtual,
      criadoEm: new Date().toISOString(),
    };

    let indiceAlvo = sessaoAtiva;

    setSessoes((anterior) => {
      const copia = [...anterior];
      if (sessaoAtiva === null) {
        // Criando nova sessão na interface
        indiceAlvo = copia.length;
        copia.push({ id: sessionIdAtual, inicio: Date.now(), mensagens: [mensagemLocal] });
      } else {
        // Adicionando à sessão ativa
        copia[sessaoAtiva] = {
          ...copia[sessaoAtiva],
          id: sessionIdAtual, // atualiza ID se era placeholder
          mensagens: [...copia[sessaoAtiva].mensagens, mensagemLocal],
        };
      }
      return copia;
    });
    setSessaoAtiva((prev) => indiceAlvo);
    setEntrada('');
    setArquivo(null);
    if (inputArquivo.current) inputArquivo.current.value = '';
    rolarParaOFim();

    try {
      const payload = { userId: usuario.userId, mensagem: texto, sessionId: sessionIdAtual };
      if (arquivo) {
        payload.arquivoBase64 = await arquivoParaBase64(arquivo);
        payload.mimeType = arquivo.type || 'application/octet-stream';
        payload.fileName = arquivo.name;
      }
      const resultado = await enviarChat(payload);

      setSessoes((anterior) => {
        const copia = [...anterior];
        const idx = copia.findIndex((s) => s.id === sessionIdAtual);
        if (idx !== -1) {
          copia[idx] = {
            ...copia[idx],
            mensagens: [
              ...copia[idx].mensagens,
              { role: 'model', text: resultado.resposta, sessionId: sessionIdAtual },
            ],
          };
        }
        return copia;
      });
      setSessaoAtiva((anterior) => anterior ?? 0);
      rolarParaOFim();
      if (arquivo) {
        await recarregarHistorico();
      }
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setEnviando(false);
    }
  }

  async function apagarSessao(evento, indiceSessao) {
    evento.stopPropagation();
    const sessao = sessoes[indiceSessao];
    if (!sessao) return;
    if (!window.confirm('Tem certeza que deseja excluir esta conversa?')) return;

    try {
      const { excluirHistorico } = await import('../api');
      const messageIds = sessao.mensagens.map(m => m.id).filter(Boolean);
      if (messageIds.length > 0) {
        await excluirHistorico(usuario.userId, messageIds);
      }
      setSessoes((anterior) => anterior.filter((_, i) => i !== indiceSessao));
      if (sessaoAtiva === indiceSessao) setSessaoAtiva(null);
      else if (sessaoAtiva > indiceSessao) setSessaoAtiva((prev) => prev - 1);
    } catch (e) {
      alert('Erro ao excluir a conversa: ' + e.message);
    }
  }

  function selecionarArquivo(evento) {
    const arquivoEscolhido = evento.target.files?.[0];
    if (!arquivoEscolhido) return;
    setArquivo(arquivoEscolhido);
    setErro('');
  }

  return (
    <div className="chat">
      <aside className={`sidebar ${menuAberto ? 'sidebar-aberta' : ''}`}>
        <div className="sidebar-cabecalho">
          <strong>Conversas</strong>
          <button type="button" className="botao-novo" title="Nova conversa" onClick={() => { setEntrada(''); setSessaoAtiva(null); setMenuAberto(false); }}>
            +
          </button>
        </div>

        {carregando ? (
          <p className="sidebar-vazio">Carregando histórico…</p>
        ) : sessoes.length === 0 ? (
          <p className="sidebar-vazio">Você ainda não tem conversas por aqui.</p>
        ) : (
          <ul className="lista-sessoes">
            {sessoes.map((sessao, indice) => {
              const primeira = sessao.mensagens.find((m) => m.role === 'user');
              const titulo =
                primeira?.text || (sessao.mensagens[0]?.text || 'Conversa sem título');
              return (
                <li key={sessao.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`sessao-item ${indice === sessaoAtiva ? 'sessao-ativa' : ''}`}
                    onClick={() => { setSessaoAtiva(indice); setMenuAberto(false); }}
                    style={{ flex: 1 }}
                  >
                    <span className="sessao-titulo">{titulo.slice(0, 40)}</span>
                    <span className="sessao-data">{formatarData(sessao.inicio)}</span>
                  </button>
                  <button
                    type="button"
                    title="Excluir conversa"
                    onClick={(e) => apagarSessao(e, indice)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--cor-texto-secundario)',
                      cursor: 'pointer',
                      padding: '0 8px',
                      fontSize: '1.2rem',
                    }}
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {mostrarPerfilNaSidebar && (
          <div className="sidebar-rodape">
            <div className="usuario-resumo">
              <span className="avatar">{usuario.nome?.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{usuario.nome}</strong>
                <small>{usuario.userId} · {rotuloCargo}</small>
              </div>
            </div>
            <button type="button" className="botao-sair" onClick={onSair}>
              Sair
            </button>
          </div>
        )}
      </aside>

      <main className="area-chat">
        <header className="chat-cabecalho">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="botao-hamburguer"
              onClick={() => setMenuAberto(!menuAberto)}
              title="Menu"
            >
              ☰
            </button>
            <div>
              <h2>{tituloAssistant}</h2>
              <p>{DESCRICAO_POR_CARGO[usuario.cargo]}</p>
            </div>
          </div>
          <div className="cabecalho-acoes">
            {podeCadastrar && (
              <button
                type="button"
                className="botao-cadastrar"
                onClick={() => setCadastroAberto(true)}
              >
                + Cadastrar aluno(a)
              </button>
            )}
            <span className={`selo-cargo selo-${ehAluno ? 'aluno' : 'gestao'}`}>
              {rotuloCargo}
            </span>
          </div>
        </header>

        <div className="mensagens">
          {!carregando && !sessaoSelecionada ? (
            <div className="estado-vazio">
              <span className="estado-icone">👋</span>
              <p>Comece uma nova conversa fazendo a primeira pergunta abaixo.</p>
            </div>
          ) : (
            sessaoSelecionada?.mensagens.map((mensagem, indice) => (
              <div
                key={`${mensagem.id || indice}-${indice}`}
                className={`mensagem ${mensagem.role === 'user' ? 'mensagem-usuario' : 'mensagem-modelo'}`}
              >
                <div className="bolha">
                  {mensagem.fileName && (
                    <span className="anexo">📎 {mensagem.fileName}</span>
                  )}
                  {mensagem.role === 'model' ? (
                    <div className="bolha-markdown">
                      <ReactMarkdown>{mensagem.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="bolha-texto">{mensagem.text}</span>
                  )}
                </div>
              </div>
            ))
          )}
          {enviando && (
            <div className="mensagem mensagem-modelo">
              <div className="bolha digitando">Analisando…</div>
            </div>
          )}
          <div ref={fimDaLista} />
        </div>

        {erro && <p className="erro-box chat-erro">{erro}</p>}

        <form onSubmit={enviar} className="entrada">
          {podeAnexar && arquivo && (
            <button
              type="button"
              className="arquivo-chip"
              onClick={() => {
                setArquivo(null);
                if (inputArquivo.current) inputArquivo.current.value = '';
              }}
              title="Remover arquivo"
            >
              📎 {arquivo.name} <span>×</span>
            </button>
          )}
          <div className="entrada-linha">
            {podeAnexar && (
              <>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept={TIPOS_DE_ARQUIVO}
                  onChange={selecionarArquivo}
                  id="anexo"
                  hidden
                />
                <button
                  type="button"
                  className="botao-anexar"
                  title="Anexar arquivo para análise"
                  onClick={() => inputArquivo.current?.click()}
                >
                  📎
                </button>
              </>
            )}
            <textarea
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar(e);
                }
              }}
              placeholder={
                ehAluno
                  ? 'Escreva sua dúvida para o tutor…'
                  : 'Escreva sua pergunta ou anexe um arquivo para análise…'
              }
              rows={2}
            />
            <button type="submit" className="botao-enviar" disabled={!botaoEnviarHabilitado}>
              ➤
            </button>
          </div>
        </form>
      </main>

      {cadastroAberto && (
        <CadastroAlunoModal onFechar={() => setCadastroAberto(false)} />
      )}
    </div>
  );
}