(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./101902-surface-density'):root.VFSurfaceDensity,typeof module==='object'&&module.exports?require('./101902-integral-core'):root.VF10701Integral);if(typeof module==='object'&&module.exports)module.exports=api;else root.VF10701FloorResponse=api;})(typeof globalThis!=='undefined'?globalThis:this,function(D,C){
 'use strict';
 const VERSION='floor-response-1.1.0',SCENE={room:{width:8,depth:8,height:3},human:{x:4,z:4,facing:'north'},regions:[]},dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
 const coalesceMappedGrid=C.coalesceMappedGrid;
 // The body and q lie in a convex room, so their joining segment stays in it.
 // For fixed body geometry and the y=0 plane, the diffuse density at body-local
 // q is independent of room boundary labels, dimensions and thermal regions.
 // This is a restriction of the SAME physical field, not a fit across rooms.
 function project(record,input,index){
  const scene=input.compiled?input:C.validateScene(input);if(record.geometryHash!==C.MODEL_SPEC.definitionHash||record.densityVersion!==D.VERSION||record.index!==index)return null;
  const from=D.receiver(C.validateScene(SCENE),'floor'),to=D.receiver(scene,'floor'),relative=to.origin.map((x,k)=>x-from.origin[k]),offset=[dot(relative,from.uAxis),dot(relative,from.vAxis)],rawA=[[dot(to.uAxis,from.uAxis),dot(to.vAxis,from.uAxis)],[dot(to.uAxis,from.vAxis),dot(to.vAxis,from.vAxis)]],A=rawA.map(row=>row.map(x=>Math.round(x)));
  if(A.some((row,i)=>row.filter(x=>Math.abs(x)===1).length!==1||row.some((x,j)=>Math.abs(rawA[i][j]-x)>1e-10)))return null;
  const ranges=[0,1].map(sa=>{const ta=A[sa][0]!==0?0:1,end=offset[sa]+A[sa][ta]*(ta===0?to.width:to.height);return [Math.min(offset[sa],end),Math.max(offset[sa],end)];});
  if(ranges.some(([lo,hi])=>lo<0||hi>8))return null;
  function grid(g){const raw=[g.u,g.v],edges=ranges.map(([lo,hi],sa)=>[lo,...raw[sa].filter(x=>x>lo&&x<hi),hi]),intervals=edges.map((list,sa)=>{const out=[];let at=0;for(let j=0;j<list.length-1;j++){const mid=(list[j]+list[j+1])/2;while(at<raw[sa].length-2&&raw[sa][at+1]<=mid)at++;out.push({at,fraction:(list[j+1]-list[j])/(raw[sa][at+1]-raw[sa][at])});}return out;}),axes=[0,1].map(ta=>A[0][ta]!==0?0:1),targetEdges=axes.map((sa,ta)=>{const list=edges[sa].map(x=>(x-offset[sa])/A[sa][ta]);if(A[sa][ta]<0)list.reverse();list[0]=0;list[list.length-1]=ta===0?to.width:to.height;return list;}),nx=targetEdges[0].length-1,ny=targetEdges[1].length-1,mass=new Float64Array(nx*ny);
   const uTarget=A[0][0]!==0?0:1,vTarget=1-uTarget,uSign=A[0][uTarget],vSign=A[1][vTarget],uParts=intervals[0],vParts=intervals[1];
   for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const uIndex=uTarget===0?i:j,vIndex=vTarget===0?i:j,pu=uParts[uSign>0?uIndex:uParts.length-1-uIndex],pv=vParts[vSign>0?vIndex:vParts.length-1-vIndex];mass[j*nx+i]=g.mass[pv.at*g.nx+pu.at]*pu.fraction*pv.fraction;}
   const stride=nx+1,prefix=new Float64Array(stride*(ny+1));for(let j=0;j<ny;j++){let row=0;for(let i=0;i<nx;i++){row+=mass[j*nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
   return coalesceMappedGrid({...g,key:C.geometryKey(scene),sourceGeometryKey:g.key,face:'floor',width:to.width,height:to.height,nx,ny,u:targetEdges[0],v:targetEdges[1],mass,prefix,total:prefix[ny*stride+nx],anchorU:to.anchorU,anchorV:to.anchorV,sourceFieldDomain:'body-local floor -4..4 m in both horizontal axes; positive cell field restricted without renormalization'});
  }
  return {low:grid(record.pair.low),high:grid(record.pair.high),level:record.pair.level,sourceFloorResponse:VERSION};
 }
 function unpack(record){
  function grid(g){if(g.u?.length!==g.nx+1||g.v?.length!==g.ny+1||g.u[0]!==0||g.v[0]!==0||g.u[g.nx]!==g.width||g.v[g.ny]!==g.height||g.u.some((x,i)=>!Number.isFinite(x)||(i&&x<=g.u[i-1]))||g.v.some((x,i)=>!Number.isFinite(x)||(i&&x<=g.v[i-1])))throw new Error('地板响应网格不完整');
   let mass;if(g.massFloat32Base64){const bytes=typeof Buffer!=='undefined'?Uint8Array.from(Buffer.from(g.massFloat32Base64,'base64')):Uint8Array.from(atob(g.massFloat32Base64),c=>c.charCodeAt(0));mass=Float64Array.from(new Float32Array(bytes.buffer));}else mass=g.mass instanceof Float64Array?g.mass:Float64Array.from(g.mass);
   if(mass.length!==g.nx*g.ny||mass.some(x=>!Number.isFinite(x)||x<0))throw new Error('地板响应单元积分无效');
   const stride=g.nx+1,prefix=new Float64Array(stride*(g.ny+1));for(let j=0;j<g.ny;j++){let row=0;for(let i=0;i<g.nx;i++){row+=mass[j*g.nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
   const out={...g,mass,prefix,total:prefix[g.ny*stride+g.nx]};delete out.massFloat32Base64;return out;
  }return {...record,pair:{...record.pair,low:grid(record.pair.low),high:grid(record.pair.high)}};
 }
 function mirror(record,index){const name=C.MODEL_SPEC.segments[index].name;if(!name.startsWith('r_')||record.segment!=='l_'+name.slice(2))throw new Error('Invalid emitter reflection');function grid(g){const mass=new Float64Array(g.mass.length),u=g.u.slice().reverse().map(x=>g.width-x);u[0]=0;u[u.length-1]=g.width;for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++)mass[j*g.nx+i]=g.mass[j*g.nx+g.nx-1-i];const stride=g.nx+1,prefix=new Float64Array(stride*(g.ny+1));for(let j=0;j<g.ny;j++){let row=0;for(let i=0;i<g.nx;i++){row+=mass[j*g.nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}return coalesceMappedGrid({...g,segment:name,u,mass,prefix,total:prefix[g.ny*stride+g.nx]});}return {...record,index,segment:name,pair:{...record.pair,low:grid(record.pair.low),high:grid(record.pair.high)},exactReflectionOf:record.segment};}
 function needsRefinement(pair,scene){const h=D.partition(pair.high,scene),l=D.partition(pair.low,scene),regions=scene.compiled.byFace.floor;return Math.abs(pair.high.total-pair.low.total)>C.tolerance(pair.high.total,'face')/4||regions.length&&Math.abs(h.values['base:floor']-l.values['base:floor'])>C.tolerance(h.values['base:floor'],'region')/4||regions.some(r=>Math.abs(h.values[r.id]-l.values[r.id])>C.tolerance(h.values[r.id],'region')/4);}
 // Refine new physical rectangle/room boundaries using the same density.
 // Existing cells away from those boundaries retain their positive masses.
 // This is additional receiving quadrature, never a factor rescaling.
 async function refineProjectedPair(scene,index,initial,hooks={}){
  if(hooks.cancelled?.())throw new Error('计算已取消');
  let pair=initial;const cuts=[new Set([0,pair.high.width]),new Set([0,pair.high.height])];for(const r of scene.compiled.byFace.floor){cuts[0].add(r.u0);cuts[0].add(r.u1);cuts[1].add(r.v0);cuts[1].add(r.v1);}
  const rule=C.configs[Math.min(pair.level,7)],options={...rule,disablePointCache:true},source=D.makeSource(scene,index,{...options,axial:2}),context=D.makeDensity(scene,index,'floor',options,source),a=Math.sqrt(3/5)/2,nodes=[.5-a,.5,.5+a],weights=[5/18,4/9,5/18];
  for(let round=1;round<=3&&needsRefinement(pair,scene);round++){
   const old=pair.high,extra=cuts.map(s=>Array.from(s));if(round>1)for(let k=0;k<2;k++){const edges=k?old.v:old.u;for(let j=0;j<edges.length-1;j++)if(cuts[k].has(edges[j])||cuts[k].has(edges[j+1]))extra[k].push((edges[j]+edges[j+1])/2);}
   const [u,v]=[old.u,old.v].map((edges,k)=>Array.from(new Set([...edges,...extra[k]])).sort((a,b)=>a-b)),nx=u.length-1,ny=v.length-1,mass=new Float64Array(nx*ny);let jp=0,last=Date.now(),changed=0;
   for(let j=0;j<ny;j++){while(jp<old.ny-1&&old.v[jp+1]<=v[j])jp++;let ip=0;for(let i=0;i<nx;i++){while(ip<old.nx-1&&old.u[ip+1]<=u[i])ip++;let value;
    if(i&&j&&i<nx-1&&j<ny-1&&u[i]===old.u[ip]&&u[i+1]===old.u[ip+1]&&v[j]===old.v[jp]&&v[j+1]===old.v[jp+1])value=old.mass[jp*old.nx+ip];else{let rho=0;for(let a=0;a<3;a++)for(let b=0;b<3;b++)rho+=weights[a]*weights[b]*context.density(u[i]+(u[i+1]-u[i])*nodes[a],v[j]+(v[j+1]-v[j])*nodes[b]);value=rho*(u[i+1]-u[i])*(v[j+1]-v[j]);changed++;}
    if(!Number.isFinite(value)||value<0)throw new Error('地板局部积分单元无效');mass[j*nx+i]=value;
    if(Date.now()-last>=8){if(hooks.cancelled?.())throw new Error('计算已取消');hooks.progress?.({index,segment:scene.segments[index].name,phase:'局部边界精化',face:'floor',level:pair.level,row:j+1,rows:ny});await new Promise(resolve=>setTimeout(resolve,0));last=Date.now();}
   }}
   const stride=nx+1,prefix=new Float64Array(stride*(ny+1));for(let j=0;j<ny;j++){let row=0;for(let i=0;i<nx;i++){row+=mass[j*nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
   const high={...old,u,v,nx,ny,mass,prefix,total:prefix[ny*stride+nx],integration:'positive local Gauss 3 receiving quadrature at new rectangle/room boundaries',localBoundaryRefinement:{round,changed,sourceRule:rule,numericalRevision:D.NUMERICAL_REVISION}};
   pair={...pair,low:old,high,receivingBoundaryRefinements:(pair.receivingBoundaryRefinements||0)+1};
  }if(hooks.cancelled?.())throw new Error('计算已取消');return pair;
 }
 return {VERSION,SCENE,project,unpack,mirror,needsRefinement,refineProjectedPair};
});
