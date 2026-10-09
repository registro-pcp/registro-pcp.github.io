// Parte pública do app: tela de login e carregador.
// As telas de verdade ficam numa pasta fechada do servidor e só são baixadas
// depois do login. Ficam guardadas no aparelho para funcionar sem internet.
import { configurado, supabase, entrar, sair, idDaSessao } from './sessao.js';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } from './config.js';

const app = document.getElementById('app');
const CACHE_TELAS = 'registro-pcp-telas';
const BASE = new URL('./', location.href).href;
// No computador de testes, as telas vêm da pasta app/ (com ?nuvem, do Supabase).
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('nuvem');
const TIPOS = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8' };

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function aviso(tipo, texto) {
  const icone = { atencao: '!', fora: '✕' }[tipo];
  const palavra = { atencao: 'Atenção', fora: 'Erro' }[tipo];
  return `<div class="status ${tipo}" role="status"><span class="icone" aria-hidden="true">${icone}</span>`
    + `<span><strong>${palavra}:</strong> ${esc(texto)}</span></div>`;
}

const topo = `<header class="topo"><div class="topo-linha"><h1 class="marca">
  <img src="icones/logo-friato-branca.png" alt="Friato" class="logo">Registro PCP</h1></div></header>`;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function telaLogin(mensagem = '') {
  app.innerHTML = `${topo}
  <main class="conteudo">
    <form class="cartao" id="form-login" novalidate>
      <h2>Entrar</h2>
      <label for="matricula">Matrícula</label>
      <input type="text" id="matricula" name="matricula" autocomplete="username"
             inputmode="numeric" pattern="[0-9]*" maxlength="15" required>
      <label for="senha">Senha</label>
      <input type="password" id="senha" name="senha" autocomplete="current-password" required>
      <button class="botao" type="submit">Entrar</button>
      <div id="msg-login">${mensagem}</div>
      <p class="secundario">Acesso restrito. Esqueceu a senha? Peça uma nova ao responsável.</p>
    </form>
  </main>`;

  const form = document.getElementById('form-login');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('button');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      await entrar(form.matricula.value, form.senha.value);
      await iniciar();
    } catch (erro) {
      document.getElementById('msg-login').innerHTML = aviso('fora', erro.message);
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });
}

