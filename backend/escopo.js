// Leitura e normalizacao dos arquivos de Escopo-Sequencia 2026.
//
// Cada arquivo tem um rotulo de cabecalho diferente e, em geral, colunas
// diferentes. A ideia aqui e reduzir tudo para um unico formato de registro
// (ver `normalizarLinha`), para que a busca por componente/serie/bimestre
// funcione igual em qualquer planilha.
//
// A pasta base_de_dados fica na raiz do repositorio (um nivel acima do backend).

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const PASTA_PLANILHAS = process.env.PASTA_ESCOPO
  || path.join(__dirname, '..', 'base_de_dados');

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

const semAcento = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// Chave de comparacao: minusculo, sem acento, sem pontuacao e com espacos
// colapsados. Serve tanto para casar cabecalho quanto para filtrar na UI.
const chave = (texto) =>
  semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const limpo = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

// As planilhas usam bullets e quebras como separador de lista dentro da mesma
// celula. "- a - b - c" vira ["a","b","c"].
function paraLista(valor) {
  const texto = String(valor ?? '').replace(/\u200b|\u00a0/g, ' ').trim();
  if (!texto) return [];

  const partes = texto
    .split(/[•·▪]|\s-\s/)
    .map((p) => p.replace(/^[\s\-–—•]+/, '').trim())
    .filter((p) => p.length > 2);

  if (partes.length > 1) return partes;

  // Sem marcador explicito: quebra em ponto/semantola de frase completa.
  return texto
    .split(/;\s+/)
    .map((p) => p.trim().replace(/\.$/, ''))
    .filter((p) => p.length > 12);
}

// Quebra apenas por quebra de linha, preservando o separador " - " interno.
// Usado nas competencias, em que cada linha e um item completo
// ("Curiosidade - Ser interessado em ideias e ter paixao por aprender; ...").
function porLinha(valor) {
  return String(valor ?? '')
    .split(/[\r\n]+/)
    .map((parte) => parte.replace(/\s+/g, ' ').replace(/[;]\s*$/, '').trim())
    .filter(Boolean);
}

// Habilidades vem em 3 formatos: so com codigo ("EF05MA11"), so com texto, ou
// "codigo - texto" separado por hifen.
function separarHabilidade(valor) {
  const texto = limpo(valor).replace(/^[\s\-–—]+/, '');
  if (!texto || texto === '-') return { codigo: '', texto: '' };

  const achado = texto.match(/^([A-Z]{1,4}\d{2}[A-Z]{1,3}\d{0,4}[A-Z]?[*§]?)\s*[-–—]\s*(.+)$/);
  if (achado) return { codigo: achado[1], texto: achado[2].trim() };

  const soCodigo = texto.match(/^([A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}[A-Z]?[*§]?)$/);
  if (soCodigo) return { codigo: soCodigo[1], texto: '' };

  return { codigo: '', texto };
}

// Multiplas habilidades na mesma celula (ex.: "EF03CO08A EF06MA34", ou
// "EM13LGG102 EM13LGG302"). Devolve o texto combinado e a lista de codigos.
// O "final" opcional existe porque a escola marca com "*" a habilidade que
// pede ajuste curricular ("EF01GE12*").
function extrairCodigosHabilidade(valor) {
  const texto = String(valor ?? '');
  const achados = texto.match(/\b([A-Z]{2}\d{2}[A-Z]{1,3}\d{1,4}[A-Z]?[*§]?)/g) || [];
  return [...new Set(achados)];
}

