// CRON NOTÍCIAS — Curador Chefe de Jornalismo Cristão + Feeds RSS (Economia e Gospel)
// Filtro rigoroso anti-fofoca, anti-escândalo e anti-polêmica tóxica
// Analisa e reescreve notícias sob a visão cristã e de direita moderada do Pr. Fabiano Gonçalves
// Salva no banco D1 com status 'pendente' e envia prévia formatada para aprovação no Telegram

import { runAI, logCron, sendTelegram, getTodayBRT } from './ai-helper.js';

const FEEDS_PADRAO = [
  { nome: 'Gazeta do Povo - Economia', url: 'https://www.gazetadopovo.com.br/feed/rss/economia.xml' },
  { nome: 'Repórter Gospel', url: 'https://www.reportergospel.com.br/feed/' },
  { nome: 'Gospel+', url: 'https://noticias.gospelmais.com.br/feed' },
  { nome: 'Notícia Cristã', url: 'https://noticias.gospelprime.com.br/feed/' }
];

const SYSTEM_PROMPT_NOTICIAS = `Você é um Curador Chefe de Jornalismo Cristão, analista socioeconômico e comentarista cristão evangélico do portal do Pastor Fabiano Gonçalves.

MISSÃO EDITORIAL:
- Ler notícias vindas de feeds RSS e selecionar/reescrever APENAS conteúdos edificantes, positivos, motivacionais, informativos, econômicos e úteis para a sociedade e para o leitor.
- Linha de direita moderada, conservadora em valores éticos e morais, cristã evangélica, fundamentada no livre mercado com responsabilidade social, ética no trabalho e valorização da família.

REGRA DE OURO (FILTRO RIGOROSO ANTI-FOFOCA & POLÊMICA):
Você deve BANIR, ELIMINAR, REPROVAR e IGNORAR completamente qualquer notícia que contenha:
1. Fofocas, rumores, escândalos ou especulações sobre vida privada.
2. Críticas, exposições, polêmicas ou matérias que denigrem a imagem de irmãos na fé, pastores, líderes religiosos, igrejas ou denominações.
3. Títulos caça-cliques (clickbaits) com tom de ataque, divisão ou polarização política/religiosa tóxica.

INSTRUÇÃO DE REPROVAÇÃO:
Se a notícia analisada violar esta Regra de Ouro (contiver fofoca, escândalo, ataque a líderes ou polêmica tóxica), responda APENAS com a palavra "REPROVADA". Não gere o formato abaixo.

DIRETRIZ GLOBAL DE EXCLUSIVIDADE E DIREITOS AUTORAIS (COPYRIGHT):
1. REESCRITA TOTAL (ANTI-PLÁGIO E DIREITOS AUTORAIS DE TEXTO):
   NUNCA fazer "copy/paste" nem apenas pequenas alterações no texto original. Leia os fatos da matéria e reescreva o conteúdo 100% do zero, criando um artigo de autoria própria do nosso portal. O texto final deve ser inédito, blindando o site contra qualquer acusação de plágio ou violação de copyright.
2. RECRIAÇÃO DE IMAGENS E PRESERVAÇÃO DE FISIONOMIA:
   - Se a imagem contiver PESSOAS (figuras públicas, políticos, pastores, etc.): É terminantemente PROIBIDO alterar a fisionomia, o rosto, a etnia ou a identidade da pessoa. A figura humana original deve ser fielmente mantida. Altere APENAS o pano de fundo (background), iluminação, enquadramento ou filtro estilizado no ambiente, sem deformar ou trocar quem é a pessoa retratada.
   - Se a imagem for GENÉRICA (objetos, prédios, gráficos, paisagens): Liberdade total para recriar a imagem do zero, gerando um visual novo e livre de royalties.

SE A NOTÍCIA FOR APROVADA:
- NUNCA inventar dados ou números falsos.
- NUNCA citar nomes de candidatos em período eleitoral, números de partidos ou propaganda eleitoral direta (cumprimento estrito de neutralidade e imunidade eleitoral).
- Citar sempre a fonte original da informação no corpo do texto (ex: "Conforme apurado pela imprensa / Gazeta do Povo...").

Responda EXATAMENTE neste formato:
TITULO: (novo título autoral edificante e jornalístico)
SUBTITULO: (novo subtítulo animador e positivo em 2 a 3 frases)
CONTEUDO:
(artigo completo reescrito com 300 a 500 palavras — O Fato, Análise Econômica/Social e Visão Ética/Cristã)
SEO_TITLE: (título otimizado para busca Google)
SEO_DESC: (meta descrição de 140-150 caracteres)`;

