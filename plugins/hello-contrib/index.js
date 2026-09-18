module.exports = {
  activate(ctx) {
    let pings = 0;
    ctx.registerRoute('get', '/hello', (req, res) => {
      pings += 1;
      res.json({ ok: true, plugin: 'hello-contrib', pings, at: Date.now() });
    });
    ctx.log('activate done');
  },
};