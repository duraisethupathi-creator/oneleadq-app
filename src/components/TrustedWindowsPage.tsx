import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadClients, loadCurrentClientId } from '../storage/clientStorage';
import { hasTrustedWindowsNativeSupport, trustedWindows } from '../services/trustedWindows';
import { colors } from '../theme';

export default function TrustedWindowsPage() {
  const router = useRouter();
  const [connection, setConnection] = useState(trustedWindows.getState());
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), locked = useRef(false);
  useEffect(() => { mounted.current = true; const unsubscribe = trustedWindows.subscribe(setConnection); return () => { mounted.current = false; unsubscribe(); }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([loadCurrentClientId(), loadClients()]).then(([id, clients]) => { if (active) { const selected = clients.find(c => c.id === id && c.status === 'active'); setClient(selected ? { id: selected.id, name: selected.name } : null); } }).catch(() => { if (active) setError('Unable to load selected client.'); });
    return () => { active = false; };
  }, []));
  async function run(action: () => Promise<unknown>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Connection failed. No action replayed.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const selected = connection.devices.filter(d => d.clientId === client?.id);
  const active = selected.find(d => d.autoConnect) ?? selected[0];
  useEffect(() => {
    if (connection.status !== 'Connected' || !active) return;
    const timer = setInterval(() => { if (!locked.current) void run(() => trustedWindows.listJobs(active.deviceId)); }, 5000);
    return () => clearInterval(timer);
  }, [connection.status, active?.deviceId]);
  const preview = useMemo(() => { try { const d = JSON.parse(invitation) as { gatewayId?: unknown; fingerprint?: unknown }; return typeof d.gatewayId === 'string' && typeof d.fingerprint === 'string' ? `Laptop: ${d.gatewayId}\nCertificate: ${d.fingerprint}` : ''; } catch { return ''; } }, [invitation]);
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} style={[s.button, (disabled || busy) && s.disabled]} onPress={action}><Text style={s.buttonText}>{label}</Text></Pressable>;
  return <SafeAreaView style={s.page} edges={['top', 'bottom']}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {button('Back', () => router.back())}
    <Text style={s.title}>Trusted Windows devices</Text>
    <Text style={s.text}>Client: {client?.name ?? 'Select a client first'}</Text>
    <Text accessibilityLiveRegion="polite" style={s.status}>{connection.status}</Text>
    <Text style={s.text}>{connection.message}</Text>
    {connection.gatewayHealth && <Text style={s.text}>Gateway: {connection.gatewayHealth} · AI Backend: {connection.backendHealth}</Text>}
    {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
    {button('Retry connection', () => { void run(() => trustedWindows.reconnect(active?.deviceId)); }, !hasTrustedWindowsNativeSupport || !active)}
    {!hasTrustedWindowsNativeSupport && <Text style={s.error}>This installed APK needs the approved native Keystore/TLS module. Dashboard remains usable. Secure trust cannot be added through a JavaScript reload.</Text>}
    {!selected.length && <Text style={s.text}>Pair a laptop once for this client. Later foreground launches use its authenticated identity, discovery and a saved address.</Text>}
    {selected.map(device => <View key={device.deviceId} style={s.card}>
      <Text style={s.heading}>{device.name}</Text>
      <Text selectable style={s.text}>Laptop: {device.gatewayId}</Text><Text style={s.text}>Project: {device.projectId}</Text>
      <Text style={s.text}>Last connection: {device.lastConnectedAt ? new Date(device.lastConnectedAt).toLocaleString() : 'Never'}</Text>
      <Text style={s.text}>{device.autoConnect ? 'Automatic foreground reconnect enabled' : 'Disconnected; automatic reconnect paused'}</Text>
      {button('Connect trusted laptop', () => { void run(() => trustedWindows.reconnect(device.deviceId)); })}
      {button('Disconnect', () => { void run(() => trustedWindows.disconnect(device.deviceId)); })}
      {button('Forget Device', () => Alert.alert('Forget trusted laptop?', 'Revoke this phone on the laptop and remove its local key. If offline, retry revocation when the laptop is available; it is never reported as completed automatically.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Forget Device', style: 'destructive', onPress: () => { void run(() => trustedWindows.forget(device.deviceId)); } }]))}
      {button('Re-pair', () => { setInvitation(''); setError('Generate a fresh laptop invitation and verify its identity, then pair below. No old approval is restored.'); })}
      {!!device.pending && <>
        <Text style={s.error}>Exact pending request: {device.pending.commandId}. Review history before another submission.</Text>
        {button('Retry exact pending request', () => Alert.alert('Retry the same safe request?', 'Uses the same durable request ID. The laptop returns the original job or refuses an uncertain outcome; it will not execute the request twice. No approval is granted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Retry exact request', onPress: () => { void run(() => trustedWindows.retryPending(device.deviceId)); } }]))}
      </>}
    </View>)}
    <Text style={s.heading}>One-time laptop invitation</Text>
    <Text style={s.text}>Paste the fresh invitation shown on your laptop. Compare its identity and certificate fingerprint before accepting. The invitation/code is never saved. Discovery alone never establishes trust.</Text>
    <TextInput accessibilityLabel="Trusted laptop invitation" style={s.input} value={invitation} onChangeText={setInvitation} autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry editable={!busy && hasTrustedWindowsNativeSupport} />
    {!!preview && <Text selectable style={s.text}>{preview}</Text>}
    {button('Trust laptop once', () => Alert.alert('Trust this laptop for the selected client?', 'Verify the displayed identity/fingerprint matches your laptop. Only scoped worker tasks are enabled. File-write, commit, push and publishing approvals are not restored.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Trust laptop once', onPress: () => { const value = invitation; setInvitation(''); void run(() => trustedWindows.pair(value)); } }] ), !client || !preview || !hasTrustedWindowsNativeSupport)}
    {button('Run Windows typecheck', () => { void run(() => trustedWindows.startJob('npm-typecheck', active?.deviceId)); }, connection.status !== 'Connected' || !active)}
    {button('Refresh tasks', () => { void run(() => trustedWindows.listJobs(active?.deviceId)); }, !active)}
    {!connection.jobs.length && <Text style={s.text}>No tasks loaded. Reconnection reads status/history; it never resubmits tasks or replays approvals.</Text>}
    {connection.jobs.filter(job => job.clientId === client?.id && job.projectId === active?.projectId).map(job => <View key={job.id} style={s.card}>
      <Text style={s.heading}>{job.commandId} — {job.state}</Text><Text selectable style={s.text}>Shared task: {job.id}</Text><Text style={s.text}>Exit: {job.exitCode ?? 'pending'}</Text>
      {['RUNNING', 'CANCELLING'].includes(job.state) && button('Cancel task', () => { void run(() => trustedWindows.cancelJob(job.id, active?.deviceId)); })}
      <Text selectable style={s.logs}>{job.logs.map(log => log.text).join('\n')}</Text>
    </View>)}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.cream }, flex: { flex: 1 }, content: { padding: 20, gap: 12 }, title: { fontSize: 28, fontWeight: '800', color: colors.green }, heading: { fontSize: 17, fontWeight: '700', color: colors.green }, text: { color: colors.text, fontSize: 15 }, status: { color: colors.green, fontWeight: '800', fontSize: 20 }, error: { color: '#8A2D1A' }, input: { minHeight: 60, padding: 12, backgroundColor: 'white', borderWidth: 1, borderColor: colors.gold, borderRadius: 12 }, button: { minHeight: 48, padding: 14, backgroundColor: colors.green, borderRadius: 12 }, buttonText: { color: 'white', fontWeight: '700' }, disabled: { opacity: 0.45 }, card: { padding: 16, backgroundColor: 'white', borderRadius: 14, gap: 10, borderTopWidth: 3, borderTopColor: colors.gold }, logs: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: colors.text } });
