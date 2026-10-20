'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const resourceName = 'oneleadq_ai_network_security';
const policy = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.1.2</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function withAiNetworkSecurity(config) {
  config = withAndroidManifest(config, mod => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const existing = application.$['android:networkSecurityConfig'];
    const reference = '@xml/' + resourceName;
    if (existing && existing !== reference) {
      throw new Error('Refusing to replace an existing Android network security configuration.');
    }
    application.$['android:networkSecurityConfig'] = reference;
    application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
  });

  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, resourceName + '.xml'), policy, 'utf8');
    return mod;
  }]);
};
