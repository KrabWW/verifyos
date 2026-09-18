const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://verifyos:verifyos@127.0.0.1:5433/verifyos' });
  await c.connect();
  const r = await c.query("SELECT review FROM mr WHERE id=7");
  const rv = r.rows[0].review;
  if (Array.isArray(rv.tests) && rv.tests.length && rv.tests[0].verdict !== undefined) {
    rv.tests = rv.tests.map(t => ({
      title: t.title,
      status: t.verdict,
      source: t.kind === 'ai' ? 'LLM 定向回归' : t.kind === 'assertion' ? '断言步骤' : '确定性步骤',
      durationSec: Math.round((t.durationMs || 0) / 1000),
    }));
    await c.query("UPDATE mr SET review = $1::jsonb WHERE id = 7", [JSON.stringify(rv)]);
    console.log('remapped:', JSON.stringify(rv.tests.slice(0, 2)));
  } else {
    console.log('already ok:', JSON.stringify((rv.tests || [])[0]));
  }
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });