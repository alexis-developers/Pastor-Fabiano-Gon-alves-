// ============================================================
// FABIANO GONÇALVES — API Worker
// Deploy: cd worker && npx wrangler deploy
// NUNCA ativar Git Source no dashboard Cloudflare
// ============================================================

import { cronPastoral  } from './crons/pastoral.js';
import { cronSeo       } from './crons/seo.js';
import { cronSocial    } from './crons/social.js';
import { cronSuportte  } from './crons/suporte.js';
import { cronAnalytics } from './crons/analytics.js';
import { logCron, sendTelegram } from './crons/ai-helper.js';

const ALLOWED_ORIGINS = [
  'https://fabianogoncalves.com.br',
  'https://www.fabianogoncalves.com.br',
  'https://fabiano-site.pages.dev',
  'http://localhost:8788',
  'http://localhost:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function err(msg, status = 400, origin = '') {
  return json({ error: msg }, status, origin);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Comparação em tempo constante — previne timing attack no token
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const ba = enc.encode(a), bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function requireAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token') || request.headers.get('Authorization')?.replace('Bearer ', '');
  return timingSafeEqual(token || '', env.ADMIN_TOKEN || '');
}

// ── Rate limiting (por isolate — suficiente para conter floods) ──
const rateBuckets = new Map();
function rateLimit(request, route, max, windowSec = 60) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `${route}:${ip}`;
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > windowSec * 1000) { b = { start: now, count: 0 }; rateBuckets.set(key, b); }
  b.count++;
  if (rateBuckets.size > 10000) rateBuckets.clear();
  return b.count <= max;
}

// ── Filtro anti-conteúdo eleitoral (proteção TSE) ──
// Bloqueia termos eleitorais em respostas da IA e detecta injeção em conteúdo publicado
const POLITICAL_RE = /\b(candidat\w+|elei[çc][õoã]\w*|vot[eoa]\w*|urna\w*|partid\w+|campanha eleitoral|deputad\w+|vereador\w*|prefeit\w+|senador\w*|governador\w*|presidente da rep[úu]blica|tse|c[âa]mara municipal|assembleia legislativa|numero do candidato|n[úu]mero \d{2,5}\b)/i;

function isPoliticalContent(text) {
  return POLITICAL_RE.test(text || '');
}

