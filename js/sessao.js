// Conexão com o servidor e login (parte pública: não tem regra do negócio).
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, DOMINIO_LOGIN } from './config.js';

export const configurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE_PUBLICA && window.supabase);

export const supabase = configurado
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'registro-pcp-2-sessao' },
    })
  : null;

// Matrícula: só números, como texto (guarda zero à esquerda).
function normalizarMatricula(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

export async function entrar(matriculaDigitada, senha) {
  if (!configurado) throw new Error('O app ainda não está conectado ao servidor.');
  const matricula = normalizarMatricula(matriculaDigitada);
  if (!/^[0-9]{1,15}$/.test(matricula) || !senha) throw new Error('Matrícula ou senha incorretas.');
  if (!navigator.onLine) {
    throw new Error('Este aparelho ainda não tem login salvo. Conecte à internet para entrar pela primeira vez; depois o app abre sem sinal.');
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: `${matricula}@${DOMINIO_LOGIN}`,
    password: senha,
  });
  if (error) {
    if (error.status === 400 || /invalid|banned/i.test(error.message)) throw new Error('Matrícula ou senha incorretas.');
    throw new Error('Não foi possível entrar agora. Tente de novo em instantes.');
  }
}

export async function sair() {
  try { localStorage.removeItem('registro-pcp-2-perfil'); } catch { /* sem armazenamento */ }
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
}

export async function idDaSessao() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
