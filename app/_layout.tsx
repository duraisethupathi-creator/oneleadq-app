import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { colors } from '../src/theme';
import AssistantHost from '../src/components/AssistantHost';
import { getWebDevelopmentSessionToken } from '../src/services/webDevelopmentSession';
import type { FloatingAssistantHandle } from '../src/components/FloatingAssistant';
import { trustedWindows } from '../src/services/trustedWindows';

export default function RootLayout() {
  const assistant = useRef<FloatingAssistantHandle>(null);
  useEffect(() => {
    trustedWindows.setForeground(AppState.currentState === 'active');
    void trustedWindows.initialize(); // Optional reconnect never holds the shell or splash.
    const listener = AppState.addEventListener('change', state => trustedWindows.setForeground(state === 'active'));
    return () => { listener.remove(); trustedWindows.setForeground(false); };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} onTouchStart={() => assistant.current?.handleScreenTouch()}>
      <StatusBar style="light" />
      {/* Reserve space for the assistant instead of placing its touch target over page actions. */}
      <View style={{ flex: 1, marginBottom: 72 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      <AssistantHost
          compactDock
          ref={assistant}
          getWebDevelopmentSessionToken={getWebDevelopmentSessionToken}
      />
    </View>
  );
}
