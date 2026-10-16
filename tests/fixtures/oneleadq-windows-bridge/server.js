const approvalGuards=require('./approvalGuards');
const {parseStatus,commitReviewed}=require('./gitSafety');
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();

// --------------------------------------------------
// STAGE 15.10 - BRIDGE API AUTHENTICATION
//
// Secret is read only from environment variables.
// Never hard-code the token in source control.
// --------------------------------------------------

const BRIDGE_API_TOKEN =
  process.env.BRIDGE_API_TOKEN?.trim();

if (!BRIDGE_API_TOKEN) {
  console.error(
    "SECURITY ERROR: BRIDGE_API_TOKEN is not configured"
  );

  process.exit(1);
}

function requireBridgeAuth(req, res, next) {
  const authorization =
    req.get("authorization") || "";

  const prefix = "Bearer ";

  if (!authorization.startsWith(prefix)) {
    return res.status(401).json({
      ok: false,
      error: "Bridge authentication required",
    });
  }

  const suppliedToken = authorization
    .slice(prefix.length)
    .trim();

  if (
    !suppliedToken ||
    suppliedToken !== BRIDGE_API_TOKEN
  ) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Bridge authentication token",
    });
  }

  next();
}
const PORT = 3010;

// --------------------------------------------------
// STAGE 15.10 - NETWORK BINDING HARDENING
//
// Safe default: localhost only.
// BRIDGE_HOST=0.0.0.0 must be explicitly configured
// when authenticated Android/LAN access is required.
// --------------------------------------------------

const BRIDGE_HOST =
  process.env.BRIDGE_HOST?.trim() ||
  "127.0.0.1";

const ALLOWED_BRIDGE_HOSTS = new Set([
  "127.0.0.1",
  "0.0.0.0",
]);

if (!ALLOWED_BRIDGE_HOSTS.has(BRIDGE_HOST)) {
  console.error(
    "SECURITY ERROR: Invalid BRIDGE_HOST"
  );
  process.exit(1);
}

// --------------------------------------------------
// STAGE 15.10 - CORS HARDENING
//
// Native apps / PowerShell normally send no Origin,
// so those requests are allowed.
// Browser requests must come from an approved origin.
// --------------------------------------------------

const ALLOWED_BROWSER_ORIGINS = new Set([
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
]);

const corsOptions = {
  origin(origin, callback) {
    // Allow native apps, PowerShell, curl, etc.
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_BROWSER_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    const corsError =
      new Error("Browser origin is not allowed");

    corsError.code = "CORS_BLOCKED_ORIGIN";

    return callback(corsError);
  },

  methods: [
    "GET",
    "POST",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  credentials: false,

  maxAge: 600,
};

app.use(cors(corsOptions));

// Convert blocked browser origins into a controlled
// security response instead of a generic HTTP 500.
app.use((err, req, res, next) => {
  if (err?.code === "CORS_BLOCKED_ORIGIN") {
    return res.status(403).json({
      ok: false,
      error: "Browser origin is not allowed",
    });
  }

  next(err);
});
app.use(express.json({ limit: "2mb" }));

const WORKSPACES_FILE = path.join(__dirname, "workspaces.json");

const BLOCKED_NAMES = new Set([
  ".env",
  ".git",
  "node_modules",
  ".npmrc",
  ".ssh",
  "credentials.json",
  "secrets.json",
]);

// Pending approvals exist only in memory.
// Restarting the Bridge automatically cancels them.
const pendingApprovals = new Map();
// Pending Git commit approvals also exist only in memory.
// Restarting the Bridge automatically cancels them.
//
// Git safety rules:
// - No automatic commit.
// - No push.
// - No reset.
// - No checkout.
// - No arbitrary Git arguments from the client.
// - A commit can happen only after explicit approval.
const pendingGitApprovals = new Map();

// Pending branch operations are kept separate from commit approvals.
// Restarting the Bridge automatically cancels them.
const pendingGitBranchApprovals = new Map();

// Pending Git push operations are kept separate from
// commit and branch approvals.
// Restarting the Bridge automatically cancels them.
const pendingGitPushApprovals = new Map();

function validateGitRemoteName(remoteName) {
  if (typeof remoteName !== "string") {
    throw new Error("Git remote name is required");
  }

  const cleanName = remoteName.trim();

  if (!cleanName) {
    throw new Error("Git remote name is required");
  }

  if (cleanName.length > 50) {
    throw new Error(
      "Git remote name must be 50 characters or less"
    );
  }

  // Conservative remote-name allowlist.
  // Examples: origin, upstream
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleanName)) {
    throw new Error(
      "Git remote name contains unsupported characters"
    );
  }

  return cleanName;
}

