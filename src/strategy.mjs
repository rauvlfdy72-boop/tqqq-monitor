// Exact daily state rule; observations are Nasdaq-100 price closes, never QQQ/TQQQ prices.
export const RULE = Object.freeze({ lookback: 200, band: 0.01, confirm: 10, seedStart: '1995-01-04', version: 'ndx-sma200-band1-confirm10-weekly-v1' });
export const CALENDAR = {
  verifiedThrough: '2026-12-31',
  source: 'https://www.nasdaq.com/market-activity/stock-market-holiday-schedule',
  holidays: ['2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25','2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25'],
  earlyCloses: ['2025-07-03','2025-11-28','2025-12-24','2026-11-27','2026-12-24'],
};
export function shiftDate(date, days) { return new Date(Date.parse(date+'T12:00:00Z') + days*86400000).toISOString().slice(0,10); }
export function weekday(date) { return new Date(date+'T12:00:00Z').getUTCDay(); }
export function tradingDay(date, calendar=CALENDAR) { return weekday(date)>0 && weekday(date)<6 && !calendar.holidays.includes(date); }
export function previousSession(date, calendar=CALENDAR) { for(let n=1;n<20;n++){const d=shiftDate(date,-n);if(tradingDay(d,calendar))return d;} throw Error('交易日历异常'); }
export function firstSessionOfWeek(date, calendar=CALENDAR) {
  let d=shiftDate(date,-((weekday(date)+6)%7));
  for(let n=0;n<5;n++,d=shiftDate(d,1)) if(tradingDay(d,calendar))return d;
  return null;
}
export function nyParts(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour)*60+Number(parts.minute) };
}
export function nyCloseUtc(date, calendar=CALENDAR) {
  const hour=calendar.earlyCloses.includes(date)?13:16;
  let utc=new Date(date+'T'+String(hour).padStart(2,'0')+':00:00Z');
  const local=nyParts(utc); utc=new Date(utc.getTime()+(hour*60-local.minute)*60000);
  return utc.toISOString();
}
export function expectedLatestClose(now,calendar=CALENDAR) {
  const p=nyParts(now); const close=calendar.earlyCloses.includes(p.date)?13*60:16*60;
  return tradingDay(p.date,calendar)&&p.minute>=close?p.date:previousSession(p.date,calendar);
}
export function nextExecution(now,calendar=CALENDAR) {
  const p=nyParts(now);
  for(let n=0;n<22;n++){
    const d=shiftDate(p.date,n);
    if(tradingDay(d,calendar)&&firstSessionOfWeek(d,calendar)===d&&Date.parse(nyCloseUtc(d,calendar))>now.getTime())return {date:d,closeUtc:nyCloseUtc(d,calendar)};
  } throw Error('无法找到下一执行日');
}
export function parseFred(csv) {
  const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(!/^observation_date,NASDAQ100\s*$/.test(lines[0])&&!/^DATE,NASDAQ100\s*$/.test(lines[0]))throw Error('行情格式或指数标识不符');
  const rows=[];let previous='';
  for(const line of lines.slice(1)){
    const [date,value]=line.split(',');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<=previous)throw Error('日期重复或顺序异常'); previous=date;
    if(value===''||value==='.')continue;
    const close=Number(value);if(!Number.isFinite(close)||close<=0)throw Error('无效收盘值');
    if(date>=RULE.seedStart)rows.push({date,close});
  }
  if(rows.length<RULE.lookback+RULE.confirm)throw Error('历史不足以计算信号');
  return rows;
}
export function computeStates(prices, rule=RULE) {
  let sum=0,up=0,down=0,state='cash',since=null;
  return prices.map((p,i)=>{
    sum+=p.close;if(i>=rule.lookback)sum-=prices[i-rule.lookback].close;
    const ma200=i+1>=rule.lookback?sum/rule.lookback:null;
    let change=null;
    if(ma200!==null){
      up=p.close>ma200*(1+rule.band)?up+1:0;
      down=p.close<ma200*(1-rule.band)?down+1:0;
      const old=state;
      if(up>=rule.confirm)state='hold';else if(down>=rule.confirm)state='cash';
      if(state!==old){since=p.date;change=state==='hold'?'进入持有状态':'进入现金状态';}
    }
    return {...p,ma200,upper:ma200===null?null:ma200*(1+rule.band),lower:ma200===null?null:ma200*(1-rule.band),distancePct:ma200===null?null:(p.close/ma200-1)*100,up,down,state,stateLabel:state==='hold'?'持有':'现金',stateSince:since,change};
  });
}
export function continuityIssues(rows,calendar=CALENDAR) {
  const recent=rows.slice(-Math.max(220,RULE.lookback+RULE.confirm));const dates=new Set(recent.map(x=>x.date));const issues=[];
  for(let d=recent[0].date;d<=recent.at(-1).date;d=shiftDate(d,1)){
    if(d>calendar.verifiedThrough){issues.push('交易日历需更新');break;}
    if(d>='2025-01-01'&&tradingDay(d,calendar)&&!dates.has(d))issues.push('缺少应有收盘：'+d);
  } return issues;
}
// Execution state deliberately excludes execution day's close. No same-close lookahead.
export function assess(rows,now=new Date(),calendar=CALENDAR,issues=[]) {
  const ny=nyParts(now),expected=expectedLatestClose(now,calendar),latest=rows.at(-1),next=nextExecution(now,calendar);
  const closed=calendar.earlyCloses.includes(ny.date)?13*60:16*60;
  const isExecution=tradingDay(ny.date,calendar)&&firstSessionOfWeek(ny.date,calendar)===ny.date;
  const previous=previousSession(ny.date,calendar);
  const executionSignal=rows.findLast(x=>x.date<=previous);
  const fresh=latest.date>=expected&&latest.date<=ny.date;
  const supported=ny.date<=calendar.verifiedThrough&&next.date<=calendar.verifiedThrough;
  const ready=fresh&&supported&&issues.length===0&&latest.ma200!==null;
  let actionCode='wait',actionTitle='今日等待',reason='今天不是本周首个交易日。持仓和待投现金等待下一执行日。';
  if(!ready){actionCode='blocked';actionTitle='暂不能判断';reason=!supported?'交易日历已过有效期，需先更新。':issues.length?issues.join('；'):`行情未覆盖最近已结束交易日 ${expected}，先更新行情。`;}
  else if(!tradingDay(ny.date,calendar)){reason='今天美股休市，等待下一执行日。';}
  else if(isExecution&&ny.minute>=closed){reason='本周执行时点已经结束。若错过，不在盘后补单，等待下一周。';}
  else if(isExecution){
    if(!executionSignal||executionSignal.date!==previous){actionCode='blocked';actionTitle='暂不能判断';reason='缺少执行日之前最近交易日的信号。';}
    else if(executionSignal.state==='hold'){actionCode='buy';actionTitle='本次收盘可买入';reason='执行日此前的已确认状态为持有：收盘投入全部可用现金；已有持仓继续持有。';}
    else {actionCode='sell';actionTitle='本次收盘应清仓';reason='执行日此前的已确认状态为现金：收盘卖出全部 TQQQ；无持仓则继续等待。';}
  }
  return {nyDate:ny.date,expectedLatest:expected,latestDate:latest.date,fresh,supported,ready,isExecution,actionCode,actionTitle,reason,nextDate:next.date,nextCloseUtc:next.closeUtc,executionSignalDate:executionSignal?.date??null,executionState:executionSignal?.state??null,calendarVerifiedThrough:calendar.verifiedThrough};
}
