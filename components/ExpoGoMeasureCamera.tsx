import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  PanResponder,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import { Text, Button, useTheme, ActivityIndicator, IconButton } from 'react-native-paper';

/**
 * ExpoGoMeasureCamera
 * ───────────────────
 * Medición trigonométrica de carteles publicitarios usando solo APIs
 * compatibles con Expo Go (Managed Workflow, sin AR nativo):
 *
 *   • expo-camera   → vista en vivo + captura de foto
 *   • expo-sensors  → DeviceMotion (pitch del teléfono en tiempo real)
 *
 * Modelo geométrico (vista lateral):
 *
 *        ▲ tope del cartel
 *        │
 *        │  H = D·(tan αB − tan αA)
 *        │
 *        ▼ base del cartel
 *       /
 *      / αB (ángulo al tope)
 *  📱 ──────── horizontal (altura de ojos)
 *      \ αA (ángulo a la base)
 *       D = distancia horizontal al cartel
 *
 * El ancho se deduce proporcionalmente sobre la foto: el usuario encuadra
 * el cartel con 4 guías; W = H · (anchoPx / altoPx).
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type MeasureResult = {
  /** Ancho del cartel en metros */
  width: number;
  /** Alto del cartel en metros */
  height: number;
  /** Área en m² */
  area: number;
  /** Distancia horizontal usada (m) */
  distance: number;
  /** URI local de la foto capturada */
  photoUri: string;
};

type Props = {
  onConfirm: (result: MeasureResult) => void;
  onCancel: () => void;
  /** Distancia sugerida por defecto (m) */
  defaultDistance?: string;
};

type Phase = 'permission' | 'distance' | 'base' | 'top' | 'width';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RAD2DEG = 180 / Math.PI;
/** Límite de seguridad: tan() explota cerca de ±90° */
const MAX_ANGLE_RAD = (80 * Math.PI) / 180;

// ── Guía arrastrable (línea + tirador) ───────────────────────────────────────

type GuideProps = {
  axis: 'x' | 'y';
  position: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  color: string;
};

function DraggableGuide({ axis, position, min, max, onChange, color }: GuideProps) {
  // Refs para que el PanResponder (creado una sola vez) lea valores frescos
  const posRef = useRef(position);
  posRef.current = position;
  const startRef = useRef(0);
  const boundsRef = useRef({ min, max });
  boundsRef.current = { min, max };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = posRef.current;
        },
        onPanResponderMove: (_evt, gesture) => {
          const delta = axis === 'x' ? gesture.dx : gesture.dy;
          const next = Math.min(
            boundsRef.current.max,
            Math.max(boundsRef.current.min, startRef.current + delta),
          );
          onChangeRef.current(next);
        },
      }),
    [axis],
  );

  const isVertical = axis === 'x'; // guía que se mueve en X es una línea vertical
  return (
    <View
      pointerEvents="box-only"
      {...responder.panHandlers}
      style={[
        styles.guideTouchArea,
        isVertical
          ? { left: position - 22, top: 0, bottom: 0, width: 44 }
          : { top: position - 22, left: 0, right: 0, height: 44 },
      ]}
    >
      <View
        style={[
          isVertical ? styles.guideLineVertical : styles.guideLineHorizontal,
          { backgroundColor: color },
        ]}
      />
      <View style={[styles.guideHandle, { borderColor: color }]} />
    </View>
  );
}

// ── Retícula central ─────────────────────────────────────────────────────────

function Reticle({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.reticleContainer}>
      <View style={[styles.reticleLineH, { backgroundColor: color }]} />
      <View style={[styles.reticleLineV, { backgroundColor: color }]} />
      <View style={[styles.reticleCircle, { borderColor: color }]} />
    </View>
  );
}

// ── Chips de pasos ───────────────────────────────────────────────────────────

const STEP_LABELS: { key: Phase; label: string }[] = [
  { key: 'distance', label: '1 · Distancia' },
  { key: 'base', label: '2 · Base' },
  { key: 'top', label: '3 · Altura' },
  { key: 'width', label: '4 · Ancho' },
];

