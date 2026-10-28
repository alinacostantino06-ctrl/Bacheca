# Pubblicare la bacheca online e sul Play Store

La bacheca è un'app web installabile (PWA). Per il Play Store si "impacchetta" in un'app Android che apre il sito a schermo intero (Trusted Web Activity), senza barra del browser.
Vantaggio: **ogni modifica al sito arriva subito anche nell'app**, senza ripubblicare sul Play Store.

L'ordine è obbligato: **prima online, poi Play Store**.

---

## Fase 1 — Mettere il sito online (gratis)

Useremo **Netlify**.

1. Crea un account gratuito su [netlify.com](https://www.netlify.com).
2. Vai su **Add new site → Deploy manually** e trascina dentro la cartella **`public`** del progetto (solo quella).
3. Dopo pochi secondi il sito è online con un indirizzo casuale. In **Site configuration → Change site name** mettilo per esempio `santamariadellegrazie` → l'indirizzo diventa `https://santamariadellegrazie.netlify.app`.
4. Apri l'indirizzo dal telefono e controlla bacheca, accesso e pubblicazione.

Per aggiornare il sito in futuro: **Deploys → trascina di nuovo la cartella `public`**.

> Se la parrocchia ha un dominio (es. `santamariadellegrazie.it`) si può collegare da **Domain management**. Conviene deciderlo **prima** del Play Store: l'app resta legata all'indirizzo scelto.

---

## Fase 2 — Account sviluppatore Google Play

1. Vai su [play.google.com/console](https://play.google.com/console) e registrati. Costo: **25 $ una tantum**. Google chiede un documento d'identità.
2. Scegli il tipo di account:

| | Personale | Organizzazione (consigliato per la parrocchia) |
|---|---|---|
| Cosa serve | documento d'identità | numero **D-U-N-S** della parrocchia (gratuito, si richiede a Dun & Bradstreet, qualche giorno/settimana) |
| Prima della pubblicazione | **test chiuso con almeno 12 persone per 14 giorni** | si può pubblicare subito |
| Nome mostrato sullo Store | il tuo nome | il nome della parrocchia |

---

## Fase 3 — Creare l'app Android

1. Vai su [pwabuilder.com](https://www.pwabuilder.com), inserisci l'indirizzo del sito (Fase 1) e premi **Start**.
2. Premi **Package for stores → Android → Generate package**. Impostazioni consigliate:
   - **Package ID**: `it.santamariadellegrazie.bacheca` (non si può più cambiare)
   - **App name**: `Santa Maria delle Grazie`
   - **Short name**: `S. M. Grazie`
3. Scarica lo zip. Contiene:
   - il file **`.aab`** da caricare sul Play Store;
   - la **chiave di firma** (`signing.keystore` + `signing-key-info.txt`): **conservala con cura**, senza non si potrà più aggiornare l'app;
   - il file **`assetlinks.json`**.
4. Copia `assetlinks.json` nella cartella `public/.well-known/` del progetto e ripubblica il sito (Fase 1, punto aggiornamento).
   Controlla che si apra: `https://<tuo-indirizzo>/.well-known/assetlinks.json`.

---

## Fase 4 — Scheda sul Play Store

In Play Console: **Crea app** → lingua Italiano, tipo **App**, **Gratuita**.

Materiale già pronto nella cartella [`play-store/`](play-store/):
- **Icona 512×512**: `public/icon-512.png`
- **Grafica in evidenza 1024×500**: `play-store/grafica-in-evidenza-1024x500.png`
- **Screenshot**: almeno 2 dal telefono (si fanno quando ci sono già alcuni avvisi veri)
- **Informativa privacy**: `https://<tuo-indirizzo>/privacy.html` — prima completa l'email della parrocchia in `public/privacy.html`

Testi proposti:
- **Nome** (max 30 caratteri): `Santa Maria delle Grazie`
- **Descrizione breve** (max 80): `Avvisi, celebrazioni e appuntamenti della Parrocchia Santa Maria delle Grazie`
- **Descrizione completa**:
  > La bacheca ufficiale della Parrocchia Santa Maria delle Grazie, sempre a portata di mano.
  >
  > • Avvisi della comunità, orari delle celebrazioni ed eventi
  > • Catechesi, Carità e Oratorio: filtra gli avvisi per categoria
  > • Foto, programmi in PDF e canti da ascoltare direttamente nell'app
  > • Gli avvisi importanti sempre in evidenza
  >
  > Non serve registrarsi e non ci sono pubblicità.

Questionari da compilare in Play Console:
- **Sicurezza dei dati**: l'app non raccoglie dati dai visitatori; per i soli gestori raccoglie email e nome (gestione account), cifrati in transito, eliminabili su richiesta.
- **Classificazione dei contenuti**: categoria "Riferimento, notizie o istruzione", nessun contenuto sensibile.
- **Pubblico di destinazione**: 18+ consigliato (evita i requisiti aggiuntivi per app rivolte ai bambini).
- **Annunci**: nessuno.

Infine: **Test → Test chiuso** (account personale, 12 tester × 14 giorni) oppure direttamente **Produzione** (account organizzazione) → carica il file `.aab` → invia per la revisione (di solito da poche ore a qualche giorno).

---

## Fase 5 — Dopo la prima pubblicazione

In Play Console → **Configurazione → Integrità dell'app → Firma dell'app** copia l'impronta **SHA-256** della chiave di Google e aggiungila in `public/.well-known/assetlinks.json` (accanto a quella già presente), poi ripubblica il sito.
Senza questo passaggio l'app scaricata dallo Store mostrerebbe una barra dell'indirizzo in alto.
