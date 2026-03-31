const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function ensureUseModularHeaders(podfile) {
  if (podfile.includes('use_modular_headers!')) return podfile;

  // Insert right after the platform line when possible.
  const platformLineRegex = /^platform\s*:ios.*$/m;
  const match = podfile.match(platformLineRegex);
  if (match && typeof match.index === 'number') {
    const insertAt = match.index + match[0].length;
    return `${podfile.slice(0, insertAt)}\nuse_modular_headers!\n${podfile.slice(insertAt)}`;
  }

  // Fallback: put it at the top.
  return `use_modular_headers!\n${podfile}`;
}

module.exports = function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const current = fs.readFileSync(podfilePath, 'utf8');
      const next = ensureUseModularHeaders(current);
      if (next !== current) fs.writeFileSync(podfilePath, next);
      return cfg;
    },
  ]);
};

