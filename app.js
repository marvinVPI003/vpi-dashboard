const APP_VERSION = '2.0.'+Date.now();
console.log('[VPI Dashboard] Version loaded at',new Date().toISOString());
const GAS = 'https://script.google.com/macros/s/AKfycbznHnsf5gs6NT5Ps4s7PDj1HlbXRjcCF8F0713Q752pGBlBZwPvDVY0Y2zeX2w_5qgrEQ/exec';
const SITES = ['NATIONAL','AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const PROD_SITES = ['AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const SL = {NATIONAL:'National',AC:'AC · Bulacan',PFMIS:'PFMIS · Isabela',HOREB:'Horeb · Cebu',BUKID:'Bukidnon',ARGAO:'Argao · Cebu',CCPC:'CCPC · CDO',SOUTH:'South · Davao'};
const SC = {NATIONAL:'#3fb950',AC:'#388bfd',PFMIS:'#d29922',HOREB:'#1abc9c',BUKID:'#f85149',ARGAO:'#a371f7',CCPC:'#58a6ff',SOUTH:'#ffa657'};
const WEEKLY_TARGET = {AC:1375,PFMIS:1000,HOREB:875,BUKID:1750,CCPC:125,ARGAO:875,SOUTH:1000,NATIONAL:7000};
const DAILY_TARGET  = {AC:230,PFMIS:165,HOREB:145,BUKID:290,CCPC:20,ARGAO:145,SOUTH:165,NATIONAL:1160};
const LIMITS = {UDT_PCT:5,KWH_TON:35,FUEL_TON:3.5,COAL_TON:12};
const MONTHLY_TARGET = {AC:5500,PFMIS:4000,HOREB:3500,BUKID:7000,CCPC:500,ARGAO:3500,SOUTH:4000,NATIONAL:28000};
const DT_CATS = {'Mechanical':'cat-mech','Electrical':'cat-elec','PLC':'cat-elec','Process':'cat-proc','Warehouse':'cat-proc','Raw Materials':'cat-rm','Change Over':'cat-co','Change Die':'cat-co','Change Screen':'cat-co','Power Interruption':'cat-pwr'};
let DATA={}, activeSite='NATIONAL', activeWeek=1, activePage='dashboard', charts={}, refreshTimer=null;
var activeMonth='';
var _monthsList=[];
// ── JSONP FETCH ────────────────────────────────────────────
function gasGet(tab, extra) {
  return new Promise(function(resolve, reject) {
    var cb = 'vpi' + Date.now() + Math.floor(Math.random()*1000);
    // Build params as object so extras OVERRIDE defaults
    var params = {tab:tab, site:activeSite, week:activeWeek, callback:cb};
    if(extra) Object.keys(extra).forEach(function(k){ params[k]=extra[k]; });
    var p = Object.keys(params).map(function(k){
      return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
    }).join('&');
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function(){
      if(done) return; done=true;
      try{document.head.removeChild(s);}catch(e){}
      delete window[cb];
      reject(new Error('Timeout for tab:'+tab));
    }, 60000);
    window[cb] = function(data){
      if(done) return; done=true;
      clearTimeout(timer);
      try{document.head.removeChild(s);}catch(e){}
      delete window[cb];
      if(data&&data.error) reject(new Error(data.error));
      else resolve(data);
    };
    s.onerror = function(){
      if(done) return; done=true;
      clearTimeout(timer);
      try{document.head.removeChild(s);}catch(e){}
      delete window[cb];
      reject(new Error('Script error for tab:'+tab));
    };
    s.src = GAS + '?' + p;
    document.head.appendChild(s);
  });
}
// ── HELPERS ────────────────────────────────────────────────
function gf(r){
  for(var i=1;i<arguments.length;i++){
    var k=arguments[i];
    if(r[k]!==undefined&&r[k]!==null&&r[k]!==''){
      var v=parseFloat(String(r[k]).replace(/,/g,''));
      if(!isNaN(v)) return v;
    }
  }
  return 0;
}
function fv(n,d){d=d===undefined?1:d;return(!n||isNaN(n))?'—':Number(n).toFixed(d);}
function fKK(n){return(!n||n===0)?'—':n>=1000000?(n/1000000).toFixed(2)+'M':n>=1000?(n/1000).toFixed(1)+'k':n.toFixed(0);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function dot(s){return '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:'+(SC[s]||'#8b949e')+';margin-right:5px;vertical-align:middle"></span>';}
function catCls(c){return DT_CATS[c]||'cat-other';}
function getVersion(){return '2.0-'+(new Date().toLocaleDateString('en-PH'));}
function setStatus(s){
  var dot=document.getElementById('status-dot'),txt=document.getElementById('status-txt'),btn=document.getElementById('refresh-btn');
  if(s==='fetching'){dot.className='pulse fetching';txt.textContent='Syncing...';if(btn)btn.disabled=true;}
  else if(s==='live'){dot.className='pulse';txt.textContent='Live';if(btn)btn.disabled=false;}
  else{dot.className='pulse error';txt.textContent='Error';if(btn)btn.disabled=false;}
}
function setMsg(m){var e=document.getElementById('loading-msg');if(e)e.textContent=m;}
function showLoading(){var e=document.getElementById('loading');if(e)e.style.display='flex';}
function hideLoading(){var e=document.getElementById('loading');if(e)e.style.display='none';}
function scheduleRefresh(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(function(){loadData(true);},5*60*1000);}
function manualRefresh(){loadData(true);}
// ── WEEKLY REPORT GENERATOR (.pptx) ─────────────────────────
async function downloadWeeklyReport(){
  var btn=document.getElementById('weekly-report-btn');
  var origText=btn.innerHTML;
  btn.innerHTML='⟳ Building PPTX...';
  btn.disabled=true;
  try{
    if(typeof PptxGenJS==='undefined') throw new Error('PptxGenJS not loaded');

    var wk=activeWeek;
    var weeklyD=DATA.weekly||await gasGet('weekly');
    var downtimeD=await gasGet('downtime',{site:'NATIONAL'});

    var wrows=(weeklyD.rows||[]).filter(function(r){return +r.Week===+wk;});
    var natRow=wrows.find(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})||{};
    var siteRows=wrows.filter(function(r){return (r.Plant||'').toUpperCase()!=='NATIONAL';});

    // Last 5 weeks reject trend
    var allWeeks=(weeklyD.weeks||[]).map(Number).sort(function(a,b){return a-b;});
    var last5=allWeeks.slice(-5);
    var rLbl=last5.map(function(w){return 'W'+w;});
    var rQty=last5.map(function(w){
      var r=(weeklyD.rows||[]).find(function(r){return +r.Week===w&&(r.Plant||'').toUpperCase()==='NATIONAL';});
      if(!r)return 0;
      var v=gf(r,'Total Remill Reject, mt'); return +v.toFixed(2);
    });
    var rRate=last5.map(function(w){
      var r=(weeklyD.rows||[]).find(function(r){return +r.Week===w&&(r.Plant||'').toUpperCase()==='NATIONAL';});
      if(!r)return 0;
      var p=gf(r,'Rejection Rate, %'); return +(p>1?p:p*100).toFixed(3);
    });
    var outRates=last5.map(function(w){
      var r=(weeklyD.rows||[]).find(function(r){return +r.Week===w&&(r.Plant||'').toUpperCase()==='NATIONAL';});
      if(!r)return 0;
      var p=gf(r,'Outright Reject Rate, %'); return +(p>1?p:p*100).toFixed(3);
    });
    var othRates=last5.map(function(w){
      var r=(weeklyD.rows||[]).find(function(r){return +r.Week===w&&(r.Plant||'').toUpperCase()==='NATIONAL';});
      if(!r)return 0;
      var p=gf(r,'Other Reject Rate, %'); return +(p>1?p:p*100).toFixed(3);
    });

    // Cost data — fetch current week if cache missing
    if(!DATA.costWeeklyTrend) DATA.costWeeklyTrend={};
    if(!DATA.costWeeklyTrend['NATIONAL']) DATA.costWeeklyTrend['NATIONAL']={};
    var allSiteNames=['AC','PFMIS','HOREB','BUKID','ARGAO','HOREB MG','AC MG','NATIONAL'];
    // Fetch current week cost for all sites if not cached
    var sitesToFetch=allSiteNames.filter(function(s){return !(DATA.costWeeklyTrend[s]&&DATA.costWeeklyTrend[s][wk]);});
    if(sitesToFetch.length>0){
      await Promise.all(sitesToFetch.map(function(site){
        return gasGet('pcdaily',{site:site,week:wk}).then(function(d){
          if(!DATA.costWeeklyTrend[site]) DATA.costWeeklyTrend[site]={};
          var rows=(d.rows||[]).filter(function(r){return (r.Plant||'').toUpperCase()===site.toUpperCase();});
          var sum=function(f){return rows.reduce(function(a,r){return a+(r[f]||0);},0);};
          DATA.costWeeklyTrend[site][wk]={vol:sum('TotalVolume'),total:sum('CostTotal'),fixed:sum('FixedTotal'),variable:sum('VarTotal')};
        }).catch(function(){if(!DATA.costWeeklyTrend[site])DATA.costWeeklyTrend[site]={};DATA.costWeeklyTrend[site][wk]=null;});
      }));
    }
    // Also fetch all-week National trend if not already loaded
    var natCache=DATA.costWeeklyTrend['NATIONAL'];
    var missingWeeks=allWeeks.filter(function(w){return !natCache[w];});
    if(missingWeeks.length>0){
      await Promise.all(missingWeeks.map(function(w){
        return gasGet('pcdaily',{site:'NATIONAL',week:w}).then(function(d){
          var rows=(d.rows||[]).filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';});
          var sum=function(f){return rows.reduce(function(a,r){return a+(r[f]||0);},0);};
          natCache[w]={vol:sum('TotalVolume'),total:sum('CostTotal'),fixed:sum('FixedTotal'),variable:sum('VarTotal')};
        }).catch(function(){natCache[w]=null;});
      }));
    }

    var costTrend=allWeeks.filter(function(w){return natCache[w]&&natCache[w].total>0;}).map(function(w){
      var c=natCache[w]; return {week:w,total:c.total,cost_ton:c.vol>0?+(c.total/c.vol).toFixed(2):0};
    });
    var fvTrend=allWeeks.filter(function(w){return natCache[w]&&natCache[w].total>0;}).map(function(w){
      var c=natCache[w]; return {week:w,fixed_ton:c.vol>0?+(c.fixed/c.vol).toFixed(2):0,var_ton:c.vol>0?+(c.variable/c.vol).toFixed(2):0};
    });
    var cD=natCache[wk];
    var totalCost=cD?cD.total:0, costTon=cD&&cD.vol>0?+(cD.total/cD.vol).toFixed(2):0;
    var fixedCost=cD?cD.fixed:0, fixedTon=cD&&cD.vol>0?+(cD.fixed/cD.vol).toFixed(2):0;
    var varCost=cD?cD.variable:0, varTon=cD&&cD.vol>0?+(cD.variable/cD.vol).toFixed(2):0;

    // UDT data
    var dtRows=(downtimeD.rows||[]).filter(function(r){return String(r.Week)===String(wk);});
    var udtByCat={}, udtSubCats=[];
    dtRows.forEach(function(r){
      var u=+(r['Unscheduled Downtime']||r.UDT_hrs||0);
      var cat=r.Category||'';
      var sub=r['Sub-Category']||r.SubCategory||cat;
      var plant=r.Plant||'';
      if(u>0){
        udtByCat[cat]=(udtByCat[cat]||0)+u;
        if(sub&&plant) udtSubCats.push({label:plant+' – '+sub,hrs:u});
      }
    });
    var paretoArr=Object.keys(udtByCat).map(function(k){return {cat:k,hrs:udtByCat[k]};}).filter(function(x){return x.hrs>0;}).sort(function(a,b){return b.hrs-a.hrs;});

    // Top 5 UDT per site (from downtime rows)
    var udtBySite={};
    dtRows.forEach(function(r){
      var u=+(r['Unscheduled Downtime']||r.UDT_hrs||0);
      var plant=(r.Plant||'').toUpperCase();
      var sub=r['Sub-Category']||r.SubCategory||r.Category||'';
      if(u>0&&plant&&sub){
        if(!udtBySite[plant]) udtBySite[plant]=[];
        udtBySite[plant].push({sub:sub,hrs:u});
      }
    });
    var siteUDT5=[];
    Object.keys(udtBySite).sort().forEach(function(plant){
      var sorted=udtBySite[plant].sort(function(a,b){return b.hrs-a.hrs;}).slice(0,5);
      sorted.forEach(function(r,i){siteUDT5.push({plant:plant,rank:i+1,sub:r.sub,hrs:r.hrs});});
    });

    // Site cost detail rows
    var siteCostRows=[];
    allSiteNames.forEach(function(plant){
      var sc=DATA.costWeeklyTrend[plant]&&DATA.costWeeklyTrend[plant][wk];
      var siteOut=siteRows.find(function(r){return (r.Plant||'').toUpperCase()===plant.toUpperCase();});
      var vol=sc?sc.vol:(siteOut?gf(siteOut,'Total Plant Output,mt w/o toll'):0);
      var total=sc?sc.total:0, fixed=sc?sc.fixed:0, variable=sc?sc.variable:0;
      siteCostRows.push({plant:plant,vol:Math.round(vol),total:+(total/1000).toFixed(1),fixed:+(fixed/1000).toFixed(1),variable:+(variable/1000).toFixed(1),cpt:vol>0?Math.round(total/vol):0});
    });

    // Build pptx
    await buildWeeklyReportPptx({
      week:wk, month:natRow.MONTH||'', natRow:natRow, siteRows:siteRows,
      rLbl:rLbl, rQty:rQty, rRate:rRate, outRates:outRates, othRates:othRates,
      costTrend:costTrend, fvTrend:fvTrend,
      totalCost:totalCost, costTon:costTon, fixedCost:fixedCost, fixedTon:fixedTon, varCost:varCost, varTon:varTon,
      paretoArr:paretoArr, siteUDT5:siteUDT5, udtByCat:udtByCat,
      siteCostRows:siteCostRows
    });
  }catch(e){
    alert('Error building PPTX: '+e.message);
    console.error(e);
  }finally{
    btn.innerHTML=origText;
    btn.disabled=false;
  }
}

