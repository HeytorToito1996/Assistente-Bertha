/*
 * ============================================================================
 *  ASSISTENTE VIRTUAL ESCOLAR — BACK-END (API REST)
 * ----------------------------------------------------------------------------
 *  Stack: Express 5 + Firebase Admin SDK (Firestore) + Google Gemini (@google/genai)
 *
 *  COMO CONFIGURAR / RODAR:
 *   1. Renomeie ".env.example" para ".env" e preencha:
 *        - GEMINI_API_KEY                  -> chave criada em https://aistudio.google.com/apikey
 *        - FIREBASE_SERVICE_ACCOUNT_PATH   -> caminho do JSON da conta de serviço do Firebase
 *   2. Salve o JSON da conta de serviço na raiz do projeto (ex.: service-account-key.json)
 *   3. Instale as dependências: npm install
 *   4. Inicie o servidor:                 npm start   (ou npm run dev)
 *
 *  OBSERVAÇÃO: Nenhum arquivo é salvo em disco. Arquivos enviados pelo
 *  front-end chegam como String Base64 no corpo do JSON (em memória) e são
 *  injetados no Gemini via "inlineData" ou convertidos para texto na hora.
 *  Formatos suportados: CSV, XLSX/XLS, TXT, HTML, Markdown, PDF e Word
 *  (.docx/.doc). Envolva a API como na documentação "docs/exemplo-consumo.html".
 * ============================================================================
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
} = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const mammoth = require('mammoth'); // converte .docx (Word) para texto
const WordExtractor = require('word-extractor'); // converte .doc (Word legado) para texto
const XLSX = require('xlsx'); // converte .xlsx/.xls (Excel) para CSV/texto
const escopo = require('./escopo'); // le os arquivos de Escopo-Sequencia 2026
const planoAula = require('./plano-aula');

// ============================================================================
//  CONFIGURAÇÕES GERAIS
// ============================================================================
const PORT = Number(process.env.PORT || 3000);
// No plano gratuito a demanda pelos modelos mais novos (3.6/3.7/3.8) satura com
// frequência e o Gemini responde 503 "high demand". Por isso o padrão da fila é
// começar pelos modelos Flash 3.5, que respondem de forma estável, e só depois
// tentar os mais novos. Ajuste via GEMINI_MODEL / GEMINI_MODEL_FALLBACKS no ".env".
// Consulte os modelos disponíveis da sua conta em https://ai.google.dev/gemini-api/docs/models
const MODELO_GEMINI = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Fila de modelos alternativos usada quando o principal estiver cheio/indisponível.
const FALLBACKS_PADRAO = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
];
const MAX_HISTORICO = 10; // últimas N mensagens recuperadas do Firestore
const CARGOS_VALIDOS = ['aluno', 'secretaria', 'professor', 'direcao'];
const CARGOS_PLANEJAMENTO = ['professor']; // perfis autorizados a planejar aulas
const DURACAO_AULA_PADRAO_MIN = 50; // duração padrão de uma aula, em minutos
const MAX_AULAS_POR_PLANO = 40; // limite de segurança contra abuso/custo de tokens
const MAX_PLANOS_NO_CONTEXTO = 3; // quantos planos vão para o contexto do chat

const app = express();

// ============================================================================
//  MIDDLEWARES
// ============================================================================
app.use(cors()); // libera requisições de qualquer origem (HTML/JS puro no navegador)
app.use(express.json({ limit: '50mb' })); // aceita payloads grandes (Base64 de planilhas/PDFs)

// ============================================================================
//  FIREBASE ADMIN SDK (Firestore — plano Spark/gratuito)
// ============================================================================
function inicializarFirebase() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const caminhoCredencial = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const caminhoAbsoluto = caminhoCredencial ? path.resolve(__dirname, caminhoCredencial) : null;

  if (caminhoAbsoluto && !fs.existsSync(caminhoAbsoluto)) {
    console.error(
      `\n[ERRO FATAL] Arquivo de credencial do Firebase não encontrado em:\n  "${caminhoAbsoluto}"\n` +
        'Confira a variável FIREBASE_SERVICE_ACCOUNT_PATH no arquivo ".env" e ' +
        'o nome do arquivo JSON baixado do Firebase (ex.: service-account-key.json).\n'
    );
    process.exit(1);
  }

  if (caminhoAbsoluto && fs.existsSync(caminhoAbsoluto)) {
    const credencial = JSON.parse(fs.readFileSync(caminhoAbsoluto, 'utf8'));
    initializeApp({ credential: cert(credencial) });
    console.log('[Firebase] Credencial da conta de serviço carregada de:', caminhoAbsoluto);
  } else {
    // Alternativa para deploys gerenciados (ex.: Cloud Run) via GOOGLE_APPLICATION_CREDENTIALS
    console.warn(
      '[Firebase] FIREBASE_SERVICE_ACCOUNT_PATH ausente ou arquivo não encontrado. ' +
        'Tentando credenciais padrão do ambiente (GOOGLE_APPLICATION_CREDENTIALS)...'
    );
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || undefined,
    });
  }

  return getFirestore();
}

const db = inicializarFirebase();

// ============================================================================
//  GOOGLE GEMINI (@google/genai)
// ============================================================================
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error(
    '\n[ERRO FATAL] Variável GEMINI_API_KEY não configurada.\n' +
      '1) Renomeie o arquivo ".env.example" para ".env"\n' +
      '2) Crie sua chave gratuita em https://aistudio.google.com/apikey\n' +
      '3) Cole-a na variável GEMINI_API_KEY do arquivo ".env"\n'
  );
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// ============================================================================
//  PERSONALIDADES DO ASSISTENTE (systemInstruction dinâmico por cargo)
// ============================================================================
const SISTEMA_TUTOR_ALUNO = `
Você é o "Assistente Virtual Escolar" e, neste atendimento, desempenha o papel de
TUTOR ACADÊMICO PEDAGÓGICO de um ALUNO. Seu objetivo é apoiar o estudante em
dúvidas de conteúdo escolar de forma didática, respeitosa e motivadora.

REGRAS DE OURO (obrigatórias):
1. NUNCA forneça a resposta pronta de exercícios, provas, listas ou tarefas.
   Em vez disso, guie o aluno com perguntas didáticas (método socrático),
   exemplos e pistas para que ele próprio construa o raciocínio e chegue à solução.
2. Divida problemas complexos em partes menores e valide o raciocínio que o aluno
   já apresentar antes de avançar para o próximo passo.
3. Explique conceitos com linguagem acessível, use analogias do cotidiano e,
   quando útil, crie novos exercícios semelhantes para treino.
4. Adapte sua abordagem à série e ao nível de conhecimento do aluno
   (ex.: Ensino Fundamental, Ensino Médio, EJA ou disciplina específica).
5. Ao final, sempre que apropriado, proponha um próximo passo de estudo ou uma
   pergunta para reflexão.
6. Responda sempre em português brasileiro.
`;

const SISTEMA_ANALISTA_GESTAO = (cargo) => `
Você é o "Assistente Virtual Escolar" e, neste atendimento, desempenha o papel de
ANALISTA DE ROTINAS INSTITUCIONAIS e DE GESTÃO ESCOLAR. Você atende a Secretaria
e a Direção no suporte a tarefas burocráticas e administrativas.

SUAS ATRIBUIÇÕES PRINCIPAIS:
- Analisar rotinas burocráticas: matrícula, transferências, declarações,
  comunicações oficiais e demais documentos internos da escola.
- Interpretar ementas de disciplinas, conteúdos programáticos e o regimento escolar.
- Analisar planilhas de frequência/assiduidade de alunos (geralmente enviadas em
  CSV), identificando padrões de presença e falta, calculando percentuais e
  produzindo relatórios conceituais TEXTUAIS.
- Auxiliar na redação de relatórios, ofícios, memorandos e comunicações internas.

LIMITES DE CONFORMIDADE (LGPD):
- NUNCA consulte, solicite, gere ou armazene dados de NOTAS ou BOLETINS
  acadêmicos dos alunos. Se solicitado, recuse educadamente e informe que o
  assistente trata apenas de dados de frequência/assiduidade, documentos
  internos e relatórios conceituais.
- NUNCA exponha dados pessoais sensíveis de alunos além do estritamente
  necessário para o contexto institucional da escola.

CONTEXTO ESPECÍFICO DO CARGO ATUAL:
${
  cargo === 'secretaria'
    ? '- Foco em rotinas burocráticas da secretaria, regimento escolar, geração\n' +
      '  e revisão de documentos e comunicações oficiais.'
    : '- Foco em visão institucional da direção: regimento, normas, rotinas da\n' +
      '  escola e relatórios consolidados de frequência.'
}

REGRAS GERAIS DE ATENDIMENTO:
- Quando o usuário enviar arquivos (CSV de frequência, regimento em PDF/TXT,
  ementas), analise o conteúdo do arquivo com atenção e responda COM BASE nas
  informações presentes nele. Se algo estiver faltando, aponte objetivamente.
- Para planilhas de frequência, explique a análise passo a passo, apresente
  percentuais/cálculos de forma clara e sugira encaminhamentos práticos.
- Responda sempre em português brasileiro, de forma objetiva e profissional.
`;

// ----------------------------------------------------------------------------
//  PERSONA: COORDENADOR PEDAGÓGICO (chat exclusivo do professor)
// ----------------------------------------------------------------------------
const SISTEMA_COORDENADOR_PEDAGOGICO = `

Você é o "Assistente Virtual Escolar" e, neste atendimento, desempenha o papel de
COORDENADOR PEDAGÓGICO do corpo docente. Você acompanha o professor no dia a dia
da sala de aula e o ajuda a tomar decisões didáticas com base nos planos de aula
que ele já elaborou no sistema.

SUAS ATRIBUIÇÕES PRINCIPAIS:
- Orientar o planejamento e a sequência didática das aulas.
- Analisar e sugerir melhorias em planos de aula, atividades e avaliações.
- Discutir methodologies ativas, TDIC, avaliação formativa, Seus Princípios
  Pedagógicos e o uso de materiais didáticos.
- Ajudar a adaptar o ensino às diferentes turmas, níveis de aprendizagem
  e às condições reais da escola (tempo, recursos, infraestrutura).
- Ajudar na construção de RUBRICAS de avaliação e instrumentos avaliativos.

COMO USAR O CONTEXTO DE PLANOS:
- Você recebe no final deste prompt os RESUMOS dos planos de aula que o professor
  já gerou no sistema. Use-os como referência: ao sugerir mudanças, diga
  exatamente a qual aula/série elas se aplicam.
- Se o professor perguntar sobre um plano anterior, cite-o pelo título e pela data.
- Se a informação necessária não estiver nos resumos nem no que o professor
  informar, peça o dado em vez de inventar.

LIMITES DE CONFORMIDADE (LGPD):
- NUNCA consulte, solicite, gere ou armazene dados de NOTAS ou BOLETINS
  acadêmicos dos alunos. Analise apenas planejamento pedagógico e dados de
  frequência/assiduidade, documentos internos e relatórios conceituais.
- NUNCA exponha dados pessoais sensíveis de alunos além do estritamente
  necessário para o contexto institucional da escola.

REGRAS GERAIS DE ATENDIMENTO:
- Responda sempre em português brasileiro, de forma técnica, didática e colaborativa.
- Fundamente as sugestões pedagógicas na BNCC quando pertinente e cite a
  competência/habilidade envolvida de forma clara.
- Seja prático: entregue sugestões aplicáveis, com exemplos de atividades
  executáveis na próxima aula, e não listas genéricas.
`;

// ----------------------------------------------------------------------------
//  PERSONA: PLANEJADOR DE AULAS (BNCC) — usada no POST /api/planejar-aula
// ----------------------------------------------------------------------------
function montarInstrucaoPlanejamento(dados) {
  const minutos = dados.quantidadeAulas * dados.duracaoAulaMin;
  const horas = (minutos / 60).toFixed(1).replace('.', ',');

  return `

Você é o "Assistente Virtual Escolar" e, neste atendimento, atua como
ESPECIALISTA EM PLANEJAMENTO DE ENSINO. Você prepara planos de aula alinhados à
Base Nacional Comum de Currículos (BNCC) e aos projetos pedagógicos do
Ensino Fundamental e do Ensino Médio.

DADOS RECEBIDOS DO PROFESSOR:
- Disciplina: ${dados.disciplina}
- Série/Ano: ${dados.serie}
- Período letivo: ${dados.periodo}
- Quantidade de aulas: ${dados.quantidadeAulas}
- Duração de cada aula: ${dados.duracaoAulaMin} minutos
- Carga horária total: ${minutos} minutos (${horas} horas)
${dados.arquivoNome ? `- Material de apoio anexado: "${dados.arquivoNome}" (${dados.mimeType || 'tipo não informado'})` : '- Material de apoio: não anexado'}
${dados.observacoes ? `- Observações do professor (LEIA COM ATENÇÃO E CUMPRA):\n${dados.observacoes}` : '- Observações do professor: nenhuma'}

O QUE VOCÊ DEVE ENTREGER:
0. A PRIMEIRA LINHA DA SUA RESPOSTA DEVE SER EXATAMENTE NESTE FORMATO, e nada
   antes dela (nem título, nem "#", nem separador "---"):
   TÍTULO: <nome curto e descritivo do plano, com no máximo 12 palavras>
   Esse nome é o que aparece no histórico de planos do professor.
2. Depois da linha de título, para CADA uma das ${dados.quantidadeAulas} aulas, um
   bloco separado e identificado como "Aula N de ${dados.quantidadeAulas}", contendo:
   - Objetivo(s) específico(s), em linguagem observável e mensurável;
   - Competências/habilidades da BNCC exercitadas (cite o código quando possível,
     ex.: EF05MA01) e os campos de experiência/atividade;
   - Conteúdos e seleção de recursos (materiais, tecnologias, espaços);
   - Sequência de atividades com CRONOMETRAGIA. Como cada aula dura
     ${dados.duracaoAulaMin} minutos, distribua as atividades de forma que a soma
     respeite esse tempo (ex.: 10 min + 15 min + 15 min + 10 min = 50 min).
     A cronometragem é obrigatória e deve fechar exatamente com a duração da aula;
   - Estratégia de avaliação (diagnóstica, formativa ou somativa) com o critério
     de sucesso e o instrumento sugerido.
3. Uma seção final de "ADAPTAÇÕES E ATENÇÃO" com o que o professor pediu nas
   observações, incluindo ajustes de ritmo, restrições de recursos e alterações
   necessárias em razão de turma, série, comorbidades ou contexto da escola.
4. Uma seção "SUGESTÕES DE AVALIAÇÃO DO CONHECIMENTO" do conjunto do período.

REGRAS DE OURO:
- As ${dados.quantidadeAulas} aulas devem ser coerentes entre si: progressivas,
  sem repetição de conteúdo e construindo um olhar de sequência.
- Respeite integralmente as observações do professor. Se alguma observação for
  ambígua ou conflitante com a BNCC, resolva da forma mais didática e registre a
  decisão na seção de adaptações, em vez de ignorá-la.
- Considere o material anexado como referência de conteúdo: quando ele existir,
  cite explicitamente como o material está sendo usado em cada aula.
- Use linguagem direta e profissional, com listas e títulos em Markdown.
- Ao final, responda SEMPRE em português brasileiro e sem repetir as seções
  "TÍTULO" ou os dados de entrada.
`;
}

// ============================================================================
//  FUNÇÕES AUXILIARES (Firestore e montagem do prompt)
// ============================================================================
function extrairCargoDoUsuario(usuario) {
  if (usuario && typeof usuario.cargo === 'string' && usuario.cargo) {
    const cargoNormalizado = usuario.cargo.toLowerCase();
    if (CARGOS_VALIDOS.includes(cargoNormalizado)) {
      return cargoNormalizado;
    }
  }
  return null;
}

async function obterUsuario(userId) {
  const snapshot = await db.collection('usuarios').doc(userId).get();
  return snapshot.exists ? snapshot.data() : null;
}

// Recupera as últimas N mensagens do histórico (ordem cronológica).
async function obterHistoricoRecente(userId) {
  const ref = db.collection('historicos').doc(userId).collection('mensagens');
  const snapshot = await ref.orderBy('criadoEm', 'desc').limit(MAX_HISTORICO).get();
  if (snapshot.empty) {
    return [];
  }
  return snapshot.docs.map((doc) => doc.data()).reverse();
}

// Recupera o histórico completo em ordem cronológica, com data em ISO string.
async function obterHistoricoCompleto(userId, limite = 500) {
  const ref = db.collection('historicos').doc(userId).collection('mensagens');
  const snapshot = await ref.orderBy('criadoEm', 'asc').limit(limite).get();
  if (snapshot.empty) {
    return [];
  }
  return snapshot.docs.map((doc) => {
    const dados = doc.data();
    const data = dados.criadoEm;
    return {
      id: doc.id,
      role: dados.role,
      text: dados.text,
      sessionId: dados.sessionId || null,
      criadoEm: data && typeof data.toDate === 'function' ? data.toDate().toISOString() : data || null,
    };
  });
}

// ============================================================================
//  PROCESSAMENTO DE ARQUIVOS EM MEMÓRIA (Base64 -> parte enviada ao Gemini)
//  Suporta: CSV, XLSX/XLS, TXT, HTML, Markdown, PDF e documentos Word (.docx/.doc)
// ----------------------------------------------------------------------------
//  Retorna sempre uma "Part" do SDK (@google/genai):
//    { text }                -> conteúdo textual (extraído/conversão)
//    { inlineData }          -> dados binários nativos do Gemini (PDF, texto, mídia)
// ----------------------------------------------------------------------------
function classificarArquivo(mimeType, nomeArquivo = '') {
  const mime = (mimeType || '').toLowerCase();
  const ext = (nomeArquivo || '').split('.').pop().toLowerCase();

  if (mime.includes('wordprocessingml') || ext === 'docx' || mime === 'application/msword' || ext === 'doc') {
    return 'word';
  }
  if (mime === 'text/csv' || ext === 'csv') {
    return 'csv';
  }
  if (mime.includes('spreadsheetml') || ext === 'xlsx' || ext === 'xls' || mime === 'application/vnd.ms-excel') {
    return 'planilha';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    ['txt', 'md', 'markdown', 'html', 'htm', 'xml', 'json', 'log', 'tsv', 'rtf'].includes(ext)
  ) {
    return 'texto';
  }
  if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) {
    return 'media';
  }
  return 'desconhecido';
}

async function processarArquivo(arquivoBase64, mimeType, nomeArquivo = '') {
  try {
    return await processarArquivoInterno(arquivoBase64, mimeType, nomeArquivo);
  } catch (error) {
    if (error.codigo === 'ARQUIVO_NAO_SUPORTADO') {
      throw error;
    }
    const falha = new Error(
      `Não foi possível ler o arquivo "${nomeArquivo || 'enviado'}" (${mimeType || 'tipo desconhecido'}): ${error.message}`
    );
    falha.codigo = 'ERRO_ARQUIVO';
    throw falha;
  }
}

async function processarArquivoInterno(arquivoBase64, mimeType, nomeArquivo = '') {
  const tipo = classificarArquivo(mimeType, nomeArquivo);
  const buffer = Buffer.from(arquivoBase64, 'base64');
  const ext = (nomeArquivo || '').split('.').pop().toLowerCase();

  switch (tipo) {
    // PDF e mídias são suportados de forma nativa pelo Gemini (inlineData).
    case 'pdf':
      return { inlineData: { mimeType: 'application/pdf', data: arquivoBase64 } };
    case 'media':
      return { inlineData: { mimeType: mimeType || 'application/octet-stream', data: arquivoBase64 } };

    // Arquivos de texto: o Gemini aceita o mimeType text/* diretamente.
    case 'texto':
      return { inlineData: { mimeType: mimeType || 'text/plain', data: arquivoBase64 } };

    // CSV: enviado como texto com mimeType correto para leitura tabular.
    case 'csv':
      return { inlineData: { mimeType: 'text/csv', data: arquivoBase64 } };

    // Word: extrai o texto em memória (docx via mammoth, doc legado via word-extractor).
    case 'word': {
      const ehDocx = mimeType.includes('wordprocessingml') || ext === 'docx';
      let textoArquivo;
      if (ehDocx) {
        const resultado = await mammoth.extractRawText({ buffer });
        textoArquivo = resultado.value;
      } else {
        const extractor = new WordExtractor();
        const documento = await extractor.extract(buffer);
        textoArquivo = documento.getBody();
      }
      const texto = (textoArquivo || '').trim() || '(o documento não possui texto extraível)';
      return { text: `[Conteúdo do arquivo "${nomeArquivo || 'documento.word'}"]\n\n${texto}` };
    }

    // Excel (.xlsx/.xls): converte a primeira planilha em CSV (texto) em memória.
    case 'planilha': {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const primeiraFolha = workbook.Sheets[workbook.SheetNames[0]];
      if (!primeiraFolha) {
        return { text: '(planilha vazia - nenhuma folha encontrada)' };
      }
      const csv = XLSX.utils.sheet_to_csv(primeiraFolha);
      return { text: `[Conteúdo do arquivo "${nomeArquivo || 'planilha.xlsx'}"]\n\n${csv}` };
    }

    default: {
      const erro = new Error(
        'Tipo de arquivo não suportado. Envie: CSV, XLSX/XLS, TXT, HTML, MD, PDF, doc/docx, ou imagens/áudios.'
      );
      erro.codigo = 'ARQUIVO_NAO_SUPORTADO';
      throw erro;
    }
  }
}

// Monta o array "contents" do Gemini a partir do histórico + nova mensagem.
// Mescla turnos consecutivos com o mesmo role (o Gemini exige alternância).
function montarContents(historico, novasPartes) {
  const conteudos = historico
    .filter((m) => m && m.role && m.text)
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  conteudos.push({ role: 'user', parts: novasPartes });

  const mesclados = [];
  for (const conteudo of conteudos) {
    const ultimo = mesclados[mesclados.length - 1];
    if (ultimo && ultimo.role === conteudo.role) {
      ultimo.parts.push(...conteudo.parts);
    } else {
      mesclados.push({ role: conteudo.role, parts: [...conteudo.parts] });
    }
  }
  return mesclados;
}

function extrairTextoResposta(resposta) {
  try {
    if (resposta && typeof resposta.text === 'string' && resposta.text.trim() !== '') {
      return resposta.text;
    }
  } catch (_) {
    // resposta.text pode lançar erro quando a resposta é bloqueada/vazia
  }
  const partes = resposta?.candidates?.[0]?.content?.parts;
  if (Array.isArray(partes)) {
    return partes.map((p) => p?.text || '').join('').trim();
  }
  return '';
}

// ============================================================================
//  REFINAMENTO DO PLANO DE AULA MENSAL
// ============================================================================
//  O documento já vem pronto do escopo-sequência. Aqui a IA redige apenas os
//  campos que dependem de interpretação pedagógica, ancorada no conteúdo real
//  do bloco. Se a chamada falhar (cota esgotada, modelo fora do ar), o chamador
//  mantém os padrões fixos: o documento nunca fica incompleto por causa da IA.

// Campos que a IA sempre reescreve.
const CAMPOS_REFINAVEIS = [
  { chave: 'aprendizagensEssenciais', rotulo: 'aprendizagens essenciais', regra: 'de 3 a 5 itens, destacando os conhecimentos e habilidades essenciais a serem consolidados no período' },
  { chave: 'metodologias', rotulo: 'metodologias', regra: 'de 4 a 6 itens, cada um começando com verbo no infinitivo' },
  { chave: 'recuperacaoContinua', rotulo: 'recuperação contínua', regra: 'de 4 a 5 itens, descrevendo o que o professor faz na prática' },
  { chave: 'materialDigital', rotulo: 'material digital', regra: 'de 2 a 4 itens, citando recursos, plataformas ou materiais digitais concretos' },
  { chave: 'materialFisico', rotulo: 'material físico', regra: 'de 2 a 4 itens, citando materiais impressos, livros e materiais manipuláveis concretos' },
  { chave: 'recursosDidaticos', rotulo: 'recursos didáticos', regra: 'de 4 a 6 itens, citando recursos concretos' },
  { chave: 'flexibilizacaoCurricular', rotulo: 'flexibilização curricular', regra: 'de 4 a 5 itens, cada um no formato "Rótulo: descrição", cobrindo adequação de ritmo, adaptação de atividades, organização flexível do agrupamento e meios de avaliação diversificados' },
];

// Só entram aqui as competências que a planilha não traz. No Ensino Técnico as
// duas colunas existem e o dado da escola tem precedência; nos demais segmentos
// são as competências que a IA deve redigir a partir do conteúdo da semana.
function camposRefinaveis(plano) {
  const campos = [...CAMPOS_REFINAVEIS];
  if (!plano.competenciasDoEscopo) {
    campos.unshift(
      { chave: 'competenciaTecnica', rotulo: 'competência técnica', regra: 'de 3 a 4 itens, cada um começando com verbo no infinitivo, redigidos a partir dos conteúdos e objetivos do período' },
      { chave: 'competenciaSocioemocional', rotulo: 'competência socioemocional', regra: 'de 3 a 4 itens, cada um no formato "Nome — descrição", valorizando o comportamento esperado do estudante' },
    );
  }
  return campos;
}

function montarInstrucaoRefinar(plano) {
  const campos = camposRefinaveis(plano);
  const exemplo = campos.map((c) => `"${c.chave}":["..."]`).join(',');

  return [
    'Você é coordenador pedagógico de uma escola técnica brasileira.',
    'Vou entregar o conteúdo de um bloco de semanas de uma disciplina, já extraído',
    'da planilha de escopo-sequência. Reescreva os campos abaixo do plano de aula mensal',
    'que a direção pedagógica exige.',
    '',
    'CAMPOS A ESCREVER:',
    ...campos.map((c) => `- ${c.rotulo}: ${c.regra}.`),
    '',
    'REGRAS GERAIS:',
    '- Use português do Brasil, linguagem formal e objetiva, adequada a documento escolar.',
    '- Cada item deve ter no máximo 2 frases.',
    '- Não invente conteúdos que não estejam no material recebido.',
    '- Considere a carga horária e o período de 4 semanas informado.',
    '',
    'Responda SOMENTE com um JSON válido, sem cercas de código e sem comentários,',
    'no formato exato:',
    `{${exemplo}}`,
  ].join('\n');
}

function resumirParaIA(plano, limite = 40) {
  const resumo = (lista) => lista.slice(0, limite).join('; ');
  return [
    `Componente: ${plano.cabecalho.componente}`,
    plano.cabecalho.disciplina ? `Disciplina: ${plano.cabecalho.disciplina}` : null,
    plano.cabecalho.serie ? `Série: ${plano.cabecalho.serie}` : null,
    `Etapa: ${plano.cabecalho.etapa}`,
    `Período: ${plano.cabecalho.bimestre}, ${plano.cabecalho.bloco}`,
    `Total de aulas no bloco: ${plano._resumo.totalAulas}`,
    plano._resumo.unidades.length ? `Unidades temáticas: ${resumo(plano._resumo.unidades)}` : null,
    plano._resumo.objetivos.length ? `Objetivos do escopo: ${resumo(plano._resumo.objetivos)}` : null,
    plano.habilidades.length
      ? `Habilidades BNCC do escopo: ${plano.habilidades
        .slice(0, 12)
        .map((h) => (h.codigo && h.texto ? `${h.codigo} ${h.texto}` : h.codigo || h.texto))
        .join('; ')}`
      : null,
    plano.oQueSeraMinistrado.length
      ? `Aulas previstas: ${resumo(plano.oQueSeraMinistrado, 20)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function refinarPlanoComIA(plano) {
  const campos = camposRefinaveis(plano);
  const resposta = await chamarGeminiComRetry(
    [{ text: resumirParaIA(plano) }],
    montarInstrucaoRefinar(plano),
    { temperature: 0.5, maxOutputTokens: 2048 },
  );

  const texto = extrairTextoResposta(resposta);
  if (!texto) throw new Error('A IA não retornou texto.');

  // O modelo pode envolver o JSON em cercas de código ou texto antes/depois.
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) throw new Error('A IA não retornou JSON.');

  let dados;
  try {
    dados = JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    throw new Error('A IA retornou JSON inválido.');
  }

  const saida = {};
  for (const { chave } of campos) {
    const valor = dados[chave];
    if (Array.isArray(valor) && valor.length) {
      saida[chave] = valor.map((item) => String(item).trim()).filter(Boolean);
    }
  }
  if (!Object.keys(saida).length) throw new Error('A IA não retornou os campos esperados.');
  return saida;
}
// Chama o Gemini com tentativas automáticas para erros transitórios
// (429 = limite de requisições/cota, 5xx = indisponibilidade temporária do modelo)
// e, se um modelo estiver indisponível, troca automaticamente para o próximo
// da fila de fallbacks (GEMINI_MODEL_FALLBACKS no .env + FALLBACKS_PADRAO).
const STATUS_TRANSITORIOS = [408, 429, 500, 502, 503];
const RETRIES_POR_MODELO = 2;
const ATRASO_BASE_MS = 1000; // curto de propósito: no plano gratuito é melhor cair
const RODADAS_MAX = 2; // rapidamente no próximo modelo da fila do que insistir
const PAUSA_ENTRE_RODADAS_MS = 4000; // no mesmo modelo saturado.

// Planejamentos podem pedir 4+ aulas de uma vez; um teto de tokens por resposta
// evita que o modelo escreva demais e demore minutos para devolver o plano.
const MAX_TOKENS_PLANEJAMENTO = 8192;

// Etapas reconhecidas nas planilhas de escopo-sequencia.
const ETAPAS_ESCOPO = ['Anos Iniciais', 'Anos Finais', 'Ensino Medio', 'Ensino Tecnico'];

function montarListaDeModelos() {
  const fallbackEnv = (process.env.GEMINI_MODEL_FALLBACKS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([MODELO_GEMINI, ...FALLBACKS_PADRAO, ...fallbackEnv])];
}

async function chamarGeminiComRetry(contents, systemInstruction, opcoes = {}) {
  const modelos = montarListaDeModelos();
  const temperatura = opcoes.temperature ?? 0.7;
  const maxOutputTokens = opcoes.maxOutputTokens;
  let ultimoErro;

  for (let roda = 1; roda <= RODADAS_MAX; roda++) {
    for (const modelo of modelos) {
      for (let tentativa = 1; tentativa <= RETRIES_POR_MODELO; tentativa++) {
        try {
          const resposta = await ai.models.generateContent({
            model: modelo,
            contents,
            config: {
              systemInstruction,
              temperature: temperatura,
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
            },
          });
          if (modelo !== MODELO_GEMINI) {
            console.warn(`[Gemini] Modelo em uso neste turno: ${modelo} (fallback).`);
          }
          return resposta;
        } catch (erro) {
          ultimoErro = erro;
          const status = Number(erro?.status || 0);

          // Modelo não encontrado/indisponível para a conta -> tenta o próximo já.
          if (status === 404) {
            console.warn(`[Gemini] Modelo "${modelo}" indisponível (404). Tentando o próximo...`);
            break;
          }
          // Erro de validação (400) etc. não é resolvido trocando de modelo.
          if (!STATUS_TRANSITORIOS.includes(status) && status !== 0) {
            throw erro;
          }
          if (tentativa < RETRIES_POR_MODELO) {
            const esperaMs = ATRASO_BASE_MS * 2 ** (tentativa - 1);
            console.warn(
              `[Gemini] Modelo "${modelo}" falhou (status ${status}) — nova tentativa em ${esperaMs}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, esperaMs));
          }
        }
      }
    }
    // Nenhum modelo respondeu nesta rodada: espera e varre de novo
    // (picos de demanda costumam passar em poucos segundos).
    if (roda < RODADAS_MAX) {
      console.warn(
        `[Gemini] Nenhum modelo respondeu na rodada ${roda}. Nova rodada em ${PAUSA_ENTRE_RODADAS_MS}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_RODADAS_MS));
    }
  }
  throw ultimoErro;
}

// Grava a pergunta do usuário e a resposta da IA na subcoleção de histórico.
async function salvarHistorico(userId, pergunta, resposta, sessionId = null) {
  const ref = db.collection('historicos').doc(userId).collection('mensagens');
  const batch = db.batch();
  
  const msgUser = {
    role: 'user',
    text: pergunta,
    criadoEm: FieldValue.serverTimestamp(),
  };
  if (sessionId) msgUser.sessionId = sessionId;
  batch.set(ref.doc(), msgUser);

  const msgModel = {
    role: 'model',
    text: resposta,
    criadoEm: FieldValue.serverTimestamp(),
  };
  if (sessionId) msgModel.sessionId = sessionId;
  batch.set(ref.doc(), msgModel);

  await batch.commit();
}

// ============================================================================
//  PLANEJAMENTO DE AULAS (persistência e contexto para o chat)
// ----------------------------------------------------------------------------
//  Os planos ficam em planejamentos/{userId}/aulas/{id}, mesma lógica de
//  particionamento usada no histórico de mensagens (historicos/{userId}/...).
// ============================================================================

// Monta o caminho da subcoleção de planos de um professor.
function colecaoAulas(userId) {
  return db.collection('planejamentos').doc(userId).collection('aulas');
}

// Recupera os planos mais recentes (mais novo primeiro) para o histórico da tela.
async function obterPlanosRecentes(userId, limite = 20) {
  const snapshot = await colecaoAulas(userId)
    .orderBy('criadoEm', 'desc')
    .limit(limite)
    .get();

  return snapshot.docs.map((doc) => {
    const dados = doc.data();
    const criadoEm = dados.criadoEm;
    return {
      id: doc.id,
      titulo: dados.titulo || 'Plano de aula',
      disciplina: dados.disciplina || '',
      serie: dados.serie || '',
      periodo: dados.periodo || '',
      quantidadeAulas: dados.quantidadeAulas || 0,
      duracaoAulaMin: dados.duracaoAulaMin || DURACAO_AULA_PADRAO_MIN,
      observacoes: dados.observacoes || '',
      arquivoNome: dados.arquivoNome || null,
      conteudo: dados.conteudo || '',
      criadoEm:
        criadoEm && typeof criadoEm.toDate === 'function' ? criadoEm.toDate().toISOString() : criadoEm || null,
    };
  });
}

function formatarDataBR(isoOuData) {
  if (!isoOuData) {
    return 'data não informada';
  }
  const data = typeof isoOuData === 'string' ? new Date(isoOuData) : isoOuData;
  if (Number.isNaN(data.getTime())) {
    return 'data não informada';
  }
  return data.toLocaleDateString('pt-BR');
}

// Limita um texto preservando o início e marcando o corte.
function truncar(texto, limite) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

// Remove marcadores de Markdown e de lista do início/fim da linha.
function limparMarcadores(texto) {
  return String(texto || '')
    .replace(/^[\s*_#>•·\-–—]+/, '')
    .replace(/[*_`]/g, '')
    .trim();
}

// Lê o conteúdo que vem depois de um rótulo "Rótulo: valor". Quando o valor está
// na linha seguinte (formato comum do Markdown: "**Objetivo:**" e o texto abaixo),
// percorre até achar a primeira linha com conteúdo.
function extrairAposRotulo(linhas, indice) {
  const pos = linhas[indice].indexOf(':');
  if (pos >= 0) {
    const resto = limparMarcadores(linhas[indice].slice(pos + 1));
    if (resto.length >= 8) {
      return truncar(resto, 220);
    }
  }
  for (let i = indice + 1; i < Math.min(indice + 4, linhas.length); i++) {
    const texto = limparMarcadores(linhas[i]);
    if (texto.length >= 8) {
      return truncar(texto, 220);
    }
  }
  return '';
}

// Descobre em quantos minutos a aula fecha a avaliação. A sequência
// cronometrada vem ANTES do rótulo "Estratégia de avaliação", então a etapa
// procurada é a última cronometragem anterior ao rótulo (a que fecha a aula).
function extrairMomentoAvaliacao(linhas, indiceRotulo) {
  const etapas = [];
  linhas.forEach((linha, i) => {
    if (/\d+\s*min/i.test(linha) && limparMarcadores(linha).length > 8) {
      etapas.push({ indice: i, texto: limparMarcadores(linha) });
    }
  });
  if (!etapas.length) {
    return '';
  }

  const comAvaliacao = etapas.find((etapa) =>
    /avalia|exit\s*ticket|bilhete|autoavalia|atividade avaliativa|registro|prova/i.test(etapa.texto)
  );
  if (comAvaliacao) {
    return truncar(comAvaliacao.texto, 220);
  }

  const anteriores = etapas.filter((etapa) => etapa.indice < indiceRotulo);
  const escolhida = anteriores.length ? anteriores[anteriores.length - 1] : etapas[etapas.length - 1];
  return truncar(escolhida.texto, 220);
}

// Divide o corpo do plano nos blocos "Aula N de M" e devolve, para cada aula,
// o objetivo e o momento de avaliação. É esse recorte — e não o texto bruto —
// que entra no chat, porque cabe no contexto e é o que o professor pergunta.
function extrairResumoPorAula(plano) {
  const corpo = String(plano.conteudo || '');
  const cabecalhos = [...corpo.matchAll(/^#{0,6}\s*(Aula\s+\d+\s*(?:de|\/)\s*\d+[^\n]*)$/gim)];

  if (!cabecalhos.length) {
    // Formato inesperado: devolve o começo do texto para não perder o contexto.
    return [`  Trecho: ${truncar(corpo, 500)}`];
  }

  return cabecalhos.map((achado, indice) => {
    const titulo = limparMarcadores(achado[1]);
    const bloco = corpo.slice(achado.index + achado[0].length, cabecalhos[indice + 1]?.index ?? corpo.length);
    const linhas = bloco.split('\n');

    const linhasRotulo = [];
    linhas.forEach((linha, i) => {
      if (/objetiv/i.test(linha)) linhasRotulo.push(['objetivo', i]);
      if (/^[\s*_#-]*(?:estrat[eé]gia de )?avalia[cç][aã]o[\s*_#:]/i.test(linha)) linhasRotulo.push(['avaliacao', i]);
    });

    const objetivo = linhasRotulo.find(([rotulo]) => rotulo === 'objetivo');
    const avaliacao = linhasRotulo.find(([rotulo]) => rotulo === 'avaliacao');

    const partes = [`  ${titulo}`];
    if (objetivo) partes.push(`    Objetivo: ${extrairAposRotulo(linhas, objetivo[1])}`);
    const momento = avaliacao ? extrairMomentoAvaliacao(linhas, avaliacao[1]) : '';
    if (momento) partes.push(`    Fechamento/avaliação: ${momento}`);
    return partes.filter(Boolean).join('\n');
  });
}

// Resumo de um plano para injetar contexto no chat do professor.
// Inclui um extrato do CONTEÚDO (não só metadados): sem isso o coordenador
// responde que "a aula não foi planejada" mesmo ela estando no histórico.
function resumirPlano(plano) {
  const carga = plano.quantidadeAulas * plano.duracaoAulaMin;
  const linhas = [
    `- "${plano.titulo}" (${formatarDataBR(plano.criadoEm)})`,
    `  Disciplina: ${plano.disciplina} | Série: ${plano.serie} | Período: ${plano.periodo}`,
    `  Carga: ${plano.quantidadeAulas} aula(s) x ${plano.duracaoAulaMin} min = ${carga} min`,
  ];
  if (plano.arquivoNome) {
    linhas.push(`  Material de apoio usado: ${plano.arquivoNome}`);
  }
  if (plano.observacoes) {
    linhas.push(`  Observações do professor: ${plano.observacoes}`);
  }
  return linhas.concat(extrairResumoPorAula(plano)).join('\n');
}

// Monta o bloco "PLANOS JÁ ELABORADOS" que entra no systemInstruction do professor.
async function montarContextoDePlanos(userId) {
  try {
    const planos = await obterPlanosRecentes(userId, MAX_PLANOS_NO_CONTEXTO);
    if (!planos.length) {
      return '';
    }
    return (
      '\n\n---\n' +
      'PLANOS DE AULA JÁ ELABORADOS POR ESTE PROFESSOR NO SISTEMA ' +
      `(os ${planos.length} mais recentes):\n` +
      planos.map(resumirPlano).join('\n\n') +
      '\n---\n'
    );
  } catch (error) {
    // A falha ao buscar planos não pode derrubar o chat: seguimos sem contexto.
    console.warn('[Planejamento] Não foi possível carregar o contexto de planos:', error.message);
    return '';
  }
}

// Extrai o título do plano. Só aceitamos a linha "TÍTULO:" pedida no prompt;
// qualquer outra linha do corpo (como "Aula 1 de 4" ou "ADAPTAÇÕES E ATENÇÃO")
// seria um título enganoso no histórico, então caímos no título sintético.
function extrairTituloPlano(conteudo, dados) {
  const achado = String(conteudo || '').match(/^\s*\*{0,2}T[ÍI]TULO:?\*{0,2}:?\s*(.+)$/im);
  if (achado) {
    const titulo = achado[1]
      .replace(/[*_#`]/g, '')
      .replace(/^["'‘“\-–—\s]+/, '')
      .replace(/["'’”\s]+$/, '')
      .trim();
    if (titulo.length >= 3) {
      return titulo.slice(0, 120);
    }
  }
  return [dados.disciplina, dados.serie, dados.periodo].filter(Boolean).join(' · ').slice(0, 120);
}

// Remove a linha de TÍTULO e separadores decorativos do início do corpo,
// para que o Markdown do plano comece direto pelo conteúdo.
function limparCorpoDoPlano(conteudo) {
  return String(conteudo || '')
    .replace(/^\s*#*\s*\*{0,2}T[ÍI]TULO:?\*{0,2}:?\s*(.+)$/im, '')
    .replace(/^[\s\-=_*#]+/, '')
    .trim();
}

// ============================================================================
//  ROTAS
// ============================================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    modelo: MODELO_GEMINI,
    timestamp: new Date().toISOString(),
  });
});

// Valida um usuário existente e devolve nome/cargo (usado na tela de login).
app.get('/api/usuario/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !userId.trim()) {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório.' });
    }
    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res.status(404).json({ erro: `Usuário "${userId}" não encontrado na coleção "usuarios".` });
    }
    const cargo = extrairCargoDoUsuario(usuario);
    if (!cargo) {
      return res.status(403).json({ erro: `O cargo do usuário "${userId}" é inválido ou não autorizado.` });
    }
    return res.json({ userId, nome: usuario.nome || userId, cargo });
  } catch (error) {
    console.error('[ERRO] Falha em GET /api/usuario/:userId:', error);
    return res.status(500).json({ erro: 'Erro ao consultar o usuário.', detalhes: error.message });
  }
});

// Devolve todo o histórico de conversas de um usuário (ordem cronológica).
app.get('/api/historico/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limite = Math.min(Number(req.query.limite) || 500, 1000);
    if (!userId || !userId.trim()) {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório.' });
    }
    const mensagens = await obterHistoricoCompleto(userId, limite);
    return res.json({ userId, quantidade: mensagens.length, mensagens });
  } catch (error) {
    console.error('[ERRO] Falha em GET /api/historico/:userId:', error);
    return res.status(500).json({ erro: 'Erro ao consultar o histórico.', detalhes: error.message });
  }
});

// Autentica um usuário por e-mail + senha. Devolve os dados públicos dele.
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    const emailNormalizado = normalizarEmail(email);
    if (!validarEmail(emailNormalizado)) {
      return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    }
    if (!senha) {
      return res.status(400).json({ erro: 'Informe a senha.' });
    }
    const doc = await autenticarUsuario(emailNormalizado, senha);
    if (!doc) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }
    const usuarioPublico = montarUsuarioPublico(doc);
    if (!usuarioPublico.cargo) {
      return res.status(403).json({ erro: 'Este usuário não tem um cargo autorizado.' });
    }
    return res.json(usuarioPublico);
  } catch (error) {
    console.error('[ERRO] Falha em POST /api/login:', error);
    return res.status(500).json({ erro: 'Erro ao autenticar.', detalhes: error.message });
  }
});

// Cadastra um novo usuário (aluno/secretaria/professor).
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, email, senha, cargo = 'aluno' } = req.body || {};
    const nomeLimpo = String(nome || '').trim();
    const cargoNormalizado = String(cargo || '').trim().toLowerCase();
    const emailNormalizado = normalizarEmail(email);

    if (nomeLimpo.length < 3) {
      return res.status(400).json({ erro: 'Informe o nome completo.' });
    }
    if (!validarEmail(emailNormalizado)) {
      return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    }
    if (typeof senha !== 'string' || senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter ao menos 6 caracteres.' });
    }
    if (!CARGOS_VALIDOS.includes(cargoNormalizado)) {
      return res.status(400).json({ erro: 'Cargo inválido. Use aluno, secretaria, professor ou direcao.' });
    }

    const existente = await obterUsuarioPorEmail(emailNormalizado);
    if (existente) {
      return res.status(409).json({ erro: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const novoDoc = await db.collection('usuarios').add({
      nome: nomeLimpo,
      email: emailNormalizado,
      senhaHash: criarHashSenha(senha),
      cargo: cargoNormalizado,
      criadoEm: FieldValue.serverTimestamp(),
    });

    console.log(`[LOGIN] Usuário cadastrado: ${novoDoc.id} (${emailNormalizado}, cargo=${cargoNormalizado})`);
    return res.status(201).json({
      userId: novoDoc.id,
      nome: nomeLimpo,
      email: emailNormalizado,
      cargo: cargoNormalizado,
    });
  } catch (error) {
    console.error('[ERRO] Falha em POST /api/usuarios:', error);
    return res.status(500).json({ erro: 'Erro ao cadastrar o usuário.', detalhes: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const {
      userId,
      mensagem,
      arquivoBase64 = null,
      mimeType = null,
      fileName = null,
      sessionId = null,
    } = req.body || {};

    // ---- Validações de entrada -------------------------------------------
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório e deve ser uma string.' });
    }
    if (!mensagem || typeof mensagem !== 'string' || mensagem.trim() === '') {
      return res.status(400).json({ erro: 'O campo "mensagem" é obrigatório e não pode ser vazio.' });
    }
    if ((arquivoBase64 && !mimeType) || (!arquivoBase64 && mimeType)) {
      return res
        .status(400)
        .json({ erro: 'Para enviar um arquivo, informe "arquivoBase64" e "mimeType" juntos.' });
    }
    if (arquivoBase64 && typeof arquivoBase64 !== 'string') {
      return res.status(400).json({ erro: '"arquivoBase64" deve ser uma String Base64.' });
    }
    if (fileName && typeof fileName !== 'string') {
      return res.status(400).json({ erro: '"fileName" deve ser uma string.' });
    }

    // ---- 1) Buscar o cargo do usuário no Firestore -------------------------
    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res
        .status(404)
        .json({ erro: `Usuário "${userId}" não encontrado na coleção "usuarios".` });
    }

    const cargo = extrairCargoDoUsuario(usuario);
    if (!cargo) {
      return res
        .status(403)
        .json({ erro: `O cargo do usuário "${userId}" é inválido ou não autorizado.` });
    }

    // ---- 2) Definir o systemInstruction dinâmico por cargo ------------------
    // O professor tem persona própria (coordenador pedagógico) e recebe, além
    // da persona, o resumo dos planos de aula que ele já elaborou no sistema.
    let systemInstruction;
    if (cargo === 'aluno') {
      systemInstruction = SISTEMA_TUTOR_ALUNO;
    } else if (cargo === 'professor') {
      systemInstruction = SISTEMA_COORDENADOR_PEDAGOGICO + (await montarContextoDePlanos(userId));
    } else {
      systemInstruction = SISTEMA_ANALISTA_GESTAO(cargo);
    }

    // ---- 3) Recuperar as últimas mensagens do histórico ---------------------
    const historico = await obterHistoricoRecente(userId);

    // ---- 4) Montar o prompt (texto + arquivo inline opcional) ---------------
    const novasPartes = [{ text: mensagem.trim() }];
    if (arquivoBase64) {
      const parteArquivo = await processarArquivo(arquivoBase64, mimeType, fileName);
      novasPartes.push(parteArquivo);
    }

    const contents = montarContents(historico, novasPartes);

    // ---- 5) Chamar o Gemini (com retry para 429/5xx) ------------------------
    const resposta = await chamarGeminiComRetry(contents, systemInstruction);

    const textoResposta = extrairTextoResposta(resposta);
    if (!textoResposta) {
      return res.status(502).json({ erro: 'A IA não retornou uma resposta válida. Tente novamente.' });
    }

    // ---- 6) Salvar a pergunta e a resposta no Firestore --------------------
    await salvarHistorico(userId, mensagem.trim(), textoResposta, sessionId);

    // ---- 7) Retornar a resposta -------------------------------------------
    return res.json({ resposta: textoResposta });
  } catch (error) {
    // Erros de arquivo (tipo não suportado, falha na leitura/conversão) -> 400
    if (error.codigo === 'ARQUIVO_NAO_SUPORTADO' || error.codigo === 'ERRO_ARQUIVO') {
      return res.status(400).json({ erro: error.message });
    }
    // Indisponibilidade temporária / limite de requisições do Gemini
    const status = Number(error?.status || 0);
    if (status === 503) {
      console.error('[ERRO] Gemini indisponível:', error.message);
      return res.status(503).json({
        erro:
          'O serviço de IA da escola está temporariamente cheio no momento. ' +
          'Aguarde alguns segundos e envie a mensagem novamente.',
      });
    }
    if (status === 429) {
      console.error('[ERRO] Limite de requisições do Gemini:', error.message);
      return res.status(429).json({
        erro:
          'Limite de requisições temporário atingido (plano gratuito). ' +
          'Aguarde um instante e tente novamente.',
      });
    }
    // Chave inválida, revogada ou com a "Gemini API" desativada no projeto do Google Cloud.
    if (status === 401 || status === 403) {
      console.error('[ERRO] Acesso à API do Gemini negado:', error.message);
      return res.status(502).json({
        erro:
          'O servidor não conseguiu falar com a API do Gemini (acesso negado). ' +
          'Verifique se a GEMINI_API_KEY do arquivo ".env" é válida e se a ' +
          '"Generative Language API" está ATIVADA no projeto do Google Cloud.',
      });
    }
    console.error('[ERRO] Falha em POST /api/chat:', error);
    return res.status(500).json({
      erro: 'Erro interno ao processar sua mensagem.',
      detalhes: error.message,
    });
  }
});

// ----------------------------------------------------------------------------
//  PLANEJAMENTO DE AULAS (exclusivo do perfil Professor)
// ----------------------------------------------------------------------------

// Histórico de planos do professor, do mais recente para o mais antigo.
app.get('/api/planejamentos/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !userId.trim()) {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório.' });
    }

    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res.status(404).json({ erro: `Usuário "${userId}" não encontrado na coleção "usuarios".` });
    }
    const cargo = extrairCargoDoUsuario(usuario);
    if (!CARGOS_PLANEJAMENTO.includes(cargo)) {
      return res.status(403).json({ erro: 'Apenas o perfil Professor tem acesso ao planejamento de aulas.' });
    }

    const limite = Math.min(Number(req.query.limite) || 30, 100);
    const planos = await obterPlanosRecentes(userId, limite);
    return res.json({ userId, quantidade: planos.length, planos });
  } catch (error) {
    console.error('[ERRO] Falha em GET /api/planejamentos/:userId:', error);
    return res.status(500).json({ erro: 'Erro ao consultar os planos de aula.', detalhes: error.message });
  }
});

// Gera um plano de aula com a IA e salva no histórico do professor.
app.post('/api/planejar-aula', async (req, res) => {
  try {
    const {
      userId,
      disciplina,
      serie,
      periodo,
      quantidadeAulas,
      duracaoAulaMin = DURACAO_AULA_PADRAO_MIN,
      observacoes = '',
      arquivoBase64 = null,
      mimeType = null,
      fileName = null,
    } = req.body || {};

    // ---- Validações de entrada -------------------------------------------
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório e deve ser uma string.' });
    }

    const disciplinaLimpa = String(disciplina || '').trim();
    if (disciplinaLimpa.length < 2) {
      return res.status(400).json({ erro: 'Informe a disciplina a ser ensinada.' });
    }

    const serieLimpa = String(serie || '').trim();
    if (serieLimpa.length < 2) {
      return res.status(400).json({ erro: 'Informe a série/ano da turma.' });
    }

    const periodoLimpo = String(periodo || '').trim();
    if (periodoLimpo.length < 2) {
      return res.status(400).json({ erro: 'Informe o período letivo (ex.: 1ª semana, 1º bimestre).' });
    }

    const totalAulas = Number(quantidadeAulas);
    if (!Number.isInteger(totalAulas) || totalAulas < 1) {
      return res.status(400).json({ erro: 'A quantidade de aulas deve ser um número inteiro maior que zero.' });
    }
    if (totalAulas > MAX_AULAS_POR_PLANO) {
      return res.status(400).json({
        erro: `O limite por plano é de ${MAX_AULAS_POR_PLANO} aulas. Divida em dois planos.`,
      });
    }

    const duracao = Number(duracaoAulaMin);
    if (!Number.isFinite(duracao) || duracao < 10 || duracao > 240) {
      return res.status(400).json({ erro: 'A duração da aula deve estar entre 10 e 240 minutos.' });
    }

    const observacoesLimpa = String(observacoes || '').trim().slice(0, 4000);
    if ((arquivoBase64 && !mimeType) || (!arquivoBase64 && mimeType)) {
      return res
        .status(400)
        .json({ erro: 'Para anexar um material, informe "arquivoBase64" e "mimeType" juntos.' });
    }

    // ---- 1) Autorização: só o perfil Professor planeja ----------------------
    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res.status(404).json({ erro: `Usuário "${userId}" não encontrado na coleção "usuarios".` });
    }
    const cargo = extrairCargoDoUsuario(usuario);
    if (!CARGOS_PLANEJAMENTO.includes(cargo)) {
      return res.status(403).json({ erro: 'Apenas o perfil Professor tem acesso ao planejamento de aulas.' });
    }

    // ---- 2) Montar o prompt (instrução BNCC + material de apoio) -----------
    const dados = {
      disciplina: disciplinaLimpa,
      serie: serieLimpa,
      periodo: periodoLimpo,
      quantidadeAulas: totalAulas,
      duracaoAulaMin: duracao,
      observacoes: observacoesLimpa,
      arquivoNome: fileName,
      mimeType,
    };

    const novasPartes = [
      {
        text:
          `Prepare o plano de aula conforme as instruções. ` +
          `Comece respondendo com uma linha "TÍTULO: <nome curto do plano>".`,
      },
    ];
    if (arquivoBase64) {
      const parteArquivo = await processarArquivo(arquivoBase64, mimeType, fileName);
      novasPartes.push(parteArquivo);
    }

    // ---- 3) Chamar o Gemini (com retry para 429/5xx) ------------------------
    // Temperatura baixa e teto de tokens: plano de aula é um documento
    // estruturado, não texto criativo — isso encurta bastante a resposta.
    const resposta = await chamarGeminiComRetry(novasPartes, montarInstrucaoPlanejamento(dados), {
      temperature: 0.4,
      maxOutputTokens: MAX_TOKENS_PLANEJAMENTO,
    });

    const conteudo = extrairTextoResposta(resposta);
    if (!conteudo) {
      return res.status(502).json({ erro: 'A IA não retornou um plano válido. Tente novamente.' });
    }

    // ---- 4) Remover a linha de TÍTULO do corpo e usá-la como metadado ------
    const titulo = extrairTituloPlano(conteudo, dados);
    const corpoLimpo = limparCorpoDoPlano(conteudo);

    // ---- 5) Salvar no Firestore -------------------------------------------
    const doc = await colecaoAulas(userId).add({
      titulo,
      disciplina: disciplinaLimpa,
      serie: serieLimpa,
      periodo: periodoLimpo,
      quantidadeAulas: totalAulas,
      duracaoAulaMin: duracao,
      cargaHorariaMin: totalAulas * duracao,
      observacoes: observacoesLimpa,
      arquivoNome: fileName || null,
      professorNome: usuario.nome || userId,
      conteudo: corpoLimpo || conteudo,
      criadoEm: FieldValue.serverTimestamp(),
    });

    console.log(
      `[Planejamento] ${userId} gerou o plano "${titulo}" (${totalAulas} aulas x ${duracao} min).`
    );

    return res.status(201).json({
      id: doc.id,
      userId,
      titulo,
      disciplina: disciplinaLimpa,
      serie: serieLimpa,
      periodo: periodoLimpo,
      quantidadeAulas: totalAulas,
      duracaoAulaMin: duracao,
      cargaHorariaMin: totalAulas * duracao,
      observacoes: observacoesLimpa,
      arquivoNome: fileName || null,
      conteudo: corpoLimpo || conteudo,
      criadoEm: new Date().toISOString(),
    });
  } catch (error) {
    if (error.codigo === 'ARQUIVO_NAO_SUPORTADO' || error.codigo === 'ERRO_ARQUIVO') {
      return res.status(400).json({ erro: error.message });
    }
    const status = Number(error?.status || 0);
    if (status === 503) {
      return res.status(503).json({
        erro:
          'O serviço de IA da escola está temporariamente cheio no momento. ' +
          'Aguarde alguns segundos e gere o plano novamente.',
      });
    }
    if (status === 429) {
      console.error('[ERRO] Cota do Gemini esgotada:', error.message);
      return res.status(429).json({
        erro:
          'A cota diária de uso da IA foi atingida (plano gratuito do Google). ' +
          'Isso não é um problema do seu plano de aula: a cota volta a funcionar ' +
          'em algumas horas ou no próximo dia. Nenhum plano foi salvo.',
      });
    }
    if (status === 401 || status === 403) {
      console.error('[ERRO] Acesso à API do Gemini negado:', error.message);
      return res.status(502).json({
        erro:
          'O servidor não conseguiu falar com a API do Gemini (acesso negado). ' +
          'Verifique se a GEMINI_API_KEY do arquivo ".env" é válida e se a ' +
          '"Generative Language API" está ATIVADA no projeto do Google Cloud.',
      });
    }
    console.error('[ERRO] Falha em POST /api/planejar-aula:', error);
    return res.status(500).json({ erro: 'Erro interno ao gerar o plano de aula.', detalhes: error.message });
  }
});

// ============================================================================
//  PLANO DE AULA MENSAL (documento entregue a gestao)
// ============================================================================
//  Documento em papel que a direcao pedagogica exige todo mes. Diferente do
//  plano de aula detalhado acima, este nao depende de IA para ser gerado: o
//  conteudo vem da planilha escopo-sequencia e apenas metodologias,
//  recuperacao, recursos e flexibilizacao sao redigidos.

// Blocos de semanas de um bimestre ja com as datas resolvidas, para a tela
// mostrar o periodo real de cada opcao ("Semanas 1 a 4, de 02/02 a 27/02").
function blocosComDatas(bimestre) {
  return planoAula.blocosDoBimestre(bimestre).map((bloco) => {
    const datas = planoAula.datasDoBimestre(bimestre, bloco.relativaInicial, bloco.relativaFinal);
    return {
      id: bloco.id,
      rotulo: bloco.rotulo,
      semanas: bloco.relativaInicial === bloco.relativaFinal
        ? bloco.relativaInicial
        : `${bloco.relativaInicial}-${bloco.relativaFinal}`,
      inicio: datas.length ? datas[0].inicio : null,
      fim: datas.length ? datas[datas.length - 1].fim : null,
    };
  });
}

// Componentes e series disponiveis nas planilhas de escopo-sequencia.
app.get('/api/escopo', (req, res) => {
  try {
    const componentes = escopo.listarComponentes();
    const etapaFiltro = req.query.etapa ? escopo.chave(req.query.etapa) : null;
    const filtrados = etapaFiltro
      ? componentes.filter((c) => escopo.chave(c.etapa) === etapaFiltro)
      : componentes;

    return res.json({
      etapas: [...new Set(componentes.map((c) => c.etapa))],
      series: escopo.listarSeries(req.query.etapa),
      componentes: filtrados.map((c) => ({
        etapa: c.etapa,
        componente: c.componente,
        series: c.series,
        bimestres: c.bimestres,
        temSemana: c.temSemana,
        temCompetencia: c.temCompetencia,
      })),
      // Calendario letivo: e dele que saem as datas de cada semana do documento.
      // A tela usa para montar as opcoes de bloco sem duplicar a conta.
      calendario: {
        anoLetivo: planoAula.ANO_LETIVO,
        recesso: planoAula.RECESSO,
        bimestres: planoAula.CALENDARIO_LETIVO.map((b) => ({
          bimestre: b.bimestre,
          inicio: b.inicio,
          termino: b.termino,
          semanas: b.semanas,
          blocos: blocosComDatas(b.bimestre),
        })),
      },
    });
  } catch (error) {
    console.error('[ERRO] Falha em GET /api/escopo:', error);
    return res.status(500).json({ erro: 'Erro ao ler as planilhas de escopo-sequência.', detalhes: error.message });
  }
});

// Disciplinas dentro de um curso do Ensino Tecnico (ex.: Administracao tem
// "Introducao a Administracao" e "Matematica Aplicada a Administracao").
app.get('/api/escopo/disciplinas', (req, res) => {
  try {
    const { etapa, componente, serie, bimestre, anoDoTecnico } = req.query;
    if (!componente || !String(componente).trim()) {
      return res.status(400).json({ erro: 'Informe o componente (curso) para listar as disciplinas.' });
    }
    return res.json({
      disciplinas: escopo.listarDisciplinas({ etapa, componente, serie, bimestre, anoDoTecnico }),
    });
  } catch (error) {
    console.error('[ERRO] Falha em GET /api/escopo/disciplinas:', error);
    return res.status(500).json({ erro: 'Erro ao listar as disciplinas.', detalhes: error.message });
  }
});

// Monta o documento do plano de aula. `refinar=true` pede a IA para reescrever
// os campos pedagogicos; sem isso, ou se a cota falhar, usa os padroes fixos.
app.post('/api/plano-aula', async (req, res) => {
  try {
    const {
      userId,
      etapa,
      componente,
      disciplina,
      serie,
      bimestre,
      bloco = 1,
      anoDoTecnico,
      refinar = false,
      salvar = true,
    } = req.body || {};

    // ---- Validacao de acesso ----------------------------------------------
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório.' });
    }
    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res.status(404).json({ erro: `Usuário "${userId}" não encontrado.` });
    }
    const cargo = extrairCargoDoUsuario(usuario);
    if (!CARGOS_PLANEJAMENTO.includes(cargo)) {
      return res.status(403).json({ erro: 'Apenas o perfil Professor tem acesso ao plano de aula.' });
    }

    // ---- Validacao dos campos ---------------------------------------------
    // A etapa pode chegar acentuada da tela ("Ensino Técnico"); os nomes
    // canonicos das planilhas não têm acento, então a comparação é sem acento.
    const etapaNome = etapa
      ? ETAPAS_ESCOPO.find((nome) => escopo.chave(nome) === escopo.chave(etapa))
      : null;
    if (!etapaNome) {
      return res.status(400).json({ erro: `Informe a etapa. Valores aceitos: ${ETAPAS_ESCOPO.join(', ')}.` });
    }

    const bimestreNum = Number(bimestre);
    if (!Number.isInteger(bimestreNum) || bimestreNum < 1 || bimestreNum > 4) {
      return res.status(400).json({ erro: 'Informe o bimestre (de 1 a 4).' });
    }
    // O bloco precisa existir dentro do bimestre escolhido. Como o calendário
    // tem bimestres de 9, 10 e 11 semanas, a quantidade de blocos varia.
    const blocosDoBimestre = planoAula.blocosDoBimestre(bimestreNum);
    const blocoNum = Number(bloco);
    const blocoEscolhido = blocosDoBimestre.find((b) => b.id === blocoNum);
    if (!blocoEscolhido) {
      const opcoes = blocosDoBimestre.map((b) => `${b.id} (${b.rotulo})`).join(', ');
      return res.status(400).json({
        erro: `Escolha um bloco de semanas válido para o ${bimestreNum}º bimestre. Opções: ${opcoes}.`,
      });
    }
    // Fora do Tecnico a serie e obrigatoria: o escopo e definido por ela.
    if (etapaNome !== 'Ensino Tecnico' && !serie) {
      return res.status(400).json({ erro: 'Selecione a série/ano da turma.' });
    }

    // ---- Montagem deterministica ------------------------------------------
    // As datas sao do calendario letivo de 2026; o professor pode ajustar cada
    // data na tela depois, sem precisar mandar nada para o back-end.
    const plano = planoAula.montarPlanoDeAula({
      etapa: etapaNome,
      componente: componente ? String(componente).trim() : '',
      disciplina: disciplina ? String(disciplina).trim() : '',
      serie: serie ? String(serie).trim() : '',
      bimestre: bimestreNum,
      blocoId: blocoNum,
      anoDoTecnico: anoDoTecnico || 1,
    });

    // ---- Refinamento opcional pela IA --------------------------------------
    let origem = 'escopo-sequência';
    let aviso = null;
    if (refinar) {
      try {
        Object.assign(plano, await refinarPlanoComIA(plano));
        origem = 'escopo-sequência + IA';
      } catch (erroIA) {
        const status = Number(erroIA?.status || 0);
        console.warn('[PlanoAula] Refinamento por IA indisponível:', status || erroIA.message);
        aviso = status === 429
          ? 'A cota da IA acabou: metodologia, recuperação, recursos e flexibilização saíram do modelo padrão da escola. O conteúdo do escopo-sequência está completo.'
          : 'Não foi possível consultar a IA agora. Esses campos vieram do modelo padrão da escola.';
      }
    }

    // ---- Persistencia opcional ---------------------------------------------
    let id = null;
    if (salvar) {
      const doc = await colecaoAulas(userId).add({
        tipo: 'plano-aula-mensal',
        titulo: `${plano.cabecalho.componente} - ${plano.cabecalho.bimestre} (${plano.cabecalho.bloco})`,
        professorNome: usuario.nome || userId,
        documento: plano,
        criadoEm: FieldValue.serverTimestamp(),
      });
      id = doc.id;
    }

    return res.status(id ? 201 : 200).json({ id, origem, aviso, plano });
  } catch (error) {
    console.error('[ERRO] Falha em POST /api/plano-aula:', error);
    return res.status(500).json({ erro: 'Erro ao montar o plano de aula.', detalhes: error.message });
  }
});

// Exclui um conjunto de mensagens do histórico (uma conversa/sessão inteira).
app.delete('/api/historico/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { messageIds } = req.body || {};
    if (!userId || !userId.trim()) {
      return res.status(400).json({ erro: 'O campo "userId" é obrigatório.' });
    }
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ erro: 'O campo "messageIds" deve ser um array com IDs.' });
    }

    const usuario = await obterUsuario(userId);
    if (!usuario) {
      return res.status(404).json({ erro: `Usuário "${userId}" não encontrado.` });
    }

    const ref = db.collection('historicos').doc(userId).collection('mensagens');
    
    for (let i = 0; i < messageIds.length; i += 500) {
      const lote = messageIds.slice(i, i + 500);
      const batch = db.batch();
      lote.forEach((id) => batch.delete(ref.doc(id)));
      await batch.commit();
    }

    return res.json({ sucesso: true, removidas: messageIds.length });
  } catch (error) {
    console.error('[ERRO] Falha em DELETE /api/historico/:userId:', error);
    return res.status(500).json({ erro: 'Erro ao excluir as mensagens.', detalhes: error.message });
  }
});

// ============================================================================
//  TRATAMENTO DE ERROS / ROTA 404
// ============================================================================
app.use((req, res) => {
  res.status(404).json({ erro: `Rota "${req.method} ${req.originalUrl}" não encontrada.` });
});

app.use((err, req, res, next) => {
  console.error('[ERRO GLOBAL]', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Payload muito grande. O limite é de 50MB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON do corpo da requisição inválido.' });
  }
  res.status(500).json({ erro: 'Erro interno do servidor.', detalhes: err.message });
});

// ============================================================================
//  AUTENTICAÇÃO E CADASTRO DE USUÁRIOS
// ----------------------------------------------------------------------------
//  A senha nunca é armazenada em texto puro: usamos scrypt (Node nativo) com
//  salt único por usuário, no formato "salt:hash".
// ----------------------------------------------------------------------------

function criarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha, hashArmazenado) {
  try {
    const [salt, hashEsperado] = String(hashArmazenado || '').split(':');
    if (!salt || !hashEsperado) {
      return false;
    }
    const hashTeste = crypto.scryptSync(senha, salt, 64).toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hashTeste, 'hex'),
      Buffer.from(hashEsperado, 'hex'),
    );
  } catch (error) {
    return false;
  }
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function montarUsuarioPublico(doc) {
  const dados = doc.data();
  return {
    userId: doc.id,
    nome: dados.nome || doc.id,
    email: dados.email || null,
    cargo: extrairCargoDoUsuario(dados) || null,
  };
}

// Busca um usuário pelo e-mail (campo indexado automaticamente pelo Firestore).
async function obterUsuarioPorEmail(email) {
  const snapshot = await db.collection('usuarios').where('email', '==', email).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
}

// Autentica por e-mail + senha. Retorna o documento do usuário ou null.
async function autenticarUsuario(email, senha) {
  const doc = await obterUsuarioPorEmail(normalizarEmail(email));
  if (!doc || !verificarSenha(senha, doc.get('senhaHash'))) {
    return null;
  }
  return doc;
}

// ============================================================================
//  INÍCIO DO SERVIDOR
// ============================================================================
app.listen(PORT, () => {
  const modelos = montarListaDeModelos();
  console.log(
    `\n[Assistente Escolar API] Rodando em http://localhost:${PORT}\n` +
      `Modelo principal: ${MODELO_GEMINI} | Fallbacks: ${modelos
        .slice(1)
        .join(', ')} | Health check: http://localhost:${PORT}/api/health\n`
  );
});