// ============================================================
// ROTEADOR
// ============================================================
// ============================================================
// SECURITY SCAN — Varredura diária anti-conteúdo eleitoral
// ============================================================
async function securityScan(env) {
  const results = [];

  // 1. Artigos publicados
  const artigos = await env.DB.prepare(
    `SELECT id, titulo, conteudo FROM artigos WHERE status = 'publicado'`
  ).all();

  for (const a of artigos.results) {
    if (isPoliticalContent(a.titulo) || isPoliticalContent(a.conteudo)) {
      await env.DB.prepare(`UPDATE artigos SET status = 'quarentena' WHERE id = ?`).bind(a.id).run();
      results.push(`ARTIGO #${a.id}: "${a.titulo.slice(0, 60)}"`);
    }
  }

  // 2. Notícias publicadas
  const noticias = await env.DB.prepare(
    `SELECT id, titulo, conteudo FROM noticias WHERE status = 'publicado'`
  ).all();

  for (const n of noticias.results) {
    if (isPoliticalContent(n.titulo) || isPoliticalContent(n.conteudo)) {
      await env.DB.prepare(`UPDATE noticias SET status = 'quarentena' WHERE id = ?`).bind(n.id).run();
      results.push(`NOTÍCIA #${n.id}: "${n.titulo.slice(0, 60)}"`);
    }
  }

  // 3. Pensamentos
  const pensamentos = await env.DB.prepare(
    `SELECT id, texto FROM pensamentos`
  ).all();

  for (const p of pensamentos.results) {
    if (isPoliticalContent(p.texto)) {
      await env.DB.prepare(`DELETE FROM pensamentos WHERE id = ?`).bind(p.id).run();
      results.push(`PENSAMENTO #${p.id}: "${p.texto.slice(0, 60)}" (deletado)`);
    }
  }

  // Log e alerta
  const status = results.length > 0 ? 'alerta' : 'sucesso';
  const mensagem = results.length > 0
    ? `🚨 CONTEÚDO POLÍTICO DETECTADO:\n${results.join('\n')}`
    : 'Nenhum conteúdo político detectado.';

  await logCron(env, 'security-scan', status, mensagem);

  if (results.length > 0) {
    await sendTelegram(env, `🛡️ <b>SECURITY SCAN — ALERTA</b>\n\n${mensagem}\n\nItens movidos para quarentena ou deletados.`);
  }

  return { scanned: artigos.results.length + noticias.results.length + pensamentos.results.length, flagged: results.length };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // ── Público ──────────────────────────────────────────
      if (method === 'GET' && path === '/api/artigos') return getArtigos(env, url, origin);
      if (method === 'GET' && path.match(/^\/api\/artigos\/[^/]+$/)) return getArtigo(env, path.split('/')[3], origin);
      if (method === 'GET' && path === '/api/noticias') return getNoticias(env, url, origin);
      if (method === 'GET' && path.match(/^\/api\/noticias\/[^/]+$/)) return getNoticia(env, path.split('/')[3], origin);
      if (method === 'GET' && path === '/api/mensagens') return getMensagens(env, origin);
      if (method === 'GET' && path === '/api/mensagens/destaque') return getMensagemDestaque(env, origin);
      if (method === 'GET' && path === '/api/pensamento') return getPensamento(env, origin);
      if (method === 'POST' && path === '/api/leads') {
        if (!rateLimit(request, 'leads', 3)) return err('Muitas tentativas. Aguarde um minuto.', 429, origin);
        return postLead(request, env, origin);
      }
      if (method === 'GET' && path === '/api/doutores') return getDoutores(env, origin);
      if (method === 'GET' && path.match(/^\/api\/agenda\/\d+$/)) return getAgenda(env, path.split('/')[3], url, origin);
      if (method === 'POST' && path === '/api/agendamentos') {
        if (!rateLimit(request, 'agend', 3)) return err('Muitas tentativas. Aguarde um minuto.', 429, origin);
        return postAgendamento(request, env, origin);
      }
      if (method === 'GET' && path === '/api/chat') {
        if (!rateLimit(request, 'chat', 10)) return err('Muitas mensagens. Aguarde um instante.', 429, origin);
        return chatHandler(request, env, origin);
      }

      // ── Webhook Telegram ──────────────────────────────────
      if (method === 'POST' && path === '/api/telegram/webhook') {
        if (!rateLimit(request, 'tg', 30)) return json({ ok: true }, 200, origin);
        return telegramWebhook(request, env, origin);
      }

      // ── Admin (requer X-Admin-Token) ──────────────────────
      if (!requireAdmin(request, env)) {
        if (path.startsWith('/api/admin')) return err('Unauthorized', 401, origin);
      }

      // Artigos admin
      if (method === 'POST' && path === '/api/admin/artigos') return adminCreateArtigo(request, env, origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/artigos\/\d+$/)) return adminUpdateArtigo(request, env, path.split('/')[4], origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/artigos\/\d+$/)) return adminDeleteArtigo(env, path.split('/')[4], origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/artigos\/\d+\/status$/)) return adminArtigoStatus(request, env, path.split('/')[4], origin);

      // Notícias admin
      if (method === 'POST' && path === '/api/admin/noticias') return adminCreateNoticia(request, env, origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/noticias\/\d+$/)) return adminUpdateNoticia(request, env, path.split('/')[4], origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/noticias\/\d+$/)) return adminDeleteNoticia(env, path.split('/')[4], origin);

      // Mensagens admin
      if (method === 'GET' && path === '/api/admin/mensagens') return adminGetMensagens(env, origin);
      if (method === 'POST' && path === '/api/admin/mensagens') return adminCreateMensagem(request, env, origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/mensagens\/\d+$/)) return adminUpdateMensagem(request, env, path.split('/')[4], origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/mensagens\/\d+$/)) return adminDeleteMensagem(env, path.split('/')[4], origin);

      // Pensamentos admin
      if (method === 'GET' && path === '/api/admin/pensamentos') return adminGetPensamentos(env, origin);
      if (method === 'POST' && path === '/api/admin/pensamentos') return adminCreatePensamento(request, env, origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/pensamentos\/\d+$/)) return adminDeletePensamento(env, path.split('/')[4], origin);

      // Leads admin
      if (method === 'GET' && path === '/api/admin/leads') return adminGetLeads(env, url, origin);
      if (method === 'GET' && path === '/api/admin/leads/export.csv') return adminExportLeads(env, origin);

      // Doutores admin
      if (method === 'GET' && path === '/api/admin/doutores') return adminGetDoutores(env, origin);
      if (method === 'POST' && path === '/api/admin/doutores') return adminCreateDoutor(request, env, origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/doutores\/\d+$/)) return adminUpdateDoutor(request, env, path.split('/')[4], origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/doutores\/\d+$/)) return adminDeleteDoutor(env, path.split('/')[4], origin);

      // Disponibilidade admin
      if (method === 'GET' && path.match(/^\/api\/admin\/disponibilidade\/\d+$/)) return adminGetDisponibilidade(env, path.split('/')[4], origin);
      if (method === 'POST' && path === '/api/admin/disponibilidade') return adminSaveDisponibilidade(request, env, origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/disponibilidade\/\d+$/)) return adminDeleteDisponibilidade(env, path.split('/')[4], origin);

      // Bloqueios admin
      if (method === 'GET' && path === '/api/admin/bloqueios') return adminGetBloqueios(env, url, origin);
      if (method === 'POST' && path === '/api/admin/bloqueios') return adminCreateBloqueio(request, env, origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/bloqueios\/\d+$/)) return adminDeleteBloqueio(env, path.split('/')[4], origin);

      // Agendamentos admin
      if (method === 'GET' && path === '/api/admin/agendamentos') return adminGetAgendamentos(env, url, origin);
      if (method === 'PUT' && path.match(/^\/api\/admin\/agendamentos\/\d+$/)) return adminUpdateAgendamento(request, env, path.split('/')[4], origin);

      // PDFs admin
      if (method === 'GET' && path === '/api/admin/pdfs') return adminGetPdfs(env, origin);
      if (method === 'POST' && path === '/api/admin/pdfs') return adminCreatePdf(request, env, origin);
      if (method === 'DELETE' && path.match(/^\/api\/admin\/pdfs\/\d+$/)) return adminDeletePdf(env, path.split('/')[4], origin);

      // Upload imagem (R2)
      if (method === 'POST' && path === '/api/admin/upload') return adminUpload(request, env, origin);

      // Logs CRON
      if (method === 'GET' && path === '/api/admin/cron-logs') return adminGetCronLogs(env, url, origin);

      // Trigger CRON manualmente
      if (method === 'POST' && path === '/api/admin/cron/test') {
        const { cron = 'pastoral' } = await request.json().catch(() => ({}));
        if (cron === 'pastoral') await cronPastoral(env);
        else if (cron === 'seo') await cronSeo(env);
        else if (cron === 'social') await cronSocial(env);
        else if (cron === 'security') { const r = await securityScan(env); return json({ ok: true, cron, ...r }, 200, origin); }
        return json({ ok: true, cron }, 200, origin);
      }

      // Artigos admin listagem
      if (method === 'GET' && path === '/api/admin/artigos') return adminGetArtigos(env, url, origin);
      if (method === 'GET' && path === '/api/admin/noticias') return adminGetNoticias(env, url, origin);

      return err('Not found', 404, origin);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ERROR ${method} ${path}:`, e);
      return err('Erro interno do servidor', 500, origin);
    }
  },

  async scheduled(event, env) {
    // cron map — alterar horários em wrangler.toml se necessário
    const map = {
      '0 9 * * *': cronPastoral,
      '0 15 * * *': cronSeo,
      '0 14 * * *': cronSocial,
      '0 15 * * 1': cronSuportte,
      '0 16 * * 1': cronAnalytics,
      '0 17 * * *': securityScan,
    };
    const handler = map[event.cron];
    if (handler) await handler(env);
  },
};

// ============================================================
// HANDLERS PÚBLICOS
// ============================================================

async function getArtigos(env, url, origin) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 12;
  const offset = (page - 1) * limit;
  const rows = await env.DB.prepare(
    `SELECT id, titulo, descricao, slug, imagem_url, palavras_chave, published_at
     FROM artigos WHERE status = 'publicado'
     ORDER BY published_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos WHERE status = 'publicado'`).first();
  return json({ artigos: rows.results, total: total.c, page, pages: Math.ceil(total.c / limit) }, 200, origin);
}

async function getArtigo(env, slug, origin) {
  const row = await env.DB.prepare(`SELECT * FROM artigos WHERE slug = ? AND status = 'publicado'`).bind(slug).first();
  if (!row) return err('Não encontrado', 404, origin);
  return json(row, 200, origin);
}

async function getNoticias(env, url, origin) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 12;
  const offset = (page - 1) * limit;
  const rows = await env.DB.prepare(
    `SELECT id, titulo, subtitulo, slug, foto_url, published_at
     FROM noticias WHERE status = 'publicado'
     ORDER BY published_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM noticias WHERE status = 'publicado'`).first();
  return json({ noticias: rows.results, total: total.c, page, pages: Math.ceil(total.c / limit) }, 200, origin);
}

async function getNoticia(env, slug, origin) {
  const row = await env.DB.prepare(`SELECT * FROM noticias WHERE slug = ? AND status = 'publicado'`).bind(slug).first();
  if (!row) return err('Não encontrado', 404, origin);
  return json(row, 200, origin);
}

async function getMensagens(env, origin) {
  const rows = await env.DB.prepare(`SELECT * FROM mensagens ORDER BY destaque DESC, created_at DESC LIMIT 20`).all();
  return json(rows.results, 200, origin);
}

async function getMensagemDestaque(env, origin) {
  const row = await env.DB.prepare(`SELECT * FROM mensagens WHERE destaque = 1 ORDER BY created_at DESC LIMIT 1`).first();
  if (!row) {
    const fallback = await env.DB.prepare(`SELECT * FROM mensagens ORDER BY created_at DESC LIMIT 1`).first();
    return json(fallback || null, 200, origin);
  }
  return json(row, 200, origin);
}

async function getPensamento(env, origin) {
  const today = new Date().toISOString().slice(0, 10);
  let row = await env.DB.prepare(`SELECT * FROM pensamentos WHERE data_exibicao = ? LIMIT 1`).bind(today).first();
  if (!row) {
    row = await env.DB.prepare(`SELECT * FROM pensamentos ORDER BY RANDOM() LIMIT 1`).first();
  }
  return json(row || null, 200, origin);
}

async function postLead(request, env, origin) {
  const body = await request.json();
  const { nome, email, whatsapp, bairro, cidade, origem } = body;
  if (!nome || !email) return err('Nome e email obrigatórios', 400, origin);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return err('Email inválido', 400, origin);
  const existe = await env.DB.prepare(`SELECT id FROM leads WHERE email = ?`).bind(email).first();
  if (existe) return json({ message: 'Já cadastrado' }, 200, origin);
  await env.DB.prepare(
    `INSERT INTO leads (nome, email, whatsapp, bairro, cidade, origem) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(nome, email, whatsapp || null, bairro || null, cidade || null, origem || 'site').run();
  return json({ message: 'Cadastrado com sucesso!' }, 201, origin);
}