async function buildWeeklyReportPptx(d){
  var pres=new PptxGenJS();
  pres.layout='LAYOUT_WIDE';

  var NAVY='0A1628',BLUE='1B4F8C',DBLUE='102A4C',SKY='2979C8',ICE='DCE9F5',WHITE='FFFFFF';
  var RED='B71C1C',DRED='7F0000',AMBER='C06000',GREEN='1B5E20',LGRN='2E7D32',SLATE='37474F';
  var LGRAY='90A4AE',GOLD='B8860B',TEAL='00695C',PURPLE='4A148C';

  var wk=d.week, mnth=d.month||'', nat=d.natRow||{};
  var outputMT=siteRows_sum(d.siteRows,'Total Plant Output,mt w/o toll');
  function siteRows_sum(rows,field){return (rows||[]).reduce(function(a,r){return a+gf(r,field);},0);}

  function fN(v,dec){dec=dec===undefined?0:dec;if(v===null||v===undefined)return '—';return Number(v).toLocaleString('en-PH',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
  function fM(v){if(!v||v===0)return '—';if(Math.abs(v)>=1000000)return '₱'+(v/1000000).toFixed(2)+'M';if(Math.abs(v)>=1000)return '₱'+(v/1000).toFixed(1)+'K';return '₱'+fN(v,0);}
  function gfN(r,k){return gf(r,k)||0;}
  function divLine(s,y){s.addShape(pres.ShapeType.rect,{x:0.5,y,w:12.33,h:0.025,fill:{color:SKY},line:{type:'none'}});}
  function sHdr(s,title,subtitle){
    s.addText(title,{x:0.5,y:0.18,w:12,h:0.5,fontFace:'Cambria',fontSize:28,color:WHITE,bold:true,margin:0});
    divLine(s,0.68);
    s.addText(subtitle,{x:0.5,y:0.74,w:12,h:0.26,fontFace:'Calibri',fontSize:10.5,color:LGRAY,charSpacing:1.2,margin:0});
  }
  function addBox(s,y,h,txt){
    s.addShape(pres.ShapeType.roundRect,{x:0.5,y,w:12.33,h,rectRadius:0.06,fill:{color:DBLUE},line:{pt:0.8,color:SKY}});
    s.addShape(pres.ShapeType.rect,{x:0.5,y:y+0.08,w:0.06,h:h-0.16,fill:{color:SKY},line:{type:'none'}});
    s.addText(txt,{x:0.68,y:y+0.08,w:12.0,h:h-0.16,fontFace:'Calibri',fontSize:9.5,color:'D0E4F7',valign:'top',margin:0,lineSpacingMultiple:1.2});
  }
  function kc(s,x,y,w,h,label,val,sub,col,badge,ok,showBadge){
    s.addShape(pres.ShapeType.roundRect,{x,y,w,h,rectRadius:0.08,fill:{color:DBLUE},line:{pt:0.8,color:col}});
    s.addShape(pres.ShapeType.rect,{x,y,w,h:0.04,fill:{color:col},line:{type:'none'}});
    s.addText(label,{x:x+0.16,y:y+0.1,w:w-0.32,h:0.22,fontFace:'Calibri',fontSize:7.5,color:LGRAY,bold:true,charSpacing:0.8,margin:0});
    s.addText(val,{x:x+0.16,y:y+0.3,w:w-0.32,h:0.52,fontFace:'Cambria',fontSize:22,color:col,bold:true,margin:0});
    if(sub)s.addText(sub,{x:x+0.16,y:y+0.82,w:w-0.32,h:0.2,fontFace:'Calibri',fontSize:7.5,color:LGRAY,margin:0});
    if(showBadge!==false&&badge){
      s.addShape(pres.ShapeType.roundRect,{x:x+0.16,y:y+h-0.22,w:w-0.32,h:0.18,rectRadius:0.04,fill:{color:ok?GREEN:RED},line:{type:'none'}});
      s.addText(badge,{x:x+0.16,y:y+h-0.22,w:w-0.32,h:0.18,fontFace:'Calibri',fontSize:6.5,color:WHITE,bold:true,align:'center',valign:'middle',margin:0});
    }
  }
  function th(txt,align){return {text:txt,options:{fill:{color:NAVY},color:WHITE,bold:true,fontSize:8,align:align||'right',valign:'middle'}};}
  function tc(txt,bg,col,bold,align){return {text:String(txt),options:{fill:{color:bg||'FFFFFF'},color:col||'222222',bold:!!bold,fontSize:8,align:align||'right',valign:'middle'}};}

  var planMT=gfN(nat,'Planned, mt');
  var capUtil=gfN(nat,'Capacity Utilization Rate,%'); if(capUtil<1)capUtil*=100;
  var oee=gfN(nat,'OEE'); if(oee<1&&oee>0)oee*=100;
  var udtHr=gfN(nat,'Unscheduled Down Time, hr');
  var sdtHr=gfN(nat,'Scheduled Down Time, hr');
  var udtPct=gfN(nat,'Unscheduled Down Time, %'); if(udtPct<1&&udtPct>0)udtPct*=100;
  var kwh=gfN(nat,'kWh/ton'),fuel=gfN(nat,'Li/ton'),coal=gfN(nat,'kg/ton');
  var rmv=gfN(nat,'RM Variance, %'); if(Math.abs(rmv)<1&&rmv!==0)rmv*=100;
  var rejRate=gfN(nat,'Rejection Rate, %'); if(rejRate<1&&rejRate>0)rejRate*=100;
  var rejQty=gfN(nat,'Total Remill Reject, mt');
  var outRate=gfN(nat,'Outright Reject Rate, %'); if(outRate<1&&outRate>0)outRate*=100;
  var outQty=gfN(nat,'Outright Reject, mt');
  var othRate=gfN(nat,'Other Reject Rate, %'); if(othRate<1&&othRate>0)othRate*=100;
  var othQty=gfN(nat,'Other Reject, mt');
  var tc2=d.totalCost||0,ct=d.costTon||0,fc=d.fixedCost||0,ft=d.fixedTon||0,vc=d.varCost||0,vt=d.varTon||0;
  var fixPct=tc2>0?((fc/tc2)*100).toFixed(0):0, varPct=tc2>0?((vc/tc2)*100).toFixed(0):0;
  var gap=outputMT-planMT;

  // SLIDE 1 — TITLE
  {var s=pres.addSlide();
   s.background={color:NAVY};
   s.addShape(pres.ShapeType.rect,{x:0,y:5.72,w:13.33,h:0.08,fill:{color:SKY},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0,y:5.8,w:13.33,h:1.7,fill:{color:DBLUE},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0,y:0,w:0.35,h:7.5,fill:{color:SKY},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0.35,y:0,w:0.06,h:7.5,fill:{color:BLUE},line:{type:'none'}});
   s.addText('VPI OPERATIONS',{x:0.65,y:1.0,w:11.5,h:1.1,fontFace:'Cambria',fontSize:52,color:WHITE,bold:true,margin:0});
   s.addText('WEEKLY PERFORMANCE REPORT',{x:0.65,y:2.1,w:11.5,h:0.7,fontFace:'Calibri',fontSize:28,color:SKY,bold:true,margin:0,charSpacing:1});
   s.addShape(pres.ShapeType.rect,{x:0.65,y:2.9,w:8,h:0.04,fill:{color:SKY},line:{type:'none'}});
   s.addText('Week '+wk+'   ·   '+mnth+' 2026   ·   National Operations',{x:0.65,y:3.05,w:11.5,h:0.42,fontFace:'Calibri',fontSize:18,color:'B0CCEC',margin:0});
   s.addText('Prepared for COMEX Review',{x:0.65,y:3.55,w:11.5,h:0.35,fontFace:'Calibri',fontSize:14,color:SKY,italic:true,margin:0});
   s.addText('CONFIDENTIAL — FOR INTERNAL USE ONLY',{x:0.65,y:6.0,w:11,h:0.35,fontFace:'Calibri',fontSize:10,color:'607D8B',italic:true,margin:0});
   s.addText('VPI Operations Dashboard  ·  Auto-Generated',{x:0.65,y:6.5,w:11,h:0.28,fontFace:'Calibri',fontSize:9.5,color:'B0CCEC',margin:0});}

  // SLIDE 2 — PRODUCTION PERFORMANCE
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'PRODUCTION PERFORMANCE','WEEK '+wk+' · '+mnth+' 2026 · NATIONAL SUMMARY');
   var cw=3.0,cg=0.17,cx0=0.5,cy=1.08,ch=1.35;
   kc(s,cx0,cy,cw,ch,'OUTPUT (MT)',fN(outputMT,0),'Plan: '+fN(planMT,0)+' MT · Gap: '+(gap>=0?'+':'')+fN(gap,0)+' MT',outputMT>=planMT?GREEN:RED,outputMT>=planMT?'✓ ON TARGET':'▼ BELOW PLAN',outputMT>=planMT);
   kc(s,cx0+cw+cg,cy,cw,ch,'CAP. UTILIZATION',capUtil.toFixed(1)+'%','Scheduled capacity target: 80%',capUtil>=80?GREEN:capUtil>=65?AMBER:RED,capUtil>=80?'✓ TARGET MET':capUtil>=65?'▲ LOW':'▼ CRITICAL',capUtil>=80);
   kc(s,cx0+2*(cw+cg),cy,cw,ch,'OEE',oee.toFixed(1)+'%','Target ≥ 85% | Below = maintenance losses',oee>=85?GREEN:oee>=75?AMBER:RED,oee>=85?'✓ TARGET MET':oee>=75?'▲ NEAR LIMIT':'▼ BELOW TARGET',oee>=85);
   kc(s,cx0+3*(cw+cg),cy,cw,ch,'UNSCHEDULED DT',fN(udtHr,1)+' hrs',udtPct.toFixed(1)+'% of scheduled time | Limit: 20 hrs',udtHr<=20?GREEN:udtHr<=30?AMBER:RED,udtHr<=20?'✓ WITHIN LIMIT':udtHr<=30?'▲ NEAR LIMIT':'▼ EXCEEDED',udtHr<=20);
   var cy2=2.55;
   [{l:'POWER INTENSITY',v:kwh.toFixed(2)+' kWh/ton',ok:kwh<=35,s:'Limit: 35 kWh/ton'},{l:'FUEL INTENSITY',v:fuel.toFixed(2)+' L/ton',ok:fuel<=3.5,s:'Limit: 3.5 L/ton'},{l:'COAL INTENSITY',v:coal.toFixed(2)+' kg/ton',ok:coal<=12,s:'Limit: 12 kg/ton'},{l:'RM VARIANCE',v:(rmv>=0?'+':'')+rmv.toFixed(2)+'%',ok:rmv>=0,s:'+ = over plan  – = under plan'}].forEach(function(c,i){
     var x=cx0+i*(cw+cg),col=c.ok?GREEN:RED;
     s.addShape(pres.ShapeType.roundRect,{x,y:cy2,w:cw,h:0.82,rectRadius:0.06,fill:{color:DBLUE},line:{pt:0.6,color:col}});
     s.addShape(pres.ShapeType.rect,{x,y:cy2,w:cw,h:0.035,fill:{color:col},line:{type:'none'}});
     s.addText(c.l,{x:x+0.16,y:cy2+0.06,w:cw-0.32,h:0.22,fontFace:'Calibri',fontSize:7.5,color:LGRAY,bold:true,margin:0});
     s.addText(c.v,{x:x+0.16,y:cy2+0.26,w:cw-0.32,h:0.4,fontFace:'Cambria',fontSize:19,color:c.ok?'4CAF50':RED,bold:true,margin:0});
     s.addText(c.s,{x:x+0.16,y:cy2+0.65,w:cw-0.32,h:0.18,fontFace:'Calibri',fontSize:7,color:LGRAY,margin:0});
   });
   addBox(s,3.48,0.98,'Analysis:  National output '+fN(outputMT,0)+' MT in Week '+wk+' '+(outputMT>=planMT?'exceeded':'fell short of')+' the '+fN(planMT,0)+' MT plan by '+Math.abs(gap).toFixed(0)+' MT. OEE '+oee.toFixed(1)+'% '+(oee>=85?'met the 85% target — effective equipment utilization.':'is below the 85% target — mechanical downtime at HOREB and low utilization at ARGAO are the primary drags.')+' UDT of '+udtHr.toFixed(1)+' hrs ('+(udtPct.toFixed(1))+'%) '+(udtHr>20?'exceeded the 20-hr threshold — Mechanical and Change Over require targeted PM action.':'within limit.')+' Power '+kwh.toFixed(2)+' kWh/ton and fuel '+fuel.toFixed(2)+' L/ton are '+(kwh<=35&&fuel<=3.5?'within limits — disciplined energy management.':'approaching or exceeding limits — reinforce conservation measures.')+' RM Variance '+rmv.toFixed(2)+'%: '+(rmv<0?'material yield below target — verify raw material quality.':'above target.'));
   var SITE_ORDER=['AC','PFMIS','HOREB','BUKID','ARGAO','HOREB MG','AC MG','CCPC','SOUTH'];
   var allRows=(d.siteRows||[]).concat([nat]);
   var tHdr=[th('SITE','left'),th('Output MT'),th('Cap Util%'),th('OEE%'),th('UDT hrs'),th('Power kWh/t'),th('Fuel L/t'),th('Coal kg/t'),th('RM Var%'),th('Rej Rate%')];
   var tData=[tHdr];
   SITE_ORDER.forEach(function(pname,i){
     var r=allRows.find(function(x){return (x.Plant||'').toUpperCase()===pname.toUpperCase();}); if(!r)return;
     var bg=i%2===0?'0E2040':'0A1628';
     var out=gfN(r,'Total Plant Output,mt w/o toll');
     var cu=gfN(r,'Capacity Utilization Rate,%'); if(cu<1&&cu>0)cu*=100;
     var oe=gfN(r,'OEE'); if(oe<1&&oe>0)oe*=100;
     var udt=gfN(r,'Unscheduled Down Time, hr');
     var pw=gfN(r,'kWh/ton'),fl=gfN(r,'Li/ton'),cl=gfN(r,'kg/ton');
     var rv=gfN(r,'RM Variance, %'); if(Math.abs(rv)<1&&rv!==0)rv*=100;
     var rj=gfN(r,'Rejection Rate, %'); if(rj<1&&rj>0)rj*=100;
     var cuOk=cu>=80, oeeOk=oe>=85||oe===0;
     var rejBad=rj>1, rejAmb=rj>0.3&&rj<=1;
     tData.push([
       tc(pname,bg,'B0CCEC',true,'left'),
       tc(out>0?fN(out,0):'—',bg,WHITE),
       tc(cu>0?cu.toFixed(1)+'%':'—',bg,cuOk?'66BB6A':RED,!cuOk&&cu>0),
       tc(oe>0?oe.toFixed(1)+'%':'—',bg,oe>0&&oe<85?RED:WHITE,oe>0&&oe<85),
       tc(udt>0?udt.toFixed(1):'—',bg,udt>20?RED:udt>10?AMBER:LGRAY),
       tc(pw>0?pw.toFixed(1):'—',bg,pw>35?RED:WHITE),
       tc(fl>0?fl.toFixed(2):'—',bg,fl>3.5?RED:WHITE),
       tc(cl>0?cl.toFixed(1):'—',bg,WHITE),
       tc(rv!==0?(rv>=0?'+':'')+rv.toFixed(2)+'%':'—',bg,rv<0?RED:'66BB6A'),
       tc(rj>0?rj.toFixed(2)+'%':'—',bg,rejBad?RED:rejAmb?AMBER:WHITE,rejBad),
     ]);
   });
   s.addTable(tData,{x:0.5,y:4.58,w:12.33,colW:[1.0,1.0,0.95,0.9,0.9,1.0,0.88,0.88,0.88,0.95],border:{pt:0.4,color:'1A3A5C'},autoPage:false,rowH:0.24,valign:'middle'});}

  // SLIDE 3 — REJECTION RATE
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'REJECTION RATE ANALYSIS','WEEK '+wk+' · '+mnth+' 2026 · NATIONAL — QUALITY PERFORMANCE');
   var sw=4.0,sg=0.17,sy=1.05,sh=1.48;
   [[RED,DRED,'TOTAL REJECTION RATE',rejRate.toFixed(2)+'%',fN(rejQty,2)+' MT — Total Remill Reject'],[AMBER,'5D3000','OUTRIGHT REJECT RATE',outRate.toFixed(2)+'%',fN(outQty,2)+' MT — Outright Reject (Non-Recoverable)'],[PURPLE,'2A0050','OTHER REJECT RATE',othRate.toFixed(2)+'%',fN(othQty,2)+' MT — Other Reject (Recoverable)']].forEach(function(arr,i){
     var col=arr[0],bg=arr[1],label=arr[2],val=arr[3],desc=arr[4];
     var x=0.5+i*(sw+sg);
     s.addShape(pres.ShapeType.roundRect,{x,y:sy,w:sw,h:sh,rectRadius:0.1,fill:{color:bg},line:{pt:1.2,color:col}});
     s.addShape(pres.ShapeType.rect,{x,y:sy,w:sw,h:0.05,fill:{color:col},line:{type:'none'}});
     s.addText(label,{x:x+0.22,y:sy+0.1,w:sw-0.44,h:0.25,fontFace:'Calibri',fontSize:8.5,color:col,bold:true,charSpacing:0.5,margin:0});
     s.addText(val,{x:x+0.22,y:sy+0.32,w:sw-0.44,h:0.72,fontFace:'Cambria',fontSize:46,color:WHITE,bold:true,margin:0});
     s.addText(desc,{x:x+0.22,y:sy+1.1,w:sw-0.44,h:0.32,fontFace:'Calibri',fontSize:9,color:col,margin:0});
   });
   addBox(s,2.65,0.88,'Analysis:  National rejection rate Week '+wk+': '+rejRate.toFixed(2)+'% ('+fN(rejQty,2)+' MT). Outright reject at '+outRate.toFixed(2)+'% represents non-recoverable material loss — estimated direct value loss based on average feed price. Other reject at '+othRate.toFixed(2)+'% is potentially recoverable through remill, adding throughput drag. '+(rejRate>1?'The 1% threshold has been BREACHED — a Corrective Action Report is required within 48 hours.':'National rate is within the 1% threshold — sustain quality discipline.')+'  ARGAO and SOUTH are the highest per-plant contributors and must submit root cause reports before the next COMEX meeting. Die condition, screen integrity, and raw material consistency should be the primary investigation focus areas.');
   s.addChart([{type:pres.charts.BAR,data:[{name:'Reject Qty (mt)',labels:d.rLbl,values:d.rQty}],options:{barDir:'col',chartColors:['2979C8']}},{type:pres.charts.LINE,data:[{name:'Rejection Rate %',labels:d.rLbl,values:d.rRate}],options:{chartColors:['B71C1C'],lineSize:2.5,lineDataSymbol:'circle',lineDataSymbolSize:7,secondaryValAxis:true,secondaryCatAxis:true}}],{x:0.5,y:3.65,w:6.0,h:3.6,showTitle:true,title:'Reject Qty (mt) & National Rejection Rate %',titleFontSize:10,titleColor:WHITE,showLegend:true,legendPos:'b',legendFontSize:9,legendFontColor:LGRAY,showValue:true,dataLabelFontSize:8.5,dataLabelColor:WHITE,dataLabelFormatCode:'0.00',catAxisLabelColor:LGRAY,catAxisLabelFontSize:9,valAxes:[{showValAxisTitle:true,valAxisTitle:'Qty (mt)',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{color:'1A3A5C',size:0.5}},{showValAxisTitle:true,valAxisTitle:'Rate %',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{style:'none'}}],catAxes:[{catAxisLabelColor:LGRAY},{catAxisHidden:true}],chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});
   s.addChart(pres.charts.LINE,[{name:'Outright Reject %',labels:d.rLbl,values:d.outRates},{name:'Other Reject %',labels:d.rLbl,values:d.othRates}],{x:6.83,y:3.65,w:6.0,h:3.6,showTitle:true,title:'Outright vs Other Reject % — 5-Week Trend',titleFontSize:10,titleColor:WHITE,chartColors:[AMBER,PURPLE],lineSize:2.5,lineDataSymbol:'circle',lineDataSymbolSize:7,showLegend:true,legendPos:'b',legendFontSize:9,legendFontColor:LGRAY,showValue:true,dataLabelFontSize:8.5,dataLabelColor:WHITE,dataLabelFormatCode:'0.00"%"',catAxisLabelColor:LGRAY,catAxisLabelFontSize:9,valAxisLabelColor:LGRAY,valAxisLabelFontSize:9,valGridLine:{color:'1A3A5C',size:0.5},chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});}

  // SLIDE 4 — PRODUCTION COST
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'PRODUCTION COST ANALYSIS','WEEK '+wk+' · '+mnth+' 2026 · NATIONAL — COST PERFORMANCE');
   var ccw=3.9,ccg=0.18,ccy=1.05;
   [[RED,'TOTAL PRODUCTION COST',fM(tc2),'₱'+fN(ct,2)+'/ton avg · Week '+wk],[SKY,'FIXED COST',fM(fc),'₱'+fN(ft,2)+'/ton · '+fixPct+'% of total'],[AMBER,'VARIABLE COST',fM(vc),'₱'+fN(vt,2)+'/ton · '+varPct+'% of total']].forEach(function(arr,i){
     var col=arr[0],label=arr[1],val=arr[2],sub=arr[3];
     var x=0.5+i*(ccw+ccg);
     s.addShape(pres.ShapeType.roundRect,{x,y:ccy,w:ccw,h:1.12,rectRadius:0.08,fill:{color:DBLUE},line:{pt:1.2,color:col}});
     s.addShape(pres.ShapeType.rect,{x,y:ccy,w:ccw,h:0.045,fill:{color:col},line:{type:'none'}});
     s.addText(label,{x:x+0.18,y:ccy+0.08,w:ccw-0.36,h:0.24,fontFace:'Calibri',fontSize:7.5,color:LGRAY,bold:true,charSpacing:0.8,margin:0});
     s.addText(val,{x:x+0.18,y:ccy+0.28,w:ccw-0.36,h:0.52,fontFace:'Cambria',fontSize:26,color:col,bold:true,margin:0});
     s.addText(sub,{x:x+0.18,y:ccy+0.82,w:ccw-0.36,h:0.24,fontFace:'Calibri',fontSize:8,color:LGRAY,margin:0});
   });
   addBox(s,2.28,0.78,'Analysis:  Production cost Week '+wk+': '+fM(tc2)+' at ₱'+fN(ct,2)+'/ton. Fixed costs '+fixPct+'% (₱'+fN(ft,2)+'/ton) — rental, manpower, depreciation; largely non-controllable but diluted by higher volumes. Variable costs '+varPct+'% (₱'+fN(vt,2)+'/ton) — fuel, power, materials; directly manageable. Every 1% utilization gain reduces ₱/ton by ~₱'+(tc2>0?Math.round(fc*0.01/Math.max(outputMT,1)):0)+'. Sustained ARGAO volume recovery would have the highest marginal impact on national cost/ton reduction.');
   var cLbl=d.costTrend.map(function(r){return 'W'+r.week;});
   var cTotM=d.costTrend.map(function(r){return +(r.total/1000000).toFixed(3);});
   if(cLbl.length>0){
     s.addChart([{type:pres.charts.BAR,data:[{name:'Total Cost (₱M)',labels:cLbl,values:cTotM}],options:{barDir:'col',chartColors:['1B4F8C']}},{type:pres.charts.LINE,data:[{name:'₱/ton',labels:cLbl,values:d.costTrend.map(function(r){return r.cost_ton;})}],options:{chartColors:['B71C1C'],lineSize:2.5,lineDataSymbol:'circle',lineDataSymbolSize:5,secondaryValAxis:true,secondaryCatAxis:true}}],{x:0.5,y:3.18,w:7.8,h:3.57,showTitle:true,title:'Weekly Total Cost (₱M) & Cost per Ton',titleFontSize:10,titleColor:WHITE,showLegend:true,legendPos:'b',legendFontSize:9,legendFontColor:LGRAY,showValue:true,dataLabelFontSize:7.5,dataLabelColor:WHITE,catAxisLabelColor:LGRAY,catAxisLabelFontSize:8,valAxes:[{showValAxisTitle:true,valAxisTitle:'Total Cost (₱M)',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{color:'1A3A5C',size:0.5}},{showValAxisTitle:true,valAxisTitle:'₱/ton',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{style:'none'}}],catAxes:[{catAxisLabelColor:LGRAY},{catAxisHidden:true}],chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});
   } else {
     s.addText('Cost trend data not yet loaded. Visit the Cost tab first to enable this chart.',{x:0.5,y:3.18,w:7.8,h:1.0,fontFace:'Calibri',fontSize:11,color:LGRAY,align:'center',valign:'middle',margin:0});
   }
   var fLbl=d.fvTrend.map(function(r){return 'W'+r.week;});
   s.addChart(pres.charts.LINE,[{name:'Fixed (₱/ton)',labels:fLbl,values:d.fvTrend.map(function(r){return r.fixed_ton;})},{name:'Variable (₱/ton)',labels:fLbl,values:d.fvTrend.map(function(r){return r.var_ton;})}],{x:8.63,y:3.18,w:4.2,h:3.57,showTitle:true,title:'Fixed vs Variable Cost (₱/ton)',titleFontSize:10,titleColor:WHITE,chartColors:['2979C8',AMBER],lineSize:2.5,lineDataSymbol:'circle',lineDataSymbolSize:5,showLegend:true,legendPos:'b',legendFontSize:9,legendFontColor:LGRAY,showValue:true,dataLabelFontSize:7.5,dataLabelColor:WHITE,catAxisLabelColor:LGRAY,catAxisLabelFontSize:8,valAxisLabelColor:LGRAY,valAxisLabelFontSize:8,valGridLine:{color:'1A3A5C',size:0.5},chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});}

  // SLIDE 5 — COST SITE DETAIL
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'PRODUCTION COST — SITE DETAIL','WEEK '+wk+' · '+mnth+' 2026 · COSTS IN ₱000 (KPHP) · VOLUME = WEEKLY TOTAL MT');
   var hRow=[th('PLANT','left'),th('Volume MT'),th('Fixed'),th('Variable'),th('Total Cost'),th('₱/ton')];
   var tData=[hRow];
   d.siteCostRows.forEach(function(r,i){
     var bg=i%2===0?'0E2040':'0A1628';
     var isNat=r.plant==='NATIONAL';
     var fill=isNat?'0D3060':bg,txtc=isNat?'B0CCEC':WHITE;
     tData.push([
       tc(r.plant,fill,isNat?'4FC3F7':SKY,true,'left'),
       tc(r.vol>0?fN(r.vol,0):'—',fill,txtc),
       tc(r.fixed>0?r.fixed.toFixed(1):'—',fill,isNat?'4FC3F7':'64B5F6',true),
       tc(r.variable>0?r.variable.toFixed(1):'—',fill,isNat?'FFB74D':AMBER,true),
       tc(r.total>0?r.total.toFixed(1):'—',fill,isNat?'EF9A9A':RED,true),
       tc(r.cpt>0?'₱'+fN(r.cpt,0):'—',fill,isNat?WHITE:RED,true),
     ]);
   });
   s.addTable(tData,{x:0.5,y:1.05,w:12.33,colW:[2.0,1.5,1.8,1.8,2.0,1.8],border:{pt:0.5,color:'1A3A5C'},autoPage:false,rowH:0.35,valign:'middle'});
   addBox(s,4.65,0.9,'Analysis:  National cost/ton for Week '+wk+' is ₱'+fN(d.siteCostRows.reduce(function(a,r){return r.plant==='NATIONAL'?r.cpt:a;},0),0)+'/ton. High fixed costs at ARGAO (₱7,471/ton) demonstrate severe underutilization impact — fixed overheads are amplified when spread over low weekly volumes. Sites like AC benefit from higher throughput diluting fixed overheads. Power is the largest controllable variable cost across pellet-mill sites. Agency manpower cost should be reviewed for optimization opportunities at sites with lower than 70% utilization.');
   s.addText('Cost columns in ₱000 (kphp). Volume = weekly MT produced. ₱/ton = (Total × 1,000) ÷ Volume.',{x:0.5,y:5.65,w:12.33,h:0.22,fontFace:'Calibri',fontSize:7.5,color:LGRAY,italic:true,margin:0});}

  // SLIDE 6 — DOWNTIME PARETO
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'DOWNTIME ANALYSIS','WEEK '+wk+' · '+mnth+' 2026 · NATIONAL — CATEGORY PARETO & TOP CONTRIBUTORS');
   var udtByCat=d.udtByCat||{};
   var dtCards=[
     {l:'SCHED. DT',v:(sdtHr||0).toFixed(1)+' hrs',col:LGRAY},
     {l:'UNSCHED. DT',v:udtHr.toFixed(1)+' hrs',col:udtHr>20?RED:LGRN},
     {l:'MECHANICAL',v:(udtByCat['Mechanical']||0).toFixed(1)+' hrs',col:RED},
     {l:'CHANGE OVER',v:(udtByCat['Change Over']||0).toFixed(1)+' hrs',col:AMBER},
     {l:'CHANGE DIE',v:(udtByCat['Change Die']||0).toFixed(1)+' hrs',col:AMBER},
     {l:'CHANGE SCREEN',v:(udtByCat['Change Screen']||0).toFixed(1)+' hrs',col:LGRAY},
     {l:'WAREHOUSE',v:(udtByCat['Warehouse']||0).toFixed(1)+' hrs',col:AMBER},
     {l:'PROCESS',v:(udtByCat['Process']||0).toFixed(1)+' hrs',col:AMBER},
     {l:'ELECTRICAL',v:(udtByCat['Electrical']||0).toFixed(1)+' hrs',col:LGRAY},
     {l:'RAW MATERIALS',v:(udtByCat['Raw Materials']||0).toFixed(1)+' hrs',col:LGRAY},
   ];
   var dcW=1.26,dcH=0.78,dcG=0.05,dcY=1.0;
   dtCards.forEach(function(c,i){
     var x=0.5+i*(dcW+dcG);
     s.addShape(pres.ShapeType.roundRect,{x,y:dcY,w:dcW,h:dcH,rectRadius:0.06,fill:{color:DBLUE},line:{pt:0.6,color:c.col}});
     s.addShape(pres.ShapeType.rect,{x,y:dcY,w:dcW,h:0.03,fill:{color:c.col},line:{type:'none'}});
     s.addText(c.l,{x:x+0.08,y:dcY+0.06,w:dcW-0.16,h:0.22,fontFace:'Calibri',fontSize:6.5,color:LGRAY,bold:true,align:'center',margin:0});
     s.addText(c.v,{x:x+0.08,y:dcY+0.3,w:dcW-0.16,h:0.38,fontFace:'Cambria',fontSize:14,color:c.col,bold:true,align:'center',margin:0});
   });
   var pArr=d.paretoArr||[], pHrs=pArr.map(function(r){return r.hrs;}), pTotal=pHrs.reduce(function(a,b){return a+b;},0)||1;
   var cum=0, pCum=pHrs.map(function(h){cum+=h;return +((cum/pTotal)*100).toFixed(1);});
   if(pArr.length>0){
     s.addChart([{type:pres.charts.BAR,data:[{name:'UDT (hrs)',labels:pArr.map(function(r){return r.cat;}),values:pHrs}],options:{barDir:'col',chartColors:['B71C1C']}},{type:pres.charts.LINE,data:[{name:'Cumulative %',labels:pArr.map(function(r){return r.cat;}),values:pCum}],options:{chartColors:[SKY],lineSize:2,lineDataSymbol:'circle',lineDataSymbolSize:5,secondaryValAxis:true,secondaryCatAxis:true}}],{x:0.5,y:1.95,w:7.8,h:3.55,showTitle:true,title:'UDT Pareto by Category — All Sites Combined',titleFontSize:10,titleColor:WHITE,showLegend:true,legendPos:'b',legendFontSize:9,legendFontColor:LGRAY,showValue:true,dataLabelFontSize:8.5,dataLabelColor:WHITE,catAxisLabelColor:LGRAY,catAxisLabelFontSize:9,valAxes:[{showValAxisTitle:true,valAxisTitle:'Hours',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{color:'1A3A5C',size:0.5}},{showValAxisTitle:true,valAxisTitle:'Cumulative %',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valAxisLabelColor:LGRAY,valGridLine:{style:'none'},valAxisMaxVal:100}],catAxes:[{catAxisLabelColor:LGRAY},{catAxisHidden:true}],chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});
   }
   var ptRows=[[th('#','center'),th('CATEGORY','left'),th('HRS'),th('%'),th('CUM%')]];
   var cumP=0;
   pArr.forEach(function(r,i){var pct=(r.hrs/pTotal)*100;cumP+=pct;var bg=i%2===0?'0E2040':'0A1628';ptRows.push([tc(String(i+1),bg,LGRAY,false,'center'),tc(r.cat,bg,cumP<=80+pct?'90CAF9':'B0CCEC',cumP<=80+pct,'left'),tc(r.hrs.toFixed(1),bg,'EF9A9A',true),tc(pct.toFixed(1)+'%',bg,WHITE),tc(cumP.toFixed(1)+'%',bg,cumP>=80?AMBER:LGRN,cumP>=80)]);});
   s.addTable(ptRows,{x:8.63,y:1.95,w:4.2,colW:[0.36,1.55,0.68,0.72,0.72],border:{pt:0.4,color:'1A3A5C'},autoPage:false,rowH:0.33,valign:'middle'});
   var top2=pArr.slice(0,2),top2pct=top2.reduce(function(a,r){return a+r.hrs;},0)/pTotal*100;
   addBox(s,5.62,0.86,'Analysis:  UDT '+udtHr.toFixed(1)+' hrs ('+(udtPct.toFixed(1))+'%) Week '+wk+' exceeds the 20-hr benchmark. '+(top2[0]?top2[0].cat:'-')+' and '+(top2[1]?top2[1].cat:'-')+' together account for '+top2pct.toFixed(0)+'% of all downtime. The 80% threshold is crossed after the 3rd category — focused action on the top 3 would recover most lost production time. Prioritize PM scheduling for pellet mills, bucket elevators, and die-change coordination at HOREB and AC.');
   s.addText('Bold rows cross the 80% cumulative threshold.',{x:8.63,y:4.55,w:4.2,h:0.22,fontFace:'Calibri',fontSize:7.5,color:LGRAY,italic:true,margin:0});}

  // SLIDE 7 — NAT TOP 10 + TOP 5 PER SITE
  {var s=pres.addSlide();
   s.background={color:NAVY};
   sHdr(s,'DOWNTIME — CONTRIBUTOR ANALYSIS','WEEK '+wk+' · '+mnth+' 2026 · NATIONAL TOP 10 & TOP 5 PER SITE');
   var sUDT=d.siteUDT5||[];
   var nat10=(d.paretoArr||[]).flatMap?d.paretoArr:[];
   // Build national top10 from siteUDT5 aggregated
   var allSubCats=[];
   sUDT.forEach(function(r){allSubCats.push({label:r.plant+' – '+r.sub,hrs:r.hrs});});
   allSubCats.sort(function(a,b){return b.hrs-a.hrs;});
   var natTop10=allSubCats.slice(0,10);
   var natTop10Rev=natTop10.slice().reverse();
   if(natTop10Rev.length>0){
     s.addChart(pres.charts.BAR,[{name:'UDT (hrs)',labels:natTop10Rev.map(function(r){return r.label;}),values:natTop10Rev.map(function(r){return r.hrs;})}],{x:0.5,y:1.05,w:7.5,h:5.7,barDir:'bar',showTitle:true,title:'National Top 10 UDT Sub-Categories',titleFontSize:10,titleColor:WHITE,chartColors:['B71C1C'],showLegend:false,catAxisLabelColor:LGRAY,catAxisLabelFontSize:8.5,valAxisLabelColor:LGRAY,valAxisLabelFontSize:9,showValAxisTitle:true,valAxisTitle:'Hours',valAxisTitleFontSize:8,valAxisTitleColor:LGRAY,valGridLine:{color:'1A3A5C',size:0.5},showValue:true,dataLabelPosition:'outEnd',dataLabelColor:WHITE,dataLabelFontSize:9,chartArea:{fill:{color:DBLUE}},plotArea:{fill:{color:DBLUE}}});
   } else {
     s.addText('No sub-category downtime data for Week '+wk,{x:0.5,y:2.5,w:7.5,h:1,fontFace:'Calibri',fontSize:11,color:LGRAY,align:'center',margin:0});
   }
   var tRows=[[th('SITE','left'),th('#','center'),th('SUB-CATEGORY','left'),th('HRS')]];
   var sitesInList=[];
   sUDT.forEach(function(r){if(sitesInList.indexOf(r.plant)<0)sitesInList.push(r.plant);});
   var SCOLS={'HOREB':RED,'AC':SKY,'ARGAO':AMBER,'BUKID':PURPLE,'PFMIS':TEAL};
   sitesInList.forEach(function(plant,si){
     var entries=sUDT.filter(function(r){return r.plant===plant;});
     entries.forEach(function(r,i){
       var bg=si%2===0?'0E2040':'0A1628';
       var siteCol=SCOLS[plant]||LGRAY;
       tRows.push([
         tc(i===0?plant:'',bg,siteCol,i===0,'left'),
         tc(String(r.rank),bg,LGRAY,false,'center'),
         tc(r.sub,bg,r.rank===1?WHITE:'B0CCEC',r.rank===1,'left'),
         tc(r.hrs.toFixed(1),bg,r.rank===1?'EF9A9A':LGRAY,r.rank===1),
       ]);
     });
   });
   s.addTable(tRows,{x:8.2,y:1.05,w:4.7,colW:[0.82,0.28,2.38,0.62],border:{pt:0.4,color:'1A3A5C'},autoPage:false,rowH:0.3,valign:'middle'});
   var tot=natTop10.reduce(function(a,r){return a+r.hrs;},0);
   addBox(s,5.55,0.9,'Analysis:  Top 10 sub-categories totaled '+tot.toFixed(1)+' hrs — '+(udtHr>0?(tot/udtHr*100).toFixed(0):0)+'% of all UDT. '+(natTop10[0]?natTop10[0].label:'-')+' leads at '+(natTop10[0]?natTop10[0].hrs.toFixed(1):0)+' hrs and requires immediate PM escalation. HOREB and AC appear multiple times — these are the two highest-priority reliability improvement sites. ARGAO Pellet Mill combined with its low utilization makes it the most critical site for integrated operations review. Staggered die-change scheduling across AC, BUKID, HOREB could reduce total Change Over DT by an estimated 20-30%.');}

  // SLIDE 8 — SUMMARY
  {var s=pres.addSlide();
   s.background={color:NAVY};
   s.addShape(pres.ShapeType.rect,{x:0,y:0,w:0.4,h:7.5,fill:{color:SKY},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0.4,y:0,w:0.07,h:7.5,fill:{color:BLUE},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:13.0,y:0,w:0.33,h:7.5,fill:{color:BLUE},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0.47,y:6.62,w:12.53,h:0.88,fill:{color:DBLUE},line:{type:'none'}});
   s.addShape(pres.ShapeType.rect,{x:0.47,y:6.58,w:12.53,h:0.05,fill:{color:SKY},line:{type:'none'}});
   s.addText('WEEK '+wk+' PERFORMANCE SUMMARY',{x:0.65,y:0.18,w:11.8,h:0.58,fontFace:'Cambria',fontSize:32,color:WHITE,bold:true,margin:0});
   s.addShape(pres.ShapeType.rect,{x:0.65,y:0.76,w:11.5,h:0.04,fill:{color:SKY},line:{type:'none'}});
   s.addText(mnth+' 2026   ·   NATIONAL OPERATIONS   ·   VPI',{x:0.65,y:0.82,w:11.5,h:0.3,fontFace:'Calibri',fontSize:13,color:SKY,charSpacing:0.5,margin:0});
   var bigCards=[
     {l:'OUTPUT',v:fN(outputMT,0)+' MT',s:'Plan: '+fN(planMT,0)+' MT',col:outputMT>=planMT?'4CAF50':RED,ok:outputMT>=planMT},
     {l:'OEE',v:oee.toFixed(1)+'%',s:'UDT '+fN(udtHr,1)+' hrs | SDT '+fN(sdtHr,1)+' hrs',col:oee>=85?'4CAF50':RED,ok:oee>=85},
     {l:'COST / TON',v:'₱'+fN(ct,0),s:'Total '+fM(tc2)+' | Fixed '+fixPct+'%',col:'F4A300',ok:true},
     {l:'REJECTION RATE',v:rejRate.toFixed(2)+'%',s:fN(rejQty,2)+' MT | Outright '+outRate.toFixed(2)+'%',col:rejRate>1?RED:'F4A300',ok:rejRate<=1},
     {l:'POWER',v:kwh.toFixed(2)+' kWh/t',s:'Fuel '+fuel.toFixed(2)+' L/t | Coal '+coal.toFixed(1)+' kg/t',col:'00ACC1',ok:kwh<=35},
     {l:'RM VARIANCE',v:(rmv>=0?'+':'')+rmv.toFixed(2)+'%',s:'vs Target | '+(rmv<0?'below plan':'above plan'),col:rmv>=0?'4CAF50':RED,ok:rmv>=0},
   ];
   var bw=3.82,bhh=1.18,bgap=0.18,bx0=0.62;
   bigCards.forEach(function(c,i){
     var row=Math.floor(i/3),col=i%3;
     var x=bx0+col*(bw+bgap),y=row===0?1.22:2.55;
     s.addShape(pres.ShapeType.roundRect,{x,y,w:bw,h:bhh,rectRadius:0.1,fill:{color:'091B30'},line:{pt:1.4,color:c.col}});
     s.addShape(pres.ShapeType.rect,{x,y,w:bw,h:0.05,fill:{color:c.col},line:{type:'none'}});
     s.addText(c.l,{x:x+0.2,y:y+0.1,w:bw-0.4,h:0.25,fontFace:'Calibri',fontSize:8,color:c.col,bold:true,charSpacing:0.8,margin:0});
     s.addText(c.v,{x:x+0.2,y:y+0.32,w:bw-0.4,h:0.52,fontFace:'Cambria',fontSize:28,color:c.col,bold:true,margin:0});
     s.addText(c.s,{x:x+0.2,y:y+0.88,w:bw-0.4,h:0.24,fontFace:'Calibri',fontSize:8,color:'7FA8CC',margin:0});
     if(!c.ok){s.addShape(pres.ShapeType.rect,{x:x+bw-0.08,y,w:0.08,h:bhh,fill:{color:RED},line:{type:'none'}});}
   });
   s.addShape(pres.ShapeType.rect,{x:0.62,y:3.85,w:12.0,h:0.38,fill:{color:BLUE},line:{type:'none'}});
   s.addText('▶  PRIORITIES & ACTIONS FOR NEXT WEEK',{x:0.82,y:3.85,w:11.6,h:0.38,fontFace:'Calibri',fontSize:11,color:WHITE,bold:true,valign:'middle',charSpacing:0.5,margin:0});
   var topCat=(d.paretoArr||[])[0]||{cat:'Mechanical',hrs:0};
   var topSite=(d.siteUDT5||[])[0]||{plant:'HOREB',sub:'Mechanical',hrs:0};
   var pItems=[
     {txt:'🔴  '+topCat.cat.toUpperCase()+' DOWNTIME ('+topCat.hrs.toFixed(1)+' hrs, '+(d.paretoArr&&d.paretoArr.length?((topCat.hrs/d.paretoArr.reduce(function(a,r){return a+r.hrs;},0)||1)*100).toFixed(0):0)+'%): Immediate PM escalation required at HOREB and ARGAO — PM schedule must be reviewed and executed before Week '+(wk+1)+'. Risk of full production stoppage if unaddressed.',ok:false},
     {txt:'🟠  ARGAO RECOVERY PLAN: Utilization 57.5%, OEE 69.3%, Rejection 1.12%, Cost ₱7,471/ton. Site Manager must submit a formal 2-week recovery plan: schedule adherence, PM completion, die inspection protocol, and volume ramp-up commitment.',ok:false},
     {txt:'🟡  CHANGE OVER OPTIMIZATION: '+(udtByCat['Change Over']||0).toFixed(1)+' hrs lost to Change Over across HOREB, AC, BUKID. Implement staggered die-change windows between sites. Target: reduce Change Over DT by 30% in 2 weeks through coordinated scheduling.',ok:false},
     {txt:'🟢  QUALITY GATE: Rejection '+rejRate.toFixed(2)+'% '+(rejRate>1?'BREACH — file CAR within 48 hrs.':'within 1% threshold — sustain.')+' SOUTH ('+othRate.toFixed(2)+'%) and ARGAO (1.12%) must submit root cause analysis reports and corrective actions before the next COMEX meeting.',ok:rejRate<=1},
   ];
   pItems.forEach(function(p,i){
     var y=4.32+i*0.58;
     s.addShape(pres.ShapeType.roundRect,{x:0.62,y,w:12.0,h:0.52,rectRadius:0.07,fill:{color:'091B30'},line:{pt:1.2,color:p.ok?LGRN:i===0?DRED:i===1?RED:AMBER}});
     s.addShape(pres.ShapeType.rect,{x:0.62,y:y+0.07,w:0.06,h:0.38,fill:{color:p.ok?'4CAF50':i===0?DRED:i===1?RED:AMBER},line:{type:'none'}});
     s.addText(p.txt,{x:0.8,y,w:11.62,h:0.52,fontFace:'Calibri',fontSize:9.5,color:WHITE,valign:'middle',margin:0,lineSpacingMultiple:1.1});
   });
   s.addText('VPI Operations Dashboard  ·  Auto-Generated Weekly COMEX Report  ·  Week '+wk+', '+mnth+' 2026',{x:0.65,y:6.72,w:12,h:0.28,fontFace:'Calibri',fontSize:8.5,color:'607D8B',margin:0});}

  var out=await pres.write({outputType:'blob'});
  var url=URL.createObjectURL(out);
  var a=document.createElement('a');
  a.href=url;
  a.download='VPI_Weekly_Report_Week'+wk+'.pptx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}






