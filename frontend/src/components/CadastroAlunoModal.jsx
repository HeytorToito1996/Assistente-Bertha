import { useEffect, useRef, useState } from 'react';
import { criarUsuario } from '../api';

export default function CadastroAlunoModal({ onFechar }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [cadastrado, setCadastrado] = useState(null);
  const nomeRef = useRef(null);

  useEffect(() => {
    nomeRef.current?.focus();
    function fecharComEscape(evento) { if (evento.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', fecharComEscape);
    return () => document.removeEventListener('keydown', fecharComEscape);
  }, [onFechar]);

  async function cadastrar(evento) {
    evento.preventDefault();
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();

    if (nomeLimpo.length < 3) {
      setErro('Informe o nome completo do aluno(a).');
      nomeRef.current?.focus();
      return;
    }
    if (!emailLimpo) {
      setErro('Informe o e-mail do aluno(a).');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas digitadas não são iguais.');
      return;
    }

    setErro('');
    setCarregando(true);
    try {
      const criado = await criarUsuario({
        nome: nomeLimpo,
        email: emailLimpo,
        senha,
        cargo: 'aluno',
      });
      setCadastrado(criado);
      setNome('');
      setEmail('');
      setSenha('');
      setConfirmacao('');
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível cadastrar. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cadastro-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecalho">
          <h3 id="cadastro-titulo">Cadastrar aluno(a)</h3>
          <button type="button" className="modal-fechar" onClick={onFechar} title="Fechar">
            ×
          </button>
        </div>

        {cadastrado ? (
          <div className="cadastro-sucesso">
            <p className="sucesso-icone">✅</p>
            <p>
              Aluno(a) cadastrado com sucesso! Já pode fazer login no assistente com:
            </p>
            <div className="sucesso-dados">
              <span>
                E-mail: <strong>{cadastrado.email}</strong>
              </span>
              <span>
                Código interno: <strong>{cadastrado.userId}</strong>
              </span>
            </div>
            <div className="modal-acoes">
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setCadastrado(null)}
              >
                Cadastrar outro
              </button>
              <button type="button" className="botao-primario" onClick={onFechar}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={cadastrar} className="modal-form">
            <label className="campo">
              <span>Nome completo</span>
              <input
                ref={nomeRef}
                type="text"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setErro('');
                }}
                placeholder="Ex.: Maria Oliveira"
                autoComplete="off"
              />
            </label>

            <label className="campo">
              <span>E-mail de acesso</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErro('');
                }}
                placeholder="aluno@escola.edu.br"
                autoComplete="off"
              />
            </label>

            <label className="campo">
              <span>Senha</span>
              <input
                type="password"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setErro('');
                }}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </label>

            <label className="campo">
              <span>Confirmar senha</span>
              <input
                type="password"
                value={confirmacao}
                onChange={(e) => {
                  setConfirmacao(e.target.value);
                  setErro('');
                }}
                placeholder="Digite a senha novamente"
                autoComplete="new-password"
              />
            </label>

            {erro && <p className="erro-box">{erro}</p>}

            <div className="modal-acoes">
              <button type="button" className="botao-secundario" onClick={onFechar}>
                Cancelar
              </button>
              <button type="submit" className="botao-primario" disabled={carregando}>
                {carregando ? 'Cadastrando…' : 'Cadastrar aluno(a)'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}