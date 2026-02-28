const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Intercepta 'react-native-vector-icons/MaterialCommunityIcons' y redirige
// a un shim local puro (función componente, sin 'use client', sin clases compiladas).
// Esto evita el error "React Element from an older version" con React 19.
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-vector-icons/MaterialCommunityIcons') {
    return {
      filePath: path.resolve(__dirname, 'vendor/MaterialCommunityIcons.tsx'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