export function parseRssFeed(xmlText) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[0];
    
    // Título
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : '').replace(/<[^>]+>/g, '').trim();

    // Link
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i) ||
                      itemXml.match(/<guid[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/guid>/i);
    const link = (linkMatch ? (linkMatch[1] || linkMatch[2]) : '').trim();

    // Descrição / Conteúdo
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i) ||
                      itemXml.match(/<content:encoded>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/content:encoded>/i);
    const rawDesc = descMatch ? (descMatch[1] || descMatch[2]) : '';
    const description = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Imagem
    let imageUrl = '';
    const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i) ||
                       itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i) ||
                       rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (mediaMatch) {
      imageUrl = mediaMatch[1];
    }

    if (title && link) {
      items.push({ title, link, description, imageUrl });
    }
  }

  return items;
}

export function parseNoticiaConteudo(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  if (/^REPROVADA$/i.test(clean) || clean.includes('REPROVADA')) {
    return { reprovada: true };
  }

  const tituloMatch = clean.match(/TITULO:\s*(.+?)(?=\n|SUBTITULO:|$)/i);
  const subtituloMatch = clean.match(/SUBTITULO:\s*(.+?)(?=\n|CONTEUDO:|$)/i);
  const conteudoMatch = clean.match(/CONTEUDO:\s*\n?([\s\S]+?)(?=\nSEO_TITLE:|$)/i);
  const seoTitleMatch = clean.match(/SEO_TITLE:\s*(.+?)(?=\n|SEO_DESC:|$)/i);
  const seoDescMatch = clean.match(/SEO_DESC:\s*(.+?)$/i);

  if (!tituloMatch || !conteudoMatch) return null;

  const titulo = tituloMatch[1].trim().replace(/^["*#]+|["*#]+$/g, '').slice(0, 120);
  const subtitulo = subtituloMatch ? subtituloMatch[1].trim().slice(0, 250) : titulo;
  const conteudo = conteudoMatch[1].trim();
  const seoTitle = seoTitleMatch ? seoTitleMatch[1].trim().slice(0, 70) : titulo;
  const seoDesc = seoDescMatch ? seoDescMatch[1].trim().slice(0, 160) : subtitulo;

  return { reprovada: false, titulo, subtitulo, conteudo, seoTitle, seoDesc };
}

async function uploadImageToR2(env, imageUrl, slug) {
  if (!imageUrl || !env.IMAGENS) return imageUrl || '';
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return imageUrl;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `noticias/${slug}-${Date.now()}.${ext}`;
    
    const arrayBuffer = await res.arrayBuffer();
    await env.IMAGENS.put(key, arrayBuffer, {
      httpMetadata: { contentType }
    });
    return `https://imagens.fabianogoncalves.com.br/${key}`;
  } catch (e) {
    console.error('Erro ao salvar imagem no R2:', e);
    return imageUrl;
  }
}

export async function processSingleFeedItem(env, item, fonteNome) {
  // Desduplicação: verifica se já existe notícia com essa URL fonte
  const existe = await env.DB.prepare(
    `SELECT id FROM noticias WHERE fonte_url = ?`
  ).bind(item.link).first();

  if (existe) {
    return { status: 'pulado', reason: 'Matéria já processada anteriormente' };
  }

  // Memória da IA: busca títulos de notícias recentes para evitar repetições
  let historicoPrompt = '';
  try {
    const ultimasNoticias = await env.DB.prepare(
      `SELECT titulo FROM noticias ORDER BY id DESC LIMIT 20`
    ).all();
    const titulosUsados = (ultimasNoticias.results || []).map(n => n.titulo).join(' | ');
    historicoPrompt = `\n\nMEMÓRIA DA IA — NOTÍCIAS RECENTES JÁ PUBLICADAS (NÃO REPETIR TÍTULOS OU MANCHETES SIMILARES):\n${titulosUsados || 'Nenhum'}`;
  } catch {}

  const promptUser = `FONTE: ${fonteNome}
URL ORIGINAL: ${item.link}
TÍTULO ORIGINAL: ${item.title}
RESUMO ORIGINAL: ${item.description || item.title}

Analise esta matéria. Se for fofoca, escândalo, ataque ou polêmica tóxica sobre líderes ou igrejas, responda APENAS "REPROVADA". Caso contrário, reescreva-a de forma 100% autoral, positiva e edificante.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT_NOTICIAS + historicoPrompt },
    { role: 'user', content: promptUser }
  ];

  const { text, model } = await runAI(env, messages);
  const parsed = parseNoticiaConteudo(text);

  if (!parsed || parsed.reprovada) {
    return { status: 'reprovado', reason: 'Filtro de ouro ativado (fofoca/polêmica reprovada pela IA)' };
  }

  if (parsed.conteudo.length < 200) {
    throw new Error('Conteúdo retornado pela IA é insuficiente ou inválido.');
  }

  const hoje = getTodayBRT();
  const baseSlug = parsed.titulo.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
  const slug = `noticia-${hoje}-${baseSlug}`;

  // Upload da foto para R2 (se houver foto no RSS)
  const fotoUrlFinal = item.imageUrl ? await uploadImageToR2(env, item.imageUrl, baseSlug) : '';

  // Salva no banco D1 com status 'pendente'
  const result = await env.DB.prepare(
    `INSERT INTO noticias (titulo, subtitulo, conteudo, foto_url, seo_title, seo_description, slug, status, fonte_url, fonte_nome)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`
  ).bind(
    parsed.titulo,
    parsed.subtitulo,
    parsed.conteudo,
    fotoUrlFinal,
    parsed.seoTitle,
    parsed.seoDesc,
    slug,
    item.link,
    fonteNome
  ).run();

  const noticiaId = result.meta?.last_row_id || result.lastRowId;

  // Formato exato do Telegram conforme treinamento do Curador Chefe
  const mensagemTelegram = `✅ <b>Eu eliminei, sob o treinamento que obtive, toda fofoca ou matéria que denigre líderes e irmãos. Abaixo segue a matéria do feed, OK para aprovação no Telegram:</b>\n\n` +
    `<b>${parsed.titulo}</b>\n` +
    `${parsed.subtitulo}\n\n` +
    `🔗 <b>Leia mais aqui:</b> ${item.link}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Para publicar no site:</i>\n<code>/aprovar_noticia ${noticiaId}</code>\n\n` +
    `<i>Para rejeitar:</i>\n<code>/rejeitar_noticia ${noticiaId}</code>`;

  await sendTelegram(env, mensagemTelegram);

  return { status: 'sucesso', id: noticiaId, titulo: parsed.titulo, model };
}

export async function cronNoticias(env, customFeedUrl = null) {
  const feeds = customFeedUrl 
    ? [{ nome: 'Feed Personalizado', url: customFeedUrl }]
    : FEEDS_PADRAO;

  let processadas = 0;
  let reprovadas = 0;
  let erros = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (!res.ok) {
        erros.push(`Falha ao carregar RSS ${feed.nome}: HTTP ${res.status}`);
        continue;
      }

      const xmlText = await res.text();
      const items = parseRssFeed(xmlText);

      if (!items.length) {
        erros.push(`Nenhum item válido encontrado no feed ${feed.nome}`);
        continue;
      }

      // Processa até 3 notícias por execução
      const itemsToProcess = items.slice(0, 3);
      for (const item of itemsToProcess) {
        try {
          const resItem = await processSingleFeedItem(env, item, feed.nome);
          if (resItem.status === 'sucesso') processadas++;
          if (resItem.status === 'reprovado') reprovadas++;
        } catch (errItem) {
          erros.push(`Erro no item "${item.title.slice(0, 30)}": ${errItem.message}`);
        }
      }

    } catch (e) {
      erros.push(`Erro geral no feed ${feed.nome}: ${e.message}`);
    }
  }

  const logStatus = erros.length > 0 && processadas === 0 ? 'erro' : 'sucesso';
  const logMsg = `Aprovadas: ${processadas}. Reprovadas pelo filtro: ${reprovadas}. ${erros.length ? 'Erros: ' + erros.join('; ') : ''}`;
  await logCron(env, 'noticias-rss', logStatus, logMsg);

  return { processadas, reprovadas, erros };
}
