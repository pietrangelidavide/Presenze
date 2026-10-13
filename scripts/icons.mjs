// Disegna l'icona di Presenze e genera tutte le immagini che servono (web, iPhone, Android, schermata di avvio).
//
//   node scripts/icons.mjs        variante "blu" (quella in uso)
//   node scripts/icons.mjs scuro  grafite con anello giallo
//   node scripts/icons.mjs verde  verde
//
// Il disegno è sempre lo stesso: un anello di avanzamento con una spunta, come sulle schede di un registro
// presenze e come l'anello della schermata "Oggi". Cambiano solo i colori. Serve il pacchetto `sharp`
// (arriva con @capacitor/assets, quindi dopo `npm install` c'è già).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const VARIANTS = {
  blu:   { top: '#4DA8FF', bottom: '#0A5ED6', track: '#FFFFFF', trackOpacity: 0.3,  ink: '#FFFFFF', splashLight: '#F5F5F7', splashDark: '#000000' },
  scuro: { top: '#2B2D3A', bottom: '#0C0D12', track: '#F1E54C', trackOpacity: 0.22, ink: '#F1E54C', splashLight: '#F5F5F7', splashDark: '#000000' },
  verde: { top: '#4CD964', bottom: '#16883A', track: '#FFFFFF', trackOpacity: 0.3,  ink: '#FFFFFF', splashLight: '#F5F5F7', splashDark: '#000000' },
};
const name = process.argv[2] ?? 'blu';
const v = VARIANTS[name];
if (!v) { console.error(`Variante sconosciuta: ${name}. Scegli tra ${Object.keys(VARIANTS).join(', ')}.`); process.exit(1); }

/** Il disegno su una tela 512×512. `radius` = angoli arrotondati (0 = a tutto campo, come vuole iOS e l'icona "maskable"). */
function svg({ radius = 112, background = true, glyph = true } = {}) {
  const ring = `<circle cx="256" cy="256" r="132" fill="none" stroke="${v.track}" stroke-opacity="${v.trackOpacity}" stroke-width="40"/>
  <circle cx="256" cy="256" r="132" fill="none" stroke="${v.ink}" stroke-width="40" stroke-linecap="round" stroke-dasharray="622 830" transform="rotate(-90 256 256)"/>
  <path d="M194 262l45 45 82-94" fill="none" stroke="${v.ink}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${v.top}"/><stop offset="1" stop-color="${v.bottom}"/></linearGradient></defs>
  ${background ? `<rect width="512" height="512" rx="${radius}" fill="url(#g)"/>` : ''}
  ${glyph ? ring : ''}
</svg>
`;
}

const png = (markup, size) => sharp(Buffer.from(markup), { density: 384 }).resize(size, size);
const flat = (markup, size) => png(markup, size).flatten({ background: v.bottom }).png();   // senza trasparenza (iOS la rifiuta)

mkdirSync(join(root, 'public'), { recursive: true });
mkdirSync(join(root, 'assets'), { recursive: true });
const out = (...p) => join(root, ...p);

// web
writeFileSync(out('public', 'icon.svg'), svg());
await png(svg(), 512).png().toFile(out('public', 'icon-512.png'));
await png(svg(), 192).png().toFile(out('public', 'icon-192.png'));
await flat(svg({ radius: 0 }), 512).toFile(out('public', 'icon-maskable-512.png'));
await flat(svg({ radius: 0 }), 180).toFile(out('public', 'apple-touch-icon.png'));

// app (capacitor-assets): icona intera, e per Android primo piano e sfondo separati
await flat(svg({ radius: 0 }), 1024).toFile(out('assets', 'icon-only.png'));
await png(svg({ background: false }), 1024).png().toFile(out('assets', 'icon-foreground.png'));
await flat(svg({ radius: 0, glyph: false }), 1024).toFile(out('assets', 'icon-background.png'));

// schermata di avvio: l'icona al centro, su fondo chiaro e su fondo scuro
const SPLASH = 2732, ICON = 612;
const icon = await png(svg(), ICON).png().toBuffer();
for (const [file, color] of [['splash.png', v.splashLight], ['splash-dark.png', v.splashDark]]) {
  await sharp({ create: { width: SPLASH, height: SPLASH, channels: 3, background: color } })
    .composite([{ input: icon, left: (SPLASH - ICON) / 2, top: (SPLASH - ICON) / 2 }])
    .removeAlpha().png().toFile(out('assets', file));
}
console.log(`Icone generate (${name}).`);
