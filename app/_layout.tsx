import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';
import { View } from 'react-native';
import AssistantHost from '../src/components/AssistantHost';
import { getWebDevelopmentSessionToken } from '../src/services/webDevelopmentSession';
import type { FloatingAssistantHandle } from '../src/components/FloatingAssistant';

export default function RootLayout() {
  const assistant = useRef<FloatingAssistantHandle>(null);
  return (
    <View style={{ flex: 1 }} onTouchStart={() => assistant.current?.handleScreenTouch()}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <AssistantHost
          ref={assistant}
          getWebDevelopmentSessionToken={getWebDevelopmentSessionToken}
      />
    </View>
  );
}
