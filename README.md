# 🎒 Assistente Virtual Escolar

Assistente escolar com IA: um **tutor acadêmico** para alunos, um **analista de gestão**
para a secretaria/direção e um **planejador de aulas + coordenador pedagógico** para
o professor. Composto por uma **API REST** (Node.js + Express + Firebase + Google Gemini)
e um **front-end em React (Vite)**.

- 💬 Chat com a IA (Google Gemini) com **personas distintas** por cargo
- 📚 **Planejamento de aulas** (professor): IA gera o plano BNCC, aula por aula,
  com cronometragem, material de apoio anexável e histórico por data
- 🎓 **Coordenador pedagógico**: o chat do professor já conhece os planos que ele gerou
- 📎 Análise de **arquivos** pela gestão (CSV, XLSX, PDF, Word, imagens, etc.)
- 🕐 **Histórico** de conversas agrupado por sessão
- 🆕 **Cadastro de alunos** pela secretaria (pelo chat de gestão)
- 🔐 Login por **e-mail e senha** (senha com hash `scrypt`) + escolha de perfil
- 🧯 **Rotação automática de modelos** Gemini com retry (suporta 503/429/404 transitórios)

---

## 📁 Estrutura do projeto

```
Assistente/
├── package.json          # scripts de conveniência (sobe back + front juntos)
├── backend/              # API REST (Express + Firebase Admin + Gemini)
│   ├── server.js         # aplicação principal (rotas, personas, arquivos, Gemini)
│   ├── seed-usuarios.js  # semeia e-mail/senha dos usuários demo
│   ├── .env              # ⚠️ configuração local (NÃO versionar)
│   ├── .env.example      # modelo das variáveis exigidas
│   └── docs/
│       └── exemplo-consumo.html  # exemplo de consumo direto da API
└── frontend/             # aplicação React (Vite 8 + React 19)
    ├── src/
    │   ├── App.jsx               # fluxo login → app (nav do professor)
    │   ├── screens/
    │   │   ├── LoginScreen.jsx        # login (e-mail/senha) + 3 perfis + modo teste
    │   │   ├── PlanejamentoScreen.jsx # form de planejamento + histórico de planos
    │   │   └── ChatScreen.jsx         # chat, histórico, upload e cadastro de alunos
    │   ├── components/
    │   │   └── CadastroAlunoModal.jsx
    │   ├── tela-login.css        # estilos da tela de login (prefixo `login-`)
    │   ├── tela-planejamento.css # estilos do planejamento (prefixo `plan-`)
    │   └── api.js                # cliente da API (proxy /api)
    └── public/                   # favicon e logotipo (logo2.jpeg)
```

---

## ⚙️ Pré-requisitos

