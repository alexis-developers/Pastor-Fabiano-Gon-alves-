// CRON SOCIAL — Gera sugestão de post para redes sociais
// Disparo: "0 14 * * *" (11:00 BRT, diário)

import { runAI, logCron, sendTelegram } from './ai-helper.js';

const SYSTEM_PROMPT = `Você é o redator de redes sociais do Pastor Fabiano Gonçalves.

ESTILO:
- Pastoral-acolhedor, direto, inspirador
- Linguagem do WhatsApp/Instagram: acessível, emocional, com chamada à ação
- SEMPRE incluir hashtags relevantes ao final
- Tom: como se o próprio Pastor Fabiano estivesse escrevendo para seus seguidores

FORMATOS (variar a cada dia da semana):
- Segunda: versículo motivacional com reflexão curta
- Terça: pergunta reflexiva que gera engajamento
- Quarta: citação bíblica com aplicação prática
- Quinta: anúncio do novo artigo (quando houver)
- Sexta: mensagem de bênção para o fim de semana
- Sábado: chamada para culto/evento
- Domingo: palavra pastoral de encorajamento

REGRAS:
- Máximo 280 caracteres para Twitter/X (versão curta)
- Versão expandida para Instagram (até 2000 chars)
- SEMPRE terminar com hashtags
- NUNCA usar linguagem religiosa excessivamente formal
- NUNCA usar a palavra "ministério" nos textos
- NUNCA mencionar política, eleições, candidatos, partidos, votos ou cargos públicos

LINGUAGEM EMPÁTICA E ACOLHEDORA (SEGUIR SEMPRE):
- Dirija-se diretamente ao leitor usando "você" — nunca "o leitor" ou "a pessoa"
- Use a 1ª pessoa do plural ("nós", "nossa", "conosco") ao falar de sentimentos, desafios, medos, dúvidas ou aprendizados
- Tom de amigo próximo que caminha junto, não de autor distante`;

export async function cronSocial(env) {
  const diasSemana = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const dia = diasSemana[new Date().getDay()];

  // Busca artigo mais recente para anunciar
  let artigoRecente = '';
  try {
    const artigo = await env.DB.prepare(
      `SELECT titulo, slug FROM artigos WHERE status='publicado' ORDER BY created_at DESC LIMIT 1`
    ).first();
    if (artigo) artigoRecente = `\nARTIGO RECENTE: "${artigo.titulo}" em fabianogoncalves.com.br/artigos/?slug=${artigo.slug}`;
  } catch {}

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Gere um post para ${dia}-feira.${artigoRecente}\n\nFormato:\nPOST_CURTO: (máx 280 chars, para X/Twitter)\nPOST_INSTAGRAM:\n(versão expandida para Instagram)` },
    ];
    const { text, model } = await runAI(env, messages, 1500);

    // Parse simples
    const curtoMatch  = text.match(/POST_CURTO:\s*(.+?)(?=\nPOST_INSTAGRAM:|$)/s);
    const instagramMatch = text.match(/POST_INSTAGRAM:\s*([\s\S]+)/);

    const postCurto     = curtoMatch?.[1]?.trim() || '';
    const postInstagram = instagramMatch?.[1]?.trim() || '';

    if (!postCurto) {
      await logCron(env, 'social', 'erro', 'Post não gerado', model);
      return;
    }

    await logCron(env, 'social', 'sucesso', `Post ${dia} gerado`, model);

    const msg = `📱 <b>SUGESTÃO DE POST — ${dia.toUpperCase()}</b>\n\n` +
      `<b>📣 Twitter/X:</b>\n<code>${postCurto}</code>\n\n` +
      `<b>📸 Instagram:</b>\n${postInstagram || postCurto}\n\n` +
      `<i>Modelo: ${model}</i>`;

    await sendTelegram(env, msg);

  } catch (e) {
    await logCron(env, 'social', 'erro', e.message);
  }
}
