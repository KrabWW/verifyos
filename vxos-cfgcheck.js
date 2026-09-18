
const { parseProjectConfig } = require('./apps/server/dist/pr/pr-config.js');
const fs = require('fs');
const t = fs.readFileSync('apps/server/verifyos.config.yaml', 'utf8');
const cfg = parseProjectConfig(t);
console.log(JSON.stringify(cfg.pr, null, 1));
