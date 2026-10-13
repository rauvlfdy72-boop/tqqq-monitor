import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createDataset,FRED_URL} from '../src/dataset.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(root,'data/market.json');
let csv;
if(process.argv[2])csv=await readFile(resolve(process.argv[2]),'utf8');
else {
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{const r=await fetch(FRED_URL,{headers:{'User-Agent':'TQQQ-monitor public daily data client'},redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`FRED HTTP ${r.status}`);csv=await r.text();break;}
    catch(error){last=error;if(attempt<2)await new Promise(r=>setTimeout(r,1500));}
  }
  if(csv===undefined)throw last;
}
const data=createDataset(csv);
let previous;
try{previous=JSON.parse(await readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(previous&&data.latest.date<previous.latest.date)throw Error('行情日期倒退，保留上次已核验数据');
await mkdir(dirname(output),{recursive:true});
await writeFile(output+'.tmp',JSON.stringify(data)+'\n');await rename(output+'.tmp',output);
console.log(JSON.stringify({dataThrough:data.latest.date,state:data.latest.stateLabel,up:data.latest.up,down:data.latest.down,actionAtRefresh:data.decisionAtRefresh.actionTitle,fetchedAt:data.generatedAt}));
