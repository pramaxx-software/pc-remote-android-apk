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
      overlaysWebView: false,
      style: "dark",
      backgroundColor: "#0f172a"
    },
  }
};

export default config;
