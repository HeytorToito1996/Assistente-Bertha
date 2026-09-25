# 🎒 Assistente Virtual Escolar

Assistente escolar com IA: um **tutor acadêmico** para alunos e um **analista de gestão**
para a secretaria/direção. Composto por uma **API REST** (Node.js + Express + Firebase +
Google Gemini) e um **front-end em React (Vite)**.

- 💬 Chat com a IA (Google Gemini) com **personas distintas** por cargo
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
    │   ├── App.jsx               # fluxo login → chat
    │   ├── screens/
    │   │   ├── LoginScreen.jsx   # login (e-mail/senha) + perfil + modo teste
    │   │   └── ChatScreen.jsx    # chat, histórico, upload e cadastro de alunos
    │   ├── components/
    │   │   └── CadastroAlunoModal.jsx
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
| `GEMINI_MODEL`                | Modelo principal (opcional; padrão `gemini-3.6-flash`)           |
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

> No chat de **gestão** há o botão **"+ Cadastrar aluno(a)"** para criar contas de alunos
> novos — eles podem entrar imediatamente com o e-mail/senha cadastrados.

---

## 🔌 API REST (back-end)

| Método | Rota                      | Descrição                                                         |
| ------ | ------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/api/health`             | Health check (status, modelo em uso)                              |
| `GET`  | `/api/usuario/:userId`    | Valida usuário existente e devolve `{ userId, nome, cargo }`      |
| `GET`  | `/api/historico/:userId`  | Histórico completo (opcional `?limite=N`, padrão 500)             |
| `POST` | `/api/login`              | `{ email, senha }` → `{ userId, nome, email, cargo }`             |
| `POST` | `/api/usuarios`           | `{ nome, email, senha, cargo }` → cadastrar (padrão `aluno`)      |
| `POST` | `/api/chat`               | `{ userId, mensagem, arquivoBase64?, mimeType?, fileName? }`      |

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
```

- A senha é armazenada como `salt:scryptHash` (nunca em texto puro).
- O histórico alimenta o context. As **últimas 10 mensagens** são enviadas ao Gemini
  para dar continuidade ao diálogo.
- No front-end, as mensagens são agrupadas em **sessões** (pausa > 30 min entre
  mensagens inicia uma nova conversa na sidebar).

---

## 🤖 Modelos Gemini e tolerância a falhas

O servidor usa um modelo principal e uma fila de fallbacks. Se um modelo devolver
**503 (sobrecarga)**, **429 (cota)**, **5xx** ou **404 (indisponível)**, ele:

1. tenta novamente com retry + **backoff**;
2. cai para o próximo modelo da fila (config via `GEMINI_MODEL_FALLBACKS`);
3. mesmo depois de percorrer tudo, repete a varredura inteira após uma pausa
   (modelos flash costumam voltar em segundos).

Personalidade por cargo:
- **aluno** → Tutor acadêmico (método socrático, nunca dá a resposta pronta;
  guia com perguntas e exemplos);
- **secretaria/direção** → Analista de gestão (foco em análise e gestão escolar,
  respeitando limites da LGPD — não manipula notas/boletins pessoais).

---

## 🧹 Observações

- O **"modo teste"** da tela de login (entrar pelo código do usuário, ex.: `ALUNO-001`)
  é uma facilidade **temporária** para desenvolvimento e será removida.
- A persona do tutor está preparada para **não** fornecer respostas prontas de
  exercícios/provas, conduzindo o aprendizado com perguntas.