function validateGitBranchName(branchName) {
  if (typeof branchName !== "string") {
    throw new Error("Branch name is required");
  }

  const cleanName = branchName.trim();

  if (!cleanName) {
    throw new Error("Branch name is required");
  }

  if (cleanName.length > 100) {
    throw new Error(
      "Branch name must be 100 characters or less"
    );
  }

  // Conservative allowlist for OneLeadQ-created branches.
  // Examples:
  // feature/meta-ads
  // fix/login-error
  // stage-15/windows-bridge
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(cleanName)
  ) {
    throw new Error(
      "Branch name contains unsupported characters"
    );
  }

  if (
    cleanName.includes("..") ||
    cleanName.includes("//") ||
    cleanName.endsWith("/") ||
    cleanName.endsWith(".") ||
    cleanName.endsWith(".lock") ||
    cleanName.includes("@{")
  ) {
    throw new Error("Unsafe Git branch name");
  }

  return cleanName;
}

function validateCommitMessage(message) {
  if (typeof message !== "string") {
    throw new Error("Commit message is required");
  }

  const cleanMessage = message.trim();

  if (!cleanMessage) {
    throw new Error("Commit message is required");
  }

  if (cleanMessage.length > 120) {
    throw new Error(
      "Commit message must be 120 characters or less"
    );
  }

  if (/[\r\n]/.test(cleanMessage)) {
    throw new Error(
      "Commit message must be a single line"
    );
  }

  return cleanMessage;
}
function loadWorkspaces() {
  try {
    const raw = fs.readFileSync(WORKSPACES_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!Array.isArray(data.workspaces)) {
      throw new Error("workspaces must be an array");
    }

    return data.workspaces;
  } catch (error) {
    console.error(
      "Failed to load workspaces.json:",
      error.message
    );
    return [];
  }
}

function getApprovedWorkspace(workspaceId) {
  return (
    loadWorkspaces().find(
      (workspace) =>
        workspace.id === workspaceId &&
        workspace.enabled === true
    ) || null
  );
}

function isSensitivePathPart(part) {
  const name = part.toLowerCase();

  // Existing exact protected names.
  if (
    [...BLOCKED_NAMES].some(
      (blocked) => name === blocked.toLowerCase()
    )
  ) {
    return true;
  }

  // Block all environment files:
  // .env, .env.local, .env.production, etc.
  if (name === ".env" || name.startsWith(".env.")) {
    return true;
  }

  // Common private credentials / authentication files.
  if (
    name === ".git-credentials" ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    name.startsWith("credentials.") ||
    name.startsWith("secrets.")
  ) {
    return true;
  }

  // Private keys, certificates and key stores.
  const sensitiveExtensions = [
    ".pem",
    ".key",
    ".p12",
    ".pfx",
  ];

  if (
    sensitiveExtensions.some(
      (extension) => name.endsWith(extension)
    )
  ) {
    return true;
  }

  return false;
}

function containsBlockedPart(relativePath) {
  const parts = relativePath
    .split(/[\\/]+/)
    .filter(Boolean);

  return parts.some(isSensitivePathPart);
}

function isPathInsideRoot(rootPath, candidatePath) {
  const relative = path.relative(
    rootPath,
    candidatePath
  );

  return (
    relative === "" ||
    (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    )
  );
}

function assertRealPathInsideWorkspace(
  workspaceRoot,
  targetPath
) {
  const realWorkspaceRoot =
    fs.realpathSync.native(workspaceRoot);

  let currentPath = targetPath;

  // For new files, walk upward until an existing
  // parent is found. This also catches junctions
  // and symlinks in parent directories.
  while (!fs.existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      throw new Error(
        "Unable to resolve safe filesystem path"
      );
    }

    currentPath = parentPath;
  }

  const realExistingPath =
    fs.realpathSync.native(currentPath);

  if (
    !isPathInsideRoot(
      realWorkspaceRoot,
      realExistingPath
    )
  ) {
    throw new Error(
      "Symlink or junction outside approved workspace is blocked"
    );
  }
}

function resolveSafePath(workspace, requestedPath = "") {
  if (typeof requestedPath !== "string") {
    throw new Error("Invalid path");
  }

  if (requestedPath.includes("\0")) {
    throw new Error("Invalid path");
  }

  if (path.isAbsolute(requestedPath)) {
    throw new Error("Absolute paths are not allowed");
  }

  const workspaceRoot = path.resolve(workspace.path);
  const targetPath = path.resolve(
    workspaceRoot,
    requestedPath
  );

  const relative = path.relative(
    workspaceRoot,
    targetPath
  );

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "Path outside approved workspace is blocked"
    );
  }

  if (containsBlockedPart(relative)) {
    throw new Error("Protected path is blocked");
  }

  assertRealPathInsideWorkspace(
    workspaceRoot,
    targetPath
  );

  return {
    workspaceRoot,
    targetPath,
    relativePath: relative || ".",
  };
}

function getWorkspaceOrReject(req, res) {
  const workspace = getApprovedWorkspace(
    req.params.workspaceId
  );

  if (!workspace) {
    res.status(403).json({
      ok: false,
      error: "Workspace is not approved",
    });

    return null;
  }

  if (!fs.existsSync(workspace.path)) {
    res.status(404).json({
      ok: false,
      error: "Workspace is not available",
    });

    return null;
  }

  return workspace;
}

