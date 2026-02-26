import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme, Text, Card, Divider, Chip } from 'react-native-paper';

const APP_VERSION = '1.0.0';

// ── Funcionalidades principales ────────────────────────────────────────────────
const FEATURES = [
  { icon: '📍', title: 'GPS Preciso',       desc: 'Captura coordenadas con alta precisión' },
  { icon: '📸', title: 'Fotografía',        desc: 'Foto asociada a cada registro' },
  { icon: '🗺️', title: 'Mapa Interactivo', desc: 'Visualiza tus puntos en el mapa' },
  { icon: '📊', title: 'Estadísticas',      desc: 'Resumen visual de tu inventario' },
  { icon: '📤', title: 'Exportar CSV',      desc: 'Comparte tus datos fácilmente' },
  { icon: '📥', title: 'Importar CSV',      desc: 'Carga registros desde archivos' },
];

// ── Stack tecnológico ──────────────────────────────────────────────────────────
const TECH_STACK = [
  'Expo SDK 54', 'React Native', 'React Native Paper', 'AsyncStorage',
  'Leaflet Maps', 'expo-location', 'expo-image-picker',
];

// ── Componentes ───────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, colors }) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text variant="labelLarge" style={{ color: colors.onSurface, fontWeight: '700', textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 16 }}>
        {desc}
      </Text>
    </View>
  );
}

function SectionLabel({ children, colors }) {
  return (
    <Text
      variant="labelLarge"
      style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
    >
      {children}
    </Text>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function AboutScreen() {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <View style={[styles.hero, { backgroundColor: colors.primaryContainer }]}>
        <View style={[styles.heroGlow, { backgroundColor: colors.primary + '22' }]} />

        <View style={[styles.appIconWrap, { backgroundColor: colors.surface, shadowColor: colors.primary }]}>
          <Text style={styles.appIconEmoji}>🗺️</Text>
        </View>

        <Text style={[styles.appName, { color: colors.primary }]}>GeoIdeaPlus</Text>

        <Text variant="bodyMedium" style={{ color: colors.onPrimaryContainer, textAlign: 'center', lineHeight: 20 }}>
          Inventario georreferenciado de estructuras{'\n'}publicitarias al alcance de tu mano
        </Text>

        <View style={[styles.versionBadge, { backgroundColor: colors.primary }]}>
          <Text variant="labelSmall" style={{ color: colors.onPrimary, letterSpacing: 1 }}>
            v{APP_VERSION}
          </Text>
        </View>
      </View>

      {/* ── Funcionalidades ── */}
      <SectionLabel colors={colors}>FUNCIONALIDADES</SectionLabel>
      <View style={styles.featuresGrid}>
        {FEATURES.map((f) => (
          <FeatureCard key={f.title} {...f} colors={colors} />
        ))}
      </View>

      {/* ── Stack ── */}
      <SectionLabel colors={colors}>TECNOLOGÍA</SectionLabel>
      <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
        <Card.Content style={styles.techContent}>
          {TECH_STACK.map((t) => (
            <Chip
              key={t}
              compact
              style={[styles.techChip, { backgroundColor: colors.secondaryContainer }]}
              textStyle={{ color: colors.onSecondaryContainer, fontSize: 11 }}
            >
              {t}
            </Chip>
          ))}
        </Card.Content>
      </Card>

      {/* ── Info ── */}
      <SectionLabel colors={colors}>INFORMACIÓN</SectionLabel>
      <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
        <Card.Content>
          {[
            { label: 'Versión',     value: APP_VERSION },
            { label: 'Plataforma',  value: 'Android · iOS' },
            { label: 'SDK',         value: 'Expo SDK 54' },
            { label: 'Arquitectura',value: 'React Native (Expo)' },
          ].map(({ label, value }, i, arr) => (
            <React.Fragment key={label}>
              <View style={styles.infoRow}>
                <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
                  {label}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.onSurface, fontWeight: '600' }}>
                  {value}
                </Text>
              </View>
              {i < arr.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Card.Content>
      </Card>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text variant="labelSmall" style={{ color: colors.outline, textAlign: 'center' }}>
          Hecho con ❤️ · {new Date().getFullYear()}
        </Text>
        <Text variant="labelSmall" style={{ color: colors.outlineVariant, textAlign: 'center', marginTop: 2 }}>
          GeoIdeaPlus · Todos los derechos reservados
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: 48,
    gap: 4,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 24,
    gap: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  heroGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -60,
  },
  appIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  appIconEmoji: {
    fontSize: 44,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  versionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 2,
  },

  // Section label
  sectionLabel: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 20,
  },

  // Features grid
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  featureCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  featureIcon: {
    fontSize: 28,
  },

  // Tech chips
  card: {
    borderRadius: 16,
    marginHorizontal: 16,
  },
  techContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  techChip: {
    height: 30,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },

  // Footer
  footer: {
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 20,
    gap: 2,
  },
});
