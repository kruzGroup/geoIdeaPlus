import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme, Text, Divider } from 'react-native-paper';

const APP_VERSION = '1.0.0';

type AppColors = ReturnType<typeof useTheme>['colors'];

// ── Funcionalidades principales ────────────────────────────────────────────────
type Feature = { icon: string; title: string; desc: string };

const FEATURES: Feature[] = [
  { icon: '📍', title: 'GPS Preciso',       desc: 'Captura coordenadas con alta precisión' },
  { icon: '📸', title: 'Fotografía',        desc: 'Foto asociada a cada registro' },
  { icon: '🗺️', title: 'Mapa Interactivo', desc: 'Visualiza tus puntos en el mapa' },
  { icon: '📊', title: 'Estadísticas',      desc: 'Resumen visual de tu inventario' },
  { icon: '📤', title: 'Exportar CSV',      desc: 'Comparte tus datos fácilmente' },
  { icon: '📥', title: 'Importar CSV',      desc: 'Carga registros desde archivos' },
];

// ── Componentes ───────────────────────────────────────────────────────────────
interface FeatureCardProps extends Feature {
  colors: AppColors;
}

function FeatureCard({ icon, title, desc, colors }: FeatureCardProps) {
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

function SectionLabel({ children, colors }: { children: React.ReactNode; colors: AppColors }) {
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

      <Divider style={{ marginHorizontal: 16, marginTop: 20 }} />

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text variant="labelSmall" style={{ color: colors.outline, textAlign: 'center' }}>
          by FrankyKruz 🫶🏻 ® {new Date().getFullYear()}
        </Text>
        <Text variant="labelSmall" style={{ color: colors.outlineVariant, textAlign: 'center', marginTop: 2 }}>
          KruzGroup · Todos los derechos reservados
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

  // Footer
  footer: {
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 20,
    gap: 2,
  },
});
