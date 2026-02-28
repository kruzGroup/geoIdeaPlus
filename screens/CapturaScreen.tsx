import React, { useState } from 'react';
import { View, StyleSheet, Image, ScrollView, Alert, Linking, TextInput } from 'react-native';
import { useTheme, Text, Button, Card, Divider, ActivityIndicator, Menu, TouchableRipple } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DimensionsInput, { calcArea } from '../components/DimensionsInput';
import CompletedTask from '../components/CompletedTask';

export const RECORDS_KEY = '@geoideaplus_records';

export const STRUCTURE_TYPES  = ['Valla', 'Rótulo', 'Mupi', 'Cruza Calle', 'Banner', 'Pendón', 'Pantalla'];
export const TECHNOLOGY_TYPES = ['LED', 'Luminoso', 'Normal'];
export const FACE_TYPES       = ['Una Cara', 'Doble Cara'];
export const STATUS_TYPES     = ['Calificada', 'Sin Calificar', 'Sin Proceso'];

export type GeoRecord = {
  id: string;
  photoUri: string;
  coordinates: { latitude: number; longitude: number };
  mapUrl: string;
  savedAt: string;
  cuenta: string;
  fieldId: string;
  structureType: string;
  technology: string;
  faces: string;
  status: string;
  dimWidth: string;
  dimHeight: string;
  area: string | null;
};

type Step = 'idle' | 'capturing' | 'previewing' | 'saving';

type Preview = {
  photoUri: string;
  coordinates: { latitude: number; longitude: number };
  mapUrl: string;
  savedAt: string;
};

type AppColors = ReturnType<typeof useTheme>['colors'];

// Componente reutilizable para cada dropdown
interface DropdownFieldProps {
  label: string;
  options: string[];
  value: string;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (v: string) => void;
  colors: AppColors;
}

function DropdownField({ label, options, value, visible, onOpen, onClose, onSelect, colors }: DropdownFieldProps) {
  // Glifo chevron-down de MaterialCommunityIcons (codepoint 0xF0140)
  const chevron = String.fromCodePoint(0xF0140);

  return (
    <View style={{ marginBottom: 4 }}>
      <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
        {label}
      </Text>
      <Menu
        visible={visible}
        onDismiss={onClose}
        anchor={
          <TouchableRipple
            onPress={onOpen}
            style={[styles.dropdownTrigger, { borderColor: colors.outline }]}
            borderless={false}
          >
            <View style={styles.dropdownTriggerInner}>
              <Text style={{ color: value ? colors.onSurface : colors.onSurfaceVariant, flex: 1 }}>
                {value || 'Seleccionar...'}
              </Text>
              <Text style={{ fontFamily: 'MaterialCommunityIcons', fontSize: 20, color: colors.onSurfaceVariant }}>
                {chevron}
              </Text>
            </View>
          </TouchableRipple>
        }
      >
        {options.map((opt) => (
          <Menu.Item
            key={opt}
            title={opt}
            leadingIcon={value === opt ? 'check' : undefined}
            onPress={() => onSelect(opt)}
          />
        ))}
      </Menu>
    </View>
  );
}

// step: 'idle' | 'capturing' | 'previewing' | 'saving'

