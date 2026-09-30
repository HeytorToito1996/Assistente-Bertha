import { useEffect, useMemo, useRef, useState } from 'react';
import { buscarDisciplinas, buscarEscopo, buscarPlanejamentos, gerarPlanoAula } from '../api';

// Segmentos reconhecidos pelas planilhas de escopo-sequência. Os nomes com
// acento são só para exibição: o back-end compara sem acento.
const ETAPAS = [
  { valor: 'Anos Iniciais', rotulo: 'Anos Iniciais' },
  { valor: 'Anos Finais', rotulo: 'Anos Finais' },
  { valor: 'Ensino Medio', rotulo: 'Ensino Médio' },
  { valor: 'Ensino Tecnico', rotulo: 'Ensino Técnico' },
];

const BIMESTRES = [
  { valor: 1, rotulo: '1º bimestre' },
  { valor: 2, rotulo: '2º bimestre' },
  { valor: 3, rotulo: '3º bimestre' },
  { valor: 4, rotulo: '4º bimestre' },
];

// Só o Ensino Técnico tem as colunas de competência na planilha. Nos outros
// segmentos o campo sai com o modelo padrão da Base Nacional Comum, e o
// professor precisa saber que aquilo não veio do escopo da escola.
const DICA_COMPETENCIA_PADRAO =
  'Texto sugerido a partir da Base Nacional Comum — a planilha deste segmento não traz a coluna. Ajuste ao que a escola pede.';

// Lista vazia estável: evita recriar um array a cada render e disparar o efeito
// que ajusta o bloco escolhido.
const SEM_BLOCOS = [];

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

// Compara nomes ignorando acentos e maiúsculas, para casar "Ensino Tecnico"
// (do back-end) com "Ensino Técnico" (da tela).
const chave = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function listaParaTexto(lista) {
  return (lista || []).join('\n');
}

