// Area riservata: accesso con email e password (Supabase Auth), gestione avvisi e persone abilitate.
// I permessi veri sono applicati dal database (vedi supabase/schema.sql); qui si adatta solo l'interfaccia.

const $ = id => document.getElementById(id);
let me = null;
let entrando = false;
let editingId = null;
let editingPost = null;
let editingEmail = null;
let nuovaImmagine = null;
let allegati = [];          // allegati dell'avviso nel modulo (quelli nuovi hanno ancora il campo "file")
let allegatiRimossi = [];   // file già caricati da eliminare dopo il salvataggio
const MAX_ALLEGATO = 20 * 1024 * 1024;

const ETICHETTE_RUOLO = { proprietario: 'Proprietario', amministratore: 'Amministratore', responsabile: 'Responsabile' };
function descriviRuolo(m) {
  return m.role === 'responsabile' ? `${ETICHETTE_RUOLO[m.role]} · ${m.areas.join(', ')}` : ETICHETTE_RUOLO[m.role];
}

function mostra(id) {
  $('caricamento').classList.add('nascosto');
  for (const s of ['login', 'pannello']) $(s).classList.toggle('nascosto', s !== id);
}

// Ridimensiona l'immagine nel browser per non caricare file enormi.
function leggiImmagine(file, maxLato = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scala = Math.min(1, maxLato / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scala);
      c.height = Math.round(img.height * scala);
      const ctx = c.getContext('2d');
      // Sfondo bianco: le parti trasparenti dei PNG altrimenti diventerebbero nere nel JPEG.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Immagine non valida')), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Immagine non valida'));
    img.src = URL.createObjectURL(file);
  });
}
async function caricaImmagine(blob) {
  const path = `${crypto.randomUUID()}.jpg`;
  dati(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}
function eliminaImmagine(path) {
  return path ? sb.storage.from(BUCKET).remove([path]) : null;
}
function eliminaAllegati(paths) {
  const validi = paths.filter(Boolean);
  return validi.length ? sb.storage.from(BUCKET_ALLEGATI).remove(validi) : null;
}

// ---------- Allegati nel modulo ----------
function tipoFile(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(file.name)) return 'audio';
  return null;
}
const MIME_DA_ESTENSIONE = { pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };

async function caricaAllegato(file) {
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const path = `${crypto.randomUUID()}${ext ? '.' + ext : ''}`;
  const contentType = file.type || MIME_DA_ESTENSIONE[ext] || 'application/octet-stream';
  dati(await sb.storage.from(BUCKET_ALLEGATI).upload(path, file, { contentType }));
  return path;
}

function renderAllegatiModulo() {
  $('a-lista').replaceChildren(...allegati.map((a, i) =>
    el('div', { class: 'allegato-riga' },
      el('span', { class: 'allegato-nome' }, `${ICONE_ALLEGATO[a.type]} ${a.name}`),
      a.file ? el('span', { class: 'nota' }, 'da caricare') : null,
      el('button', {
        type: 'button', class: 'btn pericolo piccolo', 'aria-label': `Togli ${a.name}`,
        onclick: () => {
          if (a.path) allegatiRimossi.push(a.path);
          allegati.splice(i, 1);
          renderAllegatiModulo();
        },
      }, '✕'),
    )
  ));
}

$('a-link-add').addEventListener('click', () => {
  let url = $('a-link-url').value.trim();
  if (!url) return ($('p-err').textContent = 'Scrivi l\'indirizzo del link');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let host;
  try { host = new URL(url).hostname; } catch { return ($('p-err').textContent = 'Indirizzo del link non valido'); }
  allegati.push({ type: 'link', name: $('a-link-nome').value.trim() || host, url });
  $('a-link-nome').value = '';
  $('a-link-url').value = '';
  $('p-err').textContent = '';
  renderAllegatiModulo();
});

