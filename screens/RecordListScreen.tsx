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
import { RECORDS_KEY, STRUCTURE_TYPES, TECHNOLOGY_TYPES, FACE_TYPES, STATUS_TYPES, ZONE_TYPES, type GeoRecord } from './CapturaScreen';
import DimensionsInput, { calcArea } from '../components/DimensionsInput';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import JSZip from 'jszip';
import { buildRecordCardHTML, buildPDFHTML } from '../utils/pdfReport';

const MY_TAB_INDEX = 1;

type AppColors = ReturnType<typeof useTheme>['colors'];

// ── CSV: cabeceras canónicas ───────────────────────────────────────────────────
const CSV_HEADERS = [
  'id', 'savedAt', 'latitude', 'longitude', 'mapUrl',
  'cuenta', 'fieldId', 'structureType', 'technology', 'faces', 'status', 'zona',
  'dimWidth', 'dimHeight', 'area', 'photoFile',
];

// ── Parser de una línea CSV (respeta campos entre comillas) ───────────────────
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
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
function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

// ── Convierte array de registros en texto CSV ─────────────────────────────────
function buildCSV(records: GeoRecord[], photoFiles?: string[]): string {
  const rows = [CSV_HEADERS.join(',')];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
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
      r.zona,
      r.dimWidth,
      r.dimHeight,
      r.area ?? '',
      photoFiles?.[i] ?? '',
    ].map(escapeCSVField).join(','));
  }
  return rows.join('\r\n');
}

// ── Convierte texto CSV en array de registros válidos ─────────────────────────
function csvToRecords(csv: string): GeoRecord[] {
  return parseCSVWithPhotoFiles(csv).map((p) => p.record);
}

// ── Parser que preserva photoFile alineado con cada registro ──────────────────
function parseCSVWithPhotoFiles(csv: string): { record: GeoRecord; photoFile: string }[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]).map((h) => h.trim());
  const result: { record: GeoRecord; photoFile: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (values[idx] ?? '').trim(); });

    const lat = parseFloat(obj.latitude);
    const lon = parseFloat(obj.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    result.push({
      photoFile: obj.photoFile || '',
      record: {
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
        zona:          obj.zona          || '',
        dimWidth:      obj.dimWidth      || '',
        dimHeight:     obj.dimHeight     || '',
        area:          obj.area          || null,
      },
    });
  }
  return result;
}

// ── Visor de imagen a pantalla completa con zoom ─────────────────────────────
interface ImageViewerModalProps {
  uri: string;
  onClose: () => void;
}

