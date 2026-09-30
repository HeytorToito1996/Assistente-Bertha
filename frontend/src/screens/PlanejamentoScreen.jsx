import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { arquivoParaBase64, buscarPlanejamentos, planejarAula } from '../api';

// Materiais didáticos aceitos como apoio ao planejamento.
const TIPOS_DE_ARQUIVO = '.pdf,.doc,.docx,.txt,.md,.html,.csv,.xlsx,.xls';

const DURACAO_PADRAO_MIN = 50; // duração padrão de uma aula, em minutos
const MAX_AULAS = 40; // mesmo limite aplicado no back-end

// Sugestões rápidas de período letivo, para não obrigar o professor a digitar.
const PERIODOS_SUGERIDOS = [
  '1ª semana letiva',
  '2ª semana letiva',
  '1º bimestre',
  '2º bimestre',
  '3º bimestre',
  '4º bimestre',
  'Unidade 1',
  'Unidade 2',
  'Unidade 3',
  'Recuperação paralelo',
];

const DISCIPLINAS_SUGERIDAS = [
  // Componentes curriculares do Ensino Fundamental e Médio.
  'Matemática',
  'Português',
  'Ciências',
  'História',
  'Geografia',
  'Artes',
  'Educação Física',
  'Inglês',
  'Tecnologia',
  // Áreas transversais e projetos.
  'Eletivas',
  'Projeto de Vida',
  // Matérias dos cursos técnicos ofrecidos pela escola.
  'Administração',
  'Desenvolvimento de Sistemas',
  'Ciência de Dados',
];

const SERIES_SUGERIDAS = [
  '1º ano',
  '2º ano',
  '3º ano',
  '4º ano',
  '5º ano',
  '6º ano',
  '7º ano',
  '8º ano',
  '9º ano',
  '1º ano do Ensino Médio',
  '2º ano do Ensino Médio',
  '3º ano do Ensino Médio',
];