$('a-file').addEventListener('change', () => {
  const errori = [];
  for (const file of $('a-file').files) {
    const type = tipoFile(file);
    if (!type) errori.push(`${file.name}: sono ammessi solo PDF e file musicali`);
    else if (file.size > MAX_ALLEGATO) errori.push(`${file.name}: supera i 20 MB`);
    else allegati.push({ type, name: file.name, file });
  }
  $('a-file').value = '';
  $('p-err').textContent = errori.join(' · ');
  renderAllegatiModulo();
});

// ---------- Accesso ----------
function avvia() {
  if (!sb) {
    $('caricamento').classList.add('nascosto');
    return $('contenuto').append(avvisoConfigurazione());
  }
  // setTimeout: le chiamate a Supabase non vanno fatte direttamente dentro il callback.
  sb.auth.onAuthStateChange((evento, sessione) => {
    setTimeout(() => {
      if (sessione && !me) entra(sessione.user);
      else if (!sessione) { me = null; mostra('login'); }
    }, 0);
  });
}

async function entra(user) {
  if (entrando) return;
  entrando = true;
  try {
    const email = (user.email || '').toLowerCase();
    const membro = dati(await sb.from('members').select('*').eq('email', email).maybeSingle());
    if (!membro) {
      await sb.auth.signOut();
      mostra('login');
      $('l-err').textContent = `L'email ${email} non è abilitata. Chiedi al parroco di aggiungerla.`;
      return;
    }
    me = membro;
    apriPannello();
  } catch (err) {
    mostra('login');
    $('l-err').textContent = err.message;
  } finally {
    entrando = false;
  }
}

$('login').addEventListener('submit', async e => {
  e.preventDefault();
  $('l-err').textContent = '';
  $('l-invia').disabled = true;
  try {
    dati(await sb.auth.signInWithPassword({
      email: $('l-email').value.trim().toLowerCase(),
      password: $('l-pass').value,
    }));
    $('l-pass').value = '';
  } catch (err) {
    $('l-err').textContent = err.message;
  } finally {
    $('l-invia').disabled = false;
  }
});

$('esci').addEventListener('click', () => sb.auth.signOut());

function apriPannello() {
  mostra('pannello');
  $('benvenuto').textContent = `${me.name} · ${descriviRuolo(me)} `;
  $('tab-utenti').classList.toggle('nascosto', me.role !== 'proprietario');
  // Nel modulo avvisi si possono scegliere solo le aree di propria competenza.
  $('p-cat').replaceChildren(...areeDi(me).map(c => el('option', { value: c }, c)));
  $('u-areas').replaceChildren(...CATEGORIE.map(c =>
    el('label', { class: 'check' }, el('input', { type: 'checkbox', value: c }), ' ', c)
  ));
  if (me.role === 'proprietario') caricaUtenti();
  const hash = location.hash;
  if (hash) history.replaceState(null, '', location.pathname);
  caricaAvvisi().then(posts => {
    // Arrivati dal "+" della bacheca: si va dritti al modulo del nuovo avviso.
    if (hash === '#nuovo') return vaiAlModulo();
    // Arrivati da "Modifica" sulla bacheca: si apre quell'avviso nel modulo.
    const daModificare = hash.startsWith('#modifica=') && posts.find(p => p.id === hash.slice('#modifica='.length));
    if (daModificare) modifica(daModificare);
  });
}

function vaiAlModulo() {
  $('f-post').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('p-title').focus({ preventScroll: true });
}

// ---------- Schede ----------
$('schede').addEventListener('click', e => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  for (const b of $('schede').children) b.classList.toggle('attivo', b === e.target);
  for (const id of ['t-avvisi', 't-utenti', 't-profilo']) $(id).classList.toggle('nascosto', id !== tab);
});

