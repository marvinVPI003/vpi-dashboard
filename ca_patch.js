function renderCostAnalytics(){
  var ct=document.getElementById('content-cost_analytics');
  ct.innerHTML='<div class="no-data">\u29bf Loading MCOS cost data...</div>';
  var CSV_URL='https://docs.google.com/spreadsheets/d/e/2PACX-1vRRx7S_rqgygPQifVep4DtnDFK8gGjAPVbrzCq6sCJcTF6omIGXb73iK8mQZoZjOgUq8CnZ9t7fR_2a/pub?gid=960402999&single=true&output=csv';
  var SITES=['AC','PFMIS','HOREB','BUKID','ARGAO','CCPC','SOUTH','NATIONAL'];
  var FORMS=['Mini Pellet','Micro Pellet','Pellet','Crumble','Mash'];
  var FCOLORS=['#2979C8','#00BCD4','#4CAF50','#F4A300','#9C27B0'];
  var MONTH_ORD=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var MON_NAMES=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  function nv(v){if(v===null||v===undefined||v==='')return null;var n=parseFloat(String(v).replace(/,/g,'').trim());return isNaN(n)||n===0?null:n;}
  function fC(v){if(v===null||v===undefined)return '<span style="color:var(--text3)">\u2014</span>';var col=v>5000?'var(--red)':v>3000?'var(--amber)':'var(--green)';return '<span style="color:'+col+';font-weight:700">\u20b1'+Number(v).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>';}
  function fN(v,d){if(v===null||v===undefined)return '\u2014';d=d===undefined?1:d;return Number(v).toLocaleString('en-PH',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function parseCSV(text){return text.split('\n').map(function(line){var result=[],cur='',inQ=false;for(var i=0;i<line.length;i++){var c=line[i];if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){result.push(cur.trim());cur='';}else{cur+=c;}}result.push(cur.trim());return result;}).filter(function(r){return r.length>1;});}
  fetch(CSV_URL).then(function(r){if(!r.ok)throw new Error('CSV fetch failed: '+r.status);return r.text();}).then(function(text){
    var parsed=parseCSV(text);
    if(parsed.length<2){ct.innerHTML='<div class="no-data">No data in MCOS CSV</div>';return;}
    var rows=[];
    for(var i=1;i<parsed.length;i++){
      var r=parsed[i];
      if(!r[1]||r[1].trim()==='')continue;
      var plant=r[1].trim().toUpperCase();
      var week=r[3].trim();
      var vol=nv(r[4]);
      var mcos=nv(r[8]);
      var month='';
      if(r[2]){var dt=new Date(r[2].trim());if(!isNaN(dt.getTime()))month=MON_NAMES[dt.getMonth()];}
      rows.push({PLANT:plant,WEEK:week,MONTH:month,VOL:vol,MCOS:mcos,f0:nv(r[40]),f1:nv(r[41]),f2:nv(r[42]),f3:nv(r[43]),f4:nv(r[44])});
    }
    if(!rows.length){ct.innerHTML='<div class="no-data">No rows parsed</div>';return;}
    var activeView='weekly',activeSite='NATIONAL';
    var sitesInData=[];
    SITES.forEach(function(s){if(rows.some(function(r){return r.PLANT===s;}))sitesInData.push(s);});
    var allWeeks=[];var seenW={};
    rows.forEach(function(r){if(r.WEEK&&!seenW[r.WEEK]){seenW[r.WEEK]=true;allWeeks.push(r.WEEK);}});
    allWeeks.sort(function(a,b){return +a-+b;});
    function agg(isWeekly){
      var map={};
      rows.forEach(function(r){
        if(r.PLANT==='NATIONAL')return;
        var k=(isWeekly?r.WEEK:r.MONTH)+'|'+r.PLANT;
        if(!k.split('|')[0])return;
        if(!map[k])map[k]={plant:r.PLANT,week:isWeekly?+r.WEEK:0,month:r.MONTH,vol:0,ms:0,mn:0,fc:[{s:0,n:0},{s:0,n:0},{s:0,n:0},{s:0,n:0},{s:0,n:0}]};
        map[k].vol+=(r.VOL||0);
        if(r.MCOS!==null){map[k].ms+=r.MCOS;map[k].mn++;}
        [0,1,2,3,4].forEach(function(fi){if(r['f'+fi]!==null){map[k].fc[fi].s+=r['f'+fi];map[k].fc[fi].n++;}});
      });
      return Object.values(map).sort(function(a,b){
        if(isWeekly)return a.week-b.week||SITES.indexOf(a.plant)-SITES.indexOf(b.plant);
        var mi=MONTH_ORD.indexOf(a.month),mj=MONTH_ORD.indexOf(b.month);
        return mi!==mj?mi-mj:SITES.indexOf(a.plant)-SITES.indexOf(b.plant);
      });
    }
    function getAvg(r,fi){return r.fc[fi].n>0?r.fc[fi].s/r.fc[fi].n:null;}
    function getMCOS(r){return r.mn>0?r.ms/r.mn:null;}
    function buildSC(){
      var data=agg(activeView==='weekly');
      var siteRows=data.filter(function(r){return activeSite==='NATIONAL'||r.plant===activeSite;});
      var totals=[{s:0,n:0},{s:0,n:0},{s:0,n:0},{s:0,n:0},{s:0,n:0}];
      var ms=0,mn=0;
      siteRows.forEach(function(r){
        [0,1,2,3,4].forEach(function(fi){var v=getAvg(r,fi);if(v!==null){totals[fi].s+=v;totals[fi].n++;}});
        var m=getMCOS(r);if(m!==null){ms+=m;mn++;}
      });
      function card(lbl,val,col){
        return '<div style="background:var(--bg1);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:6px;padding:8px 10px;min-width:0">'
          +'<div style="font-size:8px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:3px">'+lbl+'</div>'
          +'<div style="font-size:15px;font-weight:700;color:'+col+';font-family:Cambria,serif">'+(val!==null?'\u20b1'+Number(val).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}):'\u2014')+'</div>'
          +'<div style="font-size:8px;color:var(--text3);margin-top:2px">avg \u00b7 '+activeSite+'</div></div>';
      }
      var mcosVal=mn>0?ms/mn:null;
      var mcosCol=mcosVal===null?'var(--text3)':mcosVal>3000?'var(--red)':mcosVal>2000?'var(--amber)':'var(--green)';
      var out=card('MCOS / TON',mcosVal,mcosCol);
      ['Mini Pellet','Micro Pellet','Pellet','Crumble','Mash'].forEach(function(n,fi){
        var avg=totals[fi].n>0?totals[fi].s/totals[fi].n:null;
        var col=avg===null?'var(--text3)':avg>5000?'var(--red)':avg>3000?'var(--amber)':'var(--green)';
        out+=card(n.toUpperCase(),avg,col);
      });
      return out;
    }
    var TH='padding:5px 8px;background:var(--navy);color:#fff;font-size:8.5px;font-weight:700;border-bottom:2px solid var(--border);text-align:right;white-space:nowrap;';
    var THl=TH+'text-align:left;';
    var TD='padding:4px 8px;font-size:8.5px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;';
    var TDl=TD+'text-align:left;font-weight:700;';
    function tableHtml(data,isWeekly){
      var h='<div style="overflow-x:auto;margin-bottom:20px"><table style="width:100%;border-collapse:collapse"><thead><tr>'
        +'<th style="'+THl+'">PLANT</th><th style="'+TH+'">'+(isWeekly?'WEEK':'MONTH')+'</th><th style="'+TH+'">VOL (MT)</th>'
        +'<th style="'+TH+'">MCOS/TON (\u20b1)</th>'
        +'<th style="'+TH+'">MINI PELLET (\u20b1/MT)</th><th style="'+TH+'">MICRO PELLET (\u20b1/MT)</th>'
        +'<th style="'+TH+'">PELLET (\u20b1/MT)</th><th style="'+TH+'">CRUMBLE (\u20b1/MT)</th><th style="'+TH+'">MASH (\u20b1/MT)</th>'
        +'</tr></thead><tbody>';
      data.forEach(function(r,i){
        var bg=i%2===0?'var(--bg1)':'var(--bg2)';
        var period=isWeekly?'Wk '+r.week:(r.month?r.month.charAt(0)+r.month.slice(1).toLowerCase():'');
        h+='<tr style="background:'+bg+'">'
          +'<td style="'+TDl+'color:var(--blue)">'+r.plant+'</td>'
          +'<td style="'+TD+'">'+period+'</td>'
          +'<td style="'+TD+'">'+fN(r.vol,1)+'</td>'
          +'<td style="'+TD+'">'+fC(getMCOS(r))+'</td>'
          +[0,1,2,3,4].map(function(fi){return '<td style="'+TD+'">'+fC(getAvg(r,fi))+'</td>';}).join('')
          +'</tr>';
      });
      return h+'</tbody></table></div>';
    }
    function pill(id,lbl,act,fn){return '<button id="'+id+'" onclick="'+fn+'" style="padding:3px 11px;border-radius:12px;border:1px solid '+(act?'var(--blue)':'var(--border)')+';background:'+(act?'var(--blue)':'transparent')+';color:'+(act?'#fff':'var(--text2)')+';font-size:9px;cursor:pointer;font-weight:'+(act?700:400)+'">'+lbl+'</button>';}
    function renderCA(){
      var isW=activeView==='weekly';
      var wkData=agg(true),moData=agg(false);
      var chartRows=(isW?wkData:moData).filter(function(r){return activeSite==='NATIONAL'||r.plant===activeSite;});
      var labels=chartRows.map(function(r){return isW?'Wk'+r.week:(r.month?r.month.charAt(0)+r.month.slice(1,3).toLowerCase():'');});
      var datasets=FORMS.map(function(f,fi){return {lbl:f,col:FCOLORS[fi],vals:chartRows.map(function(r){return getAvg(r,fi);})};}).filter(function(ds){return ds.vals.some(function(v){return v!==null;});});
      window._caData={labels:labels,datasets:datasets};
      ct.innerHTML='<div style="padding:12px">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
        +'<div style="font-size:18px;font-weight:700;color:var(--text1)">COST ANALYTICS \u2014 MCOS DAILY</div>'
        +'<div style="font-size:10px;color:var(--sky);font-weight:700">'+rows.length+' records \u00b7 Wk '+allWeeks[0]+'\u2013'+allWeeks[allWeeks.length-1]+'</div></div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center">'
        +'<span style="font-size:9px;color:var(--text3);font-weight:700;margin-right:2px">VIEW</span>'
        +pill('ca-wk','Weekly',isW,"window._caView('weekly')")+pill('ca-mo','Monthly',!isW,"window._caView('monthly')")
        +'<span style="font-size:9px;color:var(--text3);font-weight:700;margin-left:10px;margin-right:2px">SITE</span>'
        +sitesInData.map(function(s){return pill('ca-s-'+s,s,s===activeSite,"window._caSite('"+s+"')");}).join(' ')
        +'</div>'
        +'<div id="ca-sc" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">'+buildSC()+'</div>'
        +'<div style="background:var(--bg1);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">'
        +'<div style="font-size:10px;font-weight:700;color:var(--text1);margin-bottom:8px">Mfg Cost/MT by Feed Form \u2014 '+activeSite+' ('+(isW?'Weekly':'Monthly')+')</div>'
        +'<canvas id="ca-ch" style="max-height:220px"></canvas></div>'
        +'<div style="font-size:10px;font-weight:700;color:var(--sky);margin-bottom:6px">WEEKLY DETAIL</div>'+tableHtml(wkData,true)
        +'<div style="font-size:10px;font-weight:700;color:var(--sky);margin-bottom:6px">MONTHLY SUMMARY</div>'+tableHtml(moData,false)
        +'</div>';
      setTimeout(function(){
        var cd=window._caData,canvas=document.getElementById('ca-ch');
        if(!canvas||!cd||!cd.labels.length)return;
        if(window._caCI){try{window._caCI.destroy();}catch(x){}}
        var gc='rgba(255,255,255,0.06)',ta={grid:{color:gc},ticks:{color:'#5a6270',font:{size:9}}};
        var yOpts=Object.assign({},ta,{title:{display:true,text:'\u20b1 per MT',color:'#888',font:{size:9}}});
        window._caCI=new Chart(canvas.getContext('2d'),{type:'line',
          data:{labels:cd.labels,datasets:cd.datasets.map(function(ds){
            return {label:ds.lbl,data:ds.vals,borderColor:ds.col,backgroundColor:'transparent',
              borderWidth:2,pointRadius:4,pointBackgroundColor:ds.col,spanGaps:true,tension:0.3};})},
          options:{responsive:true,
            plugins:{legend:{labels:{color:'#888',font:{size:9}}}},
            scales:{x:ta,y:yOpts}}});
      },100);
      window._caView=function(v){activeView=v;renderCA();};
      window._caSite=function(s){activeSite=s;renderCA();};
    }
    renderCA();
  }).catch(function(e){ct.innerHTML='<div class="no-data" style="color:var(--red)">\u26a0 Error: '+e.message+'</div>';});
}