function runGit(workspacePath, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd: workspacePath,
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          return reject(
            new Error(
              stderr?.trim() ||
                error.message ||
                "Git command failed"
            )
          );
        }

        resolve(args.includes("-z") ? stdout : stdout.trim());
      }
    );
    if(input !== undefined){child.stdin.on("error",()=>{});child.stdin.end(input);}
  });
}


// --------------------------------------------------
// SAFE TERMINAL COMMAND ALLOWLIST
//
// Security rules:
// - No shell execution.
// - No arbitrary command strings.
// - Only exact command IDs below are allowed.
// - Commands run only inside approved workspaces.
// - No PowerShell, cmd.exe, bash, sh or arbitrary scripts.
// --------------------------------------------------

const SAFE_TERMINAL_COMMANDS = Object.freeze({
  'npm-lint': { executable: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'lint'], timeout: 120000 },
  "npm-typecheck": {
    executable: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", "run", "typecheck"],
    timeout: 120000,
  },
  "npm-test": {
    executable: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", "test", "--", "--runInBand"],
    timeout: 120000,
  },
  "npm-build": {
    executable: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd", "run", "build"],
    timeout: 180000,
  },
  "git-status": {
    executable: "git",
    args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    timeout: 10000,
  },
  "git-diff-stat": {
    executable: "git",
    args: ["diff", "--stat"],
    timeout: 10000,
  },
});

function runSafeTerminalCommand(
  workspacePath,
  commandId
) {
  const command = SAFE_TERMINAL_COMMANDS[commandId];

  if (!command) {
    return Promise.reject(
      new Error("Terminal command is not allowlisted")
    );
  }

  return new Promise((resolve, reject) => {
    execFile(
      command.executable,
      command.args,
      {
        cwd: workspacePath,
        windowsHide: true,
        timeout: command.timeout,
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      },
      (error, stdout, stderr) => {
        const result = {
          commandId,
          exitCode:
            typeof error?.code === "number"
              ? error.code
              : error
                ? 1
                : 0,
          stdout: stdout?.trim() || "",
          stderr: stderr?.trim() || "",
        };

        if (error) {
          const terminalError = new Error(
            result.stderr ||
              error.message ||
              "Safe terminal command failed"
          );

          terminalError.result = result;
          return reject(terminalError);
        }

        resolve(result);
      }
    );
  });
}
function makeApprovalId() {
  return `APR-${crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase()}`;
}

function buildSimplePreview(oldContent, newContent) {
  if (oldContent === newContent) {
    return {
      changed: false,
      oldLength: oldContent.length,
      newLength: newContent.length,
    };
  }

  return {
    changed: true,
    oldLength: oldContent.length,
    newLength: newContent.length,
  };
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "running",
  });
});

// --------------------------------------------------
// APPROVED WORKSPACES
// --------------------------------------------------

// --------------------------------------------------
// STAGE 15.10 - PROTECT API ROUTES
//
// /health remains public for simple availability checks.
// Every route declared below this middleware requires:
// Authorization: Bearer <BRIDGE_API_TOKEN>
// --------------------------------------------------

app.use(requireBridgeAuth);
app.use((req,res,next)=>{approvalGuards.prune([pendingApprovals,pendingGitApprovals,pendingGitBranchApprovals,pendingGitPushApprovals]);next();});
require('./creation').mountCreation(app, { getApprovedWorkspace, resolveSafePath, runGit });
const updateRecovery=require('./updateRecovery').mountUpdateRecovery(app,{getApprovedWorkspace,resolveSafePath,runGit});

app.get("/workspaces", (req, res) => {
  const safeWorkspaces = loadWorkspaces()
    .filter((workspace) => workspace.enabled === true)
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      enabled: true,
      available: fs.existsSync(workspace.path),
    }));

  res.json({
    ok: true,
    count: safeWorkspaces.length,
    workspaces: safeWorkspaces,
  });
});

// --------------------------------------------------
// WORKSPACE STATUS
// --------------------------------------------------

app.get(
  "/workspaces/:workspaceId/status",
  (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    res.json({
      ok: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        available: true,
      },
    });
  }
);

// --------------------------------------------------
// READ-ONLY FILE LIST
// --------------------------------------------------

