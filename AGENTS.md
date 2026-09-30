# AGENTS.md

Diretrizes de trabalho para agentes neste repositório.

## Limpeza de dados de teste (obrigatório)

Sempre que criar **mocks, seeds ou dados de teste** em qualquer ambiente (Firestore,
`.env`, arquivos `dist/`, scripts temporários), **removê-los ao final da validação**,
sem esperar por nova instrução.

Vale para qualquer verificação feita durante o desenvolvimento: geração de planos de
aula via `POST /api/planejar-aula`, mensagens criadas via `POST /api/chat`, usuários
temporários, scripts de diagnóstico (`dbg.mjs`, `limpar-*.mjs`) e builds locais.

O objetivo é entregar o repositório e os dados do Firestore no mesmo estado em que
estavam antes da verificação, sem sobras que poluam o histórico do professor.

Exemplo de remoção dos planos gerados em teste:

```bash
cd backend
# script temporário com firebase-admin, apaga planejamentos/{userId}/aulas e sai
node limpar-planos.mjs && del limpar-planos.mjs
```

## Verificação

Antes de considerar uma alteração concluída:

- `node --check server.js` no backend;
- `npm run lint` e `npm run build` no frontend;
- Exercício real da funcionalidade (API e/ou navegador), não só a compilação.
