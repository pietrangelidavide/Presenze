# Presenze

App web per segnare le presenze al lavoro: ingresso, uscita, pausa pranzo, permessi, smart working, ferie e malattia, con una dashboard dettagliata che si arricchisce giorno dopo giorno.

Funziona su telefono e computer, segue il tema chiaro/scuro del dispositivo (o lo si sceglie a mano) e si può installare sulla schermata Home come un'app.

## Cosa fa

- **Oggi**: un tasto per entrare e uno per uscire, con l'ora di uscita prevista, la settimana in corso e la banca ore. In smart working basta un tocco su *Registra smart working*: la giornata vale le ore previste, senza orari.
- **Calendario**: tutto il mese con le ore di ogni giorno e il totale di ogni settimana. Si tocca un giorno per correggerlo.
- **Permessi**: ore di permesso con durata, orario e motivo; il permesso riduce le ore previste di quel giorno. Monte permessi annuo facoltativo.
- **Smart working**: massimo 2 giorni a settimana (modificabile). Se si supera il limite l'app avvisa, ma lascia salvare.
- **Dashboard** (Settimana · Mese · Trimestre · Anno · Tutto · Personalizzato), con confronto con il periodo precedente:
  - 12 indicatori: banca ore, saldo, ore lavorate, giornate complete, ingresso/uscita/pausa media, completezza, smart working, settimane oltre il limite, permessi, ferie e malattia
  - ore lavorate, saldo per periodo, banca ore nel tempo, mappa dell'anno (una casella per giorno)
  - orari di ingresso e uscita, distribuzioni (a che ora entri, a che ora esci, quanto lavori al giorno), pausa pranzo
  - ore medie per giorno della settimana, dove lavori (sede/smart/ferie/malattia)
  - smart working per settimana con la linea del limite, permessi per mese e per motivo, ferie e malattia
  - record del periodo e tabella settimana per settimana
  - ogni grafico ha la vista **tabella** e si esplora anche con la tastiera (frecce)
  - esportazione **CSV** di giornate e permessi
