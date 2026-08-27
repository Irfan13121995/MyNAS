const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    if (androidManifest.manifest && androidManifest.manifest.application) {
      const app = androidManifest.manifest.application[0];
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};