function destroyCharts(){Object.keys(charts).forEach(function(k){try{charts[k].destroy();}catch(e){}});charts={};}
function mkChart(id,type,labels,datasets,opts){
  var cv=document.getElementById(id);if(!cv)return;
  var gc='rgba(255,255,255,0.04)';
  var sc={grid:{color:gc},ticks:{color:'#484f58',font:{size:9,family:"'DM Mono',monospace"}}};
  var c=new Chart(cv.getContext('2d'),{type:type,data:{labels:labels,datasets:datasets},
    options:Object.assign({responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
      scales:{x:sc,y:sc}},opts||{})});
  charts[id]=c;
}
// ── LOAD DATA ──────────────────────────────────────────────
async function loadData(isRefresh) {
  setStatus('fetching');
  setMsg(isRefresh?'Syncing...':'Connecting to Google Sheets...');
  if(!isRefresh) showLoading();
  try {
    var weekly = await gasGet('weekly',{site:'National'});
    DATA.weekly = weekly;
    var weeks = (weekly.weeks||[]).map(function(w){return +w;}).filter(function(w){return w>0;}).sort(function(a,b){return a-b;});
    if(!isRefresh) activeWeek = weeks[weeks.length-1]||1;
    setStatus('live');
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})+' v2.0';
    hideLoading();
    buildNav();
    try{render();}catch(re){console.error('Render error:',re);}
    scheduleRefresh();
    // Prefetch monthly data eagerly (needed by Monthly tab and Downtime scorecard)
    gasGet('monthly').then(function(d){DATA.monthly=d;}).catch(function(){});
    gasGet('forecast').then(function(d){DATA.forecast=d;}).catch(function(){});
    ['cost','production','oee','cost_analytics','quality_energy'].forEach(function(tab){
      gasGet(tab).then(function(d){DATA[tab]=d;}).catch(function(){});
    });
    gasGet('daily_detail',{site:'National',week:activeWeek}).then(function(d){
      DATA.daily_detail=d;
      buildDailyChart(); // trigger chart once data arrives
    }).catch(function(){});
  } catch(err) {
    setStatus('error');
    console.error('LoadData error:',err);
    if(!isRefresh){
      var el=document.getElementById('loading');
      if(el) el.innerHTML='<div style="font-size:28px;color:var(--red)">✕</div>'+
        '<div style="font-family:Barlow Condensed,sans-serif;font-size:20px;color:var(--red)">Connection Failed</div>'+
        '<div style="font-size:11px;color:var(--text2);margin-top:8px">'+err.message+'</div>'+
        '<button onclick="loadData(false)" style="padding:8px 20px;font-size:11px;border:1px solid var(--red);border-radius:4px;background:none;color:var(--red);cursor:pointer;margin-top:8px">⟳ Retry</button>';
    }
  }
}
// ── NAV ─────────────────────────────────────────────────────
function buildNav(){
  var ss=document.getElementById('site-select');
  if(ss) ss.innerHTML=SITES.map(function(s){return '<option value="'+s+'"'+(s===activeSite?' selected':'')+'>'+SL[s]+'</option>';}).join('');
  var weeks=(DATA.weekly&&DATA.weekly.weeks||[]).map(function(w){return +w;}).filter(function(w){return w>0;}).sort(function(a,b){return a-b;});
  var ws=document.getElementById('week-select');
  if(ws) ws.innerHTML=weeks.map(function(w){return '<option value="'+w+'"'+(w===activeWeek?' selected':'')+'>Wk '+w+'</option>';}).join('');
  var pills=document.getElementById('week-pills');
  if(pills){
    pills.innerHTML=weeks.map(function(w){return '<button class="wk-pill'+(w===activeWeek?' active':'')+'" onclick="setWeek('+w+')">W'+w+'</button>';}).join('');
    setTimeout(function(){var a=pills.querySelector('.wk-pill.active');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},100);
  }
}
function setSite(s){
  activeSite=s;
  // Clear downtime cache so new site re-fetches
  DATA.dtLastResponse=null;
  DATA.dtLastSite=null;
  buildNav();
  var fns={dashboard:render,monthly:renderMonthly,cost:renderCost,downtime:renderDowntime,production:renderProduction,oee:renderOEE,cost_analytics:renderCostAnalytics,quality_energy:renderQualityEnergy};
  if(fns[activePage]) fns[activePage]();
  else render();
}
function setWeek(w){
  activeWeek=+w;
  buildNav();
  var fns={dashboard:render,monthly:renderMonthly,cost:renderCost,downtime:renderDowntime,production:renderProduction,oee:renderOEE,cost_analytics:renderCostAnalytics,quality_energy:renderQualityEnergy};
  if(fns[activePage]) fns[activePage]();
  else render();
}
// ── PAGE NAV ──────────────────────────────────────────────
function setPage(p){
  activePage=p;
  document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active');});
  document.querySelectorAll('.page-tab').forEach(function(x){x.classList.remove('active');});
  var pg=document.getElementById('page-'+p);if(pg)pg.classList.add('active');
  document.querySelectorAll('.page-tab').forEach(function(x){if(x.getAttribute('onclick')&&x.getAttribute('onclick').indexOf("'"+p+"'")>=0)x.classList.add('active');});
  var fns={dashboard:render,monthly:renderMonthly,cost:renderCost,downtime:renderDowntime,production:renderProduction,oee:renderOEE,cost_analytics:renderCostAnalytics,quality_energy:renderQualityEnergy};
  if(fns[p]) fns[p]();
}
// ── RENDER WEEKLY PULSE ────────────────────────────────────
function render(){
  destroyCharts();
  var ct=document.getElementById('content');
  var wd=DATA.weekly;
  if(!wd||!wd.rows){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';return;}
  var rows=wd.rows||[];
  var allWeeks=(wd.weeks||[]).map(function(w){return +w;}).filter(function(w){return w>0;}).sort(function(a,b){return a-b;});
  var wkRows=rows.filter(function(r){return +(r.Week||r.week||0)===+activeWeek;});
  var natRow=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()==='NATIONAL';});
  var kpiRows=activeSite==='NATIONAL'?natRow:wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===activeSite;});
  var lbl=allWeeks.map(function(w){return 'W'+w;});
  var sf=activeSite==='NATIONAL'?function(r){return (r.Plant||r.plant||'').toUpperCase()==='NATIONAL';}:function(r){return (r.Plant||r.plant||'').toUpperCase()===activeSite;};
  // National total = CF + MG + VT + RP + Mash(Argao only)
  // Confirmed: 3580.83 + 41.75 + 0 + 16.5 + 48.25 = 3687.33
  // Per site = AM column only (CCPC uses CF+VT since AM=0)
  var totOut=(function(){
    if(activeSite==='NATIONAL'){
      var natR=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()==='NATIONAL';});
      var cf=natR.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt');},0);
      var mg=natR.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
      var vt=natR.reduce(function(a,r){return a+gf(r,'Vietop');},0);
      var rp=natR.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
      var argaoRows=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()==='ARGAO';});
      var ms=argaoRows.reduce(function(a,r){return a+gf(r,'Mash,mt');},0);
      return cf+mg+vt+rp+ms;
    } else {
      // Per site: use AM column. CCPC AM=0 so fall back to CF+VT+RP
      var am=kpiRows.reduce(function(a,r){
        var v=gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt','Total Plant Output, mt');
        if(v>0) return a+v;
        return a+gf(r,'COMPLETE FEEDS, mt')+gf(r,'Mixgrain')+gf(r,'Vietop')+gf(r,'Total Repack (MG+CF), mt');
      },0);
      return am;
    }
  })();
  var totCF=kpiRows.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt');},0);
  var totMG=kpiRows.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
  var totVT=kpiRows.reduce(function(a,r){return a+gf(r,'Vietop');},0);
  var totRP=kpiRows.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
  var totMash=activeSite==='ARGAO'?kpiRows.reduce(function(a,r){return a+gf(r,'Mash,mt');},0):0;
  var totUDT=kpiRows.reduce(function(a,r){return a+gf(r,'Unscheduled Down Time, hr');},0);
  var totSDT=kpiRows.reduce(function(a,r){return a+gf(r,'Scheduled Down Time, hr');},0);
  var cuRaw=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'Capacity Utilization Rate,%');},0)/kpiRows.length:0;
  var totCU=cuRaw*100;
  var oeeRaw=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'OEE');},0)/kpiRows.length:0;
  var avgOEE=oeeRaw*100;
  var totPDR=kpiRows.reduce(function(a,r){return a+gf(r,'Plant Daily Pelleting Rate,ton/day');},0);
  var totPlan=kpiRows.reduce(function(a,r){return a+gf(r,'Planned, mt','Total Plant Input, mt');},0);
  var pC=totCU>=80?'var(--green-b)':totCU>=60?'var(--amber)':'var(--red)';
  var oC=avgOEE>=85?'var(--green-b)':avgOEE>=70?'var(--amber)':'var(--red)';
  var udtC=totUDT>20?'var(--red)':totUDT>10?'var(--amber)':'var(--text)';
  var scorecard='';
  if(activeSite==='NATIONAL'){
    scorecard='<div class="sec"><div class="sec-hdr"><div class="sec-title">National Scorecard — Week '+activeWeek+'</div><div class="sec-line"></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">'
      +PROD_SITES.map(function(s){
        var sr=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===s;});
        var out=sr.reduce(function(a,r){
          var am=gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt','Total Plant Output, mt');
          if(am>0) return a+am;
          // AM=0: use component sum (CCPC tolling, SOUTH field name mismatch)
          return a+gf(r,'COMPLETE FEEDS, mt')+gf(r,'Mixgrain')+gf(r,'Vietop')+gf(r,'Total Repack (MG+CF), mt');
        },0);
        var cf=sr.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt');},0);
        var mg=sr.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
        var vt=sr.reduce(function(a,r){return a+gf(r,'Vietop');},0);
        var rp=sr.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
        var mash=s==='ARGAO'?sr.reduce(function(a,r){return a+gf(r,'Mash,mt');},0):0;
        var cuR=sr.length?sr.reduce(function(a,r){return a+gf(r,'Capacity Utilization Rate,%');},0)/sr.length:0;
        var cu=cuR*100;
        var oeeR=sr.length?sr.reduce(function(a,r){return a+gf(r,'OEE');},0)/sr.length:0;
        var oee=oeeR*100;
        var udt=sr.reduce(function(a,r){return a+gf(r,'Unscheduled Down Time, hr');},0);
        var cuC=cu>=80?'var(--green)':cu>=60?'var(--amber)':'var(--red)';
        var oeeC=oee>=85?'var(--green-b)':oee>=70?'var(--amber)':'var(--red)';
        var udtC2=udt>20?'var(--red)':udt>10?'var(--amber)':'var(--text3)';
        var cfD=cf>0?cf:(out-mg-vt-rp-mash);
        return '<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid '+cuC+';border-radius:var(--rl);padding:10px 8px;text-align:center">'
          +'<div style="margin-bottom:5px">'+dot(s)+'<span style="font-size:10px;font-weight:700;color:var(--text)">'+s+'</span></div>'
          +'<div style="border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px">'
          +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Output mt</div>'
          +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:var(--text);line-height:1">'+(out>0?out.toFixed(1):'—')+'</div>'
          +'<div style="display:flex;justify-content:center;gap:3px;margin-top:4px;flex-wrap:wrap">'
          +(cfD>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+cfD.toFixed(1)+'</span>':'')
          +(mg>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+mg.toFixed(1)+'</span>':'')
          +(vt>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+vt.toFixed(1)+'</span>':'')
          +(rp>0?'<span style="font-size:8px;background:rgba(255,166,87,0.15);color:#ffa657;padding:1px 5px;border-radius:3px">RP '+rp.toFixed(1)+'</span>':'')
          +(mash>0?'<span style="font-size:8px;background:rgba(210,153,34,0.15);color:#d29922;padding:1px 5px;border-radius:3px">MS '+mash.toFixed(1)+'</span>':'')
          +'</div></div>'
          +'<div style="display:flex;flex-direction:column;gap:5px">'
          +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">Cap Util</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+cuC+'">'+(cu>0?cu.toFixed(1)+'%':'—')+'</span></div>'
          +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">OEE</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+oeeC+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</span></div>'
          +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">UDT</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+udtC2+'">'+(udt>0?udt.toFixed(2)+'h':'—')+'</span></div>'
          +'</div></div>';
      }).join('')+'</div></div>';
  }
  ct.innerHTML = scorecard
  +'<div class="sec"><div class="sec-hdr"><div class="sec-title">'+SL[activeSite]+' · Week '+activeWeek+'</div><div class="sec-line"></div></div>'
  +'<div class="g5">'
  +'<div class="kc" style="--kc-color:var(--blue)"><div class="kc-lbl">Output</div>'
  +'<div class="kc-val" style="color:var(--blue)">'+(totOut>0?totOut.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)"> mt</span></div>'
  +'<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">'
  +(totCF>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+totCF.toFixed(1)+'</span>':'')
  +(totMG>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+totMG.toFixed(1)+'</span>':'')
  +(totVT>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+totVT.toFixed(1)+'</span>':'')
  +(totRP>0?'<span style="font-size:8px;background:rgba(255,166,87,0.15);color:#ffa657;padding:1px 5px;border-radius:3px">RP '+totRP.toFixed(1)+'</span>':'')
  +(totMash>0?'<span style="font-size:8px;background:rgba(210,153,34,0.15);color:#d29922;padding:1px 5px;border-radius:3px">MS '+totMash.toFixed(1)+'</span>':'')
  +'</div></div>'
  +'<div class="kc" style="--kc-color:'+pC+'"><div class="kc-lbl">Capacity Utilization</div>'
  +'<div class="kc-val" style="color:'+pC+'">'+(totCU>0?totCU.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)">%</span></div>'
  +'<div class="kc-sub">vs Demo Capacity</div>'
  +'<span class="bdg '+(totCU>=80?'g':totCU>=60?'a':'r')+'">'+(totCU>=80?'On Track':totCU>=60?'Moderate':'Low')+'</span></div>'
  +'<div class="kc" style="--kc-color:'+(totUDT>20?'var(--red)':totUDT>10?'var(--amber)':'var(--border2)')+'"><div class="kc-lbl">Downtime</div>'
  +'<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:4px">'
  +'<div><div style="font-size:9px;color:var(--red);font-weight:600">UDT</div>'
  +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:'+udtC+'">'+(totUDT>0?totUDT.toFixed(2):'—')+'<span style="font-size:11px;color:var(--text2)"> hr</span></div></div>'
  +'<div style="width:1px;height:32px;background:var(--border)"></div>'
  +'<div><div style="font-size:9px;color:var(--text3);font-weight:600">SDT</div>'
  +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:var(--text2)">'+(totSDT>0?totSDT.toFixed(2):'—')+'<span style="font-size:11px;color:var(--text3)"> hr</span></div></div>'
  +'</div><span class="bdg '+(totUDT>20?'r':totUDT>10?'a':'g')+'">'+(totUDT>20?'High UDT':totUDT>10?'Moderate':'Low DT')+'</span></div>'
  +'<div class="kc" style="--kc-color:'+oC+'"><div class="kc-lbl">OEE</div>'
  +'<div class="kc-val" style="color:'+oC+'">'+(avgOEE>0?avgOEE.toFixed(1):'N/A')+'<span style="font-size:12px;color:var(--text2)">'+(avgOEE>0?'%':'')+'</span></div>'
  +'<span class="bdg '+(avgOEE>=85?'g':avgOEE>=70?'a':avgOEE>0?'r':'b')+'">'+(avgOEE>=85?'World Class':avgOEE>=70?'Acceptable':avgOEE>0?'Needs Attn':'N/A')+'</span></div>'
  +'<div class="kc" style="--kc-color:var(--teal)"><div class="kc-lbl">Plant Daily Rate</div>'
  +'<div class="kc-val" style="font-size:22px;color:var(--teal)">'+(totPDR>0?totPDR.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> t/day</span></div></div>'
  +'</div></div>'
  +(function(){
    var kwh=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'kWh/ton');},0)/kpiRows.length:0;
    var fuel=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'Li/ton');},0)/kpiRows.length:0;
    var coal=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'kg/ton');},0)/kpiRows.length:0;
    var rmv=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'RM Variance, %');},0)/kpiRows.length:0;
    var rmvws=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'RM Variance (w/o used sacks), %');},0)/kpiRows.length:0;
    return '<div class="g5" style="margin-top:8px">'
    +'<div class="kc" style="--kc-color:var(--purple)"><div class="kc-lbl">Power</div>'
    +'<div class="kc-val" style="font-size:22px;color:var(--purple)">'+(kwh>0?kwh.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> kWh/t</span></div>'
    +'<div class="kc-sub">Electricity per ton</div>'
    +'<span class="bdg '+(kwh>35?'r':kwh>31.5?'a':'g')+'">'+(kwh>35?'Over limit':kwh>31.5?'Near limit':kwh>0?'Within limit':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:var(--amber)"><div class="kc-lbl">Fuel</div>'
    +'<div class="kc-val" style="font-size:22px;color:var(--amber)">'+(fuel>0?fuel.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> L/t</span></div>'
    +'<div class="kc-sub">Diesel per ton</div>'
    +'<span class="bdg '+(fuel>3.5?'r':fuel>3.15?'a':'g')+'">'+(fuel>3.5?'Over limit':fuel>3.15?'Near limit':fuel>0?'Within limit':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:var(--text3)"><div class="kc-lbl">Coal</div>'
    +'<div class="kc-val" style="font-size:22px">'+(coal>0?coal.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)">'+(coal>0?' kg/t':'')+'</span></div>'
    +'<div class="kc-sub">Coal per ton</div></div>'
    +'<div class="kc" style="--kc-color:'+(rmv*100<0?'var(--red)':'var(--green)')+'"><div class="kc-lbl">RM Variance</div>'
    +'<div class="kc-val" style="font-size:20px;color:'+(rmv*100<0?'var(--red)':'var(--green-b)')+'">'+(rmv!==0?(rmv*100>=0?'+':'')+(rmv*100).toFixed(3)+'%':'—')+'</div>'
    +'<span class="bdg '+(rmv*100<0?'r':'g')+'">'+(rmv*100<0?'Under':'Over')+'</span></div>'
    +'<div class="kc" style="--kc-color:'+(rmvws*100<0?'var(--red)':'var(--green)')+'"><div class="kc-lbl">RM Var w/o Sacks</div>'
    +'<div class="kc-val" style="font-size:20px;color:'+(rmvws*100<0?'var(--red)':'var(--green-b)')+'">'+(rmvws!==0?(rmvws*100>=0?'+':'')+(rmvws*100).toFixed(3)+'%':'—')+'</div></div>'
    +'</div>';
  })()
  // Rejection Rate scorecard — 3-up (Total Remill / Outright / Other)
  +(function(){
    var rejRate=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'Rejection Rate, %');},0)/kpiRows.length:0;
    var rejQty=kpiRows.reduce(function(a,r){return a+gf(r,'Total Remill Reject, mt');},0);
    var outRate=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'Outright Reject Rate, %');},0)/kpiRows.length:0;
    var outQty=kpiRows.reduce(function(a,r){return a+gf(r,'Outright Reject, mt');},0);
    var othRate=kpiRows.length?kpiRows.reduce(function(a,r){return a+gf(r,'Other Reject Rate, %');},0)/kpiRows.length:0;
    var othQty=kpiRows.reduce(function(a,r){return a+gf(r,'Other Reject, mt');},0);
    function pct(p){ return p>1 ? p : p*100; }
    function seg(label,rate,qty,color){
      return '<div style="flex:1;text-align:center;padding:0 8px">'
        +'<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">'+label+'</div>'
        +'<div style="font-family:Barlow Condensed,sans-serif;font-size:24px;font-weight:700;color:'+color+';line-height:1">'+pct(rate).toFixed(2)+'%</div>'
        +'<div style="font-size:10px;color:var(--text2);margin-top:3px;font-family:DM Mono,monospace">'+qty.toFixed(2)+' mt</div>'
        +'</div>';
    }
    return '<div class="sec">'
    +'<div class="cc" style="display:flex;align-items:stretch">'
    +seg('Rejection Rate', rejRate, rejQty, 'var(--red)')
    +'<div style="width:1px;background:var(--border);margin:0 2px"></div>'
    +seg('Outright Reject', outRate, outQty, 'var(--amber)')
    +'<div style="width:1px;background:var(--border);margin:0 2px"></div>'
    +seg('Other Reject', othRate, othQty, 'var(--purple)')
    +'</div></div>';
  })()
  // Operational KPI Trends section with all 6 charts
  +'<div class="sec"><div class="sec-hdr"><div class="sec-title">Operational KPI Trends — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+'</div><div class="sec-line"></div></div>'
  +'<div class="g2" style="margin-bottom:8px">'
  +'<div class="cc"><div class="cc-title">Weekly Output — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' (mt)</div><div style="position:relative;height:160px"><canvas id="c-out"></canvas></div></div>'
  +'<div class="cc"><div class="cc-title">Daily Output — Week '+activeWeek+' (mt)</div><div style="position:relative;height:160px"><canvas id="c-daily-out"></canvas></div></div>'
  +'</div>'
  +'<div class="g2" style="margin-bottom:8px">'
  +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Unscheduled Downtime — hrs &amp; % (Limit: 5%)</div><div id="udt-status"></div></div><div style="position:relative;height:160px"><canvas id="c-udt-combo"></canvas></div></div>'
  +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Power kWh/ton (Limit: 35)</div><div id="kwh-status"></div></div><div style="position:relative;height:160px"><canvas id="c-kwh-trend"></canvas></div></div>'
  +'</div>'
  +'<div class="g2">'
  +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Fuel L/ton (Limit: 3.5)</div><div id="fuel-status"></div></div><div style="position:relative;height:160px"><canvas id="c-fuel-trend"></canvas></div></div>'
  +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Coal kg/ton (Limit: 12)</div><div id="coal-status"></div></div><div style="position:relative;height:160px"><canvas id="c-coal-trend"></canvas></div></div>'
  +'</div>'
  +'<div class="g2">'
  +'<div class="cc"><div class="cc-title">Rejection Rate — % &amp; Qty (mt)</div><div style="position:relative;height:160px"><canvas id="c-reject-combo"></canvas></div></div>'
  +'<div class="cc"><div class="cc-title">Outright vs Other Reject — % Trend</div><div style="position:relative;height:160px"><canvas id="c-reject-pct"></canvas></div></div>'
  +'</div></div>'
  +'<div class="sec"><div class="sec-hdr"><div class="sec-title">'+(activeSite==='NATIONAL'?'Site Summary — Week '+activeWeek:SL[activeSite]+' · Daily Detail — Week '+activeWeek)+'</div><div class="sec-line"></div></div>'
  +'<div class="cc" id="detail-table-wrap">'
  +(activeSite==='NATIONAL'?buildNatTable(wkRows):'<div class="no-data" style="padding:20px">⟳ Loading daily data...</div>')
  +'</div></div>';
  ct.className='content fade';
  if(activeSite!=='NATIONAL'){
    var wrap=document.getElementById('detail-table-wrap');
    (function(){
    var _site=activeSite, _week=activeWeek;
    gasGet('daily_detail',{site:_site,week:_week}).then(function(d){
      var wrap=document.getElementById('detail-table-wrap');
      if(!wrap)return;
      var drows=(d.rows||[]);
      if(!drows.length){wrap.innerHTML='<div class="no-data">No daily data for Week '+activeWeek+'</div>';return;}
      var fmtD=function(r){return r._dateFormatted||String(r.Date||r.date||'—').split('T')[0];};
      var dateCols=drows.map(fmtD);
      var metrics=[
        {label:'Output mt',fn:function(r){return gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt');},lim:0,cls:function(v,l){return '';}},
        {label:'SDT Hr',fn:function(r){return gf(r,'Scheduled Down Time, hr');},lim:0,cls:function(v,l){return '';}},
        {label:'UDT Hr',fn:function(r){return gf(r,'Unscheduled Down Time, hr');},lim:8,cls:function(v,l){return v>l?'tr':v>l*0.8?'ta':'tg';}},
        {label:'kWh/ton',fn:function(r){return gf(r,'kWh/ton');},lim:35,cls:function(v,l){return v>l?'tr':v>l*0.9?'ta':'tg';}},
        {label:'Fuel L/ton',fn:function(r){return gf(r,'Li/ton');},lim:3.5,cls:function(v,l){return v>l?'tr':v>l*0.9?'ta':'tg';}},
        {label:'Coal kg/ton',fn:function(r){return gf(r,'kg/ton');},lim:12,cls:function(v,l){return v>l?'tr':v>l*0.9?'ta':'tg';}}
      ];
      wrap.innerHTML='<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">'
        +'<thead><tr><th style="text-align:left;min-width:110px;background:var(--bg3);padding:8px 12px;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border)">Metric</th>'
        +dateCols.map(function(d){return '<th style="white-space:nowrap;background:var(--bg3);padding:8px 12px;font-size:9px;font-weight:600;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border);text-align:center">'+d+'</th>';}).join('')
        +'</tr></thead><tbody>'
        +metrics.map(function(m){
          return '<tr style="border-bottom:1px solid var(--border)">'
            +'<td style="text-align:left;font-family:Barlow,sans-serif;font-size:12px;font-weight:600;color:var(--text);padding:10px 12px;background:var(--bg3);border-right:1px solid var(--border2);white-space:nowrap">'+m.label+'</td>'
            +drows.map(function(r){
              var v=m.fn(r);
              var cls=v>0?m.cls(v,m.lim):'';
              var bg=cls==='tr'?'rgba(248,81,73,0.12)':cls==='ta'?'rgba(210,153,34,0.12)':cls==='tg'&&m.lim>0?'rgba(46,160,67,0.08)':'';
              return '<td class="'+cls+'" style="text-align:center;font-family:DM Mono,monospace;font-size:13px;font-weight:600;padding:10px 12px;letter-spacing:.5px;background:'+bg+'">'+(v>0?'<span style="font-size:14px">'+v.toFixed(2)+'</span>':'<span style="color:var(--text3);font-size:11px">—</span>')+'</td>';
            }).join('')+'</tr>';
        }).join('')+'</tbody></table></div>';
    }).catch(function(e){
      var wrap=document.getElementById('detail-table-wrap');
      if(wrap)wrap.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';
    });
  })();
  }
  var ptC=function(v,lim){if(!v)return 'rgba(139,148,158,0.4)';return v>lim?'#f85149':v>lim*0.9?'#d29922':'#3fb950';};
  var setBadge=function(id,val,lim,unit){
    var el=document.getElementById(id);if(!el)return;
    var over=val>lim,near=val>lim*0.9;
    el.textContent=(over?'▲ ':near?'◉ ':'▼ ')+val.toFixed(2)+unit+(over?' over':near?' near':' ok');
    el.style.cssText='font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px;background:'+(over?'rgba(248,81,73,0.15)':near?'rgba(210,153,34,0.15)':'rgba(46,160,67,0.15)')+';color:'+(over?'#f85149':near?'#d29922':'#3fb950')+';border:1px solid '+(over?'rgba(248,81,73,0.3)':near?'rgba(210,153,34,0.3)':'rgba(46,160,67,0.3)')+';';
  };
  var wkOutData=allWeeks.map(function(w){
    var wr=rows.filter(function(r){return +(r.Week||r.week||0)===+w&&sf(r);});
    return +wr.reduce(function(a,r){return a+gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt');},0).toFixed(1);
  });
  var wkTgt=WEEKLY_TARGET[activeSite]||WEEKLY_TARGET.NATIONAL;
  var wkPtColors=wkOutData.map(function(v,i){return +allWeeks[i]===+activeWeek?'#ffffff':v>0&&v<wkTgt?'#f85149':'#3fb950';});
  mkChart('c-out','line',lbl,[
    {label:'Output mt',data:wkOutData,borderColor:'#388bfd',backgroundColor:'rgba(56,139,253,0.08)',fill:true,tension:.3,pointRadius:wkOutData.map(function(_,i){return +allWeeks[i]===+activeWeek?7:4;}),pointBackgroundColor:wkPtColors,pointBorderColor:wkPtColors,spanGaps:true},
    {label:'Target '+wkTgt,data:allWeeks.map(function(){return wkTgt;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});
  buildDailyChart();
  var kpiWkRows=activeSite==='NATIONAL'?rows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()==='NATIONAL';}):rows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===activeSite;});
  var perWk=function(field){return allWeeks.map(function(w){var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});return r?+gf(r,field).toFixed(2):null;});};
  var udtHrs=perWk('Unscheduled Down Time, hr');
  var udtPct=allWeeks.map(function(w){var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});if(!r)return null;var p=gf(r,'Unscheduled Down Time, %','Total Downtime Rate, %');return p>1?+p.toFixed(2):+(p*100).toFixed(2);});
  setBadge('udt-status',udtPct.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.UDT_PCT,'%');
  var udtCanvas=document.getElementById('c-udt-combo');
  if(udtCanvas){charts['c-udt-combo']=new Chart(udtCanvas.getContext('2d'),{data:{labels:lbl,datasets:[
    {type:'bar',label:'UDT Hours',data:udtHrs,backgroundColor:udtHrs.map(function(v){return v>0?'rgba(248,81,73,0.6)':'rgba(56,139,253,0.3)';}),borderRadius:3,yAxisID:'y'},
    {type:'line',label:'UDT %',data:udtPct,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:udtPct.map(function(v){return ptC(v,LIMITS.UDT_PCT);}),spanGaps:true,yAxisID:'y1'},
    {type:'line',label:'5% Limit',data:allWeeks.map(function(){return LIMITS.UDT_PCT;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y1'}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}}}}}}); }
  var kwhData=perWk('kWh/ton');
  setBadge('kwh-status',kwhData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.KWH_TON,' kWh/t');
  mkChart('c-kwh-trend','line',lbl,[
    {label:'kWh/ton',data:kwhData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:kwhData.map(function(v){return ptC(v,LIMITS.KWH_TON);})},
    {label:'Limit 35',data:allWeeks.map(function(){return LIMITS.KWH_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});
  var fuelData=perWk('Li/ton');
  setBadge('fuel-status',fuelData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.FUEL_TON,' L/t');
  mkChart('c-fuel-trend','line',lbl,[
    {label:'L/ton',data:fuelData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:fuelData.map(function(v){return ptC(v,LIMITS.FUEL_TON);})},
    {label:'Limit 3.5',data:allWeeks.map(function(){return LIMITS.FUEL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});
  var coalData=perWk('kg/ton');
  setBadge('coal-status',coalData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.COAL_TON,' kg/t');
  mkChart('c-coal-trend','line',lbl,[
    {label:'kg/ton',data:coalData,borderColor:'#8b949e',backgroundColor:'rgba(139,148,158,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:coalData.map(function(v){return ptC(v,LIMITS.COAL_TON);})},
    {label:'Limit 12',data:allWeeks.map(function(){return LIMITS.COAL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});

  // ── Rejection Rate combo chart (qty bars + rate % line) ──
  var rejQtyData=allWeeks.map(function(w){
    var wr=rows.filter(function(r){return +(r.Week||r.week||0)===+w&&sf(r);});
    return +wr.reduce(function(a,r){return a+gf(r,'Total Remill Reject, mt');},0).toFixed(2);
  });
  var rejRateData=allWeeks.map(function(w){
    var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});
    if(!r) return null;
    var p=gf(r,'Rejection Rate, %');
    return +(p>1?p:p*100).toFixed(2);
  });
  var rejCanvas=document.getElementById('c-reject-combo');
  if(rejCanvas){charts['c-reject-combo']=new Chart(rejCanvas.getContext('2d'),{data:{labels:lbl,datasets:[
    {type:'bar',label:'Reject Qty (mt)',data:rejQtyData,backgroundColor:'rgba(56,139,253,0.45)',borderRadius:3,yAxisID:'y'},
    {type:'line',label:'Rejection Rate %',data:rejRateData,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:'#f85149',spanGaps:true,yAxisID:'y1'}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'mt',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},title:{display:true,text:'Rate %',color:'#484f58',font:{size:9}}}}}});}

  // ── Outright vs Other Reject % trend (line only) ──
  var outrightPctData=allWeeks.map(function(w){
    var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});
    if(!r) return null;
    var p=gf(r,'Outright Reject Rate, %');
    return +(p>1?p:p*100).toFixed(2);
  });
  var otherPctData=allWeeks.map(function(w){
    var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});
    if(!r) return null;
    var p=gf(r,'Other Reject Rate, %');
    return +(p>1?p:p*100).toFixed(2);
  });
  mkChart('c-reject-pct','line',lbl,[
    {label:'Outright Reject %',data:outrightPctData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:false,tension:.3,pointRadius:4,spanGaps:true},
    {label:'Other Reject %',data:otherPctData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:false,tension:.3,pointRadius:4,spanGaps:true}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{y:{ticks:{callback:function(v){return v+'%';}}}}});
}
function buildDailyChart(){
  var dRows=(DATA.daily_detail&&DATA.daily_detail.rows||[]).filter(function(r){
    var rSite=(r.Plant||r.plant||'').toUpperCase();
    var rWeek=String(r['Week Num']||r['Week']||r['week']||'').trim();
    var siteMatch=activeSite==='NATIONAL'?true:rSite===activeSite;
    return siteMatch&&rWeek===String(activeWeek);
  }).sort(function(a,b){return new Date(a.Date||a.date||0)-new Date(b.Date||b.date||0);});
  var byDate={};
  dRows.forEach(function(r){var raw=String(r.Date||r.date||'').split('T')[0];if(!raw||raw==='undefined')return;byDate[raw]=(byDate[raw]||0)+gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt');});
  var dates=Object.keys(byDate).sort();
  var vals=dates.map(function(d){return +byDate[d].toFixed(2);});
  var lbls=dates.map(function(d){try{var dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-PH',{month:'short',day:'numeric',weekday:'short'});}catch(e){return d;}});
  if(charts['c-daily-out']){try{charts['c-daily-out'].destroy();}catch(e){}}
  if(!dates.length){
    if(!buildDailyChart._retries) buildDailyChart._retries=0;
    if(buildDailyChart._retries<5){
      buildDailyChart._retries++;
      setTimeout(buildDailyChart,2000);
    } else {
      buildDailyChart._retries=0;
      var cv2=document.getElementById('c-daily-out');
      if(cv2){var ctx2=cv2.getContext('2d');ctx2.fillStyle='#484f58';ctx2.font='11px DM Mono,monospace';ctx2.textAlign='center';ctx2.fillText('No daily data for Week '+activeWeek,cv2.width/2,cv2.height/2);}
    }
    return;
  }
  buildDailyChart._retries=0;
  var dayTgt=DAILY_TARGET[activeSite]||DAILY_TARGET.NATIONAL;
  var dayPtC=vals.map(function(v){return v>0&&v<dayTgt?'#f85149':'#3fb950';});
  var cv=document.getElementById('c-daily-out');
  if(cv) charts['c-daily-out']=new Chart(cv.getContext('2d'),{type:'line',data:{labels:lbls,datasets:[
    {label:'Output mt',data:vals,borderColor:'#3fb950',backgroundColor:'rgba(63,185,80,0.08)',fill:true,tension:.3,pointRadius:5,pointBackgroundColor:dayPtC,pointBorderColor:dayPtC,spanGaps:true},
    {label:'Target '+dayTgt,data:vals.map(function(){return dayTgt;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
}
function buildNatTable(wkRows){
  var siteRows=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()!=='NATIONAL';});
  if(!siteRows.length)return '<div class="no-data">No data</div>';
  return '<div class="tbl-wrap"><table><thead><tr><th>Site</th><th>Output mt</th><th>PDR t/day</th><th>Cap Util%</th><th>SDT Hr</th><th>UDT Hr</th><th>OEE%</th><th>kWh/ton</th><th>Fuel L/ton</th><th>Coal kg/ton</th><th>RM Var%</th><th>RM Var w/o Sacks%</th><th>Rejection Rate%</th></tr></thead><tbody>'
  +siteRows.map(function(r){
    var s=(r.Plant||r.plant||'').toString().toUpperCase();
    var out=gf(r,'Total Plant Output,mt w/o toll','Total Plant Output,mt');
    var udt=gf(r,'Unscheduled Down Time, hr');
    var sdt=gf(r,'Scheduled Down Time, hr');
    var oee=gf(r,'OEE')*100;
    var cu=gf(r,'Capacity Utilization Rate,%')*100;
    var pdr=gf(r,'Plant Daily Pelleting Rate,ton/day');
    var kwh=gf(r,'kWh/ton');var fuel=gf(r,'Li/ton');var coal=gf(r,'kg/ton');
    var rmvR=gf(r,'RM Variance, %');var rmv=rmvR*100;
    var rmvwR=gf(r,'RM Variance (w/o used sacks), %');var rmvw=rmvwR*100;
    var rejR=gf(r,'Rejection Rate, %');var rej=(rejR>1?rejR:rejR*100);
    return '<tr><td>'+dot(s)+(SL[s]||s)+'</td>'
      +'<td>'+(out>0?out.toFixed(1):'—')+'</td>'
      +'<td>'+(pdr>0?pdr.toFixed(2):'—')+'</td>'
      +'<td class="'+(cu>=80?'tg':cu>=60?'ta':'tr')+'">'+(cu>0?cu.toFixed(1)+'%':'—')+'</td>'
      +'<td>'+(sdt>0?sdt.toFixed(2):'—')+'</td>'
      +'<td class="'+(udt>20?'tr':udt>10?'ta':'')+'">'+(udt>0?udt.toFixed(2):'—')+'</td>'
      +'<td class="'+(oee>=85?'tg':oee>=70?'ta':oee>0?'tr':'')+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</td>'
      +'<td>'+(kwh>0?kwh.toFixed(2):'—')+'</td>'
      +'<td>'+(fuel>0?fuel.toFixed(2):'—')+'</td>'
      +'<td>'+(coal>0?coal.toFixed(2):'—')+'</td>'
      +'<td class="'+(rmv<0?'tr':rmv>0?'tg':'')+'">'+(rmvR!==0?rmv.toFixed(3)+'%':'—')+'</td>'
      +'<td class="'+(rmvw<0?'tr':rmvw>0?'tg':'')+'">'+(rmvwR!==0?rmvw.toFixed(3)+'%':'—')+'</td>'
      +'<td class="'+(rej>1?'tr':rej>0.3?'ta':'')+'">'+(rejR!==0?rej.toFixed(2)+'%':'—')+'</td>'
      +'</tr>';
  }).join('')+'</tbody></table></div>';
}
// ── OTHER TABS (stubs) ─────────────────────────────────────

// ── MONTHLY STATE ─────────────────────────────────────────
function setMonth(idx){
  if(_monthsList[idx]){activeMonth=_monthsList[idx];renderMonthly();}
}
function renderMonthly(){
  var ct=document.getElementById('content-monthly');
  if(!DATA.monthly){
    ct.innerHTML='<div class="no-data">⟳ Loading monthly data...</div>';
    gasGet('monthly').then(function(d){DATA.monthly=d;renderMonthly();}).catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';});
    return;
  }
  var rows=DATA.monthly.rows||[];
  var ALL_MONTH_NAMES=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var months=(DATA.monthly.months||[]).filter(function(m){return ALL_MONTH_NAMES.indexOf(String(m).trim().toUpperCase())>=0;});
  if(!activeMonth||months.indexOf(activeMonth)<0) activeMonth=months[months.length-1]||'';
  var mRows=rows.filter(function(r){return String(r.MONTH||r.Month||'').trim()===activeMonth;});
  var pills=document.getElementById('month-pills');
  if(pills){
    _monthsList=months;
    pills.innerHTML=months.map(function(m,i){
      return '<button class="wk-pill'+(m===activeMonth?' active':'')+'" onclick="setMonth('+i+')">'+m.slice(0,3)+'</button>';
    }).join('');
    setTimeout(function(){var a=pills.querySelector('.wk-pill.active');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},100);
  }
  // Helper: get output for a site row (same formula as weekly)
  function siteOut(sr,s){
    var am=sr.reduce(function(a,r){return a+gf(r,'Total Plant Output,mt','Total Plant Output,mt w/o toll');},0);
    if(am===0) am=sr.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt')+gf(r,'Mixgrain')+gf(r,'Vietop')+gf(r,'Total Repack (MG+CF), mt');},0);
    return am;
  }
  // National total = CF+MG+VT+RP from NATIONAL row + Argao Mash
  function natOut(){
    var natR=mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';});
    var cf=natR.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt');},0);
    var mg=natR.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
    var vt=natR.reduce(function(a,r){return a+gf(r,'Vietop');},0);
    var rp=natR.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
    var argaoR=mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='ARGAO';});
    var ms=argaoR.reduce(function(a,r){return a+gf(r,'Mash','Mash,mt');},0);
    return cf+mg+vt+rp+ms;
  }
  var scorecard='<div class="sec"><div class="sec-hdr"><div class="sec-title">National Scorecard — '+activeMonth+'</div><div class="sec-line"></div></div>'
    +'<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">'
    +PROD_SITES.map(function(s){
      var sr=mRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===s;});
      var out=siteOut(sr,s);
      var cf=sr.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt','COMPLETE FEEDS');},0);
      var mg=sr.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
      var vt=sr.reduce(function(a,r){return a+gf(r,'Vietop');},0);
      var rp=sr.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
      var mash=s==='ARGAO'?sr.reduce(function(a,r){return a+gf(r,'Mash','Mash,mt');},0):0;
      var cfD=cf>0?cf:out-mg-vt-rp-mash;
      var cuR=sr.length?sr.reduce(function(a,r){return a+gf(r,'Capacity Utilization Rate,%','Capacity Utilization,%');},0)/sr.length:0;
      var cu=cuR>1?cuR:cuR*100;
      var oeeR=sr.length?sr.reduce(function(a,r){return a+gf(r,'OEE');},0)/sr.length:0;
      var oee=oeeR>1?oeeR:oeeR*100;
      var udt=sr.reduce(function(a,r){return a+gf(r,'Unscheduled Down Time, hr','Unscheduled Downtime, hr');},0);
      var cuC=cu>=80?'var(--green)':cu>=60?'var(--amber)':'var(--red)';
      var oeeC=oee>=85?'var(--green-b)':oee>=70?'var(--amber)':'var(--red)';
      var udtC=udt>80?'var(--red)':udt>40?'var(--amber)':'var(--text3)';
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid '+cuC+';border-radius:var(--rl);padding:10px 8px;text-align:center">'
        +'<div style="margin-bottom:5px">'+dot(s)+'<span style="font-size:10px;font-weight:700;color:var(--text)">'+s+'</span></div>'
        +'<div style="border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px">'
        +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Output mt</div>'
        +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:var(--text);line-height:1">'+(out>0?out.toFixed(1):'—')+'</div>'
        +'<div style="display:flex;justify-content:center;gap:3px;margin-top:4px;flex-wrap:wrap">'
        +(cfD>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+cfD.toFixed(1)+'</span>':'')
        +(mg>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+mg.toFixed(1)+'</span>':'')
        +(vt>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+vt.toFixed(1)+'</span>':'')
        +(rp>0?'<span style="font-size:8px;background:rgba(255,166,87,0.15);color:#ffa657;padding:1px 5px;border-radius:3px">RP '+rp.toFixed(1)+'</span>':'')
        +(mash>0?'<span style="font-size:8px;background:rgba(210,153,34,0.15);color:#d29922;padding:1px 5px;border-radius:3px">MS '+mash.toFixed(1)+'</span>':'')
        +'</div></div>'
        +'<div style="display:flex;flex-direction:column;gap:5px">'
        +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">Cap Util</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+cuC+'">'+(cu>0?cu.toFixed(1)+'%':'—')+'</span></div>'
        +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">OEE</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+oeeC+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</span></div>'
        +'<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">UDT</span><span style="font-family:DM Mono,monospace;font-size:10px;font-weight:600;color:'+udtC+'">'+(udt>0?udt.toFixed(2)+'h':'—')+'</span></div>'
        +'</div></div>';
    }).join('')+'</div></div>';
  var kpiR2=activeSite==='NATIONAL'
    ? mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})
    : mRows.filter(function(r){return (r.Plant||'').toUpperCase()===activeSite;});
  var natR2=kpiR2;
  var mOut=(function(){
    if(activeSite==='NATIONAL') return kpiR2.reduce(function(a,r){return a+gf(r,'Total Plant Output,mt');},0);
    var am=kpiR2.reduce(function(a,r){return a+gf(r,'Total Plant Output,mt','Total Plant Output,mt w/o toll');},0);
    if(am===0) am=kpiR2.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt')+gf(r,'Mixgrain')+gf(r,'Vietop')+gf(r,'Total Repack (MG+CF), mt');},0);
    return am;
  })();
  var mCF=kpiR2.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt','COMPLETE FEEDS');},0);
  var mMG=kpiR2.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
  var mVT=kpiR2.reduce(function(a,r){return a+gf(r,'Vietop');},0);
  var mRP=kpiR2.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
  var mMS=(activeSite==='ARGAO'||activeSite==='NATIONAL')
    ? mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='ARGAO';}).reduce(function(a,r){return a+gf(r,'Mash','Mash,mt');},0)
    : 0;
  var cuRN=kpiR2.length?kpiR2.reduce(function(a,r){return a+gf(r,'Capacity Utilization Rate,%','Capacity Utilization,%');},0)/kpiR2.length:0;
  var mCU=cuRN>1?cuRN:cuRN*100;
  var oeeRN=kpiR2.length?kpiR2.reduce(function(a,r){return a+gf(r,'OEE');},0)/kpiR2.length:0;
  var mOEE=oeeRN>1?oeeRN:oeeRN*100;
  var mUDT=kpiR2.reduce(function(a,r){return a+gf(r,'Unscheduled Down Time, hr','Unscheduled Downtime, hr','UDT, hr');},0);
  var mSDT=kpiR2.reduce(function(a,r){return a+gf(r,'Scheduled Down Time, hr','SDT, hr');},0);
  var mPDR=kpiR2.reduce(function(a,r){return a+gf(r,'Plant Daily Pelleting Rate,ton/day','Plant Daily Rate, ton/day');},0);
  var cuC2=mCU>=80?'var(--green-b)':mCU>=60?'var(--amber)':'var(--red)';
  var oeeC2=mOEE>=85?'var(--green-b)':mOEE>=70?'var(--amber)':'var(--red)';
  var udtC2=mUDT>80?'var(--red)':mUDT>40?'var(--amber)':'var(--text)';
  var kpiCards='<div class="sec"><div class="sec-hdr"><div class="sec-title">'+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · '+activeMonth+'</div><div class="sec-line"></div></div>'
    +'<div class="g5">'
    +'<div class="kc" style="--kc-color:var(--blue)"><div class="kc-lbl">Output</div>'
    +'<div class="kc-val" style="color:var(--blue)">'+(mOut>0?mOut.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)"> mt</span></div>'
    +'<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">'
    +(mCF>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+mCF.toFixed(1)+'</span>':'')
    +(mMG>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+mMG.toFixed(1)+'</span>':'')
    +(mVT>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+mVT.toFixed(1)+'</span>':'')
    +(mRP>0?'<span style="font-size:8px;background:rgba(255,166,87,0.15);color:#ffa657;padding:1px 5px;border-radius:3px">RP '+mRP.toFixed(1)+'</span>':'')
    +(mMS>0?'<span style="font-size:8px;background:rgba(210,153,34,0.15);color:#d29922;padding:1px 5px;border-radius:3px">MS '+mMS.toFixed(1)+'</span>':'')
    +'</div></div>'
    +'<div class="kc" style="--kc-color:'+cuC2+'"><div class="kc-lbl">Capacity Utilization</div>'
    +'<div class="kc-val" style="color:'+cuC2+'">'+(mCU>0?mCU.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)">%</span></div>'
    +'<span class="bdg '+(mCU>=80?'g':mCU>=60?'a':'r')+'">'+(mCU>=80?'On Track':mCU>=60?'Moderate':'Low')+'</span></div>'
    +'<div class="kc" style="--kc-color:'+udtC2+'"><div class="kc-lbl">Downtime</div>'
    +'<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:4px">'
    +'<div><div style="font-size:9px;color:var(--red);font-weight:600">UDT</div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:'+udtC2+'">'+(mUDT>0?mUDT.toFixed(1):'—')+'<span style="font-size:11px;color:var(--text2)"> hr</span></div></div>'
    +'<div style="width:1px;height:32px;background:var(--border)"></div>'
    +'<div><div style="font-size:9px;color:var(--text3);font-weight:600">SDT</div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:var(--text2)">'+(mSDT>0?mSDT.toFixed(1):'—')+'<span style="font-size:11px;color:var(--text3)"> hr</span></div></div>'
    +'</div></div>'
    +'<div class="kc" style="--kc-color:'+oeeC2+'"><div class="kc-lbl">OEE</div>'
    +'<div class="kc-val" style="color:'+oeeC2+'">'+(mOEE>0?mOEE.toFixed(1):'N/A')+'<span style="font-size:12px;color:var(--text2)">'+(mOEE>0?'%':'')+'</span></div>'
    +'<span class="bdg '+(mOEE>=85?'g':mOEE>=70?'a':mOEE>0?'r':'b')+'">'+(mOEE>=85?'World Class':mOEE>=70?'Acceptable':mOEE>0?'Needs Attn':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:var(--teal)"><div class="kc-lbl">Plant Daily Rate</div>'
    +'<div class="kc-val" style="color:var(--teal)">'+(mPDR>0?mPDR.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> t/day</span></div></div>'
    +'</div></div>';
  // Row 2 KPI cards: Power, Fuel, Coal, RM Variance, RM Var w/o Sacks
  var mKwh=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'kWh/ton');},0)/natR2.length:0;
  var mFuel=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'Li/ton');},0)/natR2.length:0;
  var mCoal=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'kg/ton');},0)/natR2.length:0;
  var mRMV=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'RM Variance, %');},0)/natR2.length:0;
  var mRMVWS=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'RM Variance (w/o used sacks), %');},0)/natR2.length:0;
  var mRMVpct=Math.abs(mRMV)>1?mRMV:mRMV*100;
  var mRMVWSpct=Math.abs(mRMVWS)>1?mRMVWS:mRMVWS*100;
  var mRejRateRaw=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'Rejection Rate, %');},0)/natR2.length:0;
  var mRejRate=Math.abs(mRejRateRaw)>1?mRejRateRaw:mRejRateRaw*100;
  var mRejQty=natR2.reduce(function(a,r){return a+gf(r,'Total Remill Reject, mt');},0);
  var kpiCards2='<div class="g6" style="margin-top:8px">'
    +'<div class="kc" style="--kc-color:var(--purple)"><div class="kc-lbl">Power</div>'
    +'<div class="kc-val" style="font-size:22px;color:var(--purple)">'+(mKwh>0?mKwh.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> kWh/t</span></div>'
    +'<div class="kc-sub">Electricity per ton</div>'
    +'<span class="bdg '+(mKwh>35?'r':mKwh>31.5?'a':'g')+'">'+(mKwh>35?'Over limit':mKwh>31.5?'Near limit':mKwh>0?'Within limit':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:var(--amber)"><div class="kc-lbl">Fuel</div>'
    +'<div class="kc-val" style="font-size:22px;color:var(--amber)">'+(mFuel>0?mFuel.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)"> L/t</span></div>'
    +'<div class="kc-sub">Diesel per ton</div>'
    +'<span class="bdg '+(mFuel>3.5?'r':mFuel>3.15?'a':'g')+'">'+(mFuel>3.5?'Over limit':mFuel>3.15?'Near limit':mFuel>0?'Within limit':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:var(--text3)"><div class="kc-lbl">Coal</div>'
    +'<div class="kc-val" style="font-size:22px">'+(mCoal>0?mCoal.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2)">'+(mCoal>0?' kg/t':'')+'</span></div>'
    +'<div class="kc-sub">Coal per ton</div>'
    +'<span class="bdg '+(mCoal>12?'r':mCoal>10.8?'a':mCoal>0?'g':'b')+'">'+(mCoal>12?'Over limit':mCoal>10.8?'Near limit':mCoal>0?'Within limit':'N/A')+'</span></div>'
    +'<div class="kc" style="--kc-color:'+(mRMVpct<0?'var(--red)':'var(--green)')+'"><div class="kc-lbl">RM Variance</div>'
    +'<div class="kc-val" style="font-size:20px;color:'+(mRMVpct<0?'var(--red)':'var(--green-b)')+'">'+(mRMV!==0?(mRMVpct>=0?'+':'')+mRMVpct.toFixed(3)+'%':'—')+'</div>'
    +'<span class="bdg '+(mRMVpct<0?'r':'g')+'">'+(mRMVpct<0?'Under':'Over')+'</span></div>'
    +'<div class="kc" style="--kc-color:'+(mRMVWSpct<0?'var(--red)':'var(--green)')+'"><div class="kc-lbl">RM Var w/o Sacks</div>'
    +'<div class="kc-val" style="font-size:20px;color:'+(mRMVWSpct<0?'var(--red)':'var(--green-b)')+'">'+(mRMVWS!==0?(mRMVWSpct>=0?'+':'')+mRMVWSpct.toFixed(3)+'%':'—')+'</div></div>'
    +'<div class="kc" style="--kc-color:var(--red)"><div class="kc-lbl">Rejection Rate</div>'
    +'<div class="kc-val" style="font-size:20px;color:var(--red)">'+(mRejRateRaw!==0?mRejRate.toFixed(2)+'%':'—')+'</div>'
    +'<div class="kc-sub" style="font-size:9px;font-family:DM Mono,monospace">'+mRejQty.toFixed(2)+' mt</div></div>'
    +'</div></div>';
  // ── MONTHLY CHARTS ─────────────────────────────────────
  var chartSection='<div class="sec"><div class="sec-hdr"><div class="sec-title">Monthly Trends — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+'</div><div class="sec-line"></div></div>'
    +'<div class="g2" style="margin-bottom:8px">'
    +'<div class="cc"><div class="cc-title">Monthly Output vs Target (mt)</div><div style="position:relative;height:180px"><canvas id="cm-out"></canvas></div></div>'
    +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Unscheduled Downtime — hrs &amp; % (Limit: 5%)</div><div id="cm-udt-badge" style="font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px"></div></div><div style="position:relative;height:160px"><canvas id="cm-udt"></canvas></div></div>'
    +'</div>'
    +'<div class="g2" style="margin-bottom:8px">'
    +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Power kWh/ton (Limit: 35)</div><div id="cm-kwh-badge" style="font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px"></div></div><div style="position:relative;height:160px"><canvas id="cm-kwh"></canvas></div></div>'
    +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Fuel L/ton (Limit: 3.5)</div><div id="cm-fuel-badge" style="font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px"></div></div><div style="position:relative;height:160px"><canvas id="cm-fuel"></canvas></div></div>'
    +'</div>'
    +'<div class="g2">'
    +'<div class="cc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="cc-title" style="margin-bottom:0">Coal kg/ton (Limit: 12)</div><div id="cm-coal-badge" style="font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px"></div></div><div style="position:relative;height:160px"><canvas id="cm-coal"></canvas></div></div>'
    +'<div class="cc"><div class="cc-title">OEE % by Month</div><div style="position:relative;height:160px"><canvas id="cm-cu"></canvas></div></div>'
    +'</div>'
    +'<div class="g2" style="margin-top:8px">'
    +'<div class="cc"><div class="cc-title">Rejection Rate — Qty (mt) &amp; % by Month</div><div style="position:relative;height:160px"><canvas id="cm-reject"></canvas></div></div>'
    +'<div class="cc"><div class="cc-title">Cost — Total (₱) &amp; ₱/kg by Month</div><div style="position:relative;height:160px"><canvas id="cm-cost"></canvas></div></div>'
    +'</div></div>';
  // ── PROJECTED VOLUME TABLE ─────────────────────────────
  // Remaining days = calendar days in month - days elapsed
  // Use today's date to compute days remaining for current month
  var today=new Date();
  var todayMonth=today.toLocaleString('en-PH',{month:'long'}).toUpperCase();
  var isCurrentMonth=(activeMonth.toUpperCase()===todayMonth);
  var projRows=[];
  var sitesToShow=activeSite==='NATIONAL'?PROD_SITES:[activeSite];
  sitesToShow.forEach(function(s){
    var sr=mRows.filter(function(r){return (r.Plant||'').toUpperCase()===s;});
    if(!sr.length)return;
    // Use AM column (Total Plant Output,mt) - same as scorecard
    var mtdOut=sr.reduce(function(a,r){
      var am=gf(r,'Total Plant Output,mt','Total Plant Output,mt w/o toll');
      if(am===0) am=gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt')+gf(r,'Mixgrain')+gf(r,'Vietop')+gf(r,'Total Repack (MG+CF), mt');
      return a+am;
    },0);
    // ARGAO: add Mash only if AM doesn't already include it
    // Check: if AM > CF+MG+VT+RP, Mash is already included in AM
    if(s==='ARGAO'){
      var argaoCF=sr.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt');},0);
      var argaoMG=sr.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
      var argaoVT=sr.reduce(function(a,r){return a+gf(r,'Vietop');},0);
      var argaoRP=sr.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
      var argaoMash=sr.reduce(function(a,r){return a+gf(r,'Mash','Mash,mt');},0);
      var cfSum=argaoCF+argaoMG+argaoVT+argaoRP;
      // If AM already includes Mash (AM ≈ CF+MG+VT+RP+Mash), don't add again
      if(mtdOut < cfSum+argaoMash*0.5){
        mtdOut+=argaoMash;
      }
    }
    var pdr=sr.reduce(function(a,r){return a+gf(r,'Plant Daily Pelleting Rate,ton/day','Plant Daily Rate, ton/day');},0);
    var calDays=sr.reduce(function(a,r){return a+gf(r,'CALENDAR DA','CALENDAR DAYS','Calendar Days');},0);
    // Remaining days = calendar days in month - today's day number
    // e.g. May 28 with 31 calendar days = 31-28 = 3 remaining days
    var remaining=0;
    if(isCurrentMonth){
      var dayOfMonth=today.getDate();
      // Use calDays from sheet, or fallback to last day of month
      var totalDays=calDays>0?calDays:new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
      remaining=Math.max(0,totalDays-dayOfMonth);
    }
    var projected=pdr>0?(pdr*remaining)+mtdOut:mtdOut;
    var target=MONTHLY_TARGET[s]||0;
    var gap=target>0?projected-target:0;
    projRows.push({
      site:s,label:SL[s]||s,
      mtdOut:mtdOut,pdr:pdr,calDays:calDays,
      remaining:remaining,projected:projected,
      target:target,gap:gap
    });
  });
  if(activeSite==='NATIONAL'){
    var natProjTotal=projRows.reduce(function(a,r){return a+r.projected;},0);
    var natMTD=projRows.reduce(function(a,r){return a+r.mtdOut;},0);
    var natTarget=MONTHLY_TARGET.NATIONAL||0;
    projRows.push({
      site:'NATIONAL',label:'NATIONAL',isTotal:true,
      mtdOut:natMTD,pdr:0,remaining:0,
      projected:natProjTotal,target:natTarget,gap:natProjTotal-natTarget
    });
  }
  var projTable='<div class="sec"><div class="sec-hdr"><div class="sec-title">Projected Volume — '+activeMonth+(isCurrentMonth?' (Current Month)':' (Final)')+'</div><div class="sec-line"></div></div>'
    +'<div class="cc"><div class="tbl-wrap"><table>'
    +'<thead><tr>'
    +'<th style="text-align:left">Plant</th>'
    +'<th>MTD Output mt</th>'
    +'<th>PDR t/day</th>'
    +'<th>Remaining Days</th>'
    +'<th>Projected mt</th>'
    +'<th>Target mt</th>'
    +'<th>Gap mt</th>'
    +'</tr></thead><tbody>'
    +projRows.map(function(r){
      var projC=r.target>0?(r.projected>=r.target?'tg':'tr'):'';
      var gapC=r.gap>=0?'tg':'tr';
      return '<tr style="'+(r.isTotal?'font-weight:700;background:var(--bg3);border-top:2px solid var(--border)':'')+'">'
        +'<td style="text-align:left">'+dot(r.site)+(r.isTotal?'<strong>'+r.label+'</strong>':SL[r.site]||r.label)+'</td>'
        +'<td>'+(r.mtdOut>0?r.mtdOut.toFixed(1):'—')+'</td>'
        +'<td>'+(r.pdr>0?r.pdr.toFixed(2):'—')+'</td>'
        +'<td style="color:var(--text2)">'+(r.isTotal?'—':r.remaining+'d')+'</td>'
        +'<td class="'+projC+'" style="font-family:DM Mono,monospace;font-weight:600">'+(r.projected>0?r.projected.toFixed(1):'—')+'</td>'
        +'<td style="color:var(--text3)">'+(r.target>0?r.target.toFixed(0):'—')+'</td>'
        +'<td class="'+gapC+'" style="font-family:DM Mono,monospace">'+(r.target>0?(r.gap>=0?'+':'')+r.gap.toFixed(1):'—')+'</td>'
        +'</tr>';
    }).join('')
    +'</tbody></table></div></div></div>';
  ct.innerHTML=(activeSite==='NATIONAL'?scorecard:'')+kpiCards+kpiCards2+chartSection+projTable+'<div id="prodcost-section"><div class="no-data">⟳ Loading monthly production cost...</div></div>';
  // ── RENDER MONTHLY CHARTS ───────────────────────────────
  ['cm-out','cm-udt','cm-kwh','cm-fuel','cm-coal','cm-cu'].forEach(function(id){
    if(charts[id]){try{charts[id].destroy();}catch(e){}}
  });
  var mLabels=months;
  var gc='rgba(255,255,255,0.04)';
  var sc={grid:{color:gc},ticks:{color:'#484f58',font:{size:9}}};
  var mTip={backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}};
  function perMonth(field){
    return months.map(function(m){
      var mr=rows.filter(function(r){
        var p=(r.Plant||'').toUpperCase();
        var match=activeSite==='NATIONAL'?p==='NATIONAL':p===activeSite;
        return match&&String(r.MONTH||r.Month||'').trim()===m;
      });
      if(!mr.length) return null;
      var v=mr.reduce(function(a,r){return a+gf(r,field);},0);
      return v>0?+v.toFixed(2):null;
    });
  }
  function avgPerMonth(field){
    return months.map(function(m){
      var mr=rows.filter(function(r){
        var p=(r.Plant||'').toUpperCase();
        var match=activeSite==='NATIONAL'?p==='NATIONAL':p===activeSite;
        return match&&String(r.MONTH||r.Month||'').trim()===m;
      });
      if(!mr.length) return null;
      var v=mr.reduce(function(a,r){return a+gf(r,field);},0)/mr.length;
      return v>0?+v.toFixed(2):null;
    });
  }
  var mTgt=MONTHLY_TARGET[activeSite]||MONTHLY_TARGET.NATIONAL;
  var ptC=function(v,lim){if(!v)return 'rgba(139,148,158,0.4)';return v>lim?'#f85149':v>lim*0.9?'#d29922':'#3fb950';};
  var setBadge=function(id,val,lim,unit){
    var el=document.getElementById(id);if(!el)return;
    var over=val>lim,near=val>lim*0.9;
    el.textContent=(over?'▲ ':near?'◉ ':'▼ ')+val.toFixed(2)+unit+(over?' over':near?' near':' ok');
    el.style.cssText='font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px;background:'+(over?'rgba(248,81,73,0.15)':near?'rgba(210,153,34,0.15)':'rgba(46,160,67,0.15)')+';color:'+(over?'#f85149':near?'#d29922':'#3fb950')+';border:1px solid '+(over?'rgba(248,81,73,0.3)':near?'rgba(210,153,34,0.3)':'rgba(46,160,67,0.3)')+';';
  };
  var outData=perMonth('Total Plant Output,mt');
  var cuData=avgPerMonth('Capacity Utilization Rate,%').map(function(v){return v?+(v>1?v:v*100).toFixed(1):null;});
  var outC=document.getElementById('cm-out');
  if(outC) charts['cm-out']=new Chart(outC.getContext('2d'),{
    data:{labels:mLabels,datasets:[
      {type:'bar',label:'Output mt',data:outData,
       backgroundColor:outData.map(function(v){return v&&v>=mTgt?'rgba(63,185,80,0.5)':'rgba(248,81,73,0.4)';}),
       borderRadius:3,yAxisID:'y'},
      {type:'line',label:'Target '+mTgt+' mt',data:months.map(function(){return mTgt;}),
       borderColor:'rgba(248,81,73,0.6)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y'},
      {type:'line',label:'Cap Util %',data:cuData,
       borderColor:'#388bfd',backgroundColor:'transparent',tension:.3,pointRadius:4,
       pointBackgroundColor:cuData.map(function(v){return v>=80?'#3fb950':v>=60?'#d29922':'#f85149';}),
       spanGaps:true,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
      scales:{
        x:sc,
        y:{position:'left',grid:{color:gc},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'mt',color:'#484f58',font:{size:9}}},
        y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},min:0,max:100}
      }}
  });
  var udtHrs=perMonth('Unscheduled Down Time, hr');
  var udtPct=avgPerMonth('Unscheduled Down Time, %').map(function(v){return v?(v>1?+v.toFixed(2):+(v*100).toFixed(2)):null;});
  var latestUDT=udtPct.filter(function(v){return v!==null;}).slice(-1)[0]||0;
  setBadge('cm-udt-badge',latestUDT,LIMITS.UDT_PCT,'%');
  var udtC=document.getElementById('cm-udt');
  if(udtC) charts['cm-udt']=new Chart(udtC.getContext('2d'),{
    data:{labels:mLabels,datasets:[
      {type:'bar',label:'UDT Hours',data:udtHrs,backgroundColor:udtHrs.map(function(v){return v>0?'rgba(248,81,73,0.6)':'rgba(56,139,253,0.3)';}),borderRadius:3,yAxisID:'y'},
      {type:'line',label:'UDT %',data:udtPct,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:udtPct.map(function(v){return ptC(v,LIMITS.UDT_PCT);}),spanGaps:true,yAxisID:'y1'},
      {type:'line',label:'5% Limit',data:months.map(function(){return LIMITS.UDT_PCT;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
      scales:{x:sc,y:{position:'left',grid:{color:gc},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}}}}}
  });
  var kwhData=avgPerMonth('kWh/ton');
  setBadge('cm-kwh-badge',kwhData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.KWH_TON,' kWh/t');
  var kwhC=document.getElementById('cm-kwh');
  if(kwhC) charts['cm-kwh']=new Chart(kwhC.getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'kWh/ton',data:kwhData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:kwhData.map(function(v){return ptC(v,LIMITS.KWH_TON);})},
    {label:'Limit 35',data:months.map(function(){return LIMITS.KWH_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:mTip},scales:{x:sc,y:sc}}});
  var fuelData=avgPerMonth('Li/ton');
  setBadge('cm-fuel-badge',fuelData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.FUEL_TON,' L/t');
  var fuelC=document.getElementById('cm-fuel');
  if(fuelC) charts['cm-fuel']=new Chart(fuelC.getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'L/ton',data:fuelData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:fuelData.map(function(v){return ptC(v,LIMITS.FUEL_TON);})},
    {label:'Limit 3.5',data:months.map(function(){return LIMITS.FUEL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:mTip},scales:{x:sc,y:sc}}});
  var coalData=avgPerMonth('kg/ton');
  setBadge('cm-coal-badge',coalData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.COAL_TON,' kg/t');
  var coalC=document.getElementById('cm-coal');
  if(coalC) charts['cm-coal']=new Chart(coalC.getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'kg/ton',data:coalData,borderColor:'#8b949e',backgroundColor:'rgba(139,148,158,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:coalData.map(function(v){return ptC(v,LIMITS.COAL_TON);})},
    {label:'Limit 12',data:months.map(function(){return LIMITS.COAL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:mTip},scales:{x:sc,y:sc}}});
  var oeeMonthData=avgPerMonth('OEE').map(function(v){return v?(v>1?+v.toFixed(1):+(v*100).toFixed(1)):null;});
  var cuC2=document.getElementById('cm-cu');
  if(cuC2) charts['cm-cu']=new Chart(cuC2.getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'OEE %',data:oeeMonthData,borderColor:'#3fb950',backgroundColor:'rgba(63,185,80,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,
     pointBackgroundColor:oeeMonthData.map(function(v){return !v?'grey':v>=85?'#3fb950':v>=70?'#d29922':'#f85149';})},
    {label:'Target 85%',data:months.map(function(){return 85;}),borderColor:'rgba(63,185,80,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:mTip},scales:{x:sc,y:{grid:{color:gc},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},min:0,max:120}}}});

  // ── Rejection Rate combo chart (qty bars + rate % line) ──
  var rejQtyMonth=perMonth('Total Remill Reject, mt');
  var rejRateMonth=months.map(function(m){
    var mr=rows.filter(function(r){
      var p=(r.Plant||'').toUpperCase();
      var match=activeSite==='NATIONAL'?p==='NATIONAL':p===activeSite;
      return match&&String(r.MONTH||r.Month||'').trim()===m;
    });
    if(!mr.length) return null;
    var v=mr.reduce(function(a,r){return a+gf(r,'Rejection Rate, %');},0)/mr.length;
    if(v===0) return null;
    var pctVal=Math.abs(v)>1?v:v*100;
    return +pctVal.toFixed(3);
  });
  var rejC=document.getElementById('cm-reject');
  if(rejC){charts['cm-reject']=new Chart(rejC.getContext('2d'),{data:{labels:mLabels,datasets:[
    {type:'bar',label:'Reject Qty (mt)',data:rejQtyMonth,backgroundColor:'rgba(56,139,253,0.45)',borderRadius:3,yAxisID:'y'},
    {type:'line',label:'Rejection Rate %',data:rejRateMonth,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:'#f85149',spanGaps:true,yAxisID:'y1'}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10},callbacks:{label:function(ctx){if(ctx.dataset.yAxisID==='y1')return ctx.dataset.label+': '+ctx.parsed.y.toFixed(3)+'%';return ctx.dataset.label+': '+ctx.parsed.y.toFixed(2)+' mt';}}}},scales:{x:sc,y:{position:'left',grid:{color:gc},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'mt',color:'#484f58',font:{size:9}},beginAtZero:true,min:0},y1:{position:'right',grid:{display:false},beginAtZero:true,min:0,ticks:{color:'#484f58',font:{size:9},callback:function(v){return v.toFixed(2)+'%';}},title:{display:true,text:'Rate %',color:'#484f58',font:{size:9}}}}}});}

  // ── Cost combo chart (₱/kg line + total ₱ bar) — from Prod Cost sheet, site-aware ──
  (function(){
    var costC=document.getElementById('cm-cost');
    if(!costC) return;
    if(!DATA.prodCostCSV){
      // Trigger a load; chart will populate on next renderMonthly() call once cached
      fetch(PRODCOST_CSV_URL).then(function(r){return r.text();}).then(function(text){
        DATA.prodCostCSV=parseCSV(text);
        renderMonthly();
      }).catch(function(){});
      return;
    }
    var rowsRaw=DATA.prodCostCSV;
    var header=rowsRaw[0];
    function idx(name){ return header.indexOf(name); }
    var iYear=idx('YEAR'), iPlant=idx('PLANT'), iMonth=idx('MONTH'), iTotal=idx('Total Cost'), iVol=idx('Volume, kg');
    var targetPlant=activeSite==='NATIONAL'?'NATIONAL W/ TOLL':activeSite;
    function findRow(m){
      for(var i=1;i<rowsRaw.length;i++){
        var r=rowsRaw[i];
        if(r[iYear]==='2026' && (r[iPlant]||'').trim()===targetPlant && (r[iMonth]||'').toUpperCase()===m.toUpperCase()){
          return r;
        }
      }
      return null;
    }
    var costTotalByMonth=months.map(function(m){
      var r=findRow(m);
      return r?pcNum(r[iTotal]):null;
    });
    var costPerTonByMonth=months.map(function(m,i){
      var tot=costTotalByMonth[i];
      if(!tot) return null;
      var r=findRow(m);
      if(!r) return null;
      var vol=pcNum(r[iVol]);
      return vol>0?+(tot/vol).toFixed(2):null;
    });
    var costTitle=costC.closest('.cc')&&costC.closest('.cc').querySelector('.cc-title');
    if(costTitle) costTitle.textContent=(activeSite==='NATIONAL'?'National W/ Toll':SL[activeSite])+' Cost — Total (₱) & ₱/kg by Month';
    if(charts['cm-cost']){try{charts['cm-cost'].destroy();}catch(e){}}
    charts['cm-cost']=new Chart(costC.getContext('2d'),{data:{labels:mLabels,datasets:[
      {type:'bar',label:'Total Cost (₱)',data:costTotalByMonth,backgroundColor:'rgba(46,160,67,0.45)',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'₱/kg',data:costPerTonByMonth,borderColor:'#d29922',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:'#d29922',spanGaps:true,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10},callbacks:{label:function(ctx){if(ctx.dataset.yAxisID==='y')return ctx.dataset.label+': ₱'+(ctx.parsed.y/1000000).toFixed(2)+'M';return ctx.dataset.label+': ₱'+ctx.parsed.y;}}}},scales:{x:sc,y:{position:'left',grid:{color:gc},ticks:{color:'#484f58',font:{size:9},callback:function(v){return '₱'+(v/1000000).toFixed(1)+'M';}},title:{display:true,text:'Total Cost',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return '₱'+v;}},title:{display:true,text:'₱/kg',color:'#484f58',font:{size:9}}}}}});
  })();
  loadProdCostMonthly();
}
// ── Monthly Production Cost (Prod Cost sheet, published CSV) ──
var PRODCOST_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRx7S_rqgygPQifVep4DtnDFK8gGjAPVbrzCq6sCJcTF6omIGXb73iK8mQZoZjOgUq8CnZ9t7fR_2a/pub?gid=66553768&single=true&output=csv';

