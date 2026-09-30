// Montagem do "Plano de Aula" que a direcao pedagogica exige todo mes.
//
// A ideia central: o que a planilha escopo-sequencia tem de objective
// (conteudo, habilidade BNCC, datas e, no Ensino Tecnico, as competencias
// tecnica e socioemocional) entra sem passar pela IA. O que depende de
// interpretação pedagógica (metodologias, recuperacao continua, recursos e
// flexibilizacao) sai de padroes fixos e, quando ha cota, e refinado pela IA.
//
// O ano letivo e o calendário 2026 da rede: o primeiro bimestre comeca em
// fevereiro e o ultimo em outubro, com o recesso de julho entre o 2o e o 3o.
// As datas do documento sao calculadas daqui — o professor so precisa escolher
// bimestre e bloco.

const escopo = require('./escopo');

const ANO_LETIVO = 2026;

// Inicio de cada bimestre (primeira segunda-feira letiva) e quantas semanas ele
// tem. O recesso de 29/06 a 31/07 nao pertence a nenhum bimestre.
const CALENDARIO_LETIVO = [
  { bimestre: 1, inicio: '2026-02-02', semanas: 11, termino: '2026-04-17' },
  { bimestre: 2, inicio: '2026-04-20', semanas: 10, termino: '2026-06-26' },
  { bimestre: 3, inicio: '2026-08-03', semanas: 9, termino: '2026-10-02' },
  { bimestre: 4, inicio: '2026-10-05', semanas: 11, termino: '2026-12-18' },
];

const RECESSO = { inicio: '2026-06-29', fim: '2026-07-31' };

// Semana letiva em que cada bimestre comeca, contando desde 02/02/2026 sem
// descontar o recesso. E o numero usado pela coluna "Semana" das planilhas do
// Ensino Tecnico, e por isso o indice real do ano, nao a posicao no bimestre.
const SEMANA_INICIO_BIMESTRE = { 1: 1, 2: 12, 3: 27, 4: 36 };

function bimestreDoCalendario(numero) {
  return CALENDARIO_LETIVO.find((b) => b.bimestre === Number(numero)) || CALENDARIO_LETIVO[0];
}

function semanasDoBimestre(numero) {
  return bimestreDoCalendario(numero).semanas;
}

// O documento da direcao pede o periodo em blocos de 4 semanas. Como os
// bimestres do calendario nao sao todos multiplos de 4, o ultimo bloco aceita
// as semanas restantes e o rotulo mostra o intervalo real.
const SEMANAS_POR_BLOCO = 4;

function blocosDoBimestre(bimestre) {
  const total = semanasDoBimestre(bimestre);
  const blocos = [];

  let inicio = 1;
  while (inicio <= total) {
    let fim = Math.min(inicio + SEMANAS_POR_BLOCO - 1, total);
    // Um bloco de uma semana so nao serve num formulario em papel: essa semana
    // entra no bloco anterior, que passa a ter cinco.
    if (total - fim === 1) fim = total;

    blocos.push({
      id: blocos.length + 1,
      rotulo: `Semanas ${inicio} a ${fim}`,
      inicio,
      fim,
      // Posicao dentro do bimestre, que e como a coluna "Semana" da planilha
      // e lida depois de normalizada.
      relativaInicial: inicio,
      relativaFinal: fim,
    });
    inicio = fim + 1;
  }
  return blocos;
}
// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

