import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Image, Platform, Share } from 'react-native';
import { WebDevelopmentAgent, type WebAction, type WebWorkflow, type DesignVariant } from '../services/webDevelopmentAgent';

import {
  clearWebDevelopmentSession,
  getWebDevelopmentSessionExpiry,
  hasWebDevelopmentSession,
  pairWebDevelopmentDevice,
} from '../services/webDevelopmentSession';
import { loadClients, loadCurrentClientId, saveCurrentClientId } from '../storage/clientStorage';
import {loadWebDraft,saveWebDraft,parseDesignDraft,saveNewWebForm,opensNewWebForm} from '../storage/webDevelopmentDraft';
export type WebSessionTokenProvider = () => Promise<string>;
type Confirmation = { kind: 'files'; ids: string[]; files: string[] } |
  { kind: 'commit' | 'push'; id: string } | { kind: 'rollback'; ids: string[]; files: string[] };
import { WEBSITE_TYPES } from './webDevelopmentWebsiteTypes';
const DESIGN_FIELDS = [["primary", "Primary colour", "#155e54"], ["accent", "Secondary accent colour", "#e9bd73"], ["tone", "Light / Dark preference", "Light or Dark"], ["typography", "Typography personality", "Editorial serif or modern sans"], ["corners", "Rounded / sharp UI", "Rounded or Sharp"], ["animation", "Animation preference", "None, Subtle or Moderate"], ["density", "Layout density", "Compact, Balanced or Spacious"], ["cta", "CTA preference", "Discuss your project"], ["sections", "Preferred sections", "Services,About,Contact"], ["reference", "Reference design notes", "Describe the layout you like"], ["instruction", "Custom design instruction", "Your design direction"], ["assetsAvailability", "Logo and asset availability", "Existing assets or references available"]];
const COMMANDS = ['npm-typecheck', 'npm-test', 'npm-lint', 'npm-build'] as const;
const recentWorkflows = new Map<string, WebWorkflow>(); // Volatile, at most five clients. No credentials.

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Report({ title, value, open = false }: { title: string; value: unknown; open?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(()=>{if(open)setExpanded(true);},[open]);
  if (!value) return null;
  return <View><Button label={`${expanded ? 'Hide' : 'Show'} ${title}`} onPress={() => setExpanded(v => !v)} />
    {expanded && <Text selectable style={styles.report}>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</Text>}</View>;
}

function Field({ required, ...props }: React.ComponentProps<typeof TextInput> & { required?: boolean }) {
  const label=props.accessibilityLabel || 'Input';
  const colourError=/colour/i.test(label) && props.value && !/^#[0-9a-f]{6}$/i.test(props.value) ? 'Use #RRGGBB, for example #155e54.':'';
  return <View style={{gap:5}}><Text style={styles.text}>{label}{(required ?? /project ID|pairing code|requirements and real|Proposed commit message/.test(label))?' *':' (optional)'}</Text><TextInput {...props} placeholderTextColor="#5b6965" />{!!colourError && <Text style={styles.warning}>{colourError}</Text>}</View>;
}
function DesignPreview({variant, name}:{variant:DesignVariant;name:string}) {
 const spec=variant.spec;
 return <View style={{gap:10}}>{[false,true].map(mobile=><View key={String(mobile)} style={{backgroundColor:spec.background,padding:12,borderWidth:1,borderColor:'#80948b',gap:12,maxWidth:mobile?210:undefined}}>
   <Text style={{color:spec.ink,fontSize:10}}>DESIGN PREVIEW - {mobile?'MOBILE':'DESKTOP'} - layout representation</Text>
   <Text style={{color:spec.ink,fontWeight:'800'}}>{name} {spec.layout==='poster'?'- centered navigation':''}</Text>
   <View style={{flexDirection:mobile || spec.layout==='poster'?'column':'row',gap:8}}><View style={{flex:1,gap:8}}><Text style={{color:spec.ink,fontSize:spec.layout==='stacked'?18:24,fontWeight:'800'}}>{name}</Text><Text style={{color:spec.ink,fontSize:11}}>{spec.style} - {spec.typography}</Text><Text style={{backgroundColor:spec.primary,color:spec.buttonInk||'#fff',padding:9}}>{spec.cta}</Text></View><View style={{flex:1,minHeight:spec.layout==='poster'?100:70,backgroundColor:spec.accent,padding:8}}><Text style={{color:'#172a23',fontSize:10}}>Client imagery area{String.fromCharCode(10)}DESIGN PLACEHOLDER</Text></View></View>
   <View style={{gap:6}}>{spec.sections.map((section,i)=><Text key={i} style={{padding:spec.cards==='outline'?9:14,borderWidth:spec.cards==='outline'?1:0,borderColor:spec.ink,color:spec.ink,fontSize:10}}>{spec.cards==='numbered'?`${i+1}. `:''}{section}</Text>)}</View>
 </View>)}</View>;
}
export default function WebDevelopmentPanel({ active, getSessionToken, command, onCommandConsumed, handoff }: {
  handoff?: {clientId:string;mode:'CREATE_NEW'|'UPGRADE_EXISTING';intent:string;nonce:number;websiteType?:string};
  active: boolean; getSessionToken?: WebSessionTokenProvider; command?: {text:string;nonce:number;clientId:string}; onCommandConsumed?:()=>void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [pairingCode, setPairingCode] = useState('');
const [sessionReady, setSessionReady] = useState(() => hasWebDevelopmentSession());
const [sessionExpiry, setSessionExpiry] = useState<number | null>(() => getWebDevelopmentSessionExpiry());
  const [projectId, setProjectId] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [mode, setMode] = useState<'CREATE_NEW' | 'UPGRADE_EXISTING'>('UPGRADE_EXISTING');
  const [websiteType,setWebsiteType]=useState('');
  const [design,setDesign]=useState<Record<string,string>>({});
  const [openReport,setOpenReport]=useState('');
  const [refinement,setRefinement]=useState('');
  const [previewId,setPreviewId]=useState('');
  const [draftClient,setDraftClient]=useState('');
  const [newForm,setNewForm]=useState(false);
  const [savedResumeId,setSavedResumeId]=useState('');
  const [pdfReady,setPdfReady]=useState<{url:string;phase:string}|null>(null);
  const [description, setDescription] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [contactDetails, setContactDetails] = useState('');
  const [designPreference, setDesignPreference] = useState('');
  const [keywords, setKeywords] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [assetRefs,setAssetRefs]=useState<{role:string;source:string;path:string;alt:string}[]>([]);
  const [assetRole,setAssetRole]=useState('hero');
  const [assetSource,setAssetSource]=useState('existing');
  const [assetPath,setAssetPath]=useState('');
  const [assetAlt,setAssetAlt]=useState('');
  const [assets, setAssets] = useState('');
  const [seoLocation, setSeoLocation] = useState('');
  const [frameworkConfirmed, setFrameworkConfirmed] = useState(false);
  const [pages, setPages] = useState('home,about,contact');
  const [siteLanguage, setSiteLanguage] = useState<'en' | 'ta'>('en');
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
  const consumedHandoff=useRef(0);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const live = useRef(active);

  async function currentClient() {
    const id=await loadCurrentClientId();
    const allClients=await loadClients();
    return allClients.find(item=>item.id===id && item.status==='active')||null;
  }
  function cancel() {
    ++generation.current;
    const inFlight = !!controller.current;
    controller.current?.abort(); controller.current = null;
    setPending(''); setConfirmation(null);
    if (inFlight) { setNeedsRefresh(true); setNotice('Request stopped locally. Server work may continue. Refresh the workflow before another action.'); }
  }
  function clearReview() {
    setConfirmation(null);setSelectedFiles([]);setCommands([]);setCommitMessage('');setReviewedCommit(null);
    setPreviewId('');setRefinement('');setOpenReport('');setPdfReady(null);setFrameworkConfirmed(false);
  }
  async function startNewWorkflow() {
    if (!client || pending || !live.current) return;
    const id=client.id;const epoch=++generation.current;
    setPending('new form');
    try {
      // Preserve the old draft and server workflow. New requirements use a
      // separate local slot; no backend request or repository operation occurs.
      await saveWebDraft(id,{workflowId:workflow?.id||resumeId,mode,projectId,description,websiteType,designPreference,pages,siteLanguage,design:JSON.stringify(design)},newForm);
      await saveWebDraft(id,{mode,description,websiteType,designPreference,pages,siteLanguage,design:'{}',projectId:'',workflowId:''},true);
      await saveNewWebForm(id);
      if (!live.current || generation.current!==epoch) return;
      setSavedResumeId(workflow?.id||resumeId||savedResumeId);setNewForm(true);setWorkflow(null);setResumeId('');setProjectId('');setDesign({});setNeedsRefresh(false);clearReview();
      setNotice('New workflow form ready. Select the configured project explicitly. The previous workflow and its files are unchanged.');
    } catch {setNotice('Unable to save the new-form preference. Previous workflow remains available.');}
    finally {if(generation.current===epoch)setPending('');}
  }
  useEffect(()=>{let disposed=false;setDraftClient('');setWorkflow(null);setResumeId('');setSavedResumeId('');setProjectId('');setDesign({});clearReview();setDescription('');setWebsiteType('');setDesignPreference('');setProductsServices('');setContactDetails('');setPhone('');setEmail('');setWebsiteUrl('');setAssetRefs([]);setAssets('');setKeywords('');setSeoLocation('');if(!client?.id)return;const id=client.id;
    void (async()=>{const fresh=await opensNewWebForm(id);const original=await loadWebDraft(id);const draft=fresh?await loadWebDraft(id,true):original;return {fresh,original,draft};})().then(({fresh,original,draft})=>{if(disposed)return;setNewForm(fresh);setSavedResumeId(original?.workflowId||recentWorkflows.get(id)?.id||'');setWorkflow(null);setNeedsRefresh(false);clearReview();setAssetRefs([]);setAssetPath('');setAssetAlt('');setPhone('');setEmail('');setContactDetails('');setProductsServices('');setWebsiteUrl('');setAssets('');setKeywords('');setSeoLocation('');setResumeId(draft?.workflowId||'');setProjectId(draft?.projectId||'');setDescription(draft?.description||'');setWebsiteType(draft?.websiteType||'');setDesignPreference(draft?.designPreference||'');setPages(draft?.pages||'home,about,contact');setMode(draft?.mode==='CREATE_NEW'?'CREATE_NEW':'UPGRADE_EXISTING');setSiteLanguage(draft?.siteLanguage==='ta'?'ta':'en');setDesign(parseDesignDraft(draft?.design));setFrameworkConfirmed(false);setDraftClient(id);if(draft)setNotice('DRAFT STATE restored. No approval was restored.');}).catch(()=>{if(!disposed)setDraftClient(id);});return()=>{disposed=true;};
  },[client?.id]);
  useEffect(()=>{if(!draftClient||draftClient!==client?.id)return;void saveWebDraft(draftClient,{workflowId:workflow?.context.clientId===draftClient?workflow.id:resumeId,mode,projectId,description,websiteType,designPreference,pages,siteLanguage,design:JSON.stringify(design)},newForm).catch(()=>setNotice('Draft could not be saved locally.'));},[draftClient,client?.id,workflow?.id,resumeId,mode,projectId,description,websiteType,designPreference,pages,siteLanguage,design,newForm]);
  useEffect(()=>()=>{if(pdfReady && Platform.OS==='web')URL.revokeObjectURL(pdfReady.url);},[pdfReady]);
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
  useEffect(() => {
    let disposed = false;
    void loadClients().then(values => { if (!disposed) setClients(values.filter(c => c.status === 'active')); }).catch(() => {});
    return () => { disposed = true; };
  }, []);
async function pairDevice() {
  if (!/^\d{6}$/.test(pairingCode.trim())) {
    setNotice('Enter the 6-digit pairing code shown on the laptop.');
    return;
  }

  if (controller.current || !live.current) return;
  const request = new AbortController(); controller.current = request;
  const epoch = ++generation.current;
  const valid = () => live.current && generation.current === epoch && !request.signal.aborted;
  setPending('pairing');
  setNotice('');

  try {
    const expiresAt = await pairWebDevelopmentDevice(pairingCode.trim(), request.signal);
    if (!valid()) return;
    setSessionReady(true);
    setSessionExpiry(expiresAt);
    setPairingCode('');
    setNotice('Secure Web Development session connected.');
  } catch {
    if (!valid()) return;
    setSessionReady(false);
    setSessionExpiry(null);
    setNotice('Pairing failed. Generate a new pairing code and try again.');
  } finally {
    if (valid()) { controller.current = null; setPending(''); }
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
      if(action==='create' && (selected.id!==client?.id || draftClient!==selected.id)){setNotice('Selected client changed. Wait for its draft to load, review requirements, and retry.');return;}
      if (action !== 'create' && workflow && selected.id !== workflow.context.clientId) {
        setNotice('The selected client changed. Restore this workflow’s client or leave this mode and start a new workflow.'); return;
      }
      const agent = new WebDevelopmentAgent(getSessionToken);
      if (action === 'create' && !projectId.trim()) { setNotice('Enter the explicitly configured project ID.'); return; }
      if (action === 'refresh' && !workflow && !resumeId.trim()) { setNotice('Enter a workflow ID to resume.'); return; }
      sent = true;
      const options = { mode, ...(mode === 'CREATE_NEW' || description.trim() ? { requirements: {
        framework: 'STATIC_HTML', language: siteLanguage, businessName: selected.name,
        businessType: selected.businessType, location: selected.location, website: websiteUrl,
        websiteType,design,description: description.trim(), productsServices, address: contactDetails, designPreference, keywords, phone, email, assets, seoLocation,assetReferences:assetRefs,
        pages: pages.split(',').map(page => page.trim()).filter(Boolean),
      } } : {}) };
      const result = action === 'create' ? await agent.create(selected.id, projectId.trim(), request.signal, options)
        : action === 'refresh' ? await agent.get(workflow?.id || resumeId.trim(), request.signal)
        : workflow ? await agent.act(workflow.id, action, input, request.signal) : null;
      if (!valid() || !result) return;
      if (result.context.clientId !== selected.id) { setNotice('This workflow belongs to another client. Select its client before resuming.'); setNeedsRefresh(true); return; }
      setWorkflow(result); setResumeId(result.id); setNeedsRefresh(false); setSelectedFiles([]);
      recentWorkflows.delete(selected.id); recentWorkflows.set(selected.id, result);
      if (recentWorkflows.size > 5) recentWorkflows.delete(recentWorkflows.keys().next().value!);
      if (result.commitProposal && result.commitApprovalId) setReviewedCommit({ id: result.commitApprovalId, message: result.commitProposal.message });
      if (action === 'propose-commit' && result.commitApprovalId) setReviewedCommit({ id: result.commitApprovalId, message: commitMessage.trim() });
      if (action === 'create' || action === 'refresh' || action === 'analyze') setCommands([]);
    } catch (error) {
      if (valid()) { setNotice(error instanceof Error && error.name==='CreateNewFileConflict' ? 'CREATE_NEW target already contains website files. Start a new workflow with an empty configured project, or use UPGRADE_EXISTING. No files were overwritten.' : error instanceof Error && /^(No approved repository|Select a supported|Colours must|Provide the real|Select distinct supported|Design approval|required|Approve design)/.test(error.message) ? error.message : 'Web Development request failed. Check authentication, approved client/project mapping, and required design fields; refresh before retrying.'); if (sent) setNeedsRefresh(true); }
    } finally {
      if (valid()) { controller.current = null; setPending(''); }
    }
  }

  async function exportPdf(phase:'BEFORE'|'AFTER') {
    if(!workflow||!getSessionToken||controller.current)return;
    const request=new AbortController();controller.current=request;const epoch=++generation.current;setPending('PDF');
    try{const selected=await currentClient();if(request.signal.aborted||!live.current||generation.current!==epoch)return;if(selected?.id!==workflow.context.clientId){setNotice('Select the workflow client before exporting its report.');return;}const blob=await new WebDevelopmentAgent(getSessionToken).report(workflow.id,phase,request.signal);if(request.signal.aborted||!live.current||generation.current!==epoch)return;
      if(Platform.OS==='web'){setPdfReady({url:URL.createObjectURL(blob),phase});setNotice('PDF ready. Use Download PDF to save or share the report.');}
      else {setNotice('PDF generated on the backend. Native binary sharing requires an approved file-system/share adapter; use the web app download for now.');}
    }catch{if(!request.signal.aborted)setNotice('PDF unavailable. Verify the local Edge renderer and report availability.');}finally{if(controller.current===request){controller.current=null;setPending('');}}
  }
  useEffect(()=>{if(!handoff||draftClient!==handoff.clientId||client?.id!==handoff.clientId||consumedHandoff.current===handoff.nonce)return;consumedHandoff.current=handoff.nonce;if(workflow){setNotice('Existing workflow restored. Review its mode and refresh; no new workflow or analysis was started.');return;}setMode(handoff.mode);const type=WEBSITE_TYPES.find(type=>type.id===handoff.websiteType);if(handoff.mode==='CREATE_NEW'&&type){setWebsiteType(type.id);setPages(type.pages.join(','));}setNotice('Website request received. Review requirements and the explicitly configured Project ID, then create the workflow. No files have changed.');},[handoff?.nonce,draftClient,client?.id,workflow?.id]);
  useEffect(()=>{if(!command?.text||!active||command.clientId!==client?.id)return;onCommandConsumed?.();const q=command.text.toLowerCase();
    if(/before.*report/.test(q)){setOpenReport('BEFORE report');return;}
    if(/after.*report/.test(q)){setOpenReport('AFTER report');return;}
    if(/apply|approve|commit|push|\u0b85\u0ba9\u0bc1\u0bae\u0ba4\u0bbf/.test(q)){setNotice('Review the visible proposal and use its explicit confirmation button. Voice/text cannot approve privileged actions.');return;}
    if(!workflow && /new.*website|website.*create|interior.*website/.test(q)){setMode('CREATE_NEW');if(/interior/.test(q)){setWebsiteType('INTERIOR');setPages('home,services,projects,gallery,contact');}setNotice('CREATE_NEW draft selected. Review requirements, design preferences and configured project ID.');return;}
    const choice=/second|2nd|variant\s*b|\u0b87\u0bb0\u0ba3\u0bcd\u0b9f/.test(q)?1:/third|3rd|variant\s*c/.test(q)?2:/first|1st|variant\s*a/.test(q)?0:-1;
    if(choice>=0 && workflow?.designVariants?.[choice]){void execute('select-design',{variantId:workflow.designVariants[choice].id});if(/refine|blue|theme|bigger|simple/.test(q)){setRefinement(command.text);setNotice('Variant selection requested. Review and choose Refine Design to propose the captured changes.');}return;}
    if(!workflow && /luxury|modern|minimal|corporate/.test(q)){const style=q.includes('luxury')?'Luxury':q.includes('minimal')?'Minimal':q.includes('corporate')?'Corporate':'Modern';setDesign(d=>({...d,style}));setNotice('Design preference added to the unapproved draft.');return;}
    if(/refine|theme|hero|luxury|blue/.test(q)&&workflow?.selectedDesignId){setRefinement(command.text);setNotice('Refinement instruction captured. Choose Refine Design to generate a new proposal.');return;}
    if(/design|variant|காட்டு/.test(q)&&workflow?.mode==='CREATE_NEW'){void execute('generate-designs');return;}
    if(/seo|analy/.test(q)&&workflow){if(['IDLE','REQUIREMENTS_READY','ARCHITECTURE_READY'].includes(workflow.state))void execute('analyze');else setOpenReport(workflow.afterReport?'AFTER report':'BEFORE report');return;}
    setNotice('Use the workflow steps below to prepare your website. Select the explicit mode, type and configured project before creating a workflow.');
  },[command?.nonce,client?.id]);
  const state = workflow?.state;
  const locked = !!pending || !draftClient || !active || !getSessionToken || !sessionReady;
  const blocked = locked || needsRefresh;
  const reportedCommands = workflow?.validationCommands || workflow?.beforeReport?.validationCommands;
  const allowedCommands = Array.isArray(reportedCommands) ? COMMANDS.filter(command => reportedCommands.includes(command)) : [];
  const unapplied = workflow?.approvals.filter(approval => !approval.applied && !approval.rejected) || [];
  const canValidate = !!workflow?.filesChanged.length && !!workflow?.approvals.length && !unapplied.length &&
    ['WAITING_FOR_FILE_APPROVAL', 'VALIDATION_PASSED', 'VALIDATION_FAILED'].includes(state || '');
  function confirm() {
    const item = confirmation;
    if (!item || blocked) return;
    if (item.kind === 'files') void execute('approve-files', { approved: true, approvalIds: item.ids });
    else if (item.kind === 'rollback') void execute('rollback-created', { approved: true, operationIds: item.ids });
    else void execute(item.kind === 'commit' ? 'approve-commit' : 'approve-push', { approved: true, approvalId: item.id });
  }

  return <View style={styles.panel}>
    <Text style={styles.heading}>Create your website / இணையதளம்</Text>
    <Text style={styles.text}>Review business details → Choose a design → Human approval → Generate and validate. Publishing is a separate action.</Text>
    <Text style={styles.text}>DRAFT STATE is saved per client. Approvals always require fresh review.</Text>
    {!!workflow?.restoreNotice && <Text style={styles.warning}>{workflow.restoreNotice}</Text>}
    <Text style={styles.text}>Client: {client ? `${client.name} (${client.id})` : 'No active client selected'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.state}>State: {state || 'No workflow'}{pending ? ` · ${pending} in progress` : ''}</Text>
    {!getSessionToken && <Text style={styles.warning}>Authentication required: secure session provisioning is not connected. Actions are unavailable.</Text>}
    {getSessionToken && !sessionReady && (
  <View style={styles.card}>
    <Text style={styles.heading}>Secure Device Pairing</Text>

    <Text style={styles.text}>
      Enter the 6-digit pairing code generated on your OneLeadQ laptop.
    </Text>

    <Field
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
      <Text style={styles.text}>Select active client:</Text>
      {clients.map(item => (
  <Button
    key={item.id}
    label={`${client?.id === item.id ? 'Selected: ' : ''}${item.name}`}
    disabled={locked}
    onPress={() => {
      void saveCurrentClientId(item.id).then(()=>{setClient(item);

      setWorkflow(null);setResumeId('');setNeedsRefresh(false);clearReview();setProjectId('');setNotice('Review this client draft and explicitly configured project.');}).catch(()=>setNotice('Unable to select the active client.'));
    }}
  />
))}

<Button
label={`UPGRADE_EXISTING${mode === 'UPGRADE_EXISTING' ? ' · selected' : ''}`}
disabled={locked}
onPress={() => setMode('UPGRADE_EXISTING')}
/>
      <Button label={`CREATE_NEW${mode === 'CREATE_NEW' ? ' · selected' : ''}`} disabled={locked} onPress={() => setMode('CREATE_NEW')} />
      <Text style={styles.heading}>Static website presentation type *</Text><Text style={styles.text}>These are static content/layout presets, not checkout, booking, CMS or SaaS application engines.</Text>
      {WEBSITE_TYPES.filter(type => advanced || ['BUSINESS','INTERIOR','SERVICE','PORTFOLIO'].includes(type.id) || type.id === websiteType).map(type=><Button key={type.id} label={`${websiteType===type.id?'Selected: ':''}${type.label}`} disabled={locked} onPress={()=>{setWebsiteType(type.id);setPages(type.pages.join(','));}} />)}
      <Text style={styles.text}>Existing projects retain their detected stack. New creation currently supports static HTML/CSS/JavaScript.</Text>
      {mode === 'CREATE_NEW' && <Button label={frameworkConfirmed ? 'STATIC_HTML · selected' : 'Select STATIC_HTML creation framework'} disabled={locked} onPress={() => setFrameworkConfirmed(true)} />}
      <Button label={`Website language: ${siteLanguage === 'en' ? 'English' : 'Tamil'}`} disabled={locked} onPress={() => setSiteLanguage(v => v === 'en' ? 'ta' : 'en')} />
      <Field required={mode==='CREATE_NEW'} accessibilityLabel="Website requirements and real page content" placeholder="Requirements and real business description" multiline value={description} onChangeText={setDescription} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Actual client products or services" placeholder="Actual client products/services (not assigned OneLeadQ services)" multiline value={productsServices} onChangeText={setProductsServices} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Verified client address" placeholder="Verified address, if available" value={contactDetails} onChangeText={setContactDetails} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Verified production website URL" placeholder="Verified HTTPS production URL (optional)" value={websiteUrl} onChangeText={setWebsiteUrl} editable={!locked} autoCapitalize="none" style={styles.input} />
      <Field accessibilityLabel="Verified client phone" placeholder="Verified phone (optional)" value={phone} onChangeText={setPhone} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Verified client email" placeholder="Verified email (optional)" value={email} onChangeText={setEmail} editable={!locked} autoCapitalize="none" style={styles.input} />
      <Field accessibilityLabel="Available logo and asset references" placeholder="Available logo/assets (references only)" value={assets} onChangeText={setAssets} editable={!locked} style={styles.input} />
      <Button label={advanced ? 'Hide advanced settings' : 'Advanced settings / மேம்பட்ட அமைப்புகள்'} onPress={() => setAdvanced(value => !value)} />
      {advanced && <>
      <Text style={styles.heading}>Structured asset references (optional)</Text>
      <Text style={styles.text}>Existing project assets or previously uploaded HTTPS URLs only. This form does not upload/copy files or replace client assets. Placeholder uses abstract CSS artwork.</Text>
      {['logo','hero','service','product','gallery','icon'].map(role=><Button key={role} label={`Asset role: ${role}${assetRole===role?' selected':''}`} disabled={locked} onPress={()=>setAssetRole(role)} />)}
      {['existing','uploaded','placeholder'].map(source=><Button key={source} label={`Asset source: ${source}${assetSource===source?' selected':''}`} disabled={locked} onPress={()=>setAssetSource(source)} />)}
      <Field accessibilityLabel="Asset reference path" placeholder="images/hero.webp or verified HTTPS URL" value={assetPath} onChangeText={setAssetPath} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Verified asset alt text" placeholder="Describe the actual supplied image" value={assetAlt} onChangeText={setAssetAlt} editable={!locked} style={styles.input} />
      <Button label="Add asset reference" disabled={locked||assetRefs.length>=20||assetSource!=='placeholder'&&!assetPath.trim()} onPress={()=>{setAssetRefs(v=>[...v,{role:assetRole,source:assetSource,path:assetPath.trim(),alt:assetAlt.trim()}]);setAssetPath('');setAssetAlt('');}} />
      {assetRefs.map((asset,i)=><View key={i} style={styles.card}><Text style={styles.text}>{asset.role} - {asset.source} - {asset.path||'DESIGN PLACEHOLDER'}</Text><Button label={`Remove asset reference ${i+1}`} disabled={locked} onPress={()=>setAssetRefs(v=>v.filter((_,index)=>i!==index))} /></View>)}
      <Field accessibilityLabel="Supplied SEO target location" placeholder="Supplied SEO target location (optional)" value={seoLocation} onChangeText={setSeoLocation} editable={!locked} style={styles.input} />
      <Text style={styles.heading}>Design Preferences (optional)</Text>
      {['Modern','Luxury','Minimal','Corporate','Creative','Bold','Traditional','Dark','Custom'].map(style=><Button key={style} label={`${design.style===style?'Selected: ':''}${style} design`} disabled={locked} onPress={()=>setDesign(d=>({...d,style}))} />)}
      {DESIGN_FIELDS.map(([key,label,placeholder])=><Field key={key} accessibilityLabel={label} placeholder={placeholder} value={design[key]||''} onChangeText={v=>setDesign(d=>({...d,[key]:v}))} editable={!locked} style={styles.input} />)}
      <Field accessibilityLabel="Website design preference" placeholder="Design preference" value={designPreference} onChangeText={setDesignPreference} editable={!locked} style={styles.input} />
      <Field accessibilityLabel="Supplied SEO keywords" placeholder="Supplied target keywords, comma separated" value={keywords} onChangeText={setKeywords} editable={!locked} style={styles.input} />
      </>}
      {mode === 'CREATE_NEW' && <Field accessibilityLabel="Required website pages" placeholder="home,about,services,contact" value={pages} onChangeText={setPages} editable={!locked} autoCapitalize="none" style={styles.input} />}
      <Text style={styles.text}>Use the project ID explicitly configured for this client. The server verifies its workspace mapping.</Text>
      <Field accessibilityLabel="Configured Web Development project ID" placeholder="Configured project ID" value={projectId}
        autoCapitalize="none" autoCorrect={false} editable={!locked} onChangeText={value=>{setProjectId(value);setDesign({});clearReview();}} style={styles.input} />
      <Text style={styles.warning}>{!sessionReady?'Pair this device to continue.':!client?'Select an active client.':!projectId.trim()?'Enter the configured Project ID to continue.':mode==='CREATE_NEW'&&!frameworkConfirmed?'Explicitly select STATIC_HTML to continue.':mode==='CREATE_NEW'&&!websiteType?'Select a Website Type to continue.':mode==='CREATE_NEW'&&!description.trim()?'Enter a real business description to continue.':Object.entries(design).some(([k,v])=>['primary','accent'].includes(k)&&v&&!/^#[0-9a-f]{6}$/i.test(v))?'Design colours must use #RRGGBB.':'Review your draft requirements before creating a workflow.'}</Text>
      <Button label="Create workflow" disabled={blocked || !projectId.trim() || mode === 'CREATE_NEW' && (!description.trim() || !frameworkConfirmed || !websiteType) || Object.entries(design).some(([k,v])=>['primary','accent'].includes(k)&&v&&!/^#[0-9a-f]{6}$/i.test(v))} onPress={() => void execute('create')} />
      <Field accessibilityLabel="Existing Web Development workflow ID" placeholder="Workflow ID to resume" value={resumeId}
        autoCapitalize="none" autoCorrect={false} editable={!locked} onChangeText={setResumeId} style={styles.input} />
    </>}
    {!!workflow && <Text selectable style={styles.text}>Workflow: {workflow.id}{'\n'}Project: {workflow.context.projectId}{'\n'}Repository: {workflow.context.repository}</Text>}
    {!workflow && !!savedResumeId && <Button label="Resume existing workflow" disabled={locked} onPress={()=>{setResumeId(savedResumeId);setNotice('Existing workflow ID selected. Choose Resume workflow to fetch it explicitly.');}} />}
    {!!workflow && <Button label="Start new workflow" disabled={!!pending || !draftClient} onPress={()=>void startNewWorkflow()} />}
    <Button label={workflow ? 'Refresh workflow' : 'Resume workflow'} disabled={locked || (!workflow && !resumeId.trim())} onPress={() => void execute('refresh')} />
    {!!pending && <Button label="Cancel request" onPress={cancel} />}
    {!!workflow && <>
      <Text style={styles.text}>Mode: {workflow.mode || 'UPGRADE_EXISTING'}</Text>
      {(state==='IDLE' || state==='ARCHITECTURE_READY' && !workflow.beforeReport || state==='REQUIREMENTS_READY') && <Button label="Analyze project" disabled={blocked} onPress={() => void execute('analyze')} />}
      {workflow.mode==='CREATE_NEW' && ['REQUIREMENTS_READY','ANALYSIS_COMPLETE','DESIGN_VARIANTS_READY','DESIGN_LOCKED','ARCHITECTURE_READY','CHANGE_PLAN_READY'].includes(state||'') && <>
        <Button label="Prepare AI design brief" disabled={blocked} onPress={()=>void execute('design-brief',{useAI:true})} />
        <Report title="design brief" value={workflow.designBrief} />
        <Button label={workflow.designVariants?.length?'Generate More Variants':'Generate 3 UI variants'} disabled={blocked} onPress={()=>void execute('generate-designs')} />
        {workflow.designVariants?.map(variant=><View key={variant.id} style={styles.card}>
          <Text style={styles.heading}>{variant.name}</Text><Text style={styles.text}>{variant.evidence}</Text>{!!variant.refinement && <Text style={styles.warning}>{variant.refinement}{String.fromCharCode(10)}{variant.refinementStatus}</Text>}
          <Button label={`Preview ${variant.id}`} onPress={()=>setPreviewId(previewId===variant.id?'':variant.id)} />
          {previewId===variant.id && <><DesignPreview variant={variant} name={client?.name||'Client'} /><Button label={`Render desktop/mobile preview ${variant.id}`} disabled={blocked} onPress={()=>void execute('render-design-preview',{variantId:variant.id})} />{variant.renderedPreviews?.map(preview=><View key={preview.width}><Text style={styles.text}>MEASURED browser design preview - {preview.width}px - isolated preview, not production site</Text><Image source={{uri:'data:image/png;base64,'+preview.data}} accessibilityLabel={`Rendered ${preview.width}px design preview`} resizeMode="contain" style={{width:'100%',height:preview.width===390?450:230}} /></View>)}{variant.previewRenderStatus==='NOT_MEASURED' && <Text style={styles.warning}>Screenshot renderer unavailable. Design representation remains available above.</Text>}</>}
          <Button label={`${workflow.selectedDesignId===variant.id?'Selected: ':''}Select ${variant.id}`} disabled={blocked || state!=='DESIGN_VARIANTS_READY'} onPress={()=>void execute('select-design',{variantId:variant.id})} />
        </View>)}
        {workflow.selectedDesignId && state!=='DESIGN_LOCKED' && <>
          <Field accessibilityLabel="Refine Design instruction" placeholder="Variant B, blue theme; larger hero" value={refinement} onChangeText={setRefinement} editable={!blocked} style={styles.input} />
          <Button label="Refine Design" disabled={blocked||!refinement.trim()} onPress={()=>void execute('refine-design',{instruction:refinement})} />
          <Text style={styles.warning}>Approve Design locks the selected layout. It does not authorize file writes.</Text>
          <Button label="Approve Design" disabled={blocked} onPress={()=>void execute('approve-design',{approved:true,variantId:workflow.selectedDesignId})} />
        </>}
      </>}
      {workflow.mode==='CREATE_NEW' && workflow.designLock && !['REQUIREMENTS_READY','ANALYSIS_COMPLETE','DESIGN_VARIANTS_READY','DESIGN_LOCKED','ARCHITECTURE_READY','CHANGE_PLAN_READY'].includes(state||'') && <View style={styles.card}>
        <Text style={styles.heading}>Existing design variants</Text>
        <Text style={styles.text}>Saved history only. The approved design remains locked.</Text>
        {workflow.designVariants?.map(variant=><View key={'history-'+variant.id}>
          <Text selectable accessibilityLabel={`Existing design ${variant.id}`} style={styles.text}>{variant.name}{'\n'}Version: {variant.id} | Revision: {variant.revision}{'\n'}{workflow.designLock?.selectedVariantId===variant.id && workflow.designLock.revision===variant.revision?'SELECTED AND LOCKED':'Not selected'}</Text>
        </View>)}
      </View>}
      {!!workflow.approvals.length && <View style={styles.card}>
        <Text accessibilityLabel={`Applied file approvals: ${workflow.approvals.filter(a=>a.applied&&!a.rolledBack).length}/${workflow.approvals.length}`} style={styles.heading}>Applied file approvals: {workflow.approvals.filter(a=>a.applied&&!a.rolledBack).length}/{workflow.approvals.length}</Text>
        {workflow.approvals.map(approval=><Text key={'history-'+approval.approvalId} selectable accessibilityLabel={`File approval ${approval.approvalId}`} style={styles.text}>{approval.file}{'\n'}Status: {approval.rolledBack?'ROLLED BACK':approval.rejected?'REJECTED':approval.applied?'APPLIED':'PENDING'}{'\n'}ID: {approval.approvalId}{'\n'}SHA256: {workflow.plan.find(change=>change.file===approval.file)?.afterHash||'Unavailable'}</Text>)}
      </View>}
      <Report title="design lock" value={workflow.designLock} />
      <Report title="BEFORE report" open={openReport==='BEFORE report'} value={workflow.beforeReport} />
      {state === 'DESIGN_LOCKED' && workflow.mode === 'CREATE_NEW' && <Button label="Prepare architecture proposal" disabled={blocked} onPress={() => void execute('architecture')} />}
      <Report title="architecture proposal" value={workflow.architecture} />
      {(state === 'ARCHITECTURE_READY' || state === 'ANALYSIS_COMPLETE' && workflow.mode !== 'CREATE_NEW') && <Button label="Prepare change plan" disabled={blocked} onPress={() => void execute('plan')} />}
      {workflow.plan.map(change => <View key={change.file} style={styles.card}>
        <Text selectable style={styles.text}>{change.operation || 'UPDATE'}: {change.file}{'\n'}{change.reason}</Text>
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
      {state === 'WAITING_FOR_FILE_APPROVAL' && unapplied.length > 0 && <Button label="Reject selected changes" disabled={blocked || !selectedFiles.length}
        onPress={() => void execute('reject-files', { approvalIds: selectedFiles })} />}
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
      {['VALIDATION_PASSED','VALIDATION_FAILED'].includes(state||'') && <Button label="Run isolated browser checks" disabled={blocked} onPress={()=>void execute('runtime-check',{captureScreenshots:true})} />}
      <Report title="AFTER report" open={openReport==='AFTER report'} value={workflow.afterReport} />
      {workflow.beforeReport && <Button label="Generate BEFORE PDF" disabled={blocked} onPress={()=>void exportPdf('BEFORE')} />}
      {workflow.afterReport && <Button label="Generate AFTER PDF" disabled={blocked} onPress={()=>void exportPdf('AFTER')} />}
      {pdfReady && <Text accessibilityRole="link" onPress={()=>{if(Platform.OS==='web'){const link=document.createElement('a');link.href=pdfReady.url;link.download=`OneLeadQ-${pdfReady.phase}.pdf`;link.click();}else void Share.share({message:'Use the OneLeadQ web app to download the PDF report.'});}} style={styles.state}>Download PDF ? {pdfReady.phase}</Text>}
      <Button label="Load safe Git status and diff" disabled={blocked} onPress={() => void execute('git')} />
      {workflow.git && <Text style={styles.text}>Branch: {String(workflow.git.status.branch||'unknown')} ? {workflow.git.status.clean?'clean':'changes require review'}</Text>}
      {workflow.plan.filter(p=>workflow.filesChanged.includes(p.file)).map(p=><View key={'git-'+p.file} style={styles.card}><Text style={styles.heading}>{p.file} ? {p.operation||'UPDATE'}</Text><Text style={styles.text}>Before: {p.beforeHash||'absent'}{String.fromCharCode(10)}After: {p.afterHash}</Text><Report title={`Expand exact file review: ${p.file}`} value={p.content} /></View>)}
      {workflow.git?.newFiles?.filter(file=>!workflow.plan.some(p=>p.file===file.file)).map(file=><View key={file.file} style={styles.card}><Text style={styles.heading}>{file.file} ? NEW</Text><Text style={styles.text}>Before: absent{String.fromCharCode(10)}After: {file.afterHash}</Text><Report title={`View Diff: ${file.file}`} value={file.content} /></View>)}
      {workflow.git && <><Text style={styles.text}>{workflow.git.diffScope}</Text><Report title="safe Git diff" value={workflow.git.diff || 'No approved-file diff available.'} /></>}
      {state === 'VALIDATION_PASSED' && <>
        <Text style={styles.heading}>Commit message *</Text>
        {!commitMessage.trim() && <Text style={styles.warning}>Enter a commit message to continue.</Text>}
        <Field accessibilityLabel="Proposed commit message" placeholder="feat: create client website" value={commitMessage} editable={!blocked}
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
        <Text style={styles.heading}>{confirmation.kind === 'rollback' ? 'Remove unchanged files created by this workflow?' : confirmation.kind === 'files' ? 'Apply these file changes?' : confirmation.kind === 'commit' ? 'Create this commit?' : 'Push this commit to origin?'}</Text>
        <Text selectable style={styles.text}>{confirmation.kind === 'files' || confirmation.kind === 'rollback' ? confirmation.files.join('\n') : confirmation.kind === 'commit'
          ? `Message: ${reviewedCommit?.message || ''}\nFiles: ${workflow.filesChanged.join(', ')}\nReview the Git status/diff before confirming.`
          : JSON.stringify(workflow.pushProposal, null, 2)}</Text>
        <Button label="Cancel approval" onPress={() => setConfirmation(null)} />
        <Button label={confirmation.kind === 'rollback' ? 'Confirm: rollback created files' : confirmation.kind === 'files' ? 'Confirm: apply selected files' : confirmation.kind === 'commit' ? 'Confirm: commit changes' : 'Confirm: push changes'} disabled={blocked} onPress={confirm} />
      </View>}
      {['FAILED', 'WAITING_FOR_FILE_APPROVAL', 'VALIDATION_FAILED', 'VALIDATION_PASSED'].includes(state || '') && workflow.approvals.some(a => a.operation === 'CREATE' && a.operationId && a.applied && !a.rolledBack) && <Button label="Review rollback of created files" disabled={blocked}
        onPress={() => { const created = workflow.approvals.filter(a => a.operation === 'CREATE' && a.operationId && a.applied && !a.rolledBack); setConfirmation({ kind: 'rollback', ids: created.map(a => a.operationId!), files: created.map(a => a.file) }); }} />}
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