function parseCSV(text){
  // Simple RFC4180-ish CSV parser handling quoted fields with commas
  var rows=[]; var row=[]; var field=''; var inQuotes=false;
  for(var i=0;i<text.length;i++){
    var c=text[i], n=text[i+1];
    if(inQuotes){
      if(c==='"'&&n==='"'){ field+='"'; i++; }
      else if(c==='"'){ inQuotes=false; }
      else field+=c;
    } else {
      if(c==='"') inQuotes=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\r'){ /* skip */ }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field+=c;
    }
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  return rows;
}

function pcNum(s){
  if(s===undefined||s===null) return 0;
  s=String(s).trim().replace(/,/g,'');
  if(s==='') return 0;
  var v=parseFloat(s);
  return isNaN(v)?0:v;
}

function loadProdCostMonthly(){
  var target=document.getElementById('prodcost-section');
  if(!target) return;

  if(DATA.prodCostCSV){
    renderProdCostMonthly();
    return;
  }

  fetch(PRODCOST_CSV_URL).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.text();
  }).then(function(text){
    DATA.prodCostCSV = parseCSV(text);
    renderProdCostMonthly();
  }).catch(function(e){
    var t=document.getElementById('prodcost-section');
    if(t) t.innerHTML='<div class="no-data" style="color:var(--red)">Could not load monthly production cost: '+e.message+'</div>';
  });
}