- **Profilo**: foto come sui social (la scegli dalla galleria o la scatti, poi la sposti e la ingrandisci), nome e qualche numero. La foto resta visibile in alto in ogni schermata (nella barra laterale sul computer).
- **Team**: il team è fisso (Carlo capo; Fortunato, Serena, Fabio, Manuela, Angelo e Alessandro senior; Davide, Roberta e Irene junior, vedi `ROSTER` in `src/lib/team.ts`). Dopo la registrazione con email e password si sceglie quale persona si è (una sola, e solo se è libera). Nella pagina Team si vedono gli orari dei colleghi giorno per giorno e, toccando una persona, la sua settimana. Gli orari del **capo** non sono mai visibili; ognuno può **nascondere i propri** con un interruttore (di base sono visibili). Ai colleghi arrivano solo il tipo di giornata (sede, smart working, ferie, assente) e gli orari di entrata e uscita: mai note, permessi, pausa o saldo ore, e una malattia compare come «Assente».
- **Riunioni (da Outlook)**: in **Oggi** una scheda «Queste saranno le riunioni di oggi» (in corso, prossima, finite) e il tab **Riunioni** con la settimana: elenco giorno per giorno sul telefono, griglia oraria sul computer. Toccando una riunione si vedono orario, luogo e il tasto *Partecipa* (Teams, Zoom, Meet…). Il calendario si collega in Impostazioni in due modi:
  - **con il link** «Pubblica un calendario» di Outlook sul web (Impostazioni → Calendario → Calendari condivisi): l'app lo riscarica da sola ogni pochi minuti, finché è aperta. Il browser da solo non può leggere il calendario di un altro sito, quindi passa dalla funzione `functions/api/calendar.ts` di Cloudflare Pages (parte da sola con la pubblicazione, non serve configurare nulla). È una funzione chiusa: accetta solo link https di Outlook, Google Calendar e iCloud. Nelle app per iPhone e Android (che non sono sul sito) imposta `VITE_API_BASE` con l'indirizzo del sito.
  - **con un file `.ics`** (per esempio salvato da Outlook per Windows): non si aggiorna da solo, ma funziona ovunque, anche in locale.

  Si legge e basta: Presenze non modifica nulla in Outlook. Gli orari vengono convertiti nel fuso di chi guarda (anche per gli eventi in altri fusi e per il cambio dell'ora legale) e le riunioni che si ripetono sono espanse. Il calendario e il link restano **solo su questo dispositivo** (nel browser), uno per account: il link è privato, chi lo conosce vede il calendario. Se l'azienda non permette di pubblicare il calendario, resta il file. Un collegamento diretto con Microsoft Graph (accesso con l'account Microsoft) richiederebbe la registrazione di un'app su Azure e, per un account aziendale, il consenso dell'amministratore IT.
- **Ferie, smart working e malattie dal calendario**: dalla stessa scheda di Impostazioni, *Importa dal calendario* legge gli eventi di **giornata intera**, li raggruppa per titolo e propone ferie, smart working, malattia o festività (o dal «Fuori sede» di Outlook); tu confermi o cambi. Si importano solo i giorni in cui lavori (niente fine settimana né festività nazionali), da un anno fa a un anno avanti. Le giornate già registrate restano come sono, a meno di chiederne la sostituzione.
- **Impostazioni**: orario settimanale, limite smart working, monte permessi, festività nazionali, data di inizio conteggio, saldo di partenza, tema, copia di sicurezza (JSON) e ripristino.

## Come si calcolano le ore

Orario di partenza: **36 ore nette a settimana**.

| Giorno | Presenza | Pausa pranzo | Ore nette |
|---|---|---|---|
| Lunedì – Giovedì | 8h | 30′ | 7h30 |
| Venerdì | 6h | nessuna | 6h |

4 × 7h30 + 6h = **36h**. Tutto si cambia da *Impostazioni*.

- La pausa pranzo prevista si toglie in automatico dalle giornate di almeno 6 ore di presenza; in ogni giornata si può scegliere una pausa diversa.
- Ore nette = uscita − ingresso − pausa. Saldo del giorno = ore nette − ore previste (meno i permessi).
- **Smart working senza timbratura**: se segni un giorno di smart working e non metti né ingresso né uscita, per quel giorno contano in automatico le ore previste (7h30 dal lunedì al giovedì, 6h il venerdì, meno i permessi), con saldo zero. Se timbri o inserisci gli orari, valgono quelli. Anche nei giorni futuri le ore si vedono subito (nella giornata, nel calendario e nella settimana); entrano nel saldo e nelle statistiche quando il giorno arriva.
- Ferie, malattia e festività non richiedono ore. Le festività nazionali italiane (con Pasquetta) sono incluse e si possono disattivare.
- La **banca ore** è il saldo di partenza più la somma dei saldi di tutte le giornate concluse. Le giornate passate senza orari contano come ore mancanti finché non vengono completate (compaiono in "Da sistemare").
- Il limite di smart working è controllato dall'app (avviso), non dal database.

## Stile Apple (ramo `stile-apple`)

Sul ramo `stile-apple` l'interfaccia ha un aspetto ispirato ad Apple: superfici piatte e arrotondate, titoli grandi, barre traslucide, liste raggruppate, interruttori e segmenti come su iOS, blu di sistema come unico colore d'azione, tema chiaro e scuro. Nella schermata *Oggi* le ore della giornata sono un anello di avanzamento. I calcoli delle ore e il formato dei dati sono quelli del ramo `main`. Sullo stesso ramo ci sono anche il team condiviso (sezione *Team*, qui sotto) e lo smart working a un tocco in *Oggi*. L'icona è nuova (anello di avanzamento con spunta, blu): si rifà con `node scripts/icons.mjs` (varianti `scuro` e `verde` con lo stesso disegno). Per adottarlo basta unire il ramo in `main`.

`npm run preview:build` compila l'app in una pagina sola (`dist/anteprima.html`, con un account di prova e dati di esempio già pronti), senza bisogno di Vite: utile per provarla al volo o per mostrarla.

## Provarla sul tuo computer (Windows, `cmd`)

Serve [Node.js](https://nodejs.org) 20 o più recente.

```cmd
cd Presenze
npm install
npm run dev
```

Apri l'indirizzo che compare (di solito `http://localhost:5173`).

**Senza fare altro l'app parte in modalità locale**: all'avvio compare la pagina di accesso, dove ognuno crea il suo account (nome, email e password) e ha i suoi dati separati. Account e dati restano nel browser di quel dispositivo e non vengono inviati altrove: servono a non mescolare i dati di chi usa lo stesso dispositivo, non a nasconderli a chi ha accesso al dispositivo. Se in questo browser c'erano già dei dati, passano al primo account creato. La password locale non si può recuperare. In *Impostazioni → I tuoi dati* c'è la copia di sicurezza e un pulsante per caricare dati di esempio e vedere la dashboard piena.

Altri comandi:

- `npm test` esegue i test sulle regole di calcolo e sulle statistiche
- `npm run typecheck` controlla i tipi TypeScript
- `npm run build` crea la cartella `dist` da pubblicare

## Usarla su telefono e computer con gli stessi dati (Supabase)

1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla tutto il contenuto di `supabase/setup.sql` → **Run**. Si può rilanciare senza danni (rilancialo dopo ogni aggiornamento dell'app: ora crea anche le tabelle del team). Ogni persona vede solo i propri dati (Row Level Security); i colleghi vedono soltanto gli orari condivisi, e solo attraverso la funzione `presenze_team_days`.
3. **Project Settings → API**: copia *Project URL* e la chiave *anon public*.
4. Copia `.env.example` in `.env` e compila:

   ```cmd
   copy .env.example .env
   ```

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=la_chiave_anon_pubblica
   ```

5. **Authentication → Sign In / Providers → Email**: lascia attivo l'accesso con email e password. Se non vuoi dover confermare l'email, disattiva *Confirm email*.
6. **Authentication → URL Configuration**: come *Site URL* metti l'indirizzo dell'app pubblicata (serve per il link "Ho dimenticato la password").
7. Riavvia `npm run dev`: la pagina di accesso ora usa gli account veri di Supabase (registrazione con email e password, poi la scelta della persona nel team, "Ho dimenticato la password" via email).

**Importante per il team:** chi si registra e sceglie una persona libera vede gli orari dei colleghi. Per questo conviene far entrare solo chi deve, in uno di questi due modi (o entrambi):

- **Codice del team**: nel SQL Editor esegui `insert into public.presenze_config (key, value) values ('team_code', 'un-codice-lungo') on conflict (key) do update set value = excluded.value;`. Da quel momento, per scegliere la propria persona serve il codice (l'app lo chiede da sola). Per toglierlo: `delete from public.presenze_config where key = 'team_code';`.
- Quando tutti si sono registrati, disattiva *Allow new users to sign up* in Supabase.

I dati che avevi in modalità locale si possono portare nell'account: *Copia di sicurezza* da Impostazioni (con l'account locale), poi *Ripristina da copia* dopo l'accesso con Supabase.

## Pubblicarla (Cloudflare Pages)

1. Metti il progetto su GitHub.
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** e scegli il repository.
3. Impostazioni di build:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Variabili d'ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `NODE_VERSION` = `20`
4. Dopo la pubblicazione, aggiungi l'indirizzo ottenuto in Supabase (**Authentication → URL Configuration**).
5. Sul telefono: apri l'indirizzo e scegli *Aggiungi a schermata Home* (iPhone: Condividi → Aggiungi a Home; Android: menu ⋮ → Installa app).

Le pagine usano indirizzi con `#` (per esempio `/#/dashboard`), quindi non servono regole di reindirizzamento.

## Com'è fatta

- React 19 + TypeScript + Vite
- Supabase (accesso con email e password, database Postgres con Row Level Security) oppure `localStorage` in modalità locale
- Grafici disegnati a mano in SVG (nessuna libreria), stile blu notte, giallo e blu cobalto (ispirato ai colori di Poste Italiane, senza usarne il logo) con tema automatico chiaro/scuro

```
src/lib/       regole di calcolo (calc), statistiche (stats), salvataggio (store), account locali (accounts), team condiviso (team), calendario .ics e riunioni (ics, calendar), festività, dati di esempio
src/screens/   Oggi, Calendario, Dashboard, Permessi, Team, Impostazioni, Profilo, scelta della persona (Pick), riunioni e importazione da Outlook, editor di giornata e permesso
src/components/charts/   grafici (barre, linee, intervalli, mappa dell'anno, barre orizzontali)
supabase/setup.sql       tabelle e regole di sicurezza
functions/api/           funzione di Cloudflare Pages che scarica il calendario di Outlook
tests/                   test delle regole di calcolo
```

## Nota sulla privacy

I dati sono tuoi: in modalità locale non lasciano il browser; con Supabase sono nel tuo progetto e protetti da Row Level Security. La chiave `anon` nel `.env` è pubblica per sua natura (finisce nell'app): la protezione sta nelle regole del database, non nella chiave.

## Beta per iPhone (TestFlight)

L'app web viene impacchettata in un'app iOS con [Capacitor](https://capacitorjs.com) e costruita nel cloud con Codemagic, senza bisogno di un Mac.

```
capacitor.config.ts   id dell'app (it.pietrangeli.presenze) e cartella web
assets/               icona 1024 senza trasparenza e schermata di avvio (generate da scripts/icons.mjs)
scripts/ios-prepare.sh  crea il progetto iOS, copia l'app web e imposta Info.plist
codemagic.yaml        build cloud: firma, crea l'IPA e lo carica su TestFlight
```

Dopo aver creato app e chiave API (passi 1–4 della guida), la build parte da Codemagic con *Start new build*. Il numero di build cresce da solo a ogni avvio; la versione è quella di `package.json`.

## App Android (APK, gratis)

Il workflow `.github/workflows/android-apk.yml` costruisce l'app Android con Capacitor su GitHub Actions e la pubblica come file `Presenze.apk` nella release **beta** del repository.

1. Su GitHub apri **Actions** > **Android APK** > **Run workflow**.
2. A build finita (circa 10 minuti) apri **Releases** > **Presenze beta** e scarica `Presenze.apk` dal telefono.
3. Aprilo e consenti l'installazione da questa fonte quando Android lo chiede (serve Android 7 o successivo).

La chiave di firma viene creata alla prima build e conservata nella release privata **chiave-firma**: non cancellarla, altrimenti per aggiornare l'app dovrai prima disinstallarla (esporta il backup dalle Impostazioni). I dati restano sul telefono, nel browser interno dell'app.
