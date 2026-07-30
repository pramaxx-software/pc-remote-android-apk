import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jauhar.pramax.remote',
  appName: 'Pramaxx Remote',
  webDir: 'www',
  server: {
    cleartext: true,
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'dark',
      backgroundColor: '#0f172a'
    },
    CapacitorUpdater: {
      updateUrl: 'https://pc-remote.pramaxx.biz.id/api/android/check-update',
      autoUpdate: 'always',
      appId: 'com.jauhar.pramax.remote',
      autoSplashscreen: true
    },
    SplashScreen: {
      launchAutoHide: false
    }
  }
};

export default config;