// ---------------------------------------------------------------------------
// Dicionario de cabecalhos
// ---------------------------------------------------------------------------
// Alvos do rotulo canonico -> sinonimos aceitos nas planilhas. A comparacao
// usa `chave()`, entao "Competencias Socioemocionais" e a versao com acento
// caem no mesmo alvo.
const CABECALHOS = {
  bimestre: ['bimestre'],
  ano: ['ano', 'ano serie', 'serie', 'ano serie', 'ciclo', 'turma'],
  ciclo: ['ciclo'],
  aula: ['aula', 'aulas', 'aula unidade', 'aula sala'],
  semana: ['semana'],
  data: ['data'],
  titulo: ['titulo', 'titulo da aula', 'titulo gps semanal', 'tema da semana'],
  conteudo: ['conteudo', 'conteudos'],
  objetivos: ['objetivo', 'objetivos', 'objetivo da aula', 'objetivos da aula'],
  habilidade: ['habilidade', 'habilidades', 'habilidade texto', 'habilidades bncc texto'],
  habilidadeCodigo: [
    'habilidade codigo',
    'habilidades bncc codigo',
    'habilidade bncc codigo',
    'habilidades bncc computacao codigo',
    'habilidades bncc de diretrizes curriculares tecnologia e inovacao codigo',
  ],
  unidade: ['unidade tematica', 'unidade', 'unidade curricular', 'eixo'],
  objetoConhecimento: [
    'objeto de conhecimento',
    'objetos de conhecimento',
    'objeto do conhecimento',
    'objetos do conhecimento',
    'objeto de conhecimento macro',
    'objetos de conhecimento macro',
  ],
  competenciaTecnica: ['competencia tecnica', 'competencias tecnicas'],
  competenciaSocioemocional: [
    'competencia socioemocional',
    'competencias socioemocionais',
    'competencias socioemocional',
  ],
  habilidadeTecnica: ['habilidades tecnicas', 'habilidades tecnicas', 'habildades tecnicas'],
  habilidadeSocioemocional: [
    'habilidades socioemocionais',
    'habildades socioemocionais',
    'habilidades socioemocional',
  ],
  componenteNome: ['nome do componente', 'componente'],
  unidadeCodigo: ['codigo da unidade curricular', 'codigo unidade curricular'],
  componenteCodigo: ['codigo do componente', 'codigo componente'],
  chTeoricaPratica: ['ch teorica pratica', 'ch teorica pratica', 'ch teorical pratica'],
  cicloCol: ['ciclo'],
  descritivo: ['descritivo'],
  plataforma: ['plataforma'],
  eixo: ['eixo'],
  praticaLinguagem: ['pratica de linguagem', 'praticas de linguagem'],
  proposta: ['proposta'],
  generoTextual: ['genero textual'],
  eixoTematico: ['eixo tematico'],
  competenciasParametros: [
    'habilidades bncc parametros if texto',
    'habilidades bncc parametros if',
  ],
};

// Inverte o dicionario: rotulo canonico -> indice da coluna na planilha.
function mapearColunas(cabecalho) {
  const rotulos = cabecalho.map(chave);
  const mapa = {};

  for (const [alvo, sinonimos] of Object.entries(CABECALHOS)) {
    for (const s of sinonimos) {
      const i = rotulos.indexOf(chave(s));
      if (i >= 0) {
        mapa[alvo] = i;
        break;
      }
    }
  }
  return mapa;
}

