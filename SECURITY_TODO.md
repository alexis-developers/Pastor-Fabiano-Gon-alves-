# Hardening Segurança — Progresso (2026-07-15)

Ameaça: hacker injeta conteúdo eleitoral → print → denúncia TSE.

- [x] 1. requireAdmin timing-safe + rate limiter + filtro político (index.js helpers)
- [x] 2. Webhook Telegram: validar X-Telegram-Bot-Api-Secret-Token
- [x] 3. Rate limits nas rotas públicas (chat 10/min, leads 3/min, agendamento 3/min, webhook 30/min)
- [x] 4. Chat: filtro pós-IA anti-política (server-side)
- [x] 5. SQLi fix adminGetArtigos/adminGetNoticias (bind + whitelist)
- [x] 6. adminUpload: whitelist de extensões (jpg,jpeg,png,webp,gif) + limite 5MB + validação MIME
- [x] 7. Erro genérico (não vazar e.message) — log interno, resposta genérica ao cliente
- [x] 8. securityScan(): varredura diária anti-conteúdo eleitoral em artigos/noticias/pensamentos publicados → quarentena + alerta Telegram
- [x] 9. web/_headers: CSP, X-Frame-Options DENY, nosniff, referrer-policy, Permissions-Policy
- [x] 10. wrangler secret put TELEGRAM_WEBHOOK_SECRET + setWebhook com secret_token (ver DEPLOY.md seção 4)
- [x] 11. Deploy worker + pages + testes
- [x] 12. Memory update

## Detalhes dos Itens Implementados

### Item 6 — Upload Seguro
- Whitelist de extensões: jpg, jpeg, png, webp, gif
- Limite de 5MB por arquivo
- Validação de MIME type (image/jpeg, image/png, image/webp, image/gif)
- Localização: `worker/src/index.js` — função `adminUpload()`

### Item 7 — Erros Genéricos
- `e.message` não é exposto ao cliente
- Erro completo logado no console com timestamp e rota
- Resposta genérica: "Erro interno do servidor"
- Localização: `worker/src/index.js` — catch global do roteador

### Item 8 — Security Scan
- CRON diário às 14:00 BRT (17:00 UTC)
- Varre artigos, notícias e pensamentos publicados
- Detecta termos eleitorais/políticos via regex `POLITICAL_RE`
- Move conteúdo suspeito para status `quarentena`
- Deleta pensamentos políticos
- Alerta via Telegram com detalhes dos itens flagrados
- Log em `cron_logs` com nome `security-scan`
- Trigger manual: `POST /api/admin/cron/test { "cron": "security" }`
- Localização: `worker/src/index.js` — função `securityScan()`

### Item 9 — Headers de Segurança
- `X-Frame-Options: DENY` — bloqueia iframe
- `X-Content-Type-Options: nosniff` — previne MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` — restringe origens de scripts, estilos, conexões, frames
- Localização: `web/_headers`

### Item 10 — Pendente (manual)
```bash
cd worker
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# → gerar com: openssl rand -hex 32

# Depois configurar webhook no Telegram:
# https://api.telegram.org/bot{TOKEN}/setWebhook?url={WEBHOOK_URL}&secret_token={SECRET}
```

## NOTA: Coluna `quarentena` no schema

O status `quarentena` não estava no schema original. O D1 aceita qualquer string no campo `status`.
Para filtros funcionarem, adicionar ao admin:
- Filtro de artigos por status `quarentena`
- Possibilidade de restaurar artigos da quarentena
