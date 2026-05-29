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
  var months=DATA.monthly.months||[];
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
  ct.innerHTML=(activeSite==='NATIONAL'?scorecard:'')+kpiCards+kpiCards2+chartSection+projTable;
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
}
function renderCost(){var ct=document.getElementById('content-cost');if(!DATA.cost){ct.innerHTML='<div class="no-data">⟳ Loading...</div>';gasGet('cost').then(function(d){DATA.cost=d;renderCost();}).catch(function(e){ct.innerHTML='<div class="no-data">Error: '+e.message+'</div>';});return;}ct.innerHTML='<div class="no-data">Cost data loaded — '+( DATA.cost.rows||[]).length+' rows</div>';}
function renderDowntime(){
  var ct=document.getElementById('content-downtime');
  if(!DATA.monthly){
    ct.innerHTML='<div class="no-data">⟳ Loading...</div>';
    gasGet('monthly').then(function(d){DATA.monthly=d;renderDowntime();}).catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';});
    return;
  }
  var rows=DATA.monthly.rows||[];
  var months=DATA.monthly.months||[];
  if(!activeMonth||months.indexOf(activeMonth)<0) activeMonth=months[months.length-1]||'';
  var dtPills=document.getElementById('dt-month-pills');
  if(dtPills){
    _monthsList=months;
    dtPills.innerHTML=months.map(function(m,i){
      return '<button class="wk-pill'+(m===activeMonth?' active':'')+'" onclick="setMonth('+i+');renderDowntime()">'+m.slice(0,3)+'</button>';
    }).join('');
    setTimeout(function(){var a=dtPills.querySelector('.wk-pill.active');if(a)a.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},100);
  }
  var mRows=rows.filter(function(r){return String(r.MONTH||r.Month||'').trim()===activeMonth;});
  var dRows=activeSite==='NATIONAL'
    ? mRows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})
    : mRows.filter(function(r){return (r.Plant||'').toUpperCase()===activeSite;});
  function dtHr(r,f1,f2){return gf(r,f1,f2||f1);}
  function dtPct(r,f1,f2){var v=gf(r,f1,f2||f1);return v>1?v:v*100;}
  function sumHr(f1,f2){return dRows.reduce(function(a,r){return a+dtHr(r,f1,f2);},0);}
  function avgPct(f1,f2){
    var v=dRows.reduce(function(a,r){return a+gf(r,f1,f2||f1);},0)/Math.max(dRows.length,1);
    return v>1?v:v*100;
  }
  var sdt  = sumHr('Scheduled Down Time, hr','Scheduled Downtime, hr');
  var udt  = sumHr('Unscheduled Down Time, hr','Unscheduled Downtime, hr');
  var udtP = avgPct('Unscheduled Down Time, %','Unscheduled Downtime, %');
  var eqH  = sumHr('Equipment Downtime, hr','Equipment Down Time, hr');
  var eqP  = avgPct('Equipment Downtime, %','Equipment Down Time, %');
  var prH  = sumHr('Process, hr');
  var prP  = avgPct('Process, %');
  var whH  = sumHr('Warehouse, hr');
  var whP  = avgPct('Warehouse, %');
  var rmH  = sumHr('Raw Materials, hr','Raw Materials, h');
  var rmP  = avgPct('Raw Materials, %');
  var coH  = sumHr('Change Over Downtime, hr');
  var coP  = avgPct('Change Over Downtime, %');
  var pfH  = sumHr('Power Failure, hr','Power Failure, h');
  var pfP  = avgPct('Power Failure, %');
  function dtColor(hrs){return hrs>80?'var(--red)':hrs>40?'var(--amber)':'var(--text)';}
  function pctColor(pct){return pct>5?'var(--red)':pct>3?'var(--amber)':'var(--green-b)';}
  function dtCard(label,hrs,pct,color){
    var hrsC=dtColor(hrs);
    var pctC=pct!==null?pctColor(pct):'var(--text3)';
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-top:2px solid '+hrsC+';border-radius:var(--rl);padding:12px 10px;flex:1;min-width:0">'
      +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;white-space:nowrap">'+label+'</div>'
      +'<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:700;color:'+hrsC+';line-height:1">'+(hrs>0?hrs.toFixed(2):'—')+'<span style="font-size:12px;color:var(--text2);font-family:Barlow,sans-serif"> hr</span></div>'
      +(pct!==null?'<div style="font-family:DM Mono,monospace;font-size:11px;font-weight:600;color:'+pctC+';margin-top:4px">'+(pct>0?pct.toFixed(2)+'%':'0.00%')+'</div>':'')
      +'</div>';
  }
  var elH  = sumHr('Electrical, hr');
  var elP  = avgPct('Electrical, %');
  var meH  = sumHr('Mechanical, hr');
  var meP  = avgPct('Mechanical, %');
  var plH  = sumHr('PLC, hr');
  var plP  = avgPct('PLC, %');
  // Row 2: Change Over = col AC/AF, Change Die = col AD/AG
  var coACH = sumHr('Change Over, hr');
  var coACP = avgPct('Change Over, %');
  var cdH  = sumHr('Change Die, hr');
  var cdP  = avgPct('Change Die, %');
  var csH  = sumHr('Change Screen, hr');
  var csP  = avgPct('Change Screen, %');
  ct.innerHTML='<div class="sec"><div class="sec-hdr"><div class="sec-title">Downtime Scorecard — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · '+activeMonth+'</div><div class="sec-line"></div></div>'
    +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-family:DM Mono,monospace">Overall Downtime</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:10px">'
    +dtCard('Scheduled DT',sdt,null,'var(--text3)')
    +dtCard('Unscheduled DT',udt,udtP,'var(--red)')
    +dtCard('Equipment',eqH,eqP,'var(--red)')
    +dtCard('Process',prH,prP,'var(--amber)')
    +dtCard('Warehouse',whH,whP,'var(--blue)')
    +dtCard('Raw Materials',rmH,rmP,'var(--purple)')
    +dtCard('Change Over DT',coH,coP,'var(--teal)')
    +dtCard('Power Failure',pfH,pfP,'var(--amber)')
    +'</div>'
    +'<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-family:DM Mono,monospace">Equipment &amp; Change Over Breakdown</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto">'
    +dtCard('Electrical',elH,elP,'var(--red)')
    +dtCard('Mechanical',meH,meP,'var(--red)')
    +dtCard('PLC',plH,plP,'var(--amber)')
    +dtCard('Change Over',coACH,coACP,'var(--teal)')
    +dtCard('Change Die',cdH,cdP,'var(--teal)')
    +dtCard('Change Screen',csH,csP,'var(--teal)')
    +'</div></div>';
  // ── LOAD DOWNTIME SHEET DATA ─────────────────────────────
  var dtWrap=document.getElementById('dt-data-wrap');
  if(dtWrap) dtWrap.innerHTML='<div class="no-data">⟳ Loading downtime records...</div>';
  gasGet('downtime',{site:activeSite,week:''}).then(function(d){
    DATA.downtime=d;
    var dtWrap=document.getElementById('dt-data-wrap');
    if(!dtWrap) return;
    var allRows=d.rows||[];
    var udtTotal=d.udtTotal||0;
    var uniqueMonths=[...new Set(allRows.map(function(r){return r.Month||''}))].filter(Boolean);
    var uniquePlants=[...new Set(allRows.map(function(r){return r.Plant||''}))].filter(Boolean);
    console.log('DT months:',uniqueMonths,'plants:',uniqueMonths,'activeMonth:',activeMonth,'activeSite:',activeSite,'total rows:',allRows.length);
    console.log('Available months:',d.uniqueMonths,'Total rows:',d.totalRows);
    // Filter by active month - use _monthUpper for reliability
    var mFiltered=allRows.filter(function(r){
      var rMonth=r._monthUpper||String(r.Month||'').trim().toUpperCase();
      return rMonth===activeMonth.toUpperCase();
    });
    console.log('Filtered rows for',activeMonth,':',mFiltered.length);
    if(!mFiltered.length&&allRows.length>0){
      var dtWrap2=document.getElementById('dt-data-wrap');
      if(dtWrap2) dtWrap2.innerHTML='<div class="no-data" style="color:var(--amber)">No records for '+activeMonth+'. Available months: '+(d.uniqueMonths||[]).join(', ')+'<br>Total records: '+allRows.length+'</div>';
      return;
    }
    var mPareto={};
    mFiltered.forEach(function(r){
      if(r['Unscheduled Downtime']>0){
        mPareto[r.Category]=(mPareto[r.Category]||0)+r['Unscheduled Downtime'];
      }
    });
    var paretoArr=Object.keys(mPareto).map(function(k){return {category:k,hrs:mPareto[k]};})
      .sort(function(a,b){return b.hrs-a.hrs;});
    var mUDTTotal=paretoArr.reduce(function(a,x){return a+x.hrs;},0);
    var cumPct=0;
    var pareto80=[];
    paretoArr.forEach(function(p){
      cumPct+=mUDTTotal>0?p.hrs/mUDTTotal*100:0;
      pareto80.push({category:p.category,hrs:p.hrs,cumPct:cumPct});
    });
    var paretoSection='<div class="sec"><div class="sec-hdr"><div class="sec-title">UDT Pareto Analysis — '+activeMonth+'</div><div class="sec-line"></div></div>'
      +'<div class="g2">'
      +'<div class="cc"><div class="cc-title">Pareto Chart — UDT by Category</div>'
      +'<div style="position:relative;height:220px"><canvas id="dt-pareto-chart"></canvas></div></div>'
      +'<div class="cc"><div class="cc-title">80% Contribution Summary</div>'
      +'<div class="tbl-wrap"><table><thead><tr>'
      +'<th style="text-align:left">Category</th><th>UDT hrs</th><th>%</th><th>Cum%</th>'
      +'</tr></thead><tbody>'
      +pareto80.map(function(p,i){
        var pct=mUDTTotal>0?(p.hrs/mUDTTotal*100):0;
        var is80=p.cumPct<=80.01;
        return '<tr style="'+(is80?'background:rgba(248,81,73,0.07)':'')+'">'
          +'<td style="text-align:left">'+(is80?'<span style="color:var(--red);font-weight:700">':'')
          +p.category+(is80?'</span>':'')+'</td>'
          +'<td>'+p.hrs.toFixed(2)+'</td>'
          +'<td>'+pct.toFixed(1)+'%</td>'
          +'<td class="'+(p.cumPct<=80?'tr':'')+'">'+(p.cumPct>100?100:p.cumPct).toFixed(1)+'%</td>'
          +'</tr>';
      }).join('')
      +'</tbody></table></div></div>'
      +'</div></div>';
    function dtTable(title,rows,dtField){
      if(!rows.length) return '<div class="cc"><div class="cc-title">'+title+'</div><div class="no-data">No records</div></div>';
      return '<div class="cc"><div class="cc-title">'+title+' ('+rows.length+' records)</div>'
        +'<div class="tbl-wrap" style="max-height:320px;overflow-y:auto"><table>'
        +'<thead><tr>'
        +'<th>Plant</th><th>Month</th><th>Wk</th><th>Shift</th><th>Machine Line</th>'
        +'<th style="text-align:left">Category</th><th style="text-align:left">Sub-Category</th>'
        +'<th style="text-align:left">Reason of Delay</th><th>'+dtField+'</th>'
        +'</tr></thead><tbody>'
        +rows.slice(0,200).map(function(r){
          var val=r[dtField]||0;
          return '<tr>'
            +'<td>'+dot((r.Plant||'').toUpperCase())+(r.Plant||'—')+'</td>'
            +'<td>'+(r.Month||'—')+'</td>'
            +'<td>'+(r.Week||'—')+'</td>'
            +'<td>'+(r.Shift||'—')+'</td>'
            +'<td>'+(r['Machine Line']||'—')+'</td>'
            +'<td style="text-align:left"><span class="cat-pill '+(DT_CATS[r.Category||'']||'cat-other')+'">'+(r.Category||'—')+'</span></td>'
            +'<td style="text-align:left;font-size:10px;color:var(--text2)">'+(r['Sub-Category']||'—')+'</td>'
            +'<td style="text-align:left;font-size:10px;color:var(--text3);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(r['Reason of Delay']||'—')+'</td>'
            +'<td class="'+(val>0?'tr':'')+'">'+(val>0?val.toFixed(2):'—')+'</td>'
            +'</tr>';
        }).join('')
        +'</tbody></table></div></div>';
    }
    var udtRows=mFiltered.filter(function(r){return r['Unscheduled Downtime']>0;})
      .sort(function(a,b){return b['Unscheduled Downtime']-a['Unscheduled Downtime'];});
    var sdtRows=mFiltered.filter(function(r){return r['Scheduled Downtime']>0;})
      .sort(function(a,b){return b['Scheduled Downtime']-a['Scheduled Downtime'];});
    var coRows=mFiltered.filter(function(r){return r['No. Of Change Over']>0;})
      .sort(function(a,b){return b['No. Of Change Over']-a['No. Of Change Over'];});
    // Build 80% UDT breakdown table - grouped and totaled
    var breakdown80={};
    var cumHrs=0;
    // Only include rows from categories in the 80% pareto
    pareto80.filter(function(p){return p.cumPct<=80.01;}).forEach(function(p){
      mFiltered.filter(function(r){
        return r.Category===p.category && r['Unscheduled Downtime']>0;
      }).forEach(function(r){
        var key=r.Plant+'||'+r.Category+'||'+(r['Sub-Category']||'')+'||'+(r['Reason of Delay']||'');
        if(!breakdown80[key]){
          breakdown80[key]={
            Plant:r.Plant, Month:r.Month, Category:r.Category,
            'Sub-Category':r['Sub-Category']||'',
            'Reason of Delay':r['Reason of Delay']||'',
            'Unscheduled Downtime':0
          };
        }
        breakdown80[key]['Unscheduled Downtime']+=r['Unscheduled Downtime'];
      });
    });
    var bd80Rows=Object.values(breakdown80)
      .sort(function(a,b){return b['Unscheduled Downtime']-a['Unscheduled Downtime'];});
    var bd80Total=bd80Rows.reduce(function(a,r){return a+r['Unscheduled Downtime'];},0);
    var bd80Section='<div class="sec"><div class="sec-hdr"><div class="sec-title">80% UDT Breakdown — '+activeMonth+' (Grouped &amp; Totaled)</div><div class="sec-line"></div></div>'
      +(bd80Rows.length?
        '<div class="cc"><div class="tbl-wrap" style="max-height:360px;overflow-y:auto"><table>'
        +'<thead><tr>'
        +'<th>Plant</th><th>Month</th>'
        +'<th style="text-align:left">Category</th>'
        +'<th style="text-align:left">Sub-Category</th>'
        +'<th style="text-align:left">Reason of Delay</th>'
        +'<th>UDT hrs</th><th>%</th>'
        +'</tr></thead><tbody>'
        +bd80Rows.map(function(r){
          var pct=bd80Total>0?(r['Unscheduled Downtime']/bd80Total*100):0;
          return '<tr>'
            +'<td>'+dot((r.Plant||'').toUpperCase())+(r.Plant||'—')+'</td>'
            +'<td>'+(r.Month||activeMonth)+'</td>'
            +'<td style="text-align:left"><span class="cat-pill '+(DT_CATS[r.Category||'']||'cat-other')+'">'+(r.Category||'—')+'</span></td>'
            +'<td style="text-align:left;font-size:10px;color:var(--text2)">'+(r['Sub-Category']||'—')+'</td>'
            +'<td style="text-align:left;font-size:10px;color:var(--text3);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(r['Reason of Delay']||'—')+'</td>'
            +'<td class="tr" style="font-family:DM Mono,monospace;font-weight:600">'+r['Unscheduled Downtime'].toFixed(2)+'</td>'
            +'<td style="color:var(--text2);font-size:10px">'+pct.toFixed(1)+'%</td>'
            +'</tr>';
        }).join('')
        +'<tr style="border-top:2px solid var(--border);background:var(--bg3)">'
        +'<td colspan="5" style="text-align:right;font-weight:700;color:var(--text)">TOTAL</td>'
        +'<td class="tr" style="font-family:DM Mono,monospace;font-weight:700">'+bd80Total.toFixed(2)+'</td>'
        +'<td style="color:var(--text2)">100%</td>'
        +'</tr>'
        +'</tbody></table></div></div>'
        :'<div class="no-data">No 80% breakdown data</div>')
      +'</div>';
    var tablesSection='<div class="sec"><div class="sec-hdr"><div class="sec-title">Downtime Detail Records — '+activeMonth+'</div><div class="sec-line"></div></div>'
      +dtTable('Unscheduled Downtime Records',udtRows,'Unscheduled Downtime')
      +'<div style="margin-top:8px"></div>'
      +dtTable('Scheduled Downtime Records',sdtRows,'Scheduled Downtime')
      +'<div style="margin-top:8px"></div>'
      +dtTable('Change Over Records',coRows,'No. Of Change Over')
      +'</div>';
    dtWrap.innerHTML=paretoSection+bd80Section+tablesSection;
    var ctx=document.getElementById('dt-pareto-chart');
    if(ctx){
      if(charts['dt-pareto']){try{charts['dt-pareto'].destroy();}catch(e){}}
      charts['dt-pareto']=new Chart(ctx.getContext('2d'),{
        data:{
          labels:paretoArr.map(function(p){return p.category;}),
          datasets:[
            {type:'bar',label:'UDT hrs',data:paretoArr.map(function(p){return +p.hrs.toFixed(2);}),
             backgroundColor:'rgba(248,81,73,0.6)',borderRadius:3,yAxisID:'y'},
            {type:'line',label:'Cumulative %',
             data:(function(){var c=0;return paretoArr.map(function(p){c+=mUDTTotal>0?p.hrs/mUDTTotal*100:0;return +c.toFixed(1);});}()),
             borderColor:'#388bfd',backgroundColor:'transparent',tension:.3,pointRadius:4,spanGaps:true,yAxisID:'y1'},
            {type:'line',label:'80% line',data:paretoArr.map(function(){return 80;}),
             borderColor:'rgba(63,185,80,0.6)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,yAxisID:'y1'}
          ]
        },
        options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
          plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},
            tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
          scales:{
            x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9},maxRotation:30}},
            y:{position:'left',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#484f58',font:{size:9}},title:{display:true,text:'Hours',color:'#484f58',font:{size:9}}},
            y1:{position:'right',grid:{display:false},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},min:0,max:100}
          }}
      });
    }
  }).catch(function(e){
    var dtWrap=document.getElementById('dt-data-wrap');
    if(dtWrap) dtWrap.innerHTML='<div class="no-data" style="color:var(--red)">Error loading downtime data: '+e.message+'</div>';
  });
}
function renderProduction(){var ct=document.getElementById('content-production');ct.innerHTML='<div class="no-data">Production tab</div>';}
function renderOEE(){
  var ct=document.getElementById('content-oee');
  if(!DATA.oee_data){
    ct.innerHTML='<div class="no-data">⟳ Loading OEE data...</div>';
    gasGet('oee_data',{site:activeSite}).then(function(d){
      if(d.error){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+d.error+'</div>';return;}
      DATA.oee_data=d;
      renderOEE();
    }).catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">Error: '+e.message+'</div>';});
    return;
  }
  var rows=DATA.oee_data.rows||[];
  var months=DATA.oee_data.months||[];
  var allSites=DATA.oee_data.sites||[];
  var siteRows=activeSite==='NATIONAL'
    ? rows.filter(function(r){return r.site==='NATIONAL';})
    : rows.filter(function(r){return r.site===activeSite;});
  var latest=siteRows.length?siteRows[siteRows.length-1]:{oee:0,availability:0,performance:0,quality:0,month:''};
  var latestMonth=latest.month||months[months.length-1]||'';
  function oeeColor(v){return v>=85?'#3fb950':v>=70?'#d29922':'#f85149';}
  function oeeGrade(v){return v>=85?'World Class':v>=70?'Acceptable':'Needs Improvement';}
  var pieColors=['#3fb950','#388bfd','#a371f7','#d29922'];
  ct.innerHTML=
    '<div class="sec"><div class="sec-hdr"><div class="sec-title">OEE Dashboard — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+' · '+latestMonth+'</div><div class="sec-line"></div></div>'
    +'<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">'
    +'<div class="cc" style="flex:0 0 280px;text-align:center">'
    +'<div class="cc-title">Overall OEE</div>'
    +'<div style="position:relative;height:220px"><canvas id="oee-big-pie"></canvas></div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:36px;font-weight:700;color:'+oeeColor(latest.oee)+';margin-top:-8px">'+latest.oee.toFixed(1)+'%</div>'
    +'<div style="font-size:10px;font-family:DM Mono,monospace;color:'+oeeColor(latest.oee)+'">'+oeeGrade(latest.oee)+'</div>'
    +'<div style="font-size:9px;color:var(--text3);margin-top:4px">World Class Target: 85%</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px;flex:1">'
    +'<div style="display:flex;gap:8px">'
    +'<div class="cc" style="flex:1;text-align:center">'
    +'<div class="cc-title" style="color:#388bfd">Availability</div>'
    +'<div style="position:relative;height:120px"><canvas id="oee-av-pie"></canvas></div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:700;color:'+oeeColor(latest.availability)+'">'+latest.availability.toFixed(1)+'%</div>'
    +'<div style="font-size:9px;color:var(--text3)">Operating Time / Planned Time</div>'
    +'</div>'
    +'<div class="cc" style="flex:1;text-align:center">'
    +'<div class="cc-title" style="color:#a371f7">Performance</div>'
    +'<div style="position:relative;height:120px"><canvas id="oee-perf-pie"></canvas></div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:700;color:'+oeeColor(latest.performance)+'">'+latest.performance.toFixed(1)+'%</div>'
    +'<div style="font-size:9px;color:var(--text3)">Actual vs Net Operating Time</div>'
    +'</div>'
    +'<div class="cc" style="flex:1;text-align:center">'
    +'<div class="cc-title" style="color:#d29922">Quality</div>'
    +'<div style="position:relative;height:120px"><canvas id="oee-qual-pie"></canvas></div>'
    +'<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:700;color:'+oeeColor(latest.quality)+'">'+latest.quality.toFixed(1)+'%</div>'
    +'<div style="font-size:9px;color:var(--text3)">Good Output / Total Output</div>'
    +'</div>'
    +'</div>'
    +'</div></div></div>'
    +'<div class="sec"><div class="sec-hdr"><div class="sec-title">OEE Trend — '+(activeSite==='NATIONAL'?'National':SL[activeSite])+'</div><div class="sec-line"></div></div>'
    +'<div class="cc"><div style="position:relative;height:200px"><canvas id="oee-trend"></canvas></div></div></div>'
    +'<div class="sec"><div class="sec-hdr"><div class="sec-title">Monthly OEE Summary</div><div class="sec-line"></div></div>'
    +'<div class="cc"><div class="tbl-wrap"><table>'
    +'<thead><tr><th>Month</th><th>Site</th><th>OEE %</th><th>Availability %</th><th>Performance %</th><th>Quality %</th><th>Status</th></tr></thead>'
    +'<tbody>'
    +(activeSite==='NATIONAL'
      ? months.map(function(m){
          return ['AC','PFMIS','HOREB','ARGAO','BUKID','NATIONAL'].map(function(s){
            var r=rows.find(function(x){return x.month===m&&x.site===s;});
            if(!r) return '';
            return '<tr><td>'+m+'</td><td>'+dot(s)+s+'</td>'
              +'<td class="'+(r.oee>=85?'tg':r.oee>=70?'ta':r.oee>0?'tr':'')+'" style="font-weight:700">'+( r.oee>0?r.oee.toFixed(1)+'%':'—')+'</td>'
              +'<td>'+(r.availability>0?r.availability.toFixed(1)+'%':'—')+'</td>'
              +'<td>'+(r.performance>0?r.performance.toFixed(1)+'%':'—')+'</td>'
              +'<td>'+(r.quality>0?r.quality.toFixed(1)+'%':'—')+'</td>'
              +'<td><span class="bdg '+(r.oee>=85?'g':r.oee>=70?'a':r.oee>0?'r':'b')+'">'+oeeGrade(r.oee)+'</span></td>'
              +'</tr>';
          }).join('');
        }).join('')
      : siteRows.map(function(r){
          return '<tr><td>'+r.month+'</td><td>'+dot(r.site)+r.site+'</td>'
            +'<td class="'+(r.oee>=85?'tg':r.oee>=70?'ta':r.oee>0?'tr':'')+'" style="font-weight:700">'+( r.oee>0?r.oee.toFixed(1)+'%':'—')+'</td>'
            +'<td>'+(r.availability>0?r.availability.toFixed(1)+'%':'—')+'</td>'
            +'<td>'+(r.performance>0?r.performance.toFixed(1)+'%':'—')+'</td>'
            +'<td>'+(r.quality>0?r.quality.toFixed(1)+'%':'—')+'</td>'
            +'<td><span class="bdg '+(r.oee>=85?'g':r.oee>=70?'a':r.oee>0?'r':'b')+'">'+oeeGrade(r.oee)+'</span></td>'
            +'</tr>';
        }).join('')
    )
    +'</tbody></table></div></div></div>'
    +'<div class="sec" id="oee-analysis-wrap"><div class="sec-hdr"><div class="sec-title">OEE Analysis &amp; Recommendations</div><div class="sec-line"></div></div>'
    +'<div class="cc"><div class="no-data">⟳ Generating analysis...</div></div></div>';
  ['oee-big-pie','oee-av-pie','oee-perf-pie','oee-qual-pie','oee-trend'].forEach(function(id){
    if(charts[id]){try{charts[id].destroy();}catch(e){}}
  });
  var gc='rgba(255,255,255,0.04)';
  var sc={grid:{color:gc},ticks:{color:'#484f58',font:{size:9}}};
  function donut(id,val,color,max){
    var cv=document.getElementById(id); if(!cv) return;
    var v=Math.min(val,max||120);
    charts[id]=new Chart(cv.getContext('2d'),{
      type:'doughnut',
      data:{datasets:[{
        data:[v,Math.max(0,(max||100)-v)],
        backgroundColor:[color,'rgba(255,255,255,0.06)'],
        borderWidth:0, cutout:'75%'
      }]},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},
        plugins:{legend:{display:false},tooltip:{enabled:false}}}
    });
  }
  donut('oee-big-pie', latest.oee,       oeeColor(latest.oee),       100);
  donut('oee-av-pie',  latest.availability, '#388bfd', 100);
  donut('oee-perf-pie',latest.performance,  '#a371f7', 120);
  donut('oee-qual-pie',latest.quality,      '#d29922', 100);
  var mLabels=siteRows.map(function(r){return r.month.slice(0,3);});
  var oeeVals=siteRows.map(function(r){return r.oee>0?r.oee:null;});
  var avVals=siteRows.map(function(r){return r.availability>0?r.availability:null;});
  var perfVals=siteRows.map(function(r){return r.performance>0?r.performance:null;});
  var qualVals=siteRows.map(function(r){return r.quality>0?r.quality:null;});
  var trendCv=document.getElementById('oee-trend');
  if(trendCv) charts['oee-trend']=new Chart(trendCv.getContext('2d'),{
    type:'line',
    data:{labels:mLabels,datasets:[
      {label:'OEE %',data:oeeVals,borderColor:'#3fb950',backgroundColor:'rgba(63,185,80,0.08)',fill:true,tension:.3,pointRadius:5,spanGaps:true,
       pointBackgroundColor:oeeVals.map(function(v){return !v?'grey':v>=85?'#3fb950':v>=70?'#d29922':'#f85149';})},
      {label:'Availability',data:avVals,borderColor:'#388bfd',backgroundColor:'transparent',tension:.3,pointRadius:3,spanGaps:true},
      {label:'Performance',data:perfVals,borderColor:'#a371f7',backgroundColor:'transparent',tension:.3,pointRadius:3,spanGaps:true},
      {label:'Quality',data:qualVals,borderColor:'#d29922',backgroundColor:'transparent',tension:.3,pointRadius:3,spanGaps:true},
      {label:'85% Target',data:mLabels.map(function(){return 85;}),borderColor:'rgba(63,185,80,0.4)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:200},
      plugins:{legend:{display:true,labels:{color:'#8b949e',font:{size:9},boxWidth:10}},
        tooltip:{backgroundColor:'#1f2631',borderColor:'rgba(255,255,255,.1)',borderWidth:1,bodyFont:{family:"'DM Mono',monospace",size:10}}},
      scales:{x:sc,y:{grid:{color:gc},ticks:{color:'#484f58',font:{size:9},callback:function(v){return v+'%';}},min:0,max:130}}}
  });
  buildOEEAnalysis(siteRows, activeSite);
}
function buildOEEAnalysis(siteRows, site){
  var wrap=document.getElementById('oee-analysis-wrap');
  if(!wrap||!siteRows.length) return;
  var summary=siteRows.map(function(r){
    return r.month+': OEE='+r.oee+'%, Availability='+r.availability+'%, Performance='+r.performance+'%, Quality='+r.quality+'%';
  }).join('; ');
  var prompt='You are a manufacturing OEE analyst for a feedmill operation. Analyze this OEE data for '
    +(site==='NATIONAL'?'National aggregate':'site '+site)+' and provide:
'
    +'1. Overall performance assessment (2-3 sentences)
'
    +'2. Key findings: which metric (Availability/Performance/Quality) needs most improvement and why
'
    +'3. Top 2-3 specific actionable recommendations
'
    +'4. Best performing month and what drove it
'
    +'Data: '+summary+'
'
    +'World class OEE = 85%+. Keep response concise and operational. Use bullet points.';
  fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:600,
      messages:[{role:'user',content:prompt}]
    })
  }).then(function(r){return r.json();})
  .then(function(d){
    var text=d.content&&d.content[0]?d.content[0].text:'Analysis unavailable';
    var html=text
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/^### (.*)/gm,'<div style="font-size:11px;font-weight:700;color:var(--text);margin:10px 0 4px">$1</div>')
      .replace(/^## (.*)/gm,'<div style="font-size:12px;font-weight:700;color:var(--text);margin:10px 0 4px">$1</div>')
      .replace(/^\* (.*)/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--green-b)">▸</span><span>$1</span></div>')
      .replace(/^- (.*)/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--green-b)">▸</span><span>$1</span></div>')
      .replace(/^\d+\. (.*)/gm,'<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--blue)">●</span><span>$1</span></div>')
      .replace(/
/g,'');
    if(wrap) wrap.querySelector('.cc').innerHTML='<div style="font-size:11px;line-height:1.8;color:var(--text2);font-family:Barlow,sans-serif">'+html+'</div>';
  }).catch(function(){
    if(wrap) wrap.querySelector('.cc').innerHTML='<div class="no-data">Analysis unavailable</div>';
  });
}
function renderCostAnalytics(){var ct=document.getElementById('content-cost_analytics');ct.innerHTML='<div class="no-data">Cost Analytics tab</div>';}
function renderQualityEnergy(){var ct=document.getElementById('content-quality_energy');ct.innerHTML='<div class="no-data">Quality & Energy tab</div>';}
// ── START ──────────────────────────────────────────────────
loadData(false);
