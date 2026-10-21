import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { serviceRegistry, type ServiceId } from '../src/agents/registry';
import { loadCurrentClientId } from '../src/storage/clientStorage';
import { approveDraft, cancelDraft, createDraft, listDrafts, type DraftRun } from '../src/services/orchestrator';
import { trustedWindows } from '../src/services/trustedWindows';
export default function SpecialistDrafts() {
  const [service, setService] = useState<ServiceId>('webDevelopment');
  const [command, setCommand] = useState(''); const [html, setHtml] = useState('');
  const [runs, setRuns] = useState<DraftRun[]>([]); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Enable drafts in the ownerâ€™s workspace mapping, then explicitly pair the selected client. Gemini requests require your separate usage authorization.');
  const inFlight = useRef(false);
  const mounted = useRef(true); const selected = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let valid = true;
    void loadCurrentClientId().then(id => {
      if (valid && selected.current !== id) { selected.current = id; setRuns([]); setCommand(''); setHtml(''); }
    }).catch(() => { if (valid) { setRuns([]); setNotice('Unable to load the selected client.'); } });
    return () => { valid = false; setRuns([]); };
  }, []));
  async function action(work: (clientId: string) => Promise<unknown>) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true);
    try {
      const id = await loadCurrentClientId(); if (!id) throw new Error('Select a client first.');
      if (selected.current !== id) { selected.current = id; setRuns([]); }
      await work(id); const result = await listDrafts(id);
      if (mounted.current && await loadCurrentClientId() === id) { setRuns(result.reverse()); setNotice('Draft history refreshed. External actions are disabled.'); }
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Draft connection unavailable.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const button = (label: string, onPress: () => void, disabled = busy) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 12, marginVertical: 4, backgroundColor: disabled ? '#ddd' : '#dcece4', borderRadius: 10 }}><Text>{label}</Text></Pressable>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
    <Text style={{ fontSize: 26, fontWeight: 'bold' }}>Specialist Drafts</Text>
    <Text>All eight workflows: fixture-tested only. Live platform execution is unverified. Approval reviews a draft and never publishes it.</Text>
    <Text accessibilityLiveRegion="polite" style={{ marginVertical: 16 }}>{notice}</Text>
    {serviceRegistry.map(s => button((service === s.id ? 'Selected: ' : '') + s.name, () => setService(s.id)))}
    <TextInput accessibilityLabel="Draft command" placeholder="Describe a proposed draft" value={command} onChangeText={setCommand} multiline editable={!busy} style={{ borderWidth: 1, padding: 12, marginVertical: 12 }} />
    {service === 'seo' && <TextInput accessibilityLabel="Provided HTML for SEO audit" placeholder="Paste test HTML; no URL is fetched" value={html} onChangeText={setHtml} multiline editable={!busy} style={{ borderWidth: 1, padding: 12 }} />}
    {button('Request Gemini draft', () => Alert.alert('Gemini usage', 'This contacts your configured Gemini backend and may incur usage. Continue only with your own usage authorization.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Request draft', onPress: () => { void action(async id => { await createDraft(id, service, command, await trustedWindows.newDraftId(), service === 'seo' ? html : undefined); }); } }]), busy || !command.trim() || (service === 'seo' && !html.trim()))}
    {button('Refresh history / status', () => { void action(async () => {}); })}
    {runs.map(r => <SafeAreaView key={r.id} edges={[]} style={{ padding: 14, marginVertical: 10, backgroundColor: '#f1f5f2' }}>
      <Text style={{ fontWeight: 'bold' }}>{r.serviceId} Â· {r.state}</Text><Text>{r.mode} Â· production unverified</Text><Text selectable>{r.id}</Text>
      <Text>{r.plan?.summary}</Text>{r.plan?.items.map((text, i) => <Text key={i}>{i + 1}. {text}</Text>)}
      {r.artifacts?.map(a => <Text selectable key={a.name}>{a.name} Â· {a.bytes} bytes Â· SHA-256 {a.sha256}</Text>)}
      {r.state === 'AWAITING_REVIEW' && button('Approve exact draft only', () => Alert.alert('Review draft', 'Approve this exact plan and file hashes? External actions remain disabled.', [{ text: 'Cancel' }, { text: 'Approve draft', onPress: () => { void action(id => approveDraft(id, r)); } }]))}
      {['QUEUED', 'RUNNING'].includes(r.state) && button('Cancel run', () => { void action(id => cancelDraft(id, r.id)); })}
    </SafeAreaView>)}
  </ScrollView></SafeAreaView>;
}