// O cabecalho nao esta sempre na linha 1: a aba "AF - Tecnologia e Inovacao"
// tem linhas em branco antes. Procura a primeira linha com 3+ celulas
// preenchidas, olhando apenas as 12 primeiras.
function acharLinhaDoCabecalho(linhas) {
  const limite = Math.min(12, linhas.length);
  for (let i = 0; i < limite; i += 1) {
    if (linhas[i].filter((c) => String(c ?? '').trim() !== '').length >= 3) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Descricao dos arquivos e abas
// ---------------------------------------------------------------------------

// Siglas das abas do Ensino Tecnico -> nome legivel do curso. Vale para os
// dois anos do curso; as abas que so entram em um deles ficam em
// `ABAS_COMO_MATERIA`.
const CURSOS_TECNICOS = {
  ADM: 'Administracao',
  AGRO: 'Agronegocio',
  DADOS: 'Ciencia de Dados',
  SIS: 'Desenvolvimento de Sistemas',
  ENF: 'Enfermagem',
  FARM: 'Farmacia',
  HOSP: 'Hospitalidade',
  LOG: 'Logistica',
  AMB: 'Meio Ambiente',
  VENDAS: 'Vendas',
  ELET: 'Eletivas',
};

// Abas que nao sao curso: entram como materia dentro de um curso, e cada ano
// tem a sua. A carreira profissional abre o Desenvolvimento de Sistemas no 1º
// ano e o projeto interdisciplinar fecha o 2º.
const ABAS_COMO_MATERIA = {
  CCM: { 1: 'Desenvolvimento de Sistemas' },
  PMD: { 2: 'Desenvolvimento de Sistemas' },
};

// Como a planilha vira materia dentro do curso. Quase tudo ja vem com o nome
// certo na coluna "Nome do componente"; estas sao as excecoes.
const MATERIAS_TECNICAS = {
  // A aba CCM nao preenche "Nome do componente": sao unidades de carreira
  // profissional que formam uma materia so do 1º ano.
  CCM: { nome: 'Carreira e Competências para o Mercado de Trabalho' },
  // A planilha chama de "multidisciplinar"; o nome oficial do 2º ano e
  // "interdisciplinar".
  PMD: { de: 'Projeto Multidisciplinar', nome: 'Projeto Interdisciplinar' },
  // Consta da planilha, mas nao integra a grade oficial do 2º ano.
  SIS: { fora: ['Versionamento de Código e Sistemas de Mensageria'] },
};

// Ordem oficial das materias, para a lista nao sair ordenada por quantidade de
// aulas. O que nao estiver aqui vai para o fim, como antes.
const ORDEM_DAS_MATERIAS = {
  'Desenvolvimento de Sistemas': {
    1: [
      'Lógica e Linguagem de Programação',
      'Carreira e Competências para o Mercado de Trabalho',
      'Processos de Desenvolvimento de Software e Metodologias Ágeis',
      'Redes de Computadores e Segurança da Informação na Nuvem',
    ],
    2: [
      'Programação Front-End',
      'Programação Back-End',
      'Programação Mobile',
      'Inteligência Artificial',
      'Modelagem e Desenvolvimento de Banco de Dados',
      'Projeto Interdisciplinar',
    ],
  },
};

// Mesma tabela, com as chaves ja normalizadas para comparacao sem acento.
const ORDEM_POR_CURSO = Object.fromEntries(
  Object.entries(ORDEM_DAS_MATERIAS).map(([curso, porAno]) => [
    chave(curso),
    Object.fromEntries(
      Object.entries(porAno).map(([ano, nomes]) => [Number(ano), nomes.map(chave)]),
    ),
  ]),
);

/**
 * Curso de uma aba do Ensino Tecnico, ja considerando o ano do arquivo.
 *
 * A sigla sozinha nao resolve: uma aba pode ser curso nos dois anos, materia
 * de um curso so em um deles, ou nao existir na grade. `null` significa "aba
 * fora da grade deste ano" e a aba deve ser ignorada.
 */
function componenteDoTecnico(sigla, anoDoTecnico) {
  const comoMateria = ABAS_COMO_MATERIA[sigla];
  if (comoMateria) return comoMateria[anoDoTecnico] || comoMateria['*'] || null;
  return CURSOS_TECNICOS[sigla] || null;
}

/**
 * Ajusta a materia de uma linha do Ensino Tecnico pela tabela do curso.
 *
 * Devolve `null` quando a materia esta fora da grade do ano (a linha nao entra
 * no indice) e o rotulo oficial quando a planilha nao traz um nome aproveitavel.
 */
function ajustarMateriaDoTecnico(sigla, registro) {
  const regra = MATERIAS_TECNICAS[sigla];
  if (!regra) return registro;

  const nomeAtual = chave(registro.componenteNome);
  if (regra.fora?.some((nome) => chave(nome) === nomeAtual)) return null;
  if (regra.de && chave(regra.de) === nomeAtual) return { ...registro, componenteNome: regra.nome };
  if (!registro.componenteNome && regra.nome) return { ...registro, componenteNome: regra.nome };
  return registro;
}

// Sufixo que indica a mesma disciplina em outra planilha.
const SUFIXOS_REMOVIDOS = [
  /\s*-\s*remo\s*$/i,
  /\s*-\s*peI?\s*\d*\s*h?\s*$/i,
];

function limparNomeAba(nome) {
  let n = nome.trim();
  for (const padrao of SUFIXOS_REMOVIDOS) n = n.replace(padrao, '');
  return n.trim();
}

// Abas que nao descrevem escopo-sequencia utilizavel: versao antiga de 2025,
// graficos de apoio e abas em branco deixadas pela equipe. As duas ultimas tem
// "!ref" mas nenhuma celula de conteudo.
const ABAS_IGNORADAS = new Set([
  'lp 2025',
  'grafico',
  'planilha1',
  'planilha2',
  // Variacao parcial de "Tecnologia e Inovacao": a aba completa ja e lida, e
  // esta traria aulas duplicadas (1º e 2º bimestre) para o professor.
  'af tecnologia e inovacao remo',
]);

// O arquivo do Ensino Medio carrega copias de abas que sao do Anos Finais
// (prefixo "AF -"). Pertencem a outra etapa, entao nao entram no indice do EM.
function abaDeOutraEtapa(aba, etapaDoArquivoAtual) {
  return /^af\s*-/i.test(aba.trim()) && etapaDoArquivoAtual === 'Ensino Medio';
}

function etapaDoArquivo(arquivo) {
  if (/Anos Iniciais/i.test(arquivo) || /^AI\b/i.test(arquivo)) return 'Anos Iniciais';
  if (/Anos Finais/i.test(arquivo) || /^AF\b/i.test(arquivo)) return 'Anos Finais';
  if (/Ensino M[eé]dio/i.test(arquivo) || /^EM\b/i.test(arquivo)) return 'Ensino Medio';
  if (/Profissional/i.test(arquivo)) return 'Ensino Tecnico';
  return null;
}

const ETAPAS = ['Anos Iniciais', 'Anos Finais', 'Ensino Medio', 'Ensino Tecnico'];

// "Ensino Tecnico" e as duas planilhas (ANO1/ANO2). Para o professor basta
// uma materia, entao as duas sao fundidas no mesmo componente.
const ANO_DO_TECNICO = (arquivo) => (/ANO2/i.test(arquivo) ? 2 : 1);

// ---------------------------------------------------------------------------
// Normalizacao de uma linha
// ---------------------------------------------------------------------------

// Numero de ordem da aula dentro de (componente, ano, bimestre). Nem toda
// coluna "AULA" e sequencial 1..N: o Robótica traz "1 e 2", o Technology traz
// "1"/"2" e o Ed Profissional traz "Aula 1". `fallback` mantem a contagem
// para os casos sem numeracao utilizavel.
function numeroDaAula(valor, fallback) {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) return fallback;

  // "Aula 1", "Aula 12"
  const porRotulo = texto.match(/^aulas?\s*(\d+)/i);
  if (porRotulo) return Number(porRotulo[1]);

  // "1", "12", "1 e 2" -> primeiro numero
  const numeros = texto.match(/\d+/g);
  if (numeros?.length) return Number(numeros[0]);

  return fallback;
}

// Bimestre vem como "1º", "1°", "1º bimestre" ou "1". Fica sempre 1..4.
function numeroDoBimestre(valor) {
  const digitos = String(valor ?? '').match(/\d+/);
  const n = digitos ? Number(digitos[0]) : NaN;
  return n >= 1 && n <= 4 ? n : null;
}

// Serie/ano: "7º", "8º ano", "3ª série", "1º ano", "2". Fica no rotulo original
// normalizado para comparar com o que o usuario escolhe na tela.
// "7º", "7º ano", "1° ano", "3ª série", "2º Ano", "2º" e "1º ano" aparecem
// todos nas planilhas. Compara so o numero: assim "7º", "7º ano" e "7" sao a
// mesma serie, e o rotulo exibido na tela fica unico.
function normalizarSerie(valor) {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  const numero = texto.match(/^(\d{1,2})/)?.[1];
  if (!numero) return '';

  const n = Number(numero);
  if (n > 9) return `${n}ª série`;
  return `${n}º ano`;
}

// "02 a 06/02" -> ["2026-02-02","2026-02-06"] assumindo o ano corrente.
function periodoDaSemana(valor) {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) return null;

  const br = texto.match(/(\d{1,2})\s*(?:a|e|até)\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
  if (br) {
    const [, d1, d2, mes] = br;
    const ano = new Date().getFullYear();
    return [`${ano}-${String(mes).padStart(2, '0')}-${String(d1).padStart(2, '0')}`,
      `${ano}-${String(mes).padStart(2, '0')}-${String(d2).padStart(2, '0')}`];
  }

  const umDia = texto.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (umDia) {
    const ano = new Date().getFullYear();
    const d = `${ano}-${String(umDia[2]).padStart(2, '0')}-${String(umDia[1]).padStart(2, '0')}`;
    return [d, d];
  }
  return null;
}

function normalizarLinha(linha, mapa, contexto) {
  const cel = (alvo) => (mapa[alvo] !== undefined ? String(linha[mapa[alvo]] ?? '').trim() : '');

  const bimestre = numeroDoBimestre(cel('bimestre')) ?? contexto.bimestrePendente;
  if (!bimestre) return null;

  const habilidadeCrua = cel('habilidade') || cel('habilidadeTecnica');
  const hab = separarHabilidade(habilidadeCrua);

  const habilidadeTexto = hab.texto
    || (mapa.habilidadeTecnica !== undefined ? cel('habilidadeTecnica') : '')
    || '';

  const codigos = [
    ...extrairCodigosHabilidade(cel('habilidadeCodigo')),
    ...(hab.codigo ? [hab.codigo] : []),
    ...extrairCodigosHabilidade(habilidadeCrua),
  ];

  const dadosDaSemana = periodoDaSemana(cel('data'));

  return {
    fonte: contexto.fonte,
    etapa: contexto.etapa,
    anoDoTecnico: contexto.anoDoTecnico,
    aba: contexto.aba,
    componente: contexto.componente,
    componenteRotulo: contexto.componenteRotulo,
    bimestre,
    aula: numeroDaAula(cel('aula'), contexto.contador),
    aulaBruta: cel('aula'),
    semanaBruta: cel('semana'),
    semana: cel('semana') ? Number(String(cel('semana')).match(/\d+/)?.[0]) : null,
    dataInicio: dadosDaSemana ? dadosDaSemana[0] : null,
    dataFim: dadosDaSemana ? dadosDaSemana[1] : null,

    titulo: cel('titulo'),
    // No Ensino Tecnico a planilha nao tem ano/serie: o curso (aba) ja
    // identifica a turma. Usa um rotulo neutro para nao quebrar o filtro.
    serie: contexto.etapa === 'Ensino Tecnico' ? 'Tecnico' : normalizarSerie(cel('ano')),
    unidade: cel('unidade'),
    objetoConhecimento: cel('objetoConhecimento') || cel('eixo'),
    conteudo: paraLista(cel('conteudo')),
    objetivos: paraLista(cel('objetivos')),

    competenciaTecnica: porLinha(cel('competenciaTecnica')),
    competenciaSocioemocional: porLinha(cel('competenciaSocioemocional')),
    habilidadeSocioemocional: porLinha(cel('habilidadeSocioemocional')),

    habilidadeCodigos: [...new Set(codigos)],
    habilidadeTexto,

    componenteNome: cel('componenteNome'),
    ch: cel('chTeoricaPratica'),
    plataforma: cel('plataforma'),
    praticaLinguagem: cel('praticaLinguagem'),
    proposta: cel('proposta'),
    generoTextual: cel('generoTextual'),
    eixoTematico: cel('eixoTematico'),
  };
}

// ---------------------------------------------------------------------------
// Carga do arquivo inteiro
// ---------------------------------------------------------------------------

function carregarArquivo(nomeArquivo) {
  const caminho = path.join(PASTA_PLANILHAS, nomeArquivo);
  const wb = XLSX.readFile(caminho);
  const etapa = etapaDoArquivo(nomeArquivo);
  if (!etapa) return [];

  const registros = [];

  for (const aba of wb.SheetNames) {
    const planilha = wb.Sheets[aba];
    if (!planilha || !planilha['!ref']) continue;
    if (ABAS_IGNORADAS.has(chave(aba))) continue;
    if (abaDeOutraEtapa(aba, etapa)) continue;

    const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });
    const iCab = acharLinhaDoCabecalho(linhas);
    if (iCab < 0) continue;

    const mapa = mapearColunas(linhas[iCab]);
    // Sem nenhuma coluna util (p.ex.: "Gr?fico", "Planilha1"), pula a aba.
    if (mapa.bimestre === undefined && mapa.ano === undefined && mapa.titulo === undefined) continue;

    const ehTecnica = etapa === 'Ensino Tecnico';
    const sigla = limparNomeAba(aba).toUpperCase();
    const anoDoTecnico = ANO_DO_TECNICO(nomeArquivo);
    // No Tecnico quem diz o curso e a sigla mais o ano; nos demais segmentos
    // o componente e a propria aba.
    const componente = ehTecnica
      ? componenteDoTecnico(sigla, anoDoTecnico)
      : CURSOS_TECNICOS[sigla] || limparNomeAba(aba);
    // Aba fora da grade deste ano do curso.
    if (ehTecnica && !componente) continue;

    // Aulas "soltas" (fora de bimestre) herdam o bimestre da linha anterior:
    // a coluna as vezes vem vazia numa linha e preenchida na seguinte.
    let bimestrePendente = null;
    const contadorPorChave = new Map();
    let contador = 0;

    for (let i = iCab + 1; i < linhas.length; i += 1) {
      const linha = linhas[i];
      if (!linha || linha.filter((c) => String(c ?? '').trim() !== '').length <= 1) continue;

      const lida = normalizarLinha(linha, mapa, {
        fonte: nomeArquivo.replace(/\.xlsx$/i, ''),
        etapa,
        anoDoTecnico,
        aba,
        componente,
        componenteRotulo: componente,
        contador,
        bimestrePendente,
      });

      if (!lida) continue;
      // Materia fora da grade do ano nao entra no indice.
      const registro = ehTecnica ? ajustarMateriaDoTecnico(sigla, lida) : lida;
      if (!registro) continue;

      bimestrePendente = registro.bimestre;
      // "1 e 2" (duas aulas na mesma linha) conta como duas.
      const multiplas = String(registro.aulaBruta).match(/\be\b|\bà\b/i) ? 2 : 1;
      contador += multiplas;
      const chaveContagem = `${registro.serie}|${registro.bimestre}`;
      contadorPorChave.set(chaveContagem, (contadorPorChave.get(chaveContagem) || 0) + 1);
      registro.ordem = contadorPorChave.get(chaveContagem);

      if (ehTecnica) registro.anoDoTecnico = anoDoTecnico;

      registros.push(registro);
    }
  }
  return registros;
}

