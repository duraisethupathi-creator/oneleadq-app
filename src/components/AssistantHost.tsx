import { usePathname } from 'expo-router';
import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import FloatingAssistant, { type FloatingAssistantHandle, type FloatingAssistantProps } from './FloatingAssistant';

const AssistantHost = forwardRef<FloatingAssistantHandle, FloatingAssistantProps>(function AssistantHost(props, ref) {
  const pathname = usePathname();
  return <View pointerEvents="box-none" style={styles.container}><FloatingAssistant {...props} wakeSignal={pathname} ref={ref} /></View>;
});
export default AssistantHost;
const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 20 },
});
