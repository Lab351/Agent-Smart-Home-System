import type { ExpoConfig } from 'expo/config';

const appName = 'Personal Agent';
const slug = 'react-native-personal-agent';
const bluetoothPermission =
  'Allow $(PRODUCT_NAME) to scan nearby Bluetooth beacons and bind to your current room.';
const microphonePermission =
  'Allow $(PRODUCT_NAME) to record your voice for intent recognition and assistant control.';

const config: ExpoConfig = {
  name: appName,
  slug,
  owner: 'shuokun',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'personalagent',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.scut.personalagent',
  },
  android: {
    package: 'com.scut.personalagent',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-audio',
      {
        microphonePermission,
        recordAudioAndroid: true,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: false,
        neverForLocation: false,
        bluetoothAlwaysPermission: bluetoothPermission,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: 'f12e5f8f-dcc8-4b96-973b-62499a1fc7e0',
    },
    userId: process.env.EXPO_PUBLIC_USER_ID ?? 'user1',
    backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://120.78.228.69:3088',
    beaconUuid:
      process.env.EXPO_PUBLIC_BEACON_UUID ?? '01234567-89AB-CDEF-0123456789ABCDEF',
  },
};

export default config;
