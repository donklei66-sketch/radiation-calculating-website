(function(){
  'use strict';
  const data=window.VF1010ComparisonData,$=id=>document.getElementById(id),card=$('vf1010_comparison');
  if(!card||!data)return;
  const C=window.VF10701Integral,VF=window.VFRebuild,View=window.VFSceneView;
  const names={head:'头部',chest:'胸部',back:'背部',abdomen:'腹盆部',l_upperarm:'左上臂',r_upperarm:'右上臂',l_forearm:'左前臂',r_forearm:'右前臂',l_hand:'左手',r_hand:'右手',l_thigh:'左大腿',r_thigh:'右大腿',l_leg:'左小腿',r_leg:'右小腿',l_foot:'左脚',r_foot:'右脚'};
  let backup=null,applied=false,downloadUrl=null;
  const camera={yaw:-.68,pitch:-.18,zoom:1};
  const f=(value,d=6)=>Number.isFinite(value)?value.toFixed(d):'—';
  const selected=()=>data.rows.find(r=>r.aOverC===Number($('vf1010_a').value)&&r.bOverC===Number($('vf1010_b').value));
  function region(point){return {id:'comparison-front',label:'前方对照矩形',kind:'window',face:'north',u0:data.human.x,u1:data.human.x+point.aOverC*data.c,v0:data.bottom,v1:data.bottom+point.bOverC*data.c,temperature:22,emissivity:1};}
  function segmentValues(point){
    const ai=data.aValues.indexOf(point.aOverC),bi=data.bValues.indexOf(point.bOverC);
    return data.segments.map(s=>{let high=0,low=0;for(let a=0;a<=ai;a++)for(let b=0;b<=bi;b++){const id='kubaha:'+a+':'+b;high+=s.high[id];low+=s.low[id];}return {name:s.segment,area:s.area,rawVF:high,refinementChange:Math.abs(high-low),areaWeightedContribution:s.area*high/data.effectiveArea};});
  }
  function compatibility(){
    const valid=!!C&&!!VF&&data.geometryHash===C.MODEL_SPEC.definitionHash&&data.integralVersion===C.VERSION&&data.densityVersion===window.VFSurfaceDensity?.VERSION&&data.allSegmentsRefined&&data.all25IndependentChecksPassed;
    if(!valid){$('vf1010_status').textContent='对照记录与当前模型版本不匹配，暂不能载入该工况。';$('vf1010_apply').disabled=true;}
    return valid;
  }
  function line(ctx,x0,y0,x1,y1,color,width=2,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.setLineDash([]);}
  function plot(){
    const canvas=$('vf1010_chart'),ctx=canvas.getContext('2d'),point=selected(),rows=data.rows.filter(r=>r.aOverC===point.aOverC);
    if(!canvas.clientWidth)return;const W=Math.round(canvas.clientWidth),small=W<500,H=small?300:Math.round(W*500/900);canvas.width=W;canvas.height=H;
    const L=small?63:80,R=small?18:35,T=small?70:75,B=small?53:65,max=Math.ceil(Math.max(...rows.flatMap(r=>[r.factor,r.reference]))*1.16*100)/100;
    const x=b=>L+(W-L-R)*b/2.1,y=v=>H-B-(H-T-B)*v/max;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,W,H);ctx.font=(small?16:18)+'px system-ui';ctx.fillStyle='#334155';ctx.textAlign='center';ctx.fillText('前方矩形 · a/c = '+point.aOverC,W/2,27);
    for(let i=0;i<=4;i++){const v=max*i/4;line(ctx,L,y(v),W-R,y(v),'#e2e8f0',1);ctx.textAlign='right';ctx.font=(small?12:14)+'px system-ui';ctx.fillStyle='#64748b';ctx.fillText(v.toFixed(3),L-9,y(v)+4);}
    for(const b of data.bValues){line(ctx,x(b),T,x(b),H-B,'#edf1f7',1);ctx.textAlign='center';ctx.fillText(String(b),x(b),H-B+27);}
    line(ctx,L,T,L,H-B,'#94a3b8',1);line(ctx,L,H-B,W-R,H-B,'#94a3b8',1);
    ctx.font=(small?13:16)+'px system-ui';ctx.textAlign='center';ctx.fillStyle='#475569';ctx.fillText('矩形高 b/c',W/2,H-15);ctx.save();ctx.translate(small?15:23,H/2);ctx.rotate(-Math.PI/2);ctx.fillText(small?'全身相对 VF':'全身相对角系数 VF',0,0);ctx.restore();
    function series(key,color,dash,square){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.beginPath();rows.forEach((r,i)=>i?ctx.lineTo(x(r.bOverC),y(r[key])):ctx.moveTo(x(r.bOverC),y(r[key])));ctx.stroke();ctx.setLineDash([]);for(const r of rows){ctx.fillStyle='#f8fafc';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();if(square)ctx.rect(x(r.bOverC)-5,y(r[key])-5,10,10);else ctx.arc(x(r.bOverC),y(r[key]),4.5,0,2*Math.PI);ctx.fill();ctx.stroke();}}
    series('reference','#475569',[],false);series('factor','#7c3aed',[11,7],true);
    ctx.fillStyle='#7c3aed';ctx.beginPath();ctx.arc(x(point.bOverC),y(point.factor),8,0,2*Math.PI);ctx.fill();
    function legend(left,text,color,dash){const length=small?24:32;line(ctx,left,51,left+length,51,color,3,dash);ctx.font=(small?12:14)+'px system-ui';ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText(text,left+length+6,56);}
    legend(small?62:W*.16,small?'Kubaha':'Kubaha 读数','#475569',[]);legend(small?170:W*.5,small?'本模型':'本模型 · 下缘0.6 m','#7c3aed',[11,7]);
  }
  function drawScene(){
    if(!C||!VF||!View)return;
    const point=selected(),r=region(point),scene=C.validateScene({room:data.room,human:data.human,regions:[r]}),canvas=$('vf1010_scene'),ctx=canvas.getContext('2d');
    if(!canvas.clientWidth)return;const W=Math.round(canvas.clientWidth),small=W<500,H=small?300:Math.round(W*500/900);canvas.width=W;canvas.height=H;
    const center=[data.human.x+Math.max(.1,point.aOverC*.42),Math.max(.74,(r.v1+.05)/2),data.human.z+.4];
    const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),span=Math.max(2,point.aOverC+(small?1.7:1),r.v1+.5),scale=Math.min(W*.9,H*.83)/span*camera.zoom;
    const project=p=>{const dx=p[0]-center[0],dy=p[1]-center[1],dz=p[2]-center[2],rx=cy*dx-sy*dz,dep=sy*dx+cy*dz;return [W/2+rx*scale,H/2-(cp*dy-sp*dep)*scale,cp*dep+sp*dy,scale];};
    const drawLine=(a,b,color,width=2,dash=[])=>{const A=project(a),B=project(b);line(ctx,A[0],A[1],B[0],B[1],color,width,dash);};
    const text=(p,label,color='#475569',dx=7,dy=0)=>{const P=project(p);ctx.font=(small?12:14)+'px system-ui';ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText(label,P[0]+dx,P[1]+dy);};
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,W,H);
    const floor=[data.human.x-.55,0,data.human.z-.35],east=[r.u1+.3,0,data.human.z-.35],north=[r.u1+.3,0,data.room.depth],west=[data.human.x-.55,0,data.room.depth];
    const target=[[r.u0,r.v0,data.room.depth],[r.u1,r.v0,data.room.depth],[r.u1,r.v1,data.room.depth],[r.u0,r.v1,data.room.depth]];
    View.drawDepthScene(ctx,scene,project,[
      {points:[floor,east,north,west],color:[241,245,249],stroke:[203,213,225],lineWidth:1},
      {points:target,color:[232,224,249],stroke:[124,58,237],lineWidth:3}
    ]);
    const measureX=r.u1+.2;drawLine([measureX,0,data.room.depth],[measureX,r.v0,data.room.depth],'#7c3aed',2,[6,5]);text([measureX,r.v0/2,data.room.depth],'下缘0.60 m','#7c3aed',8);
    drawLine([data.human.x,0,data.human.z],[data.human.x,0,data.room.depth],'#2563eb',2,[6,5]);text([data.human.x,0,data.human.z+.5],'c = 1.00 m','#2563eb',6,23);
    text([r.u0+(r.u1-r.u0)/2,r.v1,data.room.depth],'a = '+f(point.aOverC,2)+' m','#7c3aed',-50,-12);
    text([r.u1,(r.v0+r.v1)/2,data.room.depth],'b = '+f(point.bOverC,2)+' m','#7c3aed',12,0);
    ctx.font=(small?14:16)+'px system-ui';ctx.fillStyle='#334155';ctx.textAlign='left';ctx.fillText('人体贴地 · 朝北',18,27);ctx.font=(small?12:14)+'px system-ui';ctx.fillStyle='#64748b';ctx.fillText('拖动旋转，滚轮缩放',18,H-18);
  }
  function table(){
    const point=selected(),mode=$('vf1010_table_mode').value;
    if(mode==='segments'){
      $('vf1010_table_note').textContent='F 为所选矩形的节段原始角系数，不按六面归一。ΔF 为两次积分精化结果的绝对差，不代表物理模型的总误差。';
      $('vf1010_table').innerHTML='<thead><tr><th>节段</th><th>外露面积 Aᵢ / m²</th><th>原始 Fᵢ→矩形</th><th>精化变化 ΔF</th><th>全身贡献 AᵢFᵢ/A有效</th></tr></thead><tbody>'+segmentValues(point).map(s=>'<tr><td>'+names[s.name]+'</td><td>'+f(s.area)+'</td><td>'+f(s.rawVF)+'</td><td>'+f(s.refinementChange,8)+'</td><td>'+f(s.areaWeightedContribution)+'</td></tr>').join('')+'</tbody>';
    }else{
      $('vf1010_table_note').textContent='文献数据来自 Kubaha 图10拟合曲线数字化读数，包含读图误差。最后一列为积分与独立射线的绝对差加射线95%半宽，用于数值交叉核查。';
      $('vf1010_table').innerHTML='<thead><tr><th>a/c</th><th>b/c</th><th>Kubaha 读数</th><th>本模型 VF</th><th>绝对差</th><th>积分 ΔF</th><th>独立核查差值</th></tr></thead><tbody>'+data.rows.map(r=>'<tr'+(r===point?' class="vf1010-selected"':'')+'><td>'+r.aOverC+'</td><td>'+r.bOverC+'</td><td>'+f(r.reference)+'</td><td>'+f(r.factor)+'</td><td>'+f(Math.abs(r.difference))+'</td><td>'+f(r.refinementEstimate,8)+'</td><td>'+f(r.combinedDifference,8)+'</td></tr>').join('')+'</tbody>';
    }
  }
  function updateLink(){
    if(!backup)return;
    const point=selected(),r=region(point),M=typeof readModel==='function'?readModel():null;
    const close=(a,b)=>Math.abs(a-b)<1e-9;
    const matched=!!M&&close(M.W,data.room.width)&&close(M.D,data.room.depth)&&close(M.H,data.room.height)&&close(M.mx1,data.human.x)&&close(M.my1,data.human.z)&&$('seg_facing').value==='north'&&M.localPanels.length===0&&M.windows.length===1&&M.windows[0].wall==='north'&&close(M.windows[0].u,r.u0)&&close(M.windows[0].v,r.v0)&&close(M.windows[0].w,r.u1-r.u0)&&close(M.windows[0].h,r.v1-r.v0);
    $('vf1010_status').textContent=matched?'工作台的房间、人体和北墙窗与当前所选对照矩形一致。右栏展示节段原始角系数；本卡展示全身相对 VF。':'工作台与当前所选对照矩形的几何不同。可重新载入，或恢复载入前工况。';
    applied=matched;
  }
  function update(){
    const point=selected(),r=region(point),segments=segmentValues(point);
    $('vf1010_factor').textContent=f(point.factor);$('vf1010_reference').textContent=f(point.reference);$('vf1010_difference').textContent=f(Math.abs(point.difference));
    $('vf1010_position').textContent='目标坐标：X '+f(r.u0,2)+'–'+f(r.u1,2)+' m，Y = '+f(data.room.depth,2)+' m，高度 '+f(r.v0,2)+'–'+f(r.v1,2)+' m。图中人体采用工作台同一表面与尺寸定义。';
    $('vf1010_accuracy').textContent='25点平均绝对差 MAE = '+f(data.metrics.mae)+'；最大绝对差 = '+f(data.metrics.maximumAbsolute)+'。独立数值校核最大差值（含95%半宽）为 '+f(data.maximumIndependentDifference)+'。';
    window.VF1010ComparisonState={scope:data.scope,geometryHash:data.geometryHash,point:{...point},target:r,segments,effectiveArea:data.effectiveArea};
    plot();drawScene();table();updateLink();
  }
  $('vf1010_toggle').addEventListener('click',()=>{card.hidden=!card.hidden;$('vf1010_toggle').setAttribute('aria-expanded',String(!card.hidden));if(!card.hidden){update();card.scrollIntoView({behavior:'smooth',block:'start'});}});
  for(const id of ['vf1010_a','vf1010_b'])$(id).addEventListener('change',update);
  $('vf1010_reset_view').addEventListener('click',()=>{Object.assign(camera,{yaw:-.68,pitch:-.18,zoom:1});drawScene();});
  if(View)View.attachCamera($('vf1010_scene'),camera,drawScene);
  if(typeof ResizeObserver!=='undefined'){let width=0;new ResizeObserver(()=>{const next=card.clientWidth;if(!card.hidden&&next&&next!==width){width=next;plot();drawScene();}}).observe(card);}
  $('vf1010_table_mode').addEventListener('change',table);
  $('vf1010_data_toggle').addEventListener('click',()=>{const box=$('vf1010_data');box.hidden=!box.hidden;$('vf1010_data_toggle').setAttribute('aria-expanded',String(!box.hidden));$('vf1010_data_toggle').textContent=box.hidden?'查看数据明细':'收起数据明细';});
  $('vf1010_apply').addEventListener('click',()=>{
    if(!compatibility())return;
    // Save all design controls because dimension checks can also clamp inactive
    // windows/panels. Restoring only the directly assigned controls loses data.
    if(!backup)backup={controls:[...document.querySelectorAll('#view-comfort input,#view-comfort select,#view-comfort textarea')].map(el=>({el,value:el.value,checked:el.checked})),facing:$('seg_facing').value};
    const point=selected(),r=region(point),assign=(id,value)=>{$(id).value=String(value);};
    for(const [id,value] of Object.entries({W:data.room.width,D:data.room.depth,H:data.room.height,m1x:data.human.x,m1y:data.human.z,win_north_w:r.u1-r.u0,win_north_h:r.v1-r.v0,win_north_u:r.u0,win_north_v:r.v0,win_north_t:22,win_north_e:1,ta:22}))assign(id,value);
    for(const face of C.FACES){assign('t_'+face,22);assign('e_'+face,1);$('rad_'+face).checked=false;}
    for(const face of ['west','east','south','north'])$('win_'+face+'_on').checked=face==='north';
    $('sol_on').checked=false;$('seg_facing').value='north';$('vf1010_restore').disabled=false;
    if(location.hash!=='#segments')location.hash='#segments';render();updateLink();
    $('seg_frame').scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('vf1010_restore').addEventListener('click',()=>{
    if(!backup)return;for(const s of backup.controls){s.el.value=s.value;if(s.checked!==undefined)s.el.checked=s.checked;}
    $('seg_facing').value=backup.facing;backup=null;applied=false;$('vf1010_restore').disabled=true;render();$('vf1010_status').textContent='已恢复载入前工况。';
  });
  const bridge=window.renderSegmentsBridge;if(bridge)window.renderSegmentsBridge=function(M){bridge(M);if(backup)updateLink();};
  $('vf1010_export').addEventListener('click',()=>{
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    const payload={schemaVersion:1,date:data.date,geometryId:data.geometryId,geometryHash:data.geometryHash,engineVersion:data.integralVersion,scope:data.scope,actualDesignLinked:applied,scene:{room:data.room,human:data.human,regions:[region(selected())]},definition:'Raw segment VF; whole relative VF = sum(area * raw target VF) / fixed independently checked effective environmental area.',effectiveArea:data.effectiveArea,selected:window.VF1010ComparisonState,metrics:data.metrics,points:data.rows,sourceFiles:data.sourceFiles,kernelHashes:data.kernelHashes};
    downloadUrl=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=downloadUrl;a.download='1011-front-rectangle-comparison.json';a.click();
  });
  compatibility();update();
})();
