import { useRef, useState } from 'react';
import { buscarUsuario, login } from '../api';

const PERFIS = [
  {
    valor: 'aluno',
    titulo: 'Sou Aluno(a)',
    descricao: 'Acesso ao chat com o tutor acadêmico para tirar dúvidas e estudar.',
    icone: '🎓',
  },
  {
    valor: 'gestao',
    titulo: 'Sou da Gestão',
    descricao: 'Acesso ao analista da escola para consultas e análise de arquivos.',
    icone: '🏫',
  },
];

export default function LoginScreen({ onLogin }) {
  const [perfil, setPerfil] = useState(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const emailRef = useRef(null);

  const [codigoSeed, setCodigoSeed] = useState('');
  const [carregandoSeed, setCarregandoSeed] = useState(false);
  const [erroSeed, setErroSeed] = useState('');
  const codigoRef = useRef(null);

  async function entrar(evento) {
    evento.preventDefault();
    if (!perfil) {
      setErro('Selecione se você é aluno(a) ou da gestão.');
      return;
    }
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
      if (perfil === 'aluno' && usuario.cargo !== 'aluno') {
        throw new Error(`Este e-mail é de um usuário da gestão. Selecione "Sou da Gestão".`);
      }
      if (perfil === 'gestao' && usuario.cargo === 'aluno') {
        throw new Error(`Este e-mail é de um(a) aluno(a). Selecione "Sou Aluno(a)".`);
      }
      onLogin(usuario);
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  async function entrarComCodigo(evento) {
    evento.preventDefault();
    const codigo = codigoSeed.trim();
    if (!codigo) {
      setErroSeed('Informe o código de usuário.');
      codigoRef.current?.focus();
      return;
    }

    setErroSeed('');
    setCarregandoSeed(true);
    try {
      const usuario = await buscarUsuario(codigo);
      onLogin(usuario);
    } catch (erroCapturado) {
      setErroSeed(erroCapturado.message || 'Código inválido.');
    } finally {
      setCarregandoSeed(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-marca">
          <img src="/logo2.jpeg" alt="Logotipo da instituição" className="login-logo" />
          <h1>Assistente Virtual Escolar</h1>
          <p>Escolha o seu perfil e entre com o seu e-mail</p>
        </div>

        <form onSubmit={entrar} className="login-form">
          <div className="perfis">
            {PERFIS.map((p) => (
              <button
                type="button"
                key={p.valor}
                className={`perfil-card ${perfil === p.valor ? 'perfil-card-ativo' : ''}`}
                onClick={() => {
                  setPerfil(p.valor);
                  setErro('');
                }}
              >
                <span className="perfil-icone">{p.icone}</span>
                <strong>{p.titulo}</strong>
                <small>{p.descricao}</small>
              </button>
            ))}
          </div>

          <label className="campo">
            <span>E-mail</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro('');
              }}
              placeholder="voce@escola.edu.br"
              autoComplete="username"
            />
          </label>

          <label className="campo">
            <span>Senha</span>
            <div className="campo-senha">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setErro('');
                }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="botao-visualizar"
                onClick={() => setMostrarSenha((v) => !v)}
                title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {erro && <p className="erro-box">{erro}</p>}

          <button type="submit" className="botao-primario" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="divisor-teste">
          <span>Ou entre pelo código (modo teste)</span>
        </div>

        <form onSubmit={entrarComCodigo} className="login-teste">
          <input
            ref={codigoRef}
            type="text"
            value={codigoSeed}
            onChange={(e) => {
              setCodigoSeed(e.target.value);
              setErroSeed('');
            }}
            placeholder="Ex.: ALUNO-001 ou SEC-001"
            autoComplete="off"
          />
          <button type="submit" className="botao-teste" disabled={carregandoSeed}>
            {carregandoSeed ? 'Entrando…' : 'Entrar'}
          </button>

          {erroSeed && <p className="erro-box">{erroSeed}</p>}
        </form>
      </div>
    </div>
  );
}