// ---------------------------------------------------------------------------
// Telas: baixa da pasta fechada (só com login) e guarda no aparelho
// ---------------------------------------------------------------------------
async function baixar(caminho) {
  if (LOCAL) {
    // No computador de testes, as telas vêm da pasta app/ do projeto.
    const r = await fetch(`_app_local/${caminho}?x=${Date.now()}`);
    if (!r.ok) throw new Error(`arquivo ${caminho} não encontrado`);
    return r.blob();
  }
  // Baixa direto, sem deixar cópia no cache comum do navegador (no-store):
  // as telas ficam só no cache do app, que é apagado ao sair.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('sem login');
  const caminhoUrl = caminho.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/app/${caminhoUrl}`, {
    cache: 'no-store',
    headers: { apikey: SUPABASE_CHAVE_PUBLICA, Authorization: `Bearer ${session.access_token}` },
  });
  if (!r.ok) throw new Error(`acesso negado (${r.status})`);
  return r.blob();
}

async function versaoGuardada(cache) {
  const r = await cache.match(`${BASE}app/versao.json`);
  return r ? r.json().catch(() => null) : null;
}

// Garante que as telas estão no aparelho; com internet, atualiza se houver versão nova.
async function garantirTelas() {
  const cache = await caches.open(CACHE_TELAS);
  const atual = await versaoGuardada(cache);
  if (navigator.onLine) {
    try {
      const nova = JSON.parse(await (await baixar('versao.json')).text());
      if (!atual || nova.versao !== atual.versao) {
        const pasta = nova.pasta ? `${nova.pasta}/` : '';
        // Baixa tudo primeiro; só troca as telas se a versão nova chegou inteira.
        const baixados = await Promise.all(nova.arquivos.map(async (nome) => [nome, await baixar(pasta + nome)]));
        for (const [nome, conteudo] of baixados) {
          const tipo = TIPOS[nome.split('.').pop()] ?? 'application/octet-stream';
          await cache.put(`${BASE}app/${nome}`, new Response(conteudo, { headers: { 'Content-Type': tipo } }));
        }
        await cache.put(`${BASE}app/versao.json`, new Response(JSON.stringify(nova), { headers: { 'Content-Type': TIPOS.json } }));
        return nova;
      }
    } catch (erro) {
      if (!atual) throw erro;
    }
  }
  if (!atual) throw new Error('As telas ainda não foram baixadas neste aparelho. Conecte à internet.');
  return atual;
}

// As telas são entregues pelo sw.js a partir do que foi guardado; ele precisa estar ativo.
async function swPronto() {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador não é compatível. Use o Chrome ou o Safari atualizados.');
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    setTimeout(resolve, 3000);
  });
  if (!navigator.serviceWorker.controller) location.reload();
}

async function apagarTelas() {
  try { await caches.delete(CACHE_TELAS); } catch { /* sem cache */ }
}

async function sairDoApp() {
  await apagarTelas();
  await sair();
  telaLogin();
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
async function iniciar() {
  const id = configurado ? await idDaSessao() : null;
  if (!id) return telaLogin();

  app.innerHTML = `${topo}<main class="conteudo"><p class="carregando">Abrindo…</p></main>`;
  try {
    await swPronto();
    const versao = await garantirTelas();
    if (!document.getElementById('css-telas')) {
      const link = document.createElement('link');
      link.id = 'css-telas';
      link.rel = 'stylesheet';
      link.href = `app/app.css?v=${encodeURIComponent(versao.versao)}`;
      document.head.appendChild(link);
    }
    const telas = await import(`${BASE}app/app.js?v=${encodeURIComponent(versao.versao)}`);
    await telas.iniciarApp({ app, sair: sairDoApp, versao: versao.versao });
  } catch (erro) {
    telaErro(await explicarErro(id, erro), String(erro?.message ?? erro));
  }
}

// O servidor responde igual para "arquivo faltando" e "usuário sem acesso";
// o próprio cadastro (que todo usuário logado lê) diz qual é o caso.
async function explicarErro(id, erro) {
  if (!navigator.onLine) return { texto: 'Sem internet, e o app ainda não foi baixado neste aparelho. Conecte à internet e tente de novo.', tentar: true };
  try {
    const { data, error } = await supabase.from('perfis').select('ativo').eq('id', id).maybeSingle();
    if (!error && !data) return { texto: 'Este login não tem cadastro no app. Fale com o responsável.', tentar: false };
    if (!error && data.ativo === false) return { texto: 'Este usuário está desativado. Fale com o responsável.', tentar: false };
  } catch { /* sem resposta: trata como falha ao baixar */ }
  return {
    texto: 'Não foi possível baixar o app agora. Tente de novo em instantes; se continuar, avise o responsável.',
    tentar: true,
  };
}

function telaErro({ texto, tentar }, detalhe) {
  app.innerHTML = `${topo}
  <main class="conteudo">
    <section class="cartao">
      <h2>Não foi possível abrir</h2>
      ${aviso('fora', texto)}
      ${tentar ? '<button class="botao" id="tentar" type="button">Tentar de novo</button>' : ''}
      <button class="botao secundario-btn" id="sair-erro" type="button">Sair</button>
      <p class="secundario detalhe-erro">Detalhe: ${esc(detalhe)}</p>
    </section>
  </main>`;
  document.getElementById('tentar')?.addEventListener('click', iniciar);
  document.getElementById('sair-erro').addEventListener('click', sairDoApp);
}

if (supabase) {
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { apagarTelas(); telaLogin(); }
  });
}

if ('serviceWorker' in navigator) {
  const tinhaControle = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaControle) location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem modo offline */ });
}

iniciar();
