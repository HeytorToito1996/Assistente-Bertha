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
  } catch {
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

// Histórico de planos de aula do professor (do mais recente para o mais antigo).
export function buscarPlanejamentos(userId) {
  return apiFetch(`/api/planejamentos/${encodeURIComponent(userId)}?limite=50`);
}

// Gera um plano de aula com a IA e devolve o plano já salvo.
export function planejarAula(payload) {
  return apiFetch('/api/planejar-aula', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
//  PLANO DE AULA MENSAL (documento entregue a gestão)
// ============================================================================

// Componentes, séries e bimestres existentes nas planilhas de escopo-sequência.
// Sem argumentos devolve tudo; com `etapa`, devolve só aquele segmento.
export function buscarEscopo(etapa) {
  const query = etapa ? `?etapa=${encodeURIComponent(etapa)}` : '';
  return apiFetch(`/api/escopo${query}`);
}

// disciplinas dentro de um curso do Ensino Técnico (ex.: Administração tem
// "Introdução à Administração" e "Matemática Aplicada").
export function buscarDisciplinas({ etapa, componente, serie, bimestre, anoDoTecnico }) {
  const params = new URLSearchParams();
  if (etapa) params.set('etapa', etapa);
  if (componente) params.set('componente', componente);
  if (serie) params.set('serie', serie);
  if (bimestre) params.set('bimestre', String(bimestre));
  if (anoDoTecnico) params.set('anoDoTecnico', String(anoDoTecnico));
  return apiFetch(`/api/escopo/disciplinas?${params.toString()}`);
}

// Monta o documento do plano de aula. `refinar` pede à IA que reescreva
// metodologia, recuperação, recursos e flexibilização.
export function gerarPlanoAula(payload) {
  return apiFetch('/api/plano-aula', {
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