app.get(
  "/workspaces/:workspaceId/files",
  (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const requestedPath =
        typeof req.query.path === "string"
          ? req.query.path
          : "";

      const safe = resolveSafePath(
        workspace,
        requestedPath
      );

      if (!fs.existsSync(safe.targetPath)) {
        return res.status(404).json({
          ok: false,
          error: "Path not found",
        });
      }

      const stats = fs.statSync(safe.targetPath);

      if (!stats.isDirectory()) {
        return res.status(400).json({
          ok: false,
          error: "Requested path is not a directory",
        });
      }

      const items = fs
        .readdirSync(safe.targetPath, {
          withFileTypes: true,
        })
        .filter(
          (item) =>
            !containsBlockedPart(item.name)
        )
        .map((item) => ({
          name: item.name,
          type: item.isDirectory()
            ? "directory"
            : item.isFile()
            ? "file"
            : "other",
        }))
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        });

      res.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        path: safe.relativePath,
        count: items.length,
        items,
      });
    } catch (error) {
      res.status(403).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// READ-ONLY FILE READ
// --------------------------------------------------

app.get(
  "/workspaces/:workspaceId/file",
  (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const requestedPath = req.query.path;

      if (
        typeof requestedPath !== "string" ||
        !requestedPath.trim()
      ) {
        return res.status(400).json({
          ok: false,
          error: "File path is required",
        });
      }

      const safe = resolveSafePath(
        workspace,
        requestedPath
      );

      if (!fs.existsSync(safe.targetPath)) {
        return res.status(404).json({
          ok: false,
          error: "File not found",
        });
      }

      const stats = fs.statSync(safe.targetPath);

      if (!stats.isFile()) {
        return res.status(400).json({
          ok: false,
          error: "Requested path is not a file",
        });
      }

      const MAX_FILE_SIZE = 1024 * 1024;

      if (stats.size > MAX_FILE_SIZE) {
        return res.status(413).json({
          ok: false,
          error: "File is too large to read",
        });
      }

      const content = fs.readFileSync(
        safe.targetPath,
        "utf8"
      );

      res.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        path: safe.relativePath,
        size: stats.size,
        content,
      });
    } catch (error) {
      res.status(403).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// READ-ONLY GIT STATUS
// --------------------------------------------------

app.get(
  "/workspaces/:workspaceId/git/status",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const insideRepo = await runGit(
        workspace.path,
        ["rev-parse", "--is-inside-work-tree"]
      );

      if (insideRepo !== "true") {
        return res.status(400).json({
          ok: false,
          error: "Workspace is not a Git repository",
        });
      }

      const branch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      const changedFiles = parseStatus(status);

      res.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          repository: true,
          branch: branch || "(detached HEAD)",
          clean: changedFiles.length === 0,
          changedCount: changedFiles.length,
          changedFiles,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// READ-ONLY GIT DIFF
// --------------------------------------------------

app.get(
  "/workspaces/:workspaceId/git/diff",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const diff = await runGit(
        workspace.path,
        ["diff", "--no-ext-diff"]
      );

      res.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          mode: "read-only",
          diff,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// PROPOSE FILE CHANGE
//
// IMPORTANT:
// This does NOT modify the file.
// It only creates a temporary approval request.
// --------------------------------------------------

app.post(
  "/workspaces/:workspaceId/write/propose",
  (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const { path: requestedPath, content } = req.body;

      if (
        typeof requestedPath !== "string" ||
        !requestedPath.trim()
      ) {
        return res.status(400).json({
          ok: false,
          error: "File path is required",
        });
      }

      if (typeof content !== "string") {
        return res.status(400).json({
          ok: false,
          error: "File content must be text",
        });
      }

      if (Buffer.byteLength(content, "utf8") > 1024 * 1024) {
        return res.status(413).json({
          ok: false,
          error: "Proposed file is too large",
        });
      }

      const safe = resolveSafePath(
        workspace,
        requestedPath
      );

      if (!fs.existsSync(safe.targetPath)) {
        return res.status(404).json({
          ok: false,
          error:
            "For safety, Stage 15.6 can only modify an existing file",
        });
      }

      const stats = fs.statSync(safe.targetPath);

      if (!stats.isFile()) {
        return res.status(400).json({
          ok: false,
          error: "Target is not a file",
        });
      }

      if (stats.size > 1024 * 1024) {
        return res.status(413).json({
          ok: false,
          error: "Existing file is too large",
        });
      }

      const oldContent = fs.readFileSync(
        safe.targetPath,
        "utf8"
      );

      const preview = buildSimplePreview(
        oldContent,
        content
      );

      if (!preview.changed) {
        return res.status(400).json({
          ok: false,
          error: "No file changes detected",
        });
      }

      const approvalId = makeApprovalId();

      pendingApprovals.set(approvalId, {
        approvalId,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        relativePath: safe.relativePath,
        targetPath: safe.targetPath,
        oldContent,
        newContent: content,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        ok: true,
        message:
          "Change proposed. Original file has NOT been modified.",
        approvalRequired: true,
        approvalId,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        file: safe.relativePath,
        preview,
      });
    } catch (error) {
      res.status(403).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// LIST PENDING APPROVALS
// Does not expose proposed file content.
// --------------------------------------------------

app.get("/approvals", (req, res) => {
  const approvals = [...pendingApprovals.values()].map(
    (item) => ({
      approvalId: item.approvalId,
      workspaceId: item.workspaceId,
      workspaceName: item.workspaceName,
      file: item.relativePath,
      createdAt: item.createdAt,
    })
  );

  res.json({
    ok: true,
    count: approvals.length,
    approvals,
  });
});

// --------------------------------------------------
// APPROVAL PREVIEW
// --------------------------------------------------

app.get(
  "/approvals/:approvalId",
  (req, res) => {
    const item = pendingApprovals.get(
      req.params.approvalId
    );

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Approval not found or expired",
      });
    }

    res.json({
      ok: true,
      approvalRequired: true,
      approval: {
        approvalId: item.approvalId,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        file: item.relativePath,
        createdAt: item.createdAt,
        preview: buildSimplePreview(
          item.oldContent,
          item.newContent
        ),
      },
    });
  }
);

// --------------------------------------------------
// APPROVE + WRITE
//
// Safety:
// 1. Approval ID must exist.
// 2. Workspace must still be approved.
// 3. Path is revalidated.
// 4. File must be unchanged since proposal.
// 5. Backup is created.
// 6. Then write happens.
// --------------------------------------------------

app.post(
  "/approvals/:approvalId/approve",
  async (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Approval not found or expired",
      });
    }

    try {
      const workspace = getApprovedWorkspace(
        item.workspaceId
      );

      if (!workspace) {
        return res.status(403).json({
          ok: false,
          error: "Workspace is no longer approved",
        });
      }

      const safe = resolveSafePath(
        workspace,
        item.relativePath
      );

      if(safe.targetPath!==item.targetPath){pendingApprovals.delete(approvalId);return res.status(409).json({ok:false,error:'Workspace mapping changed; request fresh file approval'});}
      if (!fs.existsSync(safe.targetPath)) {
        return res.status(404).json({
          ok: false,
          error: "Target file no longer exists",
        });
      }

      const currentContent = fs.readFileSync(
        safe.targetPath,
        "utf8"
      );

      // Prevent overwriting somebody else's newer edit.
      if (currentContent !== item.oldContent) {
        pendingApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "File changed after proposal. Approval cancelled; create a new proposal.",
        });
      }

      const operationId=await updateRecovery.capture({workspaceId:workspace.id,file:item.relativePath,oldContent:currentContent,newContent:item.newContent});
      const rechecked=resolveSafePath(workspace,item.relativePath);
      if(rechecked.targetPath!==safe.targetPath || fs.readFileSync(rechecked.targetPath,'utf8')!==currentContent)throw new Error('File changed during preflight');
      const backupPath =
        safe.targetPath + ".oneleadq-backup";

      fs.writeFileSync(
        backupPath,
        currentContent,
        {encoding:"utf8",flag:"wx"}
      );

      try {
        fs.writeFileSync(
          safe.targetPath,
          item.newContent,
          "utf8"
        );
      } catch (writeError) {
        // Restore original if write itself fails.
        fs.writeFileSync(
          safe.targetPath,
          currentContent,
          "utf8"
        );

        throw writeError;
      }

      updateRecovery.applied(operationId);
      pendingApprovals.delete(approvalId);

      res.json({
        operationId,
        ok: true,
        message: "Approved change written successfully",
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        file: safe.relativePath,
        backupCreated: true,
        backupFile:
          path.basename(backupPath),
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// REJECT PROPOSAL
// Original file remains untouched.
// --------------------------------------------------

app.post(
  "/approvals/:approvalId/reject",
  (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Approval not found or expired",
      });
    }

    pendingApprovals.delete(approvalId);

    res.json({
      ok: true,
      message:
        "Change rejected. Original file was not modified.",
      approvalId,
      workspaceId: item.workspaceId,
      file: item.relativePath,
    });
  }
);

