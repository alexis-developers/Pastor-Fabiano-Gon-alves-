// CRON PASTORAL — Gera devocional diário + pensamento do dia
// Disparo: "0 13 * * *" (10:00 BRT, todos os dias)

import { runAI, parseConteudo, logCron, sendTelegram, getTodayBRT } from './ai-helper.js';

const SYSTEM_PROMPT = `Você é o Pastor Fabiano Gonçalves — escritor, economista cristão e político de direita moderada. Seu objetivo é inspirar, motivar e ensinar com sabedoria, fé e praticidade.

BASE CONCEITUAL CENTRAL (EXCLUSIVO DO PENSAMENTO DO DIA E DEVOCIONAL DIÁRIO):
- CONCEITO DE MORDOMIA (STEWARDSHIP): A base dos pensamentos deve ser fundamentada no conceito cristão de Mordomia — a ideia de que Deus nos confiou recursos (tempo, talentos, dinheiro, inteligência e influência) para administrarmos bem em benefício da sociedade e para a glória de Deus.
- ECONOMIA & MERCADO: Como economista e político moderado, você não vê o mercado como um fim em si mesmo, mas como uma ferramenta de liberdade, dignidade humana e geração de oportunidades.
- MENSAGEM DE ESPERANÇA ATIVA: O mundo tem problemas, mas através do trabalho honesto, da família forte, da responsabilidade e da fé, podemos melhorar a nossa realidade e a de quem está ao nosso redor.
- TOM E POSTURA: Acolhedor, sábio, esperançoso e prático. NUNCA use jargões políticos agressivos ou polarização tóxica. Foque na dignidade humana, no valor do trabalho honesto, na família e na fé.
- NUNCA mencionar candidaturas, números de partidos, pedidos de voto ou campanhas.
- NUNCA usar a palavra "ministério" nos textos gerados.

PILARES TEMÁTICOS DAS MENSAGENS:
1. Economia com Propósito (O Trabalho como Vocação, Ética da Criação de Riqueza, Educação Financeira de Provérbios, Generosidade Estratégica).
2. Cidadania e Conservadorismo Moderado (Princípio da Subsidiariedade, A Família como Base da Economia, Liberdade com Responsabilidade, A Paz no Debate).
3. Motivação e Resiliência (Resiliência nas Crises, O Poder dos Pequenos Começos, Vencendo a Ansiedade com Propósito, Histórias de Superação Ética).

ESTILO E REGRAS:
- Dirija-se diretamente ao leitor usando "você" e use a 1ª pessoa do plural ("nós", "nossa", "conosco") para criar identificação.
- SEMPRE citar referência bíblica completa (Livro capítulo:versículo).
- SEMPRE criar um conteúdo 100% inédito. NUNCA repetir títulos, frases ou abordagens de pensamentos anteriores.

Responda EXATAMENTE neste formato:
TITULO: (título inédito do devocional, máx 70 chars)
DESCRICAO: (pensamento do dia inédito baseado no conceito de Mordomia/Stewardship e Esperança Ativa, máx 160 chars)
CONTEUDO:
(devocional completo com 400-600 palavras, incluindo versículo base, reflexão prática e encorajamento pastoral)`;

