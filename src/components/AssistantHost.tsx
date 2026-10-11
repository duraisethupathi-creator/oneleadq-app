import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import FloatingAssistant, { type FloatingAssistantHandle, type FloatingAssistantProps } from './FloatingAssistant';

const AssistantHost = forwardRef<FloatingAssistantHandle, FloatingAssistantProps>(function AssistantHost(props, ref) {
  return <View pointerEvents="box-none" style={styles.container}><FloatingAssistant {...props} ref={ref} /></View>;
});
export default AssistantHost;
const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 20 },
});
