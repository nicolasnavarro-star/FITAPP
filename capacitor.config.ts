import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.healty.app',
  appName: 'Healty',
  webDir: 'dist',
  android: { backgroundColor: '#0f1014' },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
