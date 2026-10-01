// Base vazia: o Vite faz proxy de "/api" para http://localhost:3000.
// (Alternativa: apontar para a URL real do back-end em produção.)

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function apiFetch(caminho, opcoes = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const resposta = await fetch(`${API_BASE}${caminho}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', ...opcoes.headers },
      signal: controller.signal,
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw new Error(dados?.erro || `Falha na requisição (HTTP ${resposta.status}).`);
    }
    if (!dados) throw new Error('O servidor retornou uma resposta inválida. Confira se o backend está iniciado.');
    return dados;
  } catch (erro) {
    if (erro.name === 'AbortError') throw new Error('O servidor demorou para responder. Tente novamente.');
    if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e se o backend está iniciado.');
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

export async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  const copiado = document.execCommand('copy');
  campo.remove();
  if (!copiado) throw new Error('Selecione o texto e copie manualmente.');
}

export function validarArquivo(arquivo) {
  if (arquivo.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter até 20 MB.');
  if (!/\.(csv|xlsx?|txt|html?|md|pdf|docx?)$/i.test(arquivo.name)) throw new Error('Formato não suportado. Use PDF, Word, planilhas ou texto.');
}

export function buscarUsuario(userId) {
  return apiFetch(`/api/usuario/${encodeURIComponent(userId)}`);
}

export function buscarHistorico(userId) {
  return apiFetch(`/api/historico/${encodeURIComponent(userId)}?limite=500`);
}

export function excluirHistorico(userId, messageIds) {
  return apiFetch(`/api/historico/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ messageIds }),
  });
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
export function salvarPlanoAula(userId, id, documento) {
  return apiFetch(`/api/plano-aula/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ documento }),
  });
}