// ---------------------------------------------------------------------------
// Indice em memoria
// ---------------------------------------------------------------------------

let indice = null;

function construirIndice() {
  if (!fs.existsSync(PASTA_PLANILHAS)) {
    console.warn(`[Escopo] Pasta de planilhas nao encontrada: ${PASTA_PLANILHAS}`);
    return { registros: [], componentes: [], series: [] };
  }

  const arquivos = fs.readdirSync(PASTA_PLANILHAS).filter((f) => f.endsWith('.xlsx'));
  const registros = arquivos.flatMap(carregarArquivo);

  console.log(`[Escopo] ${registros.length} registros de ${arquivos.length} planilhas carregados.`);

  return {
    registros,
    componentes: montarComponentes(registros),
    series: montarSeries(registros),
  };
}

function obterIndice() {
  if (!indice) indice = construirIndice();
  return indice;
}

// Componentes regulares da Base Nacional Comum que complementam os itinerarios
const COMPONENTES_REGULARES = {
  'Anos Finais': [
    'Língua Portuguesa',
    'Matemática',
    'Ciências',
    'História',
    'Geografia',
    'Arte',
    'Educação Física',
    'Língua Inglesa',
  ],
  'Ensino Medio': [
    'Língua Portuguesa',
    'Matemática',
    'Física',
    'Química',
    'Biologia',
    'História',
    'Geografia',
    'Filosofia',
    'Sociologia',
    'Arte',
    'Educação Física',
    'Língua Inglesa',
  ],
};