function ImageViewerModal({ uri, onClose }: ImageViewerModalProps) {
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
interface LocalDropdownFieldProps {
  label: string;
  options: string[];
  value: string;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (v: string) => void;
  colors: AppColors;
}

function LocalDropdownField({ label, options, value, visible, onOpen, onClose, onSelect, colors }: LocalDropdownFieldProps) {
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
type EditableFields = Pick<GeoRecord, 'cuenta' | 'fieldId' | 'dimWidth' | 'dimHeight' | 'area' | 'structureType' | 'technology' | 'faces' | 'status' | 'zona'>;

interface EditModalProps {
  record: GeoRecord;
  colors: AppColors;
  onSave: (fields: EditableFields) => void;
  onClose: () => void;
}

function EditModal({ record, colors, onSave, onClose }: EditModalProps) {
  const [cuenta, setCuenta]               = useState(record.cuenta        || '');
  const [fieldId, setFieldId]             = useState(record.fieldId       || '');
  const [dimWidth, setDimWidth]           = useState(record.dimWidth      || '');
  const [dimHeight, setDimHeight]         = useState(record.dimHeight     || '');
  const [structureType, setStructureType] = useState(record.structureType || '');
  const [technology, setTechnology]       = useState(record.technology    || '');
  const [faces, setFaces]                 = useState(record.faces         || '');
  const [status, setStatus]               = useState(record.status        || '');
  const [zona, setZona]                   = useState(record.zona          || '');
  const [openMenu, setOpenMenu]           = useState<string | null>(null);

  const handleCuentaChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    setCuenta(digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`);
  };

  const handleSave = () => {
    const area = calcArea(dimWidth, dimHeight);
    onSave({ cuenta, fieldId, dimWidth, dimHeight, area, structureType, technology, faces, status, zona });
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
            <LocalDropdownField
              label="Zona"
              options={ZONE_TYPES}
              value={zona}
              visible={openMenu === 'zona'}
              onOpen={() => setOpenMenu('zona')}
              onClose={() => setOpenMenu(null)}
              onSelect={(v) => { setZona(v); setOpenMenu(null); }}
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
interface MetaRowProps {
  label: string;
  value: string | null | undefined;
  colors: AppColors;
}

function MetaRow({ label, value, colors }: MetaRowProps) {
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
interface RecordCardProps {
  record: GeoRecord;
  colors: AppColors;
  onDelete: (id: string, photoUri: string) => void;
  onCopy: (mapUrl: string) => void;
  onOpenMaps: (mapUrl: string) => void;
  onPhotoPress: (uri: string) => void;
  onEdit: (record: GeoRecord) => void;
  onTakePhoto: (id: string) => void;
}

function RecordCard({ record, colors, onDelete, onCopy, onOpenMaps, onPhotoPress, onEdit, onTakePhoto }: RecordCardProps) {
  const hasDetails =
    record.cuenta || record.fieldId || record.structureType ||
    record.technology || record.faces || record.status || record.zona ||
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
        {(record.structureType || record.technology || record.faces || record.status || record.zona) && (
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
            {record.zona ? (
              <Chip
                icon="map-marker-radius-outline"
                compact
                style={[styles.chip, { backgroundColor: colors.secondaryContainer }]}
                textStyle={[styles.chipText, { color: colors.onSecondaryContainer }]}
              >
                {record.zona}
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

// ── Modal de detalle de registro ──────────────────────────────────────────────
interface RecordDetailModalProps {
  record: GeoRecord;
  colors: AppColors;
  onClose: () => void;
  onEdit: (record: GeoRecord) => void;
  onDelete: (id: string, photoUri: string) => void;
  onCopy: (mapUrl: string) => void;
  onOpenMaps: (mapUrl: string) => void;
  onPhotoPress: (uri: string) => void;
  onTakePhoto: (id: string) => void;
}

function RecordDetailModal({ record, colors, onClose, onEdit, onDelete, onCopy, onOpenMaps, onPhotoPress, onTakePhoto }: RecordDetailModalProps) {
  const hasDetails =
    record.cuenta || record.fieldId || record.structureType ||
    record.technology || record.faces || record.status || record.zona ||
    record.dimWidth || record.dimHeight;

  return (
    <Portal>
      <View style={detailStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[detailStyles.sheet, { backgroundColor: colors.surface }]}>
          {/* Cabecera */}
          <View style={detailStyles.sheetHeader}>
            <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
              Detalle del Registro
            </Text>
            <IconButton icon="close" onPress={onClose} iconColor={colors.onSurfaceVariant} />
          </View>
          <Divider />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={detailStyles.content}>
            {/* Foto */}
            {record.photoUri ? (
              <TouchableOpacity onPress={() => onPhotoPress(record.photoUri)} activeOpacity={0.85}>
                <Image source={{ uri: record.photoUri }} style={detailStyles.photo} resizeMode="cover" />
                <View style={detailStyles.photoHint}>
                  <Text style={{ color: '#fff', fontSize: 11 }}>Toca para ampliar</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[detailStyles.photo, detailStyles.photoPlaceholder]}
                activeOpacity={0.7}
                onPress={() => { onClose(); onTakePhoto(record.id); }}
              >
                <Text style={{ fontFamily: 'MaterialCommunityIcons', fontSize: 44, color: colors.primary }}>
                  {String.fromCodePoint(0xF0D5D)}
                </Text>
                <Text variant="labelSmall" style={{ color: colors.primary, marginTop: 6, fontWeight: '700' }}>
                  Tomar fotografía
                </Text>
              </TouchableOpacity>
            )}

            {/* Coordenadas */}
            <View style={[styles.coordRow, { marginTop: 14 }]}>
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

            {/* Chips */}
            {(record.structureType || record.technology || record.faces || record.status || record.zona) && (
              <View style={styles.chipsRow}>
                {record.structureType ? (
                  <Chip icon="billboard" compact style={styles.chip} textStyle={styles.chipText}>{record.structureType}</Chip>
                ) : null}
                {record.technology ? (
                  <Chip icon="lightning-bolt" compact style={styles.chip} textStyle={styles.chipText}>{record.technology}</Chip>
                ) : null}
                {record.faces ? (
                  <Chip icon="flip-horizontal" compact style={styles.chip} textStyle={styles.chipText}>{record.faces}</Chip>
                ) : null}
                {record.status ? (
                  <Chip icon="tag-outline" compact style={[styles.chip, { backgroundColor: colors.primaryContainer }]} textStyle={[styles.chipText, { color: colors.onPrimaryContainer }]}>
                    {record.status}
                  </Chip>
                ) : null}
                {record.zona ? (
                  <Chip icon="map-marker-radius-outline" compact style={[styles.chip, { backgroundColor: colors.secondaryContainer }]} textStyle={[styles.chipText, { color: colors.onSecondaryContainer }]}>
                    {record.zona}
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
          </ScrollView>

          {/* Acciones fijas al pie */}
          <Divider />
          <View style={detailStyles.actions}>
            <IconButton icon="content-copy" size={22} iconColor={colors.primary} onPress={() => onCopy(record.mapUrl)} />
            <IconButton icon="map-marker-outline" size={22} iconColor={colors.secondary} onPress={() => onOpenMaps(record.mapUrl)} />
            <IconButton icon="pencil-outline" size={22} iconColor={colors.onSurfaceVariant} onPress={() => { onClose(); onEdit(record); }} />
            <IconButton icon="trash-can-outline" size={22} iconColor={colors.error} onPress={() => { onClose(); onDelete(record.id, record.photoUri); }} />
          </View>
        </View>
      </View>
    </Portal>
  );
}

// ── Fila compacta para vista lista ───────────────────────────────────────────
interface RecordListRowProps {
  record: GeoRecord;
  index: number;
  colors: AppColors;
  onDelete: (id: string, photoUri: string) => void;
  onCopy: (mapUrl: string) => void;
  onOpenMaps: (mapUrl: string) => void;
  onEdit: (record: GeoRecord) => void;
  onPress: (record: GeoRecord) => void;
}

function RecordListRow({ record, index, colors, onDelete, onCopy, onOpenMaps, onEdit, onPress }: RecordListRowProps) {
  return (
    <TouchableOpacity onPress={() => onPress(record)} activeOpacity={0.7}>
    <View style={[listRowStyles.row, { backgroundColor: colors.surface, borderBottomColor: colors.outlineVariant }]}>
      {/* Número de fila */}
      <View style={[listRowStyles.indexCell, { backgroundColor: colors.primaryContainer }]}>
        <Text variant="labelSmall" style={{ color: colors.onPrimaryContainer, fontVariant: ['tabular-nums'], fontWeight: '700' }}>
          {index + 1}
        </Text>
      </View>

      {/* Datos principales */}
      <View style={listRowStyles.dataCell}>
        <View style={listRowStyles.dataTop}>
          {record.cuenta ? (
            <Text variant="labelMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
              {record.cuenta}
            </Text>
          ) : null}
          {record.fieldId ? (
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
              · ID {record.fieldId}
            </Text>
          ) : null}
        </View>

        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
          {record.coordinates.latitude.toFixed(6)}, {record.coordinates.longitude.toFixed(6)}
        </Text>

        <View style={listRowStyles.chipsRow}>
          {record.structureType ? (
            <Chip compact style={listRowStyles.miniChip} textStyle={listRowStyles.miniChipText}>
              {record.structureType}
            </Chip>
          ) : null}
          {record.status ? (
            <Chip
              compact
              style={[listRowStyles.miniChip, { backgroundColor: colors.primaryContainer }]}
              textStyle={[listRowStyles.miniChipText, { color: colors.onPrimaryContainer }]}
            >
              {record.status}
            </Chip>
          ) : null}
          {record.zona ? (
            <Chip
              compact
              style={[listRowStyles.miniChip, { backgroundColor: colors.secondaryContainer }]}
              textStyle={[listRowStyles.miniChipText, { color: colors.onSecondaryContainer }]}
            >
              {record.zona}
            </Chip>
          ) : null}
        </View>

        <Text variant="bodySmall" style={{ color: colors.outline, fontSize: 10, marginTop: 2 }}>
          {record.savedAt}
        </Text>
      </View>

      {/* Acciones */}
      <View style={listRowStyles.actionsCell}>
        <IconButton icon="content-copy" size={17} iconColor={colors.primary} onPress={() => onCopy(record.mapUrl)} style={listRowStyles.miniBtn} />
        <IconButton icon="map-marker-outline" size={17} iconColor={colors.secondary} onPress={() => onOpenMaps(record.mapUrl)} style={listRowStyles.miniBtn} />
        <IconButton icon="pencil-outline" size={17} iconColor={colors.onSurfaceVariant} onPress={() => onEdit(record)} style={listRowStyles.miniBtn} />
        <IconButton icon="trash-can-outline" size={17} iconColor={colors.error} onPress={() => onDelete(record.id, record.photoUri)} style={listRowStyles.miniBtn} />
      </View>
    </View>
    </TouchableOpacity>
  );
}

const PAGE_SIZE = 10;

// ── Dropdown compacto para filtros ────────────────────────────────────────────
interface FilterDropdownProps {
  label: string;
  value: string | null;
  options: string[];
  colors: AppColors;
  onSelect: (v: string | null) => void;
}

function FilterDropdown({ label, value, options, colors, onSelect }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const active = value !== null;

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.75}
          style={[
            filterDropStyles.btn,
            { borderColor: active ? colors.primary : colors.outline },
            active && { backgroundColor: colors.primary },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[filterDropStyles.btnText, { color: active ? colors.onPrimary : colors.onSurfaceVariant }]}
          >
            {value ?? label}
          </Text>
          <Text style={{ color: active ? colors.onPrimary : colors.onSurfaceVariant, fontSize: 10, marginLeft: 2 }}>
            ▾
          </Text>
        </TouchableOpacity>
      }
    >
      <Menu.Item
        title={`Todos`}
        leadingIcon={value === null ? 'check' : undefined}
        onPress={() => { onSelect(null); setOpen(false); }}
      />
      {options.map((opt) => (
        <Menu.Item
          key={opt}
          title={opt}
          leadingIcon={value === opt ? 'check' : undefined}
          onPress={() => { onSelect(opt); setOpen(false); }}
        />
      ))}
    </Menu>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function RecordListScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  const [records, setRecords] = useState<GeoRecord[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<GeoRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [detailRecord, setDetailRecord] = useState<GeoRecord | null>(null);
  const [filterZona, setFilterZona]           = useState<string | null>(null);
  const [filterStatus, setFilterStatus]       = useState<string | null>(null);
  const [filterStructure, setFilterStructure] = useState<string | null>(null);
  const [currentPage, setCurrentPage]         = useState(0);

  const availableZones      = [...new Set(records.map((r) => r.zona).filter(Boolean))]          as string[];
  const availableStatuses   = [...new Set(records.map((r) => r.status).filter(Boolean))]        as string[];
  const availableStructures = [...new Set(records.map((r) => r.structureType).filter(Boolean))] as string[];

  const filteredRecords = records.filter((r) => {
    if (filterZona      && r.zona          !== filterZona)      return false;
    if (filterStatus    && r.status        !== filterStatus)    return false;
    if (filterStructure && r.structureType !== filterStructure) return false;
    return true;
  });

  const activeFilters = [filterZona, filterStatus, filterStructure].filter(Boolean).length;
  const totalPages    = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords  = filteredRecords.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const clearFilters = () => { setFilterZona(null); setFilterStatus(null); setFilterStructure(null); };

  // Resetear página al cambiar cualquier filtro
  React.useEffect(() => { setCurrentPage(0); }, [filterZona, filterStatus, filterStructure]);

  const loadRecords = useCallback(async () => {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    if (!raw) { setRecords([]); return; }
    const parsed: GeoRecord[] = JSON.parse(raw);
    const migrated = parsed.map((r) =>
      r.status === 'Sin Proceso' ? { ...r, status: 'En Proceso' } : r
    );
    const changed = migrated.some((r, i) => r.status !== parsed[i].status);
    if (changed) await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(migrated));
    setRecords(migrated);
  }, []);

  // Recarga cada vez que este tab queda activo
  const activeTabIndex = useTabIndex();
  React.useEffect(() => {
    if (activeTabIndex === MY_TAB_INDEX) loadRecords();
  }, [activeTabIndex, loadRecords]);

  const handleDelete = (id: string, photoUri: string) => {
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
          const newFiltered = updated.filter((r) => {
            if (filterZona      && r.zona          !== filterZona)      return false;
            if (filterStatus    && r.status        !== filterStatus)    return false;
            if (filterStructure && r.structureType !== filterStructure) return false;
            return true;
          });
          const maxPage = Math.max(0, Math.ceil(newFiltered.length / PAGE_SIZE) - 1);
          setCurrentPage((p) => Math.min(p, maxPage));
        },
      },
    ]);
  };

  const handleCopy = async (mapUrl: string) => {
    await Clipboard.setStringAsync(mapUrl);
    Alert.alert('Copiado', 'Enlace copiado al portapapeles.');
  };

  const handleOpenMaps = (mapUrl: string) => {
    Linking.openURL(mapUrl);
  };

  const handleSaveEdit = async (updatedFields: EditableFields) => {
    const updated = records.map((r) =>
      r.id === editingRecord!.id ? { ...r, ...updatedFields } : r
    );
    setRecords(updated);
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
    setEditingRecord(null);
  };

  const handleTakePhoto = async (recordId: string) => {
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

  // Diálogo compartido para "agregar" o "reemplazar" tras cualquier tipo de importación
  const confirmAndSave = (items: GeoRecord[], photoCount: number, format: string) => {
    const photoInfo = photoCount > 0 ? ` y ${photoCount} foto${photoCount !== 1 ? 's' : ''}` : '';
    Alert.alert(
      `Importar ${format}`,
      `Se encontraron ${items.length} registro${items.length !== 1 ? 's' : ''}${photoInfo}.\n\n¿Cómo deseas importarlos?`,
      [
        {
          text: 'Agregar a los existentes',
          onPress: async () => {
            const raw = await AsyncStorage.getItem(RECORDS_KEY);
            const existing: GeoRecord[] = raw ? JSON.parse(raw) : [];
            const merged = [...items, ...existing];
            await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(merged));
            setRecords(merged);
            Alert.alert('Importación exitosa', `${items.length} registro${items.length !== 1 ? 's' : ''}${photoInfo} agregado${items.length !== 1 ? 's' : ''} correctamente.`);
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
                    Alert.alert('Importación exitosa', `Registros reemplazados. ${items.length} importado${items.length !== 1 ? 's' : ''}${photoInfo}.`);
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
  };

  const doImportFromCSV = async (uri: string) => {
    const response = await fetch(uri);
    const content = await response.text();
    const items = csvToRecords(content);
    if (items.length === 0) {
      Alert.alert('Sin registros válidos', 'El archivo no contiene registros válidos o no tiene el formato correcto.', [{ text: 'Entendido' }]);
      return;
    }
    confirmAndSave(items, 0, 'CSV');
  };

  const doImportFromZIP = async (uri: string) => {
    const zipB64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(zipB64, { base64: true });

    const csvFile = zip.file('registros.csv');
    if (!csvFile) {
      Alert.alert('Formato inválido', 'El ZIP no contiene el archivo registros.csv. Asegúrate de usar un ZIP exportado desde la app.');
      return;
    }

    const csvText = await csvFile.async('string');
    const parsed = parseCSVWithPhotoFiles(csvText);

    if (parsed.length === 0) {
      Alert.alert('Sin registros válidos', 'El CSV dentro del ZIP no contiene registros válidos.', [{ text: 'Entendido' }]);
      return;
    }

    // Extraer y guardar fotos en el almacenamiento de la app
    let savedPhotos = 0;
    for (const { record, photoFile } of parsed) {
      if (!photoFile) continue;
      const zipEntry = zip.file(`fotos/${photoFile}`);
      if (!zipEntry) continue;
      try {
        const photoB64 = await zipEntry.async('base64');
        const localUri = `${FileSystem.documentDirectory}${photoFile}`;
        await FileSystem.writeAsStringAsync(localUri, photoB64, { encoding: FileSystem.EncodingType.Base64 });
        record.photoUri = localUri;
        savedPhotos++;
      } catch {}
    }

    confirmAndSave(parsed.map((p) => p.record), savedPhotos, 'ZIP');
  };

  const handleImportCSV = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const name = (asset.name ?? '').toLowerCase();

      if (name.endsWith('.zip')) {
        await doImportFromZIP(asset.uri);
      } else {
        await doImportFromCSV(asset.uri);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error al importar', `${msg}\n\nAsegúrate de que el archivo sea un CSV o ZIP válido exportado desde la app.`);
    } finally {
      setImporting(false);
    }
  };

  const doExportCSV = async () => {
    setExporting(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const fileUri = `${FileSystem.cacheDirectory}geoideaplus-${dateStamp}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, buildCSV(records), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar registros CSV',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e) {
      Alert.alert('Error al exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const doExportZIP = async () => {
    setExporting(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}-${pad(now.getMinutes())}`;

      // Calcular nombres de foto primero para usarlos en el CSV y en los archivos
      const photoFiles: string[] = records.map((r, i) => {
        if (!r.photoUri) return '';
        const idx = String(i + 1).padStart(3, '0');
        const label = r.cuenta ? `_${r.cuenta}` : r.fieldId ? `_${r.fieldId}` : '';
        return `registro_${idx}${label}.jpg`;
      });

      const zip = new JSZip();
      zip.file('registros.csv', buildCSV(records, photoFiles));

      const fotos = zip.folder('fotos');
      let photoCount = 0;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r.photoUri || !photoFiles[i]) continue;
        try {
          const b64 = await FileSystem.readAsStringAsync(r.photoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fotos?.file(photoFiles[i], b64, { base64: true });
          photoCount++;
        } catch {}
      }

      const zipB64 = await zip.generateAsync({ type: 'base64' });
      const fileUri = `${FileSystem.cacheDirectory}geoideaplus-${dateStamp}.zip`;
      await FileSystem.writeAsStringAsync(fileUri, zipB64, { encoding: FileSystem.EncodingType.Base64 });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/zip',
        dialogTitle: `Exportar ZIP (${photoCount} foto${photoCount !== 1 ? 's' : ''})`,
        UTI: 'public.zip-archive',
      });
    } catch (e) {
      Alert.alert('Error al exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) return;
    const hasPhotos = records.some((r) => r.photoUri);
    if (!hasPhotos) {
      doExportCSV();
      return;
    }
    Alert.alert(
      'Exportar registros',
      '¿Qué formato deseas exportar?',
      [
        {
          text: 'Solo CSV',
          onPress: doExportCSV,
        },
        {
          text: 'CSV + Fotos (ZIP)',
          onPress: doExportZIP,
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  };

  const handleExportPDF = async () => {
    if (records.length === 0) return;
    setPdfExporting(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fechaReporte =
        `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      // Leer fotos y construir tarjetas
      const cards = await Promise.all(
        records.map(async (r, i) => {
          let photoB64: string | null = null;
          if (r.photoUri) {
            try {
              photoB64 = await FileSystem.readAsStringAsync(r.photoUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
            } catch {}
          }
          return buildRecordCardHTML({ record: r, photoB64, index: i, total: records.length });
        })
      );

      const html = buildPDFHTML(cards, fechaReporte);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const dateStamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const destUri = `${FileSystem.cacheDirectory}geoideaplus-reporte-${dateStamp}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: destUri });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'Tu dispositivo no soporta compartir archivos.');
        return;
      }
      await Sharing.shareAsync(destUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar reporte PDF',
        UTI: 'com.adobe.pdf',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error al generar PDF', msg);
    } finally {
      setPdfExporting(false);
    }
  };

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{activeFilters > 0 ? '🔍' : '🗂️'}</Text>
      <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: '700' }}>
        {activeFilters > 0 ? 'Sin resultados' : 'Sin Registros'}
      </Text>
      <Text variant="bodyMedium" style={[styles.emptyText, { color: colors.outline }]}>
        {activeFilters > 0
          ? 'Ningún registro coincide con los filtros seleccionados.'
          : 'Ve a la pestaña CAPTURA para guardar tu primera ubicación con foto.'}
      </Text>
      {activeFilters > 0 && (
        <Button mode="outlined" onPress={clearFilters} style={{ marginTop: 12 }}>
          Quitar filtros
        </Button>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Cabecera fija ── */}
      <View style={[styles.screenHeader, { borderBottomColor: colors.outlineVariant }]}>

        {/* Fila 1: contador + botones CSV */}
        <View style={styles.headerRow1}>
          {records.length > 0 && (
            <RNText style={[styles.pageTitle, { color: colors.primary }]}>
              {activeFilters > 0
                ? `${filteredRecords.length} / ${records.length} Registros`
                : `${records.length} ${records.length === 1 ? 'Registro' : 'Registros'}`}
            </RNText>
          )}
          <View style={styles.csvActions}>
            {isTablet ? (
              /* ── Tablet: botones con icono + texto ── */
              <>
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
                  <Pressable onPress={() => Alert.alert('Sin registros', 'No se pueden exportar registros porque no hay ninguno.')}>
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
                {records.length === 0 ? (
                  <Pressable onPress={() => Alert.alert('Sin registros', 'No hay registros para generar el reporte PDF.')}>
                    <Button
                      mode="contained-tonal"
                      icon="file-pdf-box"
                      contentStyle={styles.csvBtnContent}
                      labelStyle={[styles.csvBtnLabel, { color: '#B71C1C' }]}
                      style={[styles.csvBtnSmall, { backgroundColor: '#FFEBEE' }]}
                      disabled
                    >
                      PDF
                    </Button>
                  </Pressable>
                ) : (
                  <Button
                    mode="contained-tonal"
                    icon="file-pdf-box"
                    contentStyle={styles.csvBtnContent}
                    labelStyle={[styles.csvBtnLabel, { color: '#B71C1C' }]}
                    style={[styles.csvBtnSmall, { backgroundColor: '#FFEBEE' }]}
                    loading={pdfExporting}
                    disabled={pdfExporting}
                    onPress={handleExportPDF}
                  >
                    PDF
                  </Button>
                )}
              </>
            ) : (
              /* ── Móvil: solo iconos ── */
              <>
                <IconButton
                  icon="arrow-down-circle-outline"
                  size={22}
                  mode="outlined"
                  iconColor={colors.primary}
                  loading={importing}
                  disabled={importing}
                  onPress={handleImportCSV}
                  style={styles.headerIconBtn}
                />
                <IconButton
                  icon="arrow-up-circle-outline"
                  size={22}
                  mode="contained-tonal"
                  iconColor={records.length === 0 ? colors.outlineVariant : colors.primary}
                  loading={exporting}
                  disabled={exporting || records.length === 0}
                  onPress={records.length === 0
                    ? () => Alert.alert('Sin registros', 'No se pueden exportar registros porque no hay ninguno.')
                    : handleExportCSV}
                  style={styles.headerIconBtn}
                />
                <IconButton
                  icon="file-pdf-box"
                  size={22}
                  mode="contained-tonal"
                  iconColor={records.length === 0 ? colors.outlineVariant : '#B71C1C'}
                  loading={pdfExporting}
                  disabled={pdfExporting || records.length === 0}
                  onPress={records.length === 0
                    ? () => Alert.alert('Sin registros', 'No hay registros para generar el reporte PDF.')
                    : handleExportPDF}
                  style={[styles.headerIconBtn, records.length > 0 && { backgroundColor: '#FFEBEE' }]}
                />
              </>
            )}
          </View>
        </View>

        {/* Fila 2: filtros + toggle vistas */}
        {records.length > 0 && (
          <View style={styles.headerRow2}>
            <View style={styles.filterBar}>
              <FilterDropdown
                label="Zona"
                value={filterZona}
                options={availableZones}
                colors={colors}
                onSelect={setFilterZona}
              />
              <FilterDropdown
                label="Estatus"
                value={filterStatus}
                options={availableStatuses}
                colors={colors}
                onSelect={setFilterStatus}
              />
              <FilterDropdown
                label="Tipo"
                value={filterStructure}
                options={availableStructures}
                colors={colors}
                onSelect={setFilterStructure}
              />
              {activeFilters > 0 && (
                <TouchableOpacity onPress={clearFilters} style={[filterDropStyles.clearBtn, { borderColor: colors.error }]}>
                  <Text style={[filterDropStyles.btnText, { color: colors.error }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Toggle cards / lista */}
            <View style={[styles.viewToggle, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'cards' && { backgroundColor: colors.primary }]}
                onPress={() => setViewMode('cards')}
                activeOpacity={0.8}
              >
                <IconButton
                  icon="view-grid"
                  size={18}
                  iconColor={viewMode === 'cards' ? colors.onPrimary : colors.onSurfaceVariant}
                  style={styles.toggleIcon}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.8}
              >
                <IconButton
                  icon="format-list-bulleted"
                  size={18}
                  iconColor={viewMode === 'list' ? colors.onPrimary : colors.onSurfaceVariant}
                  style={styles.toggleIcon}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Cabecera de columnas para vista lista */}
      {viewMode === 'list' && records.length > 0 && (
        <View style={[styles.listHeader, { backgroundColor: colors.surfaceVariant, borderBottomColor: colors.outlineVariant }]}>
          <View style={styles.listHeaderIndex}>
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, fontWeight: '700' }}>#</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Cuenta / Coordenadas / Estatus
            </Text>
          </View>
          <View style={styles.listHeaderActions}>
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Acc.
            </Text>
          </View>
        </View>
      )}

      <FlatList
        key={viewMode === 'cards' && isTablet ? 'cards-2col' : 'cards-1col'}
        data={pagedRecords}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'cards' && isTablet ? 2 : 1}
        columnWrapperStyle={viewMode === 'cards' && isTablet ? styles.cardRow : undefined}
        renderItem={({ item, index }) =>
          viewMode === 'cards' ? (
            <View style={isTablet ? styles.cardCol : styles.cardColFull}>
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
            </View>
          ) : (
            <RecordListRow
              record={item}
              index={currentPage * PAGE_SIZE + index}
              colors={colors}
              onDelete={handleDelete}
              onCopy={handleCopy}
              onOpenMaps={handleOpenMaps}
              onEdit={setEditingRecord}
              onPress={setDetailRecord}
            />
          )
        }
        ListEmptyComponent={<ListEmpty />}
        ListFooterComponent={
          filteredRecords.length > PAGE_SIZE ? (
            <View style={[styles.pagination, { borderTopColor: colors.outlineVariant }]}>
              <IconButton
                icon="chevron-left"
                size={22}
                disabled={currentPage === 0}
                iconColor={currentPage === 0 ? colors.outlineVariant : colors.primary}
                onPress={() => setCurrentPage((p) => Math.max(0, p - 1))}
              />
              <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                Página {currentPage + 1} de {totalPages}
              </Text>
              <IconButton
                icon="chevron-right"
                size={22}
                disabled={currentPage >= totalPages - 1}
                iconColor={currentPage >= totalPages - 1 ? colors.outlineVariant : colors.primary}
                onPress={() => setCurrentPage((p) => Math.min(p + 1, totalPages - 1))}
              />
            </View>
          ) : null
        }
        contentContainerStyle={viewMode === 'cards' ? styles.list : styles.listFlat}
        showsVerticalScrollIndicator={false}
      />

      {viewerUri && (
        <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
      )}

      {detailRecord && (
        <RecordDetailModal
          key={detailRecord.id}
          record={detailRecord}
          colors={colors}
          onClose={() => setDetailRecord(null)}
          onEdit={(r) => { setDetailRecord(null); setEditingRecord(r); }}
          onDelete={(id, uri) => { setDetailRecord(null); handleDelete(id, uri); }}
          onCopy={handleCopy}
          onOpenMaps={handleOpenMaps}
          onPhotoPress={setViewerUri}
          onTakePhoto={handleTakePhoto}
        />
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  csvActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  csvBtnSmall: {
    borderRadius: 8,
  },
  headerIconBtn: {
    margin: 0,
    width: 36,
    height: 36,
    borderRadius: 10,
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
  listFlat: {
    paddingTop: 0,
    paddingBottom: 40,
    flexGrow: 1,
  },
  cardRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cardCol: {
    flex: 1,
    marginBottom: 12,
  },
  cardColFull: {
    flex: 1,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  toggleBtn: {
    width: 36,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleIcon: {
    margin: 0,
    width: 36,
    height: 32,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listHeaderIndex: {
    width: 32,
    alignItems: 'center',
    marginRight: 8,
  },
  listHeaderActions: {
    width: 88,
    alignItems: 'center',
  },
});

// ── Estilos del dropdown de filtros ──────────────────────────────────────────
const filterDropStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 120,
  },
  clearBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
});

// ── Estilos del modal de detalle ──────────────────────────────────────────────
const detailStyles = StyleSheet.create({
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  photoHint: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
});

// ── Estilos de fila lista ─────────────────────────────────────────────────────
const listRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  indexCell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  dataCell: {
    flex: 1,
    gap: 2,
  },
  dataTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  miniChip: {
    height: 22,
  },
  miniChipText: {
    fontSize: 10,
    marginVertical: 0,
    lineHeight: 13,
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  miniBtn: {
    margin: 0,
    width: 32,
    height: 32,
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