function textoParaLista(texto) {
  return String(texto || '')
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// "2026-02-02" -> "02/02/2026". A data vem como texto puro para não passar por
// Date e suffer deslocamento de fuso no navegador.
function dataBr(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function dataIso(br) {
  const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Campo de texto que cresce com o conteúdo, para o documento não esconder
// itens na hora de imprimir. `avisoPadrao` sinaliza quando o texto veio de um
// modelo padrão da escola em vez do escopo-sequência.
function CampoLongo({ label, lista, onChange, vazio = '—', dica, avisoPadrao }) {
  const ref = useRef(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    elemento.style.height = 'auto';
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [lista]);

  return (
    <div className="plano-campo-doc">
      <span className="plano-rotulo-doc">{label}</span>
      <textarea
        ref={ref}
        className="plano-area-doc"
        value={listaParaTexto(lista)}
        placeholder={vazio}
        onChange={(e) => onChange(textoParaLista(e.target.value))}
        rows={Math.min(8, Math.max(1, (lista || []).length))}
      />
      <small className="plano-dica-doc">{dica}</small>
      {avisoPadrao && <small className="plano-aviso-padrao">{avisoPadrao}</small>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function PlanoAulaScreen({ usuario }) {
  const [etapa, setEtapa] = useState('Anos Iniciais');
  const [componente, setComponente] = useState('');
  const [serie, setSerie] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [anoDoTecnico, setAnoDoTecnico] = useState(1);
  const [bimestre, setBimestre] = useState(1);
  const [bloco, setBloco] = useState(1);
  const [refinar, setRefinar] = useState(false);

  const [escopo, setEscopo] = useState(null);
  const [disciplinas, setDisciplinas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const ehTecnico = etapa === 'Ensino Tecnico';

  // ---- Catálogo de componentes e séries --------------------------------
  useEffect(() => {
    let cancelado = false;
    buscarEscopo(etapa)
      .then((dados) => {
        if (cancelado) return;
        setEscopo(dados);
      })
      .catch((erroCarregamento) => {
        if (!cancelado) setErro(erroCarregamento.message || 'Não foi possível ler o escopo-sequência.');
      });
    return () => {
      cancelado = true;
    };
  }, [etapa]);

  // Trocar de etapa invalida a série e o componente, que são específicos dela.
  useEffect(() => {
    setSerie('');
    setComponente('');
    setDisciplina('');
  }, [etapa]);

  const componentesDisponiveis = useMemo(() => {
    if (!escopo?.componentes) return [];
    return escopo.componentes.filter((c) => chave(c.etapa) === chave(etapa));
  }, [escopo, etapa]);

  // Componente escolhido, quando veio da lista de verdade.
  const componenteSelecionado = useMemo(
    () => componentesDisponiveis.find((c) => c.componente === componente) || null,
    [componentesDisponiveis, componente],
  );

  // ---- Séries que o professor pode escolher ------------------------------
  // Cada componente tem o seu próprio conjunto de séries, e ele nem sempre
  // coincide com o da etapa: nos Anos Finais, por exemplo, a planilha traz
  // "Ciências" só para o 1º ao 5º ano. Sem componente escolhido valem as séries
  // da etapa; com ele, valem as dele — assim a tela nunca oferece uma
  // combinação que sairia vazia.
  const seriesDisponiveis = useMemo(() => {
    const doComponente = (componenteSelecionado?.series || []).filter((s) => s !== 'Tecnico');
    if (doComponente.length) return doComponente;

    if (!escopo?.series) return [];
    const lista = escopo.series[etapa];
    if (Array.isArray(lista) && lista.length) return lista;
    return (escopo.series || []).filter((s) => s !== 'Tecnico');
  }, [escopo, etapa, componenteSelecionado]);

  useEffect(() => {
    if (!componenteSelecionado) return;
    const seriesDoComponente = (componenteSelecionado.series || []).filter((s) => s !== 'Tecnico');
    if (seriesDoComponente.length && !seriesDoComponente.includes(serie)) {
      setSerie(seriesDoComponente[0]);
    }
    const bimestresDoComponente = componenteSelecionado.bimestres || [];
    if (bimestresDoComponente.length && !bimestresDoComponente.includes(Number(bimestre))) {
      setBimestre(bimestresDoComponente[0]);
    }
  }, [componenteSelecionado, serie, bimestre]);

  // Componente digitado à mão não tem série pré-definida: oferece as séries da
  // etapa e escolhe a primeira para o formulário já ficar válido.
  useEffect(() => {
    if (ehTecnico || serie || componenteSelecionado) return;
    if (seriesDisponiveis.length) setSerie(seriesDisponiveis[0]);
  }, [ehTecnico, serie, componenteSelecionado, seriesDisponiveis]);

  // ---- Disciplinas do curso técnico -------------------------------------
  useEffect(() => {
    if (!ehTecnico || !componente) {
      setDisciplinas([]);
      return;
    }
    let cancelado = false;
    buscarDisciplinas({ etapa, componente, bimestre, anoDoTecnico })
      .then((dados) => {
        if (cancelado) return;
        const lista = dados.disciplinas || [];
        setDisciplinas(lista);
        if (lista.length && !lista.some((d) => d.nome === disciplina)) setDisciplina('');
      })
      .catch(() => {
        if (!cancelado) setDisciplinas([]);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehTecnico, componente, etapa, bimestre, anoDoTecnico]);

  // ---- Histórico de documentos já salvos --------------------------------
  async function recarregarHistorico() {
    try {
      const dados = await buscarPlanejamentos(usuario.userId);
      setHistorico((dados.planos || []).filter((p) => p.tipo === 'plano-aula-mensal'));
    } catch {
      // O histórico é acessório: se falhar, a tela segue utilizável.
    }
  }

  useEffect(() => {
    recarregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario.userId]);

  // Calendário letivo de 2026, vindo do back-end. É dele que saem as datas de
  // cada semana e a lista de blocos de cada bimestre.
  const calendario = escopo?.calendario || null;
  const bimestreDoCalendario = useMemo(
    () => (calendario?.bimestres || []).find((b) => b.bimestre === Number(bimestre)) || null,
    [calendario, bimestre],
  );
  const blocosDoBimestre = useMemo(() => bimestreDoCalendario?.blocos || SEM_BLOCOS, [
    bimestreDoCalendario,
  ]);

  // Ao trocar de bimestre, o bloco precisa existir nele.
  useEffect(() => {
    if (!blocosDoBimestre.length) return;
    if (!blocosDoBimestre.some((b) => b.id === Number(bloco))) setBloco(blocosDoBimestre[0].id);
  }, [blocosDoBimestre, bloco]);

  // Fora do Ensino Técnico a série é obrigatória: o escopo-sequência é
  // definido por ela. No técnico, o curso (componente) já identifica a turma.
  const formularioValido =
    componente.trim().length >= 2 && (ehTecnico || serie.trim().length >= 1) && !!bimestre;

  async function gerar(evento) {
    evento.preventDefault();
    if (!formularioValido || gerando) return;

    setErro('');
    setAviso('');
    setGerando(true);

    try {
      const resposta = await gerarPlanoAula({
        userId: usuario.userId,
        etapa,
        componente: componente.trim(),
        disciplina: ehTecnico ? disciplina : '',
        serie: serie.trim(),
        bimestre: Number(bimestre),
        bloco: Number(bloco),
        anoDoTecnico: ehTecnico ? Number(anoDoTecnico) : undefined,
        refinar,
        salvar: true,
      });

      setResultado(resposta);
      setDocumento(resposta.plano);
      setAviso(resposta.aviso || '');
      recarregarHistorico();
    } catch (erroGeracao) {
      setErro(erroGeracao.message || 'Não foi possível montar o plano de aula.');
    } finally {
      setGerando(false);
    }
  }

  // ---- Edição do documento ----------------------------------------------
  function alterarSecao(campo, valor) {
    setDocumento((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function alterarSemana(indice, campo, valor) {
    setDocumento((anterior) => ({
      ...anterior,
      semanas: anterior.semanas.map((semana, i) =>
        i === indice ? { ...semana, [campo]: valor } : semana,
      ),
    }));
  }

  function imprimir() {
    window.print();
  }

  const cabecalho = documento?.cabecalho;

  return (
    <div className="plano">
      {/* ---------------- Coluna 1: formulário ---------------- */}
      <aside className="plano-formulario">
        <div className="plano-form-cabecalho">
          <h2>Plano de aula mensal</h2>
          <p>
            Documento que a direção pedagógica recebe todo mês. O conteúdo vem das planilhas de
            escopo-sequência da escola.
          </p>
        </div>

        <form onSubmit={gerar} className="plano-form">
          <label className="plano-campo">
            <span>Etapa *</span>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
              {ETAPAS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="plano-campo">
            <span>Componente / disciplina *</span>
            <select
              value={componente}
              onChange={(e) => setComponente(e.target.value)}
            >
              <option value="">Selecione…</option>
              {componentesDisponiveis.map((c) => (
                <option key={c.id || c.componente} value={c.componente}>
                  {c.componente}
                </option>
              ))}
              {componente && !componentesDisponiveis.some((c) => c.componente === componente) && (
                <option value={componente}>{componente}</option>
              )}
            </select>
          </label>

          {ehTecnico ? (
            <>
              <label className="plano-campo">
                <span>Ano do curso</span>
                <select value={anoDoTecnico} onChange={(e) => setAnoDoTecnico(Number(e.target.value))}>
                  <option value={1}>1º ano</option>
                  <option value={2}>2º ano</option>
                </select>
              </label>

              <label className="plano-campo">
                <span>Disciplina do curso</span>
                <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)}>
                  <option value="">Todas as disciplinas</option>
                  {disciplinas.map((d) => (
                    <option key={d.nome} value={d.nome}>
                      {d.nome}
                    </option>
                  ))}
                </select>
                <small>
                  {disciplinas.length
                    ? 'Cada curso tem duas ou três disciplinas. Deixe em "todas" para ver o curso inteiro.'
                    : 'Selecione um componente para ver as disciplinas do curso.'}
                </small>
              </label>
            </>
          ) : (
            <label className="plano-campo">
              <span>Série / Ano *</span>
              <select value={serie} onChange={(e) => setSerie(e.target.value)}>
                <option value="">Selecione…</option>
                {seriesDisponiveis.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="plano-campo">
            <span>Bimestre *</span>
            <select value={bimestre} onChange={(e) => setBimestre(Number(e.target.value))}>
              {(componenteSelecionado?.bimestres?.length
                ? componenteSelecionado.bimestres
                : BIMESTRES.map((b) => b.valor)
              ).map((n) => (
                <option key={n} value={n}>
                  {`${n}º bimestre`}
                </option>
              ))}
            </select>
            {bimestreDoCalendario && (
              <small>
                {dataBr(bimestreDoCalendario.inicio)} a {dataBr(bimestreDoCalendario.termino)} ·{' '}
                {bimestreDoCalendario.semanas} semanas letivas
              </small>
            )}
          </label>

          <label className="plano-campo">
            <span>Período de semanas *</span>
            <select
              value={bloco}
              onChange={(e) => setBloco(Number(e.target.value))}
              disabled={!blocosDoBimestre.length}
            >
              {blocosDoBimestre.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.inicio
                    ? `${b.rotulo} — ${dataBr(b.inicio)} a ${dataBr(b.fim)}`
                    : b.rotulo}
                </option>
              ))}
            </select>
            <small>
              As datas vêm do calendário letivo de {calendario?.anoLetivo || 2026}. Depois de montar o
              documento, cada data continua editável caso a turma tenha aula em outro dia.
            </small>
          </label>

          {calendario && (
            <details className="plano-calendario">
              <summary>Calendário letivo de {calendario.anoLetivo}</summary>
              <table>
                <tbody>
                  {calendario.bimestres.map((b) => (
                    <tr key={b.bimestre} className={b.bimestre === Number(bimestre) ? 'ativo' : ''}>
                      <th scope="row">{`${b.bimestre}º bimestre`}</th>
                      <td>
                        {dataBr(b.inicio)} a {dataBr(b.termino)}
                      </td>
                      <td className="plano-calendario-semanas">{b.semanas} sem.</td>
                    </tr>
                  ))}
                  <tr className="plano-calendario-recesso">
                    <th scope="row">Recesso</th>
                    <td>
                      {dataBr(calendario.recesso.inicio)} a {dataBr(calendario.recesso.fim)}
                    </td>
                    <td className="plano-calendario-semanas">—</td>
                  </tr>
                </tbody>
              </table>
            </details>
          )}

          <label className="plano-opcao">
            <input type="checkbox" checked={refinar} onChange={(e) => setRefinar(e.target.checked)} />
            <span>
              <strong>Redigir com a IA</strong>
              <small>
                Reescreve metodologia, recuperação, recursos e flexibilização com base no conteúdo do
                período. Sem isso, saem do modelo padrão da escola.
              </small>
            </span>
          </label>

          {erro && <p className="plano-erro">{erro}</p>}
          {aviso && <p className="plano-aviso">{aviso}</p>}

          {gerando && (
            <p className="plano-espera">
              <strong>Montando o documento…</strong>
              <span>Lendo o escopo-sequência e distribuindo as aulas nas semanas do período.</span>
            </p>
          )}

          <button type="submit" className="plano-botao-gerar" disabled={!formularioValido || gerando}>
            {gerando ? 'Montando…' : '📄 Montar plano de aula'}
          </button>
        </form>

        {historico.length > 0 && (
          <div className="plano-historico">
            <h3>Documentos salvos</h3>
            <ul>
              {historico.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setResultado({ plano: item.documento, origem: 'documento salvo' });
                      setDocumento(item.documento);
                      setAviso('');
                    }}
                  >
                    {item.titulo}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* ---------------- Coluna 2: documento ---------------- */}
      <main className="plano-conteudo">
        {!documento ? (
          <div className="plano-vazio">
            <span className="plano-vazio-icone">📄</span>
            <p>
              Escolha a etapa, o componente, o bimestre e o período de semanas. O documento é montado
              com o conteúdo do escopo-sequência, pronto para revisar e imprimir.
            </p>
          </div>
        ) : (
          <>
            <header className="plano-doc-barra">
              <div>
                <strong>{resultado?.origem || 'escopo-sequência'}</strong>
                {documento._resumo?.semEscopo && (
                  <span className="plano-doc-selo">sem escopo-sequência</span>
                )}
              </div>
              <div className="plano-doc-acoes">
                <button type="button" className="plano-botao-secundario" onClick={() => setDocumento(null)}>
                  Fechar
                </button>
                <button type="button" className="plano-botao-imprimir" onClick={imprimir}>
                  🖨 Imprimir / Salvar PDF
                </button>
              </div>
            </header>

            <article className="plano-doc">
              <header className="plano-doc-capa">
                <h1>Plano de Aula</h1>
                <p className="plano-doc-sub">
                  {cabecalho.componente}
                  {cabecalho.disciplina ? ` — ${cabecalho.disciplina}` : ''}
                  {cabecalho.serie ? ` — ${cabecalho.serie}` : ''}
                </p>
              </header>

              <dl className="plano-doc-ident">
                <div>
                  <dt>Etapa</dt>
                  <dd>{cabecalho.etapa}</dd>
                </div>
                <div>
                  <dt>Bimestre</dt>
                  <dd>{cabecalho.bimestre}</dd>
                  {cabecalho.periodoBimestre && (
                    <small>{cabecalho.periodoBimestre.split(' a ').map(dataBr).join(' a ')}</small>
                  )}
                </div>
                <div>
                  <dt>Período</dt>
                  <dd>{cabecalho.bloco}</dd>
                  {documento.bloco?.inicio && (
                    <small>
                      {dataBr(documento.bloco.inicio)} a {dataBr(documento.bloco.fim)}
                    </small>
                  )}
                </div>
                <div>
                  <dt>Professor</dt>
                  <dd>{usuario.nome || usuario.userId}</dd>
                </div>
              </dl>

              <section className="plano-doc-secao">
                <h2>O que será ministrado nas semanas</h2>
                <table className="plano-doc-tabela">
                  <thead>
                    <tr>
                      <th>Semana do bimestre</th>
                      <th>Data inicial</th>
                      <th>Data final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documento.semanas.map((semana, i) => (
                      <tr key={semana.semana}>
                        <td className="plano-doc-semana">{semana.rotulo}</td>
                        <td>
                          <input
                            type="text"
                            className="plano-doc-data"
                            value={dataBr(semana.dataInicio)}
                            onChange={(e) => alterarSemana(i, 'dataInicio', dataIso(e.target.value))}
                            placeholder="dd/mm/aaaa"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="plano-doc-data"
                            value={dataBr(semana.dataFim)}
                            onChange={(e) => alterarSemana(i, 'dataFim', dataIso(e.target.value))}
                            placeholder="dd/mm/aaaa"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="plano-doc-secao">
                <h2>Conteúdo previsto no período</h2>
                <CampoLongo
                  label="Aulas"
                  lista={documento.oQueSeraMinistrado}
                  onChange={(v) => alterarSecao('oQueSeraMinistrado', v)}
                  vazio="Descreva os conteúdos a serem ministrados."
                  dica="Um item por linha."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Aprendizagens essenciais</h2>
                <CampoLongo
                  lista={documento.aprendizagensEssenciais}
                  onChange={(v) => alterarSecao('aprendizagensEssenciais', v)}
                  vazio="Informe as aprendizagens essenciais esperadas para o período."
                  dica="Um item por linha."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Competência técnica</h2>
                <CampoLongo
                  lista={documento.competenciaTecnica}
                  onChange={(v) => alterarSecao('competenciaTecnica', v)}
                  vazio="Preencha ou ajuste a competência técnica."
                  avisoPadrao={documento.competenciasDoEscopo ? null : DICA_COMPETENCIA_PADRAO}
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Competência socioemocional</h2>
                <CampoLongo
                  lista={documento.competenciaSocioemocional}
                  onChange={(v) => alterarSecao('competenciaSocioemocional', v)}
                  vazio="Preencha ou ajuste a competência socioemocional."
                  avisoPadrao={documento.competenciasDoEscopo ? null : DICA_COMPETENCIA_PADRAO}
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Habilidade (BNCC)</h2>
                <CampoLongo
                  lista={(documento.habilidades || []).map(
                    (h) => (h.codigo && h.texto ? `${h.codigo} — ${h.texto}` : h.codigo || h.texto),
                  )}
                  onChange={(v) => alterarSecao('habilidades', v.map((texto) => ({ codigo: '', texto })))}
                  vazio="Informe o código e o texto da habilidade."
                  dica="No formato: EF05MA11 — texto da habilidade."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Metodologias</h2>
                <CampoLongo
                  lista={documento.metodologias}
                  onChange={(v) => alterarSecao('metodologias', v)}
                  dica="De 4 a 6 itens."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Proposta de recuperação contínua</h2>
                <CampoLongo
                  lista={documento.recuperacaoContinua}
                  onChange={(v) => alterarSecao('recuperacaoContinua', v)}
                  dica="De 4 a 5 itens."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Material digital</h2>
                <CampoLongo
                  lista={documento.materialDigital}
                  onChange={(v) => alterarSecao('materialDigital', v)}
                  vazio="Informe os materiais e recursos digitais a serem utilizados."
                  dica="Um item por linha."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Material físico</h2>
                <CampoLongo
                  lista={documento.materialFisico}
                  onChange={(v) => alterarSecao('materialFisico', v)}
                  vazio="Informe os materiais físicos e impressos a serem utilizados."
                  dica="Um item por linha."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Recursos didáticos</h2>
                <CampoLongo
                  lista={documento.recursosDidaticos}
                  onChange={(v) => alterarSecao('recursosDidaticos', v)}
                  dica="De 4 a 6 itens."
                />
              </section>

              <section className="plano-doc-secao">
                <h2>Flexibilização curricular</h2>
                <CampoLongo
                  lista={documento.flexibilizacaoCurricular}
                  onChange={(v) => alterarSecao('flexibilizacaoCurricular', v)}
                  dica="No formato “Rótulo: descrição”."
                />
              </section>

              <footer className="plano-doc-assinatura">
                <div>
                  <span>Professor(a)</span>
                  <p>{usuario.nome || usuario.userId}</p>
                </div>
                <div>
                  <span>Coordenação pedagógica</span>
                  <p>&nbsp;</p>
                </div>
              </footer>
            </article>
          </>
        )}
      </main>
    </div>
  );
}