// --------------------------------------------------
// PROPOSE GIT COMMIT
//
// IMPORTANT:
// - Does NOT stage files.
// - Does NOT create a commit.
// - Does NOT push.
// - Only creates an approval request.
// --------------------------------------------------

app.post(
  "/workspaces/:workspaceId/git/commit/propose",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const message = validateCommitMessage(
        req.body?.message
      );

      const insideRepo = await runGit(
        workspace.path,
        ["rev-parse", "--is-inside-work-tree"]
      );

      if (insideRepo !== "true") {
        return res.status(400).json({
          ok: false,
          error: "Workspace is not a Git repository",
        });
      }

      const branch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (!status.trim()) {
        return res.status(400).json({
          ok: false,
          error: "No Git changes detected",
        });
      }

      const changedFiles = parseStatus(status);
      const reviewedSnapshot=await approvalGuards.snapshot(workspace,changedFiles,{resolveSafePath,runGit});

      const approvalId = makeApprovalId();

      pendingGitApprovals.set(approvalId, {
        approvalId,
        type: "git-commit",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        branch: branch || "(detached HEAD)",
        message,
        statusSnapshot: status,
        reviewedSnapshot,
        changedFiles,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        ok: true,
        message:
          "Git commit proposed. Nothing has been committed.",
        approvalRequired: true,
        approvalId,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          branch: branch || "(detached HEAD)",
          commitMessage: message,
          changedCount: changedFiles.length,
          changedFiles,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// APPROVE GIT COMMIT
//
// Safety:
// - Approval ID must exist.
// - Workspace must still be approved.
// - Branch must not have changed.
// - Git status must exactly match proposal.
// - Only then stage + commit.
// - NO PUSH happens here.
// --------------------------------------------------

app.post(
  "/git/approvals/:approvalId/approve",
  async (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingGitApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Git approval not found or expired",
      });
    }

    try {
      const workspace = getApprovedWorkspace(
        item.workspaceId
      );

      if (!workspace) {
        pendingGitApprovals.delete(approvalId);

        return res.status(403).json({
          ok: false,
          error: "Workspace is no longer approved",
        });
      }

      const insideRepo = await runGit(
        workspace.path,
        ["rev-parse", "--is-inside-work-tree"]
      );

      if (insideRepo !== "true") {
        pendingGitApprovals.delete(approvalId);

        return res.status(400).json({
          ok: false,
          error: "Workspace is no longer a Git repository",
        });
      }

      const currentBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      if (
        (currentBranch || "(detached HEAD)") !==
        item.branch
      ) {
        pendingGitApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Git branch changed after proposal. Approval cancelled.",
        });
      }

      const currentStatus = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (currentStatus !== item.statusSnapshot) {
        pendingGitApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Git changes changed after proposal. Approval cancelled; create a new proposal.",
        });
      }

      const currentSnapshot=await approvalGuards.snapshot(workspace,item.changedFiles,{resolveSafePath,runGit});
      if(JSON.stringify(currentSnapshot)!==JSON.stringify(item.reviewedSnapshot)){pendingGitApprovals.delete(approvalId);return res.status(409).json({ok:false,error:'Reviewed content, index, HEAD or workspace changed; request fresh commit approval'});}

      // Stage exactly the snapshot paths that were reviewed.
      // Do NOT use `git add -A` or `git add .`.
      const reviewedPaths = item.changedFiles
        .flatMap((entry) => entry.originalFile ? [entry.file,entry.originalFile] : [entry.file])
        .filter(Boolean);

      if (reviewedPaths.length === 0) {
        pendingGitApprovals.delete(approvalId);

        return res.status(400).json({
          ok: false,
          error: "No reviewed files available to commit",
        });
      }

      await commitReviewed(runGit,workspace.path,reviewedPaths,item.message);

      const commitHash = await runGit(
        workspace.path,
        ["rev-parse", "HEAD"]
      );

      pendingGitApprovals.delete(approvalId);

      res.json({
        ok: true,
        message:
          "Approved Git commit created successfully. Nothing was pushed.",
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          branch: currentBranch || "(detached HEAD)",
          commitHash,
          commitMessage: item.message,
          pushed: false,
        },
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: typeof error.stagingRecovered==='boolean'?error.message:'Commit approval failed; review repository state locally and request fresh approval',
      });
    }
  }
);