// ---------- Avvisi ----------
async function caricaAvvisi() {
  const box = $('lista-avvisi');
  let posts;
  try {
    posts = dati(await sb.from('posts').select('*')
      .in('category', areeDi(me))
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }));
  } catch (err) {
    box.replaceChildren(el('p', { class: 'errore' }, err.message));
    return [];
  }
  if (!posts.length) {
    box.replaceChildren(riquadroAggiungi('Non hai ancora pubblicato avvisi', { onclick: vaiAlModulo }));
    return posts;
  }
  box.replaceChildren(...posts.map(p =>
    el('div', { class: 'elemento' + (p.pinned ? ' evidenza' : '') + (scaduto(p) ? ' scaduto' : '') },
      el('div', { class: 'info' },
        el('strong', {}, p.title),
        el('div', { class: 'meta' },
          el('span', { class: 'badge' }, p.category),
          p.pinned ? el('span', { class: 'badge oro' }, 'In evidenza') : null,
          scaduto(p) ? el('span', {}, 'Non più visibile') : null,
          el('span', {}, `${p.author || ''} · ${new Date(p.created_at).toLocaleDateString('it-IT')}`),
        ),
      ),
      el('div', { class: 'azioni' },
        el('button', { class: 'btn chiaro piccolo', onclick: () => modifica(p) }, 'Modifica'),
        el('button', { class: 'btn pericolo piccolo', onclick: () => elimina(p) }, 'Elimina'),
      ),
    )
  ));
  return posts;
}

function resetForm() {
  editingId = null;
  editingPost = null;
  nuovaImmagine = null;
  allegati = [];
  allegatiRimossi = [];
  renderAllegatiModulo();
  $('f-post').reset();
  $('f-titolo').textContent = 'Nuovo avviso';
  $('p-save').textContent = 'Pubblica';
  $('p-cancel').classList.add('nascosto');
  $('p-prev').classList.add('nascosto');
  $('p-rm-wrap').classList.add('nascosto');
  $('p-err').textContent = '';
}

function modifica(p) {
  resetForm();
  editingId = p.id;
  editingPost = p;
  $('p-title').value = p.title;
  $('p-cat').value = p.category;
  $('p-event').value = p.event_date ? p.event_date.slice(0, 16) : '';
  $('p-body').value = p.body;
  $('p-exp').value = p.expires_on || '';
  $('p-pin').checked = p.pinned;
  allegati = (p.attachments || []).map(a => ({ ...a }));
  renderAllegatiModulo();
  if (p.image_path) {
    $('p-prev').src = urlImmagine(p.image_path);
    $('p-prev').classList.remove('nascosto');
    $('p-rm-wrap').classList.remove('nascosto');
  }
  $('f-titolo').textContent = 'Modifica avviso';
  $('p-save').textContent = 'Salva modifiche';
  $('p-cancel').classList.remove('nascosto');
  $('f-post').scrollIntoView({ behavior: 'smooth' });
}

async function elimina(p) {
  if (!confirm(`Eliminare l'avviso "${p.title}"?`)) return;
  try {
    dati(await sb.from('posts').delete().eq('id', p.id));
    eliminaFileAvviso(p);
    if (editingId === p.id) resetForm();
    caricaAvvisi();
  } catch (err) { alert(err.message); }
}

$('p-cancel').addEventListener('click', resetForm);

$('p-img').addEventListener('change', async () => {
  const file = $('p-img').files[0];
  nuovaImmagine = null;
  if (!file) return;
  try {
    nuovaImmagine = await leggiImmagine(file);
    $('p-prev').src = URL.createObjectURL(nuovaImmagine);
    $('p-prev').classList.remove('nascosto');
  } catch (err) { $('p-err').textContent = err.message; }
});

