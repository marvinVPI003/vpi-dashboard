const GAS = 'https://script.google.com/macros/s/AKfycbznHnsf5gs6NT5Ps4s7PDj1HlbXRjcCF8F0713Q752pGBlBZwPvDVY0Y2zeX2w_5qgrEQ/exec';
const SITES = ['NATIONAL','AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const PROD_SITES = ['AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH'];
const WEEKLY_TARGET = {AC:1375,PFMIS:1000,HOREB:875,BUKID:1750,CCPC:125,ARGAO:875,SOUTH:1000,NATIONAL:7000};
const DAILY_TARGET  = {AC:230,PFMIS:165,HOREB:145,BUKID:290,CCPC:20,ARGAO:145,SOUTH:165,NATIONAL:1160};
const LIMITS = {UDT_PCT:5, KWH_TON:35, FUEL_TON:3.5, COAL_TON:12};
const SL = {NATIONAL:'National',AC:'AC · Bulacan',PFMIS:'PFMIS · Isabela',HOREB:'Horeb · Cebu',BUKID:'Bukidnon',ARGAO:'Argao · Cebu',CCPC:'CCPC · CDO',SOUTH:'South · Davao'};
const SC = {NATIONAL:'#3fb950',AC:'#388bfd',PFMIS:'#d29922',HOREB:'#1abc9c',BUKID:'#f85149',ARGAO:'#a371f7',CCPC:'#58a6ff',SOUTH:'#ffa657'};
const DT_CATS = {'Mechanical':'cat-mech','Electrical':'cat-elec','PLC':'cat-elec','Process':'cat-proc','Warehouse':'cat-proc','Raw Materials':'cat-rm','Change Over':'cat-co','Change Die':'cat-co','Change Screen':'cat-co','Power Interruption':'cat-pwr'};
let DATA = {}, activeSite='NATIONAL', activeWeek=1, activePage='dashboard', charts={}, refreshTimer=null;
// ── FETCH ──────────────────────────────────────────────────
// Fetch via iframe proxy — handles GAS redirect to googleusercontent.com
function gasGet(tab, extra) {
  return new Promise(function(resolve, reject) {
    var cb = 'vpi' + Date.now();
    var p = 'tab='+encodeURIComponent(tab)
      +'&site='+encodeURIComponent(activeSite)
      +'&week='+encodeURIComponent(activeWeek)
      +'&callback='+cb;
    if(extra) {
      Object.keys(extra).forEach(function(k){
        p += '&'+encodeURIComponent(k)+'='+encodeURIComponent(extra[k]);
      });
    }
    var s = document.createElement('script');
    var timer = setTimeout(function(){
      cleanup(); reject(new Error('Timeout'));
    }, 30000);
    function cleanup(){
      clearTimeout(timer);
      try{ document.head.removeChild(s); }catch(e){}
      delete window[cb];
    }
    window[cb] = function(data){
      cleanup();
      if(data && data.error) reject(new Error(data.error));
      else resolve(data);
    };
    s.onerror = function(){ cleanup(); reject(new Error('Load error')); };
    s.src = GAS + '?' + p;
    document.head.appendChild(s);
  });
}) {
  var params = {tab:tab, site:activeSite, week:activeWeek};
  if(extra) Object.keys(extra).forEach(function(k){ params[k]=extra[k]; });
  var qs = Object.keys(params).map(function(k){
    return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
  }).join('&');
  var url = GAS + '?' + qs;

  // Edge can fetch GAS directly (confirmed working)
  return fetch(url)
    .then(function(r){ return r.text(); })
    .then(function(text){
      // GAS returns JSON directly
      var d = JSON.parse(text);
      if(d && d.error) throw new Error(d.error);
      return d;
    });
}) {
  var params = {tab:tab, site:activeSite, week:activeWeek};
  if(extra) Object.keys(extra).forEach(function(k){ params[k]=extra[k]; });
  var qs = Object.keys(params).map(function(k){
    return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
  }).join('&');
  var url = GAS + '?' + qs;

  // Method 1: fetch with cors (works when GAS redirects properly)
  return fetch(url, {redirect:'follow', mode:'cors'})
    .then(function(r){
      if(r.ok) return r.json();
      throw new Error('HTTP '+r.status);
    })
    .then(function(d){
      if(d&&d.error) throw new Error(d.error);
      return d;
    })
    .catch(function(){
      // Method 2: JSONP (fallback)
      return new Promise(function(resolve, reject){
        var cb = '_cb_'+Math.random().toString(36).slice(2);
        var s = document.createElement('script');
        var done = false;
        var t = setTimeout(function(){
          if(done)return; done=true;
          if(s.parentNode) s.parentNode.removeChild(s);
          delete window[cb];
          setStatus('error');
          var el=document.getElementById('loading');
          if(el) el.innerHTML='<div style="color:#f85149;font-size:18px;margin-bottom:8px">Connection Failed</div>'+
            '<div style="color:#8b949e;font-size:11px;font-family:monospace;margin-bottom:12px">Edge is blocking the request to Google.<br><br>To fix: Open Edge → Settings → Privacy → Tracking Prevention → Set to Basic</div>'+
            '<button onclick="location.reload()" style="padding:8px 16px;border:1px solid #f85149;border-radius:4px;background:none;color:#f85149;cursor:pointer;margin-right:8px">⟳ Retry</button>';
          reject(new Error('Blocked by browser'));
        }, 25000);
        window[cb] = function(d){
          if(done)return; done=true;
          clearTimeout(t);
          if(s.parentNode) s.parentNode.removeChild(s);
          delete window[cb];
          if(d&&d.error) reject(new Error(d.error));
          else resolve(d);
        };
        s.onerror = function(){
          if(done)return; done=true;
          clearTimeout(t);
          if(s.parentNode) s.parentNode.removeChild(s);
          delete window[cb];
          setStatus('error');
          var el=document.getElementById('loading');
          if(el) el.innerHTML='<div style="color:#f85149;font-size:18px;margin-bottom:8px">Script Blocked</div>'+
            '<div style="color:#8b949e;font-size:11px;font-family:monospace;margin-bottom:12px">Edge blocked the Google Apps Script.<br><br>Fix: Edge Settings → Privacy → Tracking Prevention → Basic<br>Or try Chrome/Firefox.</div>'+
            '<button onclick="location.reload()" style="padding:8px 16px;border:1px solid #f85149;border-radius:4px;background:none;color:#f85149;cursor:pointer">⟳ Retry</button>';
          reject(new Error('Script onerror'));
        };
        s.src = url + '&callback=' + cb;
        document.head.appendChild(s);
      });
    });
}) {
  return new Promise(function(resolve, reject) {
    var cb = '_vpi_' + Math.random().toString(36).slice(2);
    var p = new URLSearchParams({tab:tab, site:activeSite, week:activeWeek, callback:cb});
    if(extra) Object.keys(extra).forEach(function(k){ p.set(k, extra[k]); });
    var s = document.createElement('script');
    var done = false;
    var t = setTimeout(function() {
      if(done) return;
      done = true;
      cleanup();
      setStatus('error');
      var el = document.getElementById('loading');
      if(el) el.innerHTML = '<div style="font-size:24px;color:#f85149">⏱ Timeout</div>' +
        '<div style="font-size:11px;color:#8b949e;font-family:DM Mono,monospace;text-align:center;padding:8px">Tab: '+tab+'<br>The request timed out after 30s.<br><br>Please try refreshing.</div>' +
        '<button onclick="location.reload()" style="padding:8px 20px;border:1px solid #f85149;border-radius:4px;background:none;color:#f85149;cursor:pointer;font-family:DM Mono,monospace">⟳ Refresh</button>';
      reject(new Error('Timeout after 30s for tab: '+tab));
    }, 30000);
    function cleanup(){
      clearTimeout(t);
      delete window[cb];
      if(s.parentNode) s.parentNode.removeChild(s);
    }
    window[cb] = function(d) {
      if(done) return;
      done = true;
      cleanup();
      if(d && d.error) reject(new Error(d.error));
      else resolve(d);
    };
    s.addEventListener('error', function() {
      if(done) return;
      done = true;
      cleanup();
      setStatus('error');
      var el = document.getElementById('loading');
      if(el) el.innerHTML = '<div style="font-size:24px;color:#f85149">✕ Blocked</div>' +
        '<div style="font-size:11px;color:#8b949e;font-family:DM Mono,monospace;text-align:center;padding:8px">Tab: '+tab+'<br>JSONP script was blocked by browser.<br><br>In Edge: Settings → Privacy → turn off Tracking Prevention<br>Or try Chrome/Firefox.</div>' +
        '<button onclick="location.reload()" style="padding:8px 20px;border:1px solid #f85149;border-radius:4px;background:none;color:#f85149;cursor:pointer;font-family:DM Mono,monospace">⟳ Refresh</button>';
      reject(new Error('Script blocked by browser for tab: '+tab));
    });
    s.src = GAS + '?' + p.toString();
    document.head.appendChild(s);
  });
}
// ── BOOT ──────────────────────────────────────────────────
async function loadData(isRefresh=false) {
  setStatus('fetching');
  if (!isRefresh) show('loading');
  setMsg(isRefresh ? 'Syncing...' : 'Connecting to Google Sheets...');
  if(!isRefresh){
    setTimeout(()=>setMsg('Loading weekly data...'),3000);
    setTimeout(()=>setMsg('Almost ready...'),8000);
  }
  try {
    const weekly = await gasGet('weekly', {site:'National'});
    DATA.weekly = weekly;
    const weeks = (weekly.weeks||[]).map(w=>+w).filter(w=>w>0).sort((a,b)=>a-b);
    if (!isRefresh) activeWeek = weeks[weeks.length-1] || 1;
    setStatus('live');
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
    hide('loading');
    buildNav();
    try { render(); } catch(renderErr) {
      console.error('Render error:', renderErr);
      document.getElementById('content').innerHTML = 
        '<div class="no-data" style="color:var(--red)">Render error: ' + renderErr.message + '</div>';
    }
    scheduleRefresh();
    // background loads
    ['downtime','cost','production','oee','cost_analytics','quality_energy'].forEach(tab => {
      gasGet(tab).then(d => { DATA[tab]=d; }).catch(()=>{});
    });
    // Load monthly early
    gasGet('monthly').then(d=>{ DATA.monthly=d; }).catch(()=>{});
    // Preload daily data for all sites
    gasGet('daily_detail',{site:'National',week:activeWeek}).then(d=>{
      DATA.daily_detail=d;
    }).catch(()=>{});
  } catch(e) {
    setStatus('error');
    document.getElementById('loading').innerHTML =
      '<div style="font-size:28px;color:var(--red)">✕</div>' +
      '<div style="font-family:Barlow Condensed,sans-serif;font-size:20px;color:var(--red)">Connection Failed</div>' +
      '<div style="font-size:11px;color:var(--text2);font-family:DM Mono,monospace;max-width:380px;text-align:center;line-height:1.8">' + e.message + '</div>' +
      '<button class="retry-btn" onclick="loadData(false)">⟳ Retry</button>';
  }
}
function show(id){const e=document.getElementById(id);if(e){e.style.display='flex';e.style.opacity='1';}}
function hide(id){const e=document.getElementById(id);if(e){e.style.display='none';}}
function setStatus(s){
  const dot=document.getElementById('status-dot'),txt=document.getElementById('status-txt'),btn=document.getElementById('refresh-btn');
  if(s==='fetching'){dot.className='pulse fetching';txt.textContent='Syncing...';if(btn)btn.disabled=true;}
  else if(s==='live'){dot.className='pulse';txt.textContent='Live';if(btn)btn.disabled=false;}
  else{dot.className='pulse error';txt.textContent='Error';if(btn)btn.disabled=false;}
}
function setMsg(m){const e=document.getElementById('loading-msg');if(e)e.textContent=m;}
function scheduleRefresh(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(()=>loadData(true),5*60*1000);}
function manualRefresh(){loadData(true);}
// ── HELPERS ───────────────────────────────────────────────
const fv  = (n,d=1) => (!n||isNaN(n))?'—':Number(n).toFixed(d);
const fKK = n => (!n||n===0)?'—':n>=1000000?(n/1000000).toFixed(2)+'M':n>=1000?(n/1000).toFixed(1)+'k':n.toFixed(0);
const fK  = n => (!n||n===0)?'—':n>=1000?(n/1000).toFixed(1)+'k':n.toFixed(0);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bsc=(v,g,ok)=>v>=g?'g':v>=ok?'a':'r';
const dot = s => `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${SC[s]||'#8b949e'};margin-right:5px;vertical-align:middle"></span>`;
const catCls = c => DT_CATS[c]||'cat-other';
const pct = (n,d,fallback='—') => d>0?((n/d)*100).toFixed(1)+'%':fallback;
function buildNav() {
  const ss=document.getElementById('site-select');
  if(ss) ss.innerHTML=SITES.map(s=>`<option value="${s}" ${s===activeSite?'selected':''}>${SL[s]}</option>`).join('');
  const ws=document.getElementById('week-select');
  const weeks=(DATA.weekly&&DATA.weekly.weeks)||[];
  const sortedWks=(DATA.weekly&&DATA.weekly.weeks||[]).map(w=>+w).filter(w=>w>0).sort((a,b)=>a-b);if(ws) ws.innerHTML=sortedWks.map(w=>`<option value="${w}" ${+w===+activeWeek?'selected':''}>Week ${w}</option>`).join('');
}
function setSite(s){
  activeSite=s;
  // Don't re-fetch — use existing data, just re-render
  buildNav();
  render();
}
function setWeek(w){activeWeek=+w;buildNav();render();}
function setPage(p) {
  activePage=p;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page-tab').forEach(x=>x.classList.remove('active'));
  const pg=document.getElementById('page-'+p);if(pg)pg.classList.add('active');
  document.querySelectorAll('.page-tab').forEach(x=>{if(x.getAttribute('onclick')&&x.getAttribute('onclick').includes("'"+p+"'"))x.classList.add('active');});
  const fns={dashboard:render,monthly:renderMonthly,cost:renderCost,downtime:renderDowntime,production:renderProduction,oee:renderOEE,cost_analytics:renderCostAnalytics,quality_energy:renderQualityEnergy};
  if(fns[p]) fns[p]();
}
function destroyCharts(){Object.values(charts).forEach(c=>{try{c.destroy();}catch(e){}});charts={};}
function mkChart(id,type,labels,datasets,opts={}) {
  const cv=document.getElementById(id);if(!cv)return;
  const gc='rgba(255,255,255,0.04)';
  const sc={grid:{color:gc},ticks:{color:'#484f58',font:{size:9,family:"'DM Mono',monospace"}}};
  charts[id]=new Chart(cv.getContext('2d'),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:sc,y:sc},...opts}});
}
// ── FIELD HELPERS ─────────────────────────────────────────
const gf = (r,...keys) => {
  for(const k of keys){
    if(r[k]!==undefined&&r[k]!==null&&r[k]!==''){
      const v=parseFloat(String(r[k]).replace(/,/g,''));
      if(!isNaN(v))return v;
    }
  }
  return 0;
};
// Get string field
const gs = (r,...keys) => { for(const k of keys){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return String(r[k]);} return ''; };
const oeeNorm = v => v>1?v:v>0?v*100:0;
// ── NATIONAL SUMMARY TABLE BUILDER ───────────────────────
function buildNatTable(wkRows) {
  const siteRows = wkRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()!=='NATIONAL');
  if(!siteRows.length) return '<div class="no-data">No data</div>';
  return '<div class="tbl-wrap"><table>'+
    '<thead><tr><th>Site</th><th>Output mt</th><th>PDR t/day</th><th>Cap Util%</th><th>SDT Hr</th><th>UDT Hr</th><th>OEE%</th><th>kWh/ton</th><th>Fuel L/ton</th><th>Coal kg/ton</th><th>RM Var%</th><th>RM Var w/o Sacks%</th></tr></thead>'+
    '<tbody>'+siteRows.map(r=>{
      const s=(r.Plant||r.plant||'').toString().toUpperCase();
      const cf=gf(r,'Total Plant Output EXC MIXGRAIN & VIETOP');
      const mg=gf(r,'Mixgrain');const vt=gf(r,'Vietop');
      const out=cf+mg+vt;
      const udt=gf(r,'Unscheduled Down Time, hr');
      const sdt=gf(r,'Scheduled Down Time, hr');
      const oee=gf(r,'OEE')*100;
      const cu=gf(r,'Capacity Utilization Rate,%')*100;
      const pdr=gf(r,'Plant Daily Pelleting Rate,ton/day');
      const kwh=gf(r,'kWh/ton');const fuel=gf(r,'Li/ton');const coal=gf(r,'kg/ton');
      const rmvR=gf(r,'RM Variance, %');const rmv=rmvR*100;
      const rmvwR=gf(r,'RM Variance (w/o used sacks), %');const rmvw=rmvwR*100;
      return '<tr>'+
        '<td>'+dot(s)+SL[s]+'</td>'+
        '<td>'+(out>0?out.toFixed(1):'—')+'</td>'+
        '<td>'+(pdr>0?pdr.toFixed(2):'—')+'</td>'+
        '<td class="'+(cu>=80?'tg':cu>=60?'ta':'tr')+'">'+(cu>0?cu.toFixed(1)+'%':'—')+'</td>'+
        '<td>'+(sdt>0?sdt.toFixed(2):'—')+'</td>'+
        '<td class="'+(udt>20?'tr':udt>10?'ta':'')+'">'+(udt>0?udt.toFixed(2):'—')+'</td>'+
        '<td class="'+(oee>=85?'tg':oee>=70?'ta':oee>0?'tr':'')+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</td>'+
        '<td>'+(kwh>0?kwh.toFixed(2):'—')+'</td>'+
        '<td>'+(fuel>0?fuel.toFixed(2):'—')+'</td>'+
        '<td>'+(coal>0?coal.toFixed(2):'—')+'</td>'+
        '<td class="'+(rmv<0?'tr':rmv>0?'tg':'')+'">'+(rmvR!==0?rmv.toFixed(3)+'%':'—')+'</td>'+
        '<td class="'+(rmvw<0?'tr':rmvw>0?'tg':'')+'">'+(rmvwR!==0?rmvw.toFixed(3)+'%':'—')+'</td>'+
        '</tr>';
    }).join('')+
    '</tbody></table></div>';
}
// ── WEEKLY PULSE ──────────────────────────────────────────
function render() {
  destroyCharts();
  const ct=document.getElementById('content');
  const wd=DATA.weekly;
  if(!wd||!wd.rows){ct.innerHTML='<div class="no-data">⟳ Loading weekly data...</div>';return;}
  const rows=wd.rows||[];
  const allWeeks=[...new Set(rows.map(r=>+(r.Week||r.week||0)).filter(w=>w>0))].sort((a,b)=>a-b);
  const wkRows=rows.filter(r=>+r['Week']===+activeWeek||+r['week']===+activeWeek);
  // For KPIs: National uses NATIONAL row, sites use their own row
  const natRow = wkRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()==='NATIONAL');
  // Remaining days in current month for Projected Volume
  // Uses today's date — remaining = last day of month minus today
  const _today = new Date();
  const _lastDay = new Date(_today.getFullYear(), _today.getMonth()+1, 0).getDate();
  const remainDays = _lastDay - _today.getDate();
  console.log('All rows count:', rows.length, 'Week', activeWeek, 'rows:', wkRows.length, 'Sample row keys:', rows[0]?Object.keys(rows[0]).slice(0,8):[]);
  const siteWkRows=activeSite==='NATIONAL'?wkRows:wkRows.filter(r=>(r.Plant||r.plant||'').toString().toUpperCase()===activeSite);
  // KPIs
  // ── USE NATIONAL ROW DIRECTLY FOR NATIONAL VIEW ──
  // Sheet already has aggregated NATIONAL row — use it directly
  // For individual sites, use that site's single row
  const kpiRows = activeSite==='NATIONAL' ? natRow : siteWkRows;
  // Output col AM
  const totOut = kpiRows.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0);
  // Badges: AP=COMPLETE FEEDS, AR=Mixgrain, AZ=Vietop
  const totCF  = kpiRows.reduce((a,r)=>a+gf(r,'COMPLETE FEEDS, mt'),0);
  const totMG  = kpiRows.reduce((a,r)=>a+gf(r,'Mixgrain'),0);
  const totVT  = kpiRows.reduce((a,r)=>a+gf(r,'Vietop'),0);
  // Cap Util col CQ — stored as decimal in GAS (0.2835 = 28.35%)
  const _cuRaw     = kpiRows.length?kpiRows.reduce((a,r)=>a+gf(r,'Capacity Utilization Rate,%'),0)/kpiRows.length:0;
  const totCapUtil = _cuRaw*100;
  // UDT col H
  const totUDT     = kpiRows.reduce((a,r)=>a+gf(r,'Unscheduled Down Time, hr'),0);
  // SDT col G
  const totSDT     = kpiRows.reduce((a,r)=>a+gf(r,'Scheduled Down Time, hr'),0);
  // OEE col CR — stored as decimal in GAS (0.3927 = 39.27%)
  const _rawOEE    = kpiRows.length?kpiRows.reduce((a,r)=>a+gf(r,'OEE'),0)/kpiRows.length:0;
  const avgOEE     = _rawOEE*100;
  // Plant Daily Rate col BG — tons/day
  const totPDR     = kpiRows.reduce((a,r)=>a+gf(r,'Plant Daily Pelleting Rate,ton/day'),0);
  // Plan col
  const totPlan    = kpiRows.reduce((a,r)=>a+gf(r,'Planned, mt','Total Plant Input, mt'),0);
  const pp=totPlan>0?(totOut/totPlan*100):0;
  const pC=pp>=100?'var(--green-b)':pp>=85?'var(--amber)':'var(--red)';
  const oC=avgOEE>=85?'var(--green-b)':avgOEE>=70?'var(--amber)':'var(--red)';
  // Scorecard (National only)
  const scorecard=activeSite==='NATIONAL'?`<div class="sec">
    <div class="sec-hdr"><div class="sec-title">National Scorecard — Week ${activeWeek}</div><div class="sec-line"></div></div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">
    ${PROD_SITES.map(s=>{
      const sr=wkRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()===s);
      // MR Weekly: AP=CF Output, AR=Mixgrain, AZ=Vietop, CQ=Cap Util%, CR=OEE, H=UDT
      const cf  = sr.reduce((a,r)=>a+gf(r,'COMPLETE FEEDS, mt'),0);
      const mg  = sr.reduce((a,r)=>a+gf(r,'Mixgrain'),0);
      const vt  = sr.reduce((a,r)=>a+gf(r,'Vietop'),0);
      const tot = sr.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0);
      const cfDisplay = cf>0?cf:tot-mg-vt;
      const _cu  = sr.length?sr.reduce((a,r)=>a+gf(r,'Capacity Utilization Rate,%'),0)/sr.length:0;
      const cu   = _cu*100;
      const _oee = sr.length?sr.reduce((a,r)=>a+gf(r,'OEE'),0)/sr.length:0;
      const oee  = _oee*100;
      const udt  = sr.reduce((a,r)=>a+gf(r,'Unscheduled Down Time, hr'),0);
      const cuC = cu>=80?'var(--green)':cu>=60?'var(--amber)':'var(--red)';
      const oeeC= oee>=85?'var(--green-b)':oee>=70?'var(--amber)':'var(--red)';
      const udtC= udt>20?'var(--red)':udt>10?'var(--amber)':'var(--text3)';
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid ${cuC};border-radius:var(--rl);padding:10px 8px;text-align:center">
        <div style="margin-bottom:5px">${dot(s)}<span style="font-size:10px;font-weight:700;color:var(--text)">${s}</span></div>
        <div style="border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px">
          <div style="font-size:8px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Output mt</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--text);line-height:1">${tot>0?tot.toFixed(1):'—'}</div>
          <div style="display:flex;justify-content:center;gap:3px;margin-top:5px;flex-wrap:wrap">
            ${cf>0?`<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF ${cf.toFixed(1)}</span>`:''}
            ${mg>0?`<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG ${mg.toFixed(1)}</span>`:''}
            ${vt>0?`<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT ${vt.toFixed(1)}</span>`:''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:9px;color:var(--text3)">Cap Util</span>
            <span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:${cuC}">${cu>0?cu.toFixed(1)+'%':'—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:9px;color:var(--text3)">OEE</span>
            <span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:${oeeC}">${oee>0?oee.toFixed(1)+'%':'—'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:9px;color:var(--text3)">UDT</span>
            <span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:${udtC}">${udt>0?udt.toFixed(2)+'h':'—'}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
    </div></div>` : '';
  ct.innerHTML = scorecard + `
<div class="sec">
  <div class="sec-hdr"><div class="sec-title">${SL[activeSite]} · Week ${activeWeek}</div><div class="sec-line"></div></div>
  <div class="g5">
    <div class="kc" style="--kc-color:${pC}">
      <div class="kc-lbl">Output</div>
      <div class="kc-val" style="color:${pC}">${totOut>0?totOut.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)"> mt</span></div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;margin-top:2px">
        ${totCF>0?`<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF ${totCF.toFixed(1)}</span>`:''}
        ${totMG>0?`<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG ${totMG.toFixed(1)}</span>`:''}
        ${totVT>0?`<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT ${totVT.toFixed(1)}</span>`:''}
      </div>
    </div>
    <div class="kc" style="--kc-color:${totCapUtil>=80?'var(--green)':totCapUtil>=60?'var(--amber)':'var(--red)'}">
      <div class="kc-lbl">Capacity Utilization</div>
      <div class="kc-val" style="color:${totCapUtil>=80?'var(--green-b)':totCapUtil>=60?'var(--amber)':'var(--red)'}">${totCapUtil>0?totCapUtil.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)">%</span></div>
      <div class="kc-sub">vs Demo Capacity</div>
      <span class="bdg ${bsc(totCapUtil,80,60)}">${totCapUtil>=80?'On Track':totCapUtil>=60?'Moderate':'Low'}</span>
    </div>
    <div class="kc" style="--kc-color:${totUDT>20?'var(--red)':totUDT>10?'var(--amber)':'var(--border2)'}">
      <div class="kc-lbl">Downtime</div>
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:4px">
        <div>
          <div style="font-size:9px;color:var(--red);font-weight:600;letter-spacing:1px">UDT</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:${totUDT>20?'var(--red)':totUDT>10?'var(--amber)':'var(--text)'}">${totUDT>0?totUDT.toFixed(2):'—'}<span style="font-size:11px;color:var(--text2)"> hr</span></div>
        </div>
        <div style="width:1px;height:32px;background:var(--border)"></div>
        <div>
          <div style="font-size:9px;color:var(--text3);font-weight:600;letter-spacing:1px">SDT</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--text2)">${totSDT>0?totSDT.toFixed(2):'—'}<span style="font-size:11px;color:var(--text3)"> hr</span></div>
        </div>
      </div>
      <span class="bdg ${totUDT>20?'r':totUDT>10?'a':'g'}">${totUDT>20?'High UDT':totUDT>10?'Moderate':'Low DT'}</span>
    </div>
    <div class="kc" style="--kc-color:${oC}">
      <div class="kc-lbl">OEE</div>
      <div class="kc-val" style="color:${oC}">${avgOEE>0?avgOEE.toFixed(1):'N/A'}<span style="font-size:12px;color:var(--text2)">${avgOEE>0?'%':''}</span></div>
      <div class="kc-sub">Overall Equipment Effectiveness</div>
      <span class="bdg ${avgOEE>=85?'g':avgOEE>=70?'a':avgOEE>0?'r':'b'}">${avgOEE>=85?'World Class':avgOEE>=70?'Acceptable':avgOEE>0?'Needs Attn':'N/A'}</span>
    </div>
    <div class="kc" style="--kc-color:var(--teal)">
      <div class="kc-lbl">Plant Daily Rate</div>
      <div class="kc-val" style="font-size:22px;color:var(--teal)">${totPDR>0?totPDR.toFixed(2):'—'}<span style="font-size:12px;color:var(--text2)"> t/day</span></div>
      <div class="kc-sub">Plant Daily Pelleting Rate</div>
    </div>
  </div>
  <div class="g5" style="margin-top:8px">
    <div class="kc" style="--kc-color:var(--purple)">
      <div class="kc-lbl">Power</div>
      <div class="kc-val" style="font-size:22px;color:var(--purple)">${fv(kpiRows.reduce((a,r)=>a+gf(r,'kWh/ton'),0)/Math.max(kpiRows.length,1),2)}<span style="font-size:12px;color:var(--text2)"> kWh/t</span></div>
      <div class="kc-sub">Electricity per ton</div>
    </div>
    <div class="kc" style="--kc-color:var(--amber)">
      <div class="kc-lbl">Fuel</div>
      <div class="kc-val" style="font-size:22px;color:var(--amber)">${fv(kpiRows.reduce((a,r)=>a+gf(r,'Li/ton'),0)/Math.max(kpiRows.length,1),2)}<span style="font-size:12px;color:var(--text2)"> L/t</span></div>
      <div class="kc-sub">Diesel per ton</div>
    </div>
    <div class="kc" style="--kc-color:var(--text3)">
      <div class="kc-lbl">Coal</div>
      <div class="kc-val" style="font-size:22px">${(()=>{const v=kpiRows.reduce((a,r)=>a+gf(r,'kg/ton'),0)/Math.max(kpiRows.length,1);return v>0?fv(v,2):'—';})()} <span style="font-size:12px;color:var(--text2)">${kpiRows.some(r=>gf(r,'kg/ton')>0)?'kg/t':''}</span></div>
      <div class="kc-sub">Coal per ton</div>
    </div>
    <div class="kc" style="--kc-color:${(()=>{const v=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance, %'),0)/Math.max(kpiRows.length,1)*100;return v<0?'var(--red)':v>0?'var(--green)':'var(--border2)';})()}">
      <div class="kc-lbl">RM Variance</div>
      ${(()=>{
        const raw=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance, %'),0)/Math.max(kpiRows.length,1);
        const v=raw*100;
        const c=v<0?'var(--red)':v>0?'var(--green-b)':'var(--text2)';
        return '<div class="kc-val" style="font-size:22px;color:'+c+'">'+(v>=0?'+':'')+fv(v,3)+'<span style="font-size:12px;color:var(--text2)">%</span></div>';
      })()}
      <div class="kc-sub">RM Variance %</div>
      <span class="bdg ${(()=>{const v=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance, %'),0)/Math.max(kpiRows.length,1)*100;return v<0?'r':v>0?'g':'b';})()}">${(()=>{const v=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance, %'),0)/Math.max(kpiRows.length,1)*100;return v<0?'Under':'Over';})()}</span>
    </div>
    <div class="kc" style="--kc-color:${(()=>{const v=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance (w/o used sacks), %'),0)/Math.max(kpiRows.length,1)*100;return v<0?'var(--red)':v>0?'var(--green)':'var(--border2)';})()}">
      <div class="kc-lbl">RM Var w/o Sacks</div>
      ${(()=>{
        const raw=kpiRows.reduce((a,r)=>a+gf(r,'RM Variance (w/o used sacks), %'),0)/Math.max(kpiRows.length,1);
        const v=raw*100;
        const c=v<0?'var(--red)':v>0?'var(--green-b)':'var(--text2)';
        return '<div class="kc-val" style="font-size:22px;color:'+c+'">'+(v>=0?'+':'')+fv(v,3)+'<span style="font-size:12px;color:var(--text2)">%</span></div>';
      })()}
      <div class="kc-sub">RM Var w/o Sacks %</div>
    </div>
  </div>
</div>
<div class="sec">
  <div class="sec-hdr"><div class="sec-title">Operational KPI Trends — ${activeSite==='NATIONAL'?'National':SL[activeSite]}</div><div class="sec-line"></div></div>
  <div class="g2" style="margin-bottom:8px">
    <div class="cc">
      <div class="cc-title">Weekly Output — ${activeSite==='NATIONAL'?'National':SL[activeSite]} (mt)</div>
      <div style="position:relative;height:160px"><canvas id="c-out"></canvas></div>
    </div>
    <div class="cc">
      <div class="cc-title">Daily Output — Week ${activeWeek} · ${activeSite==='NATIONAL'?'National':SL[activeSite]} (mt)</div>
      <div style="position:relative;height:160px"><canvas id="c-daily-out"></canvas></div>
    </div>
  </div>
  <div class="g2" style="margin-bottom:8px">
    <div class="cc">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="cc-title" style="margin-bottom:0">Unscheduled Downtime — hrs &amp; % (Limit: 5%)</div>
        <div id="udt-status" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
      </div>
      <div style="position:relative;height:160px"><canvas id="c-udt-combo"></canvas></div>
    </div>
    <div class="cc">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="cc-title" style="margin-bottom:0">Power Consumption kWh/ton (Limit: 35)</div>
        <div id="kwh-status" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
      </div>
      <div style="position:relative;height:160px"><canvas id="c-kwh-trend"></canvas></div>
    </div>
  </div>
  <div class="g2">
    <div class="cc">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="cc-title" style="margin-bottom:0">Fuel Consumption L/ton (Limit: 3.5)</div>
        <div id="fuel-status" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
      </div>
      <div style="position:relative;height:160px"><canvas id="c-fuel-trend"></canvas></div>
    </div>
    <div class="cc">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="cc-title" style="margin-bottom:0">Coal Consumption kg/ton (Limit: 12)</div>
        <div id="coal-status" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
      </div>
      <div style="position:relative;height:160px"><canvas id="c-coal-trend"></canvas></div>
    </div>
  </div>
</div>
<div class="sec">
  <div class="sec-hdr"><div class="sec-title">${activeSite==='NATIONAL'?'Site Summary — Week '+activeWeek:SL[activeSite]+' · Daily Detail — Week '+activeWeek}</div><div class="sec-line"></div></div>
  <div class="cc" id="detail-table-wrap">
    ${activeSite==='NATIONAL' ? buildNatTable(wkRows) : '<div class="no-data" style="padding:20px">⟳ Loading daily data...</div>'}
  </div>
</div>`;
  ct.className='content fade';
  // ── LOAD DAILY TABLE FOR SPECIFIC SITE ───────────────
  if(activeSite!=='NATIONAL'){
    const wrap=document.getElementById('detail-table-wrap');
    if(wrap) wrap.innerHTML='<div class="no-data" style="padding:20px">⟳ Loading daily data...</div>';
    gasGet('daily_detail',{site:activeSite,week:activeWeek}).then(d=>{
      const wrap=document.getElementById('detail-table-wrap');
      if(!wrap)return;
      // GAS now filters server-side, rows are already for this site+week
      const drows=(d.rows||[]);
      if(!drows.length){
        wrap.innerHTML='<div class="no-data">No daily data for '+SL[activeSite]+' Week '+activeWeek+'<br><small style="color:var(--text3)">Check GAS was redeployed</small></div>';
        return;
      }
      const fmtDate=r=>r['_dateFormatted']||String(r['Date']||r['date']||'—').split('T')[0];
      const dateCols=drows.map(r=>fmtDate(r));
      const metrics=[
        {label:'Output mt',   fn:r=>gf(r,'Total Plant Output,mt w/o toll'), lim:0,   cls:(v,l)=>''},
        {label:'SDT Hr',      fn:r=>gf(r,'Scheduled Down Time, hr'),        lim:0,   cls:(v,l)=>''},
        {label:'UDT Hr',      fn:r=>gf(r,'Unscheduled Down Time, hr'),      lim:8,   cls:(v,l)=>v>l?'tr':v>l*0.8?'ta':'tg'},
        {label:'kWh/ton',     fn:r=>gf(r,'kWh/ton'),                        lim:35,  cls:(v,l)=>v>l?'tr':v>l*0.9?'ta':'tg'},
        {label:'Fuel L/ton',  fn:r=>gf(r,'Li/ton'),                         lim:3.5, cls:(v,l)=>v>l?'tr':v>l*0.9?'ta':'tg'},
        {label:'Coal kg/ton', fn:r=>gf(r,'kg/ton'),                         lim:12,  cls:(v,l)=>v>l?'tr':v>l*0.9?'ta':'tg'},
      ];
      // Table style — bigger, more visible
      const thStyle='style="white-space:nowrap;font-size:11px;padding:8px 12px;text-align:center;background:var(--bg3)"';
      const tdMetric='style="text-align:left;font-family:Barlow,sans-serif;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;padding:10px 12px;background:var(--bg3);border-right:1px solid var(--border2)"';
      const tdVal=(cls)=>'style="text-align:center;font-family:DM Mono,monospace;font-size:13px;font-weight:600;padding:10px 12px;letter-spacing:.5px"';
      wrap.innerHTML='<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">'+
        '<thead><tr>'+
          '<th '+thStyle+' style="text-align:left;min-width:120px;background:var(--bg3)">Metric</th>'+
          dateCols.map(d=>'<th '+thStyle+'>'+d+'</th>').join('')+
        '</tr></thead>'+
        '<tbody>'+metrics.map((m,mi)=>
          '<tr style="border-bottom:1px solid var(--border)">'+
          '<td '+tdMetric+'>'+m.label+'</td>'+
          drows.map(r=>{
            const v=m.fn(r);
            const cls=v>0?m.cls(v,m.lim):'';
            const display=v>0?v.toFixed(2):'—';
            const bg=cls==='tr'?'rgba(248,81,73,0.12)':cls==='ta'?'rgba(210,153,34,0.12)':cls==='tg'&&m.lim>0?'rgba(46,160,67,0.08)':'';
            return '<td class="'+cls+'" style="text-align:center;font-family:DM Mono,monospace;font-size:13px;font-weight:600;padding:10px 12px;letter-spacing:.5px;background:'+bg+'">'+(v>0?'<span style="font-size:14px">'+display+'</span>':'<span style="color:var(--text3);font-size:11px">—</span>')+'</td>';
          }).join('')+
          '</tr>'
        ).join('')+
        '</tbody></table></div>';
    }).catch(e=>{
      const wrap=document.getElementById('detail-table-wrap');
      if(wrap)wrap.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'<br><small>Redeploy GAS script</small></div>';
    });
  }
  // ── CHART RENDERING ───────────────────────────────────
  const sf = activeSite==='NATIONAL' ? r=>true : r=>(r.Plant||r.plant||'').toUpperCase()===activeSite;
  const bw = w => rows.filter(r=>+(r.Week||r.week||0)===+w&&sf(r));
  const lbl = allWeeks.map(w=>'W'+w);
  // Weekly Output Line Chart
  const weeklyOutData = allWeeks.map(w=>{
    if(activeSite==='NATIONAL'){
      const natR=rows.filter(r=>+(r.Week||r.week||0)===+w&&(r.Plant||r.plant||'').toUpperCase()==='NATIONAL');
      return +natR.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0).toFixed(1);
    } else {
      const siteR=rows.filter(r=>+(r.Week||r.week||0)===+w&&(r.Plant||r.plant||'').toUpperCase()===activeSite);
      return +siteR.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0).toFixed(1);
    }
  });
  const wkTarget = WEEKLY_TARGET[activeSite] || WEEKLY_TARGET.NATIONAL;
  const wkPointColors = weeklyOutData.map((v,i)=>{
    if(+allWeeks[i]===+activeWeek) return '#ffffff';
    return v>0&&v<wkTarget ? '#f85149' : '#3fb950';
  });
  mkChart('c-out','line',lbl,[
    {label:'Output mt', data:weeklyOutData,
     borderColor:'#388bfd', backgroundColor:'rgba(56,139,253,0.08)',
     fill:true, tension:.3,
     pointRadius:weeklyOutData.map((_,i)=>+allWeeks[i]===+activeWeek?7:4),
     pointBackgroundColor:wkPointColors, pointBorderColor:wkPointColors, spanGaps:true},
    {label:'Target '+wkTarget+' mt', data:allWeeks.map(()=>wkTarget),
     borderColor:'rgba(248,81,73,0.5)', borderDash:[4,4], borderWidth:1.5, pointRadius:0, fill:false}
  ],{plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},
     tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}}});
  // Daily Output Line Chart
  function buildDailyChart(){
    const dRows=(DATA.daily_detail&&DATA.daily_detail.rows||[]).filter(r=>{
      const rSite=(r.Plant||r.plant||'').toUpperCase();
      const rWeek=String(r['Week Num']||r['Week']||r['week']||'').trim();
      const siteMatch=activeSite==='NATIONAL'?true:rSite===activeSite;
      return siteMatch&&rWeek===String(activeWeek);
    }).sort((a,b)=>new Date(a.Date||a.date||0)-new Date(b.Date||b.date||0));
    const byDate={};
    dRows.forEach(r=>{
      const raw=String(r.Date||r.date||'').split('T')[0];
      if(!raw||raw==='undefined')return;
      byDate[raw]=(byDate[raw]||0)+gf(r,'Total Plant Output,mt w/o toll');
    });
    const dates=Object.keys(byDate).sort();
    const vals=dates.map(d=>+byDate[d].toFixed(2));
    const lbls=dates.map(d=>{
      try{const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-PH',{month:'short',day:'numeric',weekday:'short'});}
      catch(e){return d;}
    });
    if(charts['c-daily-out']){try{charts['c-daily-out'].destroy();}catch(e){}}
    if(!dates.length){setTimeout(()=>{if(DATA.daily_detail&&DATA.daily_detail.rows&&DATA.daily_detail.rows.length)buildDailyChart();},3000);return;}
    const dayTarget=DAILY_TARGET[activeSite]||DAILY_TARGET.NATIONAL;
    const dayPtColors=vals.map(v=>v>0&&v<dayTarget?'#f85149':'#3fb950');
    charts['c-daily-out']=new Chart(document.getElementById('c-daily-out').getContext('2d'),{
      type:'line',
      data:{labels:lbls,datasets:[
        {label:'Output mt',data:vals,borderColor:'#3fb950',backgroundColor:'rgba(63,185,80,0.08)',
         fill:true,tension:.3,pointRadius:5,pointBackgroundColor:dayPtColors,pointBorderColor:dayPtColors,spanGaps:true},
        {label:'Target '+dayTarget+' mt',data:vals.map(()=>dayTarget),
         borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
      ]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
        plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},
                 tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
        scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},
                y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}
    });
  }
  buildDailyChart();
  // ── 4 OPERATIONAL KPI CHARTS ──────────────────────────
  const kpiWkRows = activeSite==='NATIONAL'
    ? rows.filter(r=>(r.Plant||r.plant||'').toUpperCase()==='NATIONAL')
    : rows.filter(r=>(r.Plant||r.plant||'').toUpperCase()===activeSite);
  const kpiWks = allWeeks;
  const perWk = (field) => kpiWks.map(w=>{
    const r=kpiWkRows.find(x=>+(x.Week||x.week||0)===+w);
    return r?+gf(r,field).toFixed(2):null;
  });
  const setBadge=(id,val,limit,unit)=>{
    const el=document.getElementById(id);if(!el)return;
    const over=val>limit; const near=val>limit*0.9;
    el.textContent=(over?'▲ ':near?'◉ ':'▼ ')+val.toFixed(2)+unit+(over?' +'+((val/limit-1)*100).toFixed(1)+'% over':near?' near limit':' within limit');
    el.style.cssText='font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px;background:'+(over?'rgba(248,81,73,0.15)':near?'rgba(210,153,34,0.15)':'rgba(46,160,67,0.15)')+';color:'+(over?'#f85149':near?'#d29922':'#3fb950')+';border:1px solid '+(over?'rgba(248,81,73,0.3)':near?'rgba(210,153,34,0.3)':'rgba(46,160,67,0.3)')+';';
  };
  const ptColor=(v,limit)=>{if(!v)return 'rgba(139,148,158,0.5)';return v>limit?'#f85149':v>limit*0.9?'#d29922':'#3fb950';};
  // UDT Combo
  const udtHrs=perWk('Unscheduled Down Time, hr');
  const udtPct=kpiWks.map(w=>{
    const r=kpiWkRows.find(x=>+(x.Week||x.week||0)===+w);
    if(!r)return null;
    const p=gf(r,'Unscheduled Down Time, %')||gf(r,'Total Downtime Rate, %');
    return p>1?+p.toFixed(2):+(p*100).toFixed(2);
  });
  setBadge('udt-status',udtPct.filter(v=>v!==null).slice(-1)[0]||0,LIMITS.UDT_PCT,'%');
  if(charts['c-udt-combo']){try{charts['c-udt-combo'].destroy();}catch(e){}}
  const udtCtx=document.getElementById('c-udt-combo');
  if(udtCtx) charts['c-udt-combo']=new Chart(udtCtx.getContext('2d'),{
    data:{labels:lbl,datasets:[
      {type:'bar',label:'UDT Hours',data:udtHrs,backgroundColor:udtHrs.map(v=>v>0?'rgba(248,81,73,0.6)':'rgba(56,139,253,0.3)'),borderRadius:3,yAxisID:'y'},
      {type:'line',label:'UDT %',data:udtPct,borderColor:'#f85149',segment:{borderColor:ctx=>ptColor(ctx.p1.parsed.y,LIMITS.UDT_PCT)},backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:udtPct.map(v=>ptColor(v,LIMITS.UDT_PCT)),spanGaps:true,yAxisID:'y1'},
      {type:'line',label:'5% Limit',data:kpiWks.map(()=>LIMITS.UDT_PCT),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}},position:'left'},y1:{grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:v=>v+'%'},position:'right'}}}
  });
  // kWh/ton
  const kwhData=perWk('kWh/ton');
  setBadge('kwh-status',kwhData.filter(v=>v!==null).slice(-1)[0]||0,LIMITS.KWH_TON,' kWh/t');
  if(charts['c-kwh-trend']){try{charts['c-kwh-trend'].destroy();}catch(e){}}
  const kwhCtx=document.getElementById('c-kwh-trend');
  if(kwhCtx) charts['c-kwh-trend']=new Chart(kwhCtx.getContext('2d'),{type:'line',data:{labels:lbl,datasets:[
    {label:'kWh/ton',data:kwhData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:kwhData.map(v=>ptColor(v,LIMITS.KWH_TON))},
    {label:'Limit 35',data:kpiWks.map(()=>LIMITS.KWH_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
  // Fuel L/ton
  const fuelData=perWk('Li/ton');
  setBadge('fuel-status',fuelData.filter(v=>v!==null).slice(-1)[0]||0,LIMITS.FUEL_TON,' L/t');
  if(charts['c-fuel-trend']){try{charts['c-fuel-trend'].destroy();}catch(e){}}
  const fuelCtx=document.getElementById('c-fuel-trend');
  if(fuelCtx) charts['c-fuel-trend']=new Chart(fuelCtx.getContext('2d'),{type:'line',data:{labels:lbl,datasets:[
    {label:'L/ton',data:fuelData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:fuelData.map(v=>ptColor(v,LIMITS.FUEL_TON))},
    {label:'Limit 3.5',data:kpiWks.map(()=>LIMITS.FUEL_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
  // Coal kg/ton
  const coalData=perWk('kg/ton');
  setBadge('coal-status',coalData.filter(v=>v!==null).slice(-1)[0]||0,LIMITS.COAL_TON,' kg/t');
  if(charts['c-coal-trend']){try{charts['c-coal-trend'].destroy();}catch(e){}}
  const coalCtx=document.getElementById('c-coal-trend');
  if(coalCtx) charts['c-coal-trend']=new Chart(coalCtx.getContext('2d'),{type:'line',data:{labels:lbl,datasets:[
    {label:'kg/ton',data:coalData,borderColor:'#8b949e',backgroundColor:'rgba(139,148,158,0.08)',fill:true,tension:.3,pointRadius:4,spanGaps:true,pointBackgroundColor:coalData.map(v=>v&&v>0?ptColor(v,LIMITS.COAL_TON):'rgba(139,148,158,0.3)')},
    {label:'Limit 12',data:kpiWks.map(()=>LIMITS.COAL_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
}
// ── PAGE NAVIGATION ───────────────────────────────────────
function setPage(p){
  activePage=p;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page-tab').forEach(x=>x.classList.remove('active'));
  const pg=document.getElementById('page-'+p);if(pg)pg.classList.add('active');
  document.querySelectorAll('.page-tab').forEach(x=>{if(x.getAttribute('onclick')&&x.getAttribute('onclick').includes("'"+p+"'"))x.classList.add('active');});
  const fns={dashboard:render,monthly:renderMonthly,cost:renderCost,downtime:renderDowntime,production:renderProduction,oee:renderOEE,cost_analytics:renderCostAnalytics,quality_energy:renderQualityEnergy};
  if(fns[p]) fns[p]();
}
// ── MONTHLY ──────────────────────────────────────────────
// Month selector state
let activeMonth = '';
function renderMonthly(){
  const ct=document.getElementById('content-monthly');
  if(!DATA.monthly){
    ct.innerHTML='<div class="no-data">⟳ Loading...</div>';
    gasGet('monthly').then(d=>{DATA.monthly=d;renderMonthly();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');
    return;
  }
  const rows = DATA.monthly.rows||[];
  const months = DATA.monthly.months||[...new Set(rows.map(r=>r.MONTH||r.Month||r.month||'').filter(Boolean))];
  if(!activeMonth || !months.includes(activeMonth)) activeMonth = months[months.length-1]||'';
  // Filter rows for selected month
  const mthRows = rows.filter(r=>(r.MONTH||r.Month||r.month||'').toUpperCase()===activeMonth.toUpperCase());
  const siteRows = activeSite==='NATIONAL'
    ? mthRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()==='NATIONAL')
    : mthRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()===activeSite);
  // KPI calculations from MR Monthly
  const kpiR = siteRows;
  const mOut    = kpiR.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0);
  const mCF     = kpiR.reduce((a,r)=>a+gf(r,'COMPLETE FEEDS, mt'),0);
  const mMG     = kpiR.reduce((a,r)=>a+gf(r,'Mixgrain'),0);
  const mVT     = kpiR.reduce((a,r)=>a+gf(r,'Vietop'),0);
  const mUDT    = kpiR.reduce((a,r)=>a+gf(r,'Unscheduled Down Time, hr'),0);
  const mSDT    = kpiR.reduce((a,r)=>a+gf(r,'Scheduled Down Time, hr'),0);
  const mOEEraw = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'OEE'),0)/kpiR.length:0;
  const mOEE    = mOEEraw*100;
  const mCUraw  = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'Capacity Utilization Rate,%'),0)/kpiR.length:0;
  const mCU     = mCUraw*100;
  const mPDR    = kpiR.reduce((a,r)=>a+gf(r,'Plant Daily Pelleting Rate,ton/day'),0);
  const mKwh    = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'kWh/ton'),0)/kpiR.length:0;
  const mFuel   = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'Li/ton'),0)/kpiR.length:0;
  const mCoal   = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'kg/ton'),0)/kpiR.length:0;
  const mRMV    = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'RM Variance, %'),0)/kpiR.length:0;
  const mRMVWS  = kpiR.length?kpiR.reduce((a,r)=>a+gf(r,'RM Variance (w/o used sacks), %'),0)/kpiR.length:0;
  // Month pills
  const mPills = months.map(m=>
    `<button class="wk-pill \${m===activeMonth?'active':''}" onclick="activeMonth='\${m}';renderMonthly()">\${m.slice(0,3).toUpperCase()}</button>`
  ).join('');
  // National scorecard - all sites for selected month
  const natScorecard = activeSite==='NATIONAL' ? `
  <div class="sec">
    <div class="sec-hdr"><div class="sec-title">National Scorecard — \${activeMonth}</div><div class="sec-line"></div></div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">
    \${PROD_SITES.map(s=>{
      const sr=mthRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()===s);
      const out=sr.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0);
      const cf=sr.reduce((a,r)=>a+gf(r,'COMPLETE FEEDS, mt'),0);
      const mg=sr.reduce((a,r)=>a+gf(r,'Mixgrain'),0);
      const vt=sr.reduce((a,r)=>a+gf(r,'Vietop'),0);
      const cuR=sr.length?sr.reduce((a,r)=>a+gf(r,'Capacity Utilization Rate,%'),0)/sr.length:0;
      const cu=cuR*100;
      const oeeR=sr.length?sr.reduce((a,r)=>a+gf(r,'OEE'),0)/sr.length:0;
      const oee=oeeR*100;
      const udt=sr.reduce((a,r)=>a+gf(r,'Unscheduled Down Time, hr'),0);
      const cuC=cu>=80?'var(--green)':cu>=60?'var(--amber)':'var(--red)';
      const oeeC=oee>=85?'var(--green-b)':oee>=70?'var(--amber)':'var(--red)';
      const udtC=udt>80?'var(--red)':udt>40?'var(--amber)':'var(--text3)';
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid \${cuC};border-radius:var(--rl);padding:10px 8px;text-align:center">
        <div style="margin-bottom:5px">\${dot(s)}<span style="font-size:10px;font-weight:700;color:var(--text)">\${s}</span></div>
        <div style="border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px">
          <div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Output mt</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--text);line-height:1">\${out>0?out.toFixed(1):'—'}</div>
          <div style="display:flex;justify-content:center;gap:3px;margin-top:4px;flex-wrap:wrap">
            \${cf>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+cf.toFixed(1)+'</span>':''}
            \${mg>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+mg.toFixed(1)+'</span>':''}
            \${vt>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+vt.toFixed(1)+'</span>':''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">Cap Util</span><span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:\${cuC}">\${cu>0?cu.toFixed(1)+'%':'—'}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">OEE</span><span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:\${oeeC}">\${oee>0?oee.toFixed(1)+'%':'—'}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:var(--text3)">UDT</span><span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600;color:\${udtC}">\${udt>0?udt.toFixed(1)+'h':'—'}</span></div>
        </div>
      </div>`;
    }).join('')}
    </div>
  </div>` : '';
  // Color helpers
  const cuC  = mCU>=80?'var(--green-b)':mCU>=60?'var(--amber)':'var(--red)';
  const oeeC = mOEE>=85?'var(--green-b)':mOEE>=70?'var(--amber)':'var(--red)';
  const udtC = mUDT>80?'var(--red)':mUDT>40?'var(--amber)':'var(--text)';
  // Build monthly summary table — all sites for selected month
  const allSiteRows = PROD_SITES.map(s=>{
    const sr=mthRows.filter(r=>(r.Plant||r.plant||'').toUpperCase()===s);
    if(!sr.length) return '<tr><td>'+dot(s)+SL[s]+'</td>'+'<td>—</td>'.repeat(9)+'</tr>';
    const out=sr.reduce((a,r)=>a+gf(r,'Total Plant Output,mt w/o toll'),0);
    const udt=sr.reduce((a,r)=>a+gf(r,'Unscheduled Down Time, hr'),0);
    const sdt=sr.reduce((a,r)=>a+gf(r,'Scheduled Down Time, hr'),0);
    const oeeR=sr.length?sr.reduce((a,r)=>a+gf(r,'OEE'),0)/sr.length:0; const oee=oeeR*100;
    const cuR=sr.length?sr.reduce((a,r)=>a+gf(r,'Capacity Utilization Rate,%'),0)/sr.length:0; const cu=cuR*100;
    const pdr=sr.reduce((a,r)=>a+gf(r,'Plant Daily Pelleting Rate,ton/day'),0);
    const kwh=sr.length?sr.reduce((a,r)=>a+gf(r,'kWh/ton'),0)/sr.length:0;
    const fuel=sr.length?sr.reduce((a,r)=>a+gf(r,'Li/ton'),0)/sr.length:0;
    const coal=sr.length?sr.reduce((a,r)=>a+gf(r,'kg/ton'),0)/sr.length:0;
    return '<tr>'+
      '<td>'+dot(s)+SL[s].split('·')[0].trim()+'</td>'+
      '<td>'+(out>0?out.toFixed(1):'—')+'</td>'+
      '<td>'+(pdr>0?pdr.toFixed(1):'—')+'</td>'+
      '<td class="'+(cu>=80?'tg':cu>=60?'ta':'tr')+'">'+(cu>0?cu.toFixed(1)+'%':'—')+'</td>'+
      '<td>'+(sdt>0?sdt.toFixed(1):'—')+'</td>'+
      '<td class="'+(udt>80?'tr':udt>40?'ta':'')+'">'+(udt>0?udt.toFixed(1):'—')+'</td>'+
      '<td class="'+(oee>=85?'tg':oee>=70?'ta':oee>0?'tr':'')+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</td>'+
      '<td>'+(kwh>0?kwh.toFixed(2):'—')+'</td>'+
      '<td>'+(fuel>0?fuel.toFixed(2):'—')+'</td>'+
      '<td>'+(coal>0?coal.toFixed(2):'—')+'</td>'+
    '</tr>';
  }).join('');
  ct.innerHTML = natScorecard + `
  <div class="sec">
    <div class="sec-hdr"><div class="sec-title">\${SL[activeSite]||activeSite} · \${activeMonth}</div><div class="sec-line"></div></div>
    <div class="g5">
      <div class="kc" style="--kc-color:var(--blue)">
        <div class="kc-lbl">Output</div>
        <div class="kc-val" style="color:var(--blue)">\${mOut>0?mOut.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)"> mt</span></div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">
          \${mCF>0?'<span style="font-size:8px;background:rgba(56,139,253,0.15);color:#388bfd;padding:1px 5px;border-radius:3px">CF '+mCF.toFixed(1)+'</span>':''}
          \${mMG>0?'<span style="font-size:8px;background:rgba(163,113,247,0.15);color:#a371f7;padding:1px 5px;border-radius:3px">MG '+mMG.toFixed(1)+'</span>':''}
          \${mVT>0?'<span style="font-size:8px;background:rgba(26,188,156,0.15);color:#1abc9c;padding:1px 5px;border-radius:3px">VT '+mVT.toFixed(1)+'</span>':''}
        </div>
      </div>
      <div class="kc" style="--kc-color:\${cuC}">
        <div class="kc-lbl">Capacity Utilization</div>
        <div class="kc-val" style="color:\${cuC}">\${mCU>0?mCU.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)">%</span></div>
        <div class="kc-sub">vs Demo Capacity</div>
        <span class="bdg \${mCU>=80?'g':mCU>=60?'a':'r'}">\${mCU>=80?'On Track':mCU>=60?'Moderate':'Low'}</span>
      </div>
      <div class="kc" style="--kc-color:\${udtC}">
        <div class="kc-lbl">Downtime</div>
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:4px">
          <div><div style="font-size:9px;color:var(--red);font-weight:600">UDT</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:\${udtC}">\${mUDT>0?mUDT.toFixed(1):'—'}<span style="font-size:11px;color:var(--text2)"> hr</span></div></div>
          <div style="width:1px;height:32px;background:var(--border)"></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:600">SDT</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--text2)">\${mSDT>0?mSDT.toFixed(1):'—'}<span style="font-size:11px;color:var(--text3)"> hr</span></div></div>
        </div>
      </div>
      <div class="kc" style="--kc-color:\${oeeC}">
        <div class="kc-lbl">OEE</div>
        <div class="kc-val" style="color:\${oeeC}">\${mOEE>0?mOEE.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)">%</span></div>
        <span class="bdg \${mOEE>=85?'g':mOEE>=70?'a':mOEE>0?'r':'b'}">\${mOEE>=85?'World Class':mOEE>=70?'Acceptable':mOEE>0?'Needs Attn':'N/A'}</span>
      </div>
      <div class="kc" style="--kc-color:var(--teal)">
        <div class="kc-lbl">Plant Daily Rate</div>
        <div class="kc-val" style="font-size:22px;color:var(--teal)">\${mPDR>0?mPDR.toFixed(1):'—'}<span style="font-size:12px;color:var(--text2)"> t/day</span></div>
      </div>
    </div>
    <div class="g5" style="margin-top:8px">
      <div class="kc" style="--kc-color:var(--purple)">
        <div class="kc-lbl">Power</div>
        <div class="kc-val" style="font-size:22px;color:var(--purple)">\${mKwh>0?mKwh.toFixed(2):'—'}<span style="font-size:12px;color:var(--text2)"> kWh/t</span></div>
        <div class="kc-sub">Limit: 35 kWh/t</div>
        <span class="bdg \${mKwh>35?'r':mKwh>31.5?'a':'g'}">\${mKwh>35?'Over limit':mKwh>31.5?'Near limit':'Within limit'}</span>
      </div>
      <div class="kc" style="--kc-color:var(--amber)">
        <div class="kc-lbl">Fuel</div>
        <div class="kc-val" style="font-size:22px;color:var(--amber)">\${mFuel>0?mFuel.toFixed(2):'—'}<span style="font-size:12px;color:var(--text2)"> L/t</span></div>
        <div class="kc-sub">Limit: 3.5 L/t</div>
        <span class="bdg \${mFuel>3.5?'r':mFuel>3.15?'a':'g'}">\${mFuel>3.5?'Over limit':mFuel>3.15?'Near limit':'Within limit'}</span>
      </div>
      <div class="kc" style="--kc-color:var(--text3)">
        <div class="kc-lbl">Coal</div>
        <div class="kc-val" style="font-size:22px">\${mCoal>0?mCoal.toFixed(2):'—'}<span style="font-size:12px;color:var(--text2)"> kg/t</span></div>
        <div class="kc-sub">Limit: 12 kg/t</div>
        <span class="bdg \${mCoal>12?'r':mCoal>10.8?'a':'g'}">\${mCoal>12?'Over limit':mCoal>10.8?'Near limit':mCoal>0?'Within limit':'N/A'}</span>
      </div>
      <div class="kc" style="--kc-color:\${mRMV*100<0?'var(--red)':'var(--green)'}">
        <div class="kc-lbl">RM Variance</div>
        <div class="kc-val" style="font-size:20px;color:\${mRMV*100<0?'var(--red)':'var(--green-b)'}">\${mRMV!==0?(mRMV*100>=0?'+':'')+( mRMV*100).toFixed(3)+'%':'—'}</div>
        <span class="bdg \${mRMV*100<0?'r':'g'}">\${mRMV*100<0?'Under':'Over'}</span>
      </div>
      <div class="kc" style="--kc-color:\${mRMVWS*100<0?'var(--red)':'var(--green)'}">
        <div class="kc-lbl">RM Var w/o Sacks</div>
        <div class="kc-val" style="font-size:20px;color:\${mRMVWS*100<0?'var(--red)':'var(--green-b)'}">\${mRMVWS!==0?(mRMVWS*100>=0?'+':'')+(mRMVWS*100).toFixed(3)+'%':'—'}</div>
      </div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-hdr"><div class="sec-title">Monthly Trends — \${SL[activeSite]||activeSite}</div><div class="sec-line"></div></div>
    <div class="g2" style="margin-bottom:8px">
      <div class="cc"><div class="cc-title">Monthly Output (mt)</div><div style="position:relative;height:160px"><canvas id="cm-out"></canvas></div></div>
      <div class="cc"><div class="cc-title">OEE % Monthly</div><div style="position:relative;height:160px"><canvas id="cm-oee"></canvas></div></div>
    </div>
    <div class="g2" style="margin-bottom:8px">
      <div class="cc">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="cc-title" style="margin-bottom:0">UDT — hrs &amp; % (Limit 5%)</div>
          <div id="m-udt-badge" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
        </div>
        <div style="position:relative;height:160px"><canvas id="cm-udt"></canvas></div>
      </div>
      <div class="cc">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="cc-title" style="margin-bottom:0">Power kWh/ton (Limit 35)</div>
          <div id="m-kwh-badge" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
        </div>
        <div style="position:relative;height:160px"><canvas id="cm-kwh"></canvas></div>
      </div>
    </div>
    <div class="g2">
      <div class="cc">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="cc-title" style="margin-bottom:0">Fuel L/ton (Limit 3.5)</div>
          <div id="m-fuel-badge" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
        </div>
        <div style="position:relative;height:160px"><canvas id="cm-fuel"></canvas></div>
      </div>
      <div class="cc">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="cc-title" style="margin-bottom:0">Coal kg/ton (Limit 12)</div>
          <div id="m-coal-badge" style="font-size:9px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px"></div>
        </div>
        <div style="position:relative;height:160px"><canvas id="cm-coal"></canvas></div>
      </div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-hdr"><div class="sec-title">Site Summary — \${activeMonth}</div><div class="sec-line"></div></div>
    <div class="cc"><div class="tbl-wrap"><table>
      <thead><tr><th>Site</th><th>Output mt</th><th>PDR t/day</th><th>Cap Util%</th><th>SDT Hr</th><th>UDT Hr</th><th>OEE%</th><th>kWh/ton</th><th>Fuel L/ton</th><th>Coal kg/ton</th></tr></thead>
      <tbody>\${allSiteRows}</tbody>
    </table></div></div>
  </div>`;
  // Month strip
  const strip = document.getElementById('month-strip-pills');
  if(strip) strip.innerHTML = mPills;
  // ── MONTHLY CHARTS ──
  const mLabels = months;
  const mSiteRows = m => {
    const mr = rows.filter(r=>(r.MONTH||r.Month||r.month||'').toUpperCase()===m.toUpperCase());
    return activeSite==='NATIONAL'
      ? mr.filter(r=>(r.Plant||r.plant||'').toUpperCase()==='NATIONAL')
      : mr.filter(r=>(r.Plant||r.plant||'').toUpperCase()===activeSite);
  };
  const mPerMonth = field => months.map(m=>{
    const sr=mSiteRows(m);
    return sr.length?+( sr.reduce((a,r)=>a+gf(r,field),0)).toFixed(2):null;
  });
  const mAvgMonth = field => months.map(m=>{
    const sr=mSiteRows(m);
    return sr.length?+(sr.reduce((a,r)=>a+gf(r,field),0)/sr.length).toFixed(4):null;
  });
  const ptC=(v,lim)=>!v?'rgba(139,148,158,0.4)':v>lim?'#f85149':v>lim*0.9?'#d29922':'#3fb950';
  const mBadge=(id,val,lim,unit)=>{
    const el=document.getElementById(id);if(!el)return;
    const over=val>lim,near=val>lim*0.9;
    el.textContent=(over?'▲ ':near?'◉ ':'▼ ')+val.toFixed(2)+unit+(over?' over':near?' near':' ok');
    el.style.cssText='font-size:9px;font-family:DM Mono,monospace;padding:2px 8px;border-radius:10px;background:'+(over?'rgba(248,81,73,0.15)':near?'rgba(210,153,34,0.15)':'rgba(46,160,67,0.15)')+';color:'+(over?'#f85149':near?'#d29922':'#3fb950')+';border:1px solid '+(over?'rgba(248,81,73,0.3)':near?'rgba(210,153,34,0.3)':'rgba(46,160,67,0.3)')+';';
  };
  // Destroy old monthly charts
  ['cm-out','cm-oee','cm-udt','cm-kwh','cm-fuel','cm-coal'].forEach(id=>{if(charts[id]){try{charts[id].destroy();}catch(e){}}});
  // Output
  const mOutData=mPerMonth('Total Plant Output,mt w/o toll');
  const mTgt=WEEKLY_TARGET[activeSite]||WEEKLY_TARGET.NATIONAL;
  charts['cm-out']=new Chart(document.getElementById('cm-out').getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'Output mt',data:mOutData,borderColor:'#388bfd',backgroundColor:'rgba(56,139,253,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,
     pointBackgroundColor:mOutData.map((v,i)=>m===activeMonth?'#fff':ptC(v,0))},
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
  // OEE
  const mOEEData=mAvgMonth('OEE').map(v=>v?+(v*100).toFixed(2):null);
  charts['cm-oee']=new Chart(document.getElementById('cm-oee').getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'OEE%',data:mOEEData,borderColor:'#3fb950',backgroundColor:'rgba(63,185,80,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,
     pointBackgroundColor:mOEEData.map(v=>!v?'grey':v>=85?'#3fb950':v>=70?'#d29922':'#f85149')},
    {label:'85% target',data:months.map(()=>85),borderColor:'rgba(63,185,80,0.4)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},min:0,max:120}}}});
  // UDT Combo
  const mUDTHrs=mPerMonth('Unscheduled Down Time, hr');
  const mUDTPct=mAvgMonth('Unscheduled Down Time, %').map(v=>v?+(v*100).toFixed(2):null);
  const lastUDTpct=mUDTPct.filter(v=>v!==null).slice(-1)[0]||0;
  mBadge('m-udt-badge',lastUDTpct,LIMITS.UDT_PCT,'%');
  charts['cm-udt']=new Chart(document.getElementById('cm-udt').getContext('2d'),{
    data:{labels:mLabels,datasets:[
      {type:'bar',label:'UDT Hours',data:mUDTHrs,backgroundColor:mUDTHrs.map(v=>v>0?'rgba(248,81,73,0.6)':'rgba(56,139,253,0.3)'),borderRadius:3,yAxisID:'y'},
      {type:'line',label:'UDT %',data:mUDTPct,borderColor:'#f85149',backgroundColor:'transparent',tension:.3,pointRadius:4,pointBackgroundColor:mUDTPct.map(v=>ptC(v,LIMITS.UDT_PCT)),spanGaps:true,yAxisID:'y1'},
      {type:'line',label:'5% Limit',data:months.map(()=>LIMITS.UDT_PCT),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,yAxisID:'y1'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
    scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:v=>v+'%'}}}}
  });
  // kWh/ton
  const mKwhData=mAvgMonth('kWh/ton');
  const lastKwh=mKwhData.filter(v=>v!==null).slice(-1)[0]||0;
  mBadge('m-kwh-badge',lastKwh,LIMITS.KWH_TON,' kWh/t');
  charts['cm-kwh']=new Chart(document.getElementById('cm-kwh').getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'kWh/ton',data:mKwhData,borderColor:'#a371f7',backgroundColor:'rgba(163,113,247,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,pointBackgroundColor:mKwhData.map(v=>ptC(v,LIMITS.KWH_TON))},
    {label:'Limit 35',data:months.map(()=>LIMITS.KWH_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
  // Fuel
  const mFuelData=mAvgMonth('Li/ton');
  const lastFuel=mFuelData.filter(v=>v!==null).slice(-1)[0]||0;
  mBadge('m-fuel-badge',lastFuel,LIMITS.FUEL_TON,' L/t');
  charts['cm-fuel']=new Chart(document.getElementById('cm-fuel').getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'L/ton',data:mFuelData,borderColor:'#d29922',backgroundColor:'rgba(210,153,34,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,pointBackgroundColor:mFuelData.map(v=>ptC(v,LIMITS.FUEL_TON))},
    {label:'Limit 3.5',data:months.map(()=>LIMITS.FUEL_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
  // Coal
  const mCoalData=mAvgMonth('kg/ton');
  const lastCoal=mCoalData.filter(v=>v!==null).slice(-1)[0]||0;
  mBadge('m-coal-badge',lastCoal,LIMITS.COAL_TON,' kg/t');
  charts['cm-coal']=new Chart(document.getElementById('cm-coal').getContext('2d'),{type:'line',data:{labels:mLabels,datasets:[
    {label:'kg/ton',data:mCoalData,borderColor:'#8b949e',backgroundColor:'rgba(139,148,158,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,pointBackgroundColor:mCoalData.map(v=>ptC(v,LIMITS.COAL_TON))},
    {label:'Limit 12',data:months.map(()=>LIMITS.COAL_TON),borderColor:'rgba(248,81,73,0.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}}}}}});
}
// ── COST ─────────────────────────────────────────────────
function renderCost(){
  const ct=document.getElementById('content-cost');
  if(!DATA.cost){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('cost').then(d=>{DATA.cost=d;renderCost();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const rows=DATA.cost.rows||[];
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Cost — Week '+activeWeek+'</div><div class="sec-line"></div></div><div class="cc"><div class="tbl-wrap"><table><thead><tr><th>Site</th><th>Month</th><th>Volume mt</th><th>Rental</th><th>Spare Parts</th><th>Manpower</th><th>Diesel</th><th>Electricity</th><th>Agency</th><th>Others</th><th>Tolling</th><th>Total Cost</th><th>Cost/mt</th></tr></thead><tbody>'+rows.map(r=>{const s=(r.PLANT||r.Plant||r.plant||'').toUpperCase();const vol=gf(r,'Volume, kg','volumeKg')/1000;const tot=gf(r,'TOTAL COST','totalCost');const cpt=vol>0?tot/vol:0;return '<tr><td>'+dot(s)+(SL[s]||s)+'</td><td>'+(r.MONTH||r.Month||'—')+'</td><td>'+(vol>0?vol.toFixed(1):'—')+'</td><td>'+fKK(gf(r,'Rental/Amor kph'))+'</td><td>'+fKK(gf(r,'Spare Parts. kph'))+'</td><td>'+fKK(gf(r,'Manpower Direc'))+'</td><td>'+fKK(gf(r,'Diesel, kphp'))+'</td><td>'+fKK(gf(r,'Electricity Machi'))+'</td><td>'+fKK(gf(r,'Manpower Agen'))+'</td><td>'+fKK(gf(r,'Other, kphp'))+'</td><td>'+fKK(gf(r,'tollingFee'))+'</td><td class="tg">'+fKK(tot)+'</td><td class="'+(cpt>2000?'tr':cpt>1500?'ta':'tg')+'">₱'+(cpt>0?cpt.toFixed(0):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
// ── DOWNTIME ─────────────────────────────────────────────
function renderDowntime(){
  const ct=document.getElementById('content-downtime');
  if(!DATA.downtime){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('downtime').then(d=>{DATA.downtime=d;renderDowntime();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const d=DATA.downtime;const rows=d.rows||[];const byReason=d.byReason||{};
  const reasons=Object.entries(byReason).sort((a,b)=>b[1]-a[1]);
  const totHrs=d.totals&&d.totals.total_hours||0;
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Downtime — Week '+activeWeek+'</div><div class="sec-line"></div></div><div class="g4" style="margin-bottom:12px"><div class="kc" style="--kc-color:var(--red)"><div class="kc-lbl">Total UDT Hours</div><div class="kc-val" style="color:var(--red)">'+(totHrs>0?totHrs.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)"> hr</span></div></div><div class="kc" style="--kc-color:var(--amber)"><div class="kc-lbl">Top Category</div><div class="kc-val" style="font-size:16px">'+(reasons[0]?reasons[0][0]:'—')+'</div><div class="kc-sub">'+(reasons[0]?reasons[0][1].toFixed(1)+' hr':'')+'</div></div><div class="kc" style="--kc-color:var(--blue)"><div class="kc-lbl">Records</div><div class="kc-val">'+rows.length+'</div></div><div class="kc" style="--kc-color:var(--purple)"><div class="kc-lbl">Sites Affected</div><div class="kc-val">'+new Set(rows.map(r=>r.Plant||r.plant||'')).size+'</div></div></div><div class="g2"><div class="cc"><div class="cc-title">By Category</div>'+reasons.slice(0,10).map(([reason,hrs])=>{const max=reasons[0]?reasons[0][1]:1;return '<div class="mbar-row"><div class="mbar-lbl" title="'+reason+'">'+reason.slice(0,18)+'</div><div class="mbar-bg"><div class="mbar-fill" style="width:'+(hrs/max*100).toFixed(0)+'%;background:var(--red)"></div></div><div class="mbar-val">'+hrs.toFixed(1)+'h</div></div>';}).join('')+'</div><div class="cc"><div class="cc-title">Detail Records</div><div class="tbl-wrap"><table><thead><tr><th style="text-align:left">Plant</th><th style="text-align:left">Category</th><th style="text-align:left">Sub-Cat</th><th>UDT hr</th></tr></thead><tbody>'+rows.slice(0,30).map(r=>{const s=(r.Plant||r.plant||'').toUpperCase();const cat=r.Category||r.category||'';const hrs=gf(r,'Unscheduled Down Time, hr');return '<tr><td>'+dot(s)+s+'</td><td><span class="cat-pill '+(DT_CATS[cat]||'cat-other')+'">'+(cat||'—')+'</span></td><td style="text-align:left;color:var(--text3);font-size:10px">'+(r['Sub-Category']||r.subCategory||'—')+'</td><td class="tr">'+(hrs>0?hrs.toFixed(2):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div></div></div>';
}
// ── PRODUCTION ───────────────────────────────────────────
function renderProduction(){
  const ct=document.getElementById('content-production');
  if(!DATA.production){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('production').then(d=>{DATA.production=d;renderProduction();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const d=DATA.production;const rows=d.weekly||d.rows||[];
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Production — Week '+activeWeek+'</div><div class="sec-line"></div></div><div class="cc"><div class="tbl-wrap"><table><thead><tr><th>Site</th><th>Output mt</th><th>Plan mt</th><th>Plan%</th><th>Run Rate t/hr</th><th>Pellet mt</th><th>Crumble mt</th><th>Mash mt</th></tr></thead><tbody>'+rows.map(r=>{const s=(r.Plant||r.plant||'').toUpperCase();const out=gf(r,'Total Plant Output,mt w/o toll');const plan=gf(r,'Planned, mt','Total Plant Input, mt');const p2=plan>0?(out/plan*100):0;return '<tr><td>'+dot(s)+(SL[s]||s)+'</td><td class="'+(p2>=100?'tg':p2>=85?'ta':'tr')+'">'+(out>0?out.toFixed(1):'—')+'</td><td>'+(plan>0?plan.toFixed(1):'—')+'</td><td class="'+(p2>=100?'tg':p2>=85?'ta':'tr')+'">'+(p2>0?p2.toFixed(1)+'%':'—')+'</td><td>'+fv(gf(r,'Run Rate, ton/hr (net of DT)'),2)+'</td><td>'+fv(gf(r,'Pellet Volume, mt'),1)+'</td><td>'+fv(gf(r,'Crumble Volume, mt'),1)+'</td><td>'+fv(gf(r,'Mash,mt'),1)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
// ── OEE ──────────────────────────────────────────────────
function renderOEE(){
  const ct=document.getElementById('content-oee');
  if(!DATA.oee){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('oee').then(d=>{DATA.oee=d;renderOEE();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const d=DATA.oee;const rows=d.rows||[];const bySite=d.bySite||{};
  const avgOEE=parseFloat(d.totals&&d.totals.avg_oee||0)*100;
  const oC=avgOEE>=85?'var(--green-b)':avgOEE>=70?'var(--amber)':'var(--red)';
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">OEE — Week '+activeWeek+'</div><div class="sec-line"></div></div><div class="g4" style="margin-bottom:12px"><div class="kc" style="--kc-color:'+oC+'"><div class="kc-lbl">Avg OEE</div><div class="kc-val" style="color:'+oC+'">'+(avgOEE>0?avgOEE.toFixed(1):'—')+'<span style="font-size:12px;color:var(--text2)">%</span></div></div></div><div class="cc"><div class="tbl-wrap"><table><thead><tr><th>Site</th><th>OEE%</th><th>Availability%</th><th>Performance%</th><th>Quality%</th><th>Output mt</th></tr></thead><tbody>'+rows.map(r=>{const s=(r.Plant||r.plant||'').toUpperCase();const oee=gf(r,'OEE')*100;const av=gf(r,'AVAILABIILITY','AVAILABILITY')*100;const pf=gf(r,'PERFORMANCE')*100;const ql=gf(r,'QUALITY')*100;const out=gf(r,'Total Plant Output,mt w/o toll');return '<tr><td>'+dot(s)+(SL[s]||s)+'</td><td class="'+(oee>=85?'tg':oee>=70?'ta':oee>0?'tr':'')+'">'+(oee>0?oee.toFixed(1)+'%':'—')+'</td><td>'+(av>0?av.toFixed(1)+'%':'—')+'</td><td>'+(pf>0?pf.toFixed(1)+'%':'—')+'</td><td>'+(ql>0?ql.toFixed(1)+'%':'—')+'</td><td>'+(out>0?out.toFixed(1):'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
// ── COST ANALYTICS ───────────────────────────────────────
function renderCostAnalytics(){
  const ct=document.getElementById('content-cost_analytics');
  if(!DATA.cost_analytics){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('cost_analytics').then(d=>{DATA.cost_analytics=d;renderCostAnalytics();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const d=DATA.cost_analytics;const rows=d.pc_daily||d.rows||[];
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Cost Analytics (PC Daily)</div><div class="sec-line"></div></div><div class="cc"><div class="tbl-wrap"><table><thead><tr><th>Plant</th><th>Date</th><th>Week</th><th>Volume mt</th><th>Variable Cost</th><th>Fixed Cost</th><th>MCOS Php</th><th>MCOS/Ton</th></tr></thead><tbody>'+rows.slice(0,60).map(r=>{const s=(r.PLANT||r.Plant||r.plant||'').toUpperCase();const vol=gf(r,'Volume,MT','TOTAL VOLUME');const mcos=gf(r,'MCOS (Php)');return '<tr><td>'+dot(s)+(SL[s]||s)+'</td><td style="text-align:left">'+(r.DATE||r.Date||r.date||'—')+'</td><td>'+(r.WEEK||r.Week||r.week||'—')+'</td><td>'+(vol>0?vol.toFixed(2):'—')+'</td><td>'+fKK(gf(r,'Variable Cost (P'))+'</td><td>'+fKK(gf(r,'Fixed Cost (Php'))+'</td><td>'+fKK(mcos)+'</td><td>'+fv(gf(r,'MCOS / Ton'),2)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
// ── QUALITY & ENERGY ─────────────────────────────────────
function renderQualityEnergy(){
  const ct=document.getElementById('content-quality_energy');
  if(!DATA.quality_energy){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('quality_energy').then(d=>{DATA.quality_energy=d;renderQualityEnergy();}).catch(e=>ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>');return;}
  const d=DATA.quality_energy;const rows=d.rows||[];
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Quality &amp; Energy (MCOS Daily) — Week '+activeWeek+'</div><div class="sec-line"></div></div><div class="cc"><div class="tbl-wrap"><table><thead><tr><th>Plant</th><th>Date</th><th>Week</th><th>Volume mt</th><th>Variable Cost</th><th>Fixed Cost</th><th>MCOS Php</th><th>MCOS/Ton</th></tr></thead><tbody>'+rows.slice(0,60).map(r=>{const s=(r.PLANT||r.Plant||r.plant||'').toUpperCase();const vol=gf(r,'Volume,MT','volume');const mcos=gf(r,'MCOS (Php)');return '<tr><td>'+dot(s)+(SL[s]||s)+'</td><td style="text-align:left">'+(r.DATE||r.Date||r.date||'—')+'</td><td>'+(r.WEEK||r.Week||r.week||'—')+'</td><td>'+(vol>0?vol.toFixed(2):'—')+'</td><td>'+fKK(gf(r,'Variable Cost (P'))+'</td><td>'+fKK(gf(r,'Fixed Cost (Php'))+'</td><td>'+fKK(mcos)+'</td><td>'+fv(gf(r,'MCOS / Ton'),2)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
// ── START ─────────────────────────────────────────────────
// Safety net: force hide loading after 20s no matter what
setTimeout(function(){
  var el = document.getElementById('loading');
  if(el && el.style.display !== 'none'){
    el.innerHTML = '<div style="font-size:20px;color:var(--red)">✕ Load Timeout</div>' +
      '<div style="font-size:11px;color:var(--text2);font-family:DM Mono,monospace;margin:8px;text-align:center">GAS is not responding via JSONP.<br>Try opening in a different browser.</div>' +
      '<button class="retry-btn" onclick="location.reload()">⟳ Reload</button>' +
      '<button class="retry-btn" style="margin-left:8px;border-color:var(--blue);color:var(--blue)" onclick="forceLoad()">⚡ Force Load</button>';
  }
}, 20000);
// Force load without JSONP - use iframe approach
function forceLoad(){
  var el = document.getElementById('loading');
  if(el) el.innerHTML = '<div style="color:var(--amber);font-family:DM Mono,monospace">Trying alternate method...</div>';
  // Try fetching directly (works if browser allows)
  fetch(GAS + '?tab=weekly&site=National&week=0')
    .then(r=>r.json())
    .then(d=>{
      DATA.weekly=d;
      var weeks=(d.weeks||[]).map(w=>+w).filter(w=>w>0).sort((a,b)=>a-b);
      activeWeek=weeks[weeks.length-1]||21;
      if(el) el.style.display='none';
      buildNav(); render(); scheduleRefresh();
    })
    .catch(e=>{
      if(el) el.innerHTML='<div style="color:var(--red);font-family:DM Mono,monospace">Both methods failed.<br>'+e.message+'<br><br>Please check your network.</div>';
    });
}
loadData(false);
