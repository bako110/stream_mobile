const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// js-sha256@1.0.0 ne publie qu'un champ `exports` moderne ; avec
// `unstable_enablePackageExports:false` (requis pour la New Architecture), Metro
// ne résout pas son `main` → HTTP 500 au bundle. On redirige le nom de module
// `js-sha256` vers un shim local (shims/js-sha256/index.js) qui ré-exporte le
// build UMD. `extraNodeModules` est une simple table de correspondance (pas une
// fonction resolveRequest, qui cassait la résolution interne de Metro).
const config = {
  resolver: {
    unstable_enablePackageExports: false,
    extraNodeModules: {
      ...(defaultConfig.resolver.extraNodeModules || {}),
      'js-sha256': path.join(__dirname, 'shims', 'js-sha256'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