function renderProdCostMonthly(){
  var target=document.getElementById('prodcost-section');
  if(!target) return;
  var rowsRaw=DATA.prodCostCSV;
  if(!rowsRaw||!rowsRaw.length){ target.innerHTML='<div class="no-data">No monthly cost data available</div>'; return; }

  var header=rowsRaw[0];
  function idx(name){ return header.indexOf(name); }
  var iYear=idx('YEAR'), iPlant=idx('PLANT'), iMonth=idx('MONTH'), iVol=idx('Volume, kg'),
      iRental=idx('Rental/Amor kphp'), iSP=idx('Spare Parts. kphp'), iMP=idx('Manpower Direct, kphp'),
      iDiesel=idx('Diesel, kphp'), iElec=idx('Electricity Machine, kphp'), iAgency=idx('Manpower Agency, kphp'),
      iOther=idx('Other, kphp'), i3rd=idx('3RD PARTY SERVICE'), iCESS=idx('CESS DEPRECIATION'),
      iSPDep=idx('SP DEPRECIATION'), iIns=idx('Insurance Personnel'), iWater=idx('WATER'),
      iThread=idx('THREAD'), iToll=idx('TOLLING FEE'), iTotal=idx('Total Cost'), iCpk=idx('Cost, Php/kg');

  // Determine which month to show: directly follow the Monthly tab's selected month
  var allMonths = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var wantMonth = (activeMonth||'').toUpperCase();
  if(allMonths.indexOf(wantMonth)<0){
    // no month selected yet (e.g. first load before pills initialize) — use latest month with data as a sane default
    var monthsWithData=[];
    for(var i=1;i<rowsRaw.length;i++){
      var r=rowsRaw[i];
      if(r[iYear]==='2026' && (r[iPlant]||'').trim()==='NATIONAL'){
        var mUp=(r[iMonth]||'').toUpperCase();
        if(allMonths.indexOf(mUp)>=0 && pcNum(r[iTotal])>0){
          monthsWithData.push(mUp);
        }
      }
    }
    wantMonth = monthsWithData.length ? monthsWithData[monthsWithData.length-1] : 'MAY';
  }

  var plantOrder=['AC','PFMIS','HOREB','BUKID','ARGAO','HOREB MG','AC MG'];
  var plants={}, national=null, ccpc=null, south=null, natToll=null;

  for(var i=1;i<rowsRaw.length;i++){
    var r=rowsRaw[i];
    if(r[iYear]!=='2026') continue;
    if((r[iMonth]||'').toUpperCase()!==wantMonth) continue;
    var p=(r[iPlant]||'').trim();
    var rec={
      name:p, volume:pcNum(r[iVol]), rental:pcNum(r[iRental]), spareparts:pcNum(r[iSP]),
      mpDirect:pcNum(r[iMP]), diesel:pcNum(r[iDiesel]), elecMachine:pcNum(r[iElec]),
      mpAgency:pcNum(r[iAgency]), other:pcNum(r[iOther]), thirdParty:pcNum(r[i3rd]),
      cess:pcNum(r[iCESS]), spDep:pcNum(r[iSPDep]), insurance:pcNum(r[iIns]),
      water:pcNum(r[iWater]), thread:pcNum(r[iThread]), tolling:pcNum(r[iToll]),
      totalCost:pcNum(r[iTotal]), costPerKg:pcNum(r[iCpk])
    };
    if(p==='NATIONAL') national=rec;
    else if(p==='NATIONAL W/ TOLL') natToll=rec;
    else if(p==='CCPC') ccpc=rec;
    else if(p==='SOUTH') south=rec;
    else if(plantOrder.indexOf(p)>=0) plants[p]=rec;
  }

  if(!national){
    target.innerHTML='<div class="no-data">No monthly production cost data found for '+wantMonth+' 2026</div>';
    return;
  }
  if(national.totalCost===0){
    target.innerHTML='<div class="no-data">Production cost data for '+wantMonth+' 2026 has not been entered yet</div>';
    return;
  }

  function fmt0(n){ return (n||n===0) ? Math.round(n).toLocaleString() : '0'; }
  function fmtPkg(n){ return (n||n===0) ? n.toFixed(2) : '—'; }

  var TH='padding:5px 6px;background:var(--bg3);color:var(--text2);font-size:7px;font-weight:600;text-transform:uppercase;letter-spacing:0.2px;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right;line-height:1.15;';
  var THL='padding:5px 6px;background:var(--bg3);color:var(--text2);font-size:7px;font-weight:600;text-transform:uppercase;letter-spacing:0.2px;border-bottom:1px solid var(--border);white-space:nowrap;text-align:left;line-height:1.15;';
  var TD='padding:4px 6px;font-size:9px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;';
  var TDL='padding:4px 6px;font-size:9px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap;font-weight:600;';

  var cols=[
    ['Volume, kg','volume',fmt0],['Rental/Amor','rental',fmt0],['Spare Parts','spareparts',fmt0],
    ['Manpower Direct','mpDirect',fmt0],['Diesel','diesel',fmt0],['Electricity Machine','elecMachine',fmt0],
    ['Manpower Agency','mpAgency',fmt0],['Other','other',fmt0],['3rd Party Svc','thirdParty',fmt0],
    ['CESS Dep.','cess',fmt0],['SP Dep.','spDep',fmt0],['Insurance Pers.','insurance',fmt0],
    ['Water','water',fmt0],['Thread','thread',fmt0],['Tolling Fee','tolling',fmt0],
    ['Total Cost','totalCost',fmt0],['Cost, ₱/kg','costPerKg',fmtPkg]
  ];

  var html='<div class="sec"><div class="sec-hdr"><div class="sec-title">Monthly Production Cost — By Site · '+wantMonth+' 2026</div><div class="sec-line"></div></div>';
  html+='<div class="cc"><div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;table-layout:auto">';
  html+='<thead><tr><th style="'+THL+'">Plant</th>';
  cols.forEach(function(c){ html+='<th style="'+TH+'">'+c[0]+'</th>'; });
  html+='</tr></thead><tbody>';

  function rowHTML(rec, opts){
    opts=opts||{};
    var bg = opts.fill || (opts.alt ? 'background:var(--bg2)' : 'background:var(--bg1)');
    var rowStyle = opts.national ? 'background:var(--blue-d);border-top:2px solid var(--blue)' : bg;
    var nameColor = opts.national ? 'color:var(--blue)' : '';
    var s = '<tr style="'+rowStyle+'">';
    s += '<td style="'+TDL+nameColor+'">'+(opts.national?'':dot(rec.name))+rec.name+'</td>';
    cols.forEach(function(c){
      var val = c[2](rec[c[1]]);
      var emphasize = (c[1]==='totalCost'||c[1]==='costPerKg') ? 'font-weight:700;color:var(--amber)' : '';
      s += '<td style="'+TD+emphasize+'">'+val+'</td>';
    });
    s += '</tr>';
    return s;
  }

  var altIdx=0;
  plantOrder.forEach(function(p){
    if(plants[p]){ html += rowHTML(plants[p], {alt: (altIdx++%2===1)}); }
  });
  html += rowHTML(national, {national:true});
  if(ccpc) html += rowHTML(ccpc, {alt:(altIdx++%2===1)});
  if(south) html += rowHTML(south, {alt:(altIdx++%2===1)});
  if(natToll) html += rowHTML(natToll, {national:true});

  html += '</tbody></table></div></div>';
  html += '<div style="font-size:8px;color:var(--text3);font-style:italic;margin-top:4px">Source: Prod Cost sheet (per-site monthly actuals, ₱). NATIONAL W/ TOLL includes CCPC/SOUTH tolling fees not present in individual plant cost lines.</div>';
  html += '</div>';

  target.innerHTML = html;
}