async function getDoutores(env, origin) {
  const rows = await env.DB.prepare(`SELECT id, nome, especialidade, foto_url, bio, registro FROM doutores WHERE ativo = 1 ORDER BY nome`).all();
  return json(rows.results, 200, origin);
}

async function getAgenda(env, doutor_id, url, origin) {
  const mes = url.searchParams.get('mes') || new Date().toISOString().slice(0, 7); // YYYY-MM
  const disponibilidade = await env.DB.prepare(
    `SELECT * FROM disponibilidade WHERE doutor_id = ?`
  ).bind(doutor_id).all();
  const bloqueios = await env.DB.prepare(
    `SELECT data_bloqueada FROM bloqueios WHERE (doutor_id = ? OR doutor_id IS NULL) AND data_bloqueada LIKE ?`
  ).bind(doutor_id, `${mes}%`).all();
  const agendados = await env.DB.prepare(
    `SELECT data, hora FROM agendamentos WHERE doutor_id = ? AND data LIKE ? AND status != 'cancelado'`
  ).bind(doutor_id, `${mes}%`).all();

  const bloqueioSet = new Set(bloqueios.results.map(b => b.data_bloqueada));
  const agendadoSet = new Set(agendados.results.map(a => `${a.data}-${a.hora}`));

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const vagas = {};

  for (let d = 1; d <= diasNoMes; d++) {
    const data = `${mes}-${String(d).padStart(2, '0')}`;
    if (bloqueioSet.has(data)) continue;
    const diaSemana = new Date(data + 'T12:00:00').getDay();
    const slots = disponibilidade.results.filter(s => s.dia_semana === diaSemana);
    if (!slots.length) continue;
    vagas[data] = [];
    for (const slot of slots) {
      let hora = slot.hora_inicio;
      while (hora < slot.hora_fim) {
        const key = `${data}-${hora}`;
        if (!agendadoSet.has(key)) vagas[data].push(hora);
        const [h, m] = hora.split(':').map(Number);
        const total = h * 60 + m + slot.intervalo_min;
        hora = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      }
    }
    if (!vagas[data].length) delete vagas[data];
  }

  return json(vagas, 200, origin);
}

