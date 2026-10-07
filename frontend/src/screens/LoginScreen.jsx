import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  School,
  UserCheck,
  Zap,
} from 'lucide-react';
import { login } from '../api';
import '../tela-login.css';

/* ---------------------------------------------------------------------------
 *  PERFIS DE ACESSO
 *  Cada perfil mapeia para um "cargo" válido do back-end, usado para conferir
 *  se o e-mail informado pertence de fato ao perfil escolhido na aba.
 * ------------------------------------------------------------------------- */
const PERFIS = [
  {
    cargo: 'aluno',
    rotulo: 'Aluno',
    icone: GraduationCap,
    emailDemo: 'maria@escola.edu.br',
    senhaDemo: 'aluno123',
  },
  {
    cargo: 'secretaria',
    rotulo: 'Gestão',
    icone: School,
    emailDemo: 'ana@escola.edu.br',
    senhaDemo: 'gestao123',
  },
  {
    cargo: 'professor',
    rotulo: 'Professor',
    icone: UserCheck,
    emailDemo: 'paulo@escola.edu.br',
    senhaDemo: 'prof2024',
  },
];

/* Nomes amigáveis para a mensagem de erro quando o perfil não bate. */
const NOMES_CARGO = {
  aluno: 'Aluno(a)',
  secretaria: 'Gestão / Secretaria',
  professor: 'Professor(a)',
  direcao: 'Direção',
};

export default function LoginScreen({ onLogin }) {
  const [perfil, setPerfil] = useState('aluno');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const emailRef = useRef(null);

  const perfilAtual = PERFIS.find((p) => p.cargo === perfil) || PERFIS[0];

  function trocarPerfil(novoPerfil) {
    setPerfil(novoPerfil);
    setErro('');
  }

  async function entrar(evento) {
    evento.preventDefault();

    const emailLimpo = email.trim();
    if (!emailLimpo) {
      setErro('Informe o seu e-mail.');
      emailRef.current?.focus();
      return;
    }
    if (!senha) {
      setErro('Informe a sua senha.');
      return;
    }

    setErro('');
    setCarregando(true);
    try {
      const usuario = await login(emailLimpo, senha);
      if (usuario.cargo !== perfil) {
        throw new Error(
          `Este e-mail pertence ao perfil "${NOMES_CARGO[usuario.cargo] || usuario.cargo}". ` +
            `Selecione a aba correspondente.`
        );
      }
      onLogin(usuario);
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  function preencherDemo() {
    setEmail(perfilAtual.emailDemo);
    setSenha(perfilAtual.senhaDemo);
    setErro('');
    emailRef.current?.focus();
  }


  return (

    <main className="login-screen">
      <div className="login-wrapper">
        {/* Cabeçalho institucional */}
        <header className="login-header">
          <img
            src="/logo2.jpeg"
            alt="Logotipo da instituição"
            className="login-brand-logo"
          />
          <h1 className="login-brand-title">Dona Bertha</h1>
          <p className="login-brand-subtitle">Assistente Virtual Escolar Inteligente</p>
        </header>

        {/* Cartão principal */}
        <div className="login-card">
          {/* Abas de seleção de perfil */}
          <nav className="login-tabs" role="tablist" aria-label="Opções de acesso">
            {PERFIS.map((p) => {
              const Icone = p.icone;
              const ativa = perfil === p.cargo;
              return (
                <button
                  key={p.cargo}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  className={`login-tab ${ativa ? 'login-tab-ativa' : ''}`}
                  onClick={() => trocarPerfil(p.cargo)}
                >
                  <Icone aria-hidden="true" />
                  <span>{p.rotulo}</span>
                </button>
              );
            })}
          </nav>

          {/* Formulário (o mesmo campo e-mail/senha para os 3 perfis) */}
          <form className="login-form" role="tabpanel" onSubmit={entrar} key={perfil}>
            <div className="login-form-group">
              <label htmlFor="login-email">E-mail</label>
              <div className="login-input-wrap">
                <Mail className="login-input-icon" aria-hidden="true" />
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro('');
                  }}
                  placeholder="voce@escola.edu.br"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login-form-group">
              <label htmlFor="login-senha">Senha</label>
              <div className="login-input-wrap">
                <Lock className="login-input-icon" aria-hidden="true" />
                <input
                  id="login-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro('');
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-btn-ver-senha"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {mostrarSenha ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </div>

            {erro && (
              <p className="login-erro" role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{erro}</span>
              </p>
            )}

            <button type="submit" className="login-btn-submit" disabled={carregando}>
              <span>{carregando ? 'Entrando…' : `Entrar como ${perfilAtual.rotulo}`}</span>
              <ArrowRight aria-hidden="true" />
            </button>

            {/* Atalho de acesso rápido — apenas para o perfil Aluno */}
            {perfil === 'aluno' && (
              <div className="login-quick-demo">
                <span className="login-demo-label">Acesso rápido para avaliação:</span>
                <div className="login-demo-buttons">
                  <button type="button" className="login-btn-demo" onClick={preencherDemo}>
                    <Zap aria-hidden="true" />
                    <span>Preencher dados de Aluno Demo</span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>


        {/* Rodapé */}
        <footer className="login-footer">
          <p>🔒 Ambiente escolar seguro e criptografado</p>
          <span className="login-footer-separator">•</span>
          <p>Prefeitura Municipal &amp; Rede de Ensino</p>
        </footer>
      </div>
    </main>
  );
}
