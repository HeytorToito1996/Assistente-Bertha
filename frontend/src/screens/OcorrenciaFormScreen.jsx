import { useState } from 'react';
import { criarOcorrencia } from '../api';

export default function OcorrenciaFormScreen({ usuario }) {
  const [nome, setNome] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [serie, setSerie] = useState('');
  const [tipo, setTipo] = useState('disciplinar');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState('');
  const [status, setStatus] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nome.trim()) return setStatus('Informe o nome do aluno.');
    if (!serie.trim()) return setStatus('Informe a série do aluno.');
    if (!descricao.trim()) return setStatus('Informe a descrição.');
    if (!data) return setStatus('Informe a data.');

    setStatus('Salvando...');
    try {
      await criarOcorrencia({
        nome_do_aluno: nome.trim(),
        aluno_id: alunoId.trim(),
        serie: serie.trim(),
        tipo_ocorrencia: tipo,
        descricao,
        data,
        autor: usuario?.nome || 'Usuário Desconhecido',
      });
      setStatus('Ocorrência registrada com sucesso!');
      setNome('');
      setAlunoId('');
      setSerie('');
      setDescricao('');
      setData('');
    } catch (erro) {
      setStatus(erro.message || 'Erro ao salvar.');
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Registrar Ocorrência</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label className="campo">
          <span>Nome do Aluno</span>
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} />
        </label>
        
        <label className="campo">
          <span>ID do Aluno (opcional)</span>
          <input type="text" value={alunoId} onChange={e => setAlunoId(e.target.value)} />
        </label>

        <label className="campo">
          <span>Série</span>
          <input type="text" value={serie} onChange={e => setSerie(e.target.value)} placeholder="Ex: 8º Ano A" />
        </label>

        <label className="campo">
          <span>Tipo de Ocorrência</span>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="disciplinar">Disciplinar</option>
            <option value="comportamental">Comportamental</option>
            <option value="pedagogica">Pedagógica</option>
          </select>
        </label>

        <label className="campo">
          <span>Data</span>
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
        </label>

        <label className="campo">
          <span>Descrição</span>
          <textarea rows="4" value={descricao} onChange={e => setDescricao(e.target.value)} />
        </label>

        <button type="submit" className="botao-primario">Salvar</button>
        {status && <p style={{ marginTop: '1rem' }}>{status}</p>}
      </form>
    </div>
  );
}
