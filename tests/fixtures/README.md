# Stage16 committed CI fixtures

These test-only snapshots preserve the actual backend/Bridge source used by the59-test suite, including the previously uncommitted Stage16 prerequisites. Source repositories are not modified. See stage16-source-manifest.json for SHA256 provenance. Empty workspace mappings replace machine/customer configuration. No .env, credentials, backups or customer website files are copied. Tests construct their own synthetic loopback services and temporary directories.

CI uses Windows/Node24/installed Edge and npm ci from each committed lockfile. ONELEADQ_BACKEND_ROOT and STAGE15_BRIDGE_ROOT point here. No Gemini credentials, live app server, Android phone, customer API or deployment is used. Do not start fixture server.js as a production service.
