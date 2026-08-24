module.exports = {
  preset: '@react-native/jest-preset',
  // @noble/* (crypto E2EE) sont publiés en ESM pur (pas de build CJS) --
  // le node_modules ignoré par défaut par le preset RN doit faire une
  // exception pour que Babel les transforme en CJS pour Jest.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|@noble)/)',
  ],
};
