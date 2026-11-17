/**
 * Réglages gardés sur l'appareil (D-007) : pour l'instant le thème.
 * Préfixe de stockage `staking-crypto:`, stable d'une version à l'autre.
 */
import { openLocalStore } from 'commun-crypto/storage';
import { isTheme, type Theme } from 'commun-crypto/theme';

const store = openLocalStore('staking-crypto:');

class Settings {
  theme = $state<Theme>('auto');
  readonly persistent = store.persistent;

  init(): void {
    const saved = store.readJson<{ theme?: unknown }>('settings');
    if (saved && isTheme(saved.theme)) this.theme = saved.theme;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    store.writeJson('settings', { theme });
  }
}

export const settings = new Settings();
