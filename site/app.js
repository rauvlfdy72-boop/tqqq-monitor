import {assess} from './strategy.mjs';
const $=id=>document.getElementById(id);
const number=(v,d=2)=>v==null?'—':Number(v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
const time=(v,zone)=>new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
const stateLabel=state=>state==='hold'?'持有':'现金';
let data=null,decision=null,scoped=[],page=0,loading=false,chartCleanup=[];
const pageSize=12,storageKey='tqqq-monitor.account.v1';
function text(id,value){$(id).textContent=value;}
function notify(message){text('notice',message);$('notice').hidden=false;setTimeout(()=>$('notice').hidden=true,3500);}
function saveAccount(){try{localStorage.setItem(storageKey,JSON.stringify({cash:$('cash').value,position:$('position').value}));}catch{}renderAccount();}
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){$('cash').value=saved.cash??'';$('position').value=['none','hold'].includes(saved.position)?saved.position:'unknown';}}catch{}
function renderDecision(){
  if(!data)return;
  decision=assess(data.history,new Date(),data.calendar,data.qualityIssues);
  const latest=data.latest;
  text('data-date',`行情截至 ${latest.date}（美东收盘）`);text('freshness',decision.ready?'已覆盖最近收盘':'行情或日历待更新');$('status-dot').className=`dot ${decision.ready?'ok':''}`;
  text('fetched-at',`数据读取：${time(data.generatedAt,'Asia/Shanghai')} · 北京时间`);
  text('us-date',`美东 ${decision.nyDate}`);text('action',decision.actionTitle);$('action').className='action '+decision.actionCode;text('reason',decision.reason);
  text('next-cn',decision.supported?time(decision.nextCloseUtc,'Asia/Shanghai'):'等待交易日历核验');text('next-us',decision.supported?`对应美东 ${time(decision.nextCloseUtc,'America/New_York')}`:'');
  text('next-note',decision.ready?'届时用执行日前最新确认状态，决定全额买入或全部卖出。':'先更新有效行情或日历，再确认执行方向。');
  text('state',stateLabel(latest.state));$('state').className='metric '+latest.state;text('target',`规则目标：${latest.state==='hold'?'100% TQQQ':'100% 人民币现金'}`);text('since',`最近状态切换：${latest.stateSince??'尚未切换'}`);
  text('close',number(latest.close));text('ma',`200 日均线：${number(latest.ma200)}`);text('distance',`距离均线：${latest.distancePct>=0?'+':''}${number(latest.distancePct)}%`);
  text('up-text',`${Math.min(latest.up,10)} / 10`);text('down-text',`${Math.min(latest.down,10)} / 10`);$('up-progress').value=Math.min(latest.up,10);$('down-progress').value=Math.min(latest.down,10);text('streak',`当前连续上方 ${latest.up} 日／下方 ${latest.down} 日`);
  text('calendar-note',`交易日历已核验至 ${data.calendar.verifiedThrough}；超出该日期会暂停操作提示，需先更新官方日历。`);text('source-hash',`原始行情 SHA-256：${data.source.sha256}`);
  renderAccount();
}
function renderAccount(){
  if(!decision)return;
  const raw=$('cash').value.trim(),cash=raw===''?null:Number(raw),position=$('position').value;
  if(cash!==null&&(!Number.isFinite(cash)||cash<0)){text('account-hint','请输入大于或等于 0 的现金金额。');return;}
  const money=cash===null?'全部可用现金':`￥${number(cash)}`;
  let hint;
  if(decision.actionCode==='blocked')hint='当前无法确认操作，先等待有效行情或日历。';
  else if(decision.actionCode==='buy')hint=cash===0?'没有待投现金。已有 TQQQ 继续持有。':`本次收盘投入 ${money}，已有 TQQQ 继续持有。`;
  else if(decision.actionCode==='sell')hint=position==='none'?'你填写了没有持仓：继续保留现金。':'本次收盘卖出全部 TQQQ，换回人民币等待。';
  else hint=`今日不执行。下一执行日若仍为${stateLabel(data.latest.state)}状态，${data.latest.state==='hold'?(cash===0?'已有持仓继续持有':`投入 ${money}`):(position==='none'?'继续等待':'卖出全部 TQQQ')}。届时以最新确认状态为准。`;
  text('account-hint',hint);
}
function fillTable(id,rows,fields){
  const fragment=document.createDocumentFragment();
  for(const row of rows){const tr=document.createElement('tr');for(const field of fields){const td=document.createElement('td');const value=field.format?field.format(row[field.key]):row[field.key];td.textContent=value??'—';if(field.state)td.className=row.state==='hold'?'hold-text':'cash-text';tr.append(td);}fragment.append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=fields.length;td.textContent='该范围没有可用记录';tr.append(td);fragment.append(tr);}
  $(id).replaceChildren(fragment);
}
function renderDaily(){
  const rows=[...scoped].reverse(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
  fillTable('daily-body',rows.slice(page*pageSize,(page+1)*pageSize),[{key:'date'},{key:'close',format:number},{key:'ma200',format:number},{key:'distancePct',format:v=>`${v>=0?'+':''}${number(v)}%`},{key:'up'},{key:'down'},{key:'state',format:stateLabel,state:true}]);
  text('daily-count',`${rows.length} 个交易日`);text('page-number',`${page+1} / ${pages}`);$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
function renderHistory(){
  if(!data)return;
  const range=$('range').value,last=Date.parse(data.latest.date+'T12:00:00Z');
  scoped=range==='all'?data.history:data.history.filter(r=>Date.parse(r.date+'T12:00:00Z')>=last-Number(range)*86400000);
  page=0;renderDaily();
  for(const clean of chartCleanup)clean();chartCleanup=[];
  chartCleanup.push(drawChart($('price-chart'),scoped,[{key:'close',name:'指数收盘',color:'#166b70'},{key:'ma200',name:'200 日均线',color:'#263849'},{key:'upper',name:'买入确认线',color:'#a2b7a9',dash:true},{key:'lower',name:'卖出确认线',color:'#c19b76',dash:true}],false));
  chartCleanup.push(drawChart($('distance-chart'),scoped,[{key:'distancePct',name:'距均线',color:'#166b70'},{value:1,name:'上方缓冲',color:'#a2b7a9',dash:true},{value:-1,name:'下方缓冲',color:'#c19b76',dash:true}],true));
  fillTable('changes-body',[...data.changes].reverse().slice(0,10),[{key:'date'},{key:'change',state:true},{key:'close',format:number}]);
  fillTable('weekly-body',data.weekly.slice(0,10),[{key:'date'},{key:'signalDate'},{key:'instruction',state:true}]);
}
const NS='http://www.w3.org/2000/svg';
function element(name,attrs={},content){const e=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,String(value));if(content!==undefined)e.textContent=content;return e;}
function drawChart(host,rows,series,percent){
  host.replaceChildren();if(!rows.length){const empty=document.createElement('p');empty.className='chart-empty';empty.textContent='该范围没有可用行情';host.append(empty);return()=>{};}
  let svg,hoverLine,hoverDots,selected=rows.length-1,coordinates;
  const tip=document.createElement('div');tip.className='chart-tooltip';tip.hidden=true;
  function show(index){selected=Math.max(0,Math.min(rows.length-1,index));const row=rows[selected],x=coordinates.x(row.date);hoverLine.setAttribute('x1',x);hoverLine.setAttribute('x2',x);hoverLine.style.display='';hoverDots.replaceChildren();tip.replaceChildren();const date=document.createElement('strong');date.textContent=row.date+' · 美东收盘';tip.append(date);
    for(const s of series){const value=s.value??row[s.key];if(value==null)continue;const mark=element('circle',{cx:x,cy:coordinates.y(value),r:3,fill:s.color,stroke:'#fff','stroke-width':1.4});hoverDots.append(mark);const line=document.createElement('span');line.textContent=s.name+'：'+number(value)+(percent?'%':'');tip.append(line);}tip.hidden=false;
  }
  function paint(){
    const width=host.clientWidth,height=host.clientHeight;if(width<100||height<80)return;
    const left=percent?49:68,right=16,top=18,bottom=31,plotWidth=width-left-right,plotHeight=height-top-bottom;
    const times=rows.map(r=>Date.parse(r.date+'T12:00:00Z')),minTime=times[0],maxTime=times.at(-1),spanTime=maxTime-minTime||86400000;
    const values=series.flatMap(s=>rows.map(r=>s.value??r[s.key])).filter(Number.isFinite);let low=Math.min(...values),high=Math.max(...values);const pad=(high-low||Math.abs(high)*.05||1)*.08;low-=pad;high+=pad;
    coordinates={x:date=>left+(Date.parse(date+'T12:00:00Z')-minTime)/spanTime*plotWidth,y:v=>top+(high-v)/(high-low)*plotHeight,minTime,spanTime,left,plotWidth};
    svg=element('svg',{viewBox:`0 0 ${width} ${height}`,tabindex:0,role:'img','aria-label':percent?'指数距离均线趋势，左右方向键查看每日数据':'指数和均线趋势，左右方向键查看每日数据'});
    for(let i=0;i<=4;i++){const v=low+(high-low)*i/4,y=coordinates.y(v);svg.append(element('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#edf0f2'}));svg.append(element('text',{x:left-9,y:y+4,'text-anchor':'end',fill:'#697780','font-size':11},percent?number(v,1)+'%':number(v,0)));}
    const tickCount=width<500?3:6;
    for(let i=0;i<tickCount;i++){const idx=Math.round((rows.length-1)*i/(tickCount-1)),row=rows[idx],x=coordinates.x(row.date);svg.append(element('text',{x,y:height-7,'text-anchor':i===0?'start':i===tickCount-1?'end':'middle',fill:'#697780','font-size':11},row.date.slice(2)));}
    for(const s of series){let path='',started=false;for(const row of rows){const v=s.value??row[s.key];if(!Number.isFinite(v)){started=false;continue;}path+=(started?' L ':' M ')+coordinates.x(row.date).toFixed(2)+' '+coordinates.y(v).toFixed(2);started=true;}svg.append(element('path',{d:path,fill:'none',stroke:s.color,'stroke-width':s.key==='close'||s.key==='distancePct'?2:1.4,'stroke-dasharray':s.dash?'5 4':'none','stroke-linejoin':'round','stroke-linecap':'round'}));}
    hoverLine=element('line',{x1:0,y1:top,x2:0,y2:height-bottom,stroke:'#84949e','stroke-dasharray':'3 3'});hoverLine.style.display='none';hoverDots=element('g');svg.append(hoverLine,hoverDots);
    svg.addEventListener('pointermove',e=>{const rect=svg.getBoundingClientRect(),offset=(e.clientX-rect.left)*width/rect.width;const target=minTime+(offset-left)/plotWidth*spanTime;let best=0;for(let i=1;i<times.length;i++)if(Math.abs(times[i]-target)<Math.abs(times[best]-target))best=i;show(best);});
    svg.addEventListener('pointerleave',()=>{tip.hidden=true;hoverLine.style.display='none';hoverDots.replaceChildren();});
    svg.addEventListener('focus',()=>show(selected));svg.addEventListener('blur',()=>{tip.hidden=true;hoverLine.style.display='none';hoverDots.replaceChildren();});svg.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(selected+(e.key==='ArrowLeft'?-1:1));}});
    host.replaceChildren(svg,tip);tip.hidden=true;
  }
  const observer=new ResizeObserver(paint);observer.observe(host);paint();return()=>observer.disconnect();
}
async function load(manual=false){
  if(loading)return;loading=true;$('refresh').disabled=true;
  try{const url=new URL('./market.json',import.meta.url);url.searchParams.set('check',String(Date.now()));const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);const incoming=await response.json();if(incoming.version!==1||incoming.rule.lookback!==200||incoming.rule.confirm!==10||incoming.rule.band!==.01||!incoming.history?.length)throw Error('数据格式或固定参数不符');
    if(data&&incoming.latest.date<data.latest.date)throw Error('数据日期倒退');const changed=!data||incoming.generatedAt!==data.generatedAt;data=incoming;$('load-error').hidden=true;renderDecision();if(changed)renderHistory();if(manual)notify(changed?'已读取最新发布数据':'已核对最新发布数据');
  }catch(error){text('load-error',`最新数据读取失败：${error.message}。${data?'保留上次读取的数据，操作提示仍按行情日期校验。':'暂不能判断买卖，请稍后重试。'}`);$('load-error').hidden=false;if(!data){text('action','暂不能判断');$('action').className='action blocked';text('reason','行情读取成功后才生成买卖提示。');}}
  finally{loading=false;$('refresh').disabled=false;}
}
function exportCsv(){const header=['美东交易日','指数收盘','200日均线','距均线百分比','上方连续日数','下方连续日数','收盘状态'];const rows=scoped.map(r=>[r.date,r.close,r.ma200,r.distancePct,r.up,r.down,stateLabel(r.state)]);const csv='\uFEFF'+[header,...rows].map(r=>r.join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='tqqq-monitor-daily.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('refresh').addEventListener('click',()=>load(true));$('range').addEventListener('change',renderHistory);$('cash').addEventListener('input',saveAccount);$('position').addEventListener('change',saveAccount);$('clear-account').addEventListener('click',()=>{$('cash').value='';$('position').value='unknown';try{localStorage.removeItem(storageKey);}catch{}renderAccount();});$('prev').addEventListener('click',()=>{page--;renderDaily();});$('next').addEventListener('click',()=>{page++;renderDaily();});$('export').addEventListener('click',exportCsv);
setInterval(renderDecision,30000);setInterval(()=>load(),120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();
