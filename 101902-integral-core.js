(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./101902-surface-density.js'):root.VFSurfaceDensity,typeof module==='object'&&module.exports?require('./vf-rebuild-core.js'):root.VFRebuild);if(typeof module==='object'&&module.exports)module.exports=api;else root.VF10701Integral=api;})(typeof globalThis!=='undefined'?globalThis:this,function(D,VF){
  'use strict';
  const VERSION='2.4.0',FACES=D.FACES,METHOD='positive physical surface density with analytic sphere-radial and cylinder-axis integration';
  const configs=[{grid:24,panels:16,betaPanels:8,angular:32,radial:8,nearSubdivisions:12},{grid:48,panels:32,betaPanels:16,angular:64,radial:12,nearSubdivisions:12},{grid:96,panels:64,betaPanels:32,angular:96,radial:16,nearSubdivisions:24},{grid:192,panels:128,betaPanels:32,angular:192,radial:24,nearSubdivisions:48},{grid:384,panels:256,betaPanels:64,angular:256,radial:32,nearSubdivisions:96},{grid:48,panels:128,betaPanels:32,angular:192,radial:24,nearSubdivisions:24,psiQuadrature:true,gradeSource:true,gradeBlockers:true,cellOrder:2},{grid:96,panels:256,betaPanels:64,angular:256,radial:32,nearSubdivisions:48,psiQuadrature:true,gradeSource:true,gradeBlockers:true,cellOrder:2}];
  configs.push({grid:192,panels:256,betaPanels:128,angular:384,radial:48,nearSubdivisions:96,psiQuadrature:true,gradeSource:true,gradeBlockers:true,cellOrder:2});
  for(const config of configs){config.gradeBlockers=true;config.cellOrder=2;config.disablePointCache=true;}
 // A reflected sub-ULP interval can collapse to one representable coordinate.
 // Coalesce only zero-width mapped cells, conserving their positive mass.
 // Refuse significant collapsed mass; this never clips a negative factor.
 function coalesceMappedGrid(g){
  if(!g.u.some((x,i)=>i&&x===g.u[i-1])&&!g.v.some((x,i)=>i&&x===g.v[i-1]))return g;
  const u=Array.from(new Set(g.u)),v=Array.from(new Set(g.v));if(u.some((x,i)=>i&&x<u[i-1])||v.some((x,i)=>i&&x<v[i-1]))throw new Error('Mapped grid boundary order invalid');
  const nx=u.length-1,ny=v.length-1,um=new Map(u.map((x,i)=>[x,Math.min(i,nx-1)])),vm=new Map(v.map((x,i)=>[x,Math.min(i,ny-1)])),mass=new Float64Array(nx*ny);let collapsedMass=0;
  for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){const value=g.mass[j*g.nx+i];if(g.u[i]===g.u[i+1]||g.v[j]===g.v[j+1])collapsedMass+=value;mass[vm.get(g.v[j])*nx+um.get(g.u[i])]+=value;}
  if(collapsedMass>1e-12)throw new Error('Collapsed mapped cells have significant mass');
  const stride=nx+1,prefix=new Float64Array(stride*(ny+1));for(let j=0;j<ny;j++){let row=0;for(let i=0;i<nx;i++){row+=mass[j*nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
  return {...g,u,v,nx,ny,mass,prefix,total:prefix[ny*stride+nx],coalescedMappedMass:(g.coalescedMappedMass||0)+collapsedMass};
 }
  function options(o={}){return {precision:'standard',maxLevel:7,yieldMs:8,...o};}
  function tolerance(value,kind,precision='standard'){if(precision==='preview')return .002;return kind==='face'?Math.min(.001,value>=.05?.01*value:.001):Math.min(.0005,value>=.02?.02*value:.0005);}
  function geometryKey(scene){return D.geometryKey(scene);}
  function mirrorGeometry(geometry,scene,index){
    const name=scene.segments[index].name,source=scene.segments[geometry.index];if(!name.startsWith('r_')||source.name!=='l_'+name.slice(2))return null;
    const flipX=scene.human.facing==='north'||scene.human.facing==='south',position=flipX?scene.human.x:scene.human.z,extent=flipX?scene.room.width:scene.room.depth;if(Math.abs(position-extent/2)>1e-12||scene.human.yawDegrees!==undefined)return null;
    const swap=flipX?{west:'east',east:'west'}:{north:'south',south:'north'};
    function grid(g,face){const x=flipX?['floor','ceiling','south','north'].includes(face):['west','east'].includes(face),y=!flipX&&['floor','ceiling'].includes(face),mass=new Float64Array(g.mass.length);
      for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++)mass[j*g.nx+i]=g.mass[(y?g.ny-1-j:j)*g.nx+(x?g.nx-1-i:i)];
      return unpackGrid(coalesceMappedGrid({...g,face,segment:name,u:x?g.u.slice().reverse().map(v=>g.width-v):g.u.slice(),v:y?g.v.slice().reverse().map(v=>g.height-v):g.v.slice(),mass,prefix:null,anchorU:x?g.width-g.anchorU:g.anchorU,anchorV:y?g.height-g.anchorV:g.anchorV}));
    }
    return {...geometry,segment:name,index,faces:Object.fromEntries(FACES.map(face=>{const pair=geometry.faces[swap[face]||face];return [face,{...pair,low:grid(pair.low,face),high:grid(pair.high,face)}];})),reuseDefinition:'Exact reflection of the frozen bilateral geometry about the room symmetry plane; all region queries evaluated anew'};
  }
  function validateScene(input){return D.validateScene(input);}
  function stat(mean,low){return {mean,errorEstimate:Math.abs(mean-low),uncertaintyKind:'successive physical quadrature refinement; not a confidence interval'};}
  function evaluateGeometry(geometry,input,o={}){
    const scene=input.compiled?input:validateScene(input);if(geometry.key!==geometryKey(scene))throw new Error('几何响应与当前房间、人体位置或版本不匹配');
    const receivers={},lowReceivers={},faces={},zones={},lowZones={},checks=[];let room=0,lowRoom=0;
    for(const face of FACES){const pair=geometry.faces[face],high=D.partition(pair.high,scene),low=D.partition(pair.low,scene);faces[face]=stat(pair.high.total,pair.low.total);room+=pair.high.total;lowRoom+=pair.low.total;
      for(const [id,value] of Object.entries(high.values)){receivers[id]=stat(value,low.values[id]||0);lowReceivers[id]=low.values[id]||0;}
      for(const [id,value] of Object.entries(high.zones)){zones[id]=stat(value,low.zones[id]||0);lowZones[id]=low.zones[id]||0;}
      const target=tolerance(pair.high.total,'face',o.precision);checks.push({id:face,kind:'face',errorEstimate:faces[face].errorEstimate,target,passed:faces[face].errorEstimate<=target/4});
      checks.push({id:face+':partition',kind:'algebra',errorEstimate:Math.abs(high.sum-pair.high.total),target:1e-10,passed:Math.abs(high.sum-pair.high.total)<=1e-10&&Math.abs(Object.values(high.zones).reduce((a,b)=>a+b,0)-pair.high.total)<=1e-10});
      for(const r of scene.compiled.byFace[face]){const target=tolerance(receivers[r.id].mean,'region',o.precision);checks.push({id:r.id,kind:r.kind,errorEstimate:receivers[r.id].errorEstimate,target,passed:receivers[r.id].errorEstimate<=target/4});}
      if(scene.compiled.byFace[face].length){const id='base:'+face,target=tolerance(receivers[id].mean,'region',o.precision);checks.push({id,kind:'base-region',errorEstimate:receivers[id].errorEstimate,target,passed:receivers[id].errorEstimate<=target/4});}
    }
    const result={segment:geometry.segment,segmentIndex:geometry.index,engineVersion:VERSION,geometryId:VF.MODEL_SPEC.geometryId,definitionHash:VF.MODEL_SPEC.definitionHash,method:METHOD,precision:o.precision||'standard',nominalGeometricArea:scene.segments[geometry.index].geometricArea,exposedAreaEstimate:geometry.area,areaErrorRelative:geometry.areaErrorRelative,receivers,lowReceivers,faces,paperZones:zones,roomTotal:stat(room,lowRoom),bodyTotal:{...stat(1-room,1-lowRoom),derived:true,definition:'1 - sum of original environmental factors; independently checked offline'},grids:Object.fromEntries(FACES.map(f=>[f,geometry.faces[f].high])),levels:Object.fromEntries(FACES.map(f=>[f,geometry.faces[f].level])),sourceAreaDefinition:'exposed diffuse emitting sphere/cylinder side area; blockers and caps retained separately'};
    checks.push({id:'area',kind:'area',errorEstimate:geometry.areaErrorRelative,target:.001,passed:geometry.areaErrorRelative<=.001});
    checks.push({id:'range',kind:'physical',passed:Number.isFinite(geometry.area)&&geometry.area>0&&Number.isFinite(room)&&room<=1+1e-9&&room>=0&&[...Object.values(faces),...Object.values(receivers),...Object.values(zones)].every(x=>Number.isFinite(x.mean)&&x.mean>=0&&x.mean<=1)});
    const thermal=mrt(result,scene);checks.push({id:'MRT',kind:'thermal',errorEstimate:thermal.errorEstimate,target:.1,passed:thermal.celsius===null||thermal.errorEstimate<=.025});
    result.quality={passed:checks.every(c=>c.passed),checks,interpretation:'successive numerical refinement estimates, with offline independent verification; not total physical/model error'};return result;
  }
  function thermal(result,scene,low=false,area=1){let numerator=0,denominator=0;
    for(const r of scene.compiled.regions){const f=low?result.lowReceivers[r.id]:result.receivers[r.id].mean,T=r.temperature+273.15,weight=area*f*r.emissivity;denominator+=weight;numerator+=weight*T**4;}
    return {numerator,denominator,celsius:denominator>0?(numerator/denominator)**.25-273.15:null};
  }
  function mrt(result,scene){const high=thermal(result,scene),low=thermal(result,scene,true);return {...high,errorEstimate:high.celsius===null||low.celsius===null?null:Math.abs(high.celsius-low.celsius),definition:'epsilon-weighted equivalent environmental MRT; excludes body temperatures and multiple gray-body reflection'};}
  function wholeMRT(results,scene){let numerator=0,denominator=0,lowN=0,lowD=0;for(const r of results){const h=thermal(r,scene,false,r.exposedAreaEstimate),l=thermal(r,scene,true,r.exposedAreaEstimate);numerator+=h.numerator;denominator+=h.denominator;lowN+=l.numerator;lowD+=l.denominator;}const celsius=denominator>0?(numerator/denominator)**.25-273.15:null,low=lowD>0?(lowN/lowD)**.25-273.15:null;return {celsius,errorEstimate:celsius===null||low===null?null:Math.abs(celsius-low),numerator,denominator};}
  function faceNeedsRefinement(pair,scene,face,o){const h=D.partition(pair.high,scene),l=D.partition(pair.low,scene);if(Math.abs(pair.high.total-pair.low.total)>tolerance(pair.high.total,'face',o.precision)/4)return true;
    if(scene.compiled.byFace[face].length&&Math.abs(h.values['base:'+face]-l.values['base:'+face])>tolerance(h.values['base:'+face],'region',o.precision)/4)return true;
    return scene.compiled.byFace[face].some(r=>Math.abs(h.values[r.id]-l.values[r.id])>tolerance(h.values[r.id],'region',o.precision)/4);
  }
  async function advance(gen,hooks,meta,yieldMs){let lastYield=Date.now(),next;do{
    if(hooks.cancelled?.())throw new Error('计算已取消');next=gen.next();
    if(!next.done&&Date.now()-lastYield>=yieldMs){hooks.progress?.({...meta,...next.value});await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();}
  }while(!next.done);return next.value;}
  async function buildGeometry(input,index,inputOptions={},previous,hooks={}){
    const scene=input.compiled?input:validateScene(input),o=options(inputOptions),key=geometryKey(scene),sources=new Map(),sourceAt=l=>{if(!sources.has(l))sources.set(l,D.makeSource(scene,index,{...configs[l],axial:2}));return sources.get(l);};
    if(previous&&previous.key!==key)throw new Error('不能复用其他工况的响应');
    const geo=previous?{...previous,faces:{...previous.faces}}:{key,segment:scene.segments[index].name,index,faces:{},geometryHash:VF.MODEL_SPEC.definitionHash};
    for(const face of FACES){let pair=geo.faces[face];
      if(!pair){const low=await advance(D.buildGenerator(scene,index,face,configs[0],sourceAt(0)),hooks,{index,segment:geo.segment,phase:'建立区域响应',face,level:0},o.yieldMs),high=await advance(D.buildGenerator(scene,index,face,configs[1],sourceAt(1)),hooks,{index,segment:geo.segment,phase:'积分精化',face,level:1},o.yieldMs);pair={low,high,level:1};}
      // Resolve geometric shadow/near-field boundaries before globally growing
      // the receiving grid to 192/384. Rules remain positive and use the same
      // physical density; refinement thresholds and independent gates are fixed.
      while(faceNeedsRefinement(pair,scene,face,o)&&pair.level<o.maxLevel){const level=pair.level>=2&&pair.level<5&&o.maxLevel>=5?5:pair.level+1,high=await advance(D.buildGenerator(scene,index,face,configs[level],sourceAt(level)),hooks,{index,segment:geo.segment,phase:'积分精化',face,level},o.yieldMs);pair={low:pair.high,high,level};}
      geo.faces[face]=pair;
    }
    const maxLevel=Math.max(...FACES.map(f=>geo.faces[f].level)),hi=sourceAt(maxLevel),lo=sourceAt(Math.max(0,maxLevel-1));geo.area=hi.area;geo.areaErrorRelative=Math.max(Math.abs(hi.area-lo.area),hi.areaError||0)/hi.area;geo.createdAt=new Date().toISOString();return geo;
  }
  function packGrid(g){const out={...g,mass:Array.from(g.mass),prefix:Array.from(g.prefix)};return out;}
  function unpackGrid(g){
    if(g.u?.length!==g.nx+1||g.v?.length!==g.ny+1||g.u[0]!==0||g.v[0]!==0||g.u[g.nx]!==g.width||g.v[g.ny]!==g.height||g.u.some((x,i)=>!Number.isFinite(x)||(i&&x<=g.u[i-1]))||g.v.some((x,i)=>!Number.isFinite(x)||(i&&x<=g.v[i-1])))throw new Error('接收网格没有完整覆盖围护面，拒绝使用缓存');
    let mass=g.mass;
    if(g.massFloat32Base64){const bytes=typeof Buffer!=='undefined'?Uint8Array.from(Buffer.from(g.massFloat32Base64,'base64')):Uint8Array.from(atob(g.massFloat32Base64),c=>c.charCodeAt(0));mass=Float64Array.from(new Float32Array(bytes.buffer));}
    else mass=mass instanceof Float64Array?mass:Float64Array.from(mass);
    if(mass.length!==g.nx*g.ny||mass.some(x=>!Number.isFinite(x)||x<0))throw new Error('缓存单元积分非有限或为负，拒绝使用');
    const prefix=g.prefix?(g.prefix instanceof Float64Array?g.prefix:Float64Array.from(g.prefix)):new Float64Array((g.nx+1)*(g.ny+1)),stride=g.nx+1;
    if(!g.prefix)for(let j=0;j<g.ny;j++){let row=0;for(let i=0;i<g.nx;i++){row+=mass[j*g.nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
    const out={...g,mass,prefix,total:prefix[g.ny*stride+g.nx]};delete out.massFloat32Base64;return out;
  }
  function packGeometry(g){return {...g,faces:Object.fromEntries(FACES.map(f=>[f,{...g.faces[f],low:packGrid(g.faces[f].low),high:packGrid(g.faces[f].high)}]))};}
  function unpackGeometry(g){return {...g,faces:Object.fromEntries(FACES.map(f=>[f,{...g.faces[f],low:unpackGrid(g.faces[f].low),high:unpackGrid(g.faces[f].high)}]))};}
  function packedResult(r,includeGrids=false){const out={...r};if(!includeGrids)delete out.grids;else out.grids=Object.fromEntries(FACES.map(f=>[f,packGrid(r.grids[f])]));return out;}
  return {IMPLEMENTATION_VERSION:"101902-scalar-1",VERSION,METHOD,FACES,MODEL_SPEC:VF.MODEL_SPEC,configs,options,geometryKey,validateScene,tolerance,evaluateGeometry,buildGeometry,mirrorGeometry,mrt,wholeMRT,packGeometry,unpackGeometry,packedResult,coalesceMappedGrid};
});