async function postAgendamento(request, env, origin) {
  const body = await request.json();
  const { doutor_id, paciente_nome, paciente_email, paciente_whatsapp, data, hora } = body;
  if (!doutor_id || !paciente_nome || !paciente_whatsapp || !data || !hora) {
    return err('Campos obrigatórios faltando', 400, origin);
  }
  const conflito = await env.DB.prepare(
    `SELECT id FROM agendamentos WHERE doutor_id = ? AND data = ? AND hora = ? AND status != 'cancelado'`
  ).bind(doutor_id, data, hora).first();
  if (conflito) return err('Horário já ocupado', 409, origin);

  await env.DB.prepare(
    `INSERT INTO agendamentos (doutor_id, paciente_nome, paciente_email, paciente_whatsapp, data, hora)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(doutor_id, paciente_nome, paciente_email || null, paciente_whatsapp, data, hora).run();

  return json({ message: 'Agendamento realizado! Você receberá uma confirmação pelo WhatsApp.' }, 201, origin);
}

// ============================================================
// CHAT IA — Agente de Aconselhamento Pastoral
// ============================================================
const AI_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/qwen/qwq-32b',
];

const CHAT_SYSTEM = `Você é um agente de aconselhamento pastoral do site do Pastor Fabiano Gonçalves e do Instituto de Saúde Mental associado.

Sua missão:
- Ajudar a compreender as Escrituras com clareza, sempre fundamentado na Bíblia.
- Oferecer conselhos práticos baseados em princípios bíblicos.
- Acolher com simplicidade, respeito e amor cristão.
- Nunca substituir a autoridade pastoral ou o atendimento profissional de saúde.
- Sempre citar referências bíblicas completas (Livro, capítulo e versículo).
- Nunca inventar interpretações ou opiniões pessoais.
- Quando houver mais de uma visão cristã importante, apresentar com respeito e clareza.
- Sempre perguntar ao usuário qual a necessidade específica antes de responder.
- Confirmar que entendeu o pedido antes de prosseguir.
- Finalizar com incentivo para aplicação prática e busca de orientação pastoral presencial.
- Se o usuário demonstrar crise emocional grave, encaminhar para o Instituto de Saúde Mental.

DISCLAIMER: Você é uma ferramenta de apoio e acolhimento inicial. Não realiza diagnósticos, prescrições ou substitui profissionais de saúde habilitados.

REGRAS DE FORMATO (OBRIGATÓRIAS):
- NUNCA usar emojis, emoticons ou símbolos decorativos. Nenhum. O tom é institucional e sério.
- NUNCA usar a palavra "ministério" nas respostas.
- NUNCA falar sobre política, eleições, candidatos, partidos, votos ou temas eleitorais. Se perguntado, responder: "Este é um espaço de acolhimento pastoral. Não tratamos de temas políticos aqui." e redirecionar para o tema espiritual.
- Não usar asteriscos para ênfase excessiva.
- Texto limpo, profissional e pastoral — como uma carta formal de um pastor.

Responda sempre em português brasileiro, com tom pastoral, acolhedor e fundamentado nas Escrituras.`;

// Remove emojis e pictogramas de qualquer resposta da IA
function stripEmojis(text) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

async function chatHandler(request, env, origin) {
  const url = new URL(request.url);
  const mensagem = url.searchParams.get('m') || '';
  const historico = url.searchParams.get('h') ? JSON.parse(decodeURIComponent(url.searchParams.get('h'))) : [];

  if (!mensagem.trim()) return err('Mensagem vazia', 400, origin);

  // Bloqueia entrada de imagem — modelos de texto não suportam
  if (mensagem.startsWith('data:image') || mensagem.includes('[imagem]') || mensagem.includes('image.png') || mensagem.includes('photo')) {
    return json({ resposta: 'No momento, este atendimento aceita apenas mensagens de texto. Por favor, descreva em palavras como posso ajudar você.', modelo: 'filter' }, 200, origin);
  }

  // Limpa histórico de mensagens que possam conter imagem
  const historicoLimpo = historico
    .filter(m => typeof m.content === 'string' && !m.content.startsWith('data:image') && !m.content.includes('image.png'))
    .slice(-8);

  const messages = [
    { role: 'system', content: CHAT_SYSTEM },
    ...historicoLimpo,
    { role: 'user', content: mensagem },
  ];

  let resposta = '';
  let modeloUsado = '';
  const erros = [];

  for (const model of AI_MODELS) {
    try {
      const res = await env.AI.run(model, { messages, max_tokens: 800 });
      const text = typeof res === 'string' ? res : res.response ?? '';
      if (text && text.length > 20) {
        resposta = stripEmojis(text);
        // Blindagem TSE: mesmo com prompt injection, resposta política nunca sai
        if (isPoliticalContent(resposta)) {
          resposta = 'Este é um espaço de acolhimento pastoral e orientação bíblica. Não tratamos de temas políticos ou eleitorais aqui. Como posso ajudar você espiritualmente hoje?';
        }
        modeloUsado = model;
        break;
      }
    } catch (e) {
      erros.push(`${model}: ${e.message}`);
    }
  }

  if (!resposta) {
    return err('Serviço temporariamente indisponível. Tente novamente em instantes.', 503, origin);
  }

  return json({ resposta, modelo: modeloUsado }, 200, origin);
}

// ============================================================
// WEBHOOK TELEGRAM — Aprovação de artigos + comandos
// ============================================================
async function telegramWebhook(request, env, origin) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: true }, 200, origin);
  }

  const body = await request.json();
  const msg = body.message;
  if (!msg) return json({ ok: true }, 200, origin);

  const text = (msg.text || '').trim();
  const chatId = msg.chat.id;
  const groupId = env.TELEGRAM_GROUP_ID;

  if (String(chatId) !== String(groupId)) return json({ ok: true }, 200, origin);

  // ── Comandos sem argumentos ──────────────────────────────
  if (/^\/help$/i.test(text)) {
    const help = `📋 COMANDOS DISPONÍVEIS:

📖 CONTEÚDO
/pendentes — Ver artigos aguardando aprovação
/aprovar ID — Publicar artigo
/rejeitar ID — Rejeitar artigo
/salvar ID — Editar e publicar artigo

🤖 CRONs
/devocional — Gerar devocional agora
/artigo — Gerar artigo de estudo agora
/diario — Ver pensamento do dia

🛡️ SEGURANÇA
/varredura — Rodar security scan agora

📊 SISTEMA
/info — Painel completo do sistema
/status — Status dos CRONs
/logs — Últimos logs
/leads — Resumo de leads
/artigos — Artigos recentes
/stats — Estatísticas gerais`;
    await tgReply(env, chatId, help);
    return json({ ok: true }, 200, origin);
  }

  if (/^\/pendentes$/i.test(text)) {
    const rows = await env.DB.prepare(
      `SELECT id, titulo, created_at FROM artigos WHERE status = 'pendente' ORDER BY created_at DESC LIMIT 10`
    ).all();
    if (!rows.results.length) {
      await tgReply(env, chatId, '✅ Nenhum artigo pendente.');
    } else {
      const lista = rows.results.map(a => `ID ${a.id} — ${a.titulo}`).join('\n');
      await tgReply(env, chatId, `📋 ARTIGOS PENDENTES:\n\n${lista}\n\nComandos:\n/aprovar ID\n/rejeitar ID\n/salvar ID [novo texto]`);
    }
    return json({ ok: true }, 200, origin);
  }

  if (/^\/diario$/i.test(text)) {
    const today = new Date().toISOString().slice(0, 10);
    let row = await env.DB.prepare(`SELECT texto, referencia FROM pensamentos WHERE data_exibicao = ? LIMIT 1`).bind(today).first();
    if (!row) row = await env.DB.prepare(`SELECT texto, referencia FROM pensamentos ORDER BY RANDOM() LIMIT 1`).first();
    if (row) {
      await tgReply(env, chatId, `💡 PENSAMENTO DO DIA\n\n"${row.texto}"\n\n— ${row.referencia || 'Palavra de Deus'}`);
    } else {
      await tgReply(env, chatId, 'Nenhum pensamento cadastrado.');
    }
    return json({ ok: true }, 200, origin);
  }

  if (/^\/devocional$/i.test(text)) {
    await tgReply(env, chatId, '⏳ Gerando devocional...');
    try {
      await cronPastoral(env);
      await tgReply(env, chatId, '✅ Devocional gerado e publicado!');
    } catch (e) {
      await tgReply(env, chatId, `❌ Erro: ${e.message}`);
    }
    return json({ ok: true }, 200, origin);
  }

  if (/^\/artigo$/i.test(text)) {
    await tgReply(env, chatId, '⏳ Gerando artigo de estudo...');
    try {
      await cronSeo(env);
      await tgReply(env, chatId, '✅ Artigo gerado! Aguardando aprovação.');
    } catch (e) {
      await tgReply(env, chatId, `❌ Erro: ${e.message}`);
    }
    return json({ ok: true }, 200, origin);
  }

  if (/^\/(varredura|scan)$/i.test(text)) {
    await tgReply(env, chatId, '⏳ Executando security scan...');
    try {
      const result = await securityScan(env);
      if (result.flagged > 0) {
        await tgReply(env, chatId, `🛡️ SCAN CONCLUÍDO\n\n⚠️ ${result.flagged} item(ns) flagrado(s) de ${result.scanned} verificados.\nItens movidos para quarentena.`);
      } else {
        await tgReply(env, chatId, `🛡️ SCAN CONCLUÍDO\n\n✅ Nenhum conteúdo político detectado.\n${result.scanned} itens verificados.`);
      }
    } catch (e) {
      await tgReply(env, chatId, `❌ Erro: ${e.message}`);
    }
    return json({ ok: true }, 200, origin);
  }

  // ── /info — Painel completo do sistema ───────────────────
  if (/^\/info$/i.test(text)) {
    const artigos = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos WHERE status = 'publicado'`).first();
    const pendentes = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos WHERE status = 'pendente'`).first();
    const noticias = await env.DB.prepare(`SELECT COUNT(*) as c FROM noticias WHERE status = 'publicado'`).first();
    const leads = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads`).first();
    const doutores = await env.DB.prepare(`SELECT COUNT(*) as c FROM doutores WHERE ativo = 1`).first();
    const agendamentos = await env.DB.prepare(`SELECT COUNT(*) as c FROM agendamentos WHERE status = 'pendente'`).first();
    const pensamentos = await env.DB.prepare(`SELECT COUNT(*) as c FROM pensamentos`).first();

    await tgReply(env, chatId,
      `📊 PAINEL DO SISTEMA\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📰 CONTEÚDO\n` +
      `Artigos publicados: ${artigos.c}\n` +
      `Artigos pendentes: ${pendentes.c}\n` +
      `Notícias: ${noticias.c}\n` +
      `Pensamentos: ${pensamentos.c}\n\n` +
      `👥 CAPTAÇÃO\n` +
      `Leads captados: ${leads.c}\n\n` +
      `🏥 INSTITUTO\n` +
      `Doutores ativos: ${doutores.c}\n` +
      `Agendamentos pendentes: ${agendamentos.c}\n\n` +
      `🤖 CRONs ATIVOS\n` +
      `Pastoral — Diário 06:00 BRT\n` +
      `SEO — Diário 12:00 BRT\n` +
      `Social — Diário 11:00 BRT\n` +
      `Security — Diário 14:00 BRT\n\n` +
      `🛡️ SEGURANÇA\n` +
      `Timing-safe auth: ✅\n` +
      `Rate limiting: ✅\n` +
      `Filtro anti-política: ✅\n` +
      `Upload seguro (5MB + whitelist): ✅\n` +
      `Erros genéricos: ✅\n` +
      `Security scan diário: ✅\n` +
      `Headers CSP/X-Frame: ✅\n` +
      `Webhook Telegram validado: ✅\n\n` +
      `👨‍💻 DESENVOLVIDO POR\n` +
      `Alexis Marketing & Dev\n` +
      `desenvolvimentodesites.dev.br`
    );
    return json({ ok: true }, 200, origin);
  }

  // ── /status — Status dos CRONs ───────────────────────────
  if (/^\/status$/i.test(text)) {
    const logs = await env.DB.prepare(
      `SELECT cron_name, status, mensagem, modelo_usado, created_at FROM cron_logs ORDER BY created_at DESC LIMIT 6`
    ).all();
    if (!logs.results.length) {
      await tgReply(env, chatId, '📋 Nenhum log de CRON encontrado.');
    } else {
      const lista = logs.results.map(l => {
        const icon = l.status === 'sucesso' ? '✅' : '❌';
        const data = new Date(l.created_at + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        return `${icon} ${l.cron_name} — ${data}\n   ${l.mensagem?.slice(0, 80) || '—'}`;
      }).join('\n\n');
      await tgReply(env, chatId, `📋 ÚLTIMOS CRONs:\n\n${lista}`);
    }
    return json({ ok: true }, 200, origin);
  }

  // ── /logs — Últimos logs ─────────────────────────────────
  if (/^\/logs$/i.test(text)) {
    const logs = await env.DB.prepare(
      `SELECT cron_name, status, mensagem, created_at FROM cron_logs ORDER BY created_at DESC LIMIT 10`
    ).all();
    if (!logs.results.length) {
      await tgReply(env, chatId, '📋 Nenhum log encontrado.');
    } else {
      const lista = logs.results.map(l => {
        const icon = l.status === 'sucesso' ? '✅' : '❌';
        const data = new Date(l.created_at + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        return `${icon} [${l.cron_name}] ${data}\n   ${l.mensagem?.slice(0, 100) || '—'}`;
      }).join('\n\n');
      await tgReply(env, chatId, `📋 ÚLTIMOS 10 LOGS:\n\n${lista}`);
    }
    return json({ ok: true }, 200, origin);
  }

  // ── /leads — Resumo de leads ─────────────────────────────
  if (/^\/leads$/i.test(text)) {
    const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads`).first();
    const hoje = new Date().toISOString().slice(0, 10);
    const hojeCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads WHERE created_at LIKE ?`).bind(`${hoje}%`).first();
    const cidades = await env.DB.prepare(
      `SELECT cidade, COUNT(*) as c FROM leads WHERE cidade IS NOT NULL AND cidade != '' GROUP BY cidade ORDER BY c DESC LIMIT 5`
    ).all();
    const cidadesLista = cidades.results.map(c => `   ${c.cidade}: ${c.c}`).join('\n');

    await tgReply(env, chatId,
      `👥 LEADS CAPTADOS\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Total: ${total.c}\n` +
      `Hoje: ${hojeCount.c}\n\n` +
      `🏙️ Top cidades:\n${cidadesLista || '   Nenhuma cidade registrada'}`
    );
    return json({ ok: true }, 200, origin);
  }

  // ── /artigos — Artigos recentes ──────────────────────────
  if (/^\/artigos$/i.test(text)) {
    const rows = await env.DB.prepare(
      `SELECT id, titulo, status, created_at FROM artigos ORDER BY created_at DESC LIMIT 8`
    ).all();
    if (!rows.results.length) {
      await tgReply(env, chatId, '📰 Nenhum artigo encontrado.');
    } else {
      const lista = rows.results.map(a => {
        const icon = a.status === 'publicado' ? '✅' : a.status === 'pendente' ? '⏳' : '❌';
        return `${icon} ID ${a.id} — ${a.titulo}\n   [${a.status}]`;
      }).join('\n\n');
      await tgReply(env, chatId, `📰 ARTIGOS RECENTES:\n\n${lista}`);
    }
    return json({ ok: true }, 200, origin);
  }

  // ── /stats — Estatísticas gerais ─────────────────────────
  if (/^\/stats$/i.test(text)) {
    const artigos = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos`).first();
    const publicados = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos WHERE status = 'publicado'`).first();
    const rejeitados = await env.DB.prepare(`SELECT COUNT(*) as c FROM artigos WHERE status = 'rejeitado'`).first();
    const noticias = await env.DB.prepare(`SELECT COUNT(*) as c FROM noticias`).first();
    const mensagens = await env.DB.prepare(`SELECT COUNT(*) as c FROM mensagens`).first();
    const leads = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads`).first();
    const agendamentos = await env.DB.prepare(`SELECT COUNT(*) as c FROM agendamentos`).first();
    const pdfs = await env.DB.prepare(`SELECT COUNT(*) as c FROM pdfs`).first();

    await tgReply(env, chatId,
      `📊 ESTATÍSTICAS GERAIS\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📰 Artigos: ${artigos.c} (✅ ${publicados.publicados} | ❌ ${rejeitados.c})\n` +
      `📢 Notícias: ${noticias.c}\n` +
      `🎬 Mensagens YouTube: ${mensagens.c}\n` +
      `👥 Leads: ${leads.c}\n` +
      `📅 Agendamentos: ${agendamentos.c}\n` +
      `📄 PDFs referência: ${pdfs.c}\n\n` +
      `⏱️ Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
    );
    return json({ ok: true }, 200, origin);
  }

  // ── Comandos com argumentos (aprovar/rejeitar/salvar) ───
  // /salvar aceita conteúdo na mesma linha OU na linha seguinte
  const matchSalvar = text.match(/^\/salvar\s+(\d+)(?:\s+([\s\S]+))?$/i);
  if (matchSalvar) {
    const artigoId = parseInt(matchSalvar[1]);
    const now = Math.floor(Date.now() / 1000);
    const novoConteudo = (matchSalvar[2] || '').trim();

    if (!novoConteudo) {
      await tgReply(env, chatId, `⚠️ Conteúdo vazio. Envie:\n/salvar ${artigoId}\n[texto editado aqui]`);
      return json({ ok: true }, 200, origin);
    }
    if (isPoliticalContent(novoConteudo)) {
      await tgReply(env, chatId, `🚫 BLOQUEADO: conteúdo com termos eleitorais/políticos. Nada foi salvo.`);
      return json({ ok: true }, 200, origin);
    }

    const artigo = await env.DB.prepare(`SELECT id, titulo FROM artigos WHERE id = ?`).bind(artigoId).first();
    if (!artigo) {
      await tgReply(env, chatId, `⚠️ Artigo #${artigoId} não encontrado.`);
      return json({ ok: true }, 200, origin);
    }

    await env.DB.prepare(
      `UPDATE artigos SET conteudo = ?, status = 'publicado', published_at = ? WHERE id = ?`
    ).bind(novoConteudo, now, artigoId).run();
    await tgReply(env, chatId, `✅ Artigo #${artigoId} editado e PUBLICADO!\n\n${artigo.titulo}`);
    return json({ ok: true }, 200, origin);
  }

  // /aprovar e /rejeitar
  const match = text.match(/^\/(aprovar|rejeitar)\s+(\d+)/i);
  if (!match) return json({ ok: true }, 200, origin);

  const acao = match[1].toLowerCase();
  const artigoId = parseInt(match[2]);
  const now = Math.floor(Date.now() / 1000);

  if (acao === 'aprovar') {
    const artigo = await env.DB.prepare(`SELECT id, titulo FROM artigos WHERE id = ?`).bind(artigoId).first();
    if (!artigo) {
      await tgReply(env, chatId, `⚠️ Artigo #${artigoId} não encontrado.`);
      return json({ ok: true }, 200, origin);
    }
    await env.DB.prepare(
      `UPDATE artigos SET status = 'publicado', published_at = ? WHERE id = ?`
    ).bind(now, artigoId).run();
    await tgReply(env, chatId, `✅ Artigo #${artigoId} PUBLICADO!\n\n${artigo.titulo}`);

  } else if (acao === 'rejeitar') {
    await env.DB.prepare(`UPDATE artigos SET status = 'rejeitado' WHERE id = ?`).bind(artigoId).run();
    await tgReply(env, chatId, `❌ Artigo #${artigoId} rejeitado.`);
  }

  return json({ ok: true }, 200, origin);
}

