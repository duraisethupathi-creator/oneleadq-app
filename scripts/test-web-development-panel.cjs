const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const flush = async () => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
};

function harness(authenticated = true) {
  let cursor = 0;
  let selectedClient = 'stable-client';
  let active = true;
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
    async create(clientId, projectId, signal) {
      calls.push({
        action: 'create',
        clientId,
        projectId,
        signal,
      });

      workflow.context.clientId = clientId;
      workflow.context.projectId = projectId;

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
          Pressable: 'Pressable',
          Text: 'Text',
          TextInput: 'TextInput',
          View: 'View',

          StyleSheet: {
            create: value => value,
          },
        };
      }

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
      active,
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

  console.log(
    'PASS: Web panel explicit client/project, session authentication, file/commit/push confirmations, validation selection, client switch and background abort',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});