const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const source = path.join(__dirname, 'base_de_dados');
const target = path.join(__dirname, 'backend', 'base_de_dados');

// 1. Build frontend if not only functions
if (!args.includes('functions')) {
  console.log('--- Construindo o frontend ---');
  spawnSync('npm', ['--prefix', 'frontend', 'run', 'build'], { stdio: 'inherit', shell: true });
}

// 2. Copy data to backend
console.log('--- Copiando base_de_dados para o backend ---');
if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}
fs.cpSync(source, target, { recursive: true });

// 3. Deploy
console.log(`--- Executando firebase deploy ${args.join(' ')} ---`);
const firebaseArgs = ['deploy', ...args];
spawnSync('npx', ['firebase-tools', ...firebaseArgs], { stdio: 'inherit', shell: true });

// 4. Cleanup
console.log('--- Limpando copia temporaria ---');
fs.rmSync(target, { recursive: true, force: true });

console.log('--- Deploy concluido ---');
