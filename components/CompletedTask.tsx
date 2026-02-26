import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

import animation from '../assets/lotties/completedTask.json';

const FALLBACK_MS = 3000;

interface Props {
  onFinish?: () => void;
}

export default function CompletedTask({ onFinish = () => {} }: Props) {
  useEffect(() => {
    const timer = setTimeout(onFinish, FALLBACK_MS);
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