// Componentes offered ao professor, agrupados por etapa. `series` e
// `bimestres` sao os valores realmente presentes, para a tela nao oferecer
// combinacoes inexistentes.
function montarComponentes(registros) {
  const mapa = new Map();

  for (const r of registros) {
    const id = `${r.etapa}|${r.componente}`;
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        etapa: r.etapa,
        componente: r.componente,
        abas: new Set(),
        series: new Set(),
        bimestres: new Set(),
        temSemana: false,
        temCompetencia: false,
      });
    }
    const item = mapa.get(id);
    item.abas.add(r.aba);
    if (r.serie) item.series.add(r.serie);
    item.bimestres.add(r.bimestre);
    if (r.semana) item.temSemana = true;
    if (r.competenciaTecnica.length) item.temCompetencia = true;
  }

  const seriesPadraoPorEtapa = {
    'Anos Finais': ['6º ano', '7º ano', '8º ano', '9º ano'],
    'Ensino Medio': ['1ª série', '2ª série', '3ª série'],
  };

  for (const [etapa, lista] of Object.entries(COMPONENTES_REGULARES)) {
    const seriesPadrao = seriesPadraoPorEtapa[etapa] || [];
    for (const nome of lista) {
      const id = `${etapa}|${nome}`;
      if (!mapa.has(id)) {
        mapa.set(id, {
          id,
          etapa,
          componente: nome,
          abas: new Set(),
          series: new Set(seriesPadrao),
          bimestres: new Set([1, 2, 3, 4]),
          temSemana: false,
          temCompetencia: false,
        });
      } else {
        const item = mapa.get(id);
        seriesPadrao.forEach((s) => item.series.add(s));
      }
    }
  }

  return ETAPAS.flatMap((etapa) =>
    [...mapa.values()]
      .filter((c) => c.etapa === etapa)
      .map((c) => ({
        id: c.id,
        etapa: c.etapa,
        componente: c.componente,
        abas: [...c.abas],
        series: [...c.series].sort(compararSeries),
        bimestres: [...c.bimestres].sort((a, b) => a - b),
        temSemana: c.temSemana,
        temCompetencia: c.temCompetencia,
      }))
      .sort((a, b) => a.componente.localeCompare(b.componente, 'pt-BR')),
  );
}

