N.app.init().catch((e) => { console.error(e); zk.alert('Notes couldn’t start', (e && e.message) || String(e)); });
