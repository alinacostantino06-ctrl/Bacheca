# Bacheca Parrocchiale Santa Maria delle Grazie

Bacheca online della parrocchia: chiunque legge gli avvisi; solo le persone abilitate dal parroco possono pubblicarli.
Avvisi, immagini, accessi e permessi sono gestiti da **Supabase**. Si entra con **email e password**, senza email di conferma: gli account li crei tu.

## 1. Crea il progetto Supabase

1. Vai su [supabase.com](https://supabase.com), accedi e crea un nuovo progetto (il piano gratuito basta). Scegli la regione Europa.
2. Crea il tuo account: **Authentication → Users → Add user → Create new user**. Inserisci la tua email e una password e spunta **Auto Confirm User**.
3. Apri **SQL Editor → New query** e incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql).
4. **In fondo al file** sostituisci `LA-TUA-EMAIL@esempio.it` con la stessa email del punto 2 e `Don Domenico` con il nome che vuoi mostrare. Premi **Run**.
   Questo crea tabelle, regole di sicurezza, lo spazio per le immagini e ti registra come **proprietario**.

## 2. Collega l'app

1. In Supabase apri **Project Settings → API** (oppure il pulsante **Connect**).
2. Copia **Project URL** e la chiave pubblica (**anon** / **publishable**) nel file [`public/config.js`](public/config.js).
   Non usare mai la chiave `service_role` / `secret`.

## 3. Chiudi le registrazioni libere

In **Authentication → Sign In / Providers** disattiva **Allow new users to sign up**.
Così nessuno può crearsi un account da solo: gli accessi li crei solo tu dall'area riservata. Il login con password continua a funzionare.

## 4. Avvio sul computer

```bash
npm install
npm start
```

Apri http://localhost:3000. L'area riservata è su **Area riservata** in fondo alla pagina (`/admin.html`): entri con la tua email e la tua password.

## Ruoli

Dalla scheda **Utenti e ruoli** (visibile solo a te) crei l'accesso per ogni persona (email, nome e password provvisoria che le comunichi tu) e scegli cosa può fare. Ognuno può cambiare la propria password dalla scheda **Profilo**; se qualcuno la dimentica, la reimposti tu con **Reimposta password**.

- **Proprietario** (tu): accesso completo a tutto, unico che gestisce le persone e i ruoli.
- **Amministratore**: gestisce gli avvisi di tutte le aree.
- **Responsabile**: accesso completo solo alle aree assegnate (es. chi segue l'oratorio riceve l'area *Oratorio*). Può avere più aree.

| | Proprietario | Amministratore | Responsabile |
|---|---|---|---|
| Pubblicare, modificare, eliminare avvisi | tutte le aree | tutte le aree | solo le sue aree |
| Gestire persone e ruoli | ✓ | | |

Con **Rimuovi** la persona perde l'accesso e il suo account viene eliminato.
I permessi sono controllati dal database (Row Level Security), non solo nascosti nell'interfaccia.

Se dimentichi la **tua** password: Supabase → **Authentication → Users** → il tuo utente → **Send password recovery** oppure cambiala da lì.
Per cambiare il proprietario si usa l'SQL Editor (ultima istruzione di `schema.sql`).

## Avvisi

Ogni avviso ha titolo, categoria (Avvisi, Celebrazioni, Eventi, Catechesi, Carità, Oratorio), testo, data dell'evento, immagine e la possibilità di metterlo **in evidenza**.
Si possono allegare (facoltativi) **link**, **PDF** e **file musicali** (max 20 MB ciascuno): in bacheca i link e i PDF si aprono con un tocco, la musica si ascolta direttamente.

> Se il database è stato creato prima dell'arrivo degli allegati, esegui una volta [`supabase/aggiornamento-allegati.sql`](supabase/aggiornamento-allegati.sql) nell'SQL Editor. Con "Togli dalla bacheca dopo il" l'avviso sparisce da solo dopo quella data.

## Pubblicazione online

L'app è composta solo dalla cartella `public/`: si può pubblicare gratis su un hosting di siti statici (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Ricorda di aggiungere il nuovo indirizzo in Supabase (punto 3).

## Icona

L'icona attuale è provvisoria (`public/icon.svg`, `icon-192.png`, `icon-512.png`). Per cambiarla sostituisci questi tre file.