// Cada semana letiva vai de segunda a sexta. `relativa` e a posicao da semana
// dentro do bimestre, contando a partir da segunda-feira de inicio dele.
function datasDoBimestre(bimestre, relativaInicial, relativaFinal) {
  const cal = bimestreDoCalendario(bimestre);
  const base = new Date(`${cal.inicio}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];

  const saida = [];
  for (let n = relativaInicial; n <= relativaFinal; n += 1) {
    const segunda = new Date(base);
    segunda.setDate(base.getDate() + (n - 1) * 7);
    const sexta = new Date(segunda);
    sexta.setDate(segunda.getDate() + 4);
    saida.push({
      semana: n,
      semanaDoAno: SEMANA_INICIO_BIMESTRE[cal.bimestre] + n - 1,
      inicio: paraIso(segunda),
      fim: paraIso(sexta),
    });
  }
  return saida;
}

// `toISOString` desloca o dia quando o fuso do servidor nao e UTC. Montar a
// data a partir dos campos locais evita o salto de um dia.
function paraIso(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
// Agrupamento por semana
// ---------------------------------------------------------------------------

// Agrupa as aulas do bimestre nas semanas do bloco escolhido.
//
// O Ensino Tecnico traz a coluna "Semana", mas a numeracao da escola nao segue
// um unico criterio: em Administracao o 4o bimestre comeca na semana 21, que
// ainda e a ultima do 3o, e em Enfermagem o 1o bimestre ja vai ate a semana 8.
// Como esse numero nao bate com nenhum calendario, ele e usado so como ordem
// dentro do proprio bimestre: a primeira semana do bimestre na planilha vira a
// semana 1, e as datas sao sempre as do calendario letivo de 2026.
//
// Nos Anos Iniciais, Finais e Medio nem existe essa coluna e a sequencia e so
// pelo numero da aula. Nesses casos as aulas do bimestre sao fatiadas em grupos
// do mesmo tamanho, para que cada semana do bloco reuna a mesma quantidade.
function agruparPorSemana(registros, bloco, bimestre) {
  const semanasDaPlanilha = registros
    .map((r) => Number(r.semana))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (semanasDaPlanilha.length) {
    const primeiraDoBimestre = Math.min(...semanasDaPlanilha);
    const mapa = new Map();
    for (const r of registros) {
      const semana = Number(r.semana);
      const relativa = Number.isFinite(semana) && semana > 0 ? semana - primeiraDoBimestre + 1 : 1;
      if (!mapa.has(relativa)) mapa.set(relativa, []);
      mapa.get(relativa).push(r);
    }
    return [...mapa.entries()]
      .filter(([relativa]) => relativa >= bloco.relativaInicial && relativa <= bloco.relativaFinal)
      .sort((a, b) => a[0] - b[0])
      .map(([relativa, aulas]) => ({ relativa, aulas }));
  }

  const total = registros.length;
  if (!total) return [];

  // Cada bimestre tem um numero de semanas proprio no calendario letivo, e e
  // por ele que as aulas sao fatiadas, para que cada semana do bloco reuna
  // sempre a mesma quantidade.
  const porSemana = Math.max(1, Math.round(total / semanasDoBimestre(bimestre)));
  const grupos = [];
  for (let relativa = bloco.relativaInicial; relativa <= bloco.relativaFinal; relativa += 1) {
    const de = (relativa - 1) * porSemana;
    if (de >= total) break;
    const ate = Math.min(relativa * porSemana, total);
    grupos.push({ relativa, aulas: registros.slice(de, ate) });
  }
  return grupos;
}

// ---------------------------------------------------------------------------
// Conteudo do bloco
// ---------------------------------------------------------------------------
// O Ensino Tecnico prefixa a coluna "Titulo da aula" com "Aula 3:".
// Placeholders que a planilha usa quando a célula está sem conteúdo real.
const SEM_CONTEUDO = /^[–—\-_.,;:*\s]+$/;

function tituloLimpo(texto) {
  if (texto == null) return '';
  const bruto = String(texto).trim();
  const limpo = bruto.replace(/^\s*Aulas?\s*\d+\s*[:.\-]\s*/i, '').trim();
  // "Aula 1:" sozinho, ou um "-" no lugar do texto: não há título a usar.
  if (!limpo || SEM_CONTEUDO.test(limpo)) return '';
  return limpo;
}

// O que entra na coluna "O que será ministrado". Algumas linhas do Ensino
// Técnico trazem a coluna "Título da aula" só com "-"; nesse caso o documento
// usa a unidade de ensino, que é o que a escola registrou.
function rotuloDaAula(aula) {
  const titulo = tituloLimpo(aula.titulo);
  if (titulo) return titulo;
  const unidade = tituloLimpo(aula.unidade);
  if (unidade) return unidade;
  const objetivo = (aula.objetivos || []).find((o) => o && !SEM_CONTEUDO.test(o.trim()));
  return objetivo ? objetivo.trim() : '';
}

// Algumas celulas da planilha trazem varios itens separados por quebra de
// linha dentro da propria celula (por exemplo as competências socioemocionais
// do Ensino Tecnico). Cada item vira uma linha do documento.
function dividirLinhas(valor) {
  return String(valor || '')
    .split(/[\r\n]+/)
    .map((parte) => parte.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Junta valores multi-célula em lista, sem repeticao e sem vazios.
function unicos(valores) {
  const vistos = new Set();
  const saida = [];
  for (const valor of valores) {
    for (const texto of dividirLinhas(valor)) {
      const chave = escopo.chave(texto);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(texto);
    }
  }
  return saida;
}

// Nas planilhas do Ensino Fundamental e Médio o texto da habilidade já vem
// com o código entre parênteses no começo, ex.: "(EF03MA12) Descrever e
// representar...". Como o documento mostra o código em coluna própria, esse
// prefixo é repetido e sai daqui.
function semCodigoRepetido(texto, codigo) {
  let saida = String(texto || '').trim();
  for (;;) {
    const semParentese = saida.replace(/^\(\s*[A-Z]{1,4}\d{2}[A-Z0-9]{0,5}\s*\)\s*[:.\-–—]?\s*/i, '');
    const semHifen = codigo ? saida.replace(new RegExp(`^${codigo}\\s*[-–—]\\s*`), '') : saida;
    const proximo = semParentese.length < saida.length ? semParentese
      : (semHifen.length < saida.length ? semHifen : saida);
    if (proximo === saida) return saida;
    saida = proximo;
  }
}

// Padrão do código de habilidade da BNCC: "(EF03MA12)", "(EM13LGG102)". Algumas
// células da escola marcam a habilidade com "*" (a que precisa de ajuste
// curricular), e esse sinal faz parte do código.
const CODIGO_HABILIDADE = /\(\s*([A-Z]{1,4}\d{2}[A-Z0-9]{0,6}[*§]?)\s*\)\s*[:.\-–—]?\s*/g;

// A célula de habilidade da planilha vem em dois formatos. No primeiro, o código
// de cada habilidade aparece no meio do texto:
//   "(EF03MA12) Descrever e representar... (EF04MA16A) Descrever deslocamentos..."
// e o texto precisa ser cortado no ponto em que o próximo código começa, senão as
// duas habilidades ficam coladas num item só.
function partesPorCodigoNoTexto(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return [];

  CODIGO_HABILIDADE.lastIndex = 0;
  const pedacos = bruto.split(CODIGO_HABILIDADE);
  if (pedacos.length < 3) return null;

  const saida = [];
  const antes = pedacos[0].trim();
  if (antes) saida.push({ codigo: '', texto: antes });
  for (let i = 1; i + 1 < pedacos.length; i += 2) {
    const corpo = pedacos[i + 1].replace(/\s+/g, ' ').trim();
    if (corpo) saida.push({ codigo: pedacos[i].trim(), texto: corpo });
  }
  return saida;
}

// No segundo formato a coluna de texto traz só as descrições, separadas por
// marcador ("• ..."), e os códigos estão numa coluna ao lado, na mesma ordem.
function partesPorLista(texto) {
  return String(texto || '')
    .split(/[•·]|\r\n+/)
    .map((parte) => parte.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Junta as habilidades do bloco, casando cada código com o texto que vem logo
// depois dele. A mesma habilidade pode aparecer em várias aulas do período: o
// primeiro texto encontrado é o que vale. Código sem texto não entra na lista,
// porque no documento uma linha só com o código não diz nada ao professor.
function coletarHabilidades(grupos) {
  const porCodigo = new Map();
  const semCodigo = new Map();
  let ordem = 0;

  const guardar = (codigo, texto) => {
    if (!texto) return;
    ordem += 1;
    const alvo = codigo ? porCodigo : semCodigo;
    if (!alvo.has(codigo)) alvo.set(codigo, { texto, ordem });
  };

  for (const { aulas } of grupos) {
    for (const aula of aulas) {
      const codigos = (aula.habilidadeCodigos || []).filter(Boolean);

      const comMarcador = partesPorCodigoNoTexto(aula.habilidadeTexto);
      if (comMarcador) {
        for (const parte of comMarcador) guardar(parte.codigo, parte.texto);
        continue;
      }

      const partes = partesPorLista(aula.habilidadeTexto);
      if (!partes.length) continue;

      // Uma parte por código, na mesma ordem: o pareamento é direto.
      if (codigos.length && codigos.length === partes.length) {
        partes.forEach((texto, i) => guardar(codigos[i], texto));
        continue;
      }

      // Um único código com várias partes: o texto é da habilidade, e ele é
      // repetido para não perder nenhuma das partes listadas.
      if (codigos.length === 1) {
        for (const texto of partes) guardar(codigos[0], texto);
        continue;
      }

      // Sem forma de casar com segurança: o texto entra sem código, e a
      // direção lê a descrição, que é o que importa.
      for (const texto of partes) guardar('', texto);
    }
  }

  const lista = [...porCodigo.entries()]
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([codigo, { texto }]) => ({ codigo, texto: semCodigoRepetido(texto, codigo) }));

  for (const { texto } of [...semCodigo.values()].sort((a, b) => a.ordem - b.ordem)) {
    lista.push({ codigo: '', texto: semCodigoRepetido(texto) });
  }
  return lista;
}
// A planilha separa o nome da competência da descrição com hífen
// ("Curiosidade - Ser interessado em..."). No documento impresso o travessão lê
// melhor e é o mesmo separador usado nos padrões de reserva.
function separadorLongo(texto) {
  return String(texto).replace(/\s+-\s+/, ' — ');
}

function montarConteudo({ registros, bloco, bimestre, datas }) {
  const grupos = agruparPorSemana(registros, bloco, bimestre);

  // A tabela do documento numera a semana dentro do bimestre ("Semana 1" a
  // "Semana 4"), que é como a direção lê. O índice do ano letivo fica guardado
  // para conferência, mas não aparece no papel.
  const semanas = grupos.map(({ relativa, aulas }) => {
    const data = datas.find((d) => d.semana === relativa);
    return {
      semana: relativa,
      semanaDoAnoLetivo: data?.semanaDoAno ?? null,
      rotulo: `Semana ${relativa}`,
      dataInicio: data?.inicio || null,
      dataFim: data?.fim || null,
      aulas: aulas.map((a) => ({
        numero: a.aula,
        titulo: rotuloDaAula(a),
        objetivos: a.objetivos,
      })),
    };
  });

  return {
    semanas,
    oQueSeraMinistrado: unicos(grupos.flatMap((g) => g.aulas.map((a) => rotuloDaAula(a)))),
    habilidades: coletarHabilidades(grupos),
    competenciaTecnica: unicos(grupos.flatMap((g) => g.aulas.flatMap((a) => a.competenciaTecnica))),
    competenciaSocioemocional: unicos(
      grupos.flatMap((g) => g.aulas.flatMap((a) => a.competenciaSocioemocional)),
    ).map(separadorLongo),
    unidades: unicos(grupos.flatMap((g) => g.aulas.map((a) => a.unidade))),
    objetivos: unicos(grupos.flatMap((g) => g.aulas.flatMap((a) => a.objetivos))),
    totalAulas: grupos.reduce((soma, g) => soma + g.aulas.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Campos que dependem de interpretação pedagógica
// ---------------------------------------------------------------------------
// São padrões de reserva: garantem que o documento sai completo mesmo sem cota
// do Gemini. Com cota disponível, a IA reescreve os quatro campos a partir do
// conteudo real do bloco.

// Só o Ensino Técnico tem as colunas "Competência Técnica" e "Competências
// Socioemocionais" na planilha. Nos demais segmentos o documento ainda exige
// os dois campos, então entram formulações da Base Nacional Comum. São padrões
// de reserva: se a planilha tiver o dado, quem manda é ela.
const COMPETENCIAS_TECNICAS_PADRAO = [
  'Aplicar os fundamentos teóricos da disciplina na resolução de problemas concretos do mundo do trabalho e do cotidiano.',
  'Analisar dados e informações do setor, reconhecendo tendências e tomando decisões fundamentadas.',
  'Utilizar recursos e tecnologias de forma crítica, ética e segura no exercício profissional.',
  'Atuar de forma colaborativa, comunicando resultados e respeitando as normas de segurança e de convivência profissional.',
  'Reconhecer as próprias lacunas de aprendizagem e buscar formação para superá-las.',
];
const COMPETENCIAS_SOCIOEMOCIONAIS_PADRAO = [
  'Empatia — Compreender e preocupar-se com os outros e com o seu bem-estar, valorizando o relacionamento próximo.',
  'Colaboração — Trabalhar em equipe, assumindo responsabilidades e distribuindo tarefas de forma justa.',
  'Persistência — Ser capaz de perseverar nas tarefas até concluir o que foi proposto.',
  'Autoeficácia — Confiar na própria capacidade de aprender, executar tarefas e atingir objetivos.',
  'Curiosidade — Demonstrar interesse por ideias e por aprender, explorando novas abordagens.',
];

const METODOLOGIAS_POR_AREA = [
  {
    area: 'Matemática e tecnologia',
    teste: /matematica|estatistica|logica|algoritmo|programacao|sistemas|desenvolvimento/,
    lista: [
      'Resolução de problemas com método heurístico',
      'Modelagem matemática de fenômenos reais',
      'Estudo de caso com situações do cotidiano',
      'Atividade prática com software de cálculo e planilhas',
    ],
  },
  {
    area: 'Linguagens',
    teste: /lingua portuguesa|portugues|redacao|leitura|inglesa/,
    lista: [
      'Oficina de produção textual com leitura compartilhada',
      'Análise de gêneros textuais e práticas de linguagem',
      'Rodada de conversa e produção colaborativa',
      'Sequência didática com portfólio de textos',
    ],
  },
  {
    area: 'Natureza',
    teste: /ciencias|quimica|biologia|fisica|praticas experimentais/,
    lista: [
      'Aulas experimentais e investigativas',
      'Análise de dados e elaboração de relatórios',
      'Estudo de caso de fenomenos do cotidiano',
      'Demonstrações e modelos manipuláveis',
    ],
  },
  {
    area: 'Humanas',
    teste: /geografia|historia|atualidades|sociologia|filosofia/,
    lista: [
      'Aulas dialogadas com análise de fontes',
      'Mapeamento e leitura de fenômenos socioambientais',
      'Seminários e apresentações orais',
      'Estudo de caso de situacoes do cotidiano',
    ],
  },
  {
    area: 'Artes',
    teste: /arte|musica|danca|midias/,
    lista: [
      'Aulas práticas de produção artística',
      'Apreciação e análise de obras e manifestações culturais',
      'Oficinas de criação coletiva',
      'Apresentações e mostras de produção',
    ],
  },
  {
    area: 'Corpo e movimento',
    teste: /educacao fisica|esporte|jogo/,
    lista: [
      'Aulas práticas com vivência corporal',
      'Brincadeiras e jogos cooperativos',
      'Iniciação esportiva com análise de movimento',
      'Avaliação processual com registro de evolução',
    ],
  },
  {
    area: 'Projetos e tecnologia',
    teste: /tecnologia|informatica|robotica|educacao financeira|empreendedorismo|projeto de vida|convivencia|cidadania|eletiva|administracao|logistica|enfermagem|farmacia|hospitalidade|agronegocio|meio ambiente|vendas|musical/,
    lista: [
      'Projetos práticos com entrega de artefato',
      'Estudo de caso aplicado ao mundo do trabalho',
      'Oficinas de letramento digital',
      'Trabalho colaborativo com avaliação por pares',
    ],
  },
];

const METODOLOGIAS_GERAIS = [
  'Aulas dialogadas e expositivas participativas',
  'Estudo de caso com análise de situações reais',
  'Atividades em grupo com registro e socialização',
  'Avaliação formativa contínua com devolutiva aos estudantes',
];

// Escolhe o conjunto de metodologias coerente com o componente. Complementa com
// itens gerais ate ter ao menos cinco, que e o minimo do formulario.
function metodologiasPara(componente) {
  const alvo = escopo.chave(componente);
  const perfil = METODOLOGIAS_POR_AREA.find((p) => p.teste.test(alvo));
  const lista = perfil ? [...perfil.lista] : [...METODOLOGIAS_GERAIS];
  for (const geral of METODOLOGIAS_GERAIS) {
    if (lista.length >= 5) break;
    if (!lista.includes(geral)) lista.push(geral);
  }
  return lista;
}

const RECUPERACAO_CONTINUA = [
  'Avaliação diagnóstica no início de cada semana para identificar lacunas de aprendizagem.',
  'Retomada dirigida em grupos de apoio durante as aulas, com material de nivelamento.',
  'Atividades de reensino com material visual e manipulável para os casos de dificuldade.',
  'Reavaliação contínua ao fim de cada semana: o que não for alcançado retorna na semana seguinte.',
  'Portfólio de evidências para acompanhar a progressão e orientar a recuperação.',
];

function recursosDidaticos(unidades) {
  const lista = [
    'Livro didático e material de apoio do componente',
    'Quadro branco, projetor e computador com acesso à internet',
    'Plataformas digitais de apoio (OBMEP, Khan Academy, Among Us Classroom)',
    'Impressos, fichas de atividade e materiais manipuláveis',
  ];
  if (unidades.length) {
    lista.push(`Recursos específicos para: ${unidades.slice(0, 3).join(', ')}`);
  }
  return lista;
}

const FLEXIBILIZACAO_CURRICULAR = [
  'Adequação de ritmo e temporalidade conforme o desempenho da turma, sem perda de conteúdo.',
  'Adaptação de atividades e materiais conforme as necessidades específicas de cada estudante, incluindo deficiência intelectual, TDAH, TEA e altas habilidades.',
  'Organização flexível do agrupamento em duplas, trios ou individual, conforme o perfil de aprendizagem.',
  'Meios de avaliação diversificados, como produção oral, portfólio e demonstração, valorizando o desempenho em vez do tempo de prova.',
];

// ---------------------------------------------------------------------------
// Documento completo
// ---------------------------------------------------------------------------

/**
 * Monta o documento do plano de aula.
 *
 * @param {object} opcoes
 * @param {string} opcoes.etapa         Anos Iniciais | Anos Finais | Ensino Medio | Ensino Tecnico
 * @param {string} opcoes.componente    Componente (fora do Tecnico) ou curso (no Tecnico)
 * @param {string} [opcoes.disciplina]  Disciplina dentro do curso, so no Tecnico
 * @param {string} [opcoes.serie]       Serie/ano; obrigatoria fora do Tecnico
 * @param {number} opcoes.bimestre      1 a 4
 * @param {number} [opcoes.blocoId]     1 (semanas 1-4) ou 2 (semanas 5-8)
 * @param {number} [opcoes.anoDoTecnico] 1 ou 2, para o Ensino Tecnico
 */
function montarPlanoDeAula({
  etapa,
  componente,
  disciplina,
  serie,
  bimestre,
  blocoId,
  anoDoTecnico,
}) {
  const blocos = blocosDoBimestre(bimestre);
  const bloco = blocos.find((b) => b.id === Number(blocoId)) || blocos[0];
  const cal = bimestreDoCalendario(bimestre);

  const registros = componente
    ? escopo.buscarAulas({ etapa, componente, componenteNome: disciplina, serie, bimestre, anoDoTecnico })
    : [];

  const datas = datasDoBimestre(bimestre, bloco.relativaInicial, bloco.relativaFinal);
  const conteudo = montarConteudo({ registros, bloco, bimestre, datas });

  // Sem escopo-sequencia para a combinacao escolhida (componente digitado a mao
  // ou serie sem aulas no bimestre): o documento ainda mostra o calendario das
  // semanas do bloco, com as datas, e deixa o conteudo para o professor.
  const semEscopo = conteudo.totalAulas === 0;
  const semanas = semEscopo
    ? datas.map((d) => ({
      semana: d.semana,
      semanaDoAnoLetivo: d.semanaDoAno,
      rotulo: `Semana ${d.semana}`,
      dataInicio: d.inicio,
      dataFim: d.fim,
      aulas: [],
    }))
    : conteudo.semanas;

  return {
    cabecalho: {
      etapa,
      componente: componente || '',
      disciplina: disciplina || null,
      serie: etapa === 'Ensino Tecnico' ? null : serie || null,
      bimestre: `${bimestre}º bimestre`,
      bloco: bloco.rotulo,
      anoLetivo: ANO_LETIVO,
      // Período letivo do bimestre, para o professor conferir de relance.
      periodoBimestre: `${cal.inicio} a ${cal.termino}`,
    },
    bloco: datas.length
      ? {
        rotulo: bloco.rotulo,
        inicio: datas[0].inicio,
        fim: datas[datas.length - 1].fim,
        semanaInicialDoBimestre: bloco.relativaInicial,
        semanaFinalDoBimestre: bloco.relativaFinal,
      }
      : null,
    semanas,
    oQueSeraMinistrado: conteudo.oQueSeraMinistrado,
    // A planilha do Ensino Técnico é a única com essas colunas. Nos demais
    // segmentos o campo sai com o padrão da Base Nacional Comum, para o
    // documento nunca ir à direção com um campo em branco.
    competenciaTecnica: conteudo.competenciaTecnica.length
      ? conteudo.competenciaTecnica
      : [...COMPETENCIAS_TECNICAS_PADRAO],
    competenciaSocioemocional: conteudo.competenciaSocioemocional.length
      ? conteudo.competenciaSocioemocional
      : [...COMPETENCIAS_SOCIOEMOCIONAIS_PADRAO],
    competenciasDoEscopo: conteudo.competenciaTecnica.length > 0,
    habilidades: conteudo.habilidades,
    metodologias: metodologiasPara(componente),
    recuperacaoContinua: RECUPERACAO_CONTINUA,
    recursosDidaticos: recursosDidaticos(conteudo.unidades),
    flexibilizacaoCurricular: FLEXIBILIZACAO_CURRICULAR,

    // Campos internos: orientam a tela e o refinamento por IA.
    _resumo: {
      totalAulas: conteudo.totalAulas,
      unidades: conteudo.unidades,
      objetivos: conteudo.objetivos,
      semEscopo,
    },
  };
}

module.exports = {
  montarPlanoDeAula,
  blocosDoBimestre,
  datasDoBimestre,
  bimestreDoCalendario,
  semanasDoBimestre,
  CALENDARIO_LETIVO,
  RECESSO,
  ANO_LETIVO,
  SEMANA_INICIO_BIMESTRE,
};
