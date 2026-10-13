import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDataset} from '../src/dataset.mjs';
import {tradingDay,shiftDate} from '../src/strategy.mjs';
const dates=[];
for(let d='2025-11-01';d<='2026-10-12';d=shiftDate(d,1))if(tradingDay(d))dates.push(d);
const csv='observation_date,NASDAQ100\n'+dates.map((d,i)=>`${d},${1000+i}`).join('\n');
test('Dataset rejects a not-yet-ended daily close',()=>{
  assert.throws(()=>createDataset(csv,'2026-10-12T19:00:00Z'),/尚未结束/);
});
test('Dataset rejects a missing open-session close',()=>{
  assert.throws(()=>createDataset(csv.replace(/2026-10-09,[^\n]+\n/,''),'2026-10-13T06:00:00Z'),/缺少应有收盘/);
});
test('Dataset keeps weekly targets lagged by a trading day',()=>{
  const d=createDataset(csv,'2026-10-13T06:00:00Z');
  assert.equal(d.weekly[0].date,'2026-10-12');assert.equal(d.weekly[0].signalDate,'2026-10-09');
  assert.equal(d.decisionAtRefresh.actionCode,'wait');assert.equal(d.decisionAtRefresh.nextCloseUtc,'2026-10-19T20:00:00.000Z');
});
test('Published market data has an independently reconciled final SMA',async()=>{
  const d=JSON.parse(await readFile(new URL('../data/market.json',import.meta.url),'utf8'));
  const expected=d.history.slice(-200).reduce((s,x)=>s+x.close,0)/200;
  assert.ok(Math.abs(expected-d.latest.ma200)<1e-6);
  assert.equal(d.history.at(-1).date,d.latest.date);
  assert.equal(d.history.at(-1).state,d.latest.state);
  assert.ok(!JSON.stringify(d).includes('sitesAuthorization'));
});
