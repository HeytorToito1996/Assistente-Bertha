// Base vazia: o Vite faz proxy de "/api" para http://localhost:3000.
// (Alternativa: apontar para a URL real do back-end em produção.)

async function apiFetch(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });

  let dados = null;
  try {
    dados = await resposta.json();
  } catch (_) {
    // Corpo não é JSON; segue sem dados.
  }

  if (!resposta.ok) {
    throw new Error(dados?.erro || `Falha na requisição (HTTP ${resposta.status}).`);
  }
  return dados;
}

export function buscarUsuario(userId) {
  return apiFetch(`/api/usuario/${encodeURIComponent(userId)}`);
}

export function buscarHistorico(userId) {
  return apiFetch(`/api/historico/${encodeURIComponent(userId)}?limite=500`);
}

export function login(email, senha) {
  return apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
}

export function criarUsuario(usuario) {
  return apiFetch('/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(usuario),
  });
}

export function enviarChat(payload) {
  return apiFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result);
      const base64 = resultado.split(',')[1];
      if (!base64) {
        reject(new Error('Falha ao extrair o Base64 do arquivo.'));
        return;
      }
      resolve(base64);
    };
    leitor.onerror = () => reject(new Error('Falha ao ler o arquivo local.'));
    leitor.readAsDataURL(arquivo);
  });
}