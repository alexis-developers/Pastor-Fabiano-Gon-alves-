// CRON SUPORTE — Triagem semanal de agendamentos + encaminhamento
// Disparo: "0 15 * * 1" (segunda 12:00 BRT)

import { runAI, logCron, sendTelegram } from './ai-helper.js';

export async function cronSuportte(env) {
  try {
    // Conta agendamentos pendentes
    const pendentes = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM agendamentos WHERE status='pendente'`
    ).first();

    // Agendamentos desta semana
    const hoje = new Date().toISOString().slice(0, 10);
    const proxSemana = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const agenda = await env.DB.prepare(
      `SELECT a.nome_paciente, a.data, a.hora, a.whatsapp, d.nome as doutor
       FROM agendamentos a
       LEFT JOIN doutores d ON d.id = a.doutor_id
       WHERE a.data >= ? AND a.data <= ? AND a.status != 'cancelado'
       ORDER BY a.data, a.hora
       LIMIT 10`
    ).bind(hoje, proxSemana).all();

    // Leads novos na semana
    const leadsNovos = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM leads WHERE created_at >= datetime('now', '-7 days')`
    ).first();

    // Mensagens no chat (simulado via logs do CRON)
    const cronErros = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM cron_logs WHERE status='erro' AND created_at >= datetime('now', '-7 days')`
    ).first();

    // Relatório de triagem
    const agendaList = (agenda.results || []).map(a =>
      `• ${a.data} ${a.hora} — ${a.nome_paciente} (Dr. ${a.doutor || '?'}) ${a.whatsapp}`
    ).join('\n');

    const relatorio = `📋 <b>TRIAGEM SEMANAL</b>\n\n` +
      `<b>Agendamentos pendentes:</b> ${pendentes?.total || 0}\n` +
      `<b>Agenda próximos 7 dias:</b> ${agenda.results?.length || 0} consultas\n` +
      `<b>Leads novos na semana:</b> ${leadsNovos?.total || 0}\n` +
      `<b>Erros de CRON na semana:</b> ${cronErros?.total || 0}\n\n` +
      (agendaList ? `<b>📅 Consultas agendadas:</b>\n${agendaList}\n\n` : '') +
      `<a href="https://fabianogoncalves.com.br/admin">Acessar painel admin</a>`;

    await sendTelegram(env, relatorio);
    await logCron(env, 'suporte', 'sucesso',
      `Triagem: ${pendentes?.total || 0} pendentes, ${leadsNovos?.total || 0} leads novos`);

    // Se há muitos pendentes, alerta adicional
    if ((pendentes?.total || 0) > 5) {
      await sendTelegram(env,
        `⚠️ <b>ATENÇÃO:</b> ${pendentes.total} agendamentos pendentes aguardando confirmação!`);
    }

  } catch (e) {
    await logCron(env, 'suporte', 'erro', e.message);
    await sendTelegram(env, `❌ <b>CRON Suporte falhou</b>\n${e.message}`);
  }
}
