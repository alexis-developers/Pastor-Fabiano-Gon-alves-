/* ============================================================
   ADMIN — Pastor Fabiano Gonçalves
   Arquivo só acessível após CF Access OTP
   ============================================================ */

// ── Config ─────────────────────────────────────────────────
// Seguro: este arquivo só é servido a usuários autenticados pelo Cloudflare Access
let API_URL     = localStorage.getItem('admin_api_url') || 'https://fabiano-api.dev-teste.workers.dev';
let ADMIN_TOKEN = localStorage.getItem('admin_token') || '7aa16ef4ca74973135931e95229b1ea83835ddabca71cb4d8977b546b488e0f9';

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  loadDashboard();

  // Esc fecha modais
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open')
      .forEach(m => m.classList.remove('open'));
  });

  // Clique fora fecha modal
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });

  // Pré-visualiza YouTube ID
  document.getElementById('mensagem-yt').addEventListener('input', function() {
    const id = this.value.trim();
    const preview = document.getElementById('mensagem-preview');
    const thumb   = document.getElementById('mensagem-thumb');
    if (id.length > 5) {
      thumb.src = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
      preview.style.display = 'block';
    } else preview.style.display = 'none';
  });
});

function logout() {
  window.location.href = 'https://pastor-fabiano.cloudflareaccess.com/cdn-cgi/access/logout';
}

function headers() {
  return { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN };
}

async function api(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { alert('Sessão expirada. Faça login novamente.'); return {}; }
  return res.json();
}

// ── Navegação ────────────────────────────────────────────────
const SECTIONS = ['dashboard','mensagens','pensamentos','noticias','artigos','editor-artigo','doutores','agenda','agendamentos','pdfs','cron-logs','leads','config'];
const TITLES   = {
  dashboard:'Dashboard', mensagens:'Mensagens (YouTube)', pensamentos:'Pensamento do Dia',
  noticias:'Notícias', artigos:'Artigos Bíblicos', 'editor-artigo':'Novo Artigo', doutores:'Doutores',
  agenda:'Configurar Agenda', agendamentos:'Agendamentos', pdfs:'PDFs de Referência',
  'cron-logs':'Logs dos CRONs', leads:'Contatos Captados', config:'Configurações'
};

function showSection(id) {
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === id ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().includes(TITLES[id]?.split(' ')[0] || ''));
  });
  document.getElementById('topbar-title').textContent = TITLES[id] || id;
  loaders[id]?.();
}

// ── Loaders por seção ────────────────────────────────────────
const loaders = {
  dashboard:    loadDashboard,
  mensagens:    loadMensagens,
  pensamentos:  loadPensamentos,
  noticias:     loadNoticias,
  artigos:      () => loadArtigos(''),
  doutores:     loadDoutores,
  agendamentos: loadAgendamentos,
  pdfs:         loadPdfs,
  'cron-logs':  loadCronLogs,
  leads:        loadLeads,
};

// ── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [m, n, a, l, ag] = await Promise.allSettled([
      fetch(`${API_URL}/api/mensagens`).then(r=>r.json()),
      fetch(`${API_URL}/api/noticias`).then(r=>r.json()),
      api('GET','/api/admin/artigos'),
      api('GET','/api/admin/leads'),
      api('GET','/api/admin/agendamentos'),
    ]);
    const safe = r => (r.status==='fulfilled' && r.value) ? (Array.isArray(r.value) ? r.value : (r.value.items||[])) : [];
    setText('stat-mensagens', safe(m).length);
    setText('stat-noticias',  safe(n).length);
    setText('stat-artigos',   safe(a).length);
    setText('stat-leads',     safe(l).length);
    setText('stat-agendamentos', safe(ag).length);

    const artigos  = safe(a);
    const pendentes = artigos.filter(x=>x.status==='pendente');
    const badge = document.getElementById('badge-pendentes');
    if (badge) { badge.textContent = `${pendentes.length} PENDENTES`; badge.style.display = pendentes.length ? '' : 'none'; }
    const el = document.getElementById('artigos-pendentes');
    if (!pendentes.length) { el.innerHTML = '<p style="color:var(--gray-400);font-size:0.85rem">Nenhum artigo pendente.</p>'; return; }
    el.innerHTML = pendentes.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100)">
        <span style="font-size:0.88rem">${esc(a.titulo)}</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" style="background:#e6f9f0;color:#1a7a45;border:none" onclick="publicarArtigo(${a.id})">Publicar</button>
          <button class="btn btn-sm btn-danger" onclick="deletarArtigo(${a.id})">Rejeitar</button>
        </div>
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

