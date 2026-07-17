// CRON ANALYTICS — Relatório semanal de atividade do site
// Disparo: "0 16 * * 1" (segunda 13:00 BRT)

import { runAI, logCron, sendTelegram } from './ai-helper.js';

export async function cronAnalytics(env) {
  try {
    const [artigos, noticias, leads, agendamentos, cronLogs] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='publicado' THEN 1 ELSE 0 END) as publicados FROM artigos`).first(),
      env.DB.prepare(`SELECT COUNT(*) as total FROM noticias WHERE status='publicado'`).first(),
      env.DB.prepare(`SELECT COUNT(*) as total, COUNT(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 END) as semana FROM leads`).first(),
      env.DB.prepare(`SELECT COUNT(*) as total, COUNT(CASE WHEN status='confirmado' THEN 1 END) as confirmados, COUNT(CASE WHEN status='cancelado' THEN 1 END) as cancelados FROM agendamentos`).first(),
      env.DB.prepare(`SELECT cron_name, COUNT(*) as execucoes, SUM(CASE WHEN status='sucesso' THEN 1 ELSE 0 END) as sucessos FROM cron_logs WHERE created_at >= datetime('now','-7 days') GROUP BY cron_name`).all(),
    ]);

    // Artigos mais recentes
    const artigosRecentes = await env.DB.prepare(
      `SELECT titulo, created_at FROM artigos WHERE status='publicado' ORDER BY created_at DESC LIMIT 3`
    ).all();

    // Resumo dos CRONs
    const cronStatus = (cronLogs.results || []).map(c =>
      `  • ${c.cron_name}: ${c.execucoes} execuções, ${c.sucessos} sucessos`
    ).join('\n') || '  • Sem atividade registrada';

    const artigosUltimos = (artigosRecentes.results || []).map(a =>
      `  • ${a.titulo}`
    ).join('\n') || '  • Nenhum artigo esta semana';

    const relatorio = `📊 <b>RELATÓRIO SEMANAL</b>\n\n` +
      `<b>📖 Conteúdo:</b>\n` +
      `  • Artigos: ${artigos?.total || 0} (${artigos?.publicados || 0} publicados)\n` +
      `  • Notícias: ${noticias?.total || 0} publicadas\n\n` +
      `<b>👥 Leads:</b>\n` +
      `  • Total: ${leads?.total || 0}\n` +
      `  • Novos esta semana: ${leads?.semana || 0}\n\n` +
      `<b>📅 Instituto — Agendamentos:</b>\n` +
      `  • Total: ${agendamentos?.total || 0}\n` +
      `  • Confirmados: ${agendamentos?.confirmados || 0}\n` +
      `  • Cancelados: ${agendamentos?.cancelados || 0}\n\n` +
      `<b>⚙️ CRONs (7 dias):</b>\n${cronStatus}\n\n` +
      `<b>📝 Artigos publicados esta semana:</b>\n${artigosUltimos}\n\n` +
      `<a href="https://fabianogoncalves.com.br/admin">Ver painel completo</a>`;

    await sendTelegram(env, relatorio);
    await logCron(env, 'analytics', 'sucesso',
      `Relatório: ${leads?.semana || 0} leads novos, ${artigos?.publicados || 0} artigos`);

  } catch (e) {
    await logCron(env, 'analytics', 'erro', e.message);
    await sendTelegram(env, `❌ <b>CRON Analytics falhou</b>\n${e.message}`);
  }
}
