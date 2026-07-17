// CRON SEO — Gera artigo bíblico de estudo, envia para aprovação no Telegram
// Disparo: "0 20 * * 4" (quinta 17:00 BRT)

import { runAI, parseConteudo, logCron, sendTelegram, chunkText } from './ai-helper.js';

const SYSTEM_PROMPT = `Você é um escritor teológico especializado em estudos bíblicos profundos para o Pastor Fabiano Gonçalves.

MISSÃO:
- Produzir artigos bíblicos completos, ricos e edificantes
- Fundamentar cada ponto nas Escrituras com citações completas e contexto histórico
- Linguagem pastoral-acolhedora, acessível ao leigo, com profundidade teológica real

ESTRUTURA OBRIGATÓRIA DO ARTIGO (seguir esta ordem):
1. Introdução impactante — contexto e relevância do tema (150-200 palavras)
2. Contexto bíblico-histórico — origem e pano de fundo do tema nas Escrituras (200-250 palavras)
3. Seção 1 com subtítulo — primeiro eixo temático com 2-3 versículos completos comentados (250-300 palavras)
4. Seção 2 com subtítulo — segundo eixo com exemplos de personagens bíblicos (250-300 palavras)
5. Seção 3 com subtítulo — terceiro eixo com aplicação ao cristão contemporâneo (200-250 palavras)
6. Seção 4 com subtítulo — obstáculos e como superá-los à luz da Palavra (150-200 palavras)
7. Aplicação prática — 5 passos concretos baseados nas Escrituras (150-200 palavras)
8. Oração final — oração pastoral de encerramento (80-100 palavras)
9. Conclusão — síntese e encorajamento (100-120 palavras)

REGRAS ABSOLUTAS:
- MÍNIMO 1500 palavras — artigo completo, sem resumos ou atalhos
- SEMPRE citar versículos completos entre aspas com referência (Livro cap:vers)
- Mínimo 8 versículos bíblicos diferentes ao longo do texto
- NUNCA inventar versículos ou paráfrases sem indicar
- Subtítulos das seções em **negrito** (ex: **1. Introdução**) — NUNCA usar ## ou ###
- NUNCA usar a palavra "ministério" no texto
- NUNCA mencionar política, eleições, candidatos, partidos, votos ou cargos públicos
- Tom: pastor amigo que ensina com amor, profundidade e esperança prática

SEO OBRIGATÓRIO:
- Título otimizado para busca Google (palavra-chave no início, máx 70 chars)
- Meta description de 150-155 chars

Responda EXATAMENTE neste formato:
TITULO: (título SEO-otimizado)
DESCRICAO: (meta description 150-155 chars)
CONTEUDO:
(artigo completo conforme estrutura acima — mínimo 1500 palavras, sem cortar)`;

// Temas organizados por categoria — rotação semanal garante variedade
const TEMAS_ESTUDO = [
  // ── ORAÇÃO ──────────────────────────────────────────────
  'como orar corretamente passo a passo',
  'como orar pela família — guia bíblico',
  'como aprender a orar — oração para quem está começando',
  'o poder da oração — versículos que transformam',
  'oração de proteção — como cobrir sua família em oração',
  'oração de libertação — como se libertar espiritualmente',
  'como manter uma vida de oração consistente',
  'guerra espiritual — orações poderosas baseadas na Bíblia',

  // ── FÉ ──────────────────────────────────────────────────
  'como fortalecer a fé em momentos difíceis',
  'exemplos bíblicos de fé — heróis que confiaram em Deus',
  'o que é fé segundo Hebreus 11',
  'fé vs medo — o que a Bíblia diz sobre enfrentar o medo',
  'como crescer na fé diariamente',
  'versículos para fortalecer a fé em tempos de crise',

  // ── FAMÍLIA ─────────────────────────────────────────────
  'o que a Bíblia diz sobre o casamento cristão',
  'como criar os filhos no temor do Senhor',
  'conselhos bíblicos para casais em crise',
  'papel do marido e da esposa segundo a Bíblia',
  'como restaurar um casamento à luz das Escrituras',
  'oração pela família — como interceder pelos seus',

  // ── SAÚDE MENTAL E EMOCIONAL ────────────────────────────
  'o que a bíblia diz sobre ansiedade — versículos de Mateus e 1 Pedro',
  'versículos para ansiedade e preocupação',
  'como lidar com a depressão segundo a Bíblia',
  'estresse e fé — como encontrar paz em meio ao caos',
  'o que a Bíblia diz sobre saúde emocional',
  'cura interior — o que as Escrituras ensinam sobre restauração',

  // ── ESPERANÇA E CONSOLAÇÃO ──────────────────────────────
  'palavra de deus para hoje — encorajamento nas Escrituras',
  'versículos de esperança para momentos de dificuldade',
  'como encontrar consolação na Bíblia em tempos de luto',
  'promessas de Deus para quem está passando por provações',
  'versículos para consolar e fortalecer o coração',

  // ── PERDÃO ──────────────────────────────────────────────
  'como perdoar alguém que te magoou segundo a bíblia',
  'como perdoar a si mesmo — culpa, graça e recomeço',
  'como perdoar o imperdoável à luz das Escrituras',
  'o que a Bíblia ensina sobre o perdão — estudo completo',
  'libertação de mágoas — caminho bíblico para a cura',

  // ── VIDA CRISTÃ ─────────────────────────────────────────
  'como ler a bíblia para iniciantes — por onde começar',
  'como ler a bíblia em ordem cronológica',
  'como interpretar a bíblia corretamente sozinho',
  'como interpretar a bíblia versículo por versículo',
  'como fazer um devocional diário evangélico',
  'devocional da manhã curto para começar o dia com Deus',
  'como ler a bíblia em 1 ano — plano de leitura',
  'santidade cristã — o que significa viver santo',
  'discipulado bíblico — como crescer espiritualmente',
  'como viver segundo a vontade de Deus',

  // ── EVANGELISMO ─────────────────────────────────────────
  'como evangelizar — guia prático baseado na Bíblia',
  'como testemunhar de Cristo no trabalho',
  'o que a Bíblia diz sobre missões e evangelismo',
  'como compartilhar o evangelho com não crentes',
  'estratégias bíblicas para alcançar almas',

  // ── PROFETAS DO ANTIGO TESTAMENTO ───────────────────────
  'Elias o profeta do fogo e da fé — 1 Reis 17-19',
  'Eliseu o profeta dos milagres — 2 Reis 2-6',
  'Isaías a voz do julgamento e da esperança — Isaías 6 e 53',
  'Jeremias o profeta da dor e da promessa — Jeremias 1, 20 e 31',
  'Ezequiel o profeta da visão e da restauração — Ezequiel 37',
  'Daniel profecias e poder sobrenatural — Daniel 3 e 6',
  'Jonas a misericórdia divina e o arrependimento — Livro de Jonas',
  'Malaquias o chamado ao arrependimento e à fidelidade — Malaquias 3-4',
  'Oseias amor fiel em meio à infidelidade — Livro de Oseias',
  'Amós justiça social e repreensão — Amós 5:24',

  // ── HISTÓRIA CRISTÃ ─────────────────────────────────────
  'história das Assembleias de Deus no Brasil — fundação e crescimento',
  'como surgiu o pentecostalismo no Brasil',
  'líderes pioneiros das Assembleias de Deus no Brasil',
];

