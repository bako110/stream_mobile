// Shim de résolution pour `js-sha256`.
//
// js-sha256@1.0.0 ne publie qu'un champ `exports` moderne. Avec
// `unstable_enablePackageExports:false` dans metro.config.js (requis pour la New
// Architecture), Metro ne sait pas résoudre le `main` du package et renvoie un
// HTTP 500 au bundle ("could not be resolved: build/sha256.cjs").
//
// On ré-exporte simplement le build UMD, qui expose bien `sha256`, `sha224`,
// `hmac`, etc. et fonctionne en environnement React Native.
module.exports = require('js-sha256/build/sha256.js');
