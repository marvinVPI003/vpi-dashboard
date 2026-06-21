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
// ── WEEKLY REPORT GENERATOR (.docx) ─────────────────────────
async function downloadWeeklyReport(){
  var btn = document.getElementById('weekly-report-btn');
  var origText = btn.innerHTML;
  btn.innerHTML = '⟳ Building...';
  btn.disabled = true;
  try {
    var wk = activeWeek;
    var weeklyD = DATA.weekly || await gasGet('weekly');
    var downtimeD = await gasGet('downtime', {site:'NATIONAL'});
    var forecastD = DATA.forecast || await gasGet('forecast');
    var costD = await gasGet('pcdaily', {site:'NATIONAL', week:wk});

    var wrows = (weeklyD.rows||[]).filter(function(r){return +r.Week===+wk;});
    var natRow = wrows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})[0];
    var siteRowsRaw = wrows.filter(function(r){return (r.Plant||'').toUpperCase()!=='NATIONAL';});

    var prevWk = wk-1;
    var prevRows = (weeklyD.rows||[]).filter(function(r){return +r.Week===+prevWk;});
    var prevNat = prevRows.filter(function(r){return (r.Plant||'').toUpperCase()==='NATIONAL';})[0];

    var dtRows = (downtimeD.rows||[]).filter(function(r){return String(r.Week)===String(wk);});
    var udtByCat = {}, udtByPlant = {};
    dtRows.forEach(function(r){
      var u = r['Unscheduled Downtime']||0;
      udtByCat[r.Category] = (udtByCat[r.Category]||0) + u;
      udtByPlant[r.Plant] = (udtByPlant[r.Plant]||0) + u;
    });
    var topCats = Object.keys(udtByCat).map(function(k){return {cat:k, hrs:udtByCat[k]};}).filter(function(x){return x.hrs>0;}).sort(function(a,b){return b.hrs-a.hrs;});
    var topPlants = Object.keys(udtByPlant).map(function(k){return {plant:k, hrs:udtByPlant[k]};}).filter(function(x){return x.hrs>0;}).sort(function(a,b){return b.hrs-a.hrs;});

    var fAreas = forecastD.rows||[];
    var fNat = forecastD.national || {};

    var cRows = (costD.rows||[]).filter(function(r){return r.Plant==='NATIONAL';});
    var totalVol = cRows.reduce(function(a,r){return a+(r.TotalVolume||0);},0);
    var totalCost = cRows.reduce(function(a,r){return a+(r.CostTotal||0);},0);
    var totalFixed = cRows.reduce(function(a,r){return a+(r.FixedTotal||0);},0);
    var totalVar = cRows.reduce(function(a,r){return a+(r.VarTotal||0);},0);

    var doc = buildWeeklyReportDoc({
      week: wk, natRow: natRow, siteRows: siteRowsRaw, prevNat: prevNat,
      topCats: topCats, topPlants: topPlants, dtRows: dtRows,
      fAreas: fAreas, fNat: fNat,
      cRows: cRows, totalVol: totalVol, totalCost: totalCost, totalFixed: totalFixed, totalVar: totalVar
    });

    var blob = await docx.Packer.toBlob(doc);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'VPI_Weekly_Report_Week' + wk + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e){
    alert('Error building report: ' + e.message);
    console.error(e);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

function buildWeeklyReportDoc(d){
  var D = docx;
  var navy = "1F3864", lightBlue="DCE6F1", greenBg="E2EFDA", redBg="FCE4E4", amberBg="FFF2CC";
  var border = { style: D.BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  var borders = { top: border, bottom: border, left: border, right: border };

  function fmtN(n,dec){ if(n===undefined||n===null||isNaN(n)) return '\u2014'; dec=dec===undefined?1:dec; return n.toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
  function pesoM(n){ if(!n) return '\u2014'; return (n/1000000).toFixed(2)+'M'; }
  function pct(n){ if(n===undefined||n===null||isNaN(n)) return '\u2014'; return (n*100).toFixed(1)+'%'; }
  function pctChange(a,b){ if(!a||!b) return '\u2014'; var c=(a-b)/b*100; return (c>=0?'+':'')+c.toFixed(1)+'%'; }

  function cell(text, opts){
    opts = opts||{};
    return new D.TableCell({
      borders: borders,
      width: { size: opts.width||1500, type: D.WidthType.DXA },
      shading: opts.fill ? { fill: opts.fill, type: D.ShadingType.CLEAR } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      verticalAlign: D.VerticalAlign.CENTER,
      children: [new D.Paragraph({
        alignment: opts.align || D.AlignmentType.LEFT,
        children: [new D.TextRun({ text: String(text), bold: opts.bold||false, size: opts.size||18, color: opts.color||"000000" })]
      })]
    });
  }
  function headerRow(headers, widths){
    return new D.TableRow({ tableHeader:true, children: headers.map(function(h,i){
      return cell(h, {fill:navy, color:"FFFFFF", bold:true, width:widths[i], align: i===0?D.AlignmentType.LEFT:D.AlignmentType.CENTER, size:16});
    })});
  }
  function dataRow(cells, widths, opts){
    opts=opts||{};
    return new D.TableRow({ children: cells.map(function(c,i){
      return cell(c, {width:widths[i], align: i===0?D.AlignmentType.LEFT:D.AlignmentType.CENTER, fill:opts.fill, bold:opts.bold});
    })});
  }
  function sectionHeading(text){
    return new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children:[new D.TextRun(text)],
      border:{bottom:{style:D.BorderStyle.SINGLE, size:6, color:navy, space:4}} });
  }
  function subHeading(text){ return new D.Paragraph({heading: D.HeadingLevel.HEADING_2, children:[new D.TextRun(text)]}); }
  function bodyText(text, opts){ opts=opts||{}; return new D.Paragraph({spacing:{after:120}, children:[new D.TextRun({text:text, italics:opts.italics||false, bold:opts.bold||false, size:20})]}); }
  function bullet(text){ return new D.Paragraph({numbering:{reference:"bullets", level:0}, spacing:{after:60}, children:[new D.TextRun({text:text, size:20})]}); }

  var siteRows = (d.siteRows||[]).map(function(r){
    var output = r['Total Plant Output,mt']||0;
    var planned = r['Planned, mt']||0;
    var attain = planned>0 ? output/planned : 0;
    var oee = r.OEE;
    var udt = r['Unscheduled Down Time, hr']||0;
    var lowOee = (oee!==undefined && oee!==null && oee!=='' && oee<0.85);
    var highUdt = udt > 20;
    return dataRow([
      r.Plant, fmtN(output,1), fmtN(planned,1), pct(attain),
      (oee===undefined||oee===null||oee==='')?'N/A':pct(oee),
      fmtN(udt,1)
    ], [1800,1300,1300,1180,1300,1300], { fill: (lowOee||highUdt) ? amberBg : undefined });
  });

  var natOutput = d.natRow ? d.natRow['Total Plant Output,mt']||0 : 0;
  var natPlanned = d.natRow ? d.natRow['Planned, mt']||0 : 0;
  var natOee = d.natRow ? d.natRow.OEE : null;
  var natUdt = d.natRow ? d.natRow['Unscheduled Down Time, hr']||0 : 0;
  var prevOutput = d.prevNat ? d.prevNat['Total Plant Output,mt']||0 : 0;
  var prevOee = d.prevNat ? d.prevNat.OEE : null;
  var prevUdt = d.prevNat ? d.prevNat['Unscheduled Down Time, hr']||0 : 0;

  var catRows = (d.topCats||[]).slice(0,8).map(function(c){
    return dataRow([c.cat, fmtN(c.hrs,2)+' hrs'], [6885,2295]);
  });
  var plantUdtRows = (d.topPlants||[]).map(function(p){
    return dataRow([p.plant, fmtN(p.hrs,2)+' hrs'], [6885,2295]);
  });

  var areaRows = (d.fAreas||[]).map(function(a){
    var mtdPct = parseFloat(a.MTDPct)||0;
    var remDays = a.RemDays;
    var fillC = (remDays!==undefined && remDays<-5) ? redBg : (remDays<0 ? amberBg : undefined);
    return dataRow([
      a.Area, pesoM(a.Forecast), pesoM(a.MTDPullout), pct(mtdPct),
      (remDays===undefined?'\u2014':remDays.toFixed(1))
    ], [1800,1800,1800,1890,1890], {fill: a.Area==='NATIONAL'?lightBlue:fillC, bold: a.Area==='NATIONAL'});
  });

  var costCats = [
    {name:'Rental', field:'RentalTon'}, {name:'Spareparts', field:'SPTon'},
    {name:'Manpower Direct', field:'MPTon'}, {name:'Power', field:'PowerTon'},
    {name:'Fuel', field:'FuelTon'}, {name:'Coal', field:'CoalTon'},
    {name:'Agency Manpower', field:'AgencyTon'}, {name:'Others', field:'OthersTon'}
  ];
  var avgCostTon = d.totalVol>0 ? d.totalCost/d.totalVol : 0;
  var costRows = costCats.map(function(c){
    var vals = (d.cRows||[]).map(function(r){return r[c.field]||0;}).filter(function(v){return v>0;});
    var avg = vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : 0;
    var share = avgCostTon>0 ? avg/avgCostTon*100 : 0;
    return {row: dataRow([c.name, '\u20b1'+fmtN(avg,2), share.toFixed(1)+'%'], [3060,3060,3060]), avg: avg};
  }).sort(function(a,b){return b.avg-a.avg;}).map(function(x){return x.row;});

  var weekLabel = 'Week ' + d.week;
  var attainPct = natPlanned>0 ? natOutput/natPlanned : 0;

  var summaryText = "National output reached "+fmtN(natOutput,1)+" mt against a plan of "+fmtN(natPlanned,1)+" mt ("+pct(attainPct)+" attainment)";
  if(prevOutput) summaryText += ", "+(natOutput>=prevOutput?'up':'down')+" "+Math.abs(parseFloat(pctChange(natOutput,prevOutput))).toFixed(1)+"% from the prior week's "+fmtN(prevOutput,1)+" mt";
  summaryText += ". National OEE was "+(natOee?pct(natOee):'N/A');
  if(prevOee && natOee) summaryText += (natOee>=prevOee?", up ":", down ")+Math.abs((natOee-prevOee)*100).toFixed(1)+" points week-over-week";
  summaryText += ". Unscheduled downtime totaled "+fmtN(natUdt,1)+" hours";
  if(prevUdt) summaryText += (natUdt<=prevUdt?", an improvement of ":", an increase of ")+fmtN(Math.abs(natUdt-prevUdt),1)+" hours vs. the prior week";
  summaryText += ". Production cost averaged \u20b1"+fmtN(avgCostTon,0)+"/ton for the week.";

  // ── COMMENT GENERATION ──────────────────────────────────
  var rawSiteRows = d.siteRows||[];

  // 1. Production Performance comments
  var prodComments = [];
  if(prevOutput && natOutput!==undefined){
    var outChange = parseFloat(pctChange(natOutput, prevOutput));
    prodComments.push("National attainment was "+(attainPct>=0.98?'strong':attainPct>=0.9?'solid':'soft')+" at "+pct(attainPct)+" of plan, "+(outChange>=0?'up':'down')+" "+Math.abs(outChange).toFixed(1)+"% vs. the prior week.");
  }
  var sortedByOee = rawSiteRows.filter(function(r){return r.OEE!==undefined && r.OEE!==null && r.OEE!=='';}).sort(function(a,b){return a.OEE-b.OEE;});
  if(sortedByOee.length){
    var worstOee = sortedByOee[0];
    var bestOee = sortedByOee[sortedByOee.length-1];
    if(worstOee.OEE < 0.85){
      prodComments.push(worstOee.Plant+" posted the lowest OEE this week at "+pct(worstOee.OEE)+(((worstOee['Unscheduled Down Time, hr']||0)>15)?", consistent with its elevated downtime hours.":".") );
    }
    if(bestOee.OEE >= 0.9 && bestOee.Plant!==worstOee.Plant){
      prodComments.push(bestOee.Plant+" led the network on OEE at "+pct(bestOee.OEE)+".");
    }
  }
  var sortedByUdt = rawSiteRows.slice().sort(function(a,b){return (b['Unscheduled Down Time, hr']||0)-(a['Unscheduled Down Time, hr']||0);});
  if(sortedByUdt.length && (sortedByUdt[0]['Unscheduled Down Time, hr']||0) > 15){
    prodComments.push(sortedByUdt[0].Plant+" carried the heaviest unscheduled downtime load at "+fmtN(sortedByUdt[0]['Unscheduled Down Time, hr'],1)+" hrs \u2014 worth a closer look at root causes.");
  }
  var noOeeSites = rawSiteRows.filter(function(r){return r.OEE===undefined||r.OEE===null||r.OEE==='';});
  if(noOeeSites.length){
    prodComments.push(noOeeSites.map(function(r){return r.Plant;}).join(', ')+" "+(noOeeSites.length>1?'have':'has')+" no OEE figure logged for the week \u2014 recommend confirming data entry is current.");
  }
  if(!prodComments.length) prodComments.push("Production performance was broadly in line with plan across all sites this week.");

  // 2. Downtime comments
  var dtComments = [];
  if((d.topCats||[]).length){
    var top3Cats = d.topCats.slice(0,3).map(function(c){return c.cat;}).join(', ');
    dtComments.push("The leading downtime categories this week were "+top3Cats+".");
  }
  if((d.topPlants||[]).length){
    var worstPlant = d.topPlants[0];
    var totalUdtAll = d.topPlants.reduce(function(a,p){return a+p.hrs;},0);
    var sharePct = totalUdtAll>0 ? (worstPlant.hrs/totalUdtAll*100).toFixed(0) : 0;
    dtComments.push(worstPlant.plant+" accounted for the largest share of logged unscheduled downtime ("+fmtN(worstPlant.hrs,1)+" hrs, ~"+sharePct+"% of the network total).");
  }
  var mechCat = (d.topCats||[]).filter(function(c){return /mechanical/i.test(c.cat);})[0];
  var whCat = (d.topCats||[]).filter(function(c){return /warehouse/i.test(c.cat);})[0];
  if(mechCat) dtComments.push("Mechanical issues ("+fmtN(mechCat.hrs,1)+" hrs) point to equipment reliability as a recurring theme rather than isolated incidents \u2014 a focused maintenance review may help.");
  if(whCat) dtComments.push("Warehouse-related delays ("+fmtN(whCat.hrs,1)+" hrs) suggest logistics/FG handling capacity, not production itself, is constraining throughput at the affected sites.");
  if(!dtComments.length) dtComments.push("No significant downtime patterns were logged for the week.");

  // 3. Forecast comments
  var fcComments = [];
  var natRemDays = d.fNat.RemDays;
  if(natRemDays!==undefined){
    fcComments.push("National remaining-days against forecast is "+natRemDays.toFixed(1)+" \u2014 "+(natRemDays<0?'the current pace is behind what\u2019s needed to hit the month-end target.':'the network is tracking ahead of pace to hit the month-end target.'));
  }
  var areasOnly = (d.fAreas||[]).filter(function(a){return a.Area!=='NATIONAL';});
  if(areasOnly.length){
    var worstArea = areasOnly.slice().sort(function(a,b){return (a.RemDays||0)-(b.RemDays||0);})[0];
    var bestArea = areasOnly.slice().sort(function(a,b){return (b.RemDays||0)-(a.RemDays||0);})[0];
    if(worstArea) fcComments.push(worstArea.Area+" is furthest behind forecast at "+(worstArea.RemDays!==undefined?worstArea.RemDays.toFixed(1):'\u2014')+" remaining days \u2014 the area needing the most attention this week.");
    if(bestArea && bestArea.Area!==worstArea.Area) fcComments.push(bestArea.Area+" is closest to (or ahead of) pace at "+(bestArea.RemDays!==undefined?bestArea.RemDays.toFixed(1):'\u2014')+" remaining days.");
  }
  if(!fcComments.length) fcComments.push("Forecast data was not available to generate area-level commentary this week.");

  // 4. Cost comments
  var costComments = [];
  var sortedCostCats = costCats.map(function(c){
    var vals = (d.cRows||[]).map(function(r){return r[c.field]||0;}).filter(function(v){return v>0;});
    var avg = vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : 0;
    return {name:c.name, avg:avg};
  }).sort(function(a,b){return b.avg-a.avg;});
  if(sortedCostCats.length && avgCostTon>0){
    var topDriver = sortedCostCats[0];
    var topShare = (topDriver.avg/avgCostTon*100).toFixed(0);
    costComments.push(topDriver.name+" is the largest cost driver at \u20b1"+fmtN(topDriver.avg,0)+"/ton (~"+topShare+"% of total cost/ton).");
  }
  if(d.cRows && d.cRows.length>1){
    var byVol = d.cRows.slice().sort(function(a,b){return (b.TotalVolume||0)-(a.TotalVolume||0);});
    var hiVolDay = byVol[0], loVolDay = byVol[byVol.length-1];
    if(hiVolDay && loVolDay && hiVolDay.Date!==loVolDay.Date){
      costComments.push("Cost/ton ranged from \u20b1"+fmtN(loVolDay.CostTon||0,0)+" on the highest-volume day ("+fmtN(hiVolDay.TotalVolume,0)+" mt) to \u20b1"+fmtN(hiVolDay.CostTon||0,0)+" \u2014 reinforcing that volume, not input cost inflation, is the main driver of daily cost/ton variance.");
    }
  }
  var fixedShare = (d.totalFixed+d.totalVar)>0 ? d.totalFixed/(d.totalFixed+d.totalVar)*100 : 0;
  costComments.push("Fixed costs made up "+fixedShare.toFixed(0)+"% of total cost this week \u2014 "+(fixedShare>55?'higher fixed-cost leverage means cost/ton is especially sensitive to volume swings.':'a relatively balanced fixed/variable cost split.'));
  if(!costComments.length) costComments.push("Cost data was not available to generate commentary this week.");

  // 5. Priorities for the week ahead
  var priorities = [];
  if(sortedByUdt.length && (sortedByUdt[0]['Unscheduled Down Time, hr']||0) > 15){
    priorities.push(sortedByUdt[0].Plant+": schedule a focused downtime review \u2014 this was the heaviest UDT site this week and is dragging both OEE and output attainment.");
  }
  if(areasOnly.length){
    var worstAreaP = areasOnly.slice().sort(function(a,b){return (a.RemDays||0)-(b.RemDays||0);})[0];
    if(worstAreaP && worstAreaP.RemDays<0) priorities.push("Close the pull-out gap in "+worstAreaP.Area+" \u2014 currently "+worstAreaP.RemDays.toFixed(1)+" remaining days behind forecast pace.");
  }
  if(whCat) priorities.push("Address warehouse/FG handling bottlenecks at the affected sites so plant output isn't capped by downstream logistics.");
  if(noOeeSites.length) priorities.push("Confirm "+noOeeSites.map(function(r){return r.Plant;}).join(', ')+" downtime/OEE data entry is current so performance can be tracked alongside the rest of the network.");
  if(!priorities.length) priorities.push("Maintain current performance levels \u2014 no major red flags identified this week.");


  var children = [
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing:{after:60}, children:[new D.TextRun({text:"VPI OPERATIONS WEEKLY REPORT", bold:true, size:36, color:navy})]}),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing:{after:60}, children:[new D.TextRun({text: weekLabel, size:24, color:"555555"})]}),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing:{after:300}, children:[new D.TextRun({text:"Generated from VPI Operations Dashboard", italics:true, size:18, color:"808080"})]}),

    sectionHeading("Executive Summary"),
    bodyText(summaryText),

    sectionHeading("1. Production Performance \u2014 National & By Site"),
    new D.Table({ width:{size:9180,type:D.WidthType.DXA}, columnWidths:[1800,1300,1300,1180,1300,1300], rows: [
      headerRow(["Plant","Output (mt)","Planned (mt)","Attain. %","OEE","UDT (hrs)"], [1800,1300,1300,1180,1300,1300])
    ].concat(siteRows).concat([
      dataRow(["NATIONAL", fmtN(natOutput,1), fmtN(natPlanned,1), pct(attainPct), natOee?pct(natOee):'N/A', fmtN(natUdt,1)], [1800,1300,1300,1180,1300,1300], {fill:lightBlue, bold:true})
    ])}),
    subHeading("Comments"),
  ].concat(prodComments.map(bullet)).concat([

    subHeading("Downtime by Category (Top Contributors)"),
    new D.Table({ width:{size:9180,type:D.WidthType.DXA}, columnWidths:[6885,2295], rows: [
      headerRow(["Category","Total UDT"], [6885,2295])
    ].concat(catRows.length?catRows:[dataRow(["No data logged",""],[6885,2295])])}),

    subHeading("Downtime by Plant"),
    new D.Table({ width:{size:9180,type:D.WidthType.DXA}, columnWidths:[6885,2295], rows: [
      headerRow(["Plant","Total UDT"], [6885,2295])
    ].concat(plantUdtRows.length?plantUdtRows:[dataRow(["No data logged",""],[6885,2295])])}),
    subHeading("Comments"),
  ]).concat(dtComments.map(bullet)).concat([

    sectionHeading("2. Forecast & CSD Pull-Out"),
    bodyText("National MTD pull-out stands at "+pesoM(d.fNat.MTDPullout)+" against a "+pesoM(d.fNat.Forecast)+" forecast ("+pct(parseFloat(d.fNat.MTDPct)||0)+" complete), due "+(d.fNat.DueDate||'\u2014')+"."),
    new D.Table({ width:{size:9180,type:D.WidthType.DXA}, columnWidths:[1800,1800,1800,1890,1890], rows: [
      headerRow(["Area","Forecast","MTD Pull-out","MTD %","Rem. Days"], [1800,1800,1800,1890,1890])
    ].concat(areaRows)}),
    subHeading("Comments"),
  ]).concat(fcComments.map(bullet)).concat([

    sectionHeading("3. Production Cost"),
    bodyText("National production cost for the week averaged \u20b1"+fmtN(avgCostTon,0)+"/ton across "+fmtN(d.totalVol,1)+" mt produced. Total fixed cost: \u20b1"+fmtN(d.totalFixed,0)+" ("+fmtN(d.totalVol>0?d.totalFixed/d.totalVol:0,2)+"/ton). Total variable cost: \u20b1"+fmtN(d.totalVar,0)+" ("+fmtN(d.totalVol>0?d.totalVar/d.totalVol:0,2)+"/ton)."),
    new D.Table({ width:{size:9180,type:D.WidthType.DXA}, columnWidths:[3060,3060,3060], rows: [
      headerRow(["Cost Component","Avg \u20b1/ton","Share of Total"], [3060,3060,3060])
    ].concat(costRows)}),
    subHeading("Comments"),
  ]).concat(costComments.map(bullet)).concat([

    sectionHeading("4. Priorities for the Week Ahead"),
  ]).concat(priorities.map(bullet)).concat([

    new D.Paragraph({ spacing:{before:300}, alignment:D.AlignmentType.CENTER, children:[new D.TextRun({text:"\u2014 End of Report \u2014", italics:true, size:18, color:"808080"})]})
  ]);

  return new D.Document({
    styles: {
      default: { document: { run: { font:"Calibri", size:22 } } },
      paragraphStyles: [
        { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{size:28, bold:true, font:"Calibri", color:navy}, paragraph:{spacing:{before:320,after:160}, outlineLevel:0} },
        { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{size:23, bold:true, font:"Calibri", color:navy}, paragraph:{spacing:{before:200,after:100}, outlineLevel:1} }
      ]
    },
    numbering: { config: [{ reference:"bullets", levels:[{level:0, format:D.LevelFormat.BULLET, text:"\u2022", alignment:D.AlignmentType.LEFT, style:{paragraph:{indent:{left:720,hanging:360}}}}] }]},
    sections: [{
      properties: { page: { size:{width:12240,height:15840}, margin:{top:1080,right:1080,bottom:1080,left:1080} } },
      children: children
    }]
  });
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

  // Determine which month to show: use activeMonth global if it's a valid plain month name (not Q1/Q2 etc), else latest available for 2026
  var allMonths = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var wantMonth = (activeMonth||'').toUpperCase();
  if(allMonths.indexOf(wantMonth)<0){
    // fall back: find latest 2026 month present in the sheet
    var found=[];
    for(var i=1;i<rowsRaw.length;i++){
      var r=rowsRaw[i];
      if(r[iYear]==='2026' && allMonths.indexOf((r[iMonth]||'').toUpperCase())>=0){
        found.push(r[iMonth].toUpperCase());
      }
    }
    wantMonth = found.length ? found[found.length-1] : 'MAY';
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

  // ── Monthly Production Cost (Prod Cost sheet, by site) ───
  html+='<div id="prodcost-section"><div class="no-data">⟳ Loading monthly production cost...</div></div>';

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
  loadProdCostMonthly();
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
  var months=DATA.monthly.months||[];
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

function renderOEE(){var ct=document.getElementById('content-oee');ct.innerHTML='<div class="no-data">OEE tab — coming soon</div>';}
function renderCostAnalytics(){var ct=document.getElementById('content-cost_analytics');ct.innerHTML='<div class="no-data">Cost Analytics tab</div>';}
function renderQualityEnergy(){var ct=document.getElementById('content-quality_energy');ct.innerHTML='<div class="no-data">Quality & Energy tab</div>';}

// ── START ──────────────────────────────────────────────────
loadData(false);