$('f-post').addEventListener('submit', async e => {
  e.preventDefault();
  $('p-err').textContent = '';
  $('p-save').disabled = true;
  const record = {
    title: $('p-title').value.trim(),
    category: $('p-cat').value,
    event_date: $('p-event').value || null,
    body: $('p-body').value.trim(),
    expires_on: $('p-exp').value || null,
    pinned: $('p-pin').checked,
  };
  let caricata = null;
  const allegatiCaricati = [];
  try {
    if (nuovaImmagine) caricata = record.image_path = await caricaImmagine(nuovaImmagine);
    else if ($('p-rm').checked) record.image_path = null;

    record.attachments = [];
    for (const a of allegati) {
      if (a.file) {
        $('p-err').textContent = `Caricamento di ${a.name}…`;
        const path = await caricaAllegato(a.file);
        allegatiCaricati.push(path);
        record.attachments.push({ type: a.type, name: a.name, path });
      } else {
        record.attachments.push(a.type === 'link' ? { type: 'link', name: a.name, url: a.url } : { type: a.type, name: a.name, path: a.path });
      }
    }
    $('p-err').textContent = '';

    let salvato;
    if (editingId) {
      const aggiornati = dati(await sb.from('posts').update(record).eq('id', editingId).select());
      if (!aggiornati.length) throw new Error('Non hai i permessi per modificare questo avviso');
      salvato = aggiornati[0];
      // L'immagine precedente non serve più se è stata sostituita o rimossa.
      if ('image_path' in record) await eliminaImmagine(editingPost.image_path);
    } else {
      salvato = dati(await sb.from('posts').insert(record).select().single());
    }
    await eliminaAllegati(allegatiRimossi);
    // Dopo il salvataggio si torna in bacheca, sull'avviso appena pubblicato o modificato.
    location.href = `/#avviso-${salvato.id}`;
  } catch (err) {
    eliminaImmagine(caricata);
    eliminaAllegati(allegatiCaricati);
    $('p-err').textContent = err.message;
  } finally {
    $('p-save').disabled = false;
  }
});

// ---------- Persone abilitate ----------
async function caricaUtenti() {
  const box = $('lista-utenti');
  let membri;
  try {
    membri = dati(await sb.from('members').select('*').order('created_at'));
  } catch (err) {
    return box.replaceChildren(el('p', { class: 'errore' }, err.message));
  }
  box.replaceChildren(...membri.map(m =>
    el('div', { class: 'elemento' + (m.role === 'proprietario' ? ' evidenza' : '') },
      el('div', { class: 'info' },
        el('strong', {}, m.name),
        el('div', { class: 'meta' },
          el('span', { class: m.role === 'proprietario' ? 'badge oro' : 'badge' }, ETICHETTE_RUOLO[m.role]),
          m.role === 'responsabile' ? el('span', {}, m.areas.join(', ')) : null,
          m.role === 'proprietario' ? el('span', {}, 'accesso completo') : null,
          el('span', {}, m.email),
        ),
      ),
      m.role === 'proprietario' ? null : el('div', { class: 'azioni' },
        el('button', { class: 'btn oro piccolo', onclick: () => mostraInvito(m) }, 'Invia accesso'),
        el('button', { class: 'btn chiaro piccolo', onclick: () => modificaUtente(m) }, 'Modifica ruolo'),
        el('button', { class: 'btn chiaro piccolo', onclick: () => reimposta(m) }, 'Reimposta password'),
        el('button', { class: 'btn pericolo piccolo', onclick: () => rimuovi(m) }, 'Rimuovi'),
      ),
    )
  ));
}

// Prepara il messaggio con link e credenziali da mandare alla persona abilitata.
// La password compare solo subito dopo averla creata o reimpostata (non viene conservata in chiaro).
function mostraInvito(m, password) {
  const descrizione = m.role === 'responsabile' ? `responsabile per: ${m.areas.join(', ')}` : 'amministratore';
  $('u-msg').value = [
    `Ciao ${m.name}! Ti ho abilitato a gestire la Bacheca Parrocchiale Santa Maria delle Grazie (${descrizione}).`,
    '',
    `1. Apri questo link: ${location.origin}/admin.html`,
    '2. Entra con:',
    `   Email: ${m.email}`,
    `   Password: ${password || 'quella che ti ho già dato'}`,
    password ? '3. Al primo accesso cambia la password dalla scheda "Profilo".' : null,
    '',
    'Da quel momento, sul tuo telefono, nella bacheca vedrai anche il pulsante "Area riservata".',
  ].filter(r => r !== null).join('\n');
  $('u-msg-esito').textContent = '';
  $('u-condividi').classList.toggle('nascosto', !navigator.share);
  $('u-invito').classList.remove('nascosto');
  $('u-invito').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('u-condividi').addEventListener('click', () => {
  navigator.share({ text: $('u-msg').value }).catch(() => {});
});
$('u-copia').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('u-msg').value);
  } catch {
    $('u-msg').select();
    document.execCommand('copy');
  }
  $('u-msg-esito').textContent = 'Messaggio copiato: incollalo su WhatsApp, SMS o email.';
});
$('u-chiudi').addEventListener('click', () => {
  $('u-msg').value = '';
  $('u-invito').classList.add('nascosto');
});