// --------------------------------------------------
// REJECT GIT COMMIT
//
// Removes the pending Git approval.
// Working files remain untouched.
// No commit and no push.
// --------------------------------------------------

app.post(
  "/git/approvals/:approvalId/reject",
  (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingGitApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Git approval not found or expired",
      });
    }

    pendingGitApprovals.delete(approvalId);

    res.json({
      ok: true,
      message:
        "Git commit rejected. Working files were not modified and nothing was committed.",
      approvalId,
      workspace: {
        id: item.workspaceId,
        name: item.workspaceName,
      },
      git: {
        branch: item.branch,
        commitMessage: item.message,
        committed: false,
        pushed: false,
      },
    });
  }
);

// --------------------------------------------------
// SAFE TERMINAL RUN ENDPOINT
//
// Executes only predefined allowlisted command IDs.
// No raw command, executable or arguments are accepted
// from the API request.
// --------------------------------------------------

app.post(
  "/workspaces/:workspaceId/terminal/run",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const commandId = req.body?.commandId;

      if (
        typeof commandId !== "string" ||
        !commandId.trim()
      ) {
        return res.status(400).json({
          ok: false,
          error: "commandId is required",
        });
      }

      if (
        !Object.prototype.hasOwnProperty.call(
          SAFE_TERMINAL_COMMANDS,
          commandId
        )
      ) {
        return res.status(403).json({
          ok: false,
          error: "Terminal command is not allowlisted",
        });
      }

      const result = await runSafeTerminalCommand(
        workspace.path,
        commandId
      );

      res.json({
        ok: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        terminal: {
          mode: "allowlist-only",
          commandId: result.commandId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
        terminal: error.result || null,
      });
    }
  }
);

// --------------------------------------------------
// PROPOSE GIT BRANCH CREATE
//
// IMPORTANT:
// - Does NOT create a branch.
// - Does NOT switch branches.
// - Does NOT push.
// - Only creates an approval request.
// --------------------------------------------------