function montarSeries(registros) {
  const mapa = new Map();
  for (const r of registros) {
    if (!r.serie) continue;
    if (!mapa.has(r.etapa)) mapa.set(r.etapa, new Set());
    mapa.get(r.etapa).add(r.serie);
  }
  if (!mapa.has('Anos Finais')) mapa.set('Anos Finais', new Set());
  ['6º ano', '7º ano', '8º ano', '9º ano'].forEach((s) => mapa.get('Anos Finais').add(s));

  return Object.fromEntries(
    [...mapa.entries()].map(([etapa, set]) => [
      etapa,
      [...set].sort((a, b) => {
        const na = Number(String(a).match(/\d+/)?.[0] ?? 0);
        const nb = Number(String(b).match(/\d+/)?.[0] ?? 0);
        return na - nb || compararSeries(a, b);
      }),
    ]),
  );
}

function compararSeries(a, b) {
  const na = Number(String(a).match(/\d+/)?.[0] ?? 999);
  const nb = Number(String(b).match(/\d+/)?.[0] ?? 999);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), 'pt-BR');
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

function listarComponentes() {
  return obterIndice().componentes;
}

function listarSeries(etapa) {
  const todas = obterIndice().series;
  if (!etapa) {
    return [...new Set(Object.values(todas).flat())].sort(compararSeries);
  }
  // A etapa pode chegar da tela com acento ("Ensino Médio") e as chaves do
  // indice não têm, então a comparação é feita sem acento.
  const alvo = chave(etapa);
  const encontrada = Object.keys(todas).find((nome) => chave(nome) === alvo);
  return encontrada ? todas[encontrada] : [];
}