async function reimposta(m) {
  const password = prompt(`Nuova password per ${m.name} (almeno 8 caratteri):`);
  if (!password) return;
  try {
    dati(await sb.rpc('reimposta_password', { p_email: m.email, p_password: password }));
    mostraInvito(m, password);
  } catch (err) { alert(err.message); }
}

async function rimuovi(m) {
  if (!confirm(`Togliere l'accesso a ${m.name} (${m.email})? Il suo account verrà eliminato.`)) return;
  try {
    dati(await sb.rpc('rimuovi_membro', { p_email: m.email }));
    if (editingEmail === m.email) resetUtente();
    caricaUtenti();
  } catch (err) { alert(err.message); }
}

function aggiornaAree() {
  $('u-areas-wrap').classList.toggle('nascosto', $('u-role').value !== 'responsabile');
}
$('u-role').addEventListener('change', aggiornaAree);

function resetUtente() {
  editingEmail = null;
  $('f-user').reset();
  $('u-email').disabled = false;
  $('u-pass-wrap').classList.remove('nascosto');
  $('u-titolo').textContent = 'Abilita una persona';
  $('u-save').textContent = 'Abilita';
  $('u-cancel').classList.add('nascosto');
  $('u-err').textContent = '';
  aggiornaAree();
}

function modificaUtente(m) {
  resetUtente();
  editingEmail = m.email;
  $('u-email').value = m.email;
  $('u-email').disabled = true;
  $('u-pass-wrap').classList.add('nascosto');
  $('u-name').value = m.name;
  $('u-role').value = m.role;
  for (const box of $('u-areas').querySelectorAll('input')) box.checked = m.role === 'responsabile' && m.areas.includes(box.value);
  aggiornaAree();
  $('u-titolo').textContent = `Modifica ${m.name}`;
  $('u-save').textContent = 'Salva modifiche';
  $('u-cancel').classList.remove('nascosto');
  $('f-user').scrollIntoView({ behavior: 'smooth' });
}
$('u-cancel').addEventListener('click', resetUtente);

$('f-user').addEventListener('submit', async e => {
  e.preventDefault();
  $('u-err').textContent = '';
  const role = $('u-role').value;
  const record = {
    name: $('u-name').value.trim(),
    role,
    areas: role === 'responsabile' ? [...$('u-areas').querySelectorAll('input:checked')].map(b => b.value) : [],
  };
  if (role === 'responsabile' && !record.areas.length) {
    $('u-err').textContent = 'Scegli almeno un\'area per il responsabile';
    return;
  }
  try {
    if (editingEmail) {
      dati(await sb.from('members').update(record).eq('email', editingEmail));
    } else {
      const nuovo = { ...record, email: $('u-email').value.trim().toLowerCase() };
      const password = $('u-pass').value;
      dati(await sb.rpc('crea_membro', {
        p_email: nuovo.email,
        p_password: password,
        p_name: nuovo.name,
        p_role: nuovo.role,
        p_areas: nuovo.areas,
      }));
      mostraInvito(nuovo, password);
    }
    resetUtente();
    caricaUtenti();
  } catch (err) { $('u-err').textContent = err.message; }
});

// ---------- Profilo ----------
$('t-profilo').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('c-err');
  msg.classList.remove('ok');
  if ($('c-new').value !== $('c-rep').value) {
    msg.textContent = 'Le due password non coincidono';
    return;
  }
  try {
    dati(await sb.auth.updateUser({ password: $('c-new').value }));
    $('t-profilo').reset();
    msg.textContent = 'Password aggiornata.';
    msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; }
});

avvia();
