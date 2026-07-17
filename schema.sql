-- ============================================================
-- SITE PASTOR FABIANO GONÇALVES — D1 Schema
-- Execute: wrangler d1 execute fabiano-db --file=schema.sql
-- ============================================================

-- Artigos bíblicos (gerados por CRON, aprovação via Telegram)
CREATE TABLE IF NOT EXISTS artigos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  conteudo TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pendente', -- pendente | aprovado | rejeitado | publicado
  telegram_message_id INTEGER,
  imagem_url TEXT,
  palavras_chave TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at INTEGER
);

-- Notícias (manuais — equipe posta com foto, título, subtítulo, conteúdo)
CREATE TABLE IF NOT EXISTS noticias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  conteudo TEXT NOT NULL,
  foto_url TEXT,
  seo_title TEXT,
  seo_description TEXT,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'rascunho', -- rascunho | publicado
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at INTEGER
);

-- Mensagens / Pregações (embeds YouTube — gerenciados via admin)
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  descricao TEXT,
  destaque INTEGER DEFAULT 0, -- 1 = aparece no hero da home
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pensamento do dia
CREATE TABLE IF NOT EXISTS pensamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  referencia TEXT, -- Ex: "João 3:16"
  data_exibicao TEXT, -- YYYY-MM-DD (NULL = usar por ordem)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Captação de leads (mala direta / Mailchimp)
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT,
  bairro TEXT,
  cidade TEXT,
  origem TEXT DEFAULT 'site', -- home | contato | footer | instituto
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Doutores do Instituto de Saúde Mental
CREATE TABLE IF NOT EXISTS doutores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  especialidade TEXT NOT NULL, -- Psicólogo | Psicanalista | Psiquiatra
  foto_url TEXT,
  bio TEXT,
  registro TEXT, -- CRP / CRM
  ativo INTEGER DEFAULT 1
);

-- Disponibilidade por doutor (dias e horários de atendimento)
CREATE TABLE IF NOT EXISTS disponibilidade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doutor_id INTEGER NOT NULL,
  dia_semana INTEGER NOT NULL, -- 0=dom 1=seg 2=ter 3=qua 4=qui 5=sex 6=sáb
  hora_inicio TEXT NOT NULL,   -- HH:MM
  hora_fim TEXT NOT NULL,      -- HH:MM
  intervalo_min INTEGER DEFAULT 60,
  FOREIGN KEY (doutor_id) REFERENCES doutores(id) ON DELETE CASCADE
);

-- Bloqueios de datas (feriados, férias, datas avulsas)
CREATE TABLE IF NOT EXISTS bloqueios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doutor_id INTEGER, -- NULL = bloqueia todos os doutores
  data_bloqueada TEXT NOT NULL, -- YYYY-MM-DD
  motivo TEXT,
  FOREIGN KEY (doutor_id) REFERENCES doutores(id) ON DELETE CASCADE
);

-- Agendamentos de consultas
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doutor_id INTEGER NOT NULL,
  paciente_nome TEXT NOT NULL,
  paciente_email TEXT,
  paciente_whatsapp TEXT NOT NULL,
  data TEXT NOT NULL, -- YYYY-MM-DD
  hora TEXT NOT NULL, -- HH:MM
  status TEXT DEFAULT 'pendente', -- pendente | confirmado | cancelado | realizado
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doutor_id) REFERENCES doutores(id)
);

-- PDFs de referência para alimentar os CRONs de IA
CREATE TABLE IF NOT EXISTS pdfs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  r2_key TEXT NOT NULL,         -- chave no R2 para download
  conteudo_extraido TEXT,       -- texto extraído para contexto da IA
  tipo TEXT DEFAULT 'referencia', -- referencia | estudo | devocional | pregacao
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Logs de execução dos CRONs
CREATE TABLE IF NOT EXISTS cron_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cron_name TEXT NOT NULL,  -- pastoral | seo | social | suporte | analytics
  status TEXT NOT NULL,     -- sucesso | erro
  modelo_usado TEXT,
  mensagem TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_artigos_status ON artigos(status);
CREATE INDEX IF NOT EXISTS idx_artigos_slug ON artigos(slug);
CREATE INDEX IF NOT EXISTS idx_noticias_status ON noticias(status);
CREATE INDEX IF NOT EXISTS idx_noticias_slug ON noticias(slug);
CREATE INDEX IF NOT EXISTS idx_mensagens_destaque ON mensagens(destaque);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data, hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_doutor ON agendamentos(doutor_id);
CREATE INDEX IF NOT EXISTS idx_pensamentos_data ON pensamentos(data_exibicao);
CREATE INDEX IF NOT EXISTS idx_cron_logs_created ON cron_logs(created_at);
