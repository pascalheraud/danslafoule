import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.danslafoule.app",
  appName: "Dans la foule",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
