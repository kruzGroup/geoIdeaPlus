import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';

type Props = {
  width: string;
  height: string;
  onWidthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
  disabled?: boolean;
};

/** Calcula el area en m2 a partir de ancho y alto como strings.
 *  Retorna null si alguno es invalido o <= 0. */
export function calcArea(w: string, h: string): string | null {
  const wNum = parseFloat(w);
  const hNum = parseFloat(h);
  if (!isNaN(wNum) && !isNaN(hNum) && wNum > 0 && hNum > 0) {
    return (wNum * hNum).toFixed(2);
  }
  return null;
}

function FocusInput({ disabled, style, ...props }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[
        styles.input,
        focused && styles.inputFocused,
        disabled && styles.inputDisabled,
        style,
      ]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      editable={!disabled}
      {...props}
    />
  );
}

export default function DimensionsInput({
  width,
  height,
  onWidthChange,
  onHeightChange,
  disabled = false,
}: Props) {
  const isDark = useColorScheme() === 'dark';
  const textColor = isDark ? '#E0E0E0' : COLORS.text;
  const bgColor   = isDark ? '#2A2A3E' : COLORS.surface;
  const area = calcArea(width, height);

  return (
    <View style={styles.row}>
      <FocusInput
        style={[styles.inputSmall, { color: textColor, backgroundColor: bgColor }]}
        placeholder="Ancho (m)"
        placeholderTextColor={COLORS.textMuted}
        value={width}
        onChangeText={onWidthChange}
        keyboardType="decimal-pad"
        disabled={disabled}
      />
      <Text style={styles.separator}>x</Text>
      <FocusInput
        style={[styles.inputSmall, { color: textColor, backgroundColor: bgColor }]}
        placeholder="Alto (m)"
        placeholderTextColor={COLORS.textMuted}
        value={height}
        onChangeText={onHeightChange}
        keyboardType="decimal-pad"
        disabled={disabled}
      />
      {area !== null && (
        <>
          <Text style={styles.separator}>=</Text>
          <View style={styles.areaBadge}>
            <Text style={styles.areaText}>{area} m²</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.sm,
  },
  inputSmall: {
    width: 80,
  },
  input: {
    width: 80,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    textAlign: 'center',
  },
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  inputDisabled: {
    backgroundColor: COLORS.disabledBg,
    borderColor: COLORS.disabledBorder,
    color: COLORS.disabledText,
  },
  separator: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '700',
    alignSelf: 'center',
  },
  areaBadge: {
    backgroundColor: COLORS.primaryMid,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  areaText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
