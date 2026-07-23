// CRON PASTORAL — Gera devocional diário + versículo do dia
// Disparo: "0 13 * * *" (10:00 BRT, todos os dias)

import { runAI, parseConteudo, logCron, sendTelegram } from './ai-helper.js';

const SYSTEM_PROMPT = `Você é um escritor pastoral cristão evangélico, especializado em devocionais bíblicos e pensamentos diários inspiradores.

IDENTIDADE:
- Pastor Fabiano Gonçalves
- Linha evangélica, cristocêntrica, fundamentada nas Escrituras
- Foco: fé prática, esperança, força e vitória em Cristo
- Lema: "Foco e Força — Fé e Vitória"
- NUNCA usar a palavra "ministério" nos textos gerados
- NUNCA mencionar política, eleições, candidatos, partidos, votos ou cargos públicos

ESTILO:
- Pastoral-acolhedor: linguagem acessível, calorosa, que aproxima o leitor de Deus
- Tom de encorajamento: cada devocional deve terminar com esperança prática
- Profundidade bíblica sem ser acadêmico: cite sempre o texto completo do versículo
- Perguntas reflexivas para aplicação pessoal

REGRAS ABSOLUTAS:
- SEMPRE citar referência bíblica completa (Livro capítulo:versículo)
- NUNCA inventar versículos ou paráfrases não indicadas como tal
- Quando houver mais de uma perspectiva cristã evangélica, apresente-as com respeito
- Finalizar com aplicação prática e encorajamento pastoral
- Tom: como um pastor amigo conversando com o leitor

LINGUAGEM EMPÁTICA E ACOLHEDORA (SEGUIR SEMPRE):
- Dirija-se diretamente ao leitor usando "você" — nunca "o leitor" ou "a pessoa"
- Use a 1ª pessoa do plural ("nós", "nossa", "conosco") ao falar de sentimentos, desafios, medos, dúvidas ou aprendizados — isso cria identificação e proximidade
- Exemplo correto: "Nós também passamos por momentos de dúvida" (nunca "as pessoas passam por momentos de dúvida")
- Exemplo correto: "Você já sentiu que Deus não estava ouvindo?" (nunca "é comum sentir que Deus não está ouvindo")
- Mantenha o tom de amigo próximo que caminha junto, não de autor distante que ensina de cima
- Responda EXATAMENTE neste formato:

TITULO: (título do devocional, máx 70 chars)
DESCRICAO: (pensamento do dia em 1 frase inspiradora com cunho cristão evangélico, máx 160 chars)
CONTEUDO:
(devocional completo com 400-600 palavras, incluindo versículo base, reflexão e aplicação prática)`;

export async function cronPastoral(env) {
  const temas = [
    'fé em tempos difíceis', 'gratidão e contentamento', 'oração persistente',
    'perdão e restauração', 'esperança no Senhor', 'força em Cristo',
    'amor ao próximo', 'confiança em Deus', 'paz que excede o entendimento',
    'renovação da mente', 'propósito divino', 'graça salvadora',
  ];
  const tema = temas[new Date().getDate() % temas.length];

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
      { role: 'system', content: SYSTEM_PROMPT + contexto },
      { role: 'user', content: `Escreva um devocional sobre: ${tema}` },
    ];
    const { text, model } = await runAI(env, messages);
    const parsed = parseConteudo(text);

    if (!parsed || parsed.conteudo.length < 200) {
      await logCron(env, 'pastoral', 'erro', 'Conteúdo inválido gerado', model);
      return;
    }

    // Salva como pensamento do dia (usa a descrição — frase inspiradora de cunho evangélico)
    const hoje = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO pensamentos (texto, referencia, data_exibicao)
       VALUES (?, ?, ?)`
    ).bind(parsed.descricao || parsed.titulo, parsed.titulo, hoje).run();

    // Salva como artigo publicado (devocionais vão direto)
    const slug = parsed.titulo.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO artigos (titulo, descricao, conteudo, palavras_chave, slug, status, seo_title, seo_description, published_at)
       VALUES (?, ?, ?, ?, ?, 'publicado', ?, ?, ?)`
    ).bind(
      parsed.titulo, parsed.descricao, parsed.conteudo,
      `devocional,${tema},fé,vida cristã`,
      `devocional-${hoje}-${slug}`,
      parsed.titulo, parsed.descricao,
      Math.floor(Date.now() / 1000),
    ).run();

    await logCron(env, 'pastoral', 'sucesso', `Devocional gerado: ${parsed.titulo}`, model);
    await sendTelegram(env, `✝️ <b>Devocional do Dia Gerado</b>\n\n<b>${parsed.titulo}</b>\n\n${parsed.descricao}\n\n<i>Publicado automaticamente.</i>`);

  } catch (e) {
    await logCron(env, 'pastoral', 'erro', e.message);
    await sendTelegram(env, `❌ <b>CRON Pastoral falhou</b>\n${e.message}`);
  }
}
