import assert from 'assert';
const { mvhdDuration } = await import('../lib/mp4.js');
const b = new Uint8Array(80); b.set([0x6d, 0x76, 0x68, 0x64], 8); const d = new DataView(b.buffer); d.setUint32(24, 1000); d.setUint32(28, 95867);
assert.equal(mvhdDuration(b), 95.867);
const c = new Uint8Array(80); c.set([0x6d, 0x76, 0x68, 0x64, 1], 8); const e = new DataView(c.buffer); e.setUint32(32, 600); e.setBigUint64(36, 6000n);
assert.equal(mvhdDuration(c), 10);
assert.equal(mvhdDuration(new Uint8Array(100)), 0);
console.log('MP4 OK');