app.post(
  "/workspaces/:workspaceId/git/branch/propose",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const branchName = validateGitBranchName(
        req.body?.branchName
      );

      const insideRepo = await runGit(
        workspace.path,
        ["rev-parse", "--is-inside-work-tree"]
      );

      if (insideRepo !== "true") {
        return res.status(400).json({
          ok: false,
          error: "Workspace is not a Git repository",
        });
      }

      const currentBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (status.trim()) {
        return res.status(409).json({
          ok: false,
          error:
            "Working tree must be clean before creating a branch",
        });
      }

      let branchExists = false;

      try {
        await runGit(
          workspace.path,
          [
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${branchName}`,
          ]
        );

        branchExists = true;
      } catch {
        branchExists = false;
      }

      if (branchExists) {
        return res.status(409).json({
          ok: false,
          error: "Branch already exists",
        });
      }

      const headCommit = await runGit(
        workspace.path,
        ["rev-parse", "HEAD"]
      );

      const approvalId = makeApprovalId();

      pendingGitBranchApprovals.set(approvalId, {
        approvalId,
        type: "git-branch-create",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        sourceBranch:
          currentBranch || "(detached HEAD)",
        branchName,
        headCommit,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        ok: true,
        message:
          "Git branch creation proposed. No branch was created or switched.",
        approvalRequired: true,
        approvalId,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          action: "create-and-switch-branch",
          sourceBranch:
            currentBranch || "(detached HEAD)",
          branchName,
          headCommit,
          created: false,
          switched: false,
          pushed: false,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// APPROVE GIT BRANCH CREATE
//
// Safety:
// - Approval ID must exist.
// - Workspace must still be approved.
// - Source branch must not have changed.
// - HEAD commit must still match proposal.
// - Working tree must still be clean.
// - Branch must still not exist.
// - NO PUSH happens here.
// --------------------------------------------------

app.post(
  "/git/branch/approvals/:approvalId/approve",
  async (req, res) => {
    const approvalId = req.params.approvalId;
    const item =
      pendingGitBranchApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error:
          "Git branch approval not found or expired",
      });
    }

    try {
      const workspace = getApprovedWorkspace(
        item.workspaceId
      );

      if (!workspace) {
        pendingGitBranchApprovals.delete(approvalId);

        return res.status(403).json({
          ok: false,
          error: "Workspace is no longer approved",
        });
      }

      const currentBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      if (
        (currentBranch || "(detached HEAD)") !==
        item.sourceBranch
      ) {
        pendingGitBranchApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Git branch changed after proposal. Approval cancelled.",
        });
      }

      const currentHead = await runGit(
        workspace.path,
        ["rev-parse", "HEAD"]
      );

      if (currentHead !== item.headCommit) {
        pendingGitBranchApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "HEAD changed after proposal. Approval cancelled.",
        });
      }

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (status.trim()) {
        pendingGitBranchApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Working tree changed after proposal. Approval cancelled.",
        });
      }

      try {
        await runGit(
          workspace.path,
          [
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${item.branchName}`,
          ]
        );

        pendingGitBranchApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Branch now exists. Approval cancelled.",
        });
      } catch {
        // Expected when branch does not exist.
      }

      await runGit(
        workspace.path,
        ["switch", "-c", item.branchName]
      );

      const newBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      pendingGitBranchApprovals.delete(approvalId);

      res.json({
        ok: true,
        message:
          "Approved Git branch created and switched successfully. Nothing was pushed.",
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          action: "create-and-switch-branch",
          sourceBranch: item.sourceBranch,
          branchName: newBranch,
          created: true,
          switched: true,
          pushed: false,
        },
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// REJECT GIT BRANCH CREATE
//
// Rejecting leaves the repository untouched.
// --------------------------------------------------

app.post(
  "/git/branch/approvals/:approvalId/reject",
  (req, res) => {
    const approvalId = req.params.approvalId;
    const item =
      pendingGitBranchApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error:
          "Git branch approval not found or expired",
      });
    }

    pendingGitBranchApprovals.delete(approvalId);

    res.json({
      ok: true,
      message:
        "Git branch creation rejected. Repository was not modified.",
      approvalId,
      workspace: {
        id: item.workspaceId,
        name: item.workspaceName,
      },
      git: {
        action: "create-and-switch-branch",
        sourceBranch: item.sourceBranch,
        branchName: item.branchName,
        created: false,
        switched: false,
        pushed: false,
      },
    });
  }
);

// --------------------------------------------------
// PROPOSE GIT PUSH
//
// Safety:
// - Does NOT push.
// - Remote must already exist.
// - Pushes only the current local branch.
// - Working tree must be clean.
// - Captures branch + HEAD snapshot for approval.
// - No force push.
// --------------------------------------------------

