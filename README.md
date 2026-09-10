# 🏫 API Assistente Virtual Escolar (Back-End)

Este repositório contém exclusivamente o **back-end (API REST)** de um assistente virtual escolar inteligente e tutor pedagógico integrado ao **Google Gemini** e ao **Firebase**. 

Desenvolvido em **Node.js com Express**, o projeto foi projetado para rodar na camada 100% gratuita do Firebase (Plano Spark), priorizando o processamento ágil em memória para estar em total conformidade com a LGPD.

---

## 📋 Características do Projeto

- **Arquitetura Sem Storage (Custo Zero):** A API não utiliza armazenamento físico de arquivos. Documentos, textos e planilhas de frequência são convertidos no front-end e enviados como strings **Base64**, sendo processados diretamente na memória RAM pela IA.
- **Conformidade LGPD:** Por questões de privacidade, a API **bloqueia e não processa** dados relacionados a notas ou boletins acadêmicos, focando estritamente em ementas, regimentos e assiduidade (frequência).
- **Personalidade Dinâmica (System Instructions):** O comportamento da IA muda automaticamente com base no cargo do usuário cadastrado no banco de dados.

---

## 🧠 Comportamento por Perfil de Usuário

1. **🧑‍🎓 Alunos (Tutor Pedagógico):** A IA atua de forma didática e paciente. Ela utiliza o método socrático: guia o aluno através de perguntas reflexivas e **nunca fornece respostas prontas** para exercícios.
2. **💼 Gestão / Professores / Secretaria (Analista Administrativo):** A IA assume uma postura analítica e formal. É capaz de interpretar regimentos internos, resumir ementas e identificar padrões de faltas em planilhas de frequência enviadas pela equipe.

---

## 🛠️ Tecnologias e Dependências

- **Runtime:** Node.js (Express)
- **Banco de Dados & Autenticação:** Firebase Admin SDK (`firebase-admin`)
- **Inteligência Artificial:** Google Gen AI SDK (`@google/genai` - Modelo `gemini-2.5-flash`)
- **Segurança:** Suporte nativo a `cors` habilitado para requisições de origens HTML puro.

---

## ⚙️ Configuração do Ambiente

Crie um arquivo `.env` na raiz do projeto back-end e configure as seguintes variáveis:

```env
PORT=3000
GEMINI_API_KEY=sua_chave_do_google_ai_studio

# Credenciais da Conta de Serviço do Firebase Admin (Gerada no Console do Firebase)
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=seu-client-email@://gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 🛣️ Endpoints da API

### `POST /api/chat`
Envia uma mensagem de texto e/ou um arquivo anexado para o assistente virtual.

* **Payload de Entrada (JSON):**
```json
{
  "userId": "uid_do_usuario_no_firebase",
  "mensagem": "Explique o conceito de fotossíntese.",
  "arquivoBase64": "", // Opcional (String Base64 pura, sem cabeçalhos de data:image...)
  "mimeType": ""       // Opcional (ex: "text/csv", "application/pdf")
}
```

* **Resposta de Sucesso (200 OK):**
```json
{
  "resposta": "Texto da resposta gerada pelo Gemini..."
}
```

---

## 🗄️ Modelagem do Banco de Dados (Firestore)

A API espera e gerencia dados estruturados em duas coleções do Cloud Firestore:

- **`usuarios/{userId}`**: Documento que dita as regras de comportamento da IA.
  ```json
  {
    "nome": "João Silva",
    "cargo": "aluno" // Valores aceitos: "aluno", "professor" ou "secretaria"
  }
  ```
- **`historicos/{userId}/mensagens`**: Armazena as mensagens de forma cronológica para fornecer memória de contexto (últimas 10 mensagens) ao Gemini.
  ```json
  {
    "role": "user", // ou "model"
    "text": "Conteúdo do texto",
    "criadoEm": "Timestamp"
  }
  ```

---

## 👨‍💻 Guia para a Equipe de Front-End (HTML/JS Puro)

Para enviar arquivos (como planilhas de frequência `.csv`), o front-end deve ler o arquivo com `FileReader` e extrair a string Base64 limpa antes de disparar o `fetch`:

```javascript
const inputArquivo = document.querySelector('#meuArquivo');
const arquivo = inputArquivo.files[0];

const reader = new FileReader();
reader.onloadend = async () => {
  // Remove o prefixo padrão do formato data URL (ex: "data:text/csv;base64,")
  const base64Limpo = reader.result.split(',')[1];

  const payload = {
    userId: "ID_DO_USUARIO_LOGADO",
    mensagem: "Analise o padrão de faltas dessa turma por favor.",
    arquivoBase64: base64Limpo,
    mimeType: arquivo.type
  };

  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const dados = await response.json();
  console.log(dados.resposta);
};

if (arquivo) {
  reader.readAsDataURL(arquivo);
}
```

---

## 📦 Como Executar

1. Instale as dependências: `npm install`
2. Execute em modo de desenvolvimento: `npm run dev` ou `node server.js`