// Compara a serie da planilha ("7º", "7º ano", "7") com o que veio da tela
// ("7º ano"). Aceita as duas formas.
function mesmaSerie(daPlanilha, escolhida) {
  if (!escolhida) return true;
  const a = chave(daPlanilha);
  const b = chave(escolhida);
  if (!a) return true;
  if (a === b) return true;
  const na = a.match(/\d+/)?.[0];
  const nb = b.match(/\d+/)?.[0];
  return !!na && na === nb;
}

/**
 * Registros de um componente/serie/bimestre, ja ordenados por aula.
 *
 * No Ensino Tecnico, `componente` e o curso (Administracao, Logistica...) e a
 * aba traz ainda `componenteNome`, que e a disciplina de dentro do curso
 * (Introducao a Administracao, Matematica Aplicada...). Passando
 * `componenteNome` o filtro restringe a uma disciplina.
 */
function buscarAulas({ etapa, componente, componenteNome, serie, bimestre, anoDoTecnico }) {
  const alvo = chave(componente);
  const alvoNome = componenteNome ? chave(componenteNome) : null;
  // Aceita "Ensino Tecnico" e "Ensino Técnico" como a mesma etapa.
  const alvoEtapa = etapa ? chave(etapa) : null;

  return obterIndice()
    .registros.filter((r) => {
      if (alvoEtapa && chave(r.etapa) !== alvoEtapa) return false;
      if (chave(r.componente) !== alvo && chave(r.aba) !== alvo) return false;
      if (bimestre && r.bimestre !== Number(bimestre)) return false;
      if (!mesmaSerie(r.serie, serie)) return false;
      // Ensino Tecnico: ANO1 e ANO2 sao cursos diferentes, nao variantes.
      if (anoDoTecnico && r.anoDoTecnico !== Number(anoDoTecnico)) return false;
      if (alvoNome && chave(r.componenteNome) !== alvoNome) return false;
      return true;
    })
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.aula - b.aula);
}

