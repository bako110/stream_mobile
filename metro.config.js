const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// js-sha256@1.0.0 ne fournit qu'un champ `exports` moderne ; avec
// unstable_enablePackageExports:false (requis pour la New Architecture), Metro
// n'arrive pas à résoudre son `main` ("package specifies a `main` module field
// that could not be resolved: build/sha256.cjs"), ce qui fait échouer le bundle
// avec un HTTP 500 sur l'appareil. On redirige l'import vers le build UMD, qui
// exporte bien `sha256` et fonctionne en environnement React Native.
const JS_SHA256_UMD = path.join(__dirname, 'node_modules', 'js-sha256', 'build', 'sha256.js');

const config = {
  resolver: {
    unstable_enablePackageExports: false,
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'js-sha256') {
        return { type: 'sourceFile', filePath: JS_SHA256_UMD };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
