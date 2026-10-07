# Presenze

App web per segnare le presenze al lavoro: ingresso, uscita, pausa pranzo, permessi, smart working, ferie e malattia, con una dashboard dettagliata che si arricchisce giorno dopo giorno.

Funziona su telefono e computer, segue il tema chiaro/scuro del dispositivo (o lo si sceglie a mano) e si può installare sulla schermata Home come un'app.

## Cosa fa

- **Oggi**: un tasto per entrare e uno per uscire, con l'ora di uscita prevista, la settimana in corso e la banca ore.
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
- **Smart working senza timbratura**: se segni un giorno di smart working e non metti né ingresso né uscita, per quel giorno contano in automatico le ore previste (7h30 dal lunedì al giovedì, 6h il venerdì, meno i permessi), con saldo zero. Se timbri o inserisci gli orari, valgono quelli. I giorni futuri restano solo pianificati finché non arrivano.
- Ferie, malattia e festività non richiedono ore. Le festività nazionali italiane (con Pasquetta) sono incluse e si possono disattivare.
- La **banca ore** è il saldo di partenza più la somma dei saldi di tutte le giornate concluse. Le giornate passate senza orari contano come ore mancanti finché non vengono completate (compaiono in "Da sistemare").
- Il limite di smart working è controllato dall'app (avviso), non dal database.

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
2. **SQL Editor** → incolla tutto il contenuto di `supabase/setup.sql` → **Run**. Si può rilanciare senza danni (rilancialo dopo ogni aggiornamento dell'app: ora crea anche la tabella del profilo). Ogni persona vede solo i propri dati (Row Level Security).
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
7. Riavvia `npm run dev`: la pagina di accesso ora usa gli account veri di Supabase (registrazione con nome, email e password, "Ho dimenticato la password" via email).

Se vuoi che nessun altro possa registrarsi, dopo aver creato il tuo account disattiva *Allow new users to sign up*.

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
src/lib/       regole di calcolo (calc), statistiche (stats), salvataggio (store), account locali (accounts), festività, dati di esempio
src/screens/   Oggi, Calendario, Dashboard, Permessi, Impostazioni, editor di giornata e permesso
src/components/charts/   grafici (barre, linee, intervalli, mappa dell'anno, barre orizzontali)
supabase/setup.sql       tabelle e regole di sicurezza
tests/                   test delle regole di calcolo
```

## Nota sulla privacy

I dati sono tuoi: in modalità locale non lasciano il browser; con Supabase sono nel tuo progetto e protetti da Row Level Security. La chiave `anon` nel `.env` è pubblica per sua natura (finisce nell'app): la protezione sta nelle regole del database, non nella chiave.