async function tgReply(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// ============================================================
// ADMIN — Upload R2
// ============================================================
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function adminUpload(request, env, origin) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return err('Nenhum arquivo', 400, origin);

  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return err(`Extensão não permitida. Use: ${ALLOWED_EXTENSIONS.join(', ')}`, 400, origin);
  }

  if (file.size > MAX_FILE_SIZE) {
    return err('Arquivo excede 5MB', 400, origin);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (file.type && !allowedTypes.includes(file.type)) {
    return err('Tipo MIME não permitido', 400, origin);
  }

  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await env.IMAGENS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  const url = `https://imagens.fabianogoncalves.com.br/${key}`;
  return json({ url, key }, 201, origin);
}

// ============================================================
// ADMIN — Artigos
// ============================================================
async function adminGetArtigos(env, url, origin) {
  const status = url.searchParams.get('status') || '';
  const VALID = ['pendente', 'publicado', 'rejeitado', 'rascunho', 'quarentena'];
  let rows;
  if (status && VALID.includes(status)) {
    rows = await env.DB.prepare(
      `SELECT id, titulo, descricao, slug, status, published_at, created_at FROM artigos WHERE status = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(status).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT id, titulo, descricao, slug, status, published_at, created_at FROM artigos ORDER BY created_at DESC LIMIT 50`
    ).all();
  }
  return json(rows.results, 200, origin);
}