export async function cronPastoral(env) {
  const temas = [
    // Pilar 1: Economia com Propósito
    'o trabalho honesto como vocação sagrada e serviço ao próximo',
    'a ética cristã na criação de riqueza e geração de empregos',
    'sabedoria financeira de Provérbios: poupança e planejamento a longo prazo',
    'generosidade estratégica e superação da pobreza pelo investimento humano',
    
    // Pilar 2: Cidadania e Conservadorismo Moderado
    'o princípio da subsidiariedade: fortalecendo a família, a igreja e a comunidade',
    'a família estruturada como base da economia e combate à pobreza',
    'livre mercado com responsabilidade moral e respeito ao próximo',
    'a paz no debate: mantendo convicções firmes com mansidão e respeito',
    
    // Pilar 3: Motivação e Resiliência
    'mordomia do tempo e dos talentos: administrando os dons de Deus',
    'resiliência nas crises: fé, sabedoria e cabeça erguida nos vales da vida',
    'o poder dos pequenos começos: consistência e paciência nos frutos',
    'vencendo a ansiedade com propósito e confiança na providência divina',
  ];

  const tema = temas[new Date().getDate() % temas.length];

  // Busca histórico recente no banco D1 para injetar na memória da IA (anti-repetição)
  let historicoPrompt = '';
  try {
    const ultimosArtigos = await env.DB.prepare(
      `SELECT titulo FROM artigos ORDER BY id DESC LIMIT 20`
    ).all();
    const ultimosPensamentos = await env.DB.prepare(
      `SELECT texto FROM pensamentos ORDER BY id DESC LIMIT 20`
    ).all();

    const titulosUsados = (ultimosArtigos.results || []).map(a => a.titulo).join(' | ');
    const pensamentosUsados = (ultimosPensamentos.results || []).map(p => p.texto).join(' | ');

    historicoPrompt = `\nMEMÓRIA DA IA — HISTÓRICO RECENTE (NÃO REPETIR OU FAZER SIMILAR):
- TÍTULOS JÁ PUBLICADOS: ${titulosUsados || 'Nenhum'}
- PENSAMENTOS JÁ PUBLICADOS: ${pensamentosUsados || 'Nenhum'}`;
  } catch {}

  // Busca PDFs de referência para contexto
  let contexto = '';
  try {
    const pdfs = await env.DB.prepare(
      `SELECT conteudo FROM pdfs WHERE conteudo IS NOT NULL ORDER BY RANDOM() LIMIT 1`
    ).first();
    if (pdfs?.conteudo) contexto = `\nCONTEXTO DE REFERÊNCIA:\n${pdfs.conteudo.slice(0, 2000)}`;
  } catch {}

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + contexto + historicoPrompt },
      { role: 'user', content: `Escreva um devocional e pensamento do dia inédito sobre: ${tema}. Aplique a visão de Mordomia (Stewardship), Economia com Propósito e Esperança Ativa!` },
    ];
    const { text, model } = await runAI(env, messages);
    const parsed = parseConteudo(text);

    if (!parsed || parsed.conteudo.length < 200) {
      await logCron(env, 'pastoral', 'erro', 'Conteúdo inválido gerado', model);
      return;
    }

    const hojeBRT = getTodayBRT();

    // Valida desduplicação direta no D1 antes de inserir
    const pensamentoExistente = await env.DB.prepare(
      `SELECT id FROM pensamentos WHERE texto = ? OR data_exibicao = ?`
    ).bind(parsed.descricao, hojeBRT).first();

    if (!pensamentoExistente) {
      await env.DB.prepare(
        `INSERT INTO pensamentos (texto, referencia, data_exibicao) VALUES (?, ?, ?)`
      ).bind(parsed.descricao || parsed.titulo, parsed.titulo, hojeBRT).run();
    }

    // Salva como artigo publicado (devocionais vão direto)
    const slugBase = parsed.titulo.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
    const slug = `devocional-${hojeBRT}-${slugBase}`;

    const artigoExistente = await env.DB.prepare(
      `SELECT id FROM artigos WHERE slug = ? OR titulo = ?`
    ).bind(slug, parsed.titulo).first();

    if (!artigoExistente) {
      await env.DB.prepare(
        `INSERT INTO artigos (titulo, descricao, conteudo, palavras_chave, slug, status, seo_title, seo_description, published_at)
         VALUES (?, ?, ?, ?, ?, 'publicado', ?, ?, ?)`
      ).bind(
        parsed.titulo, parsed.descricao, parsed.conteudo,
        `devocional,${tema},mordomia,fé,economia cristã`,
        slug,
        parsed.titulo, parsed.descricao,
        Math.floor(Date.now() / 1000),
      ).run();
    }

    await logCron(env, 'pastoral', 'sucesso', `Devocional gerado: ${parsed.titulo}`, model);
    await sendTelegram(env, `✝️ <b>Devocional & Pensamento do Dia Gerado (${hojeBRT})</b>\n\n<b>${parsed.titulo}</b>\n\n💡 <i>${parsed.descricao}</i>\n\n<i>Publicado automaticamente.</i>`);

  } catch (e) {
    await logCron(env, 'pastoral', 'erro', e.message);
    await sendTelegram(env, `❌ <b>CRON Pastoral falhou</b>\n${e.message}`);
  }
}
