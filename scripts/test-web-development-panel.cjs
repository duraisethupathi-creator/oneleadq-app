const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const flush = async () => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
};

function harness(authenticated = true, persisted = null) {
  const draftExports={};
  if(persisted)vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/storage/webDevelopmentDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:draftExports,require:()=>({__esModule:true,default:{getItem:async key=>persisted.get(key)||null,setItem:async(key,value)=>persisted.set(key,value)}})});
  let cursor = 0;
  let selectedClient = 'stable-client';
  let active = true;
  let command;let commandSequence=0;let incomingHandoff;
  let deferred;

  const slots = [];
  const effects = [];
  const calls = [];
  let pendingEffects = [];

  let sessionToken = authenticated ? 'fixture-only' : null;

  const workflow = {
    id: 'run-1',
    state: 'IDLE',
    context: {
      clientId: selectedClient,
      projectId: 'explicit-project',
    },
    plan: [],
    approvals: [],
    filesChanged: [],
  };

  const react = {
    useState(initial) {
      const i = cursor++;

      if (!(i in slots)) {
        slots[i] =
          typeof initial === 'function' ? initial() : initial;
      }

      return [
        slots[i],
        value => {
          slots[i] =
            typeof value === 'function'
              ? value(slots[i])
              : value;
        },
      ];
    },

    useRef(initial) {
      const i = cursor++;

      if (!(i in slots)) {
        slots[i] = { current: initial };
      }

      return slots[i];
    },

    useEffect(fn, deps) {
      const i = cursor++;
      const prev = effects[i];

      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((value, index) => value !== prev.deps[index]);

      if (changed) {
        pendingEffects.push(() => {
          prev?.cleanup?.();

          effects[i] = {
            deps,
            cleanup: fn(),
          };
        });
      }
    },
  };

  class Agent {
    async create(clientId, projectId, signal, options = {}) {
      calls.push({
        action: 'create',
        clientId,
        projectId,
        signal,
        options,
      });

      workflow.context.clientId = clientId;
      workflow.context.projectId = projectId;
      workflow.mode = options.mode || 'UPGRADE_EXISTING';
      if (workflow.mode === 'CREATE_NEW') workflow.state = 'REQUIREMENTS_READY';

      return structuredClone(workflow);
    }

    async get(id, signal) {
      calls.push({
        action: 'refresh',
        id,
        signal,
      });

      return structuredClone(workflow);
    }

    async act(id, action, input, signal) {
      calls.push({
        action,
        input,
        signal,
      });

      if (deferred) {
        return deferred;
      }

      if (action === 'analyze') {
        workflow.state = 'ANALYSIS_COMPLETE';
        workflow.beforeReport = {
          validationCommands: [
            'npm-typecheck',
            'not-allowed',
          ],
        };
      }

      if (action === 'plan') {
        workflow.state = 'CHANGE_PLAN_READY';
        workflow.plan = [
          {
            file: 'index.html',
            reason: 'Viewport',
            content: '<meta name="viewport">',
          },
        ];
      }
      if (action === 'architecture') { workflow.state = 'ARCHITECTURE_READY'; workflow.architecture = { framework: 'STATIC_HTML', pages: ['home'] }; }
      if (action === 'reject-files') workflow.approvals[0].rejected = true;

      if (action === 'propose-files') {
        workflow.state = 'WAITING_FOR_FILE_APPROVAL';
        workflow.approvals = [
          {
            file: 'index.html',
            approvalId: 'file-1',
            applied: false,
          },
        ];
      }

      if (action === 'approve-files') {
        workflow.approvals[0].applied = true;
        workflow.filesChanged = ['index.html'];
      }

      if (action === 'validate') {
        workflow.state = 'VALIDATION_PASSED';
      }

      if (action === 'propose-commit') {
        workflow.state = 'WAITING_FOR_COMMIT_APPROVAL';
        workflow.commitApprovalId = 'commit-1';
      }

      if (action === 'approve-commit') {
        workflow.state = 'COMMITTED';
      }

      if(action==='generate-designs'){workflow.designVariants=[1,2,3].map(i=>({id:'design-'+i,name:'Variant '+i,spec:{layout:['split','poster','stacked'][i-1],primary:'#155e54',accent:'#e9bd73',background:'#fff',ink:'#123',cta:'Enquire',sections:['Services','Contact'],typography:'Sans',cards:'outline',mobile:'stack',style:'Modern'}}));workflow.state='DESIGN_VARIANTS_READY';}
      if(action==='select-design')workflow.selectedDesignId=input.variantId;
      if(action==='approve-design'){workflow.designLock={state:'APPROVED',selectedVariantId:input.variantId};workflow.state='DESIGN_LOCKED';}
      if (action === 'propose-push') {
        workflow.state = 'WAITING_FOR_PUSH_APPROVAL';
        workflow.pushApprovalId = 'push-1';
        workflow.pushProposal = {
          branch: 'main',
          headCommit: 'hash',
          remoteName: 'origin',
        };
      }

      if (action === 'approve-push') {
        workflow.state = 'PUSHED';
      }

      return structuredClone(workflow);
    }
  }

  const sessionMock = {
    getWebDevelopmentSessionToken: async () => sessionToken,

    getSessionToken: async () => sessionToken,

    hasWebDevelopmentSession: () => Boolean(sessionToken),
    getWebDevelopmentSessionExpiry: () =>
  sessionToken ? Date.now() + 30 * 60 * 1000 : null,

    clearWebDevelopmentSession: () => {
      sessionToken = null;
    },

    pairWebDevelopmentSession: async code => {
      calls.push({
        action: 'pair-session',
        code,
      });

      sessionToken = 'fixture-paired-session';

      return sessionToken;
    },

    pairWebDevelopmentDevice: async code => {
      calls.push({
        action: 'pair-session',
        code,
      });

      sessionToken = 'fixture-paired-session';

      return sessionToken;
    },
  };

  const source = fs.readFileSync(
    'src/components/WebDevelopmentPanel.tsx',
    'utf8',
  );

  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const exports = {};

  vm.runInNewContext(code, {
    exports,
    AbortController,
    Error,

    require(name) {
      if (name === './webDevelopmentWebsiteTypes') {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/webDevelopmentWebsiteTypes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});return exports;}
      if (name === 'react') {
        return react;
      }

      if (name === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => ({
            type,
            props,
          }),

          jsxs: (type, props) => ({
            type,
            props,
          }),
        };
      }

      if (name === 'react-native') {
        return {
          Platform:{OS:'web'},Share:{share:async()=>{}},
          Pressable: 'Pressable',
          Text: 'Text',
          TextInput: 'TextInput',
          View: 'View',

          StyleSheet: {
            create: value => value,
          },
        };
      }

      if(name.endsWith('/webDevelopmentDraft'))return persisted?draftExports:{loadWebDraft:async()=>null,saveWebDraft:async()=>{},parseDesignDraft:()=>({}),saveNewWebForm:async()=>{},opensNewWebForm:async()=>false};
      if (name.endsWith('/webDevelopmentAgent')) {
        return {
          WebDevelopmentAgent: Agent,
        };
      }

      if (name.endsWith('/webDevelopmentSession')) {
        return sessionMock;
      }

      if (name.endsWith('/clientStorage')) {
        return {
          loadCurrentClientId: async () => selectedClient,
          saveCurrentClientId: async id => { selectedClient = id; },

          loadClients: async () => [
            {
              id: 'stable-client',
              name: 'Client',
              status: 'active',
            },
            {
              id: 'other-client',
              name: 'Other',
              status: 'active',
            },
          ],
        };
      }

      throw new Error(name);
    },
  });

  function render() {
    cursor = 0;

    const tree = exports.default({
      active,command,handoff:incomingHandoff,onCommandConsumed:()=>{command=undefined;},
      getSessionToken: authenticated
        ? async () => sessionToken
        : undefined,
    });

    const updates = pendingEffects;
    pendingEffects = [];

    updates.forEach(fn => fn());

    return tree;
  }

  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') {
      return [];
    }

    return [
      ...(predicate(node) ? [node] : []),

      ...[node.props?.children]
        .flat(Infinity)
        .flatMap(child => nodes(child, predicate)),
    ];
  }

  const find = label =>
    nodes(
      render(),
      node =>
        node.props?.label === label ||
        node.props?.accessibilityLabel === label,
    )[0];

  return {
    calls,
    fixture(value){Object.assign(workflow,value);},
    handoff(value){incomingHandoff=value;render();},
    command(text,clientId=selectedClient){command={text,clientId,nonce:++commandSequence};render();},
    find,
    render,

    setClient(value) {
      selectedClient = value;
    },

    background() {
      active = false;
      render();
    },

    foreground() {
      active = true;
      render();
    },

    defer(value) {
      deferred = value;
    },

    async tap(label) {
      const node = find(label);

      assert.ok(node, label);
      assert.ok(
        !node.props.disabled,
        label + ' enabled',
      );

      node.props.onPress();

      await flush();

      render();
    },

    input(label, value) {
      const node = find(label);

      assert.ok(node, label);

      node.props.onChangeText(value);

      render();
    },

    check() {
      const checkbox = nodes(
        render(),
        node =>
          node.props?.accessibilityRole === 'checkbox',
      )[0];

      assert.ok(checkbox, 'checkbox');

      checkbox.props.onPress();

      render();
    },
  };
}

