import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.healty.app',
  appName: 'Kaizen',
  webDir: 'dist',
  android: { backgroundColor: '#0b0b0b' },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