// ── National Weekly Cost Trend (across all weeks, cached) ──
function loadCostWeeklyTrend(){
  var allWeeks=(DATA.weekly&&DATA.weekly.weeks||[]).map(function(w){return +w;}).filter(function(w){return w>0;}).sort(function(a,b){return a-b;});
  if(!allWeeks.length) return;

  if(!DATA.costWeeklyTrend) DATA.costWeeklyTrend={};
  if(!DATA.costWeeklyTrend[activeSite]) DATA.costWeeklyTrend[activeSite]={};
  var siteCache=DATA.costWeeklyTrend[activeSite];
  var missing=allWeeks.filter(function(w){return !siteCache[w];});
  var _site=activeSite;

  if(missing.length){
    Promise.all(missing.map(function(w){
      return gasGet('pcdaily',{site:_site,week:w}).then(function(d){
        var rows=(d.rows||[]).filter(function(r){return (r.Plant||'').toUpperCase()===_site;});
        var sum=function(f){return rows.reduce(function(a,r){return a+(r[f]||0);},0);};
        siteCache[w]={
          vol: sum('TotalVolume'), total: sum('CostTotal'),
          fixed: sum('FixedTotal'), variable: sum('VarTotal')
        };
      }).catch(function(){ siteCache[w]=null; });
    })).then(function(){
      if(activeSite===_site) renderCostWeeklyTrend();
    });
  } else {
    renderCostWeeklyTrend();
  }
}

