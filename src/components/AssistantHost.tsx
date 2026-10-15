import { useGlobalSearchParams, usePathname } from 'expo-router';
import { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import FloatingAssistant, { type FloatingAssistantHandle, type FloatingAssistantProps } from './FloatingAssistant';

const AssistantHost = forwardRef<FloatingAssistantHandle, FloatingAssistantProps>(function AssistantHost(props, ref) {
  const pathname = usePathname();
  const query = useGlobalSearchParams<{qaPauseAssistant?:string}>();
  const [qaPaused, setQaPaused] = useState(__DEV__ && query.qaPauseAssistant === '1');
  useEffect(() => {
    if (__DEV__ && query.qaPauseAssistant === '1') setQaPaused(true);
    if (__DEV__ && query.qaPauseAssistant === '0') setQaPaused(false);
  }, [query.qaPauseAssistant]);
  const motionPaused = __DEV__ && qaPaused;
  return <View pointerEvents="box-none" style={styles.container}><FloatingAssistant {...props} wakeSignal={pathname} motionPaused={motionPaused} ref={ref} /></View>;
});
export default AssistantHost;
const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 20 },
});
