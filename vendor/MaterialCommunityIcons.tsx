/**
 * Shim minimal de MaterialCommunityIcons para react-native-paper-tabs.
 * Evita los archivos build/ de @expo/vector-icons que contienen 'use client'
 * y pueden crear instancias separadas de React con React 19.
 *
 * La fuente 'MaterialCommunityIcons' debe cargarse en App.tsx con useFonts().
 */
import React from 'react';
import { Text, TextStyle } from 'react-native';

import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

type GlyphMapKey = keyof typeof glyphMap;

interface MaterialCommunityIconsProps {
  name: GlyphMapKey;
  size?: number;
  color?: string;
  style?: TextStyle;
  selectable?: boolean;
  [key: string]: unknown;
}

const MaterialCommunityIcons = React.forwardRef<Text, MaterialCommunityIconsProps>(
  function MaterialCommunityIcons(
    { name, size = 24, color = 'black', style, selectable = false, ...rest },
    _ref
  ) {
    const codePoint = glyphMap[name];
    const glyph = codePoint !== undefined ? String.fromCodePoint(codePoint) : '?';

    return (
      <Text
        {...rest}
        style={[
          {
            fontFamily: 'MaterialCommunityIcons',
            fontSize: size,
            color,
            lineHeight: size,
          },
          style,
        ]}
        selectable={selectable}
      >
        {glyph}
      </Text>
    );
  }
);

export default MaterialCommunityIcons;
