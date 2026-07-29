import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jauhar.pramaxx.remote',
  appName: 'Pramaxx Remote',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
