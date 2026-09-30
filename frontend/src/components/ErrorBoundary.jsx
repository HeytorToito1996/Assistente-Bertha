import { Component } from 'react';

/**
 * Barreira de erro em volta de uma tela.
 *
 * Sem ela, qualquer exceção na renderização derruba a árvore inteira do React e
 * o navegador mostra só a página em branco — sem nenhuma pista do que houve.
 * Aqui a tela é substituída por uma mensagem com o motivo e a opção de tentar
 * de novo.
 *
 * O `resetKey` serve para o pai remontar a barreira (por exemplo, ao trocar de
 * aba) e o professor recuperar a tela sem recarregar a página inteira.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    // O console do navegador guarda a pilha completa; o professor não precisa
    // ver isso, mas quem for depurar precisa.
    console.error('[Tela] Erro na renderização:', erro, info?.componentStack);
  }

  render() {
    const { erro } = this.state;
    const { children } = this.props;

    if (!erro) return children;

    return (
      <div className="erro-tela">
        <div className="erro-cartao">
          <span className="erro-icone" aria-hidden="true">
            ⚠️
          </span>
          <h2>Esta tela não conseguiu carregar</h2>
          <p>
            Ocorreu um erro ao montar a tela. Seus dados não foram enviados para lugar nenhum. Você
            pode tentar de novo ou recarregar a página.
          </p>
          <pre className="erro-detalhe">{String(erro?.message || erro)}</pre>
          <div className="erro-acoes">
            <button
              type="button"
              className="erro-botao erro-botao-primario"
              onClick={() => this.setState({ erro: null })}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              className="erro-botao"
              onClick={() => window.location.reload()}
            >
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
