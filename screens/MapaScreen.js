import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, Text, Card, IconButton, Divider } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTabIndex } from 'react-native-paper-tabs';
import { RECORDS_KEY } from './CapturaScreen';

const MY_TAB_INDEX = 2;

// ── Color de marcador según estatus ───────────────────────────────────────────
const STATUS_COLOR = {
  'Calificada':   '#00796B',
  'Sin Calificar':'#9E9E9E',
  'En Proceso':  '#F59E0B',
};
const DEFAULT_MARKER_COLOR = '#1565C0';

function markerColor(status) {
  return STATUS_COLOR[status] || DEFAULT_MARKER_COLOR;
}

// ── HTML con Leaflet + marcadores coloreados ──────────────────────────────────
function buildLeafletHTML(records) {
  const markers = records.map((r, i) => ({
    id:      r.id || String(i),
    lat:     r.coordinates?.latitude  ?? 0,
    lon:     r.coordinates?.longitude ?? 0,
    color:   markerColor(r.status),
    title:   r.cuenta || r.fieldId || `Registro ${i + 1}`,
    status:  r.status        || '',
    type:    r.structureType || '',
    tech:    r.technology    || '',
    faces:   r.faces         || '',
    lat6:    (r.coordinates?.latitude  ?? 0).toFixed(6),
    lon6:    (r.coordinates?.longitude ?? 0).toFixed(6),
    savedAt: r.savedAt       || '',
    area:    r.area          || '',
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body, html, #map { height:100%; width:100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const records = ${JSON.stringify(markers)};
    const map = L.map('map', { zoomControl:true, attributionControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    records.forEach(function(r) {
      var m = L.circleMarker([r.lat, r.lon], {
        radius: 11, fillColor: r.color, color: '#fff',
        weight: 2.5, opacity: 1, fillOpacity: 0.9,
      }).addTo(map);
      m.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(r));
        }
      });
    });

    if (records.length === 0) {
      map.setView([13.344477, -88.439514], 18);
    } else if (records.length === 1) {
      map.setView([records[0].lat, records[0].lon], 16);
    } else {
      var lats = records.map(function(r){ return r.lat; });
      var lons = records.map(function(r){ return r.lon; });
      map.fitBounds([
        [Math.min.apply(null,lats), Math.min.apply(null,lons)],
        [Math.max.apply(null,lats), Math.max.apply(null,lons)],
      ], { padding: [32, 32] });
    }
  </script>
</body>
</html>`;
}

// ── Tarjeta de detalle al seleccionar un marcador ─────────────────────────────
function DetailCard({ item, onClose, colors }) {
  return (
    <Card style={[styles.detailCard, { backgroundColor: colors.surface }]} elevation={4}>
      <Card.Content style={{ paddingBottom: 8 }}>
        <View style={styles.detailHeader}>
          <Text variant="titleSmall" style={{ color: colors.primary, fontWeight: '700', flex: 1 }}>
            {item.title}
          </Text>
          <IconButton icon="close" size={18} onPress={onClose} iconColor={colors.onSurfaceVariant} style={{ margin: 0 }} />
        </View>

        <View style={styles.detailCoords}>
          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, fontFamily: 'monospace' }}>
            {item.lat6},  {item.lon6}
          </Text>
        </View>

        <Divider style={{ marginVertical: 8 }} />

        {item.type   ? <DetailRow label="Tipo"       value={item.type}   colors={colors} /> : null}
        {item.tech   ? <DetailRow label="Tecnología" value={item.tech}   colors={colors} /> : null}
        {item.faces  ? <DetailRow label="Caras"      value={item.faces}  colors={colors} /> : null}
        {item.area   ? <DetailRow label="Área"       value={item.area + ' m²'} colors={colors} /> : null}
        {item.status ? (
          <View style={[styles.statusChip, { backgroundColor: markerColor(item.status) + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: markerColor(item.status) }]} />
            <Text variant="labelSmall" style={{ color: markerColor(item.status), fontWeight: '700' }}>
              {item.status}
            </Text>
          </View>
        ) : null}

        {item.savedAt ? (
          <Text variant="labelSmall" style={{ color: colors.outline, marginTop: 6, textAlign: 'right' }}>
            {item.savedAt}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function DetailRow({ label, value, colors }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text variant="bodySmall" style={{ color: colors.onSurface, fontWeight: '600' }}>
        {value}
      </Text>
    </View>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function MapaScreen() {
  const { colors } = useTheme();
  const [records, setRecords]   = useState([]);
  const [html, setHtml]         = useState('');
  const [selected, setSelected] = useState(null);

  const loadRecords = useCallback(async () => {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    setRecords(data);
    setSelected(null);
    setHtml(buildLeafletHTML(data));
  }, []);

  const activeTabIndex = useTabIndex();
  React.useEffect(() => {
    if (activeTabIndex === MY_TAB_INDEX) loadRecords();
  }, [activeTabIndex, loadRecords]);

  function handleMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setSelected(data);
    } catch {}
  }

  return (
    <View style={styles.root}>
      {/* Mapa */}
      {html ? (
        <WebView
          source={{ html }}
          style={styles.map}
          onMessage={handleMessage}
          onTouchStart={() => selected && setSelected(null)}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      ) : null}

      {/* Badge contador */}
      {records.length > 0 && (
        <View style={[styles.countBadge, { backgroundColor: colors.surface }]}>
          <Text variant="labelSmall" style={{ color: colors.primary, fontWeight: '700' }}>
            📍 {records.length} {records.length === 1 ? 'registro' : 'registros'}
          </Text>
        </View>
      )}

      {/* Leyenda */}
      <View style={[styles.legend, { backgroundColor: colors.surface }]}>
        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text variant="labelSmall" style={{ color: colors.onSurface }}>{label}</Text>
          </View>
        ))}
      </View>


      {/* Tarjeta de detalle */}
      {selected && (
        <DetailCard item={selected} onClose={() => setSelected(null)} colors={colors} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  countBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  detailCoords: {
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