app.post(
  "/workspaces/:workspaceId/git/push/propose",
  async (req, res) => {
    const workspace = getWorkspaceOrReject(req, res);

    if (!workspace) return;

    try {
      const remoteName = validateGitRemoteName(
        req.body?.remoteName || "origin"
      );

      const insideRepo = await runGit(
        workspace.path,
        ["rev-parse", "--is-inside-work-tree"]
      );

      if (insideRepo !== "true") {
        return res.status(400).json({
          ok: false,
          error: "Workspace is not a Git repository",
        });
      }

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (status.trim()) {
        return res.status(409).json({
          ok: false,
          error:
            "Working tree must be clean before proposing a Git push",
        });
      }

      const currentBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      if (!currentBranch) {
        return res.status(409).json({
          ok: false,
          error:
            "Cannot push while repository is in detached HEAD state",
        });
      }

      // Verify that the requested remote is already configured.
      const remotesOutput = await runGit(
        workspace.path,
        ["remote"]
      );

      const remotes = remotesOutput
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean);

      if (!remotes.includes(remoteName)) {
        return res.status(404).json({
          ok: false,
          error: `Git remote '${remoteName}' is not configured`,
        });
      }

      const remoteUrl = await runGit(
        workspace.path,
        ["remote", "get-url", remoteName]
      );

      const headCommit = await runGit(
        workspace.path,
        ["rev-parse", "HEAD"]
      );

      const approvalId = makeApprovalId();

      pendingGitPushApprovals.set(approvalId, {
        approvalId,
        type: "git-push",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        remoteName,
        remoteUrl,
        branch: currentBranch,
        headCommit,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({
        ok: true,
        message:
          "Git push proposed. Nothing has been pushed.",
        approvalRequired: true,
        approvalId,
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          action: "push-current-branch",
          remoteName,
          remoteUrl,
          branch: currentBranch,
          headCommit,
          force: false,
          pushed: false,
        },
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
  }
);

// --------------------------------------------------
// APPROVE GIT PUSH
//
// Safety:
// - Approval ID must exist.
// - Workspace must still be approved.
// - Working tree must still be clean.
// - Branch and HEAD must match the proposal.
// - Remote URL must not have changed.
// - Pushes current reviewed branch only.
// - NO force push.
// --------------------------------------------------

app.post(
  "/git/push/approvals/:approvalId/approve",
  async (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingGitPushApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Git push approval not found or expired",
      });
    }

    try {
      const workspace = getApprovedWorkspace(
        item.workspaceId
      );

      if (!workspace) {
        pendingGitPushApprovals.delete(approvalId);

        return res.status(403).json({
          ok: false,
          error: "Workspace is no longer approved",
        });
      }

      const status = await runGit(
        workspace.path,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"]
      );

      if (status.trim()) {
        pendingGitPushApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Working tree changed after push proposal. Approval cancelled.",
        });
      }

      const currentBranch = await runGit(
        workspace.path,
        ["branch", "--show-current"]
      );

      if (currentBranch !== item.branch) {
        pendingGitPushApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Git branch changed after push proposal. Approval cancelled.",
        });
      }

      const currentHead = await runGit(
        workspace.path,
        ["rev-parse", "HEAD"]
      );

      if (currentHead !== item.headCommit) {
        pendingGitPushApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "HEAD changed after push proposal. Approval cancelled.",
        });
      }

      const currentRemoteUrl = await runGit(
        workspace.path,
        ["remote", "get-url", item.remoteName]
      );

      if (currentRemoteUrl !== item.remoteUrl) {
        pendingGitPushApprovals.delete(approvalId);

        return res.status(409).json({
          ok: false,
          error:
            "Git remote changed after push proposal. Approval cancelled.",
        });
      }

      // Exact reviewed destination only.
      // No --force, no tags, no arbitrary arguments.
      await runGit(
        workspace.path,
        [
          "push",
          "--set-upstream",
          item.remoteName,
          item.branch,
        ]
      );

      pendingGitPushApprovals.delete(approvalId);

      res.json({
        ok: true,
        message:
          "Approved Git push completed successfully.",
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        git: {
          action: "push-current-branch",
          remoteName: item.remoteName,
          remoteUrl: item.remoteUrl,
          branch: item.branch,
          headCommit: item.headCommit,
          force: false,
          pushed: true,
        },
      });
    } catch (error) {
      // Keep approval available when an external push fails
      // (for example authentication/network failure).
      res.status(500).json({
        ok: false,
        error: error.message,
        pushed: false,
      });
    }
  }
);

// --------------------------------------------------
// REJECT GIT PUSH
//
// Rejecting performs no network push.
// --------------------------------------------------

app.post(
  "/git/push/approvals/:approvalId/reject",
  (req, res) => {
    const approvalId = req.params.approvalId;
    const item = pendingGitPushApprovals.get(approvalId);

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: "Git push approval not found or expired",
      });
    }

    pendingGitPushApprovals.delete(approvalId);

    res.json({
      ok: true,
      message:
        "Git push rejected. Nothing was pushed.",
      approvalId,
      workspace: {
        id: item.workspaceId,
        name: item.workspaceName,
      },
      git: {
        action: "push-current-branch",
        remoteName: item.remoteName,
        branch: item.branch,
        headCommit: item.headCommit,
        force: false,
        pushed: false,
      },
    });
  }
);
// --------------------------------------------------
// UNKNOWN ROUTE
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

app.listen(PORT, BRIDGE_HOST, () => {
  const workspaces = loadWorkspaces().filter(
    (workspace) => workspace.enabled === true
  );

  console.log("");
  console.log("========================================");
  console.log(" OneLeadQ Windows Agent Bridge");
  console.log("========================================");
  console.log(" Status     : RUNNING");
  console.log(` Port       : ${PORT}`);
  console.log(` Workspaces : ${workspaces.length}`);
  console.log(" Files      : SAFE READ ACCESS");
  console.log(" Git        : READ-ONLY");
  console.log(" Write      : APPROVAL REQUIRED");
  console.log(` Health     : http://localhost:${PORT}/health`);
  console.log(` Workspace  : http://localhost:${PORT}/workspaces`);
  console.log("========================================");
  console.log("");
});