async function adminCreateArtigo(request, env, origin) {
  const body = await request.json();
  const { titulo, descricao, conteudo, seo_title, seo_description, imagem_url, palavras_chave } = body;
  if (!titulo || !conteudo) return err('Título e conteúdo obrigatórios', 400, origin);
  let slug = slugify(titulo);
  const existe = await env.DB.prepare(`SELECT id FROM artigos WHERE slug = ?`).bind(slug).first();
  if (existe) slug = slug + '-' + Date.now();
  await env.DB.prepare(
    `INSERT INTO artigos (titulo, descricao, conteudo, seo_title, seo_description, slug, status, imagem_url, palavras_chave)
     VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?, ?)`
  ).bind(titulo, descricao || null, conteudo, seo_title || titulo, seo_description || descricao || null, slug, imagem_url || null, palavras_chave || null).run();
  return json({ message: 'Artigo criado', slug }, 201, origin);
}

async function adminUpdateArtigo(request, env, id, origin) {
  const body = await request.json();
  const { titulo, descricao, conteudo, seo_title, seo_description, imagem_url, palavras_chave, status } = body;
  await env.DB.prepare(
    `UPDATE artigos SET titulo=?, descricao=?, conteudo=?, seo_title=?, seo_description=?, imagem_url=?, palavras_chave=?, status=? WHERE id=?`
  ).bind(titulo, descricao || null, conteudo, seo_title || titulo, seo_description || null, imagem_url || null, palavras_chave || null, status || 'rascunho', id).run();
  return json({ message: 'Atualizado' }, 200, origin);
}

async function adminDeleteArtigo(env, id, origin) {
  await env.DB.prepare(`DELETE FROM artigos WHERE id = ?`).bind(id).run();
  return json({ message: 'Deletado' }, 200, origin);
}

