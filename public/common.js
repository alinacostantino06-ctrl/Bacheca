// Funzioni condivise tra bacheca e area riservata.

const NOME_PARROCCHIA = 'Santa Maria delle Grazie';
const CATEGORIE = ['Avvisi', 'Celebrazioni', 'Eventi', 'Catechesi', 'Carità', 'Oratorio'];
const BUCKET = 'immagini';

const cfg = window.BACHECA_CONFIG || {};
const configurato = /^https:\/\//.test(cfg.supabaseUrl || '') && cfg.supabaseKey && !cfg.supabaseKey.startsWith('INSERISCI');
const sb = configurato ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

// Restituisce i dati di una chiamata Supabase o lancia un errore leggibile.
function dati({ data, error }) {
  if (error) throw new Error(traduciErrore(error));
  return data;
}
function traduciErrore(error) {
  const msg = error.message || String(error);
  if (error.code === '23505') return 'Questa email è già presente';
  if (/Invalid login credentials/i.test(msg)) return 'Email o password errati';
  if (/Password should be at least/i.test(msg)) return 'La password deve avere almeno 8 caratteri';
  if (/different from the old password/i.test(msg)) return 'La nuova password deve essere diversa da quella attuale';
  if (/row-level security|permission denied/i.test(msg)) return 'Non hai i permessi per questa operazione';
  if (/rate limit|security purposes/i.test(msg)) return 'Troppi tentativi: attendi qualche minuto e riprova';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Connessione assente: riprova';
  return msg;
}

function urlImmagine(path) {
  return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

// ---------- Allegati (link, PDF, musica) ----------
const BUCKET_ALLEGATI = 'allegati';
const ICONE_ALLEGATO = { link: '🔗', pdf: '📄', audio: '🎵' };

// Solo indirizzi web veri: blocca link pericolosi come "javascript:".
function linkSicuro(url) {
  return /^https?:\/\//i.test(url || '') ? url : null;
}
function urlAllegato(a) {
  if (a.type === 'link') return linkSicuro(a.url);
  return a.path ? sb.storage.from(BUCKET_ALLEGATI).getPublicUrl(a.path).data.publicUrl : null;
}

// Elimina dallo spazio di Supabase l'immagine e i file allegati di un avviso.
function eliminaFileAvviso(p) {
  if (p.image_path) sb.storage.from(BUCKET).remove([p.image_path]);
  const paths = (p.attachments || []).map(a => a.path).filter(Boolean);
  if (paths.length) sb.storage.from(BUCKET_ALLEGATI).remove(paths);
}

// Aree che un membro può gestire.
function areeDi(m) {
  return m.role === 'responsabile' ? m.areas : CATEGORIE;
}

function renderAllegati(allegati) {
  if (!Array.isArray(allegati) || !allegati.length) return null;
  return el('div', { class: 'allegati' }, allegati.map(a => {
    const url = urlAllegato(a);
    if (!url) return null;
    if (a.type === 'audio') {
      return el('div', { class: 'allegato audio' },
        el('span', { class: 'allegato-nome' }, `${ICONE_ALLEGATO.audio} ${a.name}`),
        el('audio', { controls: true, preload: 'none', src: url }),
      );
    }
    return el('a', { class: 'allegato', href: url, target: '_blank', rel: 'noopener noreferrer' },
      el('span', { class: 'allegato-nome' }, `${ICONE_ALLEGATO[a.type] || ICONE_ALLEGATO.link} ${a.name}`),
      el('span', { class: 'allegato-tipo' }, a.type === 'pdf' ? 'PDF' : 'Apri'),
    );
  }));
}

// Crea un elemento DOM: el('div', { class: 'x' }, 'testo', figlio)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

function formatData(iso, conOra = false) {
  const d = new Date(iso);
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  if (conOra) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('it-IT', opts);
}

function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function scaduto(post) {
  return post.expires_on && post.expires_on < oggi();
}

// Riquadro vuoto con il "+" che indica dove aggiungere un avviso.
function riquadroAggiungi(sottotitolo, attrs) {
  return el(attrs.href ? 'a' : 'button', { class: 'aggiungi', type: attrs.href ? null : 'button', ...attrs },
    el('span', { class: 'piu', 'aria-hidden': 'true' }, '+'),
    el('strong', {}, 'Aggiungi un avviso'),
    el('span', {}, sottotitolo),
  );
}

function avvisoConfigurazione() {
  return el('div', { class: 'scheda stretto' },
    el('h2', {}, 'Configurazione mancante'),
    el('p', {}, 'Inserisci l\'indirizzo del progetto e la chiave pubblica di Supabase nel file config.js. Le istruzioni sono nel README.'),
  );
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
