import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebDevelopmentAgent, type WebAction, type WebWorkflow } from '../services/webDevelopmentAgent';

import {
  clearWebDevelopmentSession,
  getWebDevelopmentSessionExpiry,
  hasWebDevelopmentSession,
  pairWebDevelopmentDevice,
} from '../services/webDevelopmentSession';import { loadClients, loadCurrentClientId } from '../storage/clientStorage';

export type WebSessionTokenProvider = () => Promise<string>;
type Confirmation = { kind: 'files'; ids: string[]; files: string[] } |
  { kind: 'commit' | 'push'; id: string };
const COMMANDS = ['npm-typecheck', 'npm-test', 'npm-build'] as const;

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Report({ title, value }: { title: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  return <View><Button label={`${expanded ? 'Hide' : 'Show'} ${title}`} onPress={() => setExpanded(v => !v)} />
    {expanded && <Text selectable style={styles.report}>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</Text>}</View>;
}

export default function WebDevelopmentPanel({ active, getSessionToken }: {
  active: boolean; getSessionToken?: WebSessionTokenProvider;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [pairingCode, setPairingCode] = useState('');
const [sessionReady, setSessionReady] = useState(() => hasWebDevelopmentSession());
const [sessionExpiry, setSessionExpiry] = useState<number | null>(() => getWebDevelopmentSessionExpiry());
  const [projectId, setProjectId] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [workflow, setWorkflow] = useState<WebWorkflow | null>(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [reviewedCommit, setReviewedCommit] = useState<{ id: string; message: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const live = useRef(active);

  async function currentClient() {
    const id = await loadCurrentClientId();
    const clients = await loadClients();
    return clients.find(item => item.id === id && item.status === 'active') || null;
  }
  function cancel() {
    ++generation.current;
    const inFlight = !!controller.current;
    controller.current?.abort(); controller.current = null;
    setPending(''); setConfirmation(null);
    if (inFlight) { setNeedsRefresh(true); setNotice('Request stopped locally. Server work may continue. Refresh the workflow before another action.'); }
  }
  useEffect(() => {
    live.current = active;
    if (!active) cancel();
  }, [active]);
  useEffect(() => () => { live.current = false; ++generation.current; controller.current?.abort(); controller.current = null; }, []);
  useEffect(() => {
    let disposed = false;
    void currentClient().then(value => { if (!disposed) setClient(value); })
      .catch(() => { if (!disposed) setNotice('Unable to load the selected client.'); });
    return () => { disposed = true; };
  }, []);
async function pairDevice() {
  if (!/^\d{6}$/.test(pairingCode.trim())) {
    setNotice('Enter the 6-digit pairing code shown on the laptop.');
    return;
  }

  setPending('pairing');
  setNotice('');

  try {
    const expiresAt = await pairWebDevelopmentDevice(pairingCode.trim());
    setSessionReady(true);
    setSessionExpiry(expiresAt);
    setPairingCode('');
    setNotice('Secure Web Development session connected.');
  } catch (error) {
    setSessionReady(false);
    setSessionExpiry(null);
    setNotice(
      error instanceof Error
        ? error.message
        : 'Pairing failed. Generate a new pairing code and try again.'
    );
  } finally {
    setPending('');
  }
}
  async function execute(action: WebAction | 'create' | 'refresh', input: Record<string, unknown> = {}) {
    if (controller.current || !live.current) return;
    setConfirmation(null);
    if (!getSessionToken) { setNotice('Secure session authentication is not connected. Ask your administrator to connect it.'); return; }
    const request = new AbortController(); controller.current = request;
    const epoch = ++generation.current;
    const valid = () => live.current && generation.current === epoch && !request.signal.aborted;
    setPending(action); setNotice('');
    let sent = false;
    try {
      const selected = await currentClient();
      if (!valid()) return;
      setClient(selected);
      if (!selected) { setNotice('Select an active client in the app first.'); return; }
      if (action !== 'create' && workflow && selected.id !== workflow.context.clientId) {
        setNotice('The selected client changed. Restore this workflow’s client or leave this mode and start a new workflow.'); return;
      }
      const agent = new WebDevelopmentAgent(getSessionToken);
      if (action === 'create' && !projectId.trim()) { setNotice('Enter the explicitly configured project ID.'); return; }
      if (action === 'refresh' && !workflow && !resumeId.trim()) { setNotice('Enter a workflow ID to resume.'); return; }
      sent = true;
      const result = action === 'create' ? await agent.create(selected.id, projectId.trim(), request.signal)
        : action === 'refresh' ? await agent.get(workflow?.id || resumeId.trim(), request.signal)
        : workflow ? await agent.act(workflow.id, action, input, request.signal) : null;
      if (!valid() || !result) return;
      if (result.context.clientId !== selected.id) { setNotice('This workflow belongs to another client. Select its client before resuming.'); setNeedsRefresh(true); return; }
      setWorkflow(result); setResumeId(result.id); setNeedsRefresh(false); setSelectedFiles([]);
      if (action === 'propose-commit' && result.commitApprovalId) setReviewedCommit({ id: result.commitApprovalId, message: commitMessage.trim() });
      if (action === 'create' || action === 'refresh' || action === 'analyze') setCommands([]);
    } catch {
      if (valid()) { setNotice('Web Development request failed. Check session authentication and backend configuration, then refresh before retrying.'); if (sent) setNeedsRefresh(true); }
    } finally {
      if (valid()) { controller.current = null; setPending(''); }
    }
  }

  const state = workflow?.state;
  const locked = !!pending || !active || !getSessionToken || !sessionReady;
  const blocked = locked || needsRefresh;
  const allowedCommands = Array.isArray(workflow?.beforeReport?.validationCommands)
    ? COMMANDS.filter(command => (workflow.beforeReport!.validationCommands as unknown[]).includes(command)) : [];
  const unapplied = workflow?.approvals.filter(approval => !approval.applied) || [];
  const canValidate = !!workflow?.approvals.length && !unapplied.length &&
    ['WAITING_FOR_FILE_APPROVAL', 'VALIDATION_PASSED', 'VALIDATION_FAILED'].includes(state || '');
  function confirm() {
    const item = confirmation;
    if (!item || blocked) return;
    if (item.kind === 'files') void execute('approve-files', { approved: true, approvalIds: item.ids });
    else void execute(item.kind === 'commit' ? 'approve-commit' : 'approve-push', { approved: true, approvalId: item.id });
  }

  return <View style={styles.panel}>
    <Text style={styles.heading}>Create your website / இணையதளம்</Text>
    <Text style={styles.text}>Review business details → Choose a design → Human approval → Generate and validate. Publishing is a separate action.</Text>
    <Text style={styles.text}>Client: {client ? `${client.name} (${client.id})` : 'No active client selected'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.state}>State: {state || 'No workflow'}{pending ? ` · ${pending} in progress` : ''}</Text>
    {!getSessionToken && <Text style={styles.warning}>Authentication required: secure session provisioning is not connected. Actions are unavailable.</Text>}
    {getSessionToken && !sessionReady && (
  <View style={styles.card}>
    <Text style={styles.heading}>Secure Device Pairing</Text>

    <Text style={styles.text}>
      Enter the 6-digit pairing code generated on your OneLeadQ laptop.
    </Text>

    <TextInput
      accessibilityLabel="Web Development pairing code"
      placeholder="6-digit pairing code"
      value={pairingCode}
      onChangeText={setPairingCode}
      keyboardType="number-pad"
      maxLength={6}
      editable={!pending}
      style={styles.input}
    />

    <Button
      label="Pair this device"
      disabled={!!pending || pairingCode.trim().length !== 6}
      onPress={() => void pairDevice()}
    />
  </View>
)}

{getSessionToken && sessionReady && (
  <View style={styles.card}>
    <Text style={styles.state}>Secure session connected</Text>

    <Text style={styles.text}>
      {sessionExpiry
        ? `Session expires: ${new Date(sessionExpiry).toLocaleTimeString()}`
        : 'Session active'}
    </Text>

    <Button
      label="Forget secure session"
      disabled={!!pending}
      onPress={() => {
        clearWebDevelopmentSession();
        setSessionReady(false);
        setSessionExpiry(null);
        setNotice('Secure Web Development session cleared from this device.');
      }}
    />
  </View>
)}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.warning}>{notice}</Text>}
    {!workflow && <>
      <Text style={styles.text}>Use the project ID explicitly configured for this client. The server verifies its workspace mapping.</Text>
      <TextInput accessibilityLabel="Configured Web Development project ID" placeholder="Configured project ID" value={projectId}
        autoCapitalize="none" autoCorrect={false} editable={!locked} onChangeText={setProjectId} style={styles.input} />
      <Button label="Create workflow" disabled={blocked || !projectId.trim()} onPress={() => void execute('create')} />
      <TextInput accessibilityLabel="Existing Web Development workflow ID" placeholder="Workflow ID to resume" value={resumeId}
        autoCapitalize="none" autoCorrect={false} editable={!locked} onChangeText={setResumeId} style={styles.input} />
    </>}
    {!!workflow && <Text selectable style={styles.text}>Workflow: {workflow.id}{'\n'}Project: {workflow.context.projectId}{'\n'}Repository: {workflow.context.repository}</Text>}
    <Button label={workflow ? 'Refresh workflow' : 'Resume workflow'} disabled={locked || (!workflow && !resumeId.trim())} onPress={() => void execute('refresh')} />
    {!!pending && <Button label="Cancel request" onPress={cancel} />}
    {!!workflow && <>
      {state === 'IDLE' && <Button label="Analyze project" disabled={blocked} onPress={() => void execute('analyze')} />}
      <Report title="BEFORE report" value={workflow.beforeReport} />
      {state === 'ANALYSIS_COMPLETE' && <Button label="Prepare change plan" disabled={blocked} onPress={() => void execute('plan')} />}
      {workflow.plan.map(change => <View key={change.file} style={styles.card}>
        <Text selectable style={styles.text}>{change.file}{'\n'}{change.reason}</Text>
        <Report title={`proposed content: ${change.file}`} value={change.content} />
      </View>)}
      {state === 'CHANGE_PLAN_READY' && <Button label="Propose file approvals (no writes)" disabled={blocked} onPress={() => void execute('propose-files')} />}
      {state === 'WAITING_FOR_FILE_APPROVAL' && unapplied.map(approval => <Pressable key={approval.approvalId}
        accessibilityRole="checkbox" accessibilityState={{ checked: selectedFiles.includes(approval.approvalId), disabled: blocked }} disabled={blocked}
        onPress={() => { setConfirmation(null); setSelectedFiles(ids => ids.includes(approval.approvalId) ? ids.filter(id => id !== approval.approvalId) : [...ids, approval.approvalId]); }} style={styles.card}>
        <Text style={styles.text}>{selectedFiles.includes(approval.approvalId) ? '☑' : '☐'} {approval.file}</Text>
      </Pressable>)}
      {state === 'WAITING_FOR_FILE_APPROVAL' && unapplied.length > 0 && <Button label="Review approval for selected files" disabled={blocked || !selectedFiles.length}
        onPress={() => setConfirmation({ kind: 'files', ids: [...selectedFiles], files: unapplied.filter(a => selectedFiles.includes(a.approvalId)).map(a => a.file) })} />}
      {canValidate && <View>
        <Text style={styles.text}>Select validation checks:</Text>
        {allowedCommands.map(command => <Pressable key={command} accessibilityRole="checkbox"
          accessibilityState={{ checked: commands.includes(command), disabled: blocked }} disabled={blocked} style={styles.card}
          onPress={() => setCommands(values => values.includes(command) ? values.filter(v => v !== command) : [...values, command])}>
          <Text style={styles.text}>{commands.includes(command) ? '☑' : '☐'} {command}</Text>
        </Pressable>)}
        {!allowedCommands.length && <Text style={styles.warning}>No supported validation scripts were detected. Configure them in the project before creating another workflow.</Text>}
        <Button label="Run selected validation checks" disabled={blocked || !commands.length} onPress={() => void execute('validate', { commandIds: commands })} />
      </View>}
      <Report title="AFTER report" value={workflow.afterReport} />
      <Button label="Load safe Git status and diff" disabled={blocked} onPress={() => void execute('git')} />
      <Report title="Git status" value={workflow.git?.status} />
      {workflow.git && <><Text style={styles.text}>{workflow.git.diffScope}</Text><Report title="safe Git diff" value={workflow.git.diff || 'No approved-file diff available.'} /></>}
      {state === 'VALIDATION_PASSED' && <>
        <TextInput accessibilityLabel="Proposed commit message" placeholder="Commit message" value={commitMessage} editable={!blocked}
          onChangeText={setCommitMessage} style={styles.input} />
        <Button label="Prepare commit approval (no commit)" disabled={blocked || !commitMessage.trim()}
          onPress={() => void execute('propose-commit', { message: commitMessage.trim() })} />
      </>}
      {state === 'WAITING_FOR_COMMIT_APPROVAL' && workflow.commitApprovalId && <>
        {reviewedCommit?.id !== workflow.commitApprovalId && <Text style={styles.warning}>Commit approval is unavailable for this resumed workflow because the backend does not return its original message. Use the original reviewing session.</Text>}
        <Button label="Review commit approval" disabled={blocked || reviewedCommit?.id !== workflow.commitApprovalId}
          onPress={() => setConfirmation({ kind: 'commit', id: workflow.commitApprovalId! })} />
      </>}
      {state === 'COMMITTED' && <Button label="Prepare push approval (no push)" disabled={blocked} onPress={() => void execute('propose-push')} />}
      <Report title="push proposal" value={workflow.pushProposal} />
      {state === 'WAITING_FOR_PUSH_APPROVAL' && workflow.pushApprovalId && <Button label="Review push approval" disabled={blocked}
        onPress={() => setConfirmation({ kind: 'push', id: workflow.pushApprovalId! })} />}
      {confirmation && <View style={styles.confirm}>
        <Text style={styles.heading}>{confirmation.kind === 'files' ? 'Apply these file changes?' : confirmation.kind === 'commit' ? 'Create this commit?' : 'Push this commit to origin?'}</Text>
        <Text selectable style={styles.text}>{confirmation.kind === 'files' ? confirmation.files.join('\n') : confirmation.kind === 'commit'
          ? `Message: ${reviewedCommit?.message || ''}\nFiles: ${workflow.filesChanged.join(', ')}\nReview the Git status/diff before confirming.`
          : JSON.stringify(workflow.pushProposal, null, 2)}</Text>
        <Button label="Cancel approval" onPress={() => setConfirmation(null)} />
        <Button label={confirmation.kind === 'files' ? 'Confirm: apply selected files' : confirmation.kind === 'commit' ? 'Confirm: commit changes' : 'Confirm: push changes'} disabled={blocked} onPress={confirm} />
      </View>}
    </>}
    <Text style={styles.text}>Closing or cancelling stops local waiting; it does not undo server operations. Save the workflow ID to resume. All approvals are separate.</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, paddingVertical: 12 }, heading: { fontSize: 15, fontWeight: '800', color: '#0B5D4B' },
  text: { fontSize: 12, lineHeight: 18, color: '#26312E' }, state: { fontSize: 12, fontWeight: '800', color: '#0B5D4B' },
  warning: { fontSize: 12, lineHeight: 18, color: '#8A3518' },
  button: { minHeight: 44, justifyContent: 'center', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#D8CFB2', backgroundColor: '#FFFFFF' },
  buttonText: { color: '#0B5D4B', fontWeight: '700', fontSize: 12 }, disabled: { opacity: 0.45 },
  input: { minHeight: 44, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#D8CFB2', backgroundColor: '#FFFFFF', color: '#26312E' },
  card: { padding: 10, gap: 6, borderWidth: 1, borderColor: '#D8CFB2', borderRadius: 12 },
  confirm: { padding: 12, gap: 10, backgroundColor: '#FFF1D5', borderRadius: 12 },
  report: { fontSize: 12, lineHeight: 18, color: '#26312E', padding: 8 },
});