async function adminArtigoStatus(request, env, id, origin) {
  const { status } = await request.json();
  const allowed = ['pendente', 'aprovado', 'rejeitado', 'publicado', 'rascunho', 'quarentena'];
  if (!allowed.includes(status)) return err('Status inválido', 400, origin);
  const now = status === 'publicado' ? Math.floor(Date.now() / 1000) : null;
  await env.DB.prepare(`UPDATE artigos SET status=?, published_at=? WHERE id=?`).bind(status, now, id).run();
  return json({ message: 'Status atualizado' }, 200, origin);
}

// ============================================================
// ADMIN — Notícias
// ============================================================
async function adminGetNoticias(env, url, origin) {
  const rows = await env.DB.prepare(
    `SELECT id, titulo, subtitulo, slug, foto_url, status, published_at, created_at FROM noticias ORDER BY created_at DESC LIMIT 50`
  ).all();
  return json(rows.results, 200, origin);
}

async function adminCreateNoticia(request, env, origin) {
  const body = await request.json();
  const { titulo, subtitulo, conteudo, foto_url, seo_title, seo_description } = body;
  if (!titulo || !conteudo) return err('Título e conteúdo obrigatórios', 400, origin);
  let slug = slugify(titulo);
  const existe = await env.DB.prepare(`SELECT id FROM noticias WHERE slug = ?`).bind(slug).first();
  if (existe) slug = slug + '-' + Date.now();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO noticias (titulo, subtitulo, conteudo, foto_url, seo_title, seo_description, slug, status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'publicado', ?)`
  ).bind(titulo, subtitulo || null, conteudo, foto_url || null, seo_title || titulo, seo_description || subtitulo || null, slug, now).run();
  return json({ message: 'Notícia publicada', slug }, 201, origin);
}

async function adminUpdateNoticia(request, env, id, origin) {
  const body = await request.json();
  const { titulo, subtitulo, conteudo, foto_url, seo_title, seo_description, status } = body;
  await env.DB.prepare(
    `UPDATE noticias SET titulo=?, subtitulo=?, conteudo=?, foto_url=?, seo_title=?, seo_description=?, status=? WHERE id=?`
  ).bind(titulo, subtitulo || null, conteudo, foto_url || null, seo_title || titulo, seo_description || null, status || 'publicado', id).run();
  return json({ message: 'Atualizado' }, 200, origin);
}

async function adminDeleteNoticia(env, id, origin) {
  await env.DB.prepare(`DELETE FROM noticias WHERE id = ?`).bind(id).run();
  return json({ message: 'Deletado' }, 200, origin);
}

// ============================================================
// ADMIN — Mensagens YouTube
// ============================================================
async function adminGetMensagens(env, origin) {
  const rows = await env.DB.prepare(`SELECT * FROM mensagens ORDER BY destaque DESC, created_at DESC`).all();
  return json(rows.results, 200, origin);
}

async function adminCreateMensagem(request, env, origin) {
  const body = await request.json();
  const { titulo, youtube_id, descricao, destaque } = body;
  if (!titulo || !youtube_id) return err('Título e YouTube ID obrigatórios', 400, origin);
  if (destaque) await env.DB.prepare(`UPDATE mensagens SET destaque = 0`).run();
  await env.DB.prepare(
    `INSERT INTO mensagens (titulo, youtube_id, descricao, destaque) VALUES (?, ?, ?, ?)`
  ).bind(titulo, youtube_id, descricao || null, destaque ? 1 : 0).run();
  return json({ message: 'Mensagem criada' }, 201, origin);
}

async function adminUpdateMensagem(request, env, id, origin) {
  const body = await request.json();
  const { titulo, youtube_id, descricao, destaque } = body;
  if (destaque) await env.DB.prepare(`UPDATE mensagens SET destaque = 0 WHERE id != ?`).bind(id).run();
  await env.DB.prepare(
    `UPDATE mensagens SET titulo=?, youtube_id=?, descricao=?, destaque=? WHERE id=?`
  ).bind(titulo, youtube_id, descricao || null, destaque ? 1 : 0, id).run();
  return json({ message: 'Atualizado' }, 200, origin);
}

async function adminDeleteMensagem(env, id, origin) {
  await env.DB.prepare(`DELETE FROM mensagens WHERE id = ?`).bind(id).run();
  return json({ message: 'Deletado' }, 200, origin);
}

// ============================================================
// ADMIN — Pensamentos
// ============================================================
async function adminGetPensamentos(env, origin) {
  const rows = await env.DB.prepare(`SELECT * FROM pensamentos ORDER BY created_at DESC LIMIT 50`).all();
  return json(rows.results, 200, origin);
}

async function adminCreatePensamento(request, env, origin) {
  const body = await request.json();
  const { texto, referencia, data_exibicao } = body;
  if (!texto) return err('Texto obrigatório', 400, origin);
  await env.DB.prepare(
    `INSERT INTO pensamentos (texto, referencia, data_exibicao) VALUES (?, ?, ?)`
  ).bind(texto, referencia || null, data_exibicao || null).run();
  return json({ message: 'Pensamento criado' }, 201, origin);
}

async function adminDeletePensamento(env, id, origin) {
  await env.DB.prepare(`DELETE FROM pensamentos WHERE id = ?`).bind(id).run();
  return json({ message: 'Deletado' }, 200, origin);
}

// ============================================================
// ADMIN — Leads
// ============================================================
async function adminGetLeads(env, url, origin) {
  const cidade = url.searchParams.get('cidade') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;
  let rows, total;
  if (cidade) {
    rows = await env.DB.prepare(
      `SELECT * FROM leads WHERE cidade LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(`%${cidade}%`, limit, offset).all();
    total = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads WHERE cidade LIKE ?`).bind(`%${cidade}%`).first();
  } else {
    rows = await env.DB.prepare(
      `SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    total = await env.DB.prepare(`SELECT COUNT(*) as c FROM leads`).first();
  }
  return json({ leads: rows.results, total: total.c }, 200, origin);
}

async function adminExportLeads(env, origin) {
  const rows = await env.DB.prepare(`SELECT nome, email, whatsapp, bairro, cidade, origem, created_at FROM leads ORDER BY created_at DESC`).all();
  const header = 'Nome,Email,WhatsApp,Bairro,Cidade,Origem,Data\n';
  const csv = rows.results.map(r => {
    const data = new Date(r.created_at * 1000).toLocaleDateString('pt-BR');
    return `"${r.nome}","${r.email}","${r.whatsapp || ''}","${r.bairro || ''}","${r.cidade || ''}","${r.origem || ''}","${data}"`;
  }).join('\n');
  return new Response(header + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads.csv"',
      ...corsHeaders(origin),
    },
  });
}

// ============================================================
// ADMIN — Doutores
// ============================================================
async function adminGetDoutores(env, origin) {
  const rows = await env.DB.prepare(`SELECT * FROM doutores ORDER BY nome`).all();
  return json(rows.results, 200, origin);
}

