import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Linking,
  Alert,
  Modal,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
  Text as RNText,
  TextInput,
  ScrollView,
} from 'react-native';
import { useTheme, Text, Card, IconButton, Divider, Chip, Button, Menu, TouchableRipple, Portal } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { useTabIndex } from 'react-native-paper-tabs';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { RECORDS_KEY, STRUCTURE_TYPES, TECHNOLOGY_TYPES, FACE_TYPES, STATUS_TYPES } from './CapturaScreen';
import DimensionsInput, { calcArea } from '../components/DimensionsInput';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';

const MY_TAB_INDEX = 1;

// ── CSV: cabeceras canónicas ───────────────────────────────────────────────────
const CSV_HEADERS = [
  'id', 'savedAt', 'latitude', 'longitude', 'mapUrl',
  'cuenta', 'fieldId', 'structureType', 'technology', 'faces', 'status',
  'dimWidth', 'dimHeight', 'area',
];

// ── Parser de una línea CSV (respeta campos entre comillas) ───────────────────
function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Escapa un campo CSV (envuelve en comillas si tiene coma o comilla) ────────
function escapeCSVField(value) {
  const str = value == null ? '' : String(value);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

// ── Convierte array de registros en texto CSV ─────────────────────────────────
function buildCSV(records) {
  const rows = [CSV_HEADERS.join(',')];
  for (const r of records) {
    rows.push([
      r.id,
      r.savedAt,
      r.coordinates?.latitude  ?? '',
      r.coordinates?.longitude ?? '',
      r.mapUrl,
      r.cuenta,
      r.fieldId,
      r.structureType,
      r.technology,
      r.faces,
      r.status,
      r.dimWidth,
      r.dimHeight,
      r.area ?? '',
    ].map(escapeCSVField).join(','));
  }
  return rows.join('\r\n');
}

// ── Convierte texto CSV en array de registros válidos ─────────────────────────
function csvToRecords(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]).map((h) => h.trim());
  const result  = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    const obj    = {};
    headers.forEach((h, idx) => { obj[h] = (values[idx] ?? '').trim(); });

    const lat = parseFloat(obj.latitude);
    const lon = parseFloat(obj.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    result.push({
      id:            obj.id || `${Date.now()}_${i}`,
      photoUri:      '',
      coordinates:   { latitude: lat, longitude: lon },
      mapUrl:        obj.mapUrl || `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`,
      savedAt:       obj.savedAt || new Date().toLocaleString('es-ES'),
      cuenta:        obj.cuenta        || '',
      fieldId:       obj.fieldId       || '',
      structureType: obj.structureType || '',
      technology:    obj.technology    || '',
      faces:         obj.faces         || '',
      status:        obj.status        || '',
      dimWidth:      obj.dimWidth      || '',
      dimHeight:     obj.dimHeight     || '',
      area:          obj.area          || null,
    });
  }
  return result;
}

// ── Visor de imagen a pantalla completa con zoom ─────────────────────────────
function ImageViewerModal({ uri, onClose }) {
  const { width, height } = useWindowDimensions();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={viewerStyles.backdrop}>
        <ReactNativeZoomableView
          maxZoom={5}
          minZoom={1}
          zoomStep={0.5}
          initialZoom={1}
          bindToBorders
          style={{ width, height }}
        >
          <Image
            source={{ uri }}
            style={{ width, height }}
            resizeMode="contain"
          />
        </ReactNativeZoomableView>

        <IconButton
          icon="close"
          iconColor="#fff"
          size={28}
          style={viewerStyles.closeBtn}
          onPress={onClose}
        />

        <Text style={viewerStyles.hint}>
          Pellizca para hacer zoom · Doble toque para restablecer
        </Text>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 44,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  hint: {
    position: 'absolute',
    bottom: 32,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    textAlign: 'center',
  },
});