export default function CapturaScreen() {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('idle');
  const [showCompleted, setShowCompleted] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [copied, setCopied] = useState(false);
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [structureType, setStructureType] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [technology, setTechnology] = useState('');
  const [technologyMenuVisible, setTechnologyMenuVisible] = useState(false);
  const [faces, setFaces] = useState('');
  const [facesMenuVisible, setFacesMenuVisible] = useState(false);
  const [status, setStatus] = useState('');
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);

  // ── Iniciar captura ─────────────────────────────────────────────────────
  const startCapture = async () => {
    setStep('capturing');
    try {
      // 1. Permiso cámara
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
        setStep('idle');
        return;
      }

      // 2. Permiso ubicación
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la ubicación.');
        setStep('idle');
        return;
      }

      // 3. Abrir cámara
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) {
        setStep('idle');
        return;
      }

      // 4. Obtener ubicación
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // 5. Copiar foto a almacenamiento permanente
      const filename = `geo_${Date.now()}.jpg`;
      const destUri = FileSystem.documentDirectory + filename;
      await FileSystem.copyAsync({ from: result.assets[0].uri, to: destUri });

      const { latitude, longitude } = location.coords;
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

      setPreview({
        photoUri: destUri,
        coordinates: { latitude, longitude },
        mapUrl,
        savedAt: new Date().toLocaleString('es-ES'),
      });
      setStep('previewing');
    } catch (e) {
      Alert.alert('Error', 'No se pudo completar la captura. Inténtalo de nuevo.');
      console.error(e);
      setStep('idle');
    }
  };

  // ── Guardar registro ─────────────────────────────────────────────────────
  const saveRecord = async () => {
    if (!preview) return;
    setStep('saving');
    try {
      const raw = await AsyncStorage.getItem(RECORDS_KEY);
      const records: GeoRecord[] = raw ? JSON.parse(raw) : [];
      const area = calcArea(dimWidth, dimHeight);
      records.unshift({ id: Date.now().toString(), ...preview, dimWidth, dimHeight, area, cuenta, fieldId, structureType, technology, faces, status }); // más nuevo primero
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      setPreview(null);
      setDimWidth('');
      setDimHeight('');
      setCuenta('');
      setFieldId('');
      setStructureType('');
      setTechnology('');
      setFaces('');
      setStatus('');
      setStep('idle');
      setShowCompleted(true);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el registro.');
      console.error(e);
      setStep('idle');
    }
  };

  // ── Descartar previsualización ────────────────────────────────────────────
  const discard = async () => {
    if (preview?.photoUri) {
      await FileSystem.deleteAsync(preview.photoUri, { idempotent: true });
    }
    setPreview(null);
    setDimWidth('');
    setDimHeight('');
    setCuenta('');
    setFieldId('');
    setStructureType('');
    setTechnology('');
    setFaces('');
    setStatus('');
    setStep('idle');
  };

  // ── Copiar enlace ─────────────────────────────────────────────────────────
  const copyLink = async () => {
    if (!preview?.mapUrl) return;
    await Clipboard.setStringAsync(preview.mapUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Abrir Maps ────────────────────────────────────────────────────────────
  const openMaps = () => {
    if (preview?.mapUrl) Linking.openURL(preview.mapUrl);
  };

  // Aplica máscara 0000-0000 al campo Cuenta
  const handleCuentaChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    setCuenta(digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`);
  };

  const isLoading = step === 'capturing' || step === 'saving';
  const isPreviewing = step === 'previewing';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Estado de carga ── */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator animating size="large" color={colors.primary} />
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 12 }}>
            {step === 'capturing' ? 'Procesando captura…' : 'Guardando registro…'}
          </Text>
        </View>
      )}

      {/* ── Previsualización ── */}
      {isPreviewing && preview && (
        <>
          {/* Foto */}
          <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={3}>
            <Image source={{ uri: preview.photoUri }} style={styles.photo} resizeMode="cover" />
            <Card.Content style={{ paddingTop: 14 }}>
              <Text variant="titleMedium" style={[styles.cardTitle, { color: colors.primary }]}>
                Vista previa
              </Text>
              <Divider style={styles.divider} />

              <View style={styles.badgeRow}>
                <View style={[styles.coordBadge, styles.coordBadgeLat]}>
                  <Text style={styles.coordBadgeLabel}>LAT</Text>
                  <Text style={styles.coordBadgeValue}>
                    {preview.coordinates.latitude.toFixed(6)}
                  </Text>
                </View>
                <View style={[styles.coordBadge, styles.coordBadgeLon]}>
                  <Text style={styles.coordBadgeLabel}>LON</Text>
                  <Text style={styles.coordBadgeValue}>
                    {preview.coordinates.longitude.toFixed(6)}
                  </Text>
                </View>
              </View>

              <Divider style={styles.divider} />

              <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                Dimensiones
              </Text>
              <DimensionsInput
                width={dimWidth}
                height={dimHeight}
                onWidthChange={setDimWidth}
                onHeightChange={setDimHeight}
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldGroup}>
                  <Text variant="labelLarge" style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
                    Cuenta
                  </Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.outline, color: colors.onSurface, backgroundColor: colors.surface }]}
                    placeholder="0000-0000"
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={cuenta}
                    onChangeText={handleCuentaChange}
                    keyboardType="numeric"
                    maxLength={9}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text variant="labelLarge" style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
                    ID
                  </Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.outline, color: colors.onSurface, backgroundColor: colors.surface }]}
                    placeholder="ID"
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={fieldId}
                    onChangeText={setFieldId}
                  />
                </View>
              </View>

              <Divider style={[styles.divider, { marginTop: 16 }]} />

              <DropdownField
                label="Tipo de Estructura"
                options={STRUCTURE_TYPES}
                value={structureType}
                visible={menuVisible}
                onOpen={() => setMenuVisible(true)}
                onClose={() => setMenuVisible(false)}
                onSelect={(v) => { setStructureType(v); setMenuVisible(false); }}
                colors={colors}
              />

              <DropdownField
                label="Tecnología"
                options={TECHNOLOGY_TYPES}
                value={technology}
                visible={technologyMenuVisible}
                onOpen={() => setTechnologyMenuVisible(true)}
                onClose={() => setTechnologyMenuVisible(false)}
                onSelect={(v) => { setTechnology(v); setTechnologyMenuVisible(false); }}
                colors={colors}
              />

              <DropdownField
                label="Caras"
                options={FACE_TYPES}
                value={faces}
                visible={facesMenuVisible}
                onOpen={() => setFacesMenuVisible(true)}
                onClose={() => setFacesMenuVisible(false)}
                onSelect={(v) => { setFaces(v); setFacesMenuVisible(false); }}
                colors={colors}
              />

              <DropdownField
                label="Estatus"
                options={STATUS_TYPES}
                value={status}
                visible={statusMenuVisible}
                onOpen={() => setStatusMenuVisible(true)}
                onClose={() => setStatusMenuVisible(false)}
                onSelect={(v) => { setStatus(v); setStatusMenuVisible(false); }}
                colors={colors}
              />

              <Text variant="bodySmall" style={[styles.savedAt, { color: colors.outline }]}>
                {preview.savedAt}
              </Text>
            </Card.Content>
          </Card>

          {/* Acciones de previsualización */}
          <Button
            mode="contained"
            icon="content-save"
            onPress={saveRecord}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
            labelStyle={styles.primaryButtonLabel}
          >
            Guardar registro
          </Button>

          <View style={styles.secondaryButtons}>
            <Button
              mode="outlined"
              icon={copied ? 'check' : 'content-copy'}
              onPress={copyLink}
              style={styles.halfButton}
              contentStyle={styles.secondaryButtonContent}
            >
              {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>

            <Button
              mode="contained-tonal"
              icon="map"
              onPress={openMaps}
              style={styles.halfButton}
              contentStyle={styles.secondaryButtonContent}
            >
              Abrir Maps
            </Button>
          </View>

          <Button
            mode="text"
            icon="close-circle-outline"
            onPress={discard}
            style={styles.discardButton}
            textColor={colors.error}
          >
            Descartar
          </Button>
        </>
      )}

      {/* ── Animación guardado exitoso ── */}
      {showCompleted && (
        <CompletedTask onFinish={() => setShowCompleted(false)} />
      )}

      {/* ── Estado inicial ── */}
      {!showCompleted && step === 'idle' && (
        <>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text variant="titleMedium" style={[styles.emptyTitle, { color: colors.onSurface }]}>
              Nueva captura
            </Text>
            <Text variant="bodyMedium" style={[styles.emptyText, { color: colors.outline }]}>
              Toma una foto del lugar y registra automáticamente las coordenadas GPS.
            </Text>
          </View>

          <Button
            mode="contained"
            icon="camera"
            onPress={startCapture}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
            labelStyle={styles.primaryButtonLabel}
          >
            Iniciar captura
          </Button>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
    marginBottom: 8,
  },
  emptyIcon: {
    fontSize: 64,
  },
  emptyTitle: {
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 220,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 12,
  },
  divider: {
    marginBottom: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  coordValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  coordBadge: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  coordBadgeLat: {
    backgroundColor: '#1565C0',
  },
  coordBadgeLon: {
    backgroundColor: '#00796B',
  },
  coordBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  coordBadgeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  savedAt: {
    marginTop: 10,
    textAlign: 'right',
  },
  primaryButton: {
    marginBottom: 12,
    borderRadius: 12,
  },
  primaryButtonContent: {
    paddingVertical: 8,
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  halfButton: {
    flex: 1,
    borderRadius: 12,
  },
  secondaryButtonContent: {
    paddingVertical: 4,
  },
  discardButton: {
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  fieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    textAlign: 'center',
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropdownTriggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
