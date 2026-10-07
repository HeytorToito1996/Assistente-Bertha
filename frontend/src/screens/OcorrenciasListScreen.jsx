import { useState, useEffect } from 'react';
import { buscarOcorrencias } from '../api';

export default function OcorrenciasListScreen({ usuario }) {
  const [nomeBusca, setNomeBusca] = useState('');
  const [ocorrencias, setOcorrencias] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function fetchOcorrencias(busca = '') {
    setCarregando(true);
    setErro('');
    try {
      const dados = await buscarOcorrencias(busca);
      setOcorrencias(dados);
    } catch (e) {
      setErro('Erro ao carregar ocorrências.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    fetchOcorrencias();
  }, []);

  function handlePesquisa(e) {
    e.preventDefault();
    fetchOcorrencias(nomeBusca.trim());
  }

  function formatarTipo(tipo) {
    if (!tipo) return '';
    return tipo.charAt(0).toUpperCase() + tipo.slice(1);
  }

  return (
    <div className="ocor-container">
      <h2>Ocorrências de Alunos</h2>
      
      <form onSubmit={handlePesquisa} className="ocor-busca-form">
        <input 
          type="text" 
          placeholder="Buscar por nome ou série..." 
          value={nomeBusca}
          onChange={e => setNomeBusca(e.target.value)}
        />
        <button type="submit" className="botao-primario">Pesquisar</button>
      </form>

      {erro && <div className="ocor-status erro" style={{ marginBottom: '1rem' }}>{erro}</div>}
      
      {carregando ? (
        <div className="ocor-status info">Carregando...</div>
      ) : (
        <div className="ocor-lista">
          {ocorrencias.length === 0 ? (
            <div className="ocor-vazio">Nenhuma ocorrência encontrada.</div>
          ) : (
            ocorrencias.map(o => (
              <div key={o.id} className="ocor-card">
                <div className="ocor-card-header">
                  <h3>{o.nome_do_aluno} {o.aluno_id && <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>(ID: {o.aluno_id})</span>}</h3>
                  <span className={`ocor-tag ${o.tipo_ocorrencia || 'disciplinar'}`}>
                    {formatarTipo(o.tipo_ocorrencia) || 'Disciplinar'}
                  </span>
                </div>
                <p><strong>Série:</strong> {o.serie || 'Não informada'}</p>
                <p><strong>Data:</strong> {o.data}</p>
                <p><strong>Descrição:</strong> {o.descricao}</p>
                <p style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                  <small style={{ color: '#6b7280' }}>Registrado por: <strong>{o.autor || 'Desconhecido'}</strong></small>
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