// ── Dropdown reutilizable para el modal de edición ───────────────────────────
function LocalDropdownField({ label, options, value, visible, onOpen, onClose, onSelect, colors }) {
  const chevron = String.fromCodePoint(0xF0140);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
        {label}
      </Text>
      <Menu
        visible={visible}
        onDismiss={onClose}
        anchor={
          <TouchableRipple
            onPress={onOpen}
            style={[editStyles.dropdownTrigger, { borderColor: colors.outline }]}
            borderless={false}
          >
            <View style={editStyles.dropdownTriggerInner}>
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

// ── Modal de edición (bottom sheet) ──────────────────────────────────────────
function EditModal({ record, colors, onSave, onClose }) {
  const [cuenta, setCuenta]               = useState(record.cuenta        || '');
  const [fieldId, setFieldId]             = useState(record.fieldId       || '');
  const [dimWidth, setDimWidth]           = useState(record.dimWidth      || '');
  const [dimHeight, setDimHeight]         = useState(record.dimHeight     || '');
  const [structureType, setStructureType] = useState(record.structureType || '');
  const [technology, setTechnology]       = useState(record.technology    || '');
  const [faces, setFaces]                 = useState(record.faces         || '');
  const [status, setStatus]               = useState(record.status        || '');
  const [openMenu, setOpenMenu]           = useState(null);

  const handleCuentaChange = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    setCuenta(digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`);
  };

  const handleSave = () => {
    const area = calcArea(dimWidth, dimHeight);
    onSave({ cuenta, fieldId, dimWidth, dimHeight, area, structureType, technology, faces, status });
  };

  return (
    <Portal>
      <View style={editStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[editStyles.sheet, { backgroundColor: colors.surface }]}>
          {/* Cabecera */}
          <View style={editStyles.sheetHeader}>
            <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
              Editar Registro
            </Text>
            <IconButton icon="close" onPress={onClose} iconColor={colors.onSurfaceVariant} />
          </View>
          <Divider />

          {/* Contenido desplazable */}
          <ScrollView contentContainerStyle={editStyles.content} showsVerticalScrollIndicator={false}>
            {/* Cuenta e ID */}
            <View style={editStyles.fieldRow}>
              <View style={editStyles.fieldGroup}>
                <Text variant="labelLarge" style={[editStyles.fieldLabel, { color: colors.onSurfaceVariant }]}>
                  Cuenta
                </Text>
                <TextInput
                  style={[editStyles.fieldInput, { borderColor: colors.outline, color: colors.onSurface, backgroundColor: colors.background }]}
                  placeholder="0000-0000"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={cuenta}
                  onChangeText={handleCuentaChange}
                  keyboardType="numeric"
                  maxLength={9}
                />
              </View>
              <View style={editStyles.fieldGroup}>
                <Text variant="labelLarge" style={[editStyles.fieldLabel, { color: colors.onSurfaceVariant }]}>
                  ID
                </Text>
                <TextInput
                  style={[editStyles.fieldInput, { borderColor: colors.outline, color: colors.onSurface, backgroundColor: colors.background }]}
                  placeholder="ID"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={fieldId}
                  onChangeText={setFieldId}
                />
              </View>
            </View>

            {/* Dimensiones */}
            <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
              Dimensiones
            </Text>
            <DimensionsInput
              width={dimWidth}
              height={dimHeight}
              onWidthChange={setDimWidth}
              onHeightChange={setDimHeight}
            />

            <Divider style={{ marginVertical: 16 }} />

            {/* Dropdowns */}
            <LocalDropdownField
              label="Tipo de Estructura"
              options={STRUCTURE_TYPES}
              value={structureType}
              visible={openMenu === 'structure'}
              onOpen={() => setOpenMenu('structure')}
              onClose={() => setOpenMenu(null)}
              onSelect={(v) => { setStructureType(v); setOpenMenu(null); }}
              colors={colors}
            />
            <LocalDropdownField
              label="Tecnología"
              options={TECHNOLOGY_TYPES}
              value={technology}
              visible={openMenu === 'technology'}
              onOpen={() => setOpenMenu('technology')}
              onClose={() => setOpenMenu(null)}
              onSelect={(v) => { setTechnology(v); setOpenMenu(null); }}
              colors={colors}
            />
            <LocalDropdownField
              label="Caras"
              options={FACE_TYPES}
              value={faces}
              visible={openMenu === 'faces'}
              onOpen={() => setOpenMenu('faces')}
              onClose={() => setOpenMenu(null)}
              onSelect={(v) => { setFaces(v); setOpenMenu(null); }}
              colors={colors}
            />
            <LocalDropdownField
              label="Estatus"
              options={STATUS_TYPES}
              value={status}
              visible={openMenu === 'status'}
              onOpen={() => setOpenMenu('status')}
              onClose={() => setOpenMenu(null)}
              onSelect={(v) => { setStatus(v); setOpenMenu(null); }}
              colors={colors}
            />
          </ScrollView>

          {/* Botones fijos al pie */}
          <Divider />
          <View style={editStyles.buttons}>
            <Button mode="outlined" onPress={onClose} style={editStyles.btnHalf}>
              Cancelar
            </Button>
            <Button mode="contained" onPress={handleSave} style={editStyles.btnHalf}>
              Guardar cambios
            </Button>
          </View>
        </View>
      </View>
    </Portal>
  );
}

// ── Fila de metadato: etiqueta + valor ────────────────────────────────────────
function MetaRow({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.metaRow}>
      <Text variant="labelSmall" style={[styles.metaLabel, { color: colors.onSurfaceVariant }]}>
        {label}
      </Text>
      <Text variant="bodySmall" style={[styles.metaValue, { color: colors.onSurface }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Tarjeta de registro ───────────────────────────────────────────────────────
function RecordCard({ record, colors, onDelete, onCopy, onOpenMaps, onPhotoPress, onEdit, onTakePhoto }) {
  const hasDetails =
    record.cuenta || record.fieldId || record.structureType ||
    record.technology || record.faces || record.status ||
    record.dimWidth || record.dimHeight;

  return (
    <Card style={[styles.card, { backgroundColor: colors.surface }]} elevation={2}>
      {/* Foto — toca para abrir el visor; placeholder si viene de CSV */}
      {record.photoUri ? (
        <TouchableOpacity onPress={() => onPhotoPress(record.photoUri)} activeOpacity={0.85}>
          <Image source={{ uri: record.photoUri }} style={styles.photo} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.photo, styles.photoPlaceholder]}
          activeOpacity={0.7}
          onPress={() => onTakePhoto(record.id)}
        >
          <Text style={{ fontFamily: 'MaterialCommunityIcons', fontSize: 44, color: colors.primary }}>
            {String.fromCodePoint(0xF0D5D)}
          </Text>
          <Text variant="labelSmall" style={{ color: colors.primary, marginTop: 6, fontWeight: '700' }}>
            Tomar fotografía
          </Text>
        </TouchableOpacity>
      )}

      <Card.Content style={styles.cardContent}>

        {/* Coordenadas */}
        <View style={styles.coordRow}>
          <View style={[styles.coordBadge, { backgroundColor: colors.primaryContainer }]}>
            <Text variant="labelSmall" style={{ color: colors.onPrimaryContainer, letterSpacing: 0.8 }}>LAT</Text>
            <Text variant="bodySmall" style={[styles.coordValue, { color: colors.onPrimaryContainer }]}>
              {record.coordinates.latitude.toFixed(6)}
            </Text>
          </View>
          <View style={[styles.coordBadge, { backgroundColor: colors.secondaryContainer }]}>
            <Text variant="labelSmall" style={{ color: colors.onSecondaryContainer, letterSpacing: 0.8 }}>LON</Text>
            <Text variant="bodySmall" style={[styles.coordValue, { color: colors.onSecondaryContainer }]}>
              {record.coordinates.longitude.toFixed(6)}
            </Text>
          </View>
        </View>

        {/* Chips de categorías */}
        {(record.structureType || record.technology || record.faces || record.status) && (
          <View style={styles.chipsRow}>
            {record.structureType ? (
              <Chip icon="billboard" compact style={styles.chip} textStyle={styles.chipText}>
                {record.structureType}
              </Chip>
            ) : null}
            {record.technology ? (
              <Chip icon="lightning-bolt" compact style={styles.chip} textStyle={styles.chipText}>
                {record.technology}
              </Chip>
            ) : null}
            {record.faces ? (
              <Chip icon="flip-horizontal" compact style={styles.chip} textStyle={styles.chipText}>
                {record.faces}
              </Chip>
            ) : null}
            {record.status ? (
              <Chip
                icon="tag-outline"
                compact
                style={[styles.chip, { backgroundColor: colors.primaryContainer }]}
                textStyle={[styles.chipText, { color: colors.onPrimaryContainer }]}
              >
                {record.status}
              </Chip>
            ) : null}
          </View>
        )}

        {/* Detalles tabulares */}
        {hasDetails && (
          <>
            <Divider style={styles.divider} />
            <MetaRow label="Cuenta" value={record.cuenta} colors={colors} />
            <MetaRow label="ID" value={record.fieldId} colors={colors} />
            {(record.dimWidth || record.dimHeight) && (
              <MetaRow
                label="Dimensiones"
                value={
                  [record.dimWidth, record.dimHeight].filter(Boolean).join(' × ') +
                  (record.area ? `  (${record.area} m²)` : '')
                }
                colors={colors}
              />
            )}
          </>
        )}

        <Text variant="bodySmall" style={[styles.savedAt, { color: colors.outline }]}>
          {record.savedAt}
        </Text>

        <Divider style={styles.divider} />

        {/* Acciones */}
        <View style={styles.actions}>
          <IconButton
            icon="content-copy"
            size={20}
            iconColor={colors.primary}
            onPress={() => onCopy(record.mapUrl)}
            style={styles.iconBtn}
          />
          <IconButton
            icon="map-marker-outline"
            size={20}
            iconColor={colors.secondary}
            onPress={() => onOpenMaps(record.mapUrl)}
            style={styles.iconBtn}
          />
          <IconButton
            icon="pencil-outline"
            size={20}
            iconColor={colors.onSurfaceVariant}
            onPress={() => onEdit(record)}
            style={styles.iconBtn}
          />
          <IconButton
            icon="trash-can-outline"
            size={20}
            iconColor={colors.error}
            onPress={() => onDelete(record.id, record.photoUri)}
            style={styles.iconBtn}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function RecordListScreen() {
  const { colors } = useTheme();
  const [records, setRecords] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadRecords = useCallback(async () => {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    setRecords(raw ? JSON.parse(raw) : []);
  }, []);

  // Recarga cada vez que este tab queda activo
  const activeTabIndex = useTabIndex();
  React.useEffect(() => {
    if (activeTabIndex === MY_TAB_INDEX) loadRecords();
  }, [activeTabIndex, loadRecords]);

  const handleDelete = (id, photoUri) => {
    Alert.alert('Eliminar registro', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (photoUri) {
            try { await FileSystem.deleteAsync(photoUri, { idempotent: true }); } catch {}
          }
          const updated = records.filter((r) => r.id !== id);
          setRecords(updated);
          await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
        },
      },
    ]);
  };

  const handleCopy = async (mapUrl) => {
    await Clipboard.setStringAsync(mapUrl);
    Alert.alert('Copiado', 'Enlace copiado al portapapeles.');
  };

  const handleOpenMaps = (mapUrl) => {
    Linking.openURL(mapUrl);
  };

  const handleSaveEdit = async (updatedFields) => {
    const updated = records.map((r) =>
      r.id === editingRecord.id ? { ...r, ...updatedFields } : r
    );
    setRecords(updated);
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
    setEditingRecord(null);
  };

  const handleTakePhoto = async (recordId) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara para tomar una fotografía.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const photoUri = result.assets[0].uri;
    const updated = records.map((r) => r.id === recordId ? { ...r, photoUri } : r);
    setRecords(updated);
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
  };

  const handleImportCSV = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const content = await response.text();
      const items = csvToRecords(content);

      if (items.length === 0) {
        Alert.alert(
          'Sin registros válidos',
          'El archivo no contiene registros válidos o no tiene el formato correcto.',
          [{ text: 'Entendido' }],
        );
        return;
      }

      Alert.alert(
        'Importar CSV',
        `Se encontraron ${items.length} registro${items.length !== 1 ? 's' : ''} válido${items.length !== 1 ? 's' : ''}.\n\n¿Cómo deseas importarlos?`,
        [
          {
            text: 'Agregar a los existentes',
            onPress: async () => {
              const raw = await AsyncStorage.getItem(RECORDS_KEY);
              const existing = raw ? JSON.parse(raw) : [];
              const merged = [...items, ...existing];
              await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(merged));
              setRecords(merged);
              Alert.alert(
                'Importación exitosa',
                `${items.length} registro${items.length !== 1 ? 's' : ''} agregado${items.length !== 1 ? 's' : ''} correctamente.`,
              );
            },
          },
          {
            text: 'Reemplazar todo',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Confirmar reemplazo',
                `Esta acción eliminará los ${records.length} registro${records.length !== 1 ? 's' : ''} actuales y los reemplazará con los ${items.length} del archivo. No se puede deshacer.`,
                [
                  {
                    text: 'Sí, reemplazar',
                    style: 'destructive',
                    onPress: async () => {
                      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(items));
                      setRecords(items);
                      Alert.alert(
                        'Importación exitosa',
                        `Registros reemplazados con ${items.length} del archivo.`,
                      );
                    },
                  },
                  { text: 'Cancelar', style: 'cancel' },
                ],
              );
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Error al importar',
        `${msg}\n\nAsegúrate de que el archivo sea un CSV válido exportado desde la app.`,
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (records.length === 0) return;
    setExporting(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const filename = `geoideaplus-${dateStamp}.csv`;
      const fileUri = FileSystem.cacheDirectory + filename;

      const csv = buildCSV(records);
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'Tu dispositivo no soporta compartir archivos.');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar registros',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error al exportar', msg);
    } finally {
      setExporting(false);
    }
  };

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🗂️</Text>
      <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
        Sin Registros
      </Text>
      <Text variant="bodyMedium" style={[styles.emptyText, { color: colors.outline }]}>
        Ve a la pestaña CAPTURA para guardar tu primera ubicación con foto.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Cabecera fija: contador + botones CSV ── */}
      <View style={[styles.screenHeader, { borderBottomColor: colors.outlineVariant }]}>
        {records.length > 0 && (
          <RNText style={[styles.pageTitle, { color: colors.primary }]}>
            {records.length} {records.length === 1 ? 'Registro' : 'Registros'}
          </RNText>
        )}
        <View style={styles.csvActions}>
          <Button
            mode="outlined"
            icon="arrow-down-circle-outline"
            contentStyle={styles.csvBtnContent}
            labelStyle={styles.csvBtnLabel}
            style={styles.csvBtnSmall}
            loading={importing}
            disabled={importing}
            onPress={handleImportCSV}
          >
            Importar
          </Button>
          {records.length === 0 ? (
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Sin registros',
                  'No se pueden exportar registros porque no hay ninguno.',
                )
              }
            >
              <Button
                mode="contained-tonal"
                icon="arrow-up-circle-outline"
                contentStyle={styles.csvBtnContent}
                labelStyle={styles.csvBtnLabel}
                style={styles.csvBtnSmall}
                disabled
              >
                Exportar
              </Button>
            </Pressable>
          ) : (
            <Button
              mode="contained-tonal"
              icon="arrow-up-circle-outline"
              contentStyle={styles.csvBtnContent}
              labelStyle={styles.csvBtnLabel}
              style={styles.csvBtnSmall}
              loading={exporting}
              disabled={exporting}
              onPress={handleExportCSV}
            >
              Exportar
            </Button>
          )}
        </View>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordCard
            record={item}
            colors={colors}
            onDelete={handleDelete}
            onCopy={handleCopy}
            onOpenMaps={handleOpenMaps}
            onPhotoPress={setViewerUri}
            onEdit={setEditingRecord}
            onTakePhoto={handleTakePhoto}
          />
        )}
        ListEmptyComponent={<ListEmpty />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {viewerUri && (
        <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
      )}

      {editingRecord && (
        <EditModal
          key={editingRecord.id}
          record={editingRecord}
          colors={colors}
          onSave={handleSaveEdit}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  csvActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  csvBtnSmall: {
    borderRadius: 8,
  },
  csvBtnContent: {
    paddingVertical: 0,
    paddingHorizontal: 4,
    height: 32,
  },
  csvBtnLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
    marginVertical: 0,
  },
  pageTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 180,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  cardContent: {
    paddingTop: 12,
  },
  coordRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  coordBadge: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 2,
  },
  coordValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    height: 28,
  },
  chipText: {
    fontSize: 11,
    marginVertical: 0,
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  metaLabel: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontWeight: '600',
  },
  savedAt: {
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'right',
  },
  divider: {
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -4,
  },
  iconBtn: {
    margin: 0,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});

// ── Estilos del modal de edición ──────────────────────────────────────────────
const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
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
  buttons: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  btnHalf: {
    flex: 1,
    borderRadius: 12,
  },
});
