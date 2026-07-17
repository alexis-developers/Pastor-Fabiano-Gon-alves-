# Deploy — Pastor Fabiano Gonçalves

## Ordem de Deploy

### 1. Criar banco D1 e bucket R2

```bash
cd worker

# Criar banco D1
npx wrangler d1 create fabiano-db
# → copie o database_id retornado e cole em wrangler.toml

# Criar bucket R2
npx wrangler r2 bucket create fabiano-imagens

# Aplicar schema ao banco
npx wrangler d1 execute fabiano-db --file=../schema.sql --remote
```

### 2. Configurar Secrets

```bash
# Token de admin (gere um seguro)
npx wrangler secret put ADMIN_TOKEN
# → digite: openssl rand -hex 32

# Telegram (bot de aprovação de artigos)
npx wrangler secret put TELEGRAM_BOT_TOKEN
# → 8954357731:AAFvYa85qmw5e_iKvtTEmyBqN6nWQIx4YgQ

npx wrangler secret put TELEGRAM_GROUP_ID
# → -100XXXXXXXXXX (ID negativo do grupo no Telegram)

# Secret do webhook Telegram (anti-forjamento)
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# → gere com: openssl rand -hex 32
# → depois configure o webhook com secret_token (ver seção 4)
```

### 3. Deploy do Worker

```bash
cd worker
npx wrangler deploy
```

⚠️ **NUNCA** ativar Git Source no dashboard da Cloudflare.
Sempre deploy via `npx wrangler deploy` na pasta `worker/`.

### 4. Configurar Webhook do Telegram

Após o Worker estar no ar, configure o webhook **com secret_token** (anti-forjamento):

1. Gere o secret: `openssl rand -hex 32`
2. Configure via wrangler: `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`
3. Abra no browser (substitua {SECRET} pelo valor gerado):
```
https://api.telegram.org/bot8954357731:AAFvYa85qmw5e_iKvtTEmyBqN6nWQIx4YgQ/setWebhook?url=https://fabiano-api.dev-teste.workers.dev/api/telegram/webhook&secret_token={SECRET}
```

O Telegram enviará o header `X-Telegram-Bot-Api-Secret-Token` em cada webhook.
O Worker valida esse header com timing-safe comparison antes de processar.

### 5. Deploy do Frontend (Cloudflare Pages)

1. Faça push do repositório para o GitHub
2. No Cloudflare Pages → Create project → Connect to Git
3. Selecione o repositório
4. Build settings:
   - Build command: (vazio — site estático)
   - Build output directory: `web`
5. Em Settings → Environment variables:
   - `VITE_API_URL` = `https://fabiano-api.workers.dev`

### 6. Configurar Cloudflare Access (Admin)

No Cloudflare Zero Trust:
1. Access → Applications → Add Application → Self-hosted
2. Name: "Admin — Fabiano Gonçalves"
3. Domain: `fabianogoncalves.com.br/admin`
4. Policy: Allow → Email → `pastoralexdocavaco@gmail.com`
5. Session Duration: 24h
6. Auto-redirect to identity: ON

### 7. Obter o GROUP_ID do Telegram

1. Crie um grupo no Telegram
2. Adicione `@IAprFabianogoncalves_bot` ao grupo
3. Envie qualquer mensagem no grupo
4. Abra: `https://api.telegram.org/bot8954357731:AAFvYa85qmw5e_iKvtTEmyBqN6nWQIx4YgQ/getUpdates`
5. Procure `"chat":{"id":-XXXXXXXXXX}` (número negativo = grupo)
6. Configure: `npx wrangler secret put TELEGRAM_GROUP_ID`

### 8. Atualizar API_URL no frontend

Em todos os arquivos HTML da pasta `web/`, altere:
```js
const API = 'https://fabiano-api.workers.dev';
```
Para a URL real do seu Worker (após deploy).

### 9. Assets necessários

Copie para `web/assets/`:
- `FABIANO.png` — foto do pastor (para o hero)
- `qr-contato.png` — QR code de contato/PIX
- `favicon.ico` — ícone do site

### CRONs (automáticos após deploy)

| CRON | Horário | Função |
|------|---------|--------|
| Pastoral | Diário 10:00 BRT | Devocional do dia |
| SEO | Quinta 17:00 BRT | Artigo bíblico → Telegram |
| Social | Diário 11:00 BRT | Post para redes sociais |
| Suporte | Segunda 12:00 BRT | Triagem de agendamentos |
| Analytics | Segunda 13:00 BRT | Relatório semanal |
| Security | Diário 14:00 BRT | Varredura anti-conteúdo eleitoral |

### Comandos Telegram do Grupo (após artigo gerado)

```
/aprovar 42        → publica o artigo ID 42
/rejeitar 42       → marca como rejeitado
/editar 42 Novo Título → altera título e publica
```
