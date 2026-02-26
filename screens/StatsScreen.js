import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme, Text, Card, ProgressBar, Divider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTabIndex } from 'react-native-paper-tabs';
import { RECORDS_KEY } from './CapturaScreen';

const MY_TAB_INDEX = 3;

// Colores de estatus (mismo criterio que MapaScreen)
const STATUS_COLOR = {
  'Calificada':   '#00796B',
  'Sin Calificar':'#9E9E9E',
  'Sin Proceso':  '#F59E0B',
};

// ── Cálculo de estadísticas ───────────────────────────────────────────────────
function computeStats(records) {
  const total        = records.length;
  const conFoto      = records.filter((r) => r.photoUri).length;
  const importados   = total - conFoto;
  const conDim       = records.filter((r) => r.dimWidth || r.dimHeight).length;

  const areaTotal = records.reduce((sum, r) => {
    const a = parseFloat(r.area);
    return sum + (isNaN(a) ? 0 : a);
  }, 0);

  const byStatus = countBy(records, 'status');
  const byType   = countBy(records, 'structureType');
  const byTech   = countBy(records, 'technology');
  const byFaces  = countBy(records, 'faces');

  return { total, conFoto, importados, conDim, areaTotal, byStatus, byType, byTech, byFaces };
}

function countBy(records, key) {
  return records.reduce((acc, r) => {
    const val = r[key] || '';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

// Ordena un objeto {label: count} de mayor a menor, omitiendo clave vacía
function sortedEntries(obj) {
  return Object.entries(obj)
    .filter(([k]) => k !== '')
    .sort(([, a], [, b]) => b - a);
}

// ── Componentes de UI ─────────────────────────────────────────────────────────

function SectionTitle({ children, colors }) {
  return (
    <Text
      variant="labelLarge"
      style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}
    >
      {children}
    </Text>
  );
}

// Fila con barra de progreso (para estatus y tipos)
function BarRow({ label, count, total, color, colors }) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text variant="bodySmall" style={{ color: colors.onSurface, flex: 1 }}>
          {label}
        </Text>
        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
          {count}  ({Math.round(pct * 100)}%)
        </Text>
      </View>
      <ProgressBar
        progress={pct}
        color={color}
        style={[styles.progressBar, { backgroundColor: color + '22' }]}
      />
    </View>
  );
}

// Pill para tecnología / caras
function StatPill({ label, count, color, colors }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '18', borderColor: color + '55' }]}>
      <Text variant="labelLarge" style={{ color, fontWeight: '800' }}>
        {count}
      </Text>
      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