async function adminCreateDoutor(request, env, origin) {
  const body = await request.json();
  const { nome, especialidade, foto_url, bio, registro } = body;
  if (!nome || !especialidade) return err('Nome e especialidade obrigatórios', 400, origin);
  await env.DB.prepare(
    `INSERT INTO doutores (nome, especialidade, foto_url, bio, registro) VALUES (?, ?, ?, ?, ?)`
  ).bind(nome, especialidade, foto_url || null, bio || null, registro || null).run();
  return json({ message: 'Doutor cadastrado' }, 201, origin);
}

async function adminUpdateDoutor(request, env, id, origin) {
  const body = await request.json();
  const { nome, especialidade, foto_url, bio, registro, ativo } = body;
  await env.DB.prepare(
    `UPDATE doutores SET nome=?, especialidade=?, foto_url=?, bio=?, registro=?, ativo=? WHERE id=?`
  ).bind(nome, especialidade, foto_url || null, bio || null, registro || null, ativo !== false ? 1 : 0, id).run();
  return json({ message: 'Atualizado' }, 200, origin);
}

async function adminDeleteDoutor(env, id, origin) {
  await env.DB.prepare(`UPDATE doutores SET ativo = 0 WHERE id = ?`).bind(id).run();
  return json({ message: 'Desativado' }, 200, origin);
}

// ============================================================
// ADMIN — Disponibilidade
// ============================================================
async function adminGetDisponibilidade(env, doutor_id, origin) {
  const rows = await env.DB.prepare(`SELECT * FROM disponibilidade WHERE doutor_id = ?`).bind(doutor_id).all();
  return json(rows.results, 200, origin);
}

async function adminSaveDisponibilidade(request, env, origin) {
  const body = await request.json();
  const { doutor_id, slots } = body;
  if (!doutor_id || !Array.isArray(slots)) return err('Dados inválidos', 400, origin);
  await env.DB.prepare(`DELETE FROM disponibilidade WHERE doutor_id = ?`).bind(doutor_id).run();
  for (const s of slots) {
    await env.DB.prepare(
      `INSERT INTO disponibilidade (doutor_id, dia_semana, hora_inicio, hora_fim, intervalo_min) VALUES (?, ?, ?, ?, ?)`
    ).bind(doutor_id, s.dia_semana, s.hora_inicio, s.hora_fim, s.intervalo_min || 60).run();
  }
  return json({ message: 'Disponibilidade salva' }, 200, origin);
}

async function adminDeleteDisponibilidade(env, id, origin) {
  await env.DB.prepare(`DELETE FROM disponibilidade WHERE id = ?`).bind(id).run();
  return json({ message: 'Removido' }, 200, origin);
}

// ============================================================
// ADMIN — Bloqueios
// ============================================================
async function adminGetBloqueios(env, url, origin) {
  const doutor_id = parseInt(url.searchParams.get('doutor_id') || '');
  const rows = Number.isFinite(doutor_id)
    ? await env.DB.prepare(`SELECT * FROM bloqueios WHERE doutor_id = ? ORDER BY data_bloqueada`).bind(doutor_id).all()
    : await env.DB.prepare(`SELECT * FROM bloqueios ORDER BY data_bloqueada`).all();
  return json(rows.results, 200, origin);
}

async function adminCreateBloqueio(request, env, origin) {
  const body = await request.json();
  const { doutor_id, data_bloqueada, motivo } = body;
  if (!data_bloqueada) return err('Data obrigatória', 400, origin);
  await env.DB.prepare(
    `INSERT INTO bloqueios (doutor_id, data_bloqueada, motivo) VALUES (?, ?, ?)`
  ).bind(doutor_id || null, data_bloqueada, motivo || null).run();
  return json({ message: 'Data bloqueada' }, 201, origin);
}

async function adminDeleteBloqueio(env, id, origin) {
  await env.DB.prepare(`DELETE FROM bloqueios WHERE id = ?`).bind(id).run();
  return json({ message: 'Desbloqueado' }, 200, origin);
}

// ============================================================
// ADMIN — Agendamentos
// ============================================================
async function adminGetAgendamentos(env, url, origin) {
  const doutor_id = url.searchParams.get('doutor_id') || '';
  const data = url.searchParams.get('data') || '';
  const status = url.searchParams.get('status') || '';
  let where = 'WHERE 1=1';
  const binds = [];
  if (doutor_id) { where += ' AND a.doutor_id = ?'; binds.push(doutor_id); }
  if (data) { where += ' AND a.data = ?'; binds.push(data); }
  if (status) { where += ' AND a.status = ?'; binds.push(status); }
  const rows = await env.DB.prepare(
    `SELECT a.*, d.nome as doutor_nome, d.especialidade
     FROM agendamentos a JOIN doutores d ON a.doutor_id = d.id
     ${where} ORDER BY a.data DESC, a.hora DESC LIMIT 100`
  ).bind(...binds).all();
  return json(rows.results, 200, origin);
}

async function adminUpdateAgendamento(request, env, id, origin) {
  const { status, observacoes } = await request.json();
  await env.DB.prepare(
    `UPDATE agendamentos SET status=?, observacoes=? WHERE id=?`
  ).bind(status, observacoes || null, id).run();
  return json({ message: 'Atualizado' }, 200, origin);
}

// ============================================================
// ADMIN — PDFs
// ============================================================
async function adminGetPdfs(env, origin) {
  const rows = await env.DB.prepare(`SELECT id, titulo, tipo, r2_key, created_at FROM pdfs ORDER BY created_at DESC`).all();
  return json(rows.results, 200, origin);
}

async function adminCreatePdf(request, env, origin) {
  const body = await request.json();
  const { titulo, r2_key, conteudo_extraido, tipo } = body;
  if (!titulo || !r2_key) return err('Título e chave R2 obrigatórios', 400, origin);
  await env.DB.prepare(
    `INSERT INTO pdfs (titulo, r2_key, conteudo_extraido, tipo) VALUES (?, ?, ?, ?)`
  ).bind(titulo, r2_key, conteudo_extraido || null, tipo || 'referencia').run();
  return json({ message: 'PDF registrado' }, 201, origin);
}

async function adminDeletePdf(env, id, origin) {
  await env.DB.prepare(`DELETE FROM pdfs WHERE id = ?`).bind(id).run();
  return json({ message: 'Removido' }, 200, origin);
}

// ============================================================
// ADMIN — Logs CRON
// ============================================================
async function adminGetCronLogs(env, url, origin) {
  const cron = url.searchParams.get('cron') || '';
  const rows = cron
    ? await env.DB.prepare(`SELECT * FROM cron_logs WHERE cron_name = ? ORDER BY created_at DESC LIMIT 100`).bind(cron).all()
    : await env.DB.prepare(`SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 100`).all();
  return json(rows.results, 200, origin);
}