function renderCostWeeklyTrend(){
  var allWeeksRaw=(DATA.weekly&&DATA.weekly.weeks||[]).map(function(w){return +w;}).filter(function(w){return w>0;}).sort(function(a,b){return a-b;});
  if(!allWeeksRaw.length) return;
  var siteCache=(DATA.costWeeklyTrend&&DATA.costWeeklyTrend[activeSite])||{};

  // Trim leading weeks with no data at all (start chart from first week that has data)
  var firstIdx=allWeeksRaw.findIndex(function(w){var d=siteCache[w];return d&&(d.total>0||d.fixed>0||d.variable>0);});
  var allWeeks=firstIdx>0?allWeeksRaw.slice(firstIdx):allWeeksRaw;
  if(!allWeeks.length) allWeeks=allWeeksRaw;

  var lbl=allWeeks.map(function(w){return 'W'+w;});
  var totalData=allWeeks.map(function(w){var d=siteCache[w];return d&&d.total>0?+d.total.toFixed(0):null;});
  var perTonData=allWeeks.map(function(w){var d=siteCache[w];return d&&d.vol>0?+(d.total/d.vol).toFixed(2):null;});
  var fixedPerTonData=allWeeks.map(function(w){var d=siteCache[w];return d&&d.vol>0&&d.fixed>0?+(d.fixed/d.vol).toFixed(2):null;});
  var varPerTonData=allWeeks.map(function(w){var d=siteCache[w];return d&&d.vol>0&&d.variable>0?+(d.variable/d.vol).toFixed(2):null;});

  var gc='rgba(255,255,255,0.04)';
  var sc={grid:{color:gc},ticks:{color:'#484f58',font:{size:9,family:"'DM Mono',monospace"}}};
  var tip={backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}};
  var siteLbl=activeSite==='NATIONAL'?'National':SL[activeSite];

  var comboTitle=document.querySelector('#c-cost-combo')&&document.querySelector('#c-cost-combo').closest('.cc').querySelector('.cc-title');
  if(comboTitle) comboTitle.textContent=siteLbl+' Total Cost (₱) & ₱/ton — by Week';
  var fvTitle=document.querySelector('#c-cost-fixvar')&&document.querySelector('#c-cost-fixvar').closest('.cc').querySelector('.cc-title');
  if(fvTitle) fvTitle.textContent=siteLbl+' Fixed vs Variable Cost (₱/ton) — by Week';

  var comboC=document.getElementById('c-cost-combo');
  if(comboC){
    if(charts['c-cost-combo']){try{charts['c-cost-combo'].destroy();}catch(e){}}
    charts['c-cost-combo']=new Chart(comboC.getContext('2d'),{data:{labels:lbl,datasets:[
      {type:'bar',label:'Total Cost (₱)',data:totalData,backgroundColor:'rgba(46,160,67,0.45)',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'₱/ton',data:perTonData,borderColor:'#d29922',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:'#d29922',spanGaps:true,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:tip.backgroundColor,borderColor:tip.borderColor,borderWidth:tip.borderWidth,bodyFont:tip.bodyFont,callbacks:{label:function(ctx){if(ctx.dataset.yAxisID==='y')return ctx.dataset.label+': ₱'+(ctx.parsed.y/1000000).toFixed(2)+'M';return ctx.dataset.label+': ₱'+ctx.parsed.y.toFixed(2);}}}},scales:{x:sc,y:{position:'left',grid:{color:gc},ticks:{color:'#484f58',font:{size:9},callback:function(v){return '₱'+(v/1000000).toFixed(1)+'M';}},title:{display:true,text:'Total Cost',color:'#484f58',font:{size:9}},beginAtZero:true,min:0},y1:{position:'right',grid:{display:false},beginAtZero:true,min:0,ticks:{color:'#484f58',font:{size:9},callback:function(v){return '₱'+v;}},title:{display:true,text:'₱/ton',color:'#484f58',font:{size:9}}}}}});
  }

  var fvC=document.getElementById('c-cost-fixvar');
  if(fvC){
    if(charts['c-cost-fixvar']){try{charts['c-cost-fixvar'].destroy();}catch(e){}}
    charts['c-cost-fixvar']=new Chart(fvC.getContext('2d'),{type:'line',data:{labels:lbl,datasets:[
      {label:'Fixed Cost (₱/ton)',data:fixedPerTonData,borderColor:'#388bfd',backgroundColor:'rgba(56,139,253,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true},
      {label:'Variable Cost (₱/ton)',data:varPerTonData,borderColor:'#f85149',backgroundColor:'rgba(248,81,73,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:tip.backgroundColor,borderColor:tip.borderColor,borderWidth:tip.borderWidth,bodyFont:tip.bodyFont,callbacks:{label:function(ctx){return ctx.dataset.label+': ₱'+ctx.parsed.y.toFixed(2)+'/ton';}}}},scales:{x:sc,y:{grid:{color:gc},ticks:{color:'#484f58',font:{size:9},callback:function(v){return '₱'+v;}},title:{display:true,text:'₱/ton',color:'#484f58',font:{size:9}},beginAtZero:true,min:0}}}});
  }
}

function renderCost(){
  var ct=document.getElementById('content-cost');
  if(!ct) return;

  if(!DATA.pcdaily || DATA.pcdailyWeek!==activeWeek || DATA.pcdailySite!==activeSite){
    ct.innerHTML='<div class="no-data">⟳ Loading cost data...</div>';
    gasGet('pcdaily',{site:activeSite,week:activeWeek}).then(function(d){
      DATA.pcdaily=d;
      DATA.pcdailyWeek=activeWeek;
      DATA.pcdailySite=activeSite;
      renderCost();
    }).catch(function(e){
      ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';
    });
    return;
  }

  var rows = DATA.pcdaily.rows||[];
  if(!rows.length){
    ct.innerHTML='<div class="no-data">No cost data for '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · Week '+activeWeek+'</div>';
    return;
  }

  // ── Helpers ──────────────────────────────────────────────
  function fmt0(n){ if(!n&&n!==0) return '—'; return Math.round(n).toLocaleString(); }
  function fmt2(n){ if(!n&&n!==0) return '—'; return n.toFixed(2); }
  function fmtPeso(n){ if(!n&&n!==0) return '—'; return '₱'+Math.round(n).toLocaleString(); }

  // ── Aggregate for weekly summary (sum cost/day fields, avg cost/ton) ─
  function sumF(f){ return rows.reduce(function(a,r){return a+(r[f]||0);},0); }
  function totalVol(){ return sumF('TotalVolume'); }

  var sums = {
    RentalDay: sumF('RentalDay'), SPDay: sumF('SPDay'), MPDay: sumF('MPDay'),
    PowerCost: sumF('PowerCost'), FuelCost: sumF('FuelCost'), CoalCost: sumF('CoalCost'),
    AgencyTotal: sumF('AgencyTotal'), OthersDay: sumF('OthersDay'),
    FixedTotal: sumF('FixedTotal'), VarTotal: sumF('VarTotal'), CostTotal: sumF('CostTotal')
  };
  var vol = totalVol();
  function perTon(v){ return vol>0 ? v/vol : 0; }

  var TH='padding:4px 5px;background:var(--bg3);color:var(--text2);font-size:7px;font-weight:600;text-transform:uppercase;letter-spacing:0.2px;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right;line-height:1.2;';
  var TD='padding:3px 5px;font-size:9px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;';
  var TDL='padding:3px 5px;font-size:9px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap;';

  var html='';

  // ── Weekly Summary Scorecard ─────────────────────────────
  function scCard(label,dayVal,tonVal,color){
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid '+(color||'var(--border2)')+';border-radius:var(--rl);padding:10px;flex:1;min-width:0">'
      +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;white-space:nowrap">'+label+'</div>'
      +'<div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:var(--text1);line-height:1">'+fmtPeso(dayVal)+'</div>'
      +'<div style="font-size:9px;color:var(--text3);font-family:DM Mono,monospace;margin-top:2px">₱'+fmt2(tonVal)+'/ton</div>'
      +'</div>';
  }

  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Production Cost — Weekly Summary · '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · Week '+activeWeek+'</div><div class="sec-line"></div></div>';

  html+='<div style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:8px">'
    +scCard('Rental',sums.RentalDay,perTon(sums.RentalDay))
    +scCard('Spareparts',sums.SPDay,perTon(sums.SPDay))
    +scCard('Manpower Direct',sums.MPDay,perTon(sums.MPDay))
    +scCard('Power',sums.PowerCost,perTon(sums.PowerCost))
    +scCard('Fuel',sums.FuelCost,perTon(sums.FuelCost))
    +scCard('Coal',sums.CoalCost,perTon(sums.CoalCost))
    +scCard('Agency Manpower',sums.AgencyTotal,perTon(sums.AgencyTotal))
    +scCard('Others',sums.OthersDay,perTon(sums.OthersDay))
    +'</div>';

  html+='<div style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto">'
    +scCard('Total Fixed Cost',sums.FixedTotal,perTon(sums.FixedTotal),'var(--amber)')
    +scCard('Total Variable Cost',sums.VarTotal,perTon(sums.VarTotal),'var(--amber)')
    +scCard('Total Cost',sums.CostTotal,perTon(sums.CostTotal),'var(--red)')
    +'</div></div>';

  // ── Weekly Cost Trend Charts (National, all weeks) ───────
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">'+(activeSite==='NATIONAL'?'National':SL[activeSite])+' Weekly Cost Trend</div><div class="sec-line"></div></div>'
    +'<div class="g2">'
    +'<div class="cc"><div class="cc-title">Total Cost (₱) &amp; ₱/ton — by Week</div><div style="position:relative;height:160px"><canvas id="c-cost-combo"></canvas></div></div>'
    +'<div class="cc"><div class="cc-title">Fixed vs Variable Cost (₱) — by Week</div><div style="position:relative;height:160px"><canvas id="c-cost-fixvar"></canvas></div></div>'
    +'</div></div>';

  // ── Daily Detail Table ───────────────────────────────────
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Daily Production Cost Detail <span style="font-size:10px;color:var(--text3);font-weight:400">(all values in ₱/ton)</span></div><div class="sec-line"></div></div>';
  html+='<div class="cc"><div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;table-layout:auto;font-size:9px">';
  html+='<thead><tr>';
  html+='<th style="'+TH+'text-align:left">Date</th>';
  if(activeSite==='NATIONAL') html+='<th style="'+TH+'text-align:left">Plant</th>';
  html+='<th style="'+TH+'">Volume</th>';
  [['Rental','RentalTon'],['Spareparts','SPTon'],['Manpower','MPTon'],
   ['Power','PowerTon'],['Fuel','FuelTon'],['Coal','CoalTon'],
   ['Agency MP','AgencyTon'],['Others','OthersTon']
  ].forEach(function(pair){
    html+='<th style="'+TH+'">'+pair[0]+'</th>';
  });
  html+='<th style="'+TH+'">Fixed</th>';
  html+='<th style="'+TH+'">Variable</th>';
  html+='<th style="'+TH+'background:var(--bg2);color:var(--amber)">Total</th>';
  html+='</tr></thead><tbody>';

  rows.forEach(function(r,i){
    var bg = i%2===0?'background:var(--bg1)':'background:var(--bg2)';
    html+='<tr style="'+bg+'">';
    html+='<td style="'+TDL+bg+'">'+(r.Date||'—')+'</td>';
    if(activeSite==='NATIONAL') html+='<td style="'+TDL+bg+'">'+dot(r.Plant)+r.Plant+'</td>';
    html+='<td style="'+TD+bg+'">'+fmt0(r.TotalVolume)+'</td>';
    [['RentalTon'],['SPTon'],['MPTon'],
     ['PowerTon'],['FuelTon'],['CoalTon'],
     ['AgencyTon'],['OthersTon']
    ].forEach(function(pair){
      html+='<td style="'+TD+bg+'">'+fmt2(r[pair[0]])+'</td>';
    });
    html+='<td style="'+TD+bg+'color:var(--text3)">'+fmt2(r.FixedTon)+'</td>';
    html+='<td style="'+TD+bg+'color:var(--text3)">'+fmt2(r.VarTon)+'</td>';
    html+='<td style="'+TD+bg+'color:var(--amber);font-weight:600">'+fmt2(r.CostTon)+'</td>';
    html+='</tr>';
  });

  // Weekly total row
  html+='<tr style="background:var(--bg3);border-top:2px solid var(--border2)">';
  html+='<td style="'+TDL+'font-weight:700">WEEKLY TOTAL</td>';
  if(activeSite==='NATIONAL') html+='<td style="'+TDL+'"></td>';
  html+='<td style="'+TD+'font-weight:700">'+fmt0(vol)+'</td>';
  [['RentalDay'],['SPDay'],['MPDay'],
   ['PowerCost'],['FuelCost'],['CoalCost'],
   ['AgencyTotal'],['OthersDay']
  ].forEach(function(pair){
    var dsum = sums[pair[0]]!==undefined?sums[pair[0]]:sumF(pair[0]);
    html+='<td style="'+TD+'color:var(--text3);font-weight:700">'+fmt2(perTon(dsum))+'</td>';
  });
  html+='<td style="'+TD+'color:var(--text3);font-weight:700">'+fmt2(perTon(sums.FixedTotal))+'</td>';
  html+='<td style="'+TD+'color:var(--text3);font-weight:700">'+fmt2(perTon(sums.VarTotal))+'</td>';
  html+='<td style="'+TD+'color:var(--amber);font-weight:700">'+fmt2(perTon(sums.CostTotal))+'</td>';
  html+='</tr>';

  html+='</tbody></table></div></div></div>';

  ct.innerHTML = html;
  loadCostWeeklyTrend();
}
function renderDowntimeMonth(m){
  // Always re-render everything with new month
  activeMonth=m;
  renderDowntime();
}
function dtSetMonth(m){
  activeMonth=m;
  if(DATA.dtCache) DATA.dtCache=null;
  renderDowntime();
}

function renderDowntime(){
  var ct=document.getElementById('content-downtime');
  var dtWrap=document.getElementById('dt-data-wrap');

  // ── STEP 1: Scorecard from MR Monthly ────────────────────
  if(!DATA.monthly){
    ct.innerHTML='<div class="no-data">⟳ Loading...</div>';
    gasGet('monthly').then(function(d){DATA.monthly=d;renderDowntime();})
      .catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';});
    return;
  }
  var mrows=DATA.monthly.rows||[];
  var ALL_MONTH_NAMES=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var months=(DATA.monthly.months||[]).filter(function(m){return ALL_MONTH_NAMES.indexOf(String(m).trim().toUpperCase())>=0;});
  if(!activeMonth||months.indexOf(activeMonth)<0) activeMonth=months[months.length-1]||'';

  // Month pills
  var pills=document.getElementById('dt-month-pills');
  if(pills){
    _monthsList=months;
    pills.innerHTML=months.map(function(m,i){
      return '<button class="wk-pill'+(m===activeMonth?' active':'')+'" onclick="setMonth('+i+');renderDowntime()">'+m.slice(0,3)+'</button>';
    }).join('');
    setTimeout(function(){var a=pills.querySelector('.wk-pill.active');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},100);
  }

  // Filter monthly rows for scorecard
  var mr=mrows.filter(function(r){return String(r.MONTH||r.Month||'').trim()===activeMonth;});
  var dr=activeSite==='NATIONAL'
    ?mr.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})
    :mr.filter(function(r){return (r.Plant||'').toUpperCase()===activeSite;});

  function sh(f1,f2){return dr.reduce(function(a,r){return a+gf(r,f1,f2||f1);},0);}
  function ap(f1){var v=dr.reduce(function(a,r){return a+gf(r,f1);},0)/Math.max(dr.length,1);return v>1?v:v*100;}

  var sdt=sh('Scheduled Down Time, hr');
  var udt=sh('Unscheduled Down Time, hr','Unscheduled Downtime, hr');
  var udtP=ap('Unscheduled Down Time, %');
  var eqH=sh('Equipment Downtime, hr','Equipment Down Time, hr');var eqP=ap('Equipment Downtime, %');
  var prH=sh('Process, hr');var prP=ap('Process, %');
  var whH=sh('Warehouse, hr');var whP=ap('Warehouse, %');
  var rmH=sh('Raw Materials, hr','Raw Materials, h');var rmP=ap('Raw Materials, %');
  var coH=sh('Change Over Downtime, hr');var coP=ap('Change Over Downtime, %');
  var pfH=sh('Power Failure, hr','Power Failure, h');var pfP=ap('Power Failure, %');
  var elH=sh('Electrical, hr');var elP=ap('Electrical, %');
  var meH=sh('Mechanical, hr');var meP=ap('Mechanical, %');
  var plH=sh('PLC, hr');var plP=ap('PLC, %');
  var cdH=sh('Change Die, hr');var cdP=ap('Change Die, %');
  var csH=sh('Change Screen, hr');var csP=ap('Change Screen, %');
  var coACH=sh('Change Over, hr');var coACP=ap('Change Over, %');

  function dtColor(h){return h>80?'var(--red)':h>40?'var(--amber)':'var(--border2)';}
  function pctColor(p){return p>5?'var(--red)':p>3?'var(--amber)':'var(--green-b)';}
  function dtCard(label,hrs,pct){
    var hC=dtColor(hrs);var pC=pct!==null?pctColor(pct):'var(--text3)';
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid '+hC+';border-radius:var(--rl);padding:10px 8px;flex:1;min-width:0">'
      +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;white-space:nowrap">'+label+'</div>'
      +'<div style="font-family:Barlow Condensed,sans-serif;font-size:24px;font-weight:700;color:'+hC+';line-height:1">'+(hrs>0?hrs.toFixed(1):'—')+'<span style="font-size:10px;color:var(--text2)"> hr</span></div>'
      +(pct!==null?'<div style="font-family:DM Mono,monospace;font-size:10px;color:'+pC+';margin-top:2px">'+(pct>0?pct.toFixed(1)+'%':'—')+'</div>':'')
      +'</div>';
  }

  ct.innerHTML=
    '<div class="sec"><div class="sec-hdr"><div class="sec-title">Downtime — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · '+activeMonth+'</div><div class="sec-line"></div></div>'
    +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-family:DM Mono,monospace">Overall</div>'
    +'<div style="display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:8px">'
    +dtCard('Scheduled DT',sdt,null)+dtCard('Unscheduled DT',udt,udtP)
    +dtCard('Equipment',eqH,eqP)+dtCard('Process',prH,prP)
    +dtCard('Warehouse',whH,whP)+dtCard('Raw Materials',rmH,rmP)
    +dtCard('Change Over DT',coH,coP)+dtCard('Power Failure',pfH,pfP)
    +'</div>'
    +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-family:DM Mono,monospace">Equipment &amp; Change Over Breakdown</div>'
    +'<div style="display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto">'
    +dtCard('Electrical',elH,elP)+dtCard('Mechanical',meH,meP)
    +dtCard('PLC',plH,plP)+dtCard('Change Over',coACH,coACP)
    +dtCard('Change Die',cdH,cdP)+dtCard('Change Screen',csH,csP)
    +'</div></div>';

  // ── STEP 2: Load Downtime sheet data ─────────────────────
  // Use cached data if same site - instant month switching without re-fetch
  if(DATA.dtLastResponse && DATA.dtLastSite===activeSite){
    // Verify cache has data for requested month
    var reqM=(activeMonth||'').toUpperCase();
    var hasM=false;
    if(!reqM) hasM=true;
    else (DATA.dtLastResponse.rows||[]).some(function(r){
      if((r.Month||'').toUpperCase()===reqM){hasM=true;return true;}
    });
    if(hasM){
      if(dtWrap) renderDowntimeTables(DATA.dtLastResponse, dtWrap, activeMonth, activeSite);
      return;
    }
    // Month not in cache - clear and re-fetch
    DATA.dtLastResponse=null; DATA.dtLastSite=null;
  }

  if(dtWrap) dtWrap.innerHTML='<div class="no-data">⟳ Loading downtime records...</div>';

  gasGet('downtime',{site:activeSite,week:'',month:''}).then(function(d){
    var dtW=document.getElementById('dt-data-wrap');
    if(!dtW) return;
    DATA.dtLastResponse=d;
    DATA.dtLastSite=activeSite;
    renderDowntimeTables(d, dtW, activeMonth, activeSite);
  }).catch(function(e){
    var dtW=document.getElementById('dt-data-wrap');
    if(dtW) dtW.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';
  });
}

function renderDowntimeTables(d, dtW, filterMonth, filterSite){
  var allRows = d.rows||[];

  // Find available months from data
  var monthOrder=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var seenMonths={};
  allRows.forEach(function(r){ if(r.Month) seenMonths[r.Month.toUpperCase()]=true; });
  var availMonths=monthOrder.filter(function(m){ return seenMonths[m]; });

  // Use filterMonth if available, else latest
  // Use filterMonth directly - if no data exists for it, rows will be empty -> "No records"
  // NEVER fall back to another month as that shows wrong data
  var showMonth = filterMonth ? filterMonth.toUpperCase() : (availMonths[availMonths.length-1]||'');

  // Filter by month only - site already filtered server-side by GAS
  var rows=allRows.filter(function(r){
    return r.Month && r.Month.toUpperCase()===showMonth;
  });

  if(!rows.length){
    dtW.innerHTML='<div class="no-data" style="padding:20px">'
      +'No downtime records for <b>'+showMonth+'</b>.'
      +'<br><small style="color:var(--text3)">Available months: '+availMonths.join(', ')+'</small></div>';
    return;
  }

  // ── Pareto calc ──────────────────────────────────────────
  var pMap={};
  rows.forEach(function(r){
    if(r['Unscheduled Downtime']>0)
      pMap[r.Category]=(pMap[r.Category]||0)+r['Unscheduled Downtime'];
  });
  var pArr=Object.keys(pMap).map(function(k){return {cat:k,hrs:pMap[k]};})
    .sort(function(a,b){return b.hrs-a.hrs;});
  var pTotal=pArr.reduce(function(a,x){return a+x.hrs;},0);
  var cum=0;
  pArr.forEach(function(p){cum+=pTotal>0?p.hrs/pTotal*100:0; p.cum=cum;});
  var p80=pArr.filter(function(p){return p.cum<=80.01;});

  // ── 80% UDT Breakdown (grouped by Plant+Cat+SubCat) ─────
  var bdMap={};
  p80.forEach(function(p){
    rows.filter(function(r){return r.Category===p.cat&&r['Unscheduled Downtime']>0;})
      .forEach(function(r){
        var k=(r.Plant||'')+'||'+r.Category+'||'+(r['Sub-Category']||'');
        if(!bdMap[k]) bdMap[k]={
          Plant:r.Plant||'', Category:r.Category,
          'Sub-Category':r['Sub-Category']||'',
          UDT:0, PM:'', CCR:''
        };
        bdMap[k].UDT+=r['Unscheduled Downtime'];
        if(r['PM Operator in Charge']&&!bdMap[k].PM) bdMap[k].PM=r['PM Operator in Charge'];
        if(r['CCR in Charge']&&!bdMap[k].CCR) bdMap[k].CCR=r['CCR in Charge'];
      });
  });
  var bdRows=Object.keys(bdMap).map(function(k){return bdMap[k];})
    .sort(function(a,b){return b.UDT-a.UDT;});
  var bdTotal=bdRows.reduce(function(a,r){return a+r.UDT;},0);

  // ── UDT / SDT / CO rows ──────────────────────────────────
  var udtRows=rows.filter(function(r){return r['Unscheduled Downtime']>0;})
    .sort(function(a,b){return b['Unscheduled Downtime']-a['Unscheduled Downtime'];});
  var sdtRows=rows.filter(function(r){return r['Scheduled Downtime']>0;})
    .sort(function(a,b){return b['Scheduled Downtime']-a['Scheduled Downtime'];});
  var coRows=rows.filter(function(r){return r['No. Of Change Over']>0;})
    .sort(function(a,b){return b['No. Of Change Over']-a['No. Of Change Over'];});

  // ── Table helper ─────────────────────────────────────────
  var TH='padding:6px 8px;background:var(--bg3);color:var(--text2);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;';
  var TD='padding:5px 8px;font-size:10px;border-bottom:1px solid var(--border);white-space:nowrap;';

  function tbl(title,cols,trows,maxH){
    if(!trows.length) return '<div class="cc"><div class="cc-title">'+title+' (0)</div><div class="no-data">No records</div></div>';
    return '<div class="cc"><div class="cc-title">'+title+' ('+trows.length+')</div>'
      +'<div class="tbl-wrap" style="max-height:'+(maxH||280)+'px;overflow-y:auto">'
      +'<table style="width:100%;border-collapse:collapse">'
      +'<thead><tr>'+cols.map(function(c){return '<th style="'+TH+'text-align:'+(c.r?'right':'left')+'">'+c.h+'</th>';}).join('')+'</tr></thead>'
      +'<tbody>'
      +trows.slice(0,300).map(function(r,i){
        return '<tr style="background:'+(i%2===0?'var(--bg1)':'var(--bg2)')+'">'+cols.map(function(c){
          var v=c.fn(r);
          return '<td style="'+TD+'text-align:'+(c.r?'right':'left')+';'+(c.bold?'font-weight:600;font-family:DM Mono,monospace;':'')+(c.clr?'color:'+c.clr(r)+';':'')+'">'+v+'</td>';
        }).join('')+'</tr>';
      }).join('')
      +'</tbody></table></div></div>';
  }

  var html='';

  // 1. Pareto chart + table side by side
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">UDT Pareto — '+showMonth+'</div><div class="sec-line"></div></div>'
    +'<div class="g2">'
    // Left: chart
    +'<div class="cc"><div class="cc-title">Pareto Chart</div>'
    +'<div style="position:relative;height:240px"><canvas id="dt-pareto-chart"></canvas></div></div>'
    // Right: summary table
    +'<div class="cc"><div class="cc-title">80% Contribution Summary</div>'
    +'<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">'
    +'<thead><tr>'
    +'<th style="'+TH+'text-align:left">Category</th>'
    +'<th style="'+TH+'text-align:right">UDT hr</th>'
    +'<th style="'+TH+'text-align:right">%</th>'
    +'<th style="'+TH+'text-align:right">Cum%</th>'
    +'</tr></thead><tbody>'
    +pArr.map(function(p,i){
      var pct=pTotal>0?p.hrs/pTotal*100:0;
      var is80=p.cum<=80.01;
      return '<tr style="background:'+(is80?'rgba(248,81,73,0.07)':'')+(i%2===0?'':'') +'">'
        +'<td style="'+TD+'"><span style="color:'+(is80?'var(--red)':'var(--text2)')+';font-weight:'+(is80?'700':'400')+'">'+p.cat+'</span></td>'
        +'<td style="'+TD+'text-align:right;font-family:DM Mono,monospace">'+p.hrs.toFixed(2)+'</td>'
        +'<td style="'+TD+'text-align:right">'+pct.toFixed(1)+'%</td>'
        +'<td style="'+TD+'text-align:right;color:'+(is80?'var(--red)':'var(--text3)')+'">'+Math.min(p.cum,100).toFixed(1)+'%</td>'
        +'</tr>';
    }).join('')
    +'</tbody></table></div></div>'
    +'</div></div>';

  // 2. 80% UDT Breakdown grouped
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">80% UDT Breakdown — Grouped &amp; Totaled</div><div class="sec-line"></div></div>'
    +'<div class="cc"><div class="tbl-wrap" style="max-height:320px;overflow-y:auto">'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr>'
    +'<th style="'+TH+'text-align:left">Plant</th>'
    +'<th style="'+TH+'text-align:left">Category</th>'
    +'<th style="'+TH+'text-align:left">Sub-Category</th>'
    +'<th style="'+TH+'text-align:right">UDT hr</th>'
    +'<th style="'+TH+'text-align:right">%</th>'
    +'<th style="'+TH+'text-align:left">PM Operator</th>'
    +'<th style="'+TH+'text-align:left">CCR</th>'
    +'</tr></thead><tbody>'
    +bdRows.map(function(r,i){
      var pct=bdTotal>0?r.UDT/bdTotal*100:0;
      return '<tr style="background:'+(i%2===0?'var(--bg1)':'var(--bg2)')+';">'
        +'<td style="'+TD+'font-weight:600">'+dot(r.Plant)+r.Plant+'</td>'
        +'<td style="'+TD+'"><span class="cat-pill '+(DT_CATS[r.Category]||'cat-other')+'">'+r.Category+'</span></td>'
        +'<td style="'+TD+'color:var(--text2)">'+(r['Sub-Category']||'—')+'</td>'
        +'<td style="'+TD+'text-align:right;font-family:DM Mono,monospace;font-weight:600;color:var(--red)">'+r.UDT.toFixed(2)+'</td>'
        +'<td style="'+TD+'text-align:right;color:var(--text3)">'+pct.toFixed(1)+'%</td>'
        +'<td style="'+TD+'color:var(--text3);font-size:9px">'+(r.PM||'—')+'</td>'
        +'<td style="'+TD+'color:var(--text3);font-size:9px">'+(r.CCR||'—')+'</td>'
        +'</tr>';
    }).join('')
    +'<tr style="background:var(--bg3);border-top:2px solid var(--border)">'
    +'<td colspan="3" style="'+TD+'text-align:right;font-weight:700">TOTAL</td>'
    +'<td style="'+TD+'text-align:right;font-family:DM Mono,monospace;font-weight:700;color:var(--red)">'+bdTotal.toFixed(2)+'</td>'
    +'<td style="'+TD+'text-align:right">100%</td><td colspan="2"></td>'
    +'</tr>'
    +'</tbody></table></div></div></div>';

  // 2b. Top 10 UDT Sub-Categories — summed across month
  var top10Map = {};
  rows.filter(function(r){return r['Unscheduled Downtime']>0;}).forEach(function(r){
    var k = (r.Plant||'')+'||'+(r['Sub-Category']||r.Category||'—');
    if(!top10Map[k]) top10Map[k] = {
      Plant: r.Plant||'',
      Category: r.Category||'',
      SubCategory: r['Sub-Category']||r.Category||'—',
      UDT: 0
    };
    top10Map[k].UDT += r['Unscheduled Downtime'];
  });
  var top10 = Object.keys(top10Map).map(function(k){return top10Map[k];})
    .sort(function(a,b){return b.UDT-a.UDT;})
    .slice(0,10);
  var top10Total = top10.reduce(function(a,r){return a+r.UDT;},0);

  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Top 10 UDT Sub-Categories (hrs) — '+showMonth+'</div><div class="sec-line"></div></div>'
    +'<div class="g2">'
    // Left: horizontal bar chart
    +'<div class="cc"><div class="cc-title">Top 10 by Hours</div>'
    +'<div style="position:relative;height:320px"><canvas id="dt-top10-chart"></canvas></div></div>'
    // Right: ranked table
    +'<div class="cc"><div class="cc-title">Top 10 Detail</div>'
    +'<div class="tbl-wrap" style="max-height:320px;overflow-y:auto"><table style="width:100%;border-collapse:collapse">'
    +'<thead><tr>'
    +'<th style="'+TH+'text-align:left">#</th>'
    +'<th style="'+TH+'text-align:left">Plant</th>'
    +'<th style="'+TH+'text-align:left">Sub-Category</th>'
    +'<th style="'+TH+'text-align:right">UDT hr</th>'
    +'</tr></thead><tbody>'
    +(top10.length?top10.map(function(r,i){
      return '<tr style="background:'+(i%2===0?'var(--bg1)':'var(--bg2)')+'">'
        +'<td style="'+TD+'color:var(--text3)">'+(i+1)+'</td>'
        +'<td style="'+TD+'font-weight:600">'+dot(r.Plant)+r.Plant+'</td>'
        +'<td style="'+TD+'"><span style="max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+r.SubCategory.replace(/"/g,'&quot;')+'">'+r.SubCategory+'</span></td>'
        +'<td style="'+TD+'text-align:right;font-family:DM Mono,monospace;font-weight:600;color:var(--red)">'+r.UDT.toFixed(2)+'</td>'
        +'</tr>';
    }).join(''):'<tr><td colspan="4" style="'+TD+'text-align:center;color:var(--text3)">No records</td></tr>')
    +'</tbody>'
    +(top10.length?'<tfoot><tr style="background:var(--bg3);border-top:2px solid var(--border)">'
      +'<td colspan="3" style="'+TD+'text-align:right;font-weight:700">TOP 10 TOTAL</td>'
      +'<td style="'+TD+'text-align:right;font-family:DM Mono,monospace;font-weight:700;color:var(--red)">'+top10Total.toFixed(2)+'</td>'
      +'</tr></tfoot>':'')
    +'</table></div></div>'
    +'</div></div>';
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">All Unscheduled Downtime Records</div><div class="sec-line"></div></div>'
    +tbl('UDT Records',[
      {h:'Plant',fn:function(r){return dot(r.Plant||'')+' '+(r.Plant||'—');}},
      {h:'Wk',fn:function(r){return r.Week||'—';}},
      {h:'Shift',fn:function(r){return r.Shift||'—';}},
      {h:'Machine',fn:function(r){return r['Machine Line']||'—';}},
      {h:'Category',fn:function(r){return '<span class="cat-pill '+(DT_CATS[r.Category]||'cat-other')+'">'+(r.Category||'—')+'</span>';}},
      {h:'Sub-Category',fn:function(r){return r['Sub-Category']||'—';}},
      {h:'Reason',fn:function(r){return '<span style="max-width:160px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r['Reason of Delay']||'—')+'</span>';}},
      {h:'UDT hr',r:true,bold:true,clr:function(){return 'var(--red)';},fn:function(r){return r['Unscheduled Downtime'].toFixed(2);}}
    ],udtRows,300)
    +'</div>';

  // 4. All SDT table
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">All Scheduled Downtime Records</div><div class="sec-line"></div></div>'
    +tbl('SDT Records',[
      {h:'Plant',fn:function(r){return dot(r.Plant||'')+' '+(r.Plant||'—');}},
      {h:'Wk',fn:function(r){return r.Week||'—';}},
      {h:'Shift',fn:function(r){return r.Shift||'—';}},
      {h:'Machine',fn:function(r){return r['Machine Line']||'—';}},
      {h:'Category',fn:function(r){return '<span class="cat-pill '+(DT_CATS[r.Category]||'cat-other')+'">'+(r.Category||'—')+'</span>';}},
      {h:'Sub-Category',fn:function(r){return r['Sub-Category']||'—';}},
      {h:'Reason',fn:function(r){return '<span style="max-width:160px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r['Reason of Delay']||'—')+'</span>';}},
      {h:'SDT hr',r:true,bold:true,clr:function(){return 'var(--amber)';},fn:function(r){return r['Scheduled Downtime'].toFixed(2);}}
    ],sdtRows,280)
    +'</div>';

  // 5. All Change Over table
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">All Change Over Records</div><div class="sec-line"></div></div>'
    +tbl('Change Over',[
      {h:'Plant',fn:function(r){return dot(r.Plant||'')+' '+(r.Plant||'—');}},
      {h:'Wk',fn:function(r){return r.Week||'—';}},
      {h:'Shift',fn:function(r){return r.Shift||'—';}},
      {h:'Machine',fn:function(r){return r['Machine Line']||'—';}},
      {h:'Category',fn:function(r){return '<span class="cat-pill '+(DT_CATS[r.Category]||'cat-other')+'">'+(r.Category||'—')+'</span>';}},
      {h:'Sub-Category',fn:function(r){return r['Sub-Category']||'—';}},
      {h:'Reason',fn:function(r){return '<span style="max-width:160px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r['Reason of Delay']||'—')+'</span>';}},
      {h:'# CO',r:true,bold:true,fn:function(r){return r['No. Of Change Over'];}}
    ],coRows,280)
    +'</div>';

  dtW.innerHTML=html;

  // ── Render Pareto Chart ──────────────────────────────────
  var ctx=document.getElementById('dt-pareto-chart');
  if(ctx){
    if(charts['dt-pareto']){try{charts['dt-pareto'].destroy();}catch(e){}}
    var cumData=(function(){var c=0;return pArr.map(function(p){c+=pTotal>0?p.hrs/pTotal*100:0;return +c.toFixed(1);});})();
    charts['dt-pareto']=new Chart(ctx.getContext('2d'),{
      data:{
        labels:pArr.map(function(p){return p.cat.length>12?p.cat.slice(0,12)+'…':p.cat;}),
        datasets:[
          {type:'bar',label:'UDT hrs',data:pArr.map(function(p){return +p.hrs.toFixed(2);}),
           backgroundColor:'rgba(248,81,73,0.65)',borderRadius:3,yAxisID:'y'},
          {type:'line',label:'Cumulative %',data:cumData,
           borderColor:'#388bfd',backgroundColor:'transparent',tension:.3,pointRadius:4,spanGaps:true,yAxisID:'y1'},
          {type:'line',label:'80% line',data:pArr.map(function(){return 80;}),
           borderColor:'rgba(63,185,80,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,yAxisID:'y1'}
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{duration:200},
        plugins:{
          legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},
          tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,
            bodyFont:{family:"'DM Mono',monospace",size:10}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:8},maxRotation:35}},
          y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},
             ticks:{color:'#484f58',font:{size:9}},
             title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},
          y1:{position:'right',grid:{display:false},
              ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},
              min:0,max:100}
        }
      }
    });
  }

  // ── Render Top 10 UDT Sub-Categories Chart (horizontal bars) ──
  var ctx10=document.getElementById('dt-top10-chart');
  if(ctx10){
    if(charts['dt-top10']){try{charts['dt-top10'].destroy();}catch(e){}}
    charts['dt-top10']=new Chart(ctx10.getContext('2d'),{
      type:'bar',
      data:{
        labels: top10.map(function(r){
          var lbl = r.Plant+': '+r.SubCategory;
          return lbl.length>28 ? lbl.slice(0,28)+'…' : lbl;
        }),
        datasets:[{
          label:'UDT hrs',
          data: top10.map(function(r){return +r.UDT.toFixed(2);}),
          backgroundColor:'rgba(248,81,73,0.65)',
          borderRadius:3
        }]
      },
      options:{
        indexAxis:'y',
        responsive:true,maintainAspectRatio:false,animation:{duration:200},
        plugins:{
          legend:{display:false},
          tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,
            bodyFont:{family:"'DM Mono',monospace",size:10},
            callbacks:{label:function(ctx){return ctx.parsed.x.toFixed(2)+' hrs';}}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},
             title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},
          y:{grid:{display:false},ticks:{color:'#8b949e',font:{size:9}}}
        }
      }
    });
  }
}

function renderProduction(){
  renderForecast();
}

function renderForecast(){
  var ct=document.getElementById('content-production');
  if(!ct) return;

  if(!DATA.forecast){
    ct.innerHTML='<div class="no-data">⟳ Loading forecast data...</div>';
    gasGet('forecast').then(function(d){
      DATA.forecast=d;
      renderForecast();
    }).catch(function(e){
      ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';
    });
    return;
  }

  var rows = DATA.forecast.rows||[];
  var nat  = DATA.forecast.national||{};
  if(!rows.length){
    ct.innerHTML='<div class="no-data">No forecast data available</div>';
    return;
  }

  // ── Helpers ─────────────────────────────────────────────
  var TH='padding:7px 10px;background:var(--bg3);color:var(--text2);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;';
  var TD='padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap;';

  function fmt(n,d){
    if(!n&&n!==0) return '—';
    d=d===undefined?0:d;
    var abs=Math.abs(n);
    var sign=n<0?'-':'+';
    if(abs>=1000000) return (n<0?'-':'')+(abs/1000000).toFixed(2)+'M';
    if(abs>=1000)    return (n<0?'-':'')+(abs/1000).toFixed(1)+'k';
    return n.toFixed(d);
  }
  function fmtN(n){
    if(!n&&n!==0) return '—';
    var abs=Math.abs(n);
    if(abs>=1000000) return (n<0?'-':'')+(abs/1000000).toFixed(2)+'M';
    if(abs>=1000)    return (n<0?'-':'')+(abs/1000).toFixed(1)+'k';
    return String(n);
  }
  function clrVar(v){return v>=0?'var(--green-b)':'var(--red)';}
  function clrDays(v){return v>=0?'var(--green-b)':'var(--amber)';}

  var AREA_COLOR = {LUZON:'#388bfd',VISAYAS:'#3fb950',MINDANAO:'#f78166',NATIONAL:'#d2a8ff'};

  // ── National Scorecard ───────────────────────────────────
  function scCard(label, val, sub, valColor){
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:14px 12px;flex:1;min-width:0">'+
      '<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-family:DM Mono,monospace">'+label+'</div>'+
      '<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:700;color:'+(valColor||'var(--text1)')+';line-height:1">'+val+'</div>'+
      (sub?'<div style="font-size:10px;color:var(--text3);margin-top:4px">'+sub+'</div>':'')+
      '</div>';
  }

  var dueDate = nat.DueDate||rows[0].DueDate||'—';
  var mtdPct  = nat.MTDPct||(nat.Forecast>0?(nat.MTDPullout/nat.Forecast*100).toFixed(2)+'%':'—');

  var html='';

  // Top scorecard
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">CSD Forecast — National Overview</div><div class="sec-line"></div></div>'+
    '<div style="font-size:9px;color:var(--text3);font-family:DM Mono,monospace;margin-bottom:8px">Due Date: <b style="color:var(--amber)">'+dueDate+'</b></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto">'+
    scCard('Forecast',fmtN(nat.Forecast),'Target volume','var(--text1)')+
    scCard('MTD Pull-out',fmtN(nat.MTDPullout),mtdPct+' of forecast',nat.MTDPullout>0?'var(--green-b)':'var(--text2)')+
    scCard('Inventory',fmtN(nat.Inventory),'Current stock','var(--text1)')+
    scCard('Days Needed',nat.DaysNeeded!==undefined?nat.DaysNeeded.toFixed(1):'—','To meet forecast',clrDays(nat.DaysNeeded))+
    scCard('Remaining Days',nat.RemDays!==undefined?nat.RemDays.toFixed(1):'—','Days left',clrDays(nat.RemDays))+
    '</div></div>';

  // Area cards row
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">By Area</div><div class="sec-line"></div></div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">';

  var areas3 = rows.filter(function(r){return r.Area!=='NATIONAL';});
  areas3.forEach(function(r){
    var col = AREA_COLOR[r.Area]||'#8b949e';
    var pct = r.Forecast>0?(r.MTDPullout/r.Forecast*100).toFixed(1):'0';
    var barW = Math.min(parseFloat(pct),100);
    html+='<div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:var(--rl);padding:14px">'+
      '<div style="font-family:Barlow Condensed,sans-serif;font-size:16px;font-weight:700;color:'+col+';margin-bottom:10px">'+r.Area+'</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'+
      '<div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Forecast</div><div style="font-size:15px;font-weight:600">'+fmtN(r.Forecast)+'</div></div>'+
      '<div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">MTD Pull-out</div><div style="font-size:15px;font-weight:600;color:var(--green-b)">'+fmtN(r.MTDPullout)+'</div></div>'+
      '<div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Inventory</div><div style="font-size:15px;font-weight:600">'+fmtN(r.Inventory)+'</div></div>'+
      '<div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Open SO</div><div style="font-size:15px;font-weight:600">'+fmtN(r.OpenSO)+'</div></div>'+
      '</div>'+
      '<div style="margin-bottom:4px">'+
        '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:3px">'+
          '<span>MTD Progress</span><span>'+pct+'%</span>'+
        '</div>'+
        '<div style="height:4px;background:var(--border);border-radius:2px">'+
          '<div style="height:4px;width:'+barW+'%;background:'+col+';border-radius:2px;transition:width .5s"></div>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;margin-top:8px">'+
        '<div><div style="font-size:8px;color:var(--text3)">Days Needed</div><div style="font-size:13px;font-weight:600;color:'+clrDays(r.DaysNeeded)+'">'+(r.DaysNeeded!==undefined?r.DaysNeeded.toFixed(1):'—')+'</div></div>'+
        '<div><div style="font-size:8px;color:var(--text3)">Rem. Days</div><div style="font-size:13px;font-weight:600;color:'+clrDays(r.RemDays)+'">'+(r.RemDays!==undefined?r.RemDays.toFixed(1):'—')+'</div></div>'+
        '<div><div style="font-size:8px;color:var(--text3)">Vs Forecast</div><div style="font-size:13px;font-weight:600;color:'+clrVar(r.VsForecast)+'">'+fmtN(r.VsForecast)+'</div></div>'+
      '</div>'+
      '</div>';
  });

  html+='</div></div>';

  // Detail table
  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Full Detail Table</div><div class="sec-line"></div></div>'+
    '<div class="cc"><div class="tbl-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:900px">'+
    '<thead><tr>'+
    ['Area','Forecast','Open SO','MTD Pull-out','MTD %','Inventory','Prod Line-up','Total Output','Complete Feeds','In Transit','Vs Forecast','Days Needed','Rem. Days','Vs Pull-out'].map(function(h,i){
      var r = (i>=1&&i<=3)||(i>=5&&i<=13);
      return '<th style="'+TH+'text-align:'+(r?'right':'left')+'">'+h+'</th>';
    }).join('')+
    '</tr></thead><tbody>'+
    rows.map(function(r,idx){
      var col = AREA_COLOR[r.Area]||'#8b949e';
      var isNat = r.Area==='NATIONAL';
      var bg = isNat?'background:var(--bg3);border-top:2px solid var(--border2);font-weight:700;':
               (idx%2===0?'background:var(--bg1)':'background:var(--bg2)');
      function td(v,right,color){
        return '<td style="'+TD+'text-align:'+(right?'right':'left')+';'+(color?'color:'+color+';':'')+bg+'">'+v+'</td>';
      }
      return '<tr>'+
        td('<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+col+'"></span><b>'+r.Area+'</b></span>',false)+
        td(fmtN(Math.round(r.Forecast)),true)+
        td(fmtN(Math.round(r.OpenSO)),true)+
        td(fmtN(Math.round(r.MTDPullout)),true,'var(--green-b)')+
        td(r.MTDPct?(isNaN(parseFloat(r.MTDPct))?r.MTDPct:(parseFloat(r.MTDPct)<1?(parseFloat(r.MTDPct)*100).toFixed(2)+'%':r.MTDPct)):'—',true)+
        td(fmtN(Math.round(r.Inventory)),true)+
        td(fmtN(Math.round(r.ProdLineup)),true)+
        td(fmtN(Math.round(r.TotalOutput)),true)+
        td(fmtN(Math.round(r.CompFeeds)),true)+
        td(fmtN(Math.round(r.InTransit)),true)+
        td(fmtN(r.VsForecast),true,clrVar(r.VsForecast))+
        td(r.DaysNeeded!==undefined?r.DaysNeeded.toFixed(1):'—',true,clrDays(r.DaysNeeded))+
        td(r.RemDays!==undefined?r.RemDays.toFixed(1):'—',true,clrDays(r.RemDays))+
        td(fmtN(r.VsPullout),true,clrVar(r.VsPullout))+
        '</tr>';
    }).join('')+
    '</tbody></table></div></div></div>';


  // ── SECTION 2: Site Scorecards ──────────────────────────
  var siteRows = DATA.forecast.siteRows||[];
  var totalRow = DATA.forecast.totalRow||{};
  var speedVal = DATA.forecast.speedVal||0;
  var speedPct = DATA.forecast.speedPct||'—';

  // Region grouping
  var regions = {
    LUZON:    {color:'#388bfd', sites:['BULACAN','ISABELA']},
    VISAYAS:  {color:'#3fb950', sites:['HOREB','ARGAO','BACOLOD']},
    MINDANAO: {color:'#f78166', sites:['BUKID','DAVAO']}
  };

  function fmtSC(n){
    if(!n&&n!==0) return '—';
    var abs=Math.abs(n);
    if(abs>=1000000) return (n<0?'-':'')+(abs/1000000).toFixed(2)+'M';
    if(abs>=1000)    return (n<0?'-':'')+(abs/1000).toFixed(1)+'k';
    return Math.round(n).toLocaleString();
  }

  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Weekly Pull-out by Region & Site</div><div class="sec-line"></div></div>';
  html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">';

  Object.keys(regions).forEach(function(reg){
    var rc = regions[reg];
    html+='<div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid '+rc.color+';border-radius:var(--rl);padding:12px">';
    html+='<div style="font-family:Barlow Condensed,sans-serif;font-size:14px;font-weight:700;color:'+rc.color+';margin-bottom:10px;letter-spacing:1px">'+reg+'</div>';

    var regTotal = 0;
    rc.sites.forEach(function(site){
      var sr = siteRows.filter(function(r){return r.Area.toUpperCase()===site;})[0]||null;
      var pull = sr?sr.TotalPull:0;
      var tgt  = sr?sr.Target:0;
      regTotal += pull;
      var pct  = sr?sr.PctComp:'—';
      if(pct && !isNaN(parseFloat(pct)) && parseFloat(pct)<=1 && parseFloat(pct)>0){
        pct = (parseFloat(pct)*100).toFixed(0)+'%';
      }
      var pctNum = parseFloat(String(pct).replace('%',''))||0;
      var barW = Math.min(pctNum,100);
      var barColor = pctNum>=80?'var(--green-b)':pctNum>=50?'var(--amber)':'var(--red)';

      html+='<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">';
      html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
      html+='<span style="font-size:10px;font-weight:600;color:var(--text1)">'+site+'</span>';
      html+='<span style="font-size:9px;color:var(--text3)">Tgt: '+fmtSC(tgt)+'</span>';
      html+='</div>';
      html+='<div style="font-family:Barlow Condensed,sans-serif;font-size:22px;font-weight:700;color:var(--text1);line-height:1">'+fmtSC(pull)+'</div>';
      html+='<div style="font-size:9px;color:'+barColor+';font-family:DM Mono,monospace;margin:2px 0">'+pct+' completion</div>';
      html+='<div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px">';
      html+='<div style="height:3px;width:'+barW+'%;background:'+barColor+';border-radius:2px"></div>';
      html+='</div></div>';
    });
    // Region total
    html+='<div style="border-top:2px solid '+rc.color+';padding-top:8px;margin-top:2px">';
    html+='<div style="font-size:8px;color:'+rc.color+';text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">'+reg+' Total</div>';
    html+='<div style="font-family:Barlow Condensed,sans-serif;font-size:26px;font-weight:700;color:'+rc.color+';line-height:1">'+fmtSC(regTotal)+'</div>';
    html+='</div>';
    html+='</div>';
  });

  // Speed of the Week card
  // Convert speedPct from decimal to % if needed
  var spPctStr = String(speedPct||'');
  var spPctRaw = parseFloat(spPctStr.replace('%','').trim());
  if(!isNaN(spPctRaw) && spPctRaw > 0 && spPctRaw <= 1){
    spPctStr = (spPctRaw*100).toFixed(2)+'%';
  } else if(!isNaN(spPctRaw)){
    spPctStr = spPctRaw.toFixed(2)+'%';
  }
  var spPctNum = parseFloat(spPctStr)||0;
  var spColor = spPctNum>=80?'var(--green-b)':spPctNum>=50?'var(--amber)':'var(--red)';
  html+='<div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid var(--amber);border-radius:var(--rl);padding:14px;grid-column:1/-1">';
  html+='<div style="display:flex;align-items:center;gap:24px">';
  html+='<div>';
  html+='<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-family:DM Mono,monospace;margin-bottom:4px">⚡ Speed of the Week</div>';
  html+='<div style="font-family:Barlow Condensed,sans-serif;font-size:40px;font-weight:700;color:var(--amber);line-height:1">'+fmtSC(speedVal)+'<span style="font-size:14px;color:var(--text3);font-family:DM Mono,monospace;margin-left:4px">tons/day</span></div>';
  html+='<div style="font-size:12px;color:'+spColor+';font-family:DM Mono,monospace;margin-top:6px;font-weight:600">'+spPctStr+' completion</div>';
  html+='</div>';
  html+='</div></div>';
  html+='</div></div>';

  // ── SECTION 3: Daily Pull-out Table ─────────────────────
  var TH2='padding:7px 8px;background:var(--bg3);color:var(--text2);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right;';
  var TD2='padding:5px 8px;font-size:10px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;';

  function fmtN2(n){
    if(!n) return '—';
    return Math.round(n).toLocaleString();
  }
  function pctFmt(v){
    if(!v) return '—';
    var s=String(v).trim();
    var n=parseFloat(s.replace('%',''));
    if(isNaN(n)) return s;
    if(n>1) return n.toFixed(0)+'%';
    return (n*100).toFixed(0)+'%';
  }

  var weekLabel = 'Wk '+activeWeek;

  html+='<div class="sec"><div class="sec-hdr"><div class="sec-title">Daily Pull-out Detail — '+weekLabel+'</div><div class="sec-line"></div></div>';
  html+='<div class="cc"><div class="tbl-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:800px">';
  html+='<thead><tr>';
  html+='<th style="'+TH2+'text-align:left">Area</th>';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Total Pull-out','Target','%'].forEach(function(h){
    html+='<th style="'+TH2+'">'+h+'</th>';
  });
  html+='<th style="'+TH2+'text-align:left">Concerns / Remarks</th>';
  html+='</tr></thead><tbody>';

  // Region groups
  var regionOrder = [
    {name:'LUZON',    color:'#388bfd', sites:['BULACAN','ISABELA']},
    {name:'VISAYAS',  color:'#3fb950', sites:['HOREB','ARGAO','BACOLOD']},
    {name:'MINDANAO', color:'#f78166', sites:['BUKID','DAVAO']}
  ];

  regionOrder.forEach(function(reg){
    // Region header row
    html+='<tr><td colspan="12" style="padding:4px 8px;background:'+reg.color+'22;color:'+reg.color+';font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid var(--border)">'+reg.name+'</td></tr>';

    // Compute region daily totals
    var regDayTotals={Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0,TotalPull:0,Target:0};
    reg.sites.forEach(function(site){
      var sr=siteRows.filter(function(r){return r.Area.toUpperCase()===site;})[0]||null;
      if(!sr) return;
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','TotalPull','Target'].forEach(function(d){regDayTotals[d]+=(sr[d]||0);});
    });
    var regPct = regDayTotals.Target>0?(regDayTotals.TotalPull/regDayTotals.Target*100).toFixed(0)+'%':'—';
    var regPctN = parseFloat(regPct)||0;
    var regPctColor = regPctN>=80?'var(--green-b)':regPctN>=50?'var(--amber)':'var(--red)';

    reg.sites.forEach(function(site, si){
      var sr = siteRows.filter(function(r){return r.Area.toUpperCase()===site;})[0]||null;
      if(!sr) return;
      var bg = si%2===0?'background:var(--bg1)':'background:var(--bg2)';
      var pctV = pctFmt(sr.PctComp);
      var pctN = parseFloat(String(pctV).replace('%',''))||0;
      var pctColor = pctN>=80?'var(--green-b)':pctN>=50?'var(--amber)':'var(--red)';
      html+='<tr style="'+bg+'">';
      html+='<td style="'+TD2+'text-align:left;font-weight:600;padding-left:16px">'+sr.Area+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Mon)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Tue)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Wed)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Thu)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Fri)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Sat)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Sun)+'</td>';
      html+='<td style="'+TD2+'font-weight:600;color:var(--green-b)">'+fmtN2(sr.TotalPull)+'</td>';
      html+='<td style="'+TD2+'">'+fmtN2(sr.Target)+'</td>';
      html+='<td style="'+TD2+'color:'+pctColor+';font-weight:600;font-family:DM Mono,monospace">'+pctV+'</td>';
      html+='<td style="'+TD2+'text-align:left;color:var(--text3);font-size:9px;max-width:200px;white-space:normal">'+(sr.Concerns||'—')+'</td>';
      html+='</tr>';
    });

    // Region subtotal row
    html+='<tr style="background:'+reg.color+'11;border-top:1px solid '+reg.color+'44">';
    html+='<td style="'+TD2+'text-align:left;font-weight:700;color:'+reg.color+'">'+reg.name+' TOTAL</td>';
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d){
      html+='<td style="'+TD2+'font-weight:700;color:'+reg.color+'">'+fmtN2(regDayTotals[d])+'</td>';
    });
    html+='<td style="'+TD2+'font-weight:700;color:var(--green-b)">'+fmtN2(regDayTotals.TotalPull)+'</td>';
    html+='<td style="'+TD2+'font-weight:700">'+fmtN2(regDayTotals.Target)+'</td>';
    html+='<td style="'+TD2+'font-weight:700;color:'+regPctColor+';font-family:DM Mono,monospace">'+regPct+'</td>';
    html+='<td style="'+TD2+'"></td>';
    html+='</tr>';
  });

  // Total row
  if(totalRow){
    var tPct = pctFmt(totalRow.PctComp);
    var tPctN = parseFloat(String(tPct).replace('%',''))||0;
    var tColor = tPctN>=80?'var(--green-b)':tPctN>=50?'var(--amber)':'var(--red)';
    html+='<tr style="background:var(--bg3);border-top:2px solid var(--border2)">';
    html+='<td style="'+TD2+'text-align:left;font-weight:700">TOTAL</td>';
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d){
      html+='<td style="'+TD2+'font-weight:700">'+fmtN2(totalRow[d])+'</td>';
    });
    html+='<td style="'+TD2+'font-weight:700;color:var(--green-b)">'+fmtN2(totalRow.TotalPull)+'</td>';
    html+='<td style="'+TD2+'font-weight:700">'+fmtN2(totalRow.Target)+'</td>';
    html+='<td style="'+TD2+'font-weight:700;color:'+tColor+';font-family:DM Mono,monospace">'+tPct+'</td>';
    html+='<td style="'+TD2+'"></td>';
    html+='</tr>';
  }

  html+='</tbody></table></div></div></div>';

  ct.innerHTML = html;
}