// Tarjeta hero: número grande + etiqueta
function HeroStat({ value, label, sub, colors, accent }) {
  return (
    <View style={[styles.heroStat, { backgroundColor: accent + '15', borderColor: accent + '30' }]}>
      <Text style={[styles.heroNumber, { color: accent }]}>{value}</Text>
      <Text variant="labelMedium" style={{ color: colors.onSurface, fontWeight: '700', textAlign: 'center' }}>
        {label}
      </Text>
      {sub ? (
        <Text variant="labelSmall" style={{ color: colors.outline, textAlign: 'center' }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const { colors } = useTheme();
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    const records = raw ? JSON.parse(raw) : [];
    setStats(computeStats(records));
  }, []);

  const activeTabIndex = useTabIndex();
  React.useEffect(() => {
    if (activeTabIndex === MY_TAB_INDEX) loadStats();
  }, [activeTabIndex, loadStats]);

  if (!stats) return null;

  const { total, conFoto, importados, conDim, areaTotal, byStatus, byType, byTech, byFaces } = stats;

  const statusEntries = [
    ['Calificada',   byStatus['Calificada']   || 0],
    ['Sin Calificar',byStatus['Sin Calificar'] || 0],
    ['Sin Proceso',  byStatus['Sin Proceso']   || 0],
  ].filter(([, c]) => c > 0);

  const typeEntries  = sortedEntries(byType);
  const techEntries  = sortedEntries(byTech);
  const facesEntries = sortedEntries(byFaces);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Estado vacío ── */}
      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>📊</Text>
          <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
            Sin datos todavía
          </Text>
          <Text variant="bodyMedium" style={[styles.emptyText, { color: colors.outline }]}>
            Captura tu primera ubicación para ver el resumen estadístico.
          </Text>
        </View>
      ) : (
        <>
          {/* ── Hero: métricas principales ── */}
          <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
            <Card.Content>
              <View style={styles.heroRow}>
                <HeroStat
                  value={total}
                  label="Registros"
                  colors={colors}
                  accent={colors.primary}
                />
                <HeroStat
                  value={areaTotal > 0 ? areaTotal.toFixed(1) : '—'}
                  label="m² totales"
                  sub="área inventariada"
                  colors={colors}
                  accent={colors.secondary}
                />
              </View>

              <Divider style={{ marginVertical: 14 }} />

              <View style={styles.subHeroRow}>
                <View style={styles.subHeroItem}>
                  <Text style={styles.subHeroIcon}>📸</Text>
                  <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: '700' }}>
                    {conFoto}
                  </Text>
                  <Text variant="labelSmall" style={{ color: colors.outline }}>Con foto</Text>
                </View>
                <View style={[styles.subHeroSep, { backgroundColor: colors.outlineVariant }]} />
                <View style={styles.subHeroItem}>
                  <Text style={styles.subHeroIcon}>📄</Text>
                  <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: '700' }}>
                    {importados}
                  </Text>
                  <Text variant="labelSmall" style={{ color: colors.outline }}>Importados</Text>
                </View>
                <View style={[styles.subHeroSep, { backgroundColor: colors.outlineVariant }]} />
                <View style={styles.subHeroItem}>
                  <Text style={styles.subHeroIcon}>📐</Text>
                  <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: '700' }}>
                    {conDim}
                  </Text>
                  <Text variant="labelSmall" style={{ color: colors.outline }}>Con dimensiones</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* ── Estatus ── */}
          {statusEntries.length > 0 && (
            <>
              <SectionTitle colors={colors}>ESTATUS</SectionTitle>
              <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
                <Card.Content style={{ gap: 12 }}>
                  {statusEntries.map(([label, count], i) => (
                    <React.Fragment key={label}>
                      <BarRow
                        label={label}
                        count={count}
                        total={total}
                        color={STATUS_COLOR[label] || colors.primary}
                        colors={colors}
                      />
                      {i < statusEntries.length - 1 && (
                        <Divider style={{ marginVertical: 2 }} />
                      )}
                    </React.Fragment>
                  ))}
                </Card.Content>
              </Card>
            </>
          )}

          {/* ── Tipo de estructura ── */}
          {typeEntries.length > 0 && (
            <>
              <SectionTitle colors={colors}>TIPO DE ESTRUCTURA</SectionTitle>
              <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
                <Card.Content style={{ gap: 12 }}>
                  {typeEntries.map(([label, count], i) => (
                    <React.Fragment key={label}>
                      <BarRow
                        label={label}
                        count={count}
                        total={total}
                        color={colors.primary}
                        colors={colors}
                      />
                      {i < typeEntries.length - 1 && (
                        <Divider style={{ marginVertical: 2 }} />
                      )}
                    </React.Fragment>
                  ))}
                </Card.Content>
              </Card>
            </>
          )}

          {/* ── Tecnología ── */}
          {techEntries.length > 0 && (
            <>
              <SectionTitle colors={colors}>TECNOLOGÍA</SectionTitle>
              <View style={styles.pillRow}>
                {techEntries.map(([label, count]) => (
                  <StatPill
                    key={label}
                    label={label}
                    count={count}
                    color={colors.secondary}
                    colors={colors}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── Caras ── */}
          {facesEntries.length > 0 && (
            <>
              <SectionTitle colors={colors}>CARAS</SectionTitle>
              <View style={styles.pillRow}>
                {facesEntries.map(([label, count]) => (
                  <StatPill
                    key={label}
                    label={label}
                    count={count}
                    color={colors.primary}
                    colors={colors}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 4,
  },
  card: {
    borderRadius: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 4,
  },
  // Hero
  heroRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroStat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 4,
  },
  heroNumber: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 46,
  },
  subHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subHeroItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  subHeroSep: {
    width: 1,
    height: 40,
    borderRadius: 1,
  },
  subHeroIcon: {
    fontSize: 20,
  },
  // Barras
  barRow: {
    gap: 6,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  // Pills
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  pill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  // Vacío
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 14,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
});
