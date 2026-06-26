import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import Constants from 'expo-constants';

import animation from '../assets/lotties/startLocation.json';

const FALLBACK_MS = 4000;
const version = Constants.expoConfig?.version ?? '1.0.0';

interface Props {
  onFinish?: (isCancelled: boolean) => void;
}
export default function SplashScreen({ onFinish = () => {} }: Props) {
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
      <Text style={styles.version}>v{version}</Text>
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
  version: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: '#BBBBBB',
    letterSpacing: 1,
  },
});