// ── MENSAGENS ────────────────────────────────────────────────
let _mensagens = [];
async function loadMensagens() {
  try {
    const data = await fetch(`${API_URL}/api/mensagens`).then(r=>r.json());
    _mensagens = data;
    const tbody = document.getElementById('mensagens-tbody');
    tbody.innerHTML = data.map(m => `
      <tr>
        <td>${esc(m.titulo)}</td>
        <td><a href="https://youtube.com/watch?v=${m.youtube_id}" target="_blank" style="color:var(--blue)">${m.youtube_id}</a></td>
        <td>${m.destaque ? '<span class="badge badge--green">Destaque</span>' : '<span class="badge badge--gray">Não</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editMensagem(${m.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deletarMensagem(${m.id})" style="margin-left:4px">Excluir</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:var(--gray-400)">Nenhuma mensagem cadastrada.</td></tr>';
  } catch(e) { toast('Erro ao carregar mensagens','error'); }
}

function clearMensagem() {
  document.getElementById('mensagem-id').value = '';
  document.getElementById('mensagem-titulo').value = '';
  document.getElementById('mensagem-yt').value = '';
  document.getElementById('mensagem-desc').value = '';
  document.getElementById('mensagem-destaque').checked = false;
  document.getElementById('mensagem-preview').style.display = 'none';
  document.getElementById('modal-mensagem-title').textContent = 'Nova Mensagem';
}

function editMensagem(id) {
  const m = _mensagens.find(x=>x.id===id);
  if (!m) return;
  document.getElementById('mensagem-id').value    = id;
  document.getElementById('mensagem-titulo').value= m.titulo;
  document.getElementById('mensagem-yt').value    = m.youtube_id;
  document.getElementById('mensagem-desc').value  = m.descricao||'';
  document.getElementById('mensagem-destaque').checked = !!m.destaque;
  document.getElementById('mensagem-thumb').src   = `https://img.youtube.com/vi/${m.youtube_id}/mqdefault.jpg`;
  document.getElementById('mensagem-preview').style.display = 'block';
  document.getElementById('modal-mensagem-title').textContent = 'Editar Mensagem';
  openModal('modal-mensagem');
}

async function saveMensagem() {
  const id     = document.getElementById('mensagem-id').value;
  const titulo = document.getElementById('mensagem-titulo').value.trim();
  const ytId   = document.getElementById('mensagem-yt').value.trim();
  if (!titulo || !ytId) return toast('Título e ID do YouTube são obrigatórios','error');
  const body = {
    titulo, youtube_id: ytId,
    descricao:  document.getElementById('mensagem-desc').value.trim()||null,
    destaque:   document.getElementById('mensagem-destaque').checked ? 1 : 0,
  };
  try {
    if (id) await api('PUT', `/api/admin/mensagens/${id}`, body);
    else    await api('POST','/api/admin/mensagens', body);
    closeModal('modal-mensagem');
    toast(id ? 'Mensagem atualizada' : 'Mensagem criada','success');
    loadMensagens();
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarMensagem(id) {
  if (!confirm('Excluir esta mensagem?')) return;
  await api('DELETE',`/api/admin/mensagens/${id}`);
  toast('Mensagem excluída');
  loadMensagens();
}

// ── PENSAMENTOS ──────────────────────────────────────────────
async function loadPensamentos() {
  try {
    const data = await api('GET','/api/admin/pensamentos');
    const tbody = document.getElementById('pensamentos-tbody');
    tbody.innerHTML = (data||[]).map(p => `
      <tr>
        <td style="max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.texto)}</td>
        <td>${esc(p.referencia||'—')}</td>
        <td>${p.data_exibicao||'Aleatória'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deletarPensamento(${p.id})">Excluir</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:var(--gray-400)">Nenhum pensamento.</td></tr>';
  } catch(e) { toast('Erro ao carregar','error'); }
}

async function savePensamento() {
  const texto = document.getElementById('pensamento-texto').value.trim();
  if (!texto) return toast('Texto obrigatório','error');
  try {
    await api('POST','/api/admin/pensamentos', {
      texto,
      referencia:    document.getElementById('pensamento-ref').value.trim()||null,
      data_exibicao: document.getElementById('pensamento-data').value||null,
    });
    closeModal('modal-pensamento');
    toast('Pensamento salvo','success');
    loadPensamentos();
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarPensamento(id) {
  if (!confirm('Excluir?')) return;
  await api('DELETE',`/api/admin/pensamentos/${id}`);
  toast('Excluído');
  loadPensamentos();
}

// ── NOTÍCIAS ─────────────────────────────────────────────────
let _noticias = [];
async function loadNoticias() {
  try {
    const data = await api('GET','/api/admin/noticias');
    _noticias = data||[];
    const tbody = document.getElementById('noticias-tbody');
    tbody.innerHTML = _noticias.map(n => `
      <tr>
        <td><strong>${esc(n.titulo)}</strong></td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.subtitulo||'—')}</td>
        <td><span class="badge badge--${n.publicado?'green':'gray'}">${n.publicado?'Publicado':'Rascunho'}</span></td>
        <td style="white-space:nowrap">${fmtDate(n.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editNoticia(${n.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deletarNoticia(${n.id})" style="margin-left:4px">Excluir</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--gray-400)">Nenhuma notícia.</td></tr>';
  } catch(e) { toast('Erro ao carregar','error'); }
}

function clearNoticia() {
  ['noticia-id','noticia-titulo','noticia-subtitulo','noticia-foto','noticia-seo-title','noticia-seo-desc'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('noticia-conteudo').innerHTML = '';
  const prev = document.getElementById('noticia-foto-preview');
  prev.src = ''; prev.style.display = 'none';
  document.getElementById('modal-noticia-title').textContent = 'Nova Notícia';
}

function editNoticia(id) {
  const n = _noticias.find(x=>x.id===id);
  if (!n) return;
  document.getElementById('noticia-id').value        = id;
  document.getElementById('noticia-titulo').value     = n.titulo;
  document.getElementById('noticia-subtitulo').value  = n.subtitulo||'';
  document.getElementById('noticia-foto').value       = n.foto_url||'';
  document.getElementById('noticia-seo-title').value  = n.seo_title||'';
  document.getElementById('noticia-seo-desc').value   = n.seo_description||'';
  document.getElementById('noticia-conteudo').innerHTML = n.conteudo||'';
  if (n.foto_url) {
    const prev = document.getElementById('noticia-foto-preview');
    prev.src = n.foto_url; prev.style.display = 'block';
  }
  document.getElementById('modal-noticia-title').textContent = 'Editar Notícia';
  openModal('modal-noticia');
}

async function saveNoticia() {
  const id     = document.getElementById('noticia-id').value;
  const titulo = document.getElementById('noticia-titulo').value.trim();
  if (!titulo) return toast('Título obrigatório','error');
  const conteudo = document.getElementById('noticia-conteudo').innerHTML.trim();
  if (!conteudo) return toast('Conteúdo obrigatório','error');
  const body = {
    titulo,
    subtitulo:       document.getElementById('noticia-subtitulo').value.trim()||null,
    foto_url:        document.getElementById('noticia-foto').value.trim()||null,
    seo_title:       document.getElementById('noticia-seo-title').value.trim()||null,
    seo_description: document.getElementById('noticia-seo-desc').value.trim()||null,
    conteudo,
    publicado: 1,
  };
  try {
    if (id) await api('PUT',`/api/admin/noticias/${id}`, body);
    else    await api('POST','/api/admin/noticias', body);
    closeModal('modal-noticia');
    toast('Notícia salva','success');
    loadNoticias();
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarNoticia(id) {
  if (!confirm('Excluir esta notícia?')) return;
  await api('DELETE',`/api/admin/noticias/${id}`);
  toast('Excluída');
  loadNoticias();
}

// ── ARTIGOS ──────────────────────────────────────────────────
let _artigos = [], _artigoFiltro = '';
async function loadArtigos(filtro) {
  _artigoFiltro = filtro;
  try {
    const data = await api('GET','/api/admin/artigos');
    _artigos = data||[];
    const lista = filtro ? _artigos.filter(a=>a.status===filtro) : _artigos;
    const tbody = document.getElementById('artigos-tbody');
    tbody.innerHTML = lista.map(a => `
      <tr>
        <td><strong>${esc(a.titulo)}</strong></td>
        <td><span class="badge badge--${badgeStatus(a.status)}">${a.status}</span></td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.78rem">${esc(a.palavras_chave||'—')}</td>
        <td style="white-space:nowrap">${fmtDate(a.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editArtigo(${a.id})">Editar</button>
          ${a.status!=='publicado' ? `<button class="btn btn-sm" style="background:#e6f9f0;color:#1a7a45;border:none;margin-left:4px" onclick="publicarArtigo(${a.id})">Publicar</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deletarArtigo(${a.id})" style="margin-left:4px">Excluir</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--gray-400)">Nenhum artigo.</td></tr>';
  } catch(e) { toast('Erro ao carregar','error'); }
}

function filterArtigos(f) { loadArtigos(f); }

function clearArtigo() {
  ['artigo-id','artigo-titulo','artigo-desc','artigo-kw','artigo-seo-title','artigo-seo-desc'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('artigo-conteudo').innerHTML = '';
  document.getElementById('artigo-status').value = 'rascunho';
  document.getElementById('editor-artigo-title').textContent = 'Novo Artigo';
}

function editArtigo(id) {
  const a = _artigos.find(x=>x.id===id);
  if (!a) return;
  document.getElementById('artigo-id').value        = id;
  document.getElementById('artigo-titulo').value     = a.titulo;
  document.getElementById('artigo-desc').value       = a.descricao||'';
  document.getElementById('artigo-kw').value         = a.palavras_chave||'';
  document.getElementById('artigo-seo-title').value  = a.seo_title||'';
  document.getElementById('artigo-seo-desc').value   = a.seo_description||'';
  document.getElementById('artigo-conteudo').innerHTML = a.conteudo||'';
  document.getElementById('artigo-status').value     = a.status||'rascunho';
  document.getElementById('editor-artigo-title').textContent = 'Editar Artigo';
  showSection('editor-artigo');
}

async function saveArtigo() {
  const id     = document.getElementById('artigo-id').value;
  const titulo = document.getElementById('artigo-titulo').value.trim();
  if (!titulo) return toast('Título obrigatório','error');
  const body = {
    titulo,
    descricao:       document.getElementById('artigo-desc').value.trim()||null,
    palavras_chave:  document.getElementById('artigo-kw').value.trim()||null,
    seo_title:       document.getElementById('artigo-seo-title').value.trim()||null,
    seo_description: document.getElementById('artigo-seo-desc').value.trim()||null,
    conteudo:        document.getElementById('artigo-conteudo').innerHTML.trim(),
    status:          document.getElementById('artigo-status').value,
  };
  try {
    if (id) await api('PUT',`/api/admin/artigos/${id}`, body);
    else    await api('POST','/api/admin/artigos', body);
    showSection('artigos');
    toast('Artigo salvo','success');
    loadArtigos(_artigoFiltro);
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function publicarArtigo(id) {
  await api('PUT',`/api/admin/artigos/${id}`, { status:'publicado' });
  toast('Artigo publicado','success');
  loadArtigos(_artigoFiltro);
  loadDashboard();
}

async function deletarArtigo(id) {
  if (!confirm('Excluir este artigo?')) return;
  await api('DELETE',`/api/admin/artigos/${id}`);
  toast('Excluído');
  loadArtigos(_artigoFiltro);
}

// ── DOUTORES ─────────────────────────────────────────────────
let _doutores = [];
async function loadDoutores() {
  try {
    const data = await fetch(`${API_URL}/api/doutores`).then(r=>r.json());
    _doutores = data||[];
    populateAgendaDoutores();
    const grid = document.getElementById('doutores-cards');
    if (!_doutores.length) { grid.innerHTML = '<p style="color:var(--gray-400)">Nenhum doutor cadastrado.</p>'; return; }
    grid.innerHTML = _doutores.map(d => `
      <div style="background:var(--white);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)">
        ${d.foto_url
          ? `<img src="${esc(d.foto_url)}" alt="${esc(d.nome)}" style="width:100%;height:160px;object-fit:cover">`
          : `<div style="height:100px;background:linear-gradient(135deg,var(--blue),var(--blue-light));display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)" width="40" height="40"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`}
        <div style="padding:16px">
          <h3 style="color:var(--blue);font-size:0.95rem;margin-bottom:4px">${esc(d.nome)}</h3>
          <p style="color:var(--gold);font-size:0.78rem;font-weight:700;margin-bottom:8px">${esc(d.especialidade)}</p>
          ${d.registro ? `<p style="font-size:0.72rem;color:var(--gray-400);margin-bottom:8px">${esc(d.registro)}</p>` : ''}
          <div style="display:flex;gap:6px;margin-top:12px">
            <button class="btn btn-sm btn-outline" onclick="editDoutor(${d.id})">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deletarDoutor(${d.id})">Excluir</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch(e) { toast('Erro ao carregar doutores','error'); }
}

function clearDoutor() {
  ['doutor-id','doutor-nome','doutor-crp','doutor-foto','doutor-bio'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('doutor-esp').value = 'Psicólogo';
  document.getElementById('modal-doutor-title').textContent = 'Cadastrar Doutor';
}

function editDoutor(id) {
  const d = _doutores.find(x=>x.id===id);
  if (!d) return;
  document.getElementById('doutor-id').value    = id;
  document.getElementById('doutor-nome').value   = d.nome;
  document.getElementById('doutor-esp').value    = d.especialidade;
  document.getElementById('doutor-crp').value    = d.registro||'';
  document.getElementById('doutor-foto').value   = d.foto_url||'';
  document.getElementById('doutor-bio').value    = d.bio||'';
  document.getElementById('modal-doutor-title').textContent = 'Editar Doutor';
  openModal('modal-doutor');
}

async function saveDoutor() {
  const id = document.getElementById('doutor-id').value;
  const nome = document.getElementById('doutor-nome').value.trim();
  if (!nome) return toast('Nome obrigatório','error');
  const body = {
    nome,
    especialidade: document.getElementById('doutor-esp').value,
    registro:      document.getElementById('doutor-crp').value.trim()||null,
    foto_url:      document.getElementById('doutor-foto').value.trim()||null,
    bio:           document.getElementById('doutor-bio').value.trim()||null,
  };
  try {
    if (id) await api('PUT',`/api/admin/doutores/${id}`, body);
    else    await api('POST','/api/admin/doutores', body);
    closeModal('modal-doutor');
    toast('Doutor salvo','success');
    loadDoutores();
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarDoutor(id) {
  if (!confirm('Excluir este doutor?')) return;
  await api('DELETE',`/api/admin/doutores/${id}`);
  toast('Excluído');
  loadDoutores();
}

// ── AGENDA ───────────────────────────────────────────────────
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
let _agendaDoutorId = null;
let _disponibilidade = [];

function populateAgendaDoutores() {
  const sel = document.getElementById('agenda-doutor-select');
  const val = sel.value;
  sel.innerHTML = '<option value="">— escolha um doutor —</option>' +
    _doutores.map(d=>`<option value="${d.id}">${esc(d.nome)} — ${esc(d.especialidade)}</option>`).join('');
  if (val) sel.value = val;
}

async function loadAgendaDoutor(doutorId) {
  if (!doutorId) { document.getElementById('agenda-config').style.display='none'; return; }
  _agendaDoutorId = parseInt(doutorId);
  document.getElementById('agenda-config').style.display = 'block';

  try {
    const data = await api('GET',`/api/admin/disponibilidade/${doutorId}`);
    _disponibilidade = data||[];
    renderDisponibilidadeForm();
    await loadBloqueios(doutorId);
  } catch(e) { toast('Erro ao carregar agenda','error'); }
}

function renderDisponibilidadeForm() {
  const form = document.getElementById('disponibilidade-form');
  form.innerHTML = DIAS.map((dia, idx) => {
    const disp = _disponibilidade.find(d=>d.dia_semana===idx);
    return `
      <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100)">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:0.82rem">
          <input type="checkbox" id="dia-${idx}" style="width:auto" ${disp?'checked':''} onchange="toggleDia(${idx})">
          ${dia}
        </label>
        <div id="config-dia-${idx}" style="${disp?'':'display:none'};display:${disp?'flex':'none'};gap:8px;flex-wrap:wrap;align-items:center">
          <input type="time" id="inicio-${idx}" value="${disp?.hora_inicio||'08:00'}" style="padding:6px 10px;border:1.5px solid var(--gray-200);border-radius:6px;font-size:0.82rem">
          <span style="color:var(--gray-400);font-size:0.78rem">até</span>
          <input type="time" id="fim-${idx}" value="${disp?.hora_fim||'18:00'}" style="padding:6px 10px;border:1.5px solid var(--gray-200);border-radius:6px;font-size:0.82rem">
          <select id="intervalo-${idx}" style="padding:6px 10px;border:1.5px solid var(--gray-200);border-radius:6px;font-size:0.82rem">
            <option value="30" ${disp?.intervalo_min===30?'selected':''}>30 min</option>
            <option value="45" ${disp?.intervalo_min===45?'selected':''}>45 min</option>
            <option value="60" ${disp?.intervalo_min===60||!disp?'selected':''}>60 min</option>
            <option value="90" ${disp?.intervalo_min===90?'selected':''}>90 min</option>
          </select>
        </div>
      </div>
    `;
  }).join('');
}

function toggleDia(idx) {
  const el = document.getElementById(`config-dia-${idx}`);
  el.style.display = document.getElementById(`dia-${idx}`).checked ? 'flex' : 'none';
}

async function saveDisponibilidade() {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    if (document.getElementById(`dia-${i}`)?.checked) {
      dias.push({
        dia_semana:   i,
        hora_inicio:  document.getElementById(`inicio-${i}`).value,
        hora_fim:     document.getElementById(`fim-${i}`).value,
        intervalo_min:parseInt(document.getElementById(`intervalo-${i}`).value),
      });
    }
  }
  try {
    await api('POST','/api/admin/disponibilidade', { doutor_id: _agendaDoutorId, slots: dias });
    toast('Disponibilidade salva','success');
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function loadBloqueios(doutorId) {
  try {
    const data = await api('GET',`/api/admin/bloqueios?doutor_id=${doutorId}`);
    const tbody = document.getElementById('bloqueios-tbody');
    tbody.innerHTML = (data||[]).map(b => `
      <tr>
        <td>${fmtDate(b.data)}</td>
        <td>${esc(b.motivo||'—')}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deletarBloqueio(${b.id})">Remover</button></td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--gray-400)">Sem datas bloqueadas.</td></tr>';
  } catch(e) {}
}

async function saveBloqueio() {
  const data   = document.getElementById('bloqueio-data').value;
  if (!data) return toast('Data obrigatória','error');
  const todos  = document.getElementById('bloqueio-todos').checked;
  const motivo = document.getElementById('bloqueio-motivo').value.trim()||null;
  try {
    await api('POST','/api/admin/bloqueios', {
      doutor_id:     todos ? null : _agendaDoutorId,
      data_bloqueada: data,
      motivo,
    });
    closeModal('modal-bloqueio');
    toast('Data bloqueada','success');
    if (_agendaDoutorId) loadBloqueios(_agendaDoutorId);
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarBloqueio(id) {
  await api('DELETE',`/api/admin/bloqueios/${id}`);
  toast('Bloqueio removido');
  if (_agendaDoutorId) loadBloqueios(_agendaDoutorId);
}

// ── AGENDAMENTOS ─────────────────────────────────────────────
async function loadAgendamentos() {
  const data   = document.getElementById('filtro-data-ag').value;
  const status = document.getElementById('filtro-status-ag').value;
  try {
    let url = '/api/admin/agendamentos?';
    if (data)   url += `data=${data}&`;
    if (status) url += `status=${status}&`;
    const list = await api('GET', url);
    const tbody = document.getElementById('agendamentos-tbody');
    tbody.innerHTML = (list||[]).map(a => `
      <tr>
        <td><strong>${esc(a.nome_paciente)}</strong></td>
        <td>${esc(a.doutor_nome||'—')}</td>
        <td style="white-space:nowrap">${fmtDate(a.data)}</td>
        <td>${esc(a.hora)}</td>
        <td><a href="https://wa.me/55${a.whatsapp?.replace(/\D/g,'')}" target="_blank" style="color:var(--blue)">${esc(a.whatsapp)}</a></td>
        <td><span class="badge badge--${badgeStatus(a.status)}">${a.status}</span></td>
        <td>
          <select onchange="updateStatusAgendamento(${a.id},this.value)" style="padding:4px 8px;border:1px solid var(--gray-200);border-radius:6px;font-size:0.75rem">
            ${['pendente','confirmado','cancelado','realizado'].map(s=>`<option ${a.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="color:var(--gray-400)">Nenhum agendamento.</td></tr>';
  } catch(e) { toast('Erro ao carregar','error'); }
}

async function updateStatusAgendamento(id, status) {
  await api('PUT',`/api/admin/agendamentos/${id}`, { status });
  toast('Status atualizado','success');
}

// ── PDFs ──────────────────────────────────────────────────────
let _pdfs = [];
async function loadPdfs() {
  try {
    const data = await api('GET','/api/admin/pdfs');
    _pdfs = data||[];
    const tbody = document.getElementById('pdfs-tbody');
    tbody.innerHTML = _pdfs.map(p => `
      <tr>
        <td><strong>${esc(p.titulo)}</strong></td>
        <td><span class="badge badge--blue">${esc(p.tipo)}</span></td>
        <td style="white-space:nowrap">${fmtDate(p.created_at)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deletarPdf(${p.id})">Excluir</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="color:var(--gray-400)">Nenhum PDF.</td></tr>';
  } catch(e) { toast('Erro ao carregar','error'); }
}

async function savePdf() {
  const titulo = document.getElementById('pdf-titulo').value.trim();
  if (!titulo) return toast('Título obrigatório','error');
  try {
    await api('POST','/api/admin/pdfs', {
      titulo,
      tipo:     document.getElementById('pdf-tipo').value,
      r2_key:   document.getElementById('pdf-key').value.trim()||null,
      conteudo: document.getElementById('pdf-conteudo').value.trim()||null,
    });
    closeModal('modal-pdf');
    toast('PDF salvo','success');
    loadPdfs();
  } catch(e) { toast('Erro ao salvar','error'); }
}

async function deletarPdf(id) {
  if (!confirm('Excluir este PDF?')) return;
  await api('DELETE',`/api/admin/pdfs/${id}`);
  toast('Excluído');
  loadPdfs();
}

// ── CRON LOGS ────────────────────────────────────────────────
async function loadCronLogs() {
  const cron = document.getElementById('filtro-cron').value;
  try {
    const data = await api('GET',`/api/admin/cron-logs${cron?'?cron='+cron:''}`);
    const tbody = document.getElementById('cron-logs-tbody');
    tbody.innerHTML = (data||[]).map(l => `
      <tr>
        <td><span class="badge badge--blue">${esc(l.cron_name)}</span></td>
        <td><span class="badge badge--${l.status==='sucesso'?'green':'red'}">${esc(l.status)}</span></td>
        <td style="font-size:0.75rem;color:var(--gray-400)">${esc(l.modelo_usado||'—')}</td>
        <td style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.82rem">${esc(l.mensagem||'—')}</td>
        <td style="white-space:nowrap">${fmtDate(l.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--gray-400)">Nenhum log.</td></tr>';
  } catch(e) { toast('Erro ao carregar logs','error'); }
}

// ── LEADS ────────────────────────────────────────────────────
let _leadsPage = 1;
async function loadLeads(page) {
  if (page) _leadsPage = page;
  const cidade = document.getElementById('filtro-cidade').value.trim();
  try {
    const data = await api('GET',`/api/admin/leads?page=${_leadsPage}&cidade=${encodeURIComponent(cidade)}`);
    const tbody = document.getElementById('leads-tbody');
    tbody.innerHTML = (data.items||[]).map(l => `
      <tr>
        <td>${esc(l.nome)}</td>
        <td>${esc(l.email||'—')}</td>
        <td><a href="https://wa.me/55${l.whatsapp?.replace(/\D/g,'')}" target="_blank" style="color:var(--blue)">${esc(l.whatsapp||'—')}</a></td>
        <td>${esc(l.cidade||'—')}</td>
        <td>${esc(l.bairro||'—')}</td>
        <td><span class="badge badge--gray" style="font-size:0.65rem">${esc(l.origem||'site')}</span></td>
        <td style="white-space:nowrap;font-size:0.8rem">${fmtDate(l.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="color:var(--gray-400)">Nenhum lead.</td></tr>';

    const pagEl = document.getElementById('leads-paginacao');
    const total = Math.ceil((data.total||0)/20);
    pagEl.innerHTML = Array.from({length:total}, (_,i)=>i+1).map(p=>
      `<button class="btn btn-sm ${p===_leadsPage?'btn-primary':'btn-outline'}" onclick="loadLeads(${p})">${p}</button>`
    ).join('');
  } catch(e) { toast('Erro ao carregar leads','error'); }
}

async function exportLeads() {
  try {
    const res = await fetch(`${API_URL}/api/admin/leads/export.csv`, { headers: headers() });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado','success');
  } catch(e) { toast('Erro ao exportar','error'); }
}

// ── UPLOAD DE IMAGEM ─────────────────────────────────────────
async function uploadImagem(input, targetId) {
  const file = input.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch(`${API_URL}/api/admin/upload`, {
      method: 'POST',
      headers: { 'X-Admin-Token': ADMIN_TOKEN },
      body: form
    });
    const data = await res.json();
    if (!data.url) throw new Error();
    document.getElementById(targetId).value = data.url;
    previewImg(targetId, `${targetId}-preview`);
    toast('Imagem enviada','success');
  } catch(e) { toast('Erro no upload','error'); }
}

function previewImg(srcId, previewId) {
  const src  = document.getElementById(srcId)?.value;
  const prev = document.getElementById(previewId);
  if (!prev) return;
  if (src) { prev.src = src; prev.style.display = 'block'; }
  else       prev.style.display = 'none';
}

// ── MODAIS ───────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── UTILS ────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('pt-BR');
}

function badgeStatus(s) {
  const map = { publicado:'green', pendente:'gold', rascunho:'gray', rejeitado:'red', confirmado:'green', cancelado:'red', realizado:'blue', quarentena:'red' };
  return map[s] || 'gray';
}

function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast${type?' '+type:''}`;
  requestAnimationFrame(()=>{ el.classList.add('show'); });
  setTimeout(()=>{ el.classList.remove('show'); }, 3000);
}

// ── CONFIGURAÇÕES ──────────────────────────────────────────
function toggleTokenVis() {
  const el = document.getElementById('config-token');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function updateApiUrl(url) {
  if (url) localStorage.setItem('admin_api_url', url);
}

function saveConfigPerfil() {
  const nome = document.getElementById('config-nome').value.trim();
  const email = document.getElementById('config-email').value.trim();
  if (!nome || !email) { toast('Preencha nome e e-mail.', 'error'); return; }
  localStorage.setItem('admin_nome', nome);
  localStorage.setItem('admin_email', email);
  document.querySelector('.user-name').textContent = nome;
  toast('Perfil atualizado com sucesso!');
}

function saveConfigApi() {
  const url = document.getElementById('config-api-url').value.trim();
  const token = document.getElementById('config-token').value.trim();
  if (!url || !token) { toast('Preencha URL e token.', 'error'); return; }
  API_URL = url;
  ADMIN_TOKEN = token;
  localStorage.setItem('admin_api_url', url);
  localStorage.setItem('admin_token', token);
  toast('Credenciais salvas com sucesso!');
}

// Restaurar credenciais salvas ao iniciar
document.addEventListener('DOMContentLoaded', () => {
  const savedUrl = localStorage.getItem('admin_api_url');
  const savedToken = localStorage.getItem('admin_token');
  const savedNome = localStorage.getItem('admin_nome');
  const savedEmail = localStorage.getItem('admin_email');
  if (savedUrl) document.getElementById('config-api-url').value = savedUrl;
  if (savedToken) document.getElementById('config-token').value = savedToken;
  if (savedNome) document.getElementById('config-nome').value = savedNome;
  if (savedEmail) document.getElementById('config-email').value = savedEmail;
});
