(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./vf-rebuild-core.js'):root.VFRebuild);if(typeof module==='object'&&module.exports)module.exports=api;else root.VF1020DirectSolar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(VF){
  'use strict';
  const VERSION='1020-direct-1',TAU=2*Math.PI;
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const shift=(p,d,t)=>p.map((x,i)=>x+d[i]*t);
  const hit=(p,d,s,e)=>s.shape==='sphere'?VF.sphereHit(p,d,s,e):VF.cylinderHit(p,d,s,e);
  function sunDirection(solar){
    const alt=Number(solar.alt),az=Number(solar.az);if(!Number.isFinite(alt)||!Number.isFinite(az)||alt<0||alt>90)throw new Error('太阳高度角须为 0–90°，方位角须为有限数值');
    const b=alt*Math.PI/180,g=((az%360)+360)%360*Math.PI/180;
    return [Math.cos(b)*Math.sin(g),Math.sin(b),Math.cos(b)*Math.cos(g)].map(x=>Math.abs(x)<1e-14?0:x);
  }
  function corners(b){const out=[];for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]])out.push([x,y,z]);return out;}
  function bounds(points){return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};}
  function overlaps(a,b){return a.min.every((v,i)=>v<=b.max[i]+1e-12&&a.max[i]>=b.min[i]-1e-12);}
  function localVector(world,human){const basis=VF.humanBasis(human);return [dot(world,basis.forward),world[1],dot(world,basis.left)];}
  function prepare(input,solar){
    const scene=input.compiled?input:VF.validateScene(input),s=sunDirection(solar),localSun=localVector(s,scene.human),epsilon=Math.max(scene.room.width,scene.room.depth,scene.room.height)*1e-9;
    const windows=scene.compiled.overlays.filter(r=>r.kind==='window');
    const ref=Math.abs(localSun[1])<.9?[0,1,0]:[1,0,0],c=[localSun[1]*ref[2]-localSun[2]*ref[1],localSun[2]*ref[0]-localSun[0]*ref[2],localSun[0]*ref[1]-localSun[1]*ref[0]],len=Math.hypot(...c),e1=c.map(x=>x/len),e2=[localSun[1]*e1[2]-localSun[2]*e1[1],localSun[2]*e1[0]-localSun[0]*e1[2],localSun[0]*e1[1]-localSun[1]*e1[0]];
    const projectBox=b=>bounds(corners(b).map(p=>[dot(p,e1),dot(p,e2),dot(p,localSun)]));
    const solids=scene.solids.map(solid=>{const a=solid.axis==='x'?0:solid.axis==='y'?1:2,extent=[0,1,2].map(i=>solid.shape==='sphere'||i!==a?solid.radius:solid.length/2),box={min:solid.center.map((v,i)=>v-extent[i]),max:solid.center.map((v,i)=>v+extent[i])};return {solid,box,projection:projectBox(box)};});
    return {scene,solar,s,localSun,epsilon,windows,solids,projectBox};
  }
  function classify(ctx,index,u,v){
    const source=ctx.scene.segments[index],sample=VF.sampleSurface(source,[u,v]),sourceId=source.solidId||source.name;
    const point=VF.localPointToWorld(sample.point,ctx.scene.human),normal=VF.localDirectionToWorld(sample.normal,ctx.scene.human),cosine=dot(sample.normal,ctx.localSun);
    const base={point,normal,localPoint:sample.point,cosine:Math.max(0,cosine),windowId:null,entry:null,blocker:null,exposed:true};
    for(const b of ctx.solids)if(b.solid.name!==sourceId&&VF.pointInside(b.solid,sample.point,ctx.epsilon*.1))return {...base,exposed:false,blocker:b.solid.name};
    if(cosine<=0||ctx.solar.alt<=0)return base;
    const boundary=VF.roomBoundaryHit(point,ctx.s,ctx.scene.room,ctx.epsilon);if(!boundary)return base;
    const regionId=ctx.scene.compiled.classify(boundary.face,boundary.point),win=ctx.scene.compiled.byId.get(regionId);
    if(win?.kind!=='window')return base;
    const origin=shift(sample.point,ctx.localSun,ctx.epsilon*2);let nearest=boundary.t,blocker=null;
    for(const b of ctx.solids){if(b.solid.name===sourceId)continue;const t=hit(origin,ctx.localSun,b.solid,ctx.epsilon);if(t<nearest-ctx.epsilon*4){nearest=t;blocker=b.solid.name;}}
    if(blocker)return {...base,blocker};
    return {...base,windowId:win.id,entry:boundary.point};
  }
  function trigRange(a,b,sine){let lo=Math.min(sine?Math.sin(a):Math.cos(a),sine?Math.sin(b):Math.cos(b)),hi=Math.max(sine?Math.sin(a):Math.cos(a),sine?Math.sin(b):Math.cos(b));const off=sine?Math.PI/2:0;for(let k=Math.ceil((a-off)/Math.PI);off+k*Math.PI<=b+1e-14;k++){const v=k%2===0?1:-1;lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];}
  const product=(a,b)=>{const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return [Math.min(...q),Math.max(...q)];};
  function cellBounds(source,c){
    const start=source.emitter?.phiStart||0,sweep=source.emitter?.phiSweep||TAU,a=start+sweep*c.v0,b=start+sweep*c.v1,cr=trigRange(a,b,false),sr=trigRange(a,b,true);let ns,ps;
    if(source.shape==='sphere'){
      const yr=[1-2*c.u1,1-2*c.u0],r0=Math.sqrt(Math.max(0,1-yr[0]**2)),r1=Math.sqrt(Math.max(0,1-yr[1]**2)),rr=[Math.min(r0,r1),yr[0]<=0&&yr[1]>=0?1:Math.max(r0,r1)];ns=[product(rr,cr),yr,product(rr,sr)];ps=ns.map((r,i)=>r.map(v=>source.center[i]+source.radius*v));
    }else{const axis=source.axis==='x'?0:source.axis==='y'?1:2,radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];ns=[[0,0],[0,0],[0,0]];ns[radial[0]]=cr;ns[radial[1]]=sr;ps=ns.map((r,i)=>r.map(v=>source.center[i]+source.radius*v));ps[axis]=[source.center[axis]+(c.u0-.5)*source.length,source.center[axis]+(c.u1-.5)*source.length];}
    return {box:{min:ps.map(x=>x[0]),max:ps.map(x=>x[1])},normal:{min:ns.map(x=>x[0]),max:ns.map(x=>x[1])},phi0:a,phi1:b};
  }
  function intervalDot(box,d){let lo=0,hi=0;for(let i=0;i<3;i++){lo+=d[i]*(d[i]>=0?box.min[i]:box.max[i]);hi+=d[i]*(d[i]>=0?box.max[i]:box.min[i]);}return [lo,hi];}
  function candidateWindows(ctx,localBox){
    if(ctx.solar.alt<=0)return [];
    const world=corners(localBox).map(p=>VF.localPointToWorld(p,ctx.scene.human)),out=[],R=ctx.scene.room;
    for(const w of ctx.windows){const axis=w.face==='west'||w.face==='east'?0:w.face==='south'||w.face==='north'?2:1,plane=w.face==='east'?R.width:w.face==='north'?R.depth:w.face==='ceiling'?R.height:0,sign=w.face==='west'||w.face==='south'||w.face==='floor'?-1:1;
      if(ctx.s[axis]*sign<=1e-14)continue;
      const uv=world.map(p=>VF.faceUV(w.face,shift(p,ctx.s,(plane-p[axis])/ctx.s[axis]))),u0=Math.min(...uv.map(p=>p[0])),u1=Math.max(...uv.map(p=>p[0])),v0=Math.min(...uv.map(p=>p[1])),v1=Math.max(...uv.map(p=>p[1]));
      if(u1<w.u0-1e-12||u0>w.u1+1e-12||v1<w.v0-1e-12||v0>w.v1+1e-12)continue;
      out.push({id:w.id,full:u0>=w.u0+1e-12&&u1<=w.u1-1e-12&&v0>=w.v0+1e-12&&v1<=w.v1-1e-12});
    }return out;
  }
  function exactCosineIntegral(source,c,cb,s){
    const a=cb.phi0,b=cb.phi1,du=c.u1-c.u0;
    if(source.shape!=='sphere'){const axis=source.axis==='x'?0:source.axis==='y'?1:2,r=axis===0?[1,2]:axis===1?[0,2]:[0,1];return source.radius*source.length*du*(s[r[0]]*(Math.sin(b)-Math.sin(a))+s[r[1]]*(Math.cos(a)-Math.cos(b)));}
    const F=y=>.5*(y*Math.sqrt(Math.max(0,1-y*y))+Math.asin(Math.max(-1,Math.min(1,y)))),ru=(F(1-2*c.u0)-F(1-2*c.u1))/2,yu=(c.u1-c.u1*c.u1)-(c.u0-c.u0*c.u0);
    return 2*source.radius**2*(ru*(s[0]*(Math.sin(b)-Math.sin(a))+s[2]*(Math.cos(a)-Math.cos(b)))+s[1]*yu*(b-a));
  }
  class Heap{
    constructor(){this.a=[];}
    push(x){let i=this.a.length;this.a.push(x);while(i){const p=(i-1)>>1;if(this.a[p].priority>=x.priority)break;this.a[i]=this.a[p];i=p;}this.a[i]=x;}
    pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].priority>this.a[j].priority)j++;if(this.a[j].priority<=last.priority)break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return top;}
  }
  function geometryKey(input,solar,options={}){const scene=input.compiled?input:VF.validateScene(input);return JSON.stringify([VERSION,VF.MODEL_SPEC.definitionHash,scene.room.width,scene.room.depth,scene.room.height,scene.human,scene.segments,scene.compiled.overlays.filter(r=>r.kind==='window').map(w=>[w.id,w.face,w.u0,w.u1,w.v0,w.v1]),sunDirection(solar),options.projectedTolerance??null,options.areaTolerance??null,options.maxCells??null,options.maxDepth??null]);}
  async function integrateSegment(ctx,index,options,hooks){
    const source=ctx.scene.segments[index],area=source.geometricArea,sourceId=source.solidId||source.name,others=ctx.solids.filter(x=>x.solid.name!==sourceId),heap=new Heap(),tols={projected:options.projectedTolerance??area*.0002,area:options.areaTolerance??area*.001,lit:area*.0035};
    const totals={projected:0,exposed:0,lit:0,ep:0,ea:0,el:0,ub:0,ab:0,lb:0},windows=Object.fromEntries(ctx.windows.map(w=>[w.id,{projectedArea:0,sunlitArea:0}]));let evaluated=0,leaves=0,refinements=0,lastYield=Date.now();
    function evaluate(c){
      evaluated++;const cb=cellBounds(source,c),A=area*(c.u1-c.u0)*(c.v1-c.v0),nr=intervalDot(cb.normal,ctx.localSun),cs=corners(cb.box),mid=cb.box.min.map((v,i)=>(v+cb.box.max[i])/2),radius=Math.hypot(...cb.box.max.map((v,i)=>(v-cb.box.min[i])/2));
      // The inflated primitive contains its Minkowski sum with the cell's
      // circumscribed ball. A miss therefore certifies every point in the cell.
      const expanded=b=>({...b.solid,radius:b.solid.radius+radius,length:b.solid.length+2*radius});
      const burial=others.filter(b=>overlaps(cb.box,b.box)&&VF.pointInside(expanded(b),mid,0));
      const r={...c,A,projected:0,exposed:A,lit:0,ep:0,ea:0,el:0,byWindow:{}};
      if(burial.some(b=>cs.every(p=>VF.pointInside(b.solid,p,0)))){r.exposed=0;return r;}
      const exposedCertain=burial.length===0,pw=nr[1]>0?candidateWindows(ctx,cb.box):[];
      if(exposedCertain&&!pw.length)return r;
      const projection=ctx.projectBox(cb.box),shade=others.filter(b=>{if(!(projection.max[0]>=b.projection.min[0]&&projection.min[0]<=b.projection.max[0]&&projection.max[1]>=b.projection.min[1]&&projection.min[1]<=b.projection.max[1]&&projection.min[2]<=b.projection.max[2]+ctx.epsilon))return false;const e=expanded(b);return VF.pointInside(e,mid,0)||Number.isFinite(hit(mid,ctx.localSun,e,ctx.epsilon));});
      if(exposedCertain&&nr[0]>0&&pw.length===1&&pw[0].full&&!shade.length){const K=Math.max(0,exactCosineIntegral(source,c,cb,ctx.localSun));r.projected=K;r.lit=A;r.byWindow[pw[0].id]={projectedArea:K,sunlitArea:A};return r;}
      if(exposedCertain&&pw.length&&shade.length){
        const center=VF.sampleSurface(source,[(c.u0+c.u1)/2,(c.v0+c.v1)/2]).point;
        for(const b of shade){const near=hit(center,ctx.localSun,b.solid,ctx.epsilon);if(!Number.isFinite(near))continue;const after=shift(center,ctx.localSun,near+ctx.epsilon*8),far=hit(after,ctx.localSun,b.solid,ctx.epsilon);if(!Number.isFinite(far))continue;const t=near+ctx.epsilon*8+far/2;if(cs.every(p=>VF.pointInside(b.solid,shift(p,ctx.localSun,t),0)))return r;}
      }
      const samples=[];r.exposed=0;for(const du of [.25,.75])for(const dv of [.25,.75]){const q=classify(ctx,index,c.u0+(c.u1-c.u0)*du,c.v0+(c.v1-c.v0)*dv);samples.push(q);if(q.exposed)r.exposed+=A/4;if(q.windowId){r.projected+=A/4*q.cosine;r.lit+=A/4;const w=r.byWindow[q.windowId]||(r.byWindow[q.windowId]={projectedArea:0,sunlitArea:0});w.projectedArea+=A/4*q.cosine;w.sunlitArea+=A/4;}}
      const coarse=classify(ctx,index,(c.u0+c.u1)/2,(c.v0+c.v1)/2);samples.push(coarse);
      r.ab=exposedCertain?0:A;r.ub=pw.length?A*Math.min(1,Math.max(0,nr[1])):0;r.lb=pw.length?A:0;
      const mixedLight=samples.some(q=>q.windowId!==samples[0].windowId),mixedArea=samples.some(q=>q.exposed!==samples[0].exposed);
      // Resolved mixed boundaries use successive local quadrature changes.
      // Uniform samples without a certificate retain the full alias bound:
      // a missed narrow beam or shadow can never pass solely on two zeros.
      r.ea=exposedCertain?0:mixedArea?Math.max(Math.abs(r.exposed-(coarse.exposed?A:0)),A*.015):A;
      r.ep=mixedLight?Math.max(Math.abs(r.projected-(coarse.windowId?A*coarse.cosine:0)),r.ub*.015):r.ub;
      r.el=mixedLight?Math.max(Math.abs(r.lit-(coarse.windowId?A:0)),A*.015):r.lb;
      r.priority=Math.max(r.ep/tols.projected,r.ea/tols.area,r.el/tols.lit);return r;
    }
    function add(r,sign){for(const key of Object.keys(totals))totals[key]+=sign*(r[key]||0);for(const [id,w] of Object.entries(r.byWindow)){windows[id].projectedArea+=sign*w.projectedArea;windows[id].sunlitArea+=sign*w.sunlitArea;}}
    for(let u=0;u<8;u++)for(let v=0;v<32;v++){const r=evaluate({u0:u/8,u1:(u+1)/8,v0:v/32,v1:(v+1)/32,depth:0});add(r,1);leaves++;if(r.priority>0)heap.push(r);}
    const maxCells=options.maxCells??120000,maxDepth=options.maxDepth??17;
    while((totals.ep>tols.projected||totals.ea>tols.area||totals.el>tols.lit)&&heap.a.length&&leaves+3<=maxCells){
      if(hooks.cancelled?.())throw new Error('直射计算已取消');const c=heap.pop();if(c.depth>=maxDepth)continue;add(c,-1);const um=(c.u0+c.u1)/2,vm=(c.v0+c.v1)/2;
      for(const [u0,u1] of [[c.u0,um],[um,c.u1]])for(const [v0,v1] of [[c.v0,vm],[vm,c.v1]]){const r=evaluate({u0,u1,v0,v1,depth:c.depth+1});add(r,1);if(r.priority>0)heap.push(r);}leaves+=3;refinements++;
      if(Date.now()-lastYield>24){hooks.progress?.({index,segment:source.name,phase:'解析透窗直射',cells:leaves,unresolvedProjectedArea:Math.max(0,totals.ep)});await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();}
    }
    const passed=totals.ep<=tols.projected*1.00001&&totals.ea<=tols.area*1.00001&&totals.el<=tols.lit*1.00001;
    for(const w of Object.values(windows)){if(Math.abs(w.projectedArea)<1e-14)w.projectedArea=0;if(Math.abs(w.sunlitArea)<1e-14)w.sunlitArea=0;}
    return {segment:source.name,segmentIndex:index,nominalArea:area,exposedArea:totals.exposed,windows,error:{projectedAreaBound:Math.max(0,totals.ub),exposedAreaBound:Math.max(0,totals.ab),sunlitAreaBound:Math.max(0,totals.lb),projectedAreaChange:Math.max(0,totals.ep),exposedAreaChange:Math.max(0,totals.ea),sunlitAreaChange:Math.max(0,totals.el),interpretation:'successive local quadrature changes; uniform uncertified cells retain full alias bounds; residual upper bounds reported separately; not total model error'},quality:{passed,targets:tols},stats:{evaluated,leaves,refinements}};
  }
  function integrationSettings(options={}){return {method:'certified analytic surface cells with deterministic 2x2 local quadrature and adaptive subdivision',initialGrid:[8,32],maxCellsPerSegment:options.maxCells??120000,maxDepth:options.maxDepth??17,projectedAreaTolerance:options.projectedTolerance??{relativeToNominalArea:.0002},exposedAreaTolerance:options.areaTolerance??{relativeToNominalArea:.001},sunlitAreaTolerance:{relativeToNominalArea:.0035},unresolvedAliasPolicy:'uniform uncertified samples retain complete cell contribution upper bound',applied:true};}
  async function buildResponse(input,solar,options={},hooks={}){
    const started=Date.now(),ctx=prepare(input,solar),segments=[];
    for(let i=0;i<ctx.scene.segments.length;i++){if(hooks.cancelled?.())throw new Error('直射计算已取消');const r=await integrateSegment(ctx,i,options,hooks);segments.push(r);hooks.segment?.(r);await new Promise(resolve=>setTimeout(resolve,0));}
    return {version:VERSION,geometryHash:VF.MODEL_SPEC.definitionHash,key:geometryKey(ctx.scene,solar,options),direction:ctx.s,integration:integrationSettings(options),segments,quality:{passed:segments.every(x=>x.quality.passed)},stats:{elapsedMs:Date.now()-started,cells:segments.reduce((a,r)=>a+r.stats.leaves,0)}};
  }
  return {VERSION,MODEL_HASH:VF.MODEL_SPEC.definitionHash,sunDirection,prepare,classify,geometryKey,buildResponse,cellBounds,integrationSettings};
});
