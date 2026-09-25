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

// ============================================================================
//  CONFIGURAÇÕES GERAIS
// ============================================================================
const PORT = Number(process.env.PORT || 3000);
const MODELO_GEMINI = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
// Fila de modelos alternativos usada quando o principal estiver cheio/indisponível.
// Consulte os modelos disponíveis da sua conta em https://ai.google.dev/gemini-api/docs/models
const FALLBACKS_PADRAO = [
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
const MAX_HISTORICO = 10; // últimas N mensagens recuperadas do Firestore
const CARGOS_VALIDOS = ['aluno', 'secretaria', 'professor', 'direcao'];

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
ANALISTA DE ROTINAS INSTITUCIONAIS e DE GESTÃO ESCOLAR. Você atende profissionais
da escola (Secretaria, Professores e Direção) no suporte a tarefas burocráticas
e administrativas.

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
    : cargo === 'professor'
      ? '- Foco em ementas e conteúdos das disciplinas, planejamento de aulas e\n' +
        '  análise de frequência das turmas para relatórios conceituais.'
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

// Chama o Gemini com tentativas automáticas para erros transitórios
// (429 = limite de requisições, 5xx = indisponibilidade temporária do modelo)
// e, se um modelo estiver indisponível, troca automaticamente para o próximo
// da fila de fallbacks (GEMINI_MODEL_FALLBACKS no .env + FALLBACKS_PADRAO).
const STATUS_TRANSITORIOS = [408, 429, 500, 502, 503];
const RETRIES_POR_MODELO = 2;
const ATRASO_BASE_MS = 2000;
const RODADAS_MAX = 2; // segundas passadas pela fila (indisponibilidade é passageira)
const PAUSA_ENTRE_RODADAS_MS = 5000;

function montarListaDeModelos() {
  const fallbackEnv = (process.env.GEMINI_MODEL_FALLBACKS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([MODELO_GEMINI, ...FALLBACKS_PADRAO, ...fallbackEnv])];
}

async function chamarGeminiComRetry(contents, systemInstruction) {
  const modelos = montarListaDeModelos();
  let ultimoErro;

  for (let roda = 1; roda <= RODADAS_MAX; roda++) {
    for (const modelo of modelos) {
      for (let tentativa = 1; tentativa <= RETRIES_POR_MODELO; tentativa++) {
        try {
          const resposta = await ai.models.generateContent({
            model: modelo,
            contents,
            config: { systemInstruction, temperature: 0.7 },
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
async function salvarHistorico(userId, pergunta, resposta) {
  const ref = db.collection('historicos').doc(userId).collection('mensagens');
  const batch = db.batch();
  batch.set(ref.doc(), {
    role: 'user',
    text: pergunta,
    criadoEm: FieldValue.serverTimestamp(),
  });
  batch.set(ref.doc(), {
    role: 'model',
    text: resposta,
    criadoEm: FieldValue.serverTimestamp(),
  });
  await batch.commit();
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
    const systemInstruction =
      cargo === 'aluno' ? SISTEMA_TUTOR_ALUNO : SISTEMA_ANALISTA_GESTAO(cargo);

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
    await salvarHistorico(userId, mensagem.trim(), textoResposta);

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
    console.error('[ERRO] Falha em POST /api/chat:', error);
    return res.status(500).json({
      erro: 'Erro interno ao processar sua mensagem.',
      detalhes: error.message,
    });
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