import {createHash} from 'node:crypto';
import {RULE,CALENDAR,parseFred,computeStates,continuityIssues,assess,firstSessionOfWeek} from './strategy.mjs';
export const FRED_URL='https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQ100&cosd=1995-01-01';
export function createDataset(csv,at=new Date().toISOString()){
  const prices=parseFred(csv),now=new Date(at),all=computeStates(prices),issues=continuityIssues(all);
  const decision=assess(all,now,CALENDAR,issues),latest=all.at(-1);
  if(latest.date>decision.expectedLatest)throw Error('来源包含尚未结束交易日的收盘，拒绝发布');
  if(issues.length)throw Error(issues.join('；'));
  const weekly=[];
  for(let i=1;i<all.length;i++){
    const row=all[i],prior=all[i-1];
    if(row.date>='2025-10-01'&&firstSessionOfWeek(row.date)===row.date)weekly.push({date:row.date,signalDate:prior.date,state:prior.state,instruction:prior.state==='hold'?'现金全额买入／继续持有':'全部卖出／继续等待'});
  }
  return {version:1,title:'TQQQ 每日监控',generatedAt:at,rule:RULE,calendar:CALENDAR,qualityIssues:issues,source:{provider:'FRED / Nasdaq, Inc.',series:'NASDAQ100',url:'https://fred.stlouisfed.org/series/NASDAQ100',requestUrl:FRED_URL,dataThrough:latest.date,fetchedAt:at,sha256:createHash('sha256').update(csv).digest('hex')},latest,history:all.filter(x=>x.date>='2024-01-01'),changes:all.filter(x=>x.change).map(({date,close,ma200,state,change})=>({date,close,ma200,state,change})),weekly:weekly.reverse(),decisionAtRefresh:decision};
}
