(function(){
  'use strict';
  const C=window.VF10701Integral,$=id=>document.getElementById(id);if(!C||!window.VF10701IntegralRunner||!window.VFRebuild||!window.VF101902Resources||!window.VF101902DataManifest){$('seg_status').textContent='计算组件加载失败，请保持依赖文件与网页在同一文件夹。';$('seg_run').disabled=true;return;}const faces=C.FACES;
  const faceNames={west:'西墙',east:'东墙',south:'南墙',north:'北墙',floor:'地面',ceiling:'顶棚'};
  const segmentNames={head:'头部',chest:'胸部',abdomen:'腹盆部',neck:'颈部辅助遮挡',back:'背部',l_upperarm:'左上臂',r_upperarm:'右上臂',l_forearm:'左前臂',r_forearm:'右前臂',l_hand:'左手',r_hand:'右手',l_thigh:'左大腿',r_thigh:'右大腿',l_leg:'左小腿',r_leg:'右小腿',l_foot:'左脚',r_foot:'右脚'};
  const frame=$('seg_frame'),status=$('seg_status'),resultBox=$('seg_results'),detailBox=$('seg_detail');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,d=5)=>Number.isFinite(v)?v.toFixed(d):'—';
  let currentScene=null,currentResults=[],sceneSignature='',requestId=0,running=false,worker=null,frameReady=false,pendingVisual=null,launchTimer=null,startupTimer=null,lastProgress=0,selectedSegment='head',raySeed=20261007,fallbackRunner=null,visualSignature='',latestPayload=null,exportUrl=null,resultRAF=0;
  let viewFallback=null,frameTimer=null,fallbackResources=null,calculationStarted=0,lastStats=null;
  const rayCamera={yaw:-.72,pitch:-.22,zoom:1,drag:false,x:0,y:0};
  const span=(M,face)=>({u:(face==='west'||face==='east')?M.D:M.W,v:(face==='floor'||face==='ceiling')?M.D:M.H});
  const clip=(r,b)=>{const u0=Math.max(r.u,b.u),u1=Math.min(r.u+r.w,b.u+b.w),v0=Math.max(r.v,b.v),v1=Math.min(r.v+r.h,b.v+b.h);if(u1-u0<=1e-9||v1-v0<=1e-9)return [r];return [{u:r.u,v:r.v,w:u0-r.u,h:r.h},{u:u1,v:r.v,w:r.u+r.w-u1,h:r.h},{u:u0,v:r.v,w:u1-u0,h:v0-r.v},{u:u0,v:v1,w:u1-u0,h:r.v+r.h-v1}].filter(x=>x.w*x.h>1e-8);};
  function linkedScene(M){
    const geometry=buildRects(M),regions=[];
    for(const face of faces){
      const extent=span(M,face);let rest=[{u:0,v:0,w:extent.u,h:extent.v}];
      for(const [index,win] of M.windows.filter(x=>x.wall===face).entries()){
        const r={u:win.u,v:win.v,w:win.w,h:win.h};rest=rest.flatMap(x=>clip(x,r));regions.push({...r,face,kind:'window',id:'window-'+face+'-'+index+'-'+String(win.name||'window'),label:win.name||faceNames[face]+'窗',t:win.t,e:win.emis,tsol:win.tsol});
      }
      for(const panel of geometry.panels.filter(x=>x.wall===face&&x.effectiveArea>0))for(const [index,r] of panel.pieces.entries()){
        rest=rest.flatMap(x=>clip(x,r));regions.push({...r,face,kind:'panel',id:'panel-'+String(panel.id)+'-'+index,label:panel.name,t:panel.temperature,e:panel.emissivity});
      }
    }
    return {room:{width:M.W,depth:M.D,height:M.H,surfaceTemperatures:{...M.temps},surfaceEmissivities:{...M.emisS}},human:{x:M.mx1,z:M.my1,facing:$('seg_facing').value},segments:VFRebuild.createPaperDimensionAuthorLayout(),regions:regions.map(r=>({id:r.id,label:r.label,kind:r.kind,face:r.face,u0:r.u,u1:r.u+r.w,v0:r.v,v1:r.v+r.h,temperature:r.t,emissivity:r.e,tsol:r.tsol}))};
  }
  function sendVisual(){if(!pendingVisual)return;if(viewFallback)viewFallback.update(pendingVisual);else if(frameReady)frame.contentWindow.postMessage({type:'segment-scene',scene:pendingVisual},'*');}
  window.addEventListener("vf1020:solar-visual",event=>{if(viewFallback)viewFallback.setSolar(event.detail);else if(frameReady)frame.contentWindow.postMessage({type:"segment-solar",visual:event.detail},"*");});
  function byName(){return new Map(currentResults.map(r=>[r.segment,r]));}
  function applyMode(){
    $('seg_method_note').textContent='统一几何积分 · 六面 VF 与局部区域使用同一非负响应；温度和发射率只影响热结果。';
    $('seg_run').textContent=running?'取消计算':'重新计算';$('seg_download').disabled=running||currentResults.length!==16||currentResults.some(r=>!r.quality.passed);
  }
  function renderValidation(){
    if(!$('seg_validation'))return;
    const r=window.VF10701IntegralVerification,matched=r&&r.geometryHash===C.MODEL_SPEC.definitionHash&&r.engineVersion===C.VERSION&&r.densityVersion===window.VFSurfaceDensity.VERSION&&r.numericalRevision===window.VFSurfaceDensity.NUMERICAL_REVISION&&r.floorResponseVersion===window.VF10701FloorResponse.VERSION;
    $('seg_validation').innerHTML=matched?'<p><b>'+ (r.releasePassed?'参考工况数值校核通过':'校核结果暂未确认')+'</b></p><p class="seg-foot">独立求解、角系数闭合及区域可加性共同检验数值结果。设计工况的数值稳定性见结果表“积分精度”；文献一致性与适用条件见<a href="1011-literature-comparison.html#numerical" target="_blank" rel="noopener">计算依据与校核结果</a>。</p>':'<p>校核记录不可用或版本不匹配。此状态不等于模型计算失败。</p>';
  }
  function partitionLabels(){
    const roles=Object.fromEntries(faces.filter(f=>f!=='floor'&&f!=='ceiling').map(f=>[VFRebuild.paperWallRole(f,currentScene.human),f]));
    const direction=role=>faceNames[roles[role]].replace('墙','');
    return {roles,wallNames:{Fwall:'前方墙',Bwall:'后方墙',Lwall:'左侧墙',Rwall:'右侧墙'},quadrants:{FL:'前左',FR:'前右',BL:'后左',BR:'后右',LU:'左上',RU:'右上',LD:'左下',RD:'右下',FU:'前上',BU:'后上',FD:'前下',BD:'后下'},note:'当前朝'+direction('Fwall')+'：前＝'+direction('Fwall')+'，后＝'+direction('Bwall')+'，左＝'+direction('Lwall')+'，右＝'+direction('Rwall')+'。'};
  }
  function renderDetail(){
    const result=byName().get(selectedSegment);if(!result){detailBox.innerHTML='<p class="seg-foot">该节段尚未完成。</p>';$('seg_partition_detail').innerHTML='';return;}
    const rows=[];
    for(const r of currentScene.compiled.regions){const s=result.receivers[r.id];rows.push('<tr><td>'+esc(r.label||faceNames[r.face])+'</td><td>'+({base:'普通围护面',window:'窗',panel:'局部辐射面'}[r.kind])+'</td><td>'+fmt(r.temperature,1)+'</td><td>'+fmt(r.emissivity,3)+'</td><td>'+fmt(s.mean,7)+'</td><td>'+fmt(s.errorEstimate,7)+'</td></tr>');}
    for(const [id,s] of Object.entries(result.receivers))if(id.startsWith('body:')&&s.mean>0)rows.push('<tr><td>'+esc(segmentNames[id.slice(5)]||id)+'</td><td>人体遮挡</td><td>—</td><td>—</td><td>'+fmt(s.mean,7)+'</td><td>'+fmt(s.errorEstimate,7)+'</td></tr>');
    detailBox.innerHTML='<h3>'+segmentNames[selectedSegment]+' · 实际区域</h3><p class="seg-foot">普通围护面、窗与局部辐射面分别列出。原始 F 保留人体遮挡，温度与发射率 ε 只参与 MRT 计算。</p><div class="paper-table-wrap"><table class="seg-region-table"><thead><tr><th>区域</th><th>类型</th><th>温度 ℃</th><th>ε</th><th>原始 F</th><th title="最近两次积分精化所得角系数的绝对差，无量纲">精化变化<br>ΔF</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
    const labels=partitionLabels(),zones=result.paperZones||{},zoneRows=[];
    for(const role of ['ceiling','floor','Fwall','Bwall','Lwall','Rwall']){
      const ids=VFRebuild.PAPER_ZONE_IDS.filter(id=>id.startsWith(role+':')&&zones[id]);
      const face=labels.roles[role],name=face?labels.wallNames[role]+'<br>（'+faceNames[face]+'）':faceNames[role];
      ids.forEach((id,index)=>{const s=zones[id],quadrant=id.split(':')[1];zoneRows.push('<tr data-zone-id="'+esc(id)+'"'+(index===0?' class="seg-zone-group-start"':'')+'>'+(index===0?'<td class="seg-zone-face" rowspan="'+ids.length+'">'+name+'</td>':'')+'<td>'+labels.quadrants[quadrant]+'</td><td>'+fmt(s.mean,7)+'</td><td>'+fmt(s.errorEstimate,7)+'</td></tr>');});
    }
    const model='<p class="seg-foot">顶棚和地面按人体定位点的前后、左右划分；墙面按左右或前后划分，并以距地 <b>0.6 m</b> 为界分上下。所有方向均以人体朝向为准。</p><p class="seg-direction-note">'+labels.note+'</p>';
    const metadata='<p class="seg-computation-meta">外露发射面积：'+fmt(result.exposedAreaEstimate,7)+' m²。<br>积分精化层级（级数越高，网格越细）：'+faces.map(f=>faceNames[f]+' '+result.levels[f]).join('，')+'。</p>';
    $('seg_partition_detail').innerHTML='<h3>'+segmentNames[selectedSegment]+' · 四分区计算明细</h3>'+model+'<div class="paper-table-wrap"><table class="seg-zone-table"><colgroup><col><col><col><col></colgroup><thead><tr><th>围护面</th><th>人体相对位置</th><th>原始 F</th><th title="最近两次积分精化所得角系数的绝对差，无量纲">精化变化 ΔF</th></tr></thead><tbody>'+zoneRows.join('')+'</tbody></table></div>'+metadata;
  }
  function renderResult(){
    queueMicrotask(()=>window.dispatchEvent(new CustomEvent("vf1020:longwave",{detail:{scene:currentScene,results:currentResults,running}})));
    window.VF10701PageState={mode:'integral',running,complete:currentResults.length===16,geometryHash:C.MODEL_SPEC.definitionHash,scene:currentScene?{room:currentScene.room,human:currentScene.human,regions:currentScene.compiled.overlays}:null,results:currentResults};
    applyMode();if(!currentResults.length){resultBox.innerHTML='<p>'+ (running?'正在计算，完成后逐节段显示结果…':'尚未计算。')+'</p>';detailBox.innerHTML='';$('seg_partition_detail').innerHTML='';return;}
    const all=currentScene.segments.map(s=>byName().get(s.name)).filter(Boolean),vf=$('seg_mode').value==='vf';
    const rows=all.map(r=>{const m=C.mrt(r,currentScene);return '<tr><td>'+segmentNames[r.segment]+'</td>'+(vf?faces.map(f=>'<td>'+fmt(r.faces[f].mean)+'</td>').join(''):'<td>'+fmt(m.celsius,2)+'</td><td>'+fmt(m.errorEstimate,3)+'</td>')+'<td>'+fmt(r.roomTotal.mean)+'</td><td>'+fmt(r.bodyTotal.mean)+'</td><td class="'+(r.quality.passed?'paper-ok':'paper-warn')+'">'+(r.quality.passed?'达标':'需提高精度')+'</td></tr>';}).join('');
    const whole=all.length===16&&all.every(r=>r.quality.passed)?'<p class="seg-foot"><b>全身外露面积加权等效 MRT：'+fmt(C.wholeMRT(all,currentScene).celsius,2)+' ℃</b></p>':'';
    const resultNote=vf?'六面原始几何 VF 保留人体遮挡，六面不归一化；人体遮挡由 1−ΣF环境推导。':'MRT 按实际区域的 εF 与开尔文四次方加权。精化变化 ΔMRT 为最近两次积分所得 MRT 的绝对差，单位为 ℃，越小表示数值越稳定。';
    resultBox.innerHTML='<h3>16 节段 · '+(vf?'原始角系数':'等效 MRT')+'</h3><p class="seg-foot">'+resultNote+'</p>'+whole+'<div class="paper-table-wrap"><table><thead><tr><th>节段</th>'+(vf?faces.map(f=>'<th>'+faceNames[f]+'</th>').join(''):'<th>MRT ℃</th><th title="最近两次积分精化所得 MRT 的绝对差，单位为摄氏度">精化变化<br>ΔMRT (℃)</th>')+'<th>ΣF环境</th><th>人体遮挡<br>（推导）</th><th title="积分精化是否达到设定的数值精度要求">积分<br>精度</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="seg-computation-meta">积分精度表示数值精化是否达标；模型准确性需结合独立校核与文献对照。四分区及实际区域的角系数、精化变化可在“节段计算明细”中查看。</p>';
    if(all.some(r=>C.mrt(r,currentScene).celsius===null))resultBox.insertAdjacentHTML('beforeend','<p class="paper-warn">部分节段的 εF 温度权重为零，MRT 不可用；角系数仍可查看。</p>');
    if(all.length===16&&all.some(r=>!r.quality.passed))resultBox.insertAdjacentHTML('beforeend','<p class="paper-warn">本工况尚未达到积分精度，完整热结果和正式导出暂不可用；可查看逐项变化或重新计算。</p>');
    renderDetail();
    window.VF10701PageState={mode:'integral',running,complete:all.length===16,geometryHash:C.MODEL_SPEC.definitionHash,scene:{room:currentScene.room,human:currentScene.human,regions:currentScene.compiled.overlays},results:currentResults};
  }
  function queueResultRender(){if(resultRAF)return;const id=requestId;resultRAF=requestAnimationFrame(()=>{resultRAF=0;if(id===requestId)renderResult();});}
  function receiveResult(r){const i=currentResults.findIndex(x=>x.segment===r.segment);if(i<0)currentResults.push(r);else currentResults[i]=r;}
  function clearCalculation(){currentResults=[];$('seg_download').disabled=true;for(const id of ['seg_export_link','seg_export_preview'])if($(id))$(id).remove();if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}renderResult();}
  function cancel(message){requestId++;if(resultRAF){cancelAnimationFrame(resultRAF);resultRAF=0;}if(startupTimer){clearTimeout(startupTimer);startupTimer=null;}if(worker)worker.postMessage({type:'cancel'});if(launchTimer){clearTimeout(launchTimer);launchTimer=null;}running=false;applyMode();if(message){status.textContent=message;renderResult();}if(window.VF10701PageState)window.VF10701PageState.running=false;}
  function fail(id,message){if(id!==requestId)return;running=false;clearCalculation();status.className='seg-error';status.textContent='计算停止：'+message;applyMode();}
  function complete(id){if(id!==requestId)return;if(resultRAF){cancelAnimationFrame(resultRAF);resultRAF=0;}if(currentResults.length!==16){fail(id,'返回结果不完整，请重新计算。');return;}running=false;status.className='';const passed=currentResults.filter(r=>r.quality.passed).length;status.textContent='计算完成 · 16 节段，'+passed+'/16 达到积分精度目标。'+(passed<16?'部分结果达到积分资源上限，结果标为未达精度。':'')+(currentResults.every(r=>r.reusedGeometry)?' 已复用几何数据。':'');renderResult();reportResources();}
  function reportResources(){
    const elapsed=performance.now()-calculationStarted,reused=currentResults.filter(r=>r.reusedGeometry).length;
    window.VF101902Diagnostics={elapsedMs:elapsed,mode:worker?'worker':'main',reusedSegments:reused,implementation:'101902-scalar-1',...lastStats};
    let panel=$('seg-resources');if(!panel){panel=document.createElement('details');panel.id='seg-resources';status.insertAdjacentElement('afterend',panel);}
    const mb=n=>(n/1048576).toFixed(1),bytes=(lastStats?.runner?.geometryCache.bytes||0)+(lastStats?.resources?.floorCache.bytes||0);
    panel.innerHTML='<summary>本次计算 '+(elapsed/1000).toFixed(2)+' 秒 · 几何复用 '+reused+'/16</summary><p>当前响应缓存约 '+mb(bytes)+' MiB；本页累计读取响应分片 '+(lastStats?.resources?.loadedRecords||0)+' 份，约 '+mb(lastStats?.resources?.loadedBytes||0)+' MiB。'+(worker?'浏览器后台线程。':'浏览器兼容计算模式。')+'缓存为程序估算，不代表浏览器总内存。未缓存位置仍需首次积分。</p>';
  }
  function progress(id,p){if(id!==requestId)return;lastProgress=Date.now();status.className='';status.textContent=(p.phase||'计算')+' · '+segmentNames[p.segment]+'（'+(p.index+1)+'/16）'+(p.batch?' · 批次 '+p.batch+'/'+p.batches:'')+(p.face?' · '+faceNames[p.face]+' · 层级 '+p.level:'');}
  async function runFallback(id,payload,reason){
    if(id!==requestId)return;if(!fallbackRunner){fallbackResources=VF101902Resources.createProvider();fallbackRunner=VF10701IntegralRunner.createRunner({geometryProvider:fallbackResources.geometry,floorProvider:fallbackResources.floor});}status.textContent=reason+' 正在页面内计算…';clearCalculation();
    try{await fallbackRunner.run(payload.scene,payload.options,{cancelled:()=>id!==requestId,progress:p=>progress(id,p),segment:r=>{if(id!==requestId)return;receiveResult(r);queueResultRender();}});lastStats={runner:fallbackRunner.stats(),resources:fallbackResources.stats()};complete(id);}catch(error){fail(id,error.message);}
  }
  function ensureWorker(id,payload){
    if(location.protocol==='file:'||new URLSearchParams(location.search).has('vf-main-thread')||typeof Worker==='undefined'){runFallback(id,payload,'兼容模式：');return;}
    try{
      latestPayload=payload;
      if(!worker){worker=new Worker('101902-integral-worker.js');startupTimer=setTimeout(()=>{if(!worker||!running||latestPayload?.requestId!==requestId)return;worker.terminate();worker=null;runFallback(requestId,latestPayload,'线程启动超时，已切换兼容模式：');},4000);
        worker.onmessage=event=>{const m=event.data;if(m.type==='ready'){clearTimeout(startupTimer);startupTimer=null;return;}if(m.requestId!==requestId)return;lastProgress=Date.now();if(m.type==='progress')progress(m.requestId,m);else if(m.type==='segment'){receiveResult(m.result);queueResultRender();}else if(m.type==='done'){lastStats=m.stats;complete(m.requestId);}else if(m.type==='error')fail(m.requestId,m.message);};
        worker.onerror=event=>{if(event.preventDefault)event.preventDefault();clearTimeout(startupTimer);startupTimer=null;if(worker)worker.terminate();worker=null;if(running&&latestPayload?.requestId===requestId)runFallback(requestId,latestPayload,'计算线程不可用，已切换兼容模式：');};
      }
      worker.postMessage(payload);
    }catch(error){worker=null;runFallback(id,payload,'计算线程不可用，已切换兼容模式：');}
  }
  function start(force=false){
    if(running&&!force){cancel('计算已取消。');return;}if(!currentScene)return;
    cancel();const id=requestId;running=true;lastProgress=Date.now();status.className='';status.textContent='正在启动计算…';calculationStarted=performance.now();lastStats=null;clearCalculation();
    const payload={type:'run',requestId:id,scene:{room:currentScene.room,human:currentScene.human,regions:currentScene.compiled.overlays},mode:'integral',options:C.options({precision:'standard'})};ensureWorker(id,payload);
  }
  setInterval(()=>{if(running&&!document.hidden&&Date.now()-lastProgress>60000){const id=requestId;cancel();if(worker){worker.terminate();worker=null;}fail(requestId,'计算长时间未响应，请重新计算。');}},10000);
  function rayProjection(mode,width,height){const local=mode==='local',center=local?VFRebuild.localPointToWorld([0,.62,0],currentScene.human):[currentScene.room.width/2,currentScene.room.height/2,currentScene.room.depth/2],span=local?1.65:Math.max(currentScene.room.width,currentScene.room.depth,currentScene.room.height)*1.25,scale=Math.min(width,height)/span*rayCamera.zoom,cy=Math.cos(rayCamera.yaw),sy=Math.sin(rayCamera.yaw),cp=Math.cos(rayCamera.pitch),sp=Math.sin(rayCamera.pitch);return point=>{const dx=point[0]-center[0],dy=point[1]-center[1],dz=point[2]-center[2],rx=cy*dx-sy*dz,depth=sy*dx+cy*dz,ry=cp*dy-sp*depth;return [width/2+rx*scale+(rayCamera.panX||0)*width,height/2-ry*scale+(rayCamera.panY||0)*height,cp*depth+sp*dy,scale];};}
  function drawRayIllustration(){
    if(!currentScene)return;const canvas=$('seg_ray_canvas'),ctx=canvas.getContext('2d'),mode=$('seg_ray_view').value,index=Number($('seg_ray_segment').value||0),count=Number($('seg_ray_count').value),illustration=VFRebuild.illustrateRays(currentScene,index,{count,seed:raySeed}),project=rayProjection(mode,canvas.width,canvas.height);
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);if(mode==='room')VFSceneView.drawRoom(ctx,currentScene,project);
    const counts={base:0,window:0,panel:0,body:0},colors={base:'#64748b',window:'#0891b2',panel:'#dc2626',body:'#d97706'};
    for(const ray of illustration.rays){const region=ray.receiver.startsWith('body:')?null:currentScene.compiled.byId.get(ray.receiver),kind=region?region.kind:'body',A=project(ray.origin);let end=ray.end;if(mode==='local'){const d=end.map((x,i)=>x-ray.origin[i]),length=Math.hypot(...d),ratio=Math.min(.9,length)/length;end=ray.origin.map((x,i)=>x+d[i]*ratio);}const B=project(end);counts[kind]++;ctx.strokeStyle=colors[kind];ctx.globalAlpha=.62;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();ctx.globalAlpha=1;}
    const chosen=currentScene.segments[index],P=VFSceneView.drawBody(ctx,currentScene,index,project);ctx.fillStyle='#991b1b';ctx.font='600 15px system-ui';ctx.fillText(segmentNames[chosen.name],P[0]+10,P[1]-10);if(viewFallback)viewFallback.select(index);else if(frameReady)frame.contentWindow.postMessage({type:'segment-selected',index},'*');
    $('seg_ray_info').textContent=segmentNames[chosen.name]+' · '+count+' 条首碰示意：普通围护面 '+counts.base+'，窗 '+counts.window+'，局部辐射面 '+counts.panel+'，人体遮挡 '+counts.body+'。示意射线用于解释，不代表正式计算样本数。';
  }
  window.rejectSegmentsInput=function(message){cancel();currentScene=null;window.dispatchEvent(new Event("vf1020:invalid"));sceneSignature="";clearCalculation();status.className="seg-error";status.textContent=message;};
  window.renderSegmentsBridge=function(M){
    if(['seg_x','seg_y'].some(id=>document.activeElement===$(id)&&$(id).value.trim()==='')){cancel('等待有效人体位置。');currentScene=null;window.dispatchEvent(new Event("vf1020:invalid"));sceneSignature='';clearCalculation();return;}
    if(!frame.getAttribute('src')){frame.setAttribute('src',frame.dataset.src);frameTimer=setTimeout(()=>{frameTimer=null;if(frameReady||!pendingVisual||!window.VF10701CanvasRoomView)return;viewFallback=VF10701CanvasRoomView.start({element:frame,scene:pendingVisual,index:Number($('seg_ray_segment').value)||0,active:location.hash==='#segments'});window.dispatchEvent(new Event('vf1020:view-ready'));drawRayIllustration();},1800);}if(document.activeElement!==$('seg_x'))$('seg_x').value=M.mx1.toFixed(2);if(document.activeElement!==$('seg_y'))$('seg_y').value=M.my1.toFixed(2);
    try{currentScene=C.validateScene(linkedScene(M));}catch(error){cancel();sceneSignature='';currentScene=null;window.dispatchEvent(new Event("vf1020:invalid"));clearCalculation();resultBox.innerHTML='<p class="seg-error">当前房间不能容纳所定义的人体或区域无效。</p>';status.className='seg-error';status.textContent=error.message;return;}
    window.dispatchEvent(new CustomEvent("vf1020:scene",{detail:{scene:currentScene,solar:{...M.sol}}}));
    pendingVisual={room:currentScene.room,human:currentScene.human,segments:currentScene.segments,regions:currentScene.compiled.overlays};const visualKey=JSON.stringify({key:C.geometryKey(currentScene),regions:currentScene.compiled.overlays.map(r=>[r.id,r.kind,r.face,r.u0,r.u1,r.v0,r.v1])});if(visualKey!==visualSignature){visualSignature=visualKey;sendVisual();drawRayIllustration();}
    $('seg_scene_summary').textContent='房间 '+M.W.toFixed(2)+' × '+M.D.toFixed(2)+' × '+M.H.toFixed(2)+' m；'+currentScene.compiled.overlays.filter(r=>r.kind==='window').length+' 扇窗，'+currentScene.compiled.overlays.filter(r=>r.kind==='panel').length+' 个有效辐射面分片；统一人体 '+C.MODEL_SPEC.geometryId+'，墙面分区参考高度 0.6 m。';
    const shape=JSON.stringify({key:C.geometryKey(currentScene),regions:currentScene.compiled.overlays.map(r=>({id:r.id,kind:r.kind,face:r.face,u0:r.u0,u1:r.u1,v0:r.v0,v1:r.v1}))});
    const unchangedSnapshot=JSON.stringify({geometry:C.geometryKey(currentScene),regions:currentScene.compiled.regions,mode:'integral',precision:'standard'});if(!running&&currentResults.length===16&&unchangedSnapshot===sceneSignature)return;
    if(!running&&currentResults.length===16&&shape===window.VF10701LastShape){sceneSignature=unchangedSnapshot;for(const r of currentResults){const q=r.quality.checks.find(c=>c.id==='MRT'),m=C.mrt(r,currentScene);q.errorEstimate=m.errorEstimate;q.passed=m.celsius===null||m.errorEstimate<=.025;r.quality.passed=r.quality.checks.every(c=>c.passed);}renderResult();status.textContent='已复用几何 VF，热结果已更新。';return;}
    const cachedGeometry=window.VF10701LastShape&&JSON.parse(window.VF10701LastShape).key===C.geometryKey(currentScene);
    window.VF10701LastShape=shape;
    const next=JSON.stringify({geometry:C.geometryKey(currentScene),regions:currentScene.compiled.regions,mode:'integral',precision:'standard'});
    if(next!==sceneSignature){sceneSignature=next;cancel();clearCalculation();status.className='';status.textContent='场景已更新，准备计算…';launchTimer=setTimeout(()=>{launchTimer=null;start(true);},cachedGeometry?0:150);}
  };
  window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||!event.data)return;if(event.data.type==='segment-ready'){if(frameTimer){clearTimeout(frameTimer);frameTimer=null;}frameReady=true;sendVisual();window.dispatchEvent(new Event("vf1020:view-ready"));drawRayIllustration();frame.contentWindow.postMessage({type:'segment-active',active:location.hash==='#segments'},'*');}});
  for(const axis of ['x','y'])for(const type of ['input','change'])$('seg_'+axis).addEventListener(type,event=>{const value=parseFloat(event.currentTarget.value);if(!Number.isFinite(value)){cancel('等待有效人体位置。');currentScene=null;window.dispatchEvent(new Event("vf1020:invalid"));sceneSignature='';clearCalculation();return;}if(Number.isFinite(value)){$(axis==='x'?'m1x':'m1y').value=value.toFixed(2);scheduleRender();}});
  $('seg_facing').addEventListener('change',()=>render());$('seg_mode').addEventListener('change',renderResult);$('seg_run').addEventListener('click',()=>start());
  $('seg_edit').addEventListener('click',()=>{location.hash='#comfort';document.querySelector('#view-comfort .rail').scrollIntoView({behavior:'smooth'});});
  const select=$('seg_part_pick');select.innerHTML=C.MODEL_SPEC.segments.map(s=>'<option value="'+s.name+'">'+segmentNames[s.name]+'</option>').join('');
  select.addEventListener('change',()=>{if(!currentScene)return;selectedSegment=select.value;$('seg_ray_segment').value=String(currentScene.segments.findIndex(s=>s.name===selectedSegment));renderDetail();drawRayIllustration();});
  $('seg_download').addEventListener('click',()=>window.VF1020Export?.());
  $('seg_ray_segment').innerHTML=C.MODEL_SPEC.segments.map((s,index)=>'<option value="'+index+'">'+segmentNames[s.name]+'</option>').join('');
  for(const id of ['seg_ray_segment','seg_ray_count','seg_ray_view'])$(id).addEventListener('change',()=>{if(id==='seg_ray_segment'){selectedSegment=C.MODEL_SPEC.segments[Number($('seg_ray_segment').value)].name;select.value=selectedSegment;renderDetail();}drawRayIllustration();});
  $('seg_ray_refresh').addEventListener('click',()=>{raySeed=(raySeed+0x9e3779b9)>>>0;drawRayIllustration();});
  VFSceneView.attachCamera($('seg_ray_canvas'),rayCamera,drawRayIllustration,{rotateButton:2,panButton:0});
  $('seg_ray_reset').addEventListener('click',()=>{Object.assign(rayCamera,{yaw:-.72,pitch:-.22,zoom:1,panX:0,panY:0});drawRayIllustration();});
  window.addEventListener('hashchange',()=>{if(viewFallback)viewFallback.setActive(location.hash==='#segments');else if(frameReady)frame.contentWindow.postMessage({type:'segment-active',active:location.hash==='#segments'},'*');});
  $('seg_geometry_parameters').innerHTML='<div class="paper-table-wrap"><table><thead><tr><th>编号</th><th>节段</th><th>半径 m</th><th>长度 m</th><th>局部中心 (前、上、左) m</th><th>发射表面</th></tr></thead><tbody>'+VFRebuild.createPaperDimensionAuthorLayout().map((s,index)=>'<tr><td>'+(index+1)+'</td><td>'+segmentNames[s.name]+'</td><td>'+fmt(s.radius,4)+'</td><td>'+fmt(s.length,3)+'</td><td>'+s.center.map(v=>fmt(v,5)).join(', ')+'</td><td>'+ (s.shape==='sphere'?'球面':s.emitter?(s.name==='chest'?'躯干前半侧面':'躯干后半侧面'):'圆柱侧面')+'</td></tr>').join('')+'</tbody></table></div>';
  applyMode();renderValidation();if(location.hash==='#segments')requestAnimationFrame(()=>render());
})();