async function main() {
  const off = harness(false);

  off.render();
  await flush();
  off.render();await flush();

  off.input(
    'Configured Web Development project ID',
    'explicit-project',
  );

  assert.equal(
    off.find('Create workflow').props.disabled,
    true,
  );

  assert.equal(off.calls.length, 0);

  const h = harness();

  h.render();
  await flush();
  h.render();await flush();

  assert.equal(
    h.find('Create workflow').props.disabled,
    true,
  );

  h.input(
    'Configured Web Development project ID',
    'explicit-project',
  );

  await h.tap('Create workflow');

  assert.equal(
    h.calls[0].clientId,
    'stable-client',
  );

  assert.equal(
    h.calls[0].projectId,
    'explicit-project',
  );

  await h.tap('Analyze project');
  await h.tap('Prepare change plan');
  await h.tap(
    'Propose file approvals (no writes)',
  );

  assert.equal(
    h.find(
      'Review approval for selected files',
    ).props.disabled,
    true,
  );

  h.check();

  await h.tap(
    'Review approval for selected files',
  );

  assert.ok(
    !h.calls.some(
      call => call.action === 'approve-files',
    ),
  );

  await h.tap('Cancel approval');

  assert.ok(
    !h.calls.some(
      call => call.action === 'approve-files',
    ),
  );

  await h.tap(
    'Review approval for selected files',
  );

  await h.tap(
    'Confirm: apply selected files',
  );

  assert.equal(
    h.calls.find(
      call => call.action === 'approve-files',
    ).input.approvalIds[0],
    'file-1',
  );

  assert.equal(
    h.find(
      'Run selected validation checks',
    ).props.disabled,
    true,
  );

  h.check();

  await h.tap(
    'Run selected validation checks',
  );

  assert.equal(
    h.calls.find(
      call => call.action === 'validate',
    ).input.commandIds[0],
    'npm-typecheck',
  );

  h.input(
    'Proposed commit message',
    'Reviewed commit',
  );

  await h.tap(
    'Prepare commit approval (no commit)',
  );

  await h.tap('Review commit approval');

  assert.ok(
    !h.calls.some(
      call => call.action === 'approve-commit',
    ),
  );

  await h.tap(
    'Confirm: commit changes',
  );

  await h.tap(
    'Prepare push approval (no push)',
  );

  await h.tap('Review push approval');

  assert.ok(
    !h.calls.some(
      call => call.action === 'approve-push',
    ),
  );

  await h.tap(
    'Confirm: push changes',
  );

  assert.equal(
    h.calls.find(
      call => call.action === 'approve-push',
    ).input.approvalId,
    'push-1',
  );

  const changed = harness();

  changed.render();
  await flush();
  changed.render();await flush();

  changed.input(
    'Configured Web Development project ID',
    'explicit-project',
  );

  await changed.tap('Create workflow');

  changed.setClient('other-client');

  await changed.tap('Analyze project');

  assert.ok(
    !changed.calls.some(
      call => call.action === 'analyze',
    ),
  );

  const cancelled = harness();

  cancelled.render();
  await flush();
  cancelled.render();await flush();

  cancelled.input(
    'Configured Web Development project ID',
    'explicit-project',
  );

  await cancelled.tap('Create workflow');

  cancelled.defer(
    new Promise(() => {}),
  );

  await cancelled.tap('Analyze project');

  cancelled.background();

  assert.equal(
    cancelled.calls.find(
      call => call.action === 'analyze',
    ).signal.aborted,
    true,
  );

  cancelled.foreground();

  assert.equal(
    cancelled.find(
      'Analyze project',
    ).props.disabled,
    true,
    'cancelled operation requires refresh',
  );

  const creation = harness(); creation.render(); await flush();
  creation.render();await flush();
  creation.render();await flush();
  creation.render();await flush();
  creation.input('Configured Web Development project ID', 'explicit-project');
  await creation.tap('CREATE_NEW');
  assert.equal(creation.find('Create workflow').props.disabled, true);
  creation.input('Website requirements and real page content', 'Actual client-approved requirements.');
  await creation.tap('Select STATIC_HTML creation framework');
  assert.equal(creation.find('Create workflow').props.disabled,true,'website type requires explicit selection');
  await creation.tap('Interior Design / Home Decor');
  await creation.tap('Create workflow');
  assert.equal(creation.calls[0].options.mode, 'CREATE_NEW');
  assert.equal(creation.calls[0].options.requirements.websiteType,'INTERIOR');
  assert.equal(creation.calls[0].options.requirements.businessName, 'Client');
  await creation.tap('Analyze project');
  assert.equal(creation.find('Prepare change plan'), undefined);
  await creation.tap('Generate 3 UI variants');
  await creation.tap('Select design-2');
  await creation.tap('Approve Design');
  await creation.tap('Prepare architecture proposal');
  await creation.tap('Prepare change plan');
  await creation.tap('Propose file approvals (no writes)');
  creation.check(); await creation.tap('Reject selected changes');
  assert.ok(!creation.calls.some(call => call.action === 'approve-files'));
  const transfer=harness();transfer.render();await flush();transfer.render();await flush();
  transfer.handoff({clientId:'stable-client',mode:'CREATE_NEW',intent:'create',nonce:1,websiteType:'BUSINESS'});await flush();transfer.render();assert.equal(transfer.calls.length,0,'handoff never creates workflow or analyzes automatically');
  assert.ok(transfer.find('CREATE_NEW '+String.fromCharCode(183)+' selected'),'handoff selects requested mode after draft hydration');
  assert.ok(transfer.find('Selected: Business / Corporate'),'launcher website selection reaches existing setup without creating a workflow');
  transfer.handoff({clientId:'other-client',mode:'UPGRADE_EXISTING',intent:'upgrade',nonce:2});await flush();transfer.render();assert.ok(transfer.find('CREATE_NEW '+String.fromCharCode(183)+' selected'),'other client handoff cannot change mode');
  const spoken=harness();spoken.render();await flush();spoken.render();await flush();
  spoken.command('Changes apply pannu');await flush();assert.equal(spoken.calls.length,0,'voice cannot apply changes');
  spoken.command('New website create pannu');await flush();
  spoken.input('Configured Web Development project ID','explicit-project');spoken.input('Website requirements and real page content','Verified requirements.');
  await spoken.tap('Select STATIC_HTML creation framework');await spoken.tap('Interior Design / Home Decor');await spoken.tap('Create workflow');await spoken.tap('Generate 3 UI variants');
  spoken.command('Second design blue theme la refine pannu');await flush();spoken.render();
  assert.equal(spoken.calls.find(c=>c.action==='select-design').input.variantId,'design-2');
  assert.equal(spoken.find('Refine Design instruction').props.value,'Second design blue theme la refine pannu');
  spoken.command('Design approve');await flush();assert.ok(!spoken.calls.some(c=>c.action==='approve-design'),'voice opens review, never approves');
  const persisted=new Map();const fresh=harness(true,persisted);fresh.render();await flush();fresh.render();await flush();
  fresh.input('Configured Web Development project ID','stage16-test-site');fresh.input('Website requirements and real page content','Reusable verified requirements');await fresh.tap('Create workflow');
  const callCount=fresh.calls.length;await fresh.tap('Start new workflow');assert.equal(fresh.calls.length,callCount,'start-new performs no backend operation');assert.ok(fresh.find('Create workflow'));assert.equal(fresh.find('Configured Web Development project ID').props.value,'');assert.equal(fresh.find('Existing Web Development workflow ID').props.value,'');assert.equal(fresh.find('Website requirements and real page content').props.value,'Reusable verified requirements');
  const oldDraft=JSON.parse(persisted.get('oneleadq:web-draft:v1:stable-client'));assert.equal(oldDraft.workflowId,'run-1');assert.equal(oldDraft.projectId,'stage16-test-site','original saved draft remains intact');
  const reopened=harness(true,persisted);reopened.render();await flush();reopened.render();await flush();assert.ok(reopened.find('Create workflow'),'reopening stays on form');assert.equal(reopened.calls.length,0);assert.equal(reopened.find('Configured Web Development project ID').props.value,'');assert.equal(reopened.find('Existing Web Development workflow ID').props.value,'');await reopened.tap('Resume existing workflow');assert.equal(reopened.find('Existing Web Development workflow ID').props.value,'run-1');await reopened.tap('Resume workflow');assert.ok(reopened.find('Start new workflow'),'old workflow remains explicitly resumable');
  await reopened.tap('Start new workflow');reopened.input('Configured Web Development project ID','stage16-create-test');await reopened.tap('Create workflow');assert.equal(reopened.calls.at(-1).projectId,'stage16-create-test');assert.equal(reopened.calls.at(-1).clientId,'stable-client');
  const beforeOtherClient=spoken.calls.length;spoken.command('3 design kaatu','other-client');await flush();assert.equal(spoken.calls.length,beforeOtherClient,'commands are isolated by stable client ID');
  const history=harness();history.render();await flush();history.render();await flush();
  const snapshot=JSON.parse(fs.readFileSync('reports/stage16-file-approvals.json','utf8')).finalVerification;
  history.fixture({id:snapshot.workflowId,state:'VALIDATION_PASSED',mode:'CREATE_NEW',designVariants:snapshot.variants,selectedDesignId:snapshot.designId,designLock:{state:'APPROVED',selectedVariantId:snapshot.designId,revision:1},approvals:snapshot.approvals,plan:snapshot.approvals.map(a=>({file:a.file,afterHash:'verified-fixture-hash',reason:'Already approved fixture'})),filesChanged:snapshot.approvals.map(a=>a.file)});
  history.input('Existing Web Development workflow ID',snapshot.workflowId);await history.tap('Resume workflow');
  for(const v of snapshot.variants)assert.ok(history.find('Existing design '+v.id),'validated history keeps all three variant identities visible');
  assert.ok(history.find('Applied file approvals: 10/10'),'exact applied count visible');
  for(const a of snapshot.approvals)assert.ok(history.find('File approval '+a.approvalId),'consumed approval identity remains visible');
  assert.equal(history.find('Generate More Variants'),undefined);assert.equal(history.find('Approve Design'),undefined);assert.equal(history.find('Review approval for selected files'),undefined);
  assert.ok(history.calls.every(c=>c.action==='refresh'),'history inspection performs GET only');
  console.log(
    'PASS: Web panel explicit client/project, session authentication, file/commit/push confirmations, validation selection, client switch and background abort',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
