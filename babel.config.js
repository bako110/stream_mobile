module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // react-native-reanimated v4 inclut déjà worklets — NE PAS ajouter les deux
    'react-native-reanimated/plugin',
  ],
};