/**
 * Disciplinas que existem dentro de um componente.
 *
 * No Ensino Tecnico um curso tem varias disciplinas e, um mesmo nome, pode
 * vir de mais de uma aba (a carreira profissional e o projeto interdisciplinar
 * entram no Desenvolvimento de Sistemas). Sem esta etapa o professor veria as
 * aulas de todas misturadas. Nos demais segmentos devolve vazio, porque la
 * componente e disciplina sao a mesma coisa.
 */
function listarDisciplinas({ etapa, componente, serie, bimestre, anoDoTecnico }) {
  const aulas = buscarAulas({ etapa, componente, serie, bimestre, anoDoTecnico });
  const mapa = new Map();

  for (const aula of aulas) {
    const nome = String(aula.componenteNome || '').trim();
    if (!nome) continue;
    if (!mapa.has(nome)) mapa.set(nome, { nome, linhas: 0, semanas: new Set() });
    const item = mapa.get(nome);
    item.linhas += 1;
    if (aula.semana) item.semanas.add(aula.semana);
  }

  return [...mapa.values()]
    .map((item) => ({
      nome: item.nome,
      linhas: item.linhas,
      semanas: [...item.semanas].sort((a, b) => a - b),
    }))
    .sort((a, b) => compararMaterias(a, b, componente, anoDoTecnico));
}

/**
 * Posicao da materia na grade oficial do ano do curso, ou `-1` quando ela nao
 * tem ordem definida (ou nao e do Ensino Tecnico) e deve ir para o fim.
 */
function posicaoNaGrade(componente, anoDoTecnico, nome) {
  const doAno = ORDEM_POR_CURSO[chave(componente)]?.[Number(anoDoTecnico)];
  if (!doAno) return -1;
  const i = doAno.indexOf(chave(nome));
  return i === -1 ? -1 : i;
}

function compararMaterias(a, b, componente, anoDoTecnico) {
  const pa = posicaoNaGrade(componente, anoDoTecnico, a.nome);
  const pb = posicaoNaGrade(componente, anoDoTecnico, b.nome);
  if (pa !== pb) {
    if (pa === -1) return 1;
    if (pb === -1) return -1;
    return pa - pb;
  }
  return b.linhas - a.linhas || a.nome.localeCompare(b.nome, 'pt-BR');
}

module.exports = {
  obterIndice,
  listarComponentes,
  listarSeries,
  listarDisciplinas,
  compararSeries,
  buscarAulas,
  CURSOS_TECNICOS,
  chave,
};
