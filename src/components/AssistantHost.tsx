import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import FloatingAssistant, { FloatingAssistantHandle } from './FloatingAssistant';

const AssistantHost = forwardRef<FloatingAssistantHandle>(function AssistantHost(_, ref) {
  return <View pointerEvents="box-none" style={styles.container}><FloatingAssistant ref={ref} /></View>;
});
export default AssistantHost;
const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 20 },
});
