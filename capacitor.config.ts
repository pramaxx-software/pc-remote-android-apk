import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jauhar.pramaxx.remote',
  appName: 'Pramaxx Remote',
  webDir: 'www',
  server: {
    cleartext: true
  },
  plugins:{
   StatusBar: {
      overlaysWebView: true,
      style: "dark",
      backgroundColor: "#0f172a"
    },
    CapacitorUpdater: {
      // Atur agar otomatis ngecek update setiap aplikasi dibuka
      updateUrl: 'https://pc-remote.pramaxx.biz.id/api/android/check-update',
      autoUpdate: true,
      resetUrl: 'https://pc-remote.pramaxx.biz.id/api/android/update-failed', // Opsional untuk rollback jika error
    }
  }
};

export default config;
