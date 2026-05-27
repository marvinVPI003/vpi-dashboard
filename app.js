const GAS = 'https://script.google.com/macros/s/AKfycbznHnsf5gs6NT5Ps4s7PDj1HlbXRjcCF8F0713Q752pGBlBZwPvDVY0Y2zeX2w_5qgrEQ/exec';
const SITES = ['NATIONAL','AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const PROD_SITES = ['AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const SL = {NATIONAL:'National',AC:'AC · Bulacan',PFMIS:'PFMIS · Isabela',HOREB:'Horeb · Cebu',BUKID:'Bukidnon',ARGAO:'Argao · Cebu',CCPC:'CCPC · CDO',SOUTH:'South · Davao'};
const SC = {NATIONAL:'#3fb950',AC:'#388bfd',PFMIS:'#d29922',HOREB:'#1abc9c',BUKID:'#f85149',ARGAO:'#a371f7',CCPC:'#58a6ff',SOUTH:'#ffa657'};
const WEEKLY_TARGET = {AC:1375,PFMIS:1000,HOREB:875,BUKID:1750,CCPC:125,ARGAO:875,SOUTH:1000,NATIONAL:7000};
const DAILY_TARGET  = {AC:230,PFMIS:165,HOREB:145,BUKID:290,CCPC:20,ARGAO:145,SOUTH:165,NATIONAL:1160};
const LIMITS = {UDT_PCT:5,KWH_TON:35,FUEL_TON:3.5,COAL_TON:12};
const DT_CATS = {'Mechanical':'cat-mech','Electrical':'cat-elec','PLC':'cat-elec','Process':'cat-proc','Warehouse':'cat-proc','Raw Materials':'cat-rm','Change Over':'cat-co','Change Die':'cat-co','Change Screen':'cat-co','Power Interruption':'cat-pwr'};

let DATA={}, activeSite='NATIONAL', activeWeek=1, activePage='dashboard', charts={}, refreshTimer=null;

// ── JSONP FETCH ────────────────────────────────────────────
function gasGet(tab, extra) {
  return new Promise(function(resolve, reject) {
    var cb = 'vpi' + Date.now() + Math.floor(Math.random()*1000);
    var p = 'tab='+encodeURIComponent(tab)
      +'&site='+encodeURIComponent(activeSite)
      +'&week='+encodeURIComponent(activeWeek)
      +'&callback='+cb;
    if(extra) Object.keys(extra).forEach(function(k){
      p += '&'+encodeURIComponent(k)+'='+encodeURIComponent(extra[k]);
    });
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function(){
      if(done) return; done=true;
      try{document.head.removeChild(s);}catch(e){}
      delete window[cb];
      reject(new Error('Timeout for tab:'+tab));
    }, 30000);
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
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    hideLoading();
    buildNav();
    try{render();}catch(re){console.error('Render error:',re);}
    scheduleRefresh();
    // Background loads
    ['downtime','cost','production','oee','cost_analytics','quality_energy'].forEach(function(tab){
      gasGet(tab).then(function(d){DATA[tab]=d;}).catch(function(){});
    });
    // Preload daily for all sites
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
        '<div style="font-size:11px;color:var(--text2);font-family:DM Mono,monospace;max-width:380px;text-align:center;line-height:1.8">'+err.message+'</div>'+
        '<button onclick="loadData(false)" style="padding:8px 20px;font-size:11px;font-family:DM Mono,monospace;border:1px solid var(--red);border-radius:4px;background:none;color:var(--red);cursor:pointer;margin-top:8px">⟳ Retry</button>';
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
function setSite(s){activeSite=s;buildNav();render();}
function setWeek(w){activeWeek=+w;buildNav();render();}

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

  // KPIs
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

  // National Scorecard
  var scorecard='';
  if(activeSite==='NATIONAL'){
    scorecard='<div class="sec"><div class="sec-hdr"><div class="sec-title">National Scorecard — Week '+activeWeek+'</div><div class="sec-line"></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">'
      +PROD_SITES.map(function(s){
        var sr=wkRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===s;});
        // Try AM column, fallback to CF+MG+VT+RP if AM=0
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

  // Build main HTML
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

  // Row 2 KPIs
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
  +'</div></div>'

  // Site detail table
  +'<div class="sec"><div class="sec-hdr"><div class="sec-title">'+(activeSite==='NATIONAL'?'Site Summary — Week '+activeWeek:SL[activeSite]+' · Daily Detail — Week '+activeWeek)+'</div><div class="sec-line"></div></div>'
  +'<div class="cc" id="detail-table-wrap">'
  +(activeSite==='NATIONAL'?buildNatTable(wkRows):'<div class="no-data" style="padding:20px">⟳ Loading daily data...</div>')
  +'</div></div>';

  ct.className='content fade';

  // Load daily for specific site
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

  // Charts
  var ptC=function(v,lim){if(!v)return 'rgba(139,148,158,0.4)';return v>lim?'#f85149':v>lim*0.9?'#d29922':'#3fb950';};
  var setBadge=function(id,val,lim,unit){
    var el=document.getElementById(id);if(!el)return;
    var over=val>lim,near=val>lim*0.9;
    el.textContent=(over?'▲ ':near?'◉ ':'▼ ')+val.toFixed(2)+unit+(over?' over':near?' near':' ok');
    el.style.cssText='font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px;background:'+(over?'rgba(248,81,73,0.15)':near?'rgba(210,153,34,0.15)':'rgba(46,160,67,0.15)')+';color:'+(over?'#f85149':near?'#d29922':'#3fb950')+';border:1px solid '+(over?'rgba(248,81,73,0.3)':near?'rgba(210,153,34,0.3)':'rgba(46,160,67,0.3)')+';';
  };

  // Weekly output chart
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

  // Daily output chart
  buildDailyChart();

  // KPI rows for trend charts
  var kpiWkRows=activeSite==='NATIONAL'?rows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()==='NATIONAL';}):rows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===activeSite;});
  var perWk=function(field){return allWeeks.map(function(w){var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});return r?+gf(r,field).toFixed(2):null;});};

  // UDT Combo
  var udtHrs=perWk('Unscheduled Down Time, hr');
  var udtPct=allWeeks.map(function(w){var r=kpiWkRows.find(function(x){return +(x.Week||x.week||0)===+w;});if(!r)return null;var p=gf(r,'Unscheduled Down Time, %','Total Downtime Rate, %');return p>1?+p.toFixed(2):+(p*100).toFixed(2);});
  setBadge('udt-status',udtPct.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.UDT_PCT,'%');
  var udtCanvas=document.getElementById('c-udt-combo');
  if(udtCanvas){charts['c-udt-combo']=new Chart(udtCanvas.getContext('2d'),{data:{labels:lbl,datasets:[
    {type:'bar',label:'UDT Hours',data:udtHrs,backgroundColor:udtHrs.map(function(v){return v>0?'rgba(248,81,73,0.6)':'rgba(56,139,253,0.3)';}),borderRadius:3,yAxisID:'y'},
    {type:'line',label:'UDT %',data:udtPct,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:udtPct.map(function(v){return ptC(v,LIMITS.UDT_PCT);}),spanGaps:true,yAxisID:'y1'},
    {type:'line',label:'5% Limit',data:allWeeks.map(function(){return LIMITS.UDT_PCT;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y1'}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}}}}}}); }

  // kWh
  var kwhData=perWk('kWh/ton');
  setBadge('kwh-status',kwhData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.KWH_TON,' kWh/t');
  mkChart('c-kwh-trend','line',lbl,[
    {label:'kWh/ton',data:kwhData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:kwhData.map(function(v){return ptC(v,LIMITS.KWH_TON);})},
    {label:'Limit 35',data:allWeeks.map(function(){return LIMITS.KWH_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});

  // Fuel
  var fuelData=perWk('Li/ton');
  setBadge('fuel-status',fuelData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.FUEL_TON,' L/t');
  mkChart('c-fuel-trend','line',lbl,[
    {label:'L/ton',data:fuelData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:fuelData.map(function(v){return ptC(v,LIMITS.FUEL_TON);})},
    {label:'Limit 3.5',data:allWeeks.map(function(){return LIMITS.FUEL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});

  // Coal
  var coalData=perWk('kg/ton');
  setBadge('coal-status',coalData.filter(function(v){return v!==null;}).slice(-1)[0]||0,LIMITS.COAL_TON,' kg/t');
  mkChart('c-coal-trend','line',lbl,[
    {label:'kg/ton',data:coalData,borderColor:'#8b949e',backgroundColor:'rgba(139,148,158,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:coalData.map(function(v){return ptC(v,LIMITS.COAL_TON);})},
    {label:'Limit 12',data:allWeeks.map(function(){return LIMITS.COAL_TON;}),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});
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
    // Retry up to 5 times every 2s
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
  return '<div class="tbl-wrap"><table><thead><tr><th>Site</th><th>Output mt</th><th>PDR t/day</th><th>Cap Util%</th><th>SDT Hr</th><th>UDT Hr</th><th>OEE%</th><th>kWh/ton</th><th>Fuel L/ton</th><th>Coal kg/ton</th><th>RM Var%</th><th>RM Var w/o Sacks%</th></tr></thead><tbody>'
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
      +'</tr>';
  }).join('')+'</tbody></table></div>';
}

// ── OTHER TABS (stubs) ─────────────────────────────────────
// ── MONTHLY STATE ─────────────────────────────────────────
var activeMonth='';
var _monthsList=[];
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
  var months=DATA.monthly.months||[];
  if(!activeMonth||months.indexOf(activeMonth)<0) activeMonth=months[months.length-1]||'';

  // Filter rows for active month
  var mRows=rows.filter(function(r){return String(r.MONTH||r.Month||'').trim()===activeMonth;});

  // Build month pill strip
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

  // National scorecard — 7 site cards
  var scorecard='<div class="sec"><div class="sec-hdr"><div class="sec-title">National Scorecard — '+activeMonth+'</div><div class="sec-line"></div></div>'
    +'<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">'
    +PROD_SITES.map(function(s){
      var sr=mRows.filter(function(r){return (r.Plant||r.plant||'').toUpperCase()===s;});
      var out=siteOut(sr,s);
      var cf=sr.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt');},0);
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

  // National KPI cards
  var natR2=mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';});
  // Output from col AR = Total Plant Output,mt
  var mOut=natR2.reduce(function(a,r){return a+gf(r,'Total Plant Output,mt');},0);
  // Badges: CF(AU), MG(AW), Mash(AX-Argao only), VT(BE), RP(EX)
  var mCF=natR2.reduce(function(a,r){return a+gf(r,'COMPLETE FEEDS, mt','COMPLETE FEEDS,mt');},0);
  var mMG=natR2.reduce(function(a,r){return a+gf(r,'Mixgrain');},0);
  var mVT=natR2.reduce(function(a,r){return a+gf(r,'Vietop');},0);
  var mRP=natR2.reduce(function(a,r){return a+gf(r,'Total Repack (MG+CF), mt');},0);
  var mMS=mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='ARGAO';}).reduce(function(a,r){return a+gf(r,'Mash','Mash,mt');},0);
  // Cap Util from col BP
  var cuRN=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'Capacity Utilization Rate,%','Capacity Utilization,%');},0)/natR2.length:0;
  var mCU=cuRN>1?cuRN:cuRN*100;
  // OEE from col DA
  var oeeRN=natR2.length?natR2.reduce(function(a,r){return a+gf(r,'OEE');},0)/natR2.length:0;
  var mOEE=oeeRN>1?oeeRN:oeeRN*100;
  // UDT from col J, SDT from col H
  var mUDT=natR2.reduce(function(a,r){return a+gf(r,'Unscheduled Down Time, hr','Unscheduled Downtime, hr','UDT, hr');},0);
  var mSDT=natR2.reduce(function(a,r){return a+gf(r,'Scheduled Down Time, hr','SDT, hr');},0);
  // PDR from col BL
  var mPDR=natR2.reduce(function(a,r){return a+gf(r,'Plant Daily Pelleting Rate,ton/day','Plant Daily Rate, ton/day');},0);
  var cuC2=mCU>=80?'var(--green-b)':mCU>=60?'var(--amber)':'var(--red)';
  var oeeC2=mOEE>=85?'var(--green-b)':mOEE>=70?'var(--amber)':'var(--red)';
  var udtC2=mUDT>80?'var(--red)':mUDT>40?'var(--amber)':'var(--text)';

  var kpiCards='<div class="sec"><div class="sec-hdr"><div class="sec-title">National · '+activeMonth+'</div><div class="sec-line"></div></div>'
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
  // Convert if stored as decimal
  var mRMVpct=Math.abs(mRMV)>1?mRMV:mRMV*100;
  var mRMVWSpct=Math.abs(mRMVWS)>1?mRMVWS:mRMVWS*100;

  var kpiCards2='<div class="g5" style="margin-top:8px">'
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
    +'<div class="kc-val" style="font-size:20px;color:'+(mRMVWSpct<0?'var(--red)':'var(--green-b)')+'">'+(mRMVWS!==0?(mRMVWSpct>=0?'+':'')+mRMVWSpct.toFixed(3)+'%':'—')+'</div>'
    +'</div></div>';

  ct.innerHTML=scorecard+kpiCards+kpiCards2;
}
function renderCost(){var ct=document.getElementById('content-cost');if(!DATA.cost){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('cost').then(function(d){DATA.cost=d;renderCost();}).catch(function(e){ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>';});return;}ct.innerHTML='<div class="no-data">Cost data loaded — '+( DATA.cost.rows||[]).length+' rows</div>';}
function renderDowntime(){var ct=document.getElementById('content-downtime');if(!DATA.downtime){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('downtime').then(function(d){DATA.downtime=d;renderDowntime();}).catch(function(e){ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>';});return;}var d=DATA.downtime;var rows=d.rows||[];var byReason=d.byReason||{};var reasons=Object.entries(byReason).sort(function(a,b){return b[1]-a[1];});ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Downtime</div><div class="sec-line"></div></div><div class="g2"><div class="cc"><div class="cc-title">By Category</div>'+reasons.slice(0,10).map(function(e){var max=reasons[0]?reasons[0][1]:1;return '<div class="mbar-row"><div class="mbar-lbl">'+e[0].slice(0,18)+'</div><div class="mbar-bg"><div class="mbar-fill" style="width:'+(e[1]/max*100).toFixed(0)+'%;background:var(--red)"></div></div><div class="mbar-val">'+e[1].toFixed(1)+'h</div></div>';}).join('')+'</div><div class="cc"><div class="cc-title">Records</div><div class="tbl-wrap"><table><thead><tr><th style="text-align:left">Plant</th><th style="text-align:left">Category</th><th>UDT hr</th></tr></thead><tbody>'+rows.slice(0,30).map(function(r){var s=(r.Plant||'').toUpperCase();return '<tr><td>'+dot(s)+s+'</td><td><span class="cat-pill '+(DT_CATS[r.Category||'']||'cat-other')+'">'+(r.Category||'—')+'</span></td><td class="tr">'+(r['Unscheduled Down Time, hr']||0).toFixed(2)+'</td></tr>';}).join('')+'</tbody></table></div></div></div></div>';}
function renderProduction(){var ct=document.getElementById('content-production');ct.innerHTML='<div class="no-data">Production tab</div>';}
function renderOEE(){var ct=document.getElementById('content-oee');ct.innerHTML='<div class="no-data">OEE tab</div>';}
function renderCostAnalytics(){var ct=document.getElementById('content-cost_analytics');ct.innerHTML='<div class="no-data">Cost Analytics tab</div>';}
function renderQualityEnergy(){var ct=document.getElementById('content-quality_energy');ct.innerHTML='<div class="no-data">Quality & Energy tab</div>';}

// ── START ──────────────────────────────────────────────────
loadData(false);
