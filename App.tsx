import React, { useCallback } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import MCIFont from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf';
import * as SplashScreen from 'expo-splash-screen';
import {
  PaperProvider,
  MD3LightTheme,
  MD3DarkTheme,
  useTheme,
} from 'react-native-paper';
import { Tabs, TabScreen, TabsProvider } from 'react-native-paper-tabs';
import { StatusBar } from 'expo-status-bar';

import CapturaScreen    from './screens/CapturaScreen';
import RecordListScreen from './screens/RecordListScreen';
import MapaScreen       from './screens/MapaScreen';
import StatsScreen      from './screens/StatsScreen';
import AboutScreen      from './screens/AboutScreen';
import AnimatedSplash   from './components/SplashScreen';

// ---------------------------------------------------------------------------
// Temas personalizados
// ---------------------------------------------------------------------------
const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1565C0',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D6E4FF',
    secondary: '#00796B',
    secondaryContainer: '#B2DFDB',
    background: '#F4F6FA',
    surface: '#FFFFFF',
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#90CAF9',
    onPrimary: '#0D47A1',
    primaryContainer: '#1565C0',
    secondary: '#80CBC4',
    secondaryContainer: '#00695C',
    background: '#0F0F0F',
    surface: '#1E1E2E',
  },
};

// ---------------------------------------------------------------------------
// Contenido — usa useTheme() dentro del PaperProvider
// ---------------------------------------------------------------------------
function AppContent() {
  const { colors, dark } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <TabsProvider defaultIndex={0}>
        <Tabs
          uppercase={false}
          showTextLabel
          iconPosition="top"
          style={{ backgroundColor: colors.surface }}
          tabLabelStyle={{ fontSize: 8, letterSpacing: 0.8, fontFamily: 'Cinzel_700Bold' }}
          dark={dark}
          disableSwipe
        >
          <TabScreen label="CAPTURA" icon="crosshairs-gps">
            <CapturaScreen />
          </TabScreen>

          <TabScreen label="REGISTROS" icon="format-list-bulleted">
            <RecordListScreen />
          </TabScreen>

          <TabScreen label="MAPA" icon="map">
            <MapaScreen />
          </TabScreen>

          <TabScreen label="STATS" icon="chart-bar">
            <StatsScreen />
          </TabScreen>

          <TabScreen label="ABOUT" icon="information-outline">
            <AboutScreen />
          </TabScreen>
        </Tabs>
      </TabsProvider>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// App — carga la fuente y elige el tema según el esquema del sistema
// ---------------------------------------------------------------------------
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [fontsLoaded] = useFonts({
    Cinzel_700Bold,
    MaterialCommunityIcons: MCIFont,
  });

  const [showSplash, setShowSplash] = React.useState(true);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          {showSplash ? (
            <AnimatedSplash onFinish={() => setShowSplash(false)} />
          ) : (
            <AppContent />
          )}
        </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
