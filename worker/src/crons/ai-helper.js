// Fallback chain de modelos Workers AI
// Adicione/remova conforme disponibilidade em developers.cloudflare.com/workers-ai/models/
const AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/qwen/qwq-32b',
];

const ERROS_DESCONTINUACAO = ['deprecated', 'not found', 'model not available', 'no longer supported'];

export async function runAI(env, messages, maxTokens = 4000) {
  const erros = [];
  for (const model of AI_MODELS) {
    try {
      const res = await env.AI.run(model, { messages, max_tokens: maxTokens });
      const text = typeof res === 'string' ? res : (res.response ?? '');
      if (text.length > 100) return { text, model };
    } catch (e) {
      const msg = e.message?.toLowerCase() || '';
      const descontinuado = ERROS_DESCONTINUACAO.some(s => msg.includes(s));
      erros.push(`${model}: ${descontinuado ? 'DESCONTINUADO' : e.message}`);
    }
  }
  throw new Error(`Todos os modelos falharam: ${erros.join(' | ')}`);
}

export function parseConteudo(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const m = clean.match(/TITULO:\s*(.+)\s*\n+\s*DESCRICAO:\s*([\s\S]+?)\s*\n+\s*CONTEUDO:\s*\n?([\s\S]+)/);
  if (!m) return null;
  return {
    titulo:    m[1].trim().replace(/^["*#]+|["*#]+$/g, '').slice(0, 120),
    descricao: m[2].trim().replace(/\s+/g, ' ').slice(0, 200),
    conteudo:  m[3].trim(),
  };
}

export async function logCron(env, cronName, status, mensagem, modeloUsado = null) {
  await env.DB.prepare(
    `INSERT INTO cron_logs (cron_name, status, mensagem, modelo_usado) VALUES (?, ?, ?, ?)`
  ).bind(cronName, status, mensagem, modeloUsado).run();
}

export async function sendTelegram(env, texto, parseMode = 'HTML') {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_ID) return;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: env.TELEGRAM_GROUP_ID, text: texto };
  if (parseMode) payload.parse_mode = parseMode;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function chunkText(text, maxLen = 3900) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < 500) cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < 500) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