function renderOEE(){
  var ct=document.getElementById('content-oee');
  ct.innerHTML='<div class="no-data">⟳ Loading...</div>';
  var MORD=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var SORD=['AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH','NATIONAL'];
  function nv(v){if(v===null||v===undefined||v==='')return null;var n=parseFloat(String(v).replace(/,/g,'').replace(/%/g,'').trim());return isNaN(n)?null:n;}
  function fN(v,d){if(v===null||v===undefined)return '\u2014';d=d===undefined?2:d;return Number(v).toLocaleString('en-PH',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function fPct(v){if(v===null||v===undefined)return '\u2014';var p=Math.abs(v)<1?v*100:v;return (p>=0?'+':'')+p.toFixed(2)+'%';}
  function fPHP(v){if(v===null||v===undefined)return '\u2014';return '\u20b1'+Number(v).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0});}
  function pc(v){if(v===null||v===undefined)return 'var(--text2)';var p=Math.abs(v)<1?v*100:v;return p<0?'var(--red)':'var(--green)';}
  gasGet('variance',{site:'',week:''}).then(function(d){
    var rows=d.rows||[];
    var months=d.months||[];
    if(!rows.length){ct.innerHTML='<div class="no-data">No variance data — redeploy GAS with getVariance()</div>';return;}
    var activeM=months[months.length-1]||'';
    var activeS='NATIONAL';
    var sites=[];
    SORD.forEach(function(s){if(rows.some(function(r){return (r.Plant||'').toUpperCase()===s;}))sites.push(s);});
    function getRow(s,m){return rows.find(function(r){return (r.Plant||'').toUpperCase()===s.toUpperCase()&&String(r.MONTH||'').trim().toUpperCase()===m.toUpperCase();})||null;}
    function sc(lbl,val,sub,col){
      return '<div style="background:var(--bg1);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:6px;padding:10px 12px;min-width:0">'
        +'<div style="font-size:8px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:4px">'+lbl+'</div>'
        +'<div style="font-size:18px;font-weight:700;color:'+col+';font-family:Cambria,serif">'+val+'</div>'
        +(sub?'<div style="font-size:8px;color:var(--text3);margin-top:2px">'+sub+'</div>':'')+'</div>';
    }
    function buildSC(r){
      if(!r)return '<div style="color:var(--text3);font-size:10px;padding:8px">No data</div>';
      var vp=nv(r['RM Variance, %']),wp=nv(r['RM Variance (w/o used sacks), %']),ap=nv(r['ABS RM Variance, %']);
      var sh=nv(r['Total Shrinkage, mt']),sv=nv(r['Shrinkage Value (Php)']);
      var gl=nv(r['Process Gain-Loss, %']);var gld=gl!==null?(Math.abs(gl)<1?gl*100:gl):null;
      var wq=nv(r['RM Variance (w/o used sacks), Qty']);
      var shCol=sh!==null?(sh<0?'var(--red)':'var(--green)'):'var(--amber)';
      var svCol=sv!==null?(sv<0?'var(--red)':'var(--green)'):'var(--amber)';
      return '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">'
        +sc('TOTAL INPUT (mt)',fN(nv(r['Total Plant Input, mt']),1),'','var(--blue)')
        +sc('SHRINKAGE %',(gld!==null?(gld>=0?'+':'')+gld.toFixed(2)+'%':'\u2014'),fN(sh,2)+' mt',shCol)
        +sc('SHRINKAGE (\u20b1)',fPHP(sv),'',svCol)
        +sc('RM VARIANCE %',fPct(vp),fN(nv(r['RM Variance, Qty']),2)+' mt',pc(vp))
        +sc('RM VARIANCE (\u20b1)',fPHP(nv(r['RM Variance, Php'])),'',pc(vp))
        +sc('ABS VARIANCE %',(ap!==null?(Math.abs(ap)<1?ap*100:ap).toFixed(2)+'%':'\u2014'),fN(nv(r['ABS RM Variance, Qty']),2)+' mt','var(--amber)')
        +sc('VAR % w/o SACKS',fPct(wp),fN(wq,2)+' mt',pc(wp))
        +'</div>';
    }
    function pill(id,label,active,onclick){
      return '<button id="'+id+'" onclick="'+onclick+'" style="padding:3px 11px;border-radius:12px;border:1px solid '+(active?'var(--blue)':'var(--border)')+';background:'+(active?'var(--blue)':'transparent')+';color:'+(active?'#fff':'var(--text2)')+';font-size:9px;cursor:pointer;font-weight:'+(active?700:400)+'">'+label+'</button>';
    }
    function buildSitePills(){
      return sites.map(function(s){return pill('vs-'+s,s,s===activeS,"window._vs('"+s+"')");}).join(' ');
    }
    function buildMonthPills(){
      var p=months.map(function(m){var sh=m.charAt(0)+m.slice(1,3).toLowerCase();return pill('vm-'+m,sh,m===activeM,"window._vm('"+m+"')");}).join(' ');
      p+=' '+pill('vm-ALL','ALL',activeM==='ALL',"window._vm('ALL')");
      return p;
    }
    var TH='padding:5px 8px;background:var(--navy);color:#fff;font-size:8.5px;font-weight:700;text-align:right;border-bottom:2px solid var(--border);white-space:nowrap;';
    var THl=TH+'text-align:left;';
    var TD='padding:4px 8px;font-size:8.5px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;';
    var TDl=TD+'text-align:left;font-weight:700;';
    function buildTable(fm){
      var flt=rows.filter(function(r){
        if(!r.Plant)return false;
        if(fm&&fm!=='ALL')return String(r.MONTH||'').trim().toUpperCase()===fm.toUpperCase();
        return true;
      });
      flt.sort(function(a,b){
        var ma=MORD.indexOf(String(a.MONTH||'').trim().toUpperCase()),mb=MORD.indexOf(String(b.MONTH||'').trim().toUpperCase());
        if(ma!==mb)return ma-mb;
        var ia=SORD.indexOf((a.Plant||'').toUpperCase()),ib=SORD.indexOf((b.Plant||'').toUpperCase());
        return (ia<0?99:ia)-(ib<0?99:ib);
      });
      if(!flt.length)return '<div style="color:var(--text3);padding:20px;text-align:center">No data for selected month</div>';
      var h='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>'
        +'<th style="'+THl+'">PLANT</th><th style="'+THl+'">MONTH</th>'
        +'<th style="'+TH+'">Total Input (mt)</th>'
        +'<th style="'+TH+'">Shrinkage (mt)</th>'
        +'<th style="'+TH+'">Process G/L %</th>'
        +'<th style="'+TH+'">Shrinkage (\u20b1)</th>'
        +'<th style="'+TH+'">RM Var Qty</th><th style="'+TH+'">RM Var %</th><th style="'+TH+'">RM Var (\u20b1)</th>'
        +'<th style="'+TH+'">ABS Qty</th><th style="'+TH+'">ABS %</th>'
        +'<th style="'+TH+'">w/o Sacks Qty</th><th style="'+TH+'">w/o Sacks %</th>'
        +'<th style="'+TH+'">Total Loss Qty</th><th style="'+TH+'">Total Loss %</th>'
        +'</tr></thead><tbody>';
      flt.forEach(function(r,i){
        var pl=(r.Plant||'').toUpperCase(),isN=pl==='NATIONAL';
        var bg=isN?'var(--navy)':(i%2===0?'var(--bg1)':'var(--bg2)');
        var ti=nv(r['Total Plant Input, mt']);
        var sh=nv(r['Total Shrinkage, mt']);
        var gl=nv(r['Process Gain-Loss, %']);var gld=gl!==null?(Math.abs(gl)<1?gl*100:gl):null;
        var sv=nv(r['Shrinkage Value (Php)']);
        var vq=nv(r['RM Variance, Qty']);
        var vp=nv(r['RM Variance, %']);
        var vph=nv(r['RM Variance, Php']);
        var aq=nv(r['ABS RM Variance, Qty']);
        var ap=nv(r['ABS RM Variance, %']);
        var wq=nv(r['RM Variance (w/o used sacks), Qty']);
        var wp=nv(r['RM Variance (w/o used sacks), %']);
        // Computed columns
        var tmlq=(sh!==null&&vq!==null)?sh+vq:null;
        var tmlp=(tmlq!==null&&ti&&ti!==0)?tmlq/ti*100:null;
        h+='<tr style="background:'+bg+'">'
          +'<td style="'+TDl+'color:'+(isN?'var(--sky)':'var(--blue)')+'">'+pl+'</td>'
          +'<td style="'+TDl+'color:var(--text2)">'+String(r.MONTH||'')+'</td>'
          +'<td style="'+TD+'">'+fN(ti,1)+'</td>'
          +'<td style="'+TD+';color:'+(sh!==null?(sh<0?'var(--red)':'var(--green)'):'var(--text2)')+'">'+fN(sh,2)+'</td>'
          +'<td style="'+TD+';color:'+(gld!==null?(gld<0?'var(--red)':'var(--green)'):'var(--text2)')+';font-weight:700">'+(gld!==null?(gld>=0?'+':'')+gld.toFixed(2)+'%':'\u2014')+'</td>'
          +'<td style="'+TD+';color:'+(sv!==null?(sv<0?'var(--red)':'var(--green)'):'var(--text2)')+'">'+fPHP(sv)+'</td>'
          +'<td style="'+TD+'">'+fN(vq,2)+'</td>'
          +'<td style="'+TD+';font-weight:700;color:'+pc(vp)+'">'+fPct(vp)+'</td>'
          +'<td style="'+TD+';color:'+pc(vp)+'">'+fPHP(vph)+'</td>'
          +'<td style="'+TD+'">'+fN(aq,2)+'</td>'
          +'<td style="'+TD+';color:var(--amber);font-weight:700">'+(ap!==null?(Math.abs(ap)<1?ap*100:ap).toFixed(2)+'%':'\u2014')+'</td>'
          +'<td style="'+TD+'">'+fN(wq,2)+'</td>'
          +'<td style="'+TD+';font-weight:700;color:'+pc(wp)+'">'+fPct(wp)+'</td>'
          +'<td style="'+TD+';font-weight:700;color:'+(tmlq!==null?(tmlq<0?'var(--red)':'var(--green)'):'var(--text2)')+'">'+fN(tmlq,2)+'</td>'
          +'<td style="'+TD+';font-weight:700;color:'+(tmlp!==null?(tmlp<0?'var(--red)':'var(--green)'):'var(--text2)')+'">'+(tmlp!==null?(tmlp>=0?'+':'')+tmlp.toFixed(2)+'%':'\u2014')+'</td>'
          +'</tr>';
      });
      return h+'</tbody></table></div>';
    }
    function updatePills(){
      sites.forEach(function(s){var b=document.getElementById('vs-'+s);if(!b)return;var a=s===activeS;b.style.background=a?'var(--blue)':'transparent';b.style.borderColor=a?'var(--blue)':'var(--border)';b.style.color=a?'#fff':'var(--text2)';b.style.fontWeight=a?700:400;});
      months.forEach(function(m){var b=document.getElementById('vm-'+m);if(!b)return;var a=m===activeM;b.style.background=a?'var(--blue)':'transparent';b.style.borderColor=a?'var(--blue)':'var(--border)';b.style.color=a?'#fff':'var(--text2)';b.style.fontWeight=a?700:400;});
      var ba=document.getElementById('vm-ALL');if(ba){var a=activeM==='ALL';ba.style.background=a?'var(--blue)':'transparent';ba.style.borderColor=a?'var(--blue)':'var(--border)';ba.style.color=a?'#fff':'var(--text2)';}
    }
    function refresh(){
      var m=activeM==='ALL'?months[months.length-1]:activeM;
      document.getElementById('oee-sc').innerHTML=buildSC(getRow(activeS,m));
      document.getElementById('oee-tbl').innerHTML=buildTable(activeM);
      var och=document.getElementById('oee-ch');if(och)och.innerHTML=buildCharts(activeM);
      var oan=document.getElementById('oee-an');if(oan)oan.innerHTML=buildAnalysis(activeM);
      setTimeout(initVarCharts,100);
      updatePills();
    }
function buildCharts(fm){
      var m=fm==='ALL'?months[months.length-1]:fm;
      var cS=sites.filter(function(s){return s!=='NATIONAL';});
      var sQ=[],sP=[],vQ=[],vP=[];
      cS.forEach(function(s){
        var r=getRow(s,m)||{};
        var sh=nv(r['Total Shrinkage, mt'])||0;
        var gl=nv(r['Process Gain-Loss, %'])||0;var gld=+(Math.abs(gl)<1?gl*100:gl).toFixed(3);
        var vq=nv(r['RM Variance, Qty'])||0;
        var vp=nv(r['RM Variance, %'])||0;var vpd=+(Math.abs(vp)<1?vp*100:vp).toFixed(3);
        sQ.push(sh);sP.push(gld);vQ.push(vq);vP.push(vpd);
      });
      window._vchD={labels:cS,sQ:sQ,sP:sP,vQ:vQ,vP:vP};
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">'
        +'<div style="background:var(--bg1);border:1px solid var(--border);border-radius:8px;padding:12px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:8px">SHRINKAGE \u2014 Qty (bars) \u00b7 Process G/L% (line) \u00b7 '+m+'</div>'
        +'<canvas id="vch-sh" style="max-height:200px"></canvas></div>'
        +'<div style="background:var(--bg1);border:1px solid var(--border);border-radius:8px;padding:12px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--text1);margin-bottom:8px">RM VARIANCE \u2014 Qty (bars) \u00b7 Variance% (line) \u00b7 '+m+'</div>'
        +'<canvas id="vch-vr" style="max-height:200px"></canvas></div></div>';
    }
    function initVarCharts(){
      var d=window._vchD;if(!d)return;
      if(window._vc1){try{window._vc1.destroy();}catch(ex){}}
      if(window._vc2){try{window._vc2.destroy();}catch(ex){}}
      var gc='rgba(255,255,255,0.06)',ta={grid:{color:gc},ticks:{color:'#5a6270',font:{size:9}}};
      var c1=document.getElementById('vch-sh');
      if(c1)window._vc1=new Chart(c1.getContext('2d'),{type:'bar',data:{labels:d.labels,datasets:[
        {label:'Shrinkage mt',data:d.sQ,backgroundColor:d.sQ.map(function(v){return v<0?'rgba(183,28,28,0.7)':'rgba(27,94,32,0.7)';}),yAxisID:'y'},
        {label:'Process G/L %',data:d.sP,type:'line',borderColor:'#F4A300',pointBackgroundColor:'#F4A300',borderWidth:2,pointRadius:4,fill:false,yAxisID:'y1'}
      ]},options:{responsive:true,plugins:{legend:{labels:{color:'#888',font:{size:9}}}},scales:{x:ta,y:Object.assign({},ta,{title:{display:true,text:'mt',color:'#888',font:{size:8}}}),y1:{position:'right',ticks:{color:'#F4A300',font:{size:9}},grid:{drawOnChartArea:false},title:{display:true,text:'%',color:'#F4A300',font:{size:8}}}}}});
      var c2=document.getElementById('vch-vr');
      if(c2)window._vc2=new Chart(c2.getContext('2d'),{type:'bar',data:{labels:d.labels,datasets:[
        {label:'RM Var qty',data:d.vQ,backgroundColor:d.vQ.map(function(v){return v<0?'rgba(183,28,28,0.7)':'rgba(27,94,32,0.7)';}),yAxisID:'y'},
        {label:'RM Var %',data:d.vP,type:'line',borderColor:'#2979C8',pointBackgroundColor:'#2979C8',borderWidth:2,pointRadius:4,fill:false,yAxisID:'y1'}
      ]},options:{responsive:true,plugins:{legend:{labels:{color:'#888',font:{size:9}}}},scales:{x:ta,y:Object.assign({},ta,{title:{display:true,text:'mt',color:'#888',font:{size:8}}}),y1:{position:'right',ticks:{color:'#2979C8',font:{size:9}},grid:{drawOnChartArea:false},title:{display:true,text:'%',color:'#2979C8',font:{size:8}}}}}});
    }
    function buildAnalysis(fm){
      var m=fm==='ALL'?months[months.length-1]:fm;
      var nat=getRow('NATIONAL',m)||{};
      var sh=nv(nat['Total Shrinkage, mt'])||0;
      var ti=nv(nat['Total Plant Input, mt'])||1;
      var vq=nv(nat['RM Variance, Qty'])||0;
      var vp=nv(nat['RM Variance, %'])||0;var vpd=Math.abs(vp)<1?vp*100:vp;
      var wp=nv(nat['RM Variance (w/o used sacks), %'])||0;var wpd=Math.abs(wp)<1?wp*100:wp;
      var tml=sh+vq;var tmlp=tml/ti*100;
      var verdict=tmlp<-1.5?'\uD83D\uDD34 CRITICAL \u2014 Total material loss exceeds 1.5% of input. Multi-site investigation required.':
                  tmlp<-0.5?'\uD83D\uDFE0 ELEVATED \u2014 Material loss above threshold. Action plan required from Site Managers.':
                  tmlp<0?'\uD83D\uDFE1 MONITOR \u2014 Negative variance within tolerable range. Continue monitoring.':
                  '\uD83D\uDFE2 FAVORABLE \u2014 Positive or neutral variance. Maintain current controls.';
      var ins=[];
      if(Math.abs(sh)>30) ins.push('National shrinkage of '+fN(sh,2)+' mt in '+m+' is significant \u2014 review storage handling, moisture loss, and physical inventory accuracy.');
      if(vpd<-1) ins.push('RM Variance of '+vpd.toFixed(2)+'% is below the \u22121% alert level \u2014 investigate incoming RM quality, formulation adherence, and SAP posting accuracy.');
      else if(vpd<0) ins.push('RM Variance of '+vpd.toFixed(2)+'% is within range but negative \u2014 monitor to prevent breach of the \u22121% threshold.');
      if(wpd<vpd-0.3) ins.push('Gap between gross variance ('+vpd.toFixed(2)+'%) and w/o sacks ('+wpd.toFixed(2)+'%) \u2014 used sack postings need standardization across sites.');
      if(Math.abs(tmlp)>1) ins.push('Total material loss of '+tmlp.toFixed(2)+'% of input is a meaningful yield gap vs. standard.');
      if(!ins.length) ins.push('All material loss indicators are within acceptable parameters for '+m+'. No escalation required.');
      var acts=['Verify SAP RM issuance vs. physical consumption logs for sites with variance > \u22120.5%.',
        'Conduct surprise physical inventory at top-variance sites to confirm book vs. actual stock.',
        'Review batching and mixing accuracy \u2014 process gain/loss deviations often indicate weighing errors.',
        'Standardize used sack weighing and posting across all sites for consistent variance reporting.',
        'Cross-reference RM variance with rejection data \u2014 high rejection amplifies material loss figures.'];
      return '<div style="background:var(--bg1);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:16px">'
        +'<div style="font-size:12px;font-weight:700;color:var(--text1);margin-bottom:10px">ANALYSIS & RECOMMENDATIONS \u2014 NATIONAL \u00b7 '+m+'</div>'
        +'<div style="background:var(--bg2);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:11px;font-weight:700;color:var(--text1)">'+verdict+'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
        +'<div><div style="font-size:9px;font-weight:700;color:var(--sky);margin-bottom:6px;letter-spacing:.5px">KEY INSIGHTS</div><ul style="margin:0;padding-left:16px">'+ins.map(function(i){return '<li style="font-size:10px;color:var(--text2);margin-bottom:5px;line-height:1.5">'+i+'</li>';}).join('')+'</ul></div>'
        +'<div><div style="font-size:9px;font-weight:700;color:var(--sky);margin-bottom:6px;letter-spacing:.5px">RECOMMENDED ACTIONS</div><ol style="margin:0;padding-left:16px">'+acts.map(function(a){return '<li style="font-size:10px;color:var(--text2);margin-bottom:5px;line-height:1.5">'+a+'</li>';}).join('')+'</ol></div>'
        +'</div></div>';
    }
    window._vs=function(s){activeS=s;refresh();};
    window._vm=function(m){activeM=m;refresh();};
    ct.innerHTML='<div style="padding:12px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      +'<div style="font-size:18px;font-weight:700;color:var(--text1)">RM VARIANCE ANALYSIS</div>'
      +'<div style="font-size:10px;color:var(--sky);font-weight:700">'+activeM+' 2026 \u00b7 '+activeS+'</div>'
      +'</div>'
      +'<div style="margin-bottom:8px"><span style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-right:8px">SITE</span>'+buildSitePills()+'</div>'
      +'<div id="oee-sc" style="margin-bottom:12px">'+buildSC(getRow(activeS,activeM))+'</div>'
      +'<div style="margin-bottom:8px"><span style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-right:8px">MONTH</span>'+buildMonthPills()+'</div>'
      +'<div id="oee-tbl">'+buildTable(activeM)+'</div>'
      +'<div id="oee-ch">'+buildCharts(activeM)+'</div>'
      +'<div id="oee-an">'+buildAnalysis(activeM)+'</div>'
      +'</div>';
    setTimeout(initVarCharts,100);
  }).catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';});
}
function renderCostAnalytics(){var ct=document.getElementById('content-cost_analytics');ct.innerHTML='<div class="no-data">Cost Analytics tab</div>';}
function renderQualityEnergy(){var ct=document.getElementById('content-quality_energy');ct.innerHTML='<div class="no-data">Quality & Energy tab</div>';}

// ── START ──────────────────────────────────────────────────
loadData(false);
