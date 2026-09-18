
const { Client } = require('pg');
const m = require('fs').readFileSync('C:/Users/admin/verifyos/.env','utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const g = m.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/(\S+)/);
(async () => {
  const c = new Client({ user:g[1], password:g[2], host:g[3], port:+g[4], database:g[5] });
  await c.connect();
  const r0 = await c.query("SELECT short_id FROM run WHERE trigger='pr' ORDER BY id DESC LIMIT 1");
  const sid = r0.rows[0].short_id;
  const r = await c.query("SELECT output::text AS o, failure_summary, verdict, verification_id FROM run WHERE short_id=$1", [sid]);
  const o = JSON.parse(r.rows[0].o);
  console.log('RUN', sid, '| verdict:', r.rows[0].verdict, '| ver_id:', r.rows[0].verification_id, '| dur:', (o.events||[]).length, 'events');
  console.log('FAIL_SUMMARY:', (r.rows[0].failure_summary||'-').slice(0,300));
  const evs = (o.events||[]).filter(e => String(e.stepId||'').includes('hard'));
  for (const e of evs) console.log('EV', e.type, '|', (e.detail||e.title||JSON.stringify(e.args||{})).slice(0,200));
  await c.end();
})().catch(e => { console.error('DBERR:', e.message); process.exit(1); });
