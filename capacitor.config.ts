import type { CapacitorConfig } from '@capacitor/cli';

// Contenitore iOS di Presenze: l'app web (cartella dist) viene impacchettata dentro un'app nativa.
// L'identificativo deve essere lo stesso registrato su Apple Developer e su App Store Connect.
const config: CapacitorConfig = {
  appId: 'it.pietrangeli.presenze',
  appName: 'Presenze',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // la pagina gestisce da sola le aree sicure (notch e barra in basso)
    backgroundColor: '#13162E',
  },
};

export default config;
