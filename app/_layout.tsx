import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AssistantHost from '../src/components/AssistantHost';

export default function RootLayout() {
  return (
    <AssistantHost>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </AssistantHost>
  );
}