function StepChips({ phase, colors }: { phase: Phase; colors: any }) {
  return (
    <View style={styles.stepRow}>
      {STEP_LABELS.map(({ key, label }) => {
        const active = key === phase;
        return (
          <View
            key={key}
            style={[
              styles.stepChip,
              {
                backgroundColor: active ? colors.primary : 'rgba(0,0,0,0.45)',
              },
            ]}
          >
            <Text
              style={{
                color: active ? colors.onPrimary : 'rgba(255,255,255,0.8)',
                fontSize: 11,
                fontWeight: active ? '700' : '500',
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function ExpoGoMeasureCamera({ onConfirm, onCancel, defaultDistance = '' }: Props) {
  const { colors } = useTheme();
  const cameraRef = useRef<CameraView>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('permission');
  const [motionAvailable, setMotionAvailable] = useState(true);

  // Ángulo de elevación (radianes) — ref para lecturas instantáneas sin re-render
  const pitchRef = useRef(0);
  const calibOffsetRef = useRef(0);
  const [pitchDeg, setPitchDeg] = useState(0);

  // Datos de la medición
  const [distanceText, setDistanceText] = useState(defaultDistance);
  const [angleBase, setAngleBase] = useState<number | null>(null); // αA (rad)
  const [angleTop, setAngleTop] = useState<number | null>(null); // αB (rad)
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);

  // Guías del recuadro sobre la foto (posiciones en px de pantalla)
  const [guideLeft, setGuideLeft] = useState(SCREEN_W * 0.2);
  const [guideRight, setGuideRight] = useState(SCREEN_W * 0.8);
  const [guideTop, setGuideTop] = useState(SCREEN_H * 0.25);
  const [guideBottom, setGuideBottom] = useState(SCREEN_H * 0.55);

  const distance = parseFloat(distanceText.replace(',', '.'));
  const distanceValid = !isNaN(distance) && distance > 0;

  // ── Sensores: pitch en tiempo real ────────────────────────────────────────
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      const available = await DeviceMotion.isAvailableAsync();
      if (!available) {
        setMotionAvailable(false);
        return;
      }
      DeviceMotion.setUpdateInterval(60);
      sub = DeviceMotion.addListener((m) => {
        const beta = m.rotation?.beta;
        if (beta == null) return;
        // beta = 0 con el teléfono plano; π/2 en vertical (retrato).
        // Elevación de la cámara trasera sobre la horizontal:
        const elevation = beta - Math.PI / 2 - calibOffsetRef.current;
        // Filtro paso-bajo para estabilizar la lectura
        pitchRef.current = pitchRef.current + 0.18 * (elevation - pitchRef.current);
        setPitchDeg(pitchRef.current * RAD2DEG);
      });
    })();
    return () => sub?.remove();
  }, []);

  // ── Permisos de cámara ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!camPermission) return;
      if (camPermission.granted) {
        setPhase((p) => (p === 'permission' ? 'distance' : p));
      } else if (camPermission.canAskAgain) {
        await requestCamPermission();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camPermission?.granted]);

  // ── Cálculos ──────────────────────────────────────────────────────────────

  /** H = D · (tan αB − tan αA) */
  const computedHeight = useMemo(() => {
    if (!distanceValid || angleBase === null || angleTop === null) return null;
    const h = distance * (Math.tan(angleTop) - Math.tan(angleBase));
    return h > 0 ? h : null;
  }, [distanceValid, distance, angleBase, angleTop]);

  /** W = H · (anchoPx / altoPx) del recuadro sobre la foto */
  const computedWidth = useMemo(() => {
    if (computedHeight === null) return null;
    const pxW = guideRight - guideLeft;
    const pxH = guideBottom - guideTop;
    if (pxW <= 4 || pxH <= 4) return null;
    return computedHeight * (pxW / pxH);
  }, [computedHeight, guideLeft, guideRight, guideTop, guideBottom]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const calibrateHorizon = () => {
    // El usuario apunta al horizonte y fijamos ese pitch como 0°
    calibOffsetRef.current += pitchRef.current;
    pitchRef.current = 0;
    setPitchDeg(0);
  };

  const angleTooSteep = Math.abs(pitchRef.current) > MAX_ANGLE_RAD;

  const fixBase = () => {
    if (angleTooSteep) return;
    setAngleBase(pitchRef.current);
    setPhase('top');
  };

  const fixTop = async () => {
    if (angleTooSteep) return;
    const captured = pitchRef.current;
    if (angleBase !== null && captured <= angleBase) {
      // El tope debe estar por encima de la base
      return;
    }
    setAngleTop(captured);
    setTakingPhoto(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhase('width');
      }
    } finally {
      setTakingPhoto(false);
    }
  };

  const restart = () => {
    setAngleBase(null);
    setAngleTop(null);
    setPhotoUri(null);
    setGuideLeft(SCREEN_W * 0.2);
    setGuideRight(SCREEN_W * 0.8);
    setGuideTop(SCREEN_H * 0.25);
    setGuideBottom(SCREEN_H * 0.55);
    setPhase('distance');
  };

  const confirm = () => {
    if (computedWidth === null || computedHeight === null || !photoUri) return;
    onConfirm({
      width: Math.round(computedWidth * 100) / 100,
      height: Math.round(computedHeight * 100) / 100,
      area: Math.round(computedWidth * computedHeight * 100) / 100,
      distance,
      photoUri,
    });
  };

  // ── Render: permisos ──────────────────────────────────────────────────────

  if (!camPermission || (!camPermission.granted && camPermission.canAskAgain)) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 12 }}>
          Solicitando permiso de cámara…
        </Text>
      </View>
    );
  }

  if (!camPermission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 8 }}>
          Sin acceso a la cámara
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 }}>
          Habilita el permiso de cámara en los ajustes del sistema para poder medir.
        </Text>
        <Button mode="outlined" onPress={onCancel}>
          Volver
        </Button>
      </View>
    );
  }

  if (!motionAvailable) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 8 }}>
          Sensores no disponibles
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 }}>
          Este dispositivo no expone DeviceMotion, necesario para medir ángulos.
        </Text>
        <Button mode="outlined" onPress={onCancel}>
          Volver
        </Button>
      </View>
    );
  }

  // ── Render: fase de ancho (foto + guías) ──────────────────────────────────

  if (phase === 'width' && photoUri) {
    const guideColor = '#FFD54F';
    return (
      <View style={styles.flex}>
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

        {/* Sombreado fuera del recuadro */}
        <View pointerEvents="none" style={[styles.shade, { top: 0, height: guideTop }]} />
        <View pointerEvents="none" style={[styles.shade, { top: guideBottom, bottom: 0 }]} />
        <View
          pointerEvents="none"
          style={[styles.shade, { top: guideTop, height: guideBottom - guideTop, left: 0, width: guideLeft }]}
        />
        <View
          pointerEvents="none"
          style={[styles.shade, { top: guideTop, height: guideBottom - guideTop, left: guideRight, right: 0 }]}
        />

        {/* Guías arrastrables */}
        <DraggableGuide axis="x" position={guideLeft} min={8} max={guideRight - 24} onChange={setGuideLeft} color={guideColor} />
        <DraggableGuide axis="x" position={guideRight} min={guideLeft + 24} max={SCREEN_W - 8} onChange={setGuideRight} color={guideColor} />
        <DraggableGuide axis="y" position={guideTop} min={90} max={guideBottom - 24} onChange={setGuideTop} color={guideColor} />
        <DraggableGuide axis="y" position={guideBottom} min={guideTop + 24} max={SCREEN_H - 190} onChange={setGuideBottom} color={guideColor} />

        <View style={styles.topBar}>
          <StepChips phase={phase} colors={colors} />
          <Text style={styles.hint}>
            Ajusta las 4 guías para encuadrar exactamente el cartel en la foto.
          </Text>
        </View>

        {/* Panel de resultados */}
        <View style={[styles.bottomPanel, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
          <View style={styles.resultsRow}>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>ANCHO</Text>
              <Text style={styles.resultValue}>
                {computedWidth !== null ? `${computedWidth.toFixed(2)} m` : '—'}
              </Text>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>ALTO</Text>
              <Text style={styles.resultValue}>
                {computedHeight !== null ? `${computedHeight.toFixed(2)} m` : '—'}
              </Text>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>ÁREA</Text>
              <Text style={styles.resultValue}>
                {computedWidth !== null && computedHeight !== null
                  ? `${(computedWidth * computedHeight).toFixed(2)} m²`
                  : '—'}
              </Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <Button mode="outlined" textColor="#FFF" style={styles.actionBtn} onPress={restart}>
              Repetir
            </Button>
            <Button
              mode="contained"
              style={styles.actionBtn}
              onPress={confirm}
              disabled={computedWidth === null}
            >
              Confirmar medidas
            </Button>
          </View>
        </View>

        <IconButton
          icon="close"
          iconColor="#FFF"
          style={styles.closeBtn}
          onPress={onCancel}
        />
      </View>
    );
  }

  // ── Render: cámara en vivo (fases distance / base / top) ─────────────────

  const instruction =
    phase === 'distance'
      ? 'Párate frente al cartel e ingresa la distancia horizontal hasta él.'
      : phase === 'base'
        ? 'Apunta la retícula a la BASE del cartel y presiona «Fijar Base».'
        : 'Sube el teléfono, apunta la retícula al TOPE del cartel y presiona «Fijar Altura».';

  return (
    <View style={styles.flex}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {(phase === 'base' || phase === 'top') && <Reticle color="#FFD54F" />}

      <View style={styles.topBar}>
        <StepChips phase={phase} colors={colors} />
        <Text style={styles.hint}>{instruction}</Text>
      </View>

      {/* HUD de ángulo */}
      {(phase === 'base' || phase === 'top') && (
        <View style={styles.hud}>
          <Text style={[styles.hudAngle, angleTooSteep && { color: '#FF8A80' }]}>
            {pitchDeg >= 0 ? '+' : ''}
            {pitchDeg.toFixed(1)}°
          </Text>
          <Text style={styles.hudLabel}>
            {angleTooSteep ? 'Ángulo demasiado inclinado — aléjate del cartel' : 'inclinación'}
          </Text>
          {angleBase !== null && (
            <Text style={styles.hudFixed}>Base fijada: {(angleBase * RAD2DEG).toFixed(1)}°</Text>
          )}
        </View>
      )}

      {/* Panel inferior según fase */}
      <View style={[styles.bottomPanel, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
        {phase === 'distance' && (
          <>
            <Text style={styles.panelTitle}>Distancia al cartel (metros)</Text>
            <TextInput
              style={styles.distanceInput}
              placeholder="Ej: 12.5"
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="decimal-pad"
              value={distanceText}
              onChangeText={setDistanceText}
            />
            <Text style={styles.panelNote}>
              Consejo: cuenta pasos (~0.75 m por paso) o usa una referencia conocida.
            </Text>
            <View style={styles.actionRow}>
              <Button mode="outlined" textColor="#FFF" style={styles.actionBtn} onPress={calibrateHorizon}>
                Calibrar horizonte
              </Button>
              <Button
                mode="contained"
                style={styles.actionBtn}
                disabled={!distanceValid}
                onPress={() => setPhase('base')}
              >
                Continuar
              </Button>
            </View>
          </>
        )}

        {phase === 'base' && (
          <View style={styles.actionRow}>
            <Button mode="outlined" textColor="#FFF" style={styles.actionBtn} onPress={() => setPhase('distance')}>
              Atrás
            </Button>
            <Button mode="contained" style={styles.actionBtn} onPress={fixBase} disabled={angleTooSteep}>
              Fijar Base
            </Button>
          </View>
        )}

        {phase === 'top' && (
          <View style={styles.actionRow}>
            <Button
              mode="outlined"
              textColor="#FFF"
              style={styles.actionBtn}
              onPress={() => {
                setAngleBase(null);
                setPhase('base');
              }}
            >
              Repetir base
            </Button>
            <Button
              mode="contained"
              style={styles.actionBtn}
              onPress={fixTop}
              loading={takingPhoto}
              disabled={takingPhoto || angleTooSteep}
            >
              Fijar Altura
            </Button>
          </View>
        )}
      </View>

      <IconButton icon="close" iconColor="#FFF" style={styles.closeBtn} onPress={onCancel} />
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  stepChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  hint: {
    color: '#FFF',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
    lineHeight: 18,
  },
  reticleContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleLineH: {
    position: 'absolute',
    width: 120,
    height: 1.5,
    opacity: 0.9,
  },
  reticleLineV: {
    position: 'absolute',
    width: 1.5,
    height: 120,
    opacity: 0.9,
  },
  reticleCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  hud: {
    position: 'absolute',
    top: '58%',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  hudAngle: {
    color: '#FFD54F',
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  hudLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  hudFixed: {
    color: '#80CBC4',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  panelTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  distanceInput: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 10,
    color: '#FFF',
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  panelNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  resultsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  resultBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  resultLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  resultValue: {
    color: '#FFD54F',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  guideTouchArea: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    opacity: 0.95,
  },
  guideLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.95,
  },
  guideHandle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