function formatarDataHora(iso) {
  if (!iso) return 'sem data';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return 'sem data';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDataCurta(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PlanejamentoScreen({ usuario }) {
  const [disciplina, setDisciplina] = useState('');
  const [serie, setSerie] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [quantidadeAulas, setQuantidadeAulas] = useState(4);
  const [duracaoAulaMin, setDuracaoAulaMin] = useState(DURACAO_PADRAO_MIN);
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState(null);

  const [planos, setPlanos] = useState([]);
  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const inputArquivo = useRef(null);

  const cargaHoraria = useMemo(() => {
    const total = (Number(quantidadeAulas) || 0) * (Number(duracaoAulaMin) || 0);
    return {
      minutos: total,
      horas: (total / 60).toFixed(1).replace('.', ','),
    };
  }, [quantidadeAulas, duracaoAulaMin]);

  const formularioValido =
    disciplina.trim().length >= 2 &&
    serie.trim().length >= 2 &&
    periodo.trim().length >= 2 &&
    Number.isInteger(Number(quantidadeAulas)) &&
    Number(quantidadeAulas) >= 1 &&
    Number(quantidadeAulas) <= MAX_AULAS &&
    Number(duracaoAulaMin) >= 10 &&
    Number(duracaoAulaMin) <= 240;

  async function recarregarPlanos() {
    try {
      const dados = await buscarPlanejamentos(usuario.userId);
      setPlanos(dados.planos || []);
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível carregar o histórico de planos.');
    } finally {
      setCarregandoHistorico(false);
    }
  }

  useEffect(() => {
    recarregarPlanos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario.userId]);

  function limparFormulario() {
    setDisciplina('');
    setSerie('');
    setPeriodo('');
    setQuantidadeAulas(4);
    setDuracaoAulaMin(DURACAO_PADRAO_MIN);
    setObservacoes('');
    setArquivo(null);
    if (inputArquivo.current) inputArquivo.current.value = '';
  }

  async function gerarPlano(evento) {
    evento.preventDefault();
    if (!formularioValido || gerando) return;

    setErro('');
    setGerando(true);

    try {
      const payload = {
        userId: usuario.userId,
        disciplina: disciplina.trim(),
        serie: serie.trim(),
        periodo: periodo.trim(),
        quantidadeAulas: Number(quantidadeAulas),
        duracaoAulaMin: Number(duracaoAulaMin),
        observacoes: observacoes.trim(),
      };

      if (arquivo) {
        payload.arquivoBase64 = await arquivoParaBase64(arquivo);
        payload.mimeType = arquivo.type || 'application/octet-stream';
        payload.fileName = arquivo.name;
      }

      const novo = await planejarAula(payload);

      setPlanos((anterior) => [novo, ...anterior]);
      setPlanoSelecionado(novo);
      limparFormulario();
    } catch (erroCapturado) {
      setErro(erroCapturado.message || 'Não foi possível gerar o plano de aula.');
    } finally {
      setGerando(false);
    }
  }

  function selecionarArquivo(evento) {
    const escolhido = evento.target.files?.[0];
    if (!escolhido) return;
    setArquivo(escolhido);
    setErro('');
  }

  function removerArquivo() {
    setArquivo(null);
    if (inputArquivo.current) inputArquivo.current.value = '';
  }

  return (
    <div className="plan">
      {/* ---------------- Coluna 1: formulário ---------------- */}
      <aside className="plan-formulario">
        <div className="plan-form-cabecalho">
          <h2>Novo plano de aula</h2>
          <p>A IA prepara cada aula em blocos de {duracaoAulaMin} minutos, alinhado à BNCC.</p>
        </div>

        <form onSubmit={gerarPlano} className="plan-form">
          <label className="plan-campo">
            <span>Disciplina *</span>
            <input
              type="text"
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              placeholder="Ex.: Matemática"
              list="plan-lista-disciplinas"
            />
            <datalist id="plan-lista-disciplinas">
              {DISCIPLINAS_SUGERIDAS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>

          <label className="plan-campo">
            <span>Série / Ano *</span>
            <input
              type="text"
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
              placeholder="Ex.: 7º ano"
              list="plan-lista-series"
            />
            <datalist id="plan-lista-series">
              {SERIES_SUGERIDAS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label className="plan-campo">
            <span>Período letivo *</span>
            <input
              type="text"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="Ex.: 1º bimestre"
              list="plan-lista-periodos"
            />
            <datalist id="plan-lista-periodos">
              {PERIODOS_SUGERIDOS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <div className="plan-campo-duplo">
            <label className="plan-campo">
              <span>Quantidade de aulas *</span>
              <input
                type="number"
                min="1"
                max={MAX_AULAS}
                step="1"
                value={quantidadeAulas}
                onChange={(e) => setQuantidadeAulas(e.target.value)}
              />
            </label>

            <label className="plan-campo">
              <span>Minutos por aula</span>
              <input
                type="number"
                min="10"
                max="240"
                step="5"
                value={duracaoAulaMin}
                onChange={(e) => setDuracaoAulaMin(e.target.value)}
              />
            </label>
          </div>

          <p className="plan-carga">
            Carga horária total: <strong>{cargaHoraria.minutos} min</strong> ({cargaHoraria.horas} h)
          </p>

          <label className="plan-campo">
            <span>Material de apoio (opcional)</span>
            <div className="plan-anexo-linha">
              <input
                ref={inputArquivo}
                type="file"
                accept={TIPOS_DE_ARQUIVO}
                onChange={selecionarArquivo}
                hidden
              />
              <button
                type="button"
                className="plan-botao-anexar"
                onClick={() => inputArquivo.current?.click()}
                disabled={gerando}
              >
                📎 Anexar material
              </button>
              {arquivo && (
                <span className="plan-chip">
                  {arquivo.name}
                  <button type="button" onClick={removerArquivo} title="Remover material">
                    ×
                  </button>
                </span>
              )}
            </div>
            <small>
              A IA analisa o material e indica como usá-lo em cada aula. Aceita PDF, DOC(X), TXT, MD,
              CSV e planilhas.
            </small>
          </label>

          <label className="plan-campo">
            <span>Observações (turma, condições, foco…)</span>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: Turma B do 7º ano B, 32 alunos, 3 com dificuldade em frações, só 1 projetor na sala."
              rows={5}
            />
            <small>A IA usa estas observações para adaptar ritmo, atividades e avaliação.</small>
          </label>

          {erro && <p className="plan-erro">{erro}</p>}

          {gerando && (
            <p className="plan-espera">
              <strong>Gerando o plano…</strong>
              <span>
                {cargaHoraria.minutos > 0 && `${quantidadeAulas} aula(s) — `}
                a IA está alinhando à BNCC, definindo objetivos, recursos e a cronometragem
                de cada aula. Isso pode levar até 1–2 minutos; deixe esta aba aberta.
              </span>
            </p>
          )}

          <button type="submit" className="plan-botao-gerar" disabled={!formularioValido || gerando}>
            {gerando ? 'Gerando plano…' : '✨ Gerar plano de aula'}
          </button>
        </form>
      </aside>

      {/* ---------------- Coluna 2: histórico ou detalhe ---------------- */}
      <main className="plan-conteudo">
        {planoSelecionado ? (
          <>
            <header className="plan-detalhe-cabecalho">
              <button type="button" className="plan-voltar" onClick={() => setPlanoSelecionado(null)}>
                ← Voltar ao histórico
              </button>
              <div className="plan-detalhe-meta">
                <h2>{planoSelecionado.titulo}</h2>
                <p>
                  {planoSelecionado.disciplina} · {planoSelecionado.serie} · {planoSelecionado.periodo}{' '}
                  · {planoSelecionado.quantidadeAulas} aula(s) x {planoSelecionado.duracaoAulaMin} min
                  {planoSelecionado.cargaHorariaMin
                    ? ` (${planoSelecionado.cargaHorariaMin} min)`
                    : ''}{' '}
                  · {formatarDataHora(planoSelecionado.criadoEm)}
                </p>
                {planoSelecionado.arquivoNome && (
                  <p className="plan-detalhe-anexo">📎 Material usado: {planoSelecionado.arquivoNome}</p>
                )}
                {planoSelecionado.observacoes && (
                  <p className="plan-detalhe-obs">
                    <strong>Observações informadas:</strong> {planoSelecionado.observacoes}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="plan-botao-copiar"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(
                      `${planoSelecionado.titulo}\n\n${planoSelecionado.conteudo || ''}`
                    )
                    .then(() => setErro(''))
                    .catch(() => setErro('Não foi possível copiar o plano.'))
                }
              >
                Copiar
              </button>
            </header>

            <div className="plan-detalhe-corpo">
              <ReactMarkdown>{planoSelecionado.conteudo || ''}</ReactMarkdown>
            </div>
          </>
        ) : (
          <>
            <header className="plan-historico-cabecalho">
              <h2>Histórico de aulas planejadas</h2>
              <p>{planos.length} plano(s) registrado(s)</p>
            </header>

            {carregandoHistorico ? (
              <p className="plan-vazio">Carregando planos…</p>
            ) : planos.length === 0 ? (
              <div className="plan-vazio">
                <span className="plan-vazio-icone">📚</span>
                <p>
                  Nenhum plano ainda. Preencha o formulário ao lado para o primeiro plano de aula ser
                  preparado pela IA.
                </p>
              </div>
            ) : (
              <ul className="plan-lista">
                {planos.map((plano) => (
                  <li key={plano.id}>
                    <button type="button" className="plan-item" onClick={() => setPlanoSelecionado(plano)}>
                      <div className="plan-item-topo">
                        <strong>{plano.titulo}</strong>
                        <span className="plan-item-data">{formatarDataCurta(plano.criadoEm)}</span>
                      </div>
                      <p className="plan-item-sub">
                        {plano.disciplina} · {plano.serie} · {plano.periodo}
                      </p>
                      <p className="plan-item-carga">
                        {plano.quantidadeAulas} aula(s) × {plano.duracaoAulaMin} min ={' '}
                        {plano.quantidadeAulas * plano.duracaoAulaMin} min
                        {plano.arquivoNome ? ' · 📎 material anexado' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
