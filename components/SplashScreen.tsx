import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

// Importación con ruta relativa — NO usar alias @/ porque no está configurado en este proyecto
import animation from '../assets/lotties/startLocation.json';

// Tiempo máximo de espera por si onAnimationFinish no se dispara
const FALLBACK_MS = 4000;

interface Props {
  onFinish?: (isCancelled: boolean) => void;
}
export default function SplashScreen({ onFinish = () => {} }: Props) {
  // Fallback de seguridad: avanza aunque la animación no notifique su fin
  useEffect(() => {
    const timer = setTimeout(() => onFinish(true), FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <LottieView
        source={animation}
        autoPlay
        loop={false}
        resizeMode="contain"
        onAnimationFinish={onFinish}
        style={styles.animation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: 240,
    height: 240,
  },
});
