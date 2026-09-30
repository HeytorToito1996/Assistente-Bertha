// Verificacao do plano de aula mensal em cada segmento.
// Executar com: node verificar-plano-aula.js
// Os documentos gerados aqui NAO sao salvos (salvar=false), entao nao deixam
// dados de teste no Firestore.

const casos = [
  {
    nome: 'Tecnico / Administracao',
    corpo: {
      etapa: 'Ensino Tecnico', componente: 'Administracao', anoDoTecnico: 1, bimestre: 1, bloco: 1,
    },
  },
  {
    nome: 'Tecnico com acento e disciplina',
    corpo: {
      etapa: 'Ensino Técnico', componente: 'Desenvolvimento de Sistemas', anoDoTecnico: 2, bimestre: 2, bloco: 2,
    },
  },
  {
    // A materia vem da aba CCM, que entra no 1o ano do curso.
    nome: 'Tecnico / Carreira e Competencias (aba CCM no 1o ano)',
    corpo: {
      etapa: 'Ensino Tecnico', componente: 'Desenvolvimento de Sistemas',
      disciplina: 'Carreira e Competências para o Mercado de Trabalho',
      anoDoTecnico: 1, bimestre: 1, bloco: 1,
    },
  },
  {
    // A materia vem da aba PMD, que fecha o 2o ano do curso.
    nome: 'Tecnico / Projeto Interdisciplinar (aba PMD no 2o ano)',
    corpo: {
      etapa: 'Ensino Tecnico', componente: 'Desenvolvimento de Sistemas',
      disciplina: 'Projeto Interdisciplinar',
      anoDoTecnico: 2, bimestre: 3, bloco: 1,
    },
  },
  {
    nome: 'Tecnico / Ciencia de Dados (ex-aba DADOS)',
    corpo: {
      etapa: 'Ensino Tecnico', componente: 'Ciencia de Dados',
      disciplina: 'Aprendizagem de Máquina',
      anoDoTecnico: 2, bimestre: 1, bloco: 2,
    },
  },
  {
    nome: 'Anos Iniciais / Matematica 5ano',
    corpo: { etapa: 'Anos Iniciais', componente: 'Matemática', serie: '5º ano', bimestre: 1, bloco: 1 },
  },
  {
    nome: 'Anos Finais / Educacao Financeira 7ano',
    corpo: { etapa: 'Anos Finais', componente: 'Educação Financeira', serie: '7º ano', bimestre: 1, bloco: 1 },
  },
  {
    nome: 'Ensino Medio / Aprof. Biologia',
    corpo: { etapa: 'Ensino Medio', componente: 'Aprof. Biologia', serie: '3º ano', bimestre: 1, bloco: 2 },
  },
  {
    nome: 'Sem escopo (componente digitado a mao)',
    corpo: { etapa: 'Anos Iniciais', componente: 'Filosofia', serie: '3º ano', bimestre: 3, bloco: 1 },
  },
];

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function linha(char = '-') {
  return char.repeat(72);
}

(async () => {
  for (const caso of casos) {
    const resposta = await fetch(`${BASE}/api/plano-aula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'PROF-002',
        salvar: false,
        ...caso.corpo,
      }),
    });
    const dados = await resposta.json();

    console.log(`\n${linha('=')}`);
    console.log(`${caso.nome}  ->  HTTP ${resposta.status}`);
    console.log(linha('='));

    if (!resposta.ok) {
      console.log('  ERRO:', dados.erro);
      continue;
    }

    const p = dados.plano;
    const c = p.cabecalho;
    console.log(`  ${c.componente}${c.disciplina ? ' / ' + c.disciplina : ''}${c.serie ? ' / ' + c.serie : ''}`);
    console.log(`  ${c.bimestre} - ${c.bloco} (${p.bloco ? p.bloco.inicio + ' a ' + p.bloco.fim : 'sem datas'})`);

    for (const s of p.semanas) {
      console.log(`    ${s.rotulo}: ${s.dataInicio} a ${s.dataFim}  (${s.aulas.length} aulas)`);
    }
    console.log(`  sera ministrado: ${p.oQueSeraMinistrado.length} itens`);
    p.oQueSeraMinistrado.slice(0, 4).forEach((t) => console.log(`    - ${t}`));
    if (p.oQueSeraMinistrado.length > 4) console.log(`    ... e mais ${p.oQueSeraMinistrado.length - 4}`);
    console.log(`  comp. tecnica: ${p.competenciaTecnica.length} | socioemocional: ${p.competenciaSocioemocional.length} | habilidades: ${p.habilidades.length}`);
    console.log(`  metodologias: ${p.metodologias.length} | recuperacao: ${p.recuperacaoContinua.length} | recursos: ${p.recursosDidaticos.length} | flexibilizacao: ${p.flexibilizacaoCurricular.length}`);
    if (dados.aviso) console.log(`  AVISO: ${dados.aviso}`);
    if (p._resumo.semEscopo) console.log('  (sem escopo-sequencia para esta combinacao)');
  }
})();
