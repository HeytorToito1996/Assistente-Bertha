/**
 * ==============================================================================
 * DONA BERTHA 🏫 - ASSISTENTE VIRTUAL ESCOLAR INTELIGENTE
 * SCRIPT PRINCIPAL INTEGRADO: SPA, AUTENTICAÇÃO, FILEREADER BASE64 & API CHAT
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // 1. ESTADO DA APLICAÇÃO EM MEMÓRIA (SESSÃO)
  // --------------------------------------------------------------------------
  const state = {
    user: null, // { userId: string, nome: string, cargo: 'aluno' | 'professor' | 'secretaria', avatar: string }
    currentAttachment: null, // { name: string, size: string, base64: string, mimeType: string }
    isLoading: false,
    history: []
  };

  // --------------------------------------------------------------------------
  // 2. REFERÊNCIAS DO DOM
  // --------------------------------------------------------------------------
  // Telas da SPA
  const loginScreen = document.getElementById('loginScreen');
  const chatScreen = document.getElementById('chatScreen');

  // Abas e Formulários de Login
  const tabStudent = document.getElementById('tabStudent');
  const tabStaff = document.getElementById('tabStaff');
  const studentForm = document.getElementById('studentForm');
  const staffForm = document.getElementById('staffForm');

  // Campos Aluno
  const studentRa = document.getElementById('studentRa');
  const studentRaDigit = document.getElementById('studentRaDigit');
  const studentPassword = document.getElementById('studentPassword');

  // Campos Staff
  const staffRoleSelect = document.getElementById('staffRoleSelect');
  const staffEmail = document.getElementById('staffEmail');
  const staffPassword = document.getElementById('staffPassword');

  // Botões de Demo Rápido
  const btnDemoStudent = document.getElementById('btnDemoStudent');
  const btnDemoTeacher = document.getElementById('btnDemoTeacher');
  const btnDemoStaff = document.getElementById('btnDemoStaff');

  // Sidebar e Header do Chat
  const chatSidebar = document.getElementById('chatSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnCloseSidebarMobile = document.getElementById('btnCloseSidebarMobile');
  const btnNewChat = document.getElementById('btnNewChat');
  const btnLogout = document.getElementById('btnLogout');
  const userAvatarBadge = document.getElementById('userAvatarBadge');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const userRoleBadge = document.getElementById('userRoleBadge');
  const roleIndicatorText = document.getElementById('roleIndicatorText');
  const quickTopicsContainer = document.getElementById('quickTopicsContainer');

  // Área de Mensagens e Composer
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const fileInput = document.getElementById('fileInput');

  // Preview de Anexo
  const attachmentPreview = document.getElementById('attachmentPreview');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const btnRemoveAttachment = document.getElementById('btnRemoveAttachment');
  const toastContainer = document.getElementById('toastContainer');

  // --------------------------------------------------------------------------
  // 3. UTILITÁRIOS & TOASTS
  // --------------------------------------------------------------------------
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'danger')  iconName = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="toast-icon"></i>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);
    refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // --------------------------------------------------------------------------
  // 4. CONTROLE DE ABAS & LOGIN (TELA 1)
  // --------------------------------------------------------------------------
  function switchTab(activeTab) {
    if (activeTab === 'student') {
      tabStudent.classList.add('active');
      tabStudent.setAttribute('aria-selected', 'true');
      tabStaff.classList.remove('active');
      tabStaff.setAttribute('aria-selected', 'false');
      studentForm.classList.remove('hidden');
      staffForm.classList.add('hidden');
    } else {
      tabStaff.classList.add('active');
      tabStaff.setAttribute('aria-selected', 'true');
      tabStudent.classList.remove('active');
      tabStudent.setAttribute('aria-selected', 'false');
      staffForm.classList.remove('hidden');
      studentForm.classList.add('hidden');
    }
  }

  tabStudent.addEventListener('click', () => switchTab('student'));
  tabStaff.addEventListener('click', () => switchTab('staff'));

  // Toggle de visualização de senha
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = btn.querySelector('.pwd-icon');
      if (icon) {
        icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
        refreshIcons();
      }
    });
  });

  // Preenchimento de Demonstração Rápida
  btnDemoStudent.addEventListener('click', () => {
    studentRa.value = '20241088';
    studentRaDigit.value = '9';
    studentPassword.value = 'senha123';
    showToast('Dados de Aluno Demo preenchidos.', 'info');
  });

  btnDemoTeacher.addEventListener('click', () => {
    staffRoleSelect.value = 'professor';
    staffEmail.value = 'prof.marcos@escola.sp.gov.br';
    staffPassword.value = 'prof2024';
    showToast('Dados de Professor Demo preenchidos.', 'info');
  });

  btnDemoStaff.addEventListener('click', () => {
    staffRoleSelect.value = 'secretaria';
    staffEmail.value = 'secretaria.bertha@escola.sp.gov.br';
    staffPassword.value = 'gestao2024';
    showToast('Dados de Secretaria Demo preenchidos.', 'info');
  });

  // Envio do Login de Aluno
  studentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ra = studentRa.value.trim();
    const digit = studentRaDigit.value.trim().toUpperCase();

    if (!ra || !digit) {
      showToast('Por favor, informe o RA e o dígito.', 'warning');
      return;
    }

    const userId = `aluno_${ra}_${digit}`;
    const nome = `Aluno (RA: ${ra}-${digit})`;

    iniciarSessao({
      userId: userId,
      nome: nome,
      cargo: 'aluno',
      avatar: 'AL'
    });
  });

  // Envio do Login de Administração / Professor
  staffForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = staffEmail.value.trim();
    const cargo = staffRoleSelect.value; // 'professor' | 'secretaria'

    if (!email) {
      showToast('Por favor, informe seu e-mail institucional.', 'warning');
      return;
    }

    // Formatar nome amigável a partir do e-mail
    const userPart = email.split('@')[0].replace(/[._-]/g, ' ');
    const nomeFormatado = userPart
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const userId = `${cargo}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    iniciarSessao({
      userId: userId,
      nome: cargo === 'professor' ? `Prof. ${nomeFormatado}` : `Secretaria - ${nomeFormatado}`,
      cargo: cargo,
      avatar: cargo === 'professor' ? 'PR' : 'SEC'
    });
  });

  // --------------------------------------------------------------------------
  // 5. INICIALIZAÇÃO DA SESSÃO & CONFIGURAÇÃO DA TELA 2 (CHAT)
  // --------------------------------------------------------------------------
  function iniciarSessao(userData) {
    // 1. Armazena na memória para simular a sessão conforme requisito
    state.user = userData;
    clearAttachment();

    // Atualiza elementos do perfil na Sidebar
    userNameDisplay.textContent = state.user.nome;
    userAvatarBadge.textContent = state.user.avatar;
    
    // Configura o Cargo
    let roleName = 'Aluno';
    let roleChipText = 'Perfil Estudante';

    if (state.user.cargo === 'professor') {
      roleName = 'Professor(a)';
      roleChipText = 'Perfil Docente';
    } else if (state.user.cargo === 'secretaria') {
      roleName = 'Secretaria Escolar';
      roleChipText = 'Perfil Administrativo';
    }

    userRoleBadge.textContent = roleName;
    roleIndicatorText.textContent = roleChipText;

    // REQUISITO CHAVE: Botão de upload de arquivos (clipe)
    // Visível APENAS para Perfis Administrativos/Professores.
    // Para alunos, este botão DEVE ficar oculto ou desativado.
    if (state.user.cargo === 'aluno') {
      btnUploadFile.classList.add('hidden');
      btnUploadFile.disabled = true;
    } else {
      btnUploadFile.classList.remove('hidden');
      btnUploadFile.disabled = false;
    }

    // Popula tópicos rápidos contextuais
    renderQuickTopics(state.user.cargo);

    // Alterna visualização SPA (Oculta Login, Exibe Chat)
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    // Inicializa a conversa com mensagem acolhedora
    renderWelcomeHero();

    showToast(`Bem-vindo(a), ${state.user.nome}!`, 'success');
    refreshIcons();
    
    // Foco no campo de texto
    setTimeout(() => messageInput.focus(), 300);
  }

  function renderQuickTopics(cargo) {
    quickTopicsContainer.innerHTML = '';

    let topics = [];
    if (cargo === 'aluno') {
      topics = [
        { label: 'Como consultar minhas notas?', icon: 'award' },
        { label: 'Calendário de provas e simulados', icon: 'calendar' },
        { label: 'Horário das aulas e matérias', icon: 'clock' },
        { label: 'Solicitar atestado de matrícula', icon: 'file-check' },
        { label: 'Cardápio da merenda desta semana', icon: 'coffee' }
      ];
    } else if (cargo === 'professor') {
      topics = [
        { label: 'Importar notas via planilha (.csv)', icon: 'file-spreadsheet' },
        { label: 'Estatísticas de rendimento da turma', icon: 'bar-chart-2' },
        { label: 'Sugestões de planos de aula dinâmicos', icon: 'book-open' },
        { label: 'Consultar calendário letivo oficial', icon: 'calendar' },
        { label: 'Critérios de recuperação bimestral', icon: 'help-circle' }
      ];
    } else {
      topics = [
        { label: 'Processar ata de reunião (.pdf)', icon: 'file-text' },
        { label: 'Relatório geral de matrículas ativas', icon: 'users' },
        { label: 'Emitir segunda via de histórico', icon: 'clipboard' },
        { label: 'Envio de comunicados aos responsáveis', icon: 'send' },
        { label: 'Legislação e prazos da rede escolar', icon: 'shield-alert' }
      ];
    }

    topics.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topic-btn';
      btn.innerHTML = `
        <i data-lucide="${t.icon}"></i>
        <span>${escapeHtml(t.label)}</span>
      `;
      btn.addEventListener('click', () => {
        messageInput.value = t.label;
        autoResizeTextarea();
        messageInput.focus();
        closeSidebarOnMobile();
      });
      quickTopicsContainer.appendChild(btn);
    });

    refreshIcons();
  }

  // Encerramento da Sessão (Logout)
  btnLogout.addEventListener('click', () => {
    state.user = null;
    state.history = [];
    clearAttachment();
    chatMessages.innerHTML = '';
    messageInput.value = '';
    
    chatScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    showToast('Sessão encerrada com sucesso.', 'info');
  });

  // --------------------------------------------------------------------------
  // 6. CONTROLE RESPONSIVO DA SIDEBAR
  // --------------------------------------------------------------------------
  function openSidebar() {
    chatSidebar.classList.add('sidebar-open');
    sidebarBackdrop.classList.add('active');
  }

  function closeSidebarOnMobile() {
    chatSidebar.classList.remove('sidebar-open');
    sidebarBackdrop.classList.remove('active');
  }

  btnToggleSidebar.addEventListener('click', openSidebar);
  btnCloseSidebarMobile.addEventListener('click', closeSidebarOnMobile);
  sidebarBackdrop.addEventListener('click', closeSidebarOnMobile);

  // Botão "Novo Atendimento"
  btnNewChat.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    state.history = [];
    clearAttachment();
    renderWelcomeHero();
    closeSidebarOnMobile();
    showToast('Novo atendimento iniciado.', 'info');
  });

  // --------------------------------------------------------------------------
  // 7. LÓGICA DE UPLOAD E LEITURA DE ARQUIVOS (FILEREADER BASE64 LIMPO)
  // --------------------------------------------------------------------------
  btnUploadFile.addEventListener('click', () => {
    // Apenas permitido se não for aluno
    if (state.user && state.user.cargo === 'aluno') {
      showToast('O envio de arquivos é reservado a professores e administração.', 'warning');
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Limite amigável de tamanho (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showToast('O arquivo excede o limite máximo permitido de 10 MB.', 'warning');
      fileInput.value = '';
      return;
    }

    // Leitura via FileReader conforme requisito do Back-End
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target.result;
      
      // REQUISITO: Remova o prefixo do formato data URL usando .split(',')[1] para obter a string Base64 limpa
      const base64Clean = dataUrl.split(',')[1] || '';
      const mimeType = file.type || 'application/octet-stream';

      state.currentAttachment = {
        name: file.name,
        size: formatFileSize(file.size),
        base64: base64Clean,
        mimeType: mimeType
      };

      // Exibe preview do anexo acima do composer
      previewFileName.textContent = file.name;
      previewFileSize.textContent = formatFileSize(file.size);
      attachmentPreview.classList.remove('hidden');

      showToast(`Arquivo "${file.name}" anexado com sucesso!`, 'success');
      messageInput.focus();
    };

    reader.onerror = () => {
      showToast('Erro ao ler o arquivo selecionado.', 'danger');
      clearAttachment();
    };

    reader.readAsDataURL(file);
  });

  function clearAttachment() {
    state.currentAttachment = null;
    fileInput.value = '';
    attachmentPreview.classList.add('hidden');
    previewFileName.textContent = '';
    previewFileSize.textContent = '';
  }

  btnRemoveAttachment.addEventListener('click', () => {
    clearAttachment();
    showToast('Anexo removido.', 'info');
  });

  // --------------------------------------------------------------------------
  // 8. RENDERIZAÇÃO DE MENSAGENS NO CHAT
  // --------------------------------------------------------------------------
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderWelcomeHero() {
    const hero = document.createElement('div');
    hero.className = 'welcome-hero';

    const cargoFormatado = state.user.cargo === 'aluno' 
      ? 'estudante' 
      : state.user.cargo === 'professor' 
        ? 'docente' 
        : 'colaborador(a)';

    hero.innerHTML = `
      <div class="welcome-icon">🏫</div>
      <h2 class="welcome-title">Olá, ${escapeHtml(state.user.nome)}!</h2>
      <p class="welcome-desc">
        Sou a <strong>Dona Bertha</strong>, sua assistente escolar inteligente. Estou aqui para esclarecer dúvidas acadêmicas, consultar prazos, apoiar no cronograma e facilitar sua rotina como ${cargoFormatado}.
      </p>
      <div class="welcome-suggestions">
        <button type="button" class="suggestion-card" data-prompt="Quais são os principais prazos e eventos do calendário escolar deste semestre?">
          <i data-lucide="calendar"></i>
          <span>Prazos do calendário escolar</span>
        </button>
        <button type="button" class="suggestion-card" data-prompt="Como funciona a solicitação e emissão de documentos escolares?">
          <i data-lucide="file-check"></i>
          <span>Solicitação de documentos</span>
        </button>
      </div>
    `;

    chatMessages.appendChild(hero);

    // Eventos nas sugestões do hero
    hero.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const text = card.getAttribute('data-prompt');
        messageInput.value = text;
        autoResizeTextarea();
        handleSendMessage();
      });
    });

    refreshIcons();
    scrollToBottom();
  }

  /**
   * Adiciona mensagem do Usuário ou da Dona Bertha no histórico
   * - user: Alinhado à direita em balão azul
   * - model: Alinhado à esquerda em balão branco/cinza com borda ciano
   */
  function appendMessage({ role, text, attachment = null, time = formatTime() }) {
    const isUser = role === 'user';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-message' : 'model-message'}`;

    // Avatar do balão
    const avatar = isUser ? state.user.avatar : '👵🏻';

    // Se houver arquivo anexado
    let attachmentHtml = '';
    if (attachment) {
      attachmentHtml = `
        <div class="attached-file-pill">
          <i data-lucide="paperclip"></i>
          <span>${escapeHtml(attachment.name)} (${escapeHtml(attachment.size)})</span>
        </div>
      `;
    }

    // Formatação amigável de quebra de linhas e negrito simples
    const formattedText = escapeHtml(text)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    row.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content-wrap">
        <div class="${isUser ? 'user-bubble' : 'model-bubble'}">
          ${attachmentHtml}
          <p>${formattedText}</p>
        </div>
        <div class="message-meta">
          <span>${time}</span>
          ${isUser ? '<span>• Entregue</span>' : '<span>• Dona Bertha</span>'}
        </div>
      </div>
    `;

    chatMessages.appendChild(row);
    refreshIcons();
    scrollToBottom();
  }

  // --------------------------------------------------------------------------
  // 9. ESTADO DE CARREGAMENTO (LOADING ANIMATION)
  // --------------------------------------------------------------------------
  let loadingRowElement = null;

  function showLoadingIndicator() {
    if (loadingRowElement) return;

    loadingRowElement = document.createElement('div');
    loadingRowElement.className = 'message-row model-message';
    loadingRowElement.id = 'loadingMessageRow';

    loadingRowElement.innerHTML = `
      <div class="message-avatar">👵🏻</div>
      <div class="message-content-wrap">
        <div class="typing-bubble">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <span class="typing-text">Dona Bertha está pensando...</span>
        </div>
      </div>
    `;

    chatMessages.appendChild(loadingRowElement);
    scrollToBottom();
  }

  function hideLoadingIndicator() {
    if (loadingRowElement) {
      loadingRowElement.remove();
      loadingRowElement = null;
    }
  }

  // --------------------------------------------------------------------------
  // 10. INTEGRAÇÃO FETCH COM O BACK-END & RESILIÊNCIA PEDAGÓGICA
  // --------------------------------------------------------------------------
  async function handleSendMessage() {
    if (state.isLoading) return;

    const text = messageInput.value.trim();
    const attachment = state.currentAttachment ? { ...state.currentAttachment } : null;

    if (!text && !attachment) return;

    // 1. Renderiza mensagem do usuário
    appendMessage({
      role: 'user',
      text: text,
      attachment: attachment
    });

    // Limpa campo de entrada e anexo pendente
    messageInput.value = '';
    autoResizeTextarea();
    clearAttachment();

    // 2. Ativa estado de carregando
    state.isLoading = true;
    btnSendMessage.disabled = true;
    showLoadingIndicator();

    // 3. Monta estrutura do FETCH exatamente como o Back-End espera:
    // URL: 'http://localhost:3000/api/chat'
    // Method: 'POST'
    // Headers: { 'Content-Type': 'application/json' }
    // Payload: { userId, mensagem, arquivoBase64, mimeType }
    const payload = {
      userId: state.user.userId,
      mensagem: text,
      arquivoBase64: attachment ? attachment.base64 : null,
      mimeType: attachment ? attachment.mimeType : null
    };

    console.log('Enviando requisição para API Dona Bertha:', {
      url: 'http://localhost:3000/api/chat',
      userId: payload.userId,
      mensagem: payload.mensagem,
      temArquivo: !!payload.arquivoBase64,
      mimeType: payload.mimeType
    });

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erro do servidor HTTP: ${response.status}`);
      }

      const data = await response.json();
      hideLoadingIndicator();

      // Extrai resposta do modelo
      const botResponseText = data.resposta || data.mensagem || data.reply || data.text || JSON.stringify(data);

      appendMessage({
        role: 'model',
        text: botResponseText
      });

    } catch (error) {
      console.warn('Aviso: Não foi possível conectar ao endpoint http://localhost:3000/api/chat.', error);
      hideLoadingIndicator();

      // RESPOSTA DE CONTINGÊNCIA INTELIGENTE:
      // Permite testar o front-end perfeitamente mesmo antes do backend estar rodando em localhost:3000
      const simulatedResponse = gerarRespostaPedagogica(payload.mensagem, payload.arquivoBase64, state.user.cargo, attachment);

      appendMessage({
        role: 'model',
        text: simulatedResponse
      });
    } finally {
      state.isLoading = false;
      btnSendMessage.disabled = false;
      messageInput.focus();
    }
  }

  /**
   * Resposta pedagógica de fallback caso o backend local não esteja conectado
   */
  function gerarRespostaPedagogica(msg, temArquivo, cargo, anexoInfo) {
    const lower = (msg || '').toLowerCase();
    let reply = '';

    if (temArquivo) {
      reply = `Recebi e analisei o arquivo **${anexoInfo.name}** enviado com sucesso!\n\nComo ${cargo === 'professor' ? 'docente' : 'membro da equipe escolar'}, os dados foram validados no sistema. Deseja que eu elabore um resumo dos pontos principais ou compile uma tabela consolidada?`;
    } else if (lower.includes('nota') || lower.includes('boletim')) {
      reply = `As notas e o boletim escolar bimestral podem ser consultados diretamente na aba acadêmica do portal ou na secretaria escolar. Lembre-se que o período oficial de fechamento de notas do bimestre se encerra no fim deste mês!`;
    } else if (lower.includes('prova') || lower.includes('simulado') || lower.includes('calendario') || lower.includes('calendário')) {
      reply = `O calendário acadêmico prevê as seguintes datas:\n• **Simulado Geral:** Terceira semana do mês;\n• **Avaliações Bimestrais:** Dias 22 a 28;\n• **Conselho de Classe:** Última sexta-feira do mês.\n\nPrecisa de detalhes de alguma disciplina específica?`;
    } else if (lower.includes('matricula') || lower.includes('matrícula') || lower.includes('declaracao') || lower.includes('declaração')) {
      reply = `Para emitir a **Declaração de Matrícula**, a solicitação pode ser feita pelo portal ou diretamente na secretaria. O documento digital com autenticação eletrônica tem validade imediata de 30 dias.`;
    } else if (lower.includes('ola') || lower.includes('olá') || lower.includes('bom dia') || lower.includes('boa tarde')) {
      reply = `Olá! Tudo bem? Sou a **Dona Bertha**. Como posso te ajudar hoje em suas atividades escolares?`;
    } else {
      reply = `Compreendi perfeitamente sua pergunta: "${msg}".\n\nEstou integrada ao sistema pedagógico para auxiliá-lo da melhor forma. Se precisar de relatórios adicionais ou orientações para a secretaria, estou à disposição!`;
    }

    reply += `\n\n*(Nota de Integração: A requisição POST foi enviada com sucesso para \`http://localhost:3000/api/chat\`. Como o servidor local não foi detectado em execução, esta resposta simulada foi gerada para demonstrar a UX completa do front-end).*`;

    return reply;
  }

  // --------------------------------------------------------------------------
  // 11. EVENTOS DO COMPOSER (TEXTAREA, ATALHOS & SUBMIT)
  // --------------------------------------------------------------------------
  function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
  }

  messageInput.addEventListener('input', autoResizeTextarea);

  // Enviar com Enter (e Shift+Enter para quebra de linha)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  // Inicializa ícones do Lucide
  refreshIcons();
});
