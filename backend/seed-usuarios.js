// ============================================================================
//  SEMEADOR DE USUÁRIOS DEMO
// ----------------------------------------------------------------------------
//  Cria/atualiza credenciais de login (e-mail + senha com hash scrypt) para os
//  usuários existentes no Firestore, permitindo entrar pelo novo login.
//
//  USO:  npm run seed:usuarios
//
//  Credenciais criadas (se ainda não existirem):
//    Maria (ALUNO-001)  -> maria@escola.edu.br  / aluno123  (cargo: aluno)
//    Ana   (SEC-001)    -> ana@escola.edu.br    / gestao123 (cargo: secretaria)
//
//  O script é "idempotente": se o usuário já tiver e-mail, ele não sobrescreve.
// ============================================================================

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initializeApp, cert, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function criarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function inicializarFirebase() {
  if (getApps().length > 0) {
    return getFirestore();
  }
  const caminhoCredencial = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const caminhoAbsoluto = caminhoCredencial ? path.resolve(__dirname, caminhoCredencial) : null;

  if (caminhoAbsoluto && !fs.existsSync(caminhoAbsoluto)) {
    console.error(
      `\n[ERRO FATAL] Arquivo de credencial do Firebase não encontrado em:\n  "${caminhoAbsoluto}"\n` +
        'Confira a variável FIREBASE_SERVICE_ACCOUNT_PATH no arquivo ".env".\n'
    );
    process.exit(1);
  }

  if (caminhoAbsoluto && fs.existsSync(caminhoAbsoluto)) {
    const credencial = JSON.parse(fs.readFileSync(caminhoAbsoluto, 'utf8'));
    initializeApp({ credential: cert(credencial) });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
  return getFirestore();
}

const USUARIOS_DEMO = [
  {
    userId: 'ALUNO-001',
    nome: 'Maria',
    email: 'maria@escola.edu.br',
    senha: 'aluno123',
    cargo: 'aluno',
  },
  {
    userId: 'SEC-001',
    nome: 'Ana',
    email: 'ana@escola.edu.br',
    senha: 'gestao123',
    cargo: 'secretaria',
  },
];

async function principal() {
  const db = inicializarFirebase();
  const colecao = db.collection('usuarios');

  console.log('== Semeando credenciais dos usuários demo ==\n');
  for (const demo of USUARIOS_DEMO) {
    const ref = colecao.doc(demo.userId);
    const doc = await ref.get();
    let resumo;

    if (!doc.exists) {
      await ref.set({
        nome: demo.nome,
        email: demo.email,
        senhaHash: criarHashSenha(demo.senha),
        cargo: demo.cargo,
        criadoEm: new Date(),
      });
      resumo = 'criado';
    } else {
      const atual = doc.data();
      const atualizar = {};
      if (!atual.email) atualizar.email = demo.email;
      if (!atual.senhaHash) atualizar.senhaHash = criarHashSenha(demo.senha);
      if (!atual.nome) atualizar.nome = demo.nome;
      if (!atual.cargo) atualizar.cargo = demo.cargo;

      if (Object.keys(atualizar).length > 0) {
        await ref.update(atualizar);
        resumo = 'atualizado (' + Object.keys(atualizar).join(', ') + ')';
      } else {
        resumo = 'já tinha credenciais (nada alterado)';
      }
    }

    const email = doc.exists && doc.data().email ? doc.data().email : demo.email;
    console.log(`  - ${demo.userId} | ${demo.nome} | ${email} | ${resumo}`);
  }

  console.log('\nPara testar o login:');
  console.log('  Aluno:    maria@escola.edu.br / aluno123');
  console.log('  Gestão:   ana@escola.edu.br   / gestao123');
}

principal().catch((erro) => {
  console.error('[ERRO] Falha ao semear usuários:', erro);
  process.exit(1);
});