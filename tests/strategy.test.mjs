import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStates,assess,parseFred,nyCloseUtc,firstSessionOfWeek,continuityIssues } from '../src/strategy.mjs';
test('10 consecutive closes, strict boundaries, hysteresis',()=>{
  const rule={lookback:2,band:.01,confirm:10};
  const prices=Array.from({length:22},(_,i)=>({date:'2026-09-'+String(i+1).padStart(2,'0'),close:100*Math.pow(1.04,i)}));
  const rows=computeStates(prices,rule);
  assert.equal(rows[9].state,'cash');assert.equal(rows[10].state,'hold');
  assert.equal(rows[10].up,10);
  const flat=computeStates([...prices,{date:'2026-09-23',close:prices.at(-1).close}],rule);
  assert.equal(flat.at(-1).state,'hold');assert.equal(flat.at(-1).up,0);
  const down=computeStates([...prices,...Array.from({length:10},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),close:prices.at(-1).close*Math.pow(.96,i+1)}))],rule);
  assert.equal(down.at(-2).state,'hold');assert.equal(down.at(-1).state,'cash');
});
test('Monday execution reads Friday; Monday close cannot change same-day instruction',()=>{
  const rows=[{date:'2026-10-09',state:'cash',ma200:100},{date:'2026-10-12',state:'hold',ma200:100}];
  const a=assess(rows,new Date('2026-10-12T19:00:00Z'));
  assert.equal(a.actionCode,'sell');assert.equal(a.executionState,'cash');
  const b=assess(rows,new Date('2026-10-12T20:01:00Z'));assert.equal(b.actionCode,'wait');
});
test('Missing latest close blocks execution and new confirmation',()=>{
  const a=assess([{date:'2026-10-08',state:'hold',ma200:100}],new Date('2026-10-12T19:00:00Z'));
  assert.equal(a.actionCode,'blocked');assert.equal(a.expectedLatest,'2026-10-09');
});
test('Monday holiday shifts execution to Tuesday and DST converts close',()=>{
  assert.equal(firstSessionOfWeek('2026-09-08'),'2026-09-08');
  assert.equal(nyCloseUtc('2026-10-19'),'2026-10-19T20:00:00.000Z');
  assert.equal(nyCloseUtc('2026-11-09'),'2026-11-09T21:00:00.000Z');
  assert.equal(nyCloseUtc('2026-11-27'),'2026-11-27T18:00:00.000Z');
});
test('Duplicates and malformed prices rejected; open-day data gap detected',()=>{
  assert.throws(()=>parseFred('observation_date,NASDAQ100\n2026-10-09,100\n2026-10-09,101'));
  assert.throws(()=>parseFred('observation_date,QQQ\n2026-10-09,100'));
  assert.deepEqual(continuityIssues([{date:'2026-10-08'},{date:'2026-10-12'}]),['缺少应有收盘：2026-10-09']);
});
