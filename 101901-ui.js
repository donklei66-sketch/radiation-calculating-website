(function(){
  'use strict';
  const C=window.UI101901Core,$=id=>document.getElementById(id),bar=$('ui-update-bar');if(!C||!bar)return;
  const oldRead=readModel,oldRender=render,oldM2=updateM2,oldM2Figure=reportM2Fig,oldSticky=syncSticky;
  const initial=oldRead(),points=C.createPoints({x:initial.mx1,y:initial.my1,z:initial.z});
  const aliases={m1x:['m1','x'],m1y:['m1','y'],m1z:['m1','z'],m2x:['m2','x'],m2y:['m2','y'],m2z:['m2','z'],'m2h-z':['m2','z'],slice_x:['m1','x'],slice_x_n:['m1','x'],slice_y:['m1','y'],slice_y_n:['m1','y'],slice_z:['m1','z'],slice_z_n:['m1','z']};
  const edited=new Set();let dirty=false,numericPending=false,applying=false,permit=false,revision=0,queuedFrame=null,queuedTimer=null,lastClamped=false,committed=null;
  const number=v=>String(Number(v));
  const locationText=M=>'评估点 ('+[M.mx1,M.my1,M.z].map(v=>v.toFixed(3)).join(', ')+')';
  function cancelScheduled(){clearTimeout(timer);timer=null;if(sliceRAF){cancelAnimationFrame(sliceRAF);sliceRAF=null;}$('busy').classList.remove('on');}
  function cancelQueued(){if(queuedFrame!==null)cancelAnimationFrame(queuedFrame);if(queuedTimer!==null)clearTimeout(queuedTimer);queuedFrame=null;queuedTimer=null;applying=false;}
  function paint(message,state){
    bar.hidden=activeView!=='comfort'&&!dirty;bar.dataset.state=state||(applying?'applying':dirty?'pending':'ready');
    const text=message||(applying?'正在更新计算…':dirty?'参数待更新；当前图表保留上次结果。按Enter或点击“更新计算”。':'计算已更新。输入完成后按Enter或点击更新；滑块松开后计算。');
    if($('ui-input-status').textContent!==text)$('ui-input-status').textContent=text;
    $('ui-apply').disabled=!dirty||applying;$('ui-apply').textContent=applying?'计算中…':'更新计算';bar.setAttribute('aria-busy',String(applying));
  }
  function syncAliases(origin,force=false){
    const changed=origin&&aliases[origin.id];
    for(const [id,[source,axis]] of Object.entries(aliases)){
      const el=$(id);if(!el)continue;
      if(!force){
        if(el===origin||document.activeElement===el)continue;
        if(changed&&(axis!==changed[1]||(!points.linked&&source!==changed[0])))continue;
        if(!changed&&edited.has(el)&&(el.value.trim()===''||el.validity.badInput))continue;
      }
      el.value=number(points[source][axis]);
    }
    $('points-linked').checked=points.linked;
    $('point-link-note').textContent=points.linked?'同点联动：M1、M2与主图剖面可从任一处修改；M2云图高度同步。':'独立评估：主图剖面对应M1；M2单点与云图使用自己的坐标。重新联动时采用M1坐标。';
    $('point-slice-label').textContent=points.linked?'联动评估点 / 剖面':'M1评估点 / 剖面';
    $('m1hint').textContent=(points.linked?'M1、M2及主图剖面使用同一组x/y/z；可在任一处输入。':'M1与主图剖面联动；M2已独立设置。')+'评估点与围护面保留至少1 mm。'+($('pmodel').value==='box'?'长方体底面贴地，尺寸如上。':'');
  }
  function mark(el,kind='number'){
    cancelQueued();cancelScheduled();dirty=true;revision++;if(kind==='number')numericPending=true;
    if(el){edited.add(el);el.dataset.draft='true';el.removeAttribute('aria-invalid');}paint();
  }
  function normalized(){
    // Match the existing room limits before bounding either point or solving.
    clampField('W',1,50);clampField('D',1,50);clampField('H',1.8,10);
    const room={W:Number($('W').value),D:Number($('D').value),H:Number($('H').value)};
    for(const axis of ['x','y','z'])C.editPoint(points,'m1',axis,$('m1'+axis).value);
    if(!points.linked)for(const axis of ['x','y','z'])C.editPoint(points,'m2',axis,$('m2'+axis).value);
    lastClamped=C.clampPoints(points,room);
    for(const [axis,max] of [['x',room.W],['y',room.D],['z',room.H]]){
      const upper=Number((max-.001).toFixed(6)),lower=axis==='z'?.1:.001;
      $('slice_'+axis).max=upper;$('slice_'+axis).min=lower;$('slice_'+axis).step='any';$('slice_'+axis+'_n').max=upper;$('slice_'+axis+'_n').min=lower;
      for(const prefix of ['m1','m2']){$(prefix+axis).max=upper;$(prefix+axis).min=lower;}
    }
    $('m2h-z').max=Number((room.H-.001).toFixed(6));syncAliases(null,true);
  }
  function label(el){return el.getAttribute('aria-label')||el.closest('.field')?.querySelector('span')?.textContent||el.closest('label')?.textContent.trim()||'数值输入';}
  function invalid(){
    for(const el of edited){if(!el.isConnected||el.disabled||el.type!=='number')continue;
      if((el.id==='cb_lo'||el.id==='cb_hi')&&el.value.trim()==='')continue;
      if(el.value.trim()===''||!Number.isFinite(el.valueAsNumber)||el.validity.badInput)return [el,'请完成“'+label(el)+'”，数值不能为空或格式不完整。'];
      const geometry=aliases[el.id]||/^win_.*_[uvwh]$/.test(el.id)||/^m1b[wdh]$/.test(el.id)||el.closest('.local-panel');
      if(!geometry&&((el.min!==''&&el.valueAsNumber<Number(el.min))||(el.max!==''&&el.valueAsNumber>Number(el.max))))return [el,'“'+label(el)+'”超出允许范围，请检查最小值和最大值。'];
    }return null;
  }
  function commitNow(){
    cancelQueued();cancelScheduled();const problem=invalid();if(problem){problem[0].setAttribute('aria-invalid','true');problem[0].focus();paint(problem[1],'error');return false;}
    applying=true;permit=true;paint();
    try{
      normalized();const clamped=lastClamped;render();
      dirty=false;numericPending=false;for(const el of edited){delete el.dataset.draft;el.removeAttribute('aria-invalid');}edited.clear();
      applying=false;paint(clamped?'计算已更新；评估坐标已限制在室内，与围护面保留至少1 mm。':undefined);return true;
    }catch(error){applying=false;paint('计算未更新：'+error.message,'error');return false;}finally{permit=false;syncSticky();}
  }
  function apply(){
    if(!dirty||applying)return;const problem=invalid();if(problem){problem[0].setAttribute('aria-invalid','true');problem[0].focus();paint(problem[1],'error');return;}
    const token=revision;applying=true;paint();queuedFrame=requestAnimationFrame(()=>{queuedFrame=null;queuedTimer=setTimeout(()=>{queuedTimer=null;if(token!==revision){applying=false;paint();return;}commitNow();},0);});
  }
  window.UI101901=Object.freeze({requestRender:()=>dirty&&!permit,deferRender:()=>dirty&&!permit,getState:()=>({dirty,applying,linked:points.linked,m1:{...points.m1},m2:{...points.m2}}),apply});
  readModel=function(){
    // Legacy UI callbacks may read the model directly while an input is blank.
    // Until commit, every consumer receives the last complete calculation state.
    if(dirty&&!permit&&committed)return structuredClone(committed);
    const M=oldRead(),linked=$('points-linked').checked,p=C.createPoints({x:linked?M.mx1:Number($('m2x').value),y:linked?M.my1:Number($('m2y').value),z:linked?M.z:Number($('m2z').value)});C.clampPoints(p,M);return {...M,mx2:p.m1.x,my2:p.m1.y,z2:p.m1.z,pointsLinked:linked};
  };
  render=function(light){
    if(dirty&&!permit)return;normalized();const result=oldRender(light),applied=readModel();committed=structuredClone(applied);
    points.m1={x:applied.mx1,y:applied.my1,z:applied.z};points.m2={x:applied.mx2,y:applied.my2,z:applied.z2};C.clampPoints(points,applied);syncAliases(null,true);
    const hint=$('m1compare').querySelector('p.hint');if(hint)hint.textContent=hint.textContent.replace(/^评估点 \([^)]*\)/,locationText(applied));paint();return result;
  };
  updateM2=function(M,grid){
    const m2=C.modelForM2(M),result=oldM2(m2,M.pointsLinked===false?occGrid(m2):grid),label=$('m2out').querySelector('.eyebrow')?.firstChild;
    if(label?.nodeType===Node.TEXT_NODE)label.textContent=label.textContent.replace(/^评估点 \([^)]*\)/,locationText(m2));
    if(M.pointsLinked===false){for(const el of $('m2out').querySelectorAll('span'))if(el.childElementCount===0&&el.textContent==='M1 长波 MRT（人体投影角系数法）')el.textContent='M2评估点长波MRT（人体模型，同点比较）';}return result;
  };
  reportM2Fig=function(M){return oldM2Figure(C.modelForM2(M));};
  syncSticky=function(){oldSticky();const height=bar.hidden?0:bar.getBoundingClientRect().height+16;document.documentElement.style.setProperty('--input-toolbar-h',height+'px');const cb=document.querySelector('.cbar');if(cb){const base=$('summary').getBoundingClientRect().height+8;cb.style.top=base+height+'px';document.documentElement.style.setProperty('--hdr',base+height+cb.getBoundingClientRect().height+'px');}};
  document.addEventListener('input',event=>{
    const el=event.target;if(el===$('points-linked')){C.linkPoints(points,el.checked);syncAliases();mark(el,'config');return;}
    if(!el.matches?.('#view-comfort input[type="number"],#view-comfort input[type="range"]'))return;
    mark(el,el.type==='range'?'range':'number');const mapping=aliases[el.id];if(mapping&&C.editPoint(points,...mapping,el.value)){if(el.type==='range'){C.editPoint(points,...mapping,Number(Number(el.value).toFixed(3)));el.value=points[mapping[0]][mapping[1]];}syncAliases(el);}
  },true);
  document.addEventListener('change',event=>{const el=event.target;if(el.matches?.('#view-comfort input[type="range"]')&&dirty&&!numericPending)apply();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches?.('#view-comfort input[type="number"]')){event.preventDefault();event.stopImmediatePropagation();apply();}},true);
  // Explicit solve/report actions must use the completed batch, never a partial numeric draft.
  document.addEventListener('click',event=>{const button=event.target.closest?.('#genreport,#solve2,#sweep,#m3topcopy,#m3water [data-m3-rh]');if(button&&dirty&&!commitNow()){event.preventDefault();event.stopImmediatePropagation();}},true);
  $('ui-apply').addEventListener('click',apply);
  window.addEventListener('hashchange',()=>{paint();syncSticky();});
  cancelScheduled();normalized();committed=structuredClone(readModel());paint();syncSticky();
  // The horizontal adapter loads after the first field render. Initialize only
  // its M2 view here instead of scheduling another complete room-field solve.
  if(!$('m2h-result').dataset.height){const model=readModel();updateM2(model,occGrid(model));}
  new ResizeObserver(()=>syncSticky()).observe(bar);
})();