- **Node.js ≥ 20** (testado com Node 24)
- **npm**
- **Chave da API do Google Gemini** (grátis em https://aistudio.google.com/apikey)
- **Projeto Firebase (plano Spark)** com Firestore habilitado
  e uma **chave de conta de serviço** (Console Firebase → Configurações do projeto →
  Contas de serviço → Gerar nova chave privada)

---

## 🔧 Configuração

### 1) Instalar dependências

Na raiz do projeto:

```bash
npm install --prefix backend
npm install --prefix frontend
npm install          # só o concurrently, para o comando "dev" na raiz
```

### 2) Configurar o back-end

Copie o modelo de configuração:

```bash
cd backend
copy .env.example .env    # Windows
# ou:  cp .env.example .env   # Linux/macOS
```

Edite o `.env` e preencha:

| Variável                      | Descrição                                                       |
| ----------------------------- | --------------------------------------------------------------- |
| `PORT`                        | Porta do servidor (padrão `3000`)                                |
| `GEMINI_API_KEY`              | Sua chave da API do Gemini (obrigatória)                         |
| `GEMINI_MODEL`                | Modelo principal (opcional; padrão `gemini-3.5-flash`)           |
| `GEMINI_MODEL_FALLBACKS`      | Fila de modelos alternativos (opcional, separados por vírgula)   |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Caminho do JSON da conta de serviço do Firebase                |
| `FIREBASE_PROJECT_ID`         | Opcional (deploy gerenciado)                                     |

Coloque o arquivo JSON da conta de serviço na pasta `backend/`
(ex.: `backend/service-account-key.json`) e aponte `FIREBASE_SERVICE_ACCOUNT_PATH`
para ele.

> ⚠️ **Segurança:** `.env`, `.env.example` com valores reais e o JSON da conta de serviço
> estão no `.gitignore` — nunca versione segredos.

### 3) Semeiar usuários demo

```bash
cd backend
npm run seed:usuarios
```

Cria/atualiza credenciais para os usuários existentes (o script é idempotente — não
sobrescreve e-mails já cadastrados):

| Usuário  | E-mail                | Senha      | Cargo       |
| -------- | --------------------- | ---------- | ----------- |
| Maria    | `maria@escola.edu.br` | `aluno123` | aluno       |
| Ana      | `ana@escola.edu.br`   | `gestao123`| secretaria  |
| Paulo    | `paulo@escola.edu.br` | `prof2024` | professor   |

---

## ▶️ Executando

### Tudo de uma vez (recomendado)

```bash
npm run dev
```

Sobe o **back-end** (http://localhost:3000) e o **front-end**
(http://localhost:5173) juntos, com logs nomeados por cor. `Ctrl+C` derruba os dois.

### Separadamente

```bash
npm run backend     # API REST na porta 3000
npm run frontend    # React/Vite na porta 5173 (proxy /api → 3000)
```

Abra **http://localhost:5173** no navegador e entre como:

- **Aluno:** `maria@escola.edu.br` / `aluno123`
- **Gestão:** `ana@escola.edu.br` / `gestao123`
- **Professor:** `paulo@escola.edu.br` / `prof2024`

> No chat de **gestão** há o botão **"+ Cadastrar aluno(a)"** para criar contas de alunos
> novos — eles podem entrar imediatamente com o e-mail/senha cadastrados.

---

## 📚 Planejamento de aulas (professor)

Ao entrar como **Professor**, o sistema mostra duas abas: **Planejamento de Aulas** e
**Coordenador Pedagógico**.

### Formulário de planejamento

| Campo | Observações |
| ----- | ----------- |
| Disciplina | Lista com os componentes do Ensino Fundamental/Médio, **Eletivas**, **Projeto de Vida** e as matérias dos **cursos técnicos** da escola — *Administração*, *Desenvolvimento de Sistemas* e *Ciência de Dados* (aceita texto livre) |
| Série / Ano | Lista de sugestão do 1º ano ao 3º ano do EM |
| Período letivo | Lista de sugestão (semana, bimestre, unidade, recuperação) |
| Quantidade de aulas | 1 a 40 |
| Minutos por aula | Padrão **50**; a carga horária total é calculada ao vivo |
| Material de apoio | Opcional — PDF, DOC(X), TXT, MD, CSV, planilhas |
| Observações | Texto livre: turma, condições, restrições de recursos, foco, alunos com TEA etc. |

Ao gerar, a IA devolve **um bloco por aula** ("Aula N de M") contendo:

- objetivos em linguagem observável e mensurável;
- competências/habilidades da **BNCC** (com código, ex.: `EF07MA08`);
- conteúdos e recursos;
- **sequência de atividades com cronometragem** que fecha exatamente nos minutos da aula;
- estratégia de avaliação, com critério de sucesso e instrumento.

Mais uma seção de **Adaptações e atenção** que cumpre as observações informadas, e uma de
**Sugestões de avaliação do conhecimento** do período inteiro.

Os planos ficam no **histórico por data**; cada um abre em uma tela com o Markdown
renderizado, os metadados (disciplina, série, período, carga) e um botão **Copiar**.

### Contexto compartilhado com o chat

Os **3 planos mais recentes** entram automaticamente no prompt do chat do professor, cada
um com um extrato por aula (**objetivo** e **fechamento/avaliação em minutos**). É isso
que permite ao coordenador pedagógico responder coisas como *"qual foi o objetivo da Aula 2?"*
sem o professor precisar repetir o plano.

---

## 🔌 API REST (back-end)

| Método | Rota                      | Descrição                                                         |
| ------ | ------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/api/health`             | Health check (status, modelo em uso)                              |
| `GET`  | `/api/usuario/:userId`    | Valida usuário existente e devolve `{ userId, nome, cargo }`      |
| `GET`  | `/api/historico/:userId`  | Histórico completo (opcional `?limite=N`, padrão 500)             |
| `GET`  | `/api/planejamentos/:userId` | Planos de aula do professor (opcional `?limite=N`, padrão 30)  |
| `POST` | `/api/login`              | `{ email, senha }` → `{ userId, nome, email, cargo }`             |
| `POST` | `/api/usuarios`           | `{ nome, email, senha, cargo }` → cadastrar (padrão `aluno`)      |
| `POST` | `/api/chat`               | `{ userId, mensagem, arquivoBase64?, mimeType?, fileName? }`      |
| `POST` | `/api/planejar-aula`      | Gera e salva um plano de aula (somente `cargo: "professor"`)      |
| `GET`  | `/api/escopo`             | Componentes, séries e calendário letivo vindos das planilhas      |
| `GET`  | `/api/escopo/disciplinas` | Disciplinas de um curso do Ensino Técnico                        |
| `POST` | `/api/plano-aula`         | Monta o plano de aula mensal em papel (somente `cargo: "professor"`) |

### Plano de aula mensal (documento da direção)

A montagem é determinística: o conteúdo vem das planilhas de escopo-sequência
em `base_de_dados/` e as datas do calendário letivo de 2026, sem passar pela IA.
Só metodologias, recuperação contínua, recursos didáticos e flexibilização
podem ser reescritos pela IA quando o professor marca a opção (e houver cota).

O calendário letivo é o da rede: **1º bimestre começa em fevereiro e o 4º em
outubro**, com o recesso de 29/06 a 31/07 entre o 2º e o 3º. Cada bimestre é
dividido em blocos de 4 semanas — o último completa as semanas restantes —
e as datas saem prontas na tela, ainda editáveis uma a uma.

```bash
curl -X POST http://localhost:3000/api/plano-aula \
  -H "Content-Type: application/json" \
  -d '{
        "userId": "PROF-002",
        "etapa": "Anos Iniciais",
        "componente": "Matemática",
        "serie": "5º ano",
        "bimestre": 1,
        "bloco": 1,
        "refinar": false,
        "salvar": false
      }'
```

Resposta `200`: `{ origem, plano, aviso }`. No Ensino Técnico, acrescente
`"anoDoTecnico": 1|2` e `"disciplina": "<nome da disciplina do curso>"`.
Use `"salvar": false` para gerar sem gravar no Firestore.

### Exemplo de planejamento

```bash
curl -X POST http://localhost:3000/api/planejar-aula \
  -H "Content-Type: application/json" \
  -d '{
        "userId": "PROF-002",
        "disciplina": "Matemática",
        "serie": "7º ano",
        "periodo": "1º bimestre",
        "quantidadeAulas": 4,
        "duracaoAulaMin": 50,
        "observacoes": "Turma B, 32 alunos, 3 com dificuldade em frações, 1 projetor.",
        "arquivoBase64": "<BASE64>",
        "mimeType": "application/pdf",
        "fileName": "apostila-frações.pdf"
      }'
```

Resposta `201`: `{ id, titulo, disciplina, serie, periodo, quantidadeAulas, duracaoAulaMin,
cargaHorariaMin, observacoes, conteudo, criadoEm }`, com o plano em **Markdown**.
O `userId` precisa pertencer a um professor — outros cargos recebem **403**.

### Exemplo de chat com arquivo

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
        "userId": "SEC-001",
        "mensagem": "Resuma esta planilha de matrículas",
        "arquivoBase64": "<BASE64>",
        "mimeType": "text/csv",
        "fileName": "matriculas.csv"
      }'
```

Resposta: `{ "resposta": "..." }` (o texto de resposta vem em **Markdown** — o front-end
o renderiza com `react-markdown`).

### Arquivos aceitos (Base64 em memória)

`CSV`, `XLSX/XLS`, `TXT`, `HTML`, `Markdown`, `PDF`, `Word (.docx/.doc)`,
imagens e mídia. Conversões em memória — nada é gravado em disco/Storage.

---

## 🗃️ Estrutura no Firestore (plano Spark)

```
usuarios/{id}
  { nome: string, email: string, senhaHash: string, cargo: "aluno"|"secretaria"|"professor"|"direcao" }

historicos/{userId}/mensagens/{autoId}
  { role: "user"|"model", text: string, criadoEm: timestamp }

planejamentos/{userId}/aulas/{autoId}
  { titulo, disciplina, serie, periodo, quantidadeAulas, duracaoAulaMin,
    cargaHorariaMin, observacoes, arquivoNome, professorNome, conteudo, criadoEm }
```

- A senha é armazenada como `salt:scryptHash` (nunca em texto puro).
- O histórico alimenta o context. As **últimas 10 mensagens** são enviadas ao Gemini
  para dar continuidade ao diálogo.
- No front-end, as mensagens são agrupadas em **sessões** (pausa > 30 min entre
  mensagens inicia uma nova conversa na sidebar).
- Os planos de aula são lidos em ordem `criadoEm desc` (histórico por data) e os
  3 mais recentes entram no contexto do chat do professor.

---

## 🤖 Modelos Gemini e tolerância a falhas

O servidor usa um modelo principal e uma fila de fallbacks. Se um modelo devolver
**503 (sobrecarga)**, **429 (cota)**, **5xx** ou **404 (indisponível)**, ele:

1. tenta novamente com retry + **backoff**;
2. cai para o próximo modelo da fila (config via `GEMINI_MODEL_FALLBACKS`);
3. mesmo depois de percorrer tudo, repete a varredura inteira após uma pausa
   (modelos flash costumam voltar em segundos).

> **Plano gratuito:** os modelos mais novos (`gemini-3.6/3.7/3.8-flash`) costumam
> estar saturados e devolvem `503 "high demand"`. A fila padrão por isso começa
> pelos Flash 3.5, que são bem mais estáveis:
> `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` →
> `gemini-3.6-flash` → `gemini-3.7-flash` → `gemini-3.8-flash`.
> Se aparecer 503/429, é limite de cota do plano gratuito — espere alguns
> segundos e reenvie.

Personalidade por cargo:
- **aluno** → Tutor acadêmico (método socrático, nunca dá a resposta pronta;
  guia com perguntas e exemplos);
- **professor** → **Coordenador pedagógico** (orientação de sequência didática,
  metodologias ativas, avaliação formativa, rubricas) + o **gerador de planos BNCC**;
- **secretaria/direção** → Analista de gestão (foco em análise e gestão escolar,
  respeitando limites da LGPD — não manipula notas/boletins pessoais).

---

## 🧹 Observações

- O **"modo teste"** da tela de login (entrar pelo código do usuário, ex.: `ALUNO-001`)
  é uma facilidade **temporária** para desenvolvimento e será removida.
- A persona do tutor está preparada para **não** fornecer respostas prontas de
  exercícios/provas, conduzindo o aprendizado com perguntas.