function diaDoAno() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / 86400000);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
}

export async function cronSeo(env) {
  const tema = TEMAS_ESTUDO[diaDoAno() % TEMAS_ESTUDO.length];

  // Busca PDFs de referência
  let contexto = '';
  try {
    const pdf = await env.DB.prepare(
      `SELECT conteudo FROM pdfs WHERE tipo IN ('estudo','referencia') AND conteudo IS NOT NULL ORDER BY RANDOM() LIMIT 1`
    ).first();
    if (pdf?.conteudo) contexto = `\n\nCONTEXTO BASE DE REFERÊNCIA:\n${pdf.conteudo.slice(0, 2500)}`;
  } catch {}

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + contexto },
      { role: 'user', content: `Escreva um artigo de estudo bíblico COMPLETO e APROFUNDADO sobre: ${tema}\n\nEste artigo será publicado no site do Pastor Fabiano Gonçalves. Siga rigorosamente a estrutura de 9 seções e escreva mínimo 1500 palavras. Não resuma — desenvolva cada seção com profundidade e versículos completos.` },
    ];
    const { text, model } = await runAI(env, messages, 8000);
    const parsed = parseConteudo(text);

    if (parsed) {
      parsed.conteudo = parsed.conteudo
        .replace(/^#{1,6}\s+(.+)$/gm, '**$1**');
    }

    if (!parsed || parsed.conteudo.length < 2000) {
      await logCron(env, 'seo', 'erro', 'Conteúdo inválido ou muito curto', model);
      return;
    }

    const slug = slugify(parsed.titulo);
    const agora = new Date().toISOString().slice(0, 10);
    const hora = Date.now().toString(36);

    // Salva como PENDENTE (aguarda aprovação no Telegram)
    const result = await env.DB.prepare(
      `INSERT INTO artigos (titulo, descricao, conteudo, palavras_chave, slug, status, seo_title, seo_description)
       VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?)
       RETURNING id`
    ).bind(
      parsed.titulo, parsed.descricao, parsed.conteudo,
      `${tema},bíblia,estudo bíblico,pastor fabiano gonçalves`,
      `${agora}-${slug}-${hora}`,
      parsed.titulo, parsed.descricao,
    ).first();

    const artigoId = result?.id;

    await logCron(env, 'seo', 'sucesso', `Artigo gerado (pendente): ${parsed.titulo}`, model);

    // 1. Cabeçalho
    await sendTelegram(env,
      `📖 <b>ARTIGO #${artigoId} — LEITURA E APROVAÇÃO</b>\n\n` +
      `<b>${parsed.titulo}</b>\n\n` +
      `<i>${parsed.descricao}</i>\n\n` +
      `Modelo: ${model}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━`,
    'HTML');

    // 2. Conteúdo completo em chunks (sem parse_mode — texto puro para evitar erros com < > &)
    const chunks = chunkText(parsed.conteudo);
    for (const chunk of chunks) {
      await sendTelegram(env, chunk, null);
    }

    // 3. Instruções de ação
    await sendTelegram(env,
      `━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `AÇÕES PARA O ARTIGO #${artigoId}:\n\n` +
      `/aprovar ${artigoId}\n` +
      `→ Publicar o artigo como está\n\n` +
      `/rejeitar ${artigoId}\n` +
      `→ Descartar o artigo\n\n` +
      `/salvar ${artigoId}\n` +
      `[cole aqui o texto editado]\n` +
      `→ Substitui o conteúdo pelo que você escreveu e publica`,
    null);

  } catch (e) {
    await logCron(env, 'seo', 'erro', e.message);
    await sendTelegram(env, `❌ <b>CRON SEO falhou</b>\n${e.message}`);
  }
}
