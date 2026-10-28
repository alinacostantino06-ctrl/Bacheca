// Bacheca pubblica. Se è collegato un moderatore, sugli avvisi della sua area compaiono Modifica ed Elimina.

let posts = [];
let filtro = 'Tutti';
let me = null;

function renderFiltri() {
  const nav = document.getElementById('filtri');
  nav.replaceChildren(...['Tutti', ...CATEGORIE].map(c =>
    el('button', {
      class: 'chip' + (c === filtro ? ' attivo' : ''),
      'aria-pressed': String(c === filtro),
      onclick: () => { filtro = c; renderFiltri(); renderAvvisi(); },
    }, c)
  ));
}

function puoGestire(p) {
  return me && areeDi(me).includes(p.category);
}

async function elimina(p) {
  if (!confirm(`Eliminare l'avviso "${p.title}"?`)) return;
  try {
    dati(await sb.from('posts').delete().eq('id', p.id));
    eliminaFileAvviso(p);
    posts = posts.filter(x => x.id !== p.id);
    renderAvvisi();
  } catch (err) { alert(err.message); }
}

function renderAvvisi() {
  const box = document.getElementById('avvisi');
  const visibili = posts.filter(p => filtro === 'Tutti' || p.category === filtro);
  if (!visibili.length) {
    const testo = filtro === 'Tutti' ? 'Nessun avviso al momento' : `Nessun avviso in “${filtro}”`;
    // Il "+" serve solo a chi può pubblicare; i visitatori vedono solo il messaggio.
    box.replaceChildren(me
      ? riquadroAggiungi(testo, { href: '/admin.html#nuovo' })
      : el('p', { class: 'vuoto' }, testo + '.'));
    return;
  }
  box.replaceChildren(...visibili.map(p =>
    el('article', { class: 'avviso' + (p.pinned ? ' evidenza' : ''), id: `avviso-${p.id}` },
      p.image_path ? el('div', { class: 'foto' }, el('img', { src: urlImmagine(p.image_path), alt: '', loading: 'lazy' })) : null,
      el('div', { class: 'corpo' },
        el('div', { class: 'meta' },
          p.pinned ? el('span', { class: 'badge oro' }, '✦ In evidenza') : null,
          el('span', { class: 'badge' }, p.category),
          el('span', {}, formatData(p.created_at)),
        ),
        el('h2', {}, p.title),
        p.event_date ? el('div', { class: 'data-evento' }, '✦ ', formatData(p.event_date, true)) : null,
        p.body ? el('div', { class: 'testo' }, p.body) : null,
        renderAllegati(p.attachments),
        puoGestire(p) ? el('div', { class: 'gestione' },
          el('a', { class: 'btn chiaro piccolo', href: `/admin.html#modifica=${p.id}` }, '✎ Modifica'),
          el('button', { class: 'btn pericolo piccolo', onclick: () => elimina(p) }, '🗑 Elimina'),
        ) : null,
      )
    )
  ));
}

// Dopo un salvataggio dall'area riservata si arriva qui con #avviso-<id>: porta l'avviso in vista e lo evidenzia.
function mostraAvvisoSalvato() {
  if (!location.hash.startsWith('#avviso-')) return;
  const card = document.getElementById(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  if (!card) return;
  const vai = () => card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  vai();
  // Le immagini sopra l'avviso possono spostarlo mentre si caricano: si ricentra quando sono pronte.
  const img = [...document.querySelectorAll('.foto img')].filter(i => !i.complete);
  Promise.all(img.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(vai);
  card.classList.add('appena-salvato');
  setTimeout(() => card.classList.remove('appena-salvato'), 3000);
}

// Se nel browser c'è una sessione dell'area riservata, recupera ruolo e aree del moderatore.
async function caricaModeratore() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('members').select('*').eq('email', (session.user.email || '').toLowerCase()).maybeSingle();
  return data || null;
}

// Accesso discreto per i moderatori: 5 tocchi veloci sull'icona aprono l'area riservata.
// Serve soprattutto nell'app installata, dove non c'è la barra degli indirizzi.
(() => {
  let tocchi = 0;
  let timer;
  document.getElementById('logo').addEventListener('click', () => {
    clearTimeout(timer);
    if (++tocchi >= 5) return (location.href = '/admin.html');
    timer = setTimeout(() => { tocchi = 0; }, 1500);
  });
})();

(async () => {
  const box = document.getElementById('avvisi');
  if (!sb) return box.replaceChildren(avvisoConfigurazione());
  try {
    const [lista, moderatore] = await Promise.all([
      sb.from('posts').select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .then(dati),
      caricaModeratore().catch(() => null),
    ]);
    me = moderatore;
    document.getElementById('nav-moderatori').classList.toggle('nascosto', !me);
    // Chi gestisce un'area riceve anche gli avvisi scaduti: in bacheca non vanno mostrati.
    posts = lista.filter(p => !scaduto(p));
    renderFiltri();
    renderAvvisi();
    mostraAvvisoSalvato();
  } catch {
    box.replaceChildren(el('p', { class: 'vuoto' }, 'Impossibile caricare gli avvisi. Riprova più tardi.'));
  }
})();
