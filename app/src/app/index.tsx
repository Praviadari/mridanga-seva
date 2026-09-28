import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { CoordinatorHome } from '../screens/coordinator-home';

export default function HomeScreen() {
  useEffect(() => {
    // Hide splash screen once mounted
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CoordinatorHome />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
