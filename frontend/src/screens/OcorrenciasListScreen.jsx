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

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Ocorrências de Alunos</h2>
      
      <form onSubmit={handlePesquisa} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <input 
          type="text" 
          placeholder="Buscar por nome do aluno..." 
          value={nomeBusca}
          onChange={e => setNomeBusca(e.target.value)}
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button type="submit" className="botao-primario">Pesquisar</button>
      </form>

      {erro && <p style={{ color: 'red' }}>{erro}</p>}
      
      {carregando ? (
        <p>Carregando...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ocorrencias.length === 0 ? (
            <p>Nenhuma ocorrência encontrada.</p>
          ) : (
            ocorrencias.map(o => (
              <div key={o.id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
                <p><strong>Aluno:</strong> {o.nome_do_aluno} {o.aluno_id && `(ID: ${o.aluno_id})`}</p>
                <p><strong>Tipo:</strong> {o.tipo_ocorrencia}</p>
                <p><strong>Data:</strong> {o.data}</p>
                <p><strong>Descrição:</strong> {o.descricao}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
