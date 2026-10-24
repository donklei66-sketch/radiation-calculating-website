(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./vf-rebuild-core.js'):root.VFRebuild,typeof module==='object'&&module.exports?require('./vf-head-wall-pilot.js'):root.VFHeadWallPilot);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VFSurfaceDensity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(VF,Pilot){
  'use strict';
  const VERSION='physical-density-0.3.0',NUMERICAL_REVISION='stable-axial-1',FACES=['ceiling','floor','west','east','south','north'],PI=Math.PI;
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
  const quadrature=new Map();function gauss(n){if(!quadrature.has(n))quadrature.set(n,Pilot.gauss(n));return quadrature.get(n);}
  // Body-local density is independent of room labels and thermal inputs.
  // Keep exact floating-point coordinate keys: this cache adds no interpolation.
  const densityCaches=new Map();let densityEntries=0,cacheHits=0,cacheMisses=0;
  function memo(channel,point,calculate,disabled){if(disabled)return calculate();let values=densityCaches.get(channel);if(!values){values=new Map();densityCaches.set(channel,values);}const key=point.join(',');if(values.has(key)){cacheHits++;return values.get(key);}cacheMisses++;const value=calculate();values.set(key,value);densityEntries++;if(values.size>240000){densityEntries-=values.size;values.clear();}while(densityEntries>1200000&&densityCaches.size>1){const first=densityCaches.keys().next().value;if(first===channel){const current=densityCaches.get(first);densityCaches.delete(first);densityCaches.set(first,current);continue;}densityEntries-=densityCaches.get(first).size;densityCaches.delete(first);}return value;}
  const densityCacheStats=()=>({entries:densityEntries,channels:densityCaches.size,hits:cacheHits,misses:cacheMisses});
  function validateScene(input){
    if(!input||!input.room||!input.human)throw new Error('缺少房间或人体数据');
    for(const r of input.regions||[]){if((r.kind||'panel')==='panel'&&!['ceiling','floor'].includes(r.face))throw new Error('局部辐射面仅支持顶棚和地板，请调整侧墙板面');if(r.kind==='window'&&['ceiling','floor'].includes(r.face))throw new Error('本版窗体仅支持侧墙');}
    const scene=VF.validateScene({...input,segments:VF.createPaperDimensionAuthorLayout()});
    for(const r of scene.compiled.regions)if(r.temperature<=-273.15)throw new Error('区域温度必须高于绝对零度');
    return scene;
  }
  function geometryKey(s){return JSON.stringify({engine:VERSION,geometry:VF.MODEL_SPEC.definitionHash,room:[s.room.width,s.room.depth,s.room.height],human:[s.human.x,s.human.z,s.human.facing,s.human.yawDegrees??null]});}
  function receiver(scene,face){
    const basis=VF.humanBasis(scene.human),local=p=>{const d=[p[0]-scene.human.x,p[1],p[2]-scene.human.z];return [dot(d,basis.forward),d[1],dot(d,basis.left)];};
    const world=(u,v)=>face==='west'?[0,v,u]:face==='east'?[scene.room.width,v,u]:face==='south'?[u,v,0]:face==='north'?[u,v,scene.room.depth]:face==='floor'?[u,0,v]:[u,scene.room.height,v];
    const n=face==='west'?[1,0,0]:face==='east'?[-1,0,0]:face==='south'?[0,0,1]:face==='north'?[0,0,-1]:face==='floor'?[0,1,0]:[0,-1,0];
    const normal=[dot(n,basis.forward),n[1],dot(n,basis.left)],origin=local(world(0,0)),pu=local(world(1,0)),pv=local(world(0,1)),uAxis=pu.map((x,i)=>x-origin[i]),vAxis=pv.map((x,i)=>x-origin[i]);
    const [width,height]=VF.faceDimensions(scene.room,face),anchorU=face==='west'||face==='east'?scene.human.z:scene.human.x,anchorV=face==='ceiling'||face==='floor'?scene.human.z:VF.MODEL_SPEC.referenceHeight;
    return {face,width,height,normal,origin,uAxis,vAxis,anchorU,anchorV,point:(u,v)=>origin.map((x,i)=>x+u*uAxis[i]+v*vAxis[i]),world};
  }
  function packSolid(s){const axis=s.axis==='x'?0:s.axis==='y'?1:2,extent=[0,1,2].map(k=>s.shape==='sphere'||k!==axis?s.radius:s.length/2);return {name:s.name,shape:s.shape,axis,a:axis===0?1:0,b:axis===2?1:2,c:s.center,r:s.radius,r2:s.radius*s.radius,h:(s.length||0)/2,min:s.center.map((x,k)=>x-extent[k]),max:s.center.map((x,k)=>x+extent[k])};}
  // Segment parameter t is dimensionless in [0,1]. No unit-direction arrays
  // or room intersections are needed for visibility between two known points.
  function lineBlocked(p,d,solid){return lineBlockedRelative([p[0]-solid.c[0],p[1]-solid.c[1],p[2]-solid.c[2]],d,solid);}
  function lineBlockedRelative(rel,d,solid){
    const x=rel[0],y=rel[1],z=rel[2];
    if(solid.shape==='sphere'){
      const A=dot(d,d),B=x*d[0]+y*d[1]+z*d[2],C=x*x+y*y+z*z-solid.r2,disc=B*B-A*C;if(disc<0)return false;
      const t=(-B-Math.sqrt(disc))/A;return t>1e-10&&t<1-1e-10;
    }
    const a=solid.a,b=solid.b,k=solid.axis,A=d[a]*d[a]+d[b]*d[b],B=rel[a]*d[a]+rel[b]*d[b],C=rel[a]*rel[a]+rel[b]*rel[b]-solid.r2;
    if(A>1e-24){const disc=B*B-A*C;if(disc>=0){const r=Math.sqrt(disc),t=(-B-r)/A,t2=(-B+r)/A;if(t>1e-10&&t<1-1e-10&&Math.abs(rel[k]+t*d[k])<=solid.h+1e-10)return true;if(t2>1e-10&&t2<1-1e-10&&Math.abs(rel[k]+t2*d[k])<=solid.h+1e-10)return true;}}
    if(Math.abs(d[k])>1e-24)for(const sign of [-1,1]){const t=(sign*solid.h-rel[k])/d[k];if(t>1e-10&&t<1-1e-10&&(rel[a]+t*d[a])**2+(rel[b]+t*d[b])**2<=solid.r2+1e-12)return true;}
    return false;
  }
  function exposedIntervals(source,phi,solids){
    const k=source.axis==='x'?0:source.axis==='y'?1:2,a=k===0?1:0,b=k===2?1:2,p=source.center.slice();p[a]+=source.radius*Math.cos(phi);p[b]+=source.radius*Math.sin(phi);
    const covered=[];const own=source.solidId||source.name,lo=source.center[k]-source.length/2,hi=source.center[k]+source.length/2;
    for(const s of solids){if(s.name===own)continue;let low,high;
      if(s.shape==='sphere'){const other=[0,1,2].filter(x=>x!==k),r2=s.radius**2-other.reduce((v,x)=>v+(p[x]-s.center[x])**2,0);if(r2<=0)continue;const r=Math.sqrt(r2);low=s.center[k]-r;high=s.center[k]+r;}
      else{const j=s.axis==='x'?0:s.axis==='y'?1:2;if(j===k){if((p[a]-s.center[a])**2+(p[b]-s.center[b])**2>=s.radius**2)continue;low=s.center[k]-s.length/2;high=s.center[k]+s.length/2;}
        else{if(Math.abs(p[j]-s.center[j])>=s.length/2)continue;const other=3-k-j,r2=s.radius**2-(p[other]-s.center[other])**2;if(r2<=0)continue;const r=Math.sqrt(r2);low=s.center[k]-r;high=s.center[k]+r;}}
      low=Math.max(lo,low);high=Math.min(hi,high);if(high>low)covered.push([low,high]);
    }
    covered.sort((a,b)=>a[0]-b[0]);let start=lo;const exposed=[];for(const [l,h] of covered){if(l>start)exposed.push([start,l]);start=Math.max(start,h);}if(start<hi)exposed.push([start,hi]);return {point:p,k,a,b,intervals:exposed};
  }
  function makeSource(scene,index,options={}){
    const source=scene.segments[index],blockers=scene.solids.filter(s=>s.name!==(source.solidId||source.name)),packed=blockers.map(packSolid),bounds=packSolid(source),exposureBlockers=blockers.filter(s=>{const b=packSolid(s);return [0,1,2].every(k=>b.max[k]>bounds.min[k]+1e-12&&b.min[k]<bounds.max[k]-1e-12);});
    if(source.shape==='sphere')return {source,area:source.geometricArea,areaRefinement:0,blockers,packed};
    const panels=options.panels||16,order=options.azimuthOrder||2,axial=options.axial||8,g=gauss(order),ax=gauss(axial),start=source.emitter?.phiStart||0,sweep=source.emitter?.phiSweep||2*PI,nodes=[];let area=0;
    for(let j=0;j<panels;j++)for(let t=0;t<order;t++){
      const phi=start+sweep*(j+g.nodes[t])/panels,wPhi=sweep*g.weights[t]/panels,ex=exposedIntervals(source,phi,scene.solids),normal=[0,0,0];normal[ex.a]=Math.cos(phi);normal[ex.b]=Math.sin(phi);
      for(const [lo,hi] of ex.intervals){area+=wPhi*(hi-lo)*source.radius;for(let k=0;k<axial;k++){
        const p=ex.point.slice();p[ex.k]=lo+(hi-lo)*ax.nodes[k];const weight=wPhi*(hi-lo)*source.radius*ax.weights[k];
        // Exact support-function culling: a body solid entirely behind the
        // emitting tangent plane cannot block an outward diffuse direction.
        const candidates=packed.filter(s=>{const separation=s.c.map((x,i)=>x-p[i]),support=s.shape==='sphere'?s.r:Math.abs(normal[s.axis])*s.h+s.r*Math.sqrt(Math.max(0,1-normal[s.axis]**2));return dot(normal,separation)+support>1e-10;});
        nodes.push({p,n:normal,w:weight,candidates});
      }}
    }
    // Area is a property of the exposed emitter, not of the receiver grid.
    // Resolve intersection endpoints independently of the angular density rule.
    const lengthAt=phi=>exposedIntervals(source,phi,exposureBlockers).intervals.reduce((n,[lo,hi])=>n+hi-lo,0)*source.radius;
    const rule=(lo,hi,n)=>{const q=gauss(n);let sum=0;for(let j=0;j<n;j++)sum+=q.weights[j]*lengthAt(lo+(hi-lo)*q.nodes[j]);return sum*(hi-lo);};
    let areaError=0;
    const integrate=(lo,hi,budget,depth)=>{const coarse=rule(lo,hi,4),fine=rule(lo,hi,8),error=Math.abs(fine-coarse);if(error<=budget||depth>=20){areaError+=error;return fine;}const mid=(lo+hi)/2;return integrate(lo,mid,budget/2,depth+1)+integrate(mid,hi,budget/2,depth+1);};
    area=exposureBlockers.length?Array.from({length:16},(_,j)=>integrate(start+sweep*j/16,start+sweep*(j+1)/16,1e-11/16,0)).reduce((a,b)=>a+b,0):source.radius*source.length*sweep;
    if(!(area>0))throw new Error('节段无外露发射面积：'+source.name);
    return {source,area,areaError,nodes,blockers,packed,bounds,exposureBlockers,panels,order,axial};
  }
  function quadraticRoots(a,b,c,roots){
    const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),1e-30);
    if(Math.abs(a)<1e-14*scale){if(Math.abs(b)>1e-14*scale)roots.push(-c/b);return;}
    const disc=b*b-4*a*c;if(disc<0)return;const r=Math.sqrt(disc),q=-.5*(b+(b>=0?r:-r));
    if(q===0)roots.push(-b/(2*a));else{roots.push(q/a);roots.push(c/q);}
  }
  // Boundaries of a convex blocker's shadow on one cylinder generator.
  // Side tangent cones and both circular cap rims are quadratic in the
  // generator coordinate. Between consecutive roots visibility is constant.
  function shadowRoots(q,d0,k,s,roots){return shadowRootsRelative(q.map((x,i)=>x-s.c[i]),d0,k,s,roots);}
  function shadowRootsRelative(rel,d0,k,s,roots){
    if(s.shape==='sphere'){
      const B=dot(rel,d0),C=dot(rel,rel)-s.r2;quadraticRoots(rel[k]**2-C,2*B*rel[k],B*B-dot(d0,d0)*C,roots);return;
    }
    const a=s.a,b=s.b,j=s.axis,ea=a===k?1:0,eb=b===k?1:0,ej=j===k?1:0,A0=d0[a]**2+d0[b]**2,A1=2*(d0[a]*ea+d0[b]*eb),A2=ea+eb,B0=rel[a]*d0[a]+rel[b]*d0[b],B1=rel[a]*ea+rel[b]*eb,C=rel[a]**2+rel[b]**2-s.r2;
    quadraticRoots(B1*B1-A2*C,2*B0*B1-A1*C,B0*B0-A0*C,roots);
    if(ej)roots.push(-d0[j]);
    for(const sign of [-1,1]){const delta=sign*s.h-rel[j],ca=rel[a]*d0[j]+delta*d0[a],cb=rel[b]*d0[j]+delta*d0[b],la=rel[a]*ej+delta*ea,lb=rel[b]*ej+delta*eb;
      quadraticRoots(la*la+lb*lb-s.r2*ej,2*(ca*la+cb*lb-s.r2*d0[j]*ej),ca*ca+cb*cb-s.r2*d0[j]**2,roots);
    }
  }
  // Tangent-cone and cap-rim intersections for a general linear direction
  // d(t)=d0+t*e. Used to integrate head visibility exactly in the radial angle.
  function directionShadowRoots(q,d0,e,s,roots){
    const rel=q.map((x,i)=>x-s.c[i]);if(s.shape==='sphere'){const C=dot(rel,rel)-s.r2,B0=dot(rel,d0),B1=dot(rel,e);quadraticRoots(B1*B1-C*dot(e,e),2*(B0*B1-C*dot(d0,e)),B0*B0-C*dot(d0,d0),roots);return;}
    const a=s.a,b=s.b,j=s.axis,A0=d0[a]**2+d0[b]**2,A1=2*(d0[a]*e[a]+d0[b]*e[b]),A2=e[a]**2+e[b]**2,B0=rel[a]*d0[a]+rel[b]*d0[b],B1=rel[a]*e[a]+rel[b]*e[b],C=rel[a]**2+rel[b]**2-s.r2;
    quadraticRoots(B1*B1-A2*C,2*B0*B1-A1*C,B0*B0-A0*C,roots);if(Math.abs(e[j])>1e-15)roots.push(-d0[j]/e[j]);
    for(const sign of [-1,1]){const delta=sign*s.h-rel[j],ca=rel[a]*d0[j]+delta*d0[a],cb=rel[b]*d0[j]+delta*d0[b],la=rel[a]*e[j]+delta*e[a],lb=rel[b]*e[j]+delta*e[b];quadraticRoots(la*la+lb*lb-s.r2*e[j]**2,2*(ca*la+cb*lb-s.r2*d0[j]*e[j]),ca*ca+cb*cb-s.r2*d0[j]**2,roots);}
  }
  function sphereDensity(q,recv,src,options){
    const s=src.source,dc=s.center.map((x,k)=>x-q[k]),R=Math.hypot(...dc),w=dc.map(x=>x/R),e1=unit(cross(w,Math.abs(w[1])<.9?[0,1,0]:[1,0,0])),e2=cross(w,e1),C=R*R-s.radius*s.radius,T=s.radius/Math.sqrt(C),N0=dot(recv.normal,w),candidates=src.packed.filter(b=>{const d=b.c.map((x,k)=>x-q[k]),along=dot(d,w),radius=b.shape==='sphere'?b.r:Math.hypot(b.r,b.h),perp=Math.sqrt(Math.max(0,dot(d,d)-along*along));return along+radius>0&&perp<=radius+Math.max(0,along+radius)*T;});
    if(!candidates.length)return dot(recv.normal,dc)/(4*PI*R**3);
    // An inscribed sphere is contained in each capped cylinder. If its
    // angular cone covers the entire head cone and lies in front, visibility
    // is exactly zero; no sampled clipping or factor normalization is used.
    if(!options.disableFullConeCulling&&entireSourceBlocked(q,s,candidates))return 0;
    const panels=Math.max(4,(options.angular||32)/4),g=gauss(4);let total=0;
    for(let i=0;i<panels;i++)for(let z=0;z<4;z++){const phi=2*PI*(i+g.nodes[z])/panels,e=e1.map((x,k)=>x*Math.cos(phi)+e2[k]*Math.sin(phi)),N1=dot(recv.normal,e),roots=[0,T];for(const b of candidates)directionShadowRoots(q,w,e,b,roots);const cuts=roots.filter(t=>Number.isFinite(t)&&t>=0&&t<=T).sort((a,b)=>a-b);let visible=0;
      for(let j=0;j<cuts.length-1;j++){const a=cuts[j],b=cuts[j+1];if(b-a<1e-14)continue;const t=(a+b)/2,A=1+t*t,lambda=C/(R+Math.sqrt(Math.max(0,R*R-A*C))),direction=w.map((x,k)=>(x+t*e[k])*lambda);if(candidates.some(s=>lineBlocked(q,direction,s)))continue;
        const denominator=(1+a*a)*(1+b*b),angle=Math.atan2(b-a,1+a*b),rational=(b-a)*(1-a*b)/denominator,value=.5*N0*(b*b-a*a)/denominator+.5*N1*(angle-rational);if(value<-1e-12)throw new Error('Negative exact radial head integral');visible+=value;
      }total+=visible*2*PI*g.weights[z]/panels;
    }return total/(PI*src.area);
  }
  function entireSourceBlocked(q,source,blockers){
  const radius=source.shape==='sphere'?source.radius:Math.hypot(source.radius,source.length/2),dx=source.center[0]-q[0],dy=source.center[1]-q[1],dz=source.center[2]-q[2],distance=Math.hypot(dx,dy,dz);if(distance<=radius)return false;
  const w0=dx/distance,w1=dy/distance,w2=dz/distance,alpha=Math.asin(radius/distance);
  for(const body of blockers){
    const r=body.shape==='sphere'?body.r:Math.min(body.r,body.h);let c0=body.c[0],c1=body.c[1],c2=body.c[2];
    if(body.shape!=='sphere'){const k=body.axis,value=Math.max(body.c[k]-body.h+r,Math.min(body.c[k]+body.h-r,q[k]));if(k===0)c0=value;else if(k===1)c1=value;else c2=value;}
    const v0=c0-q[0],v1=c1-q[1],v2=c2-q[2],R=Math.hypot(v0,v1,v2);if(R<=r)return true;if(R+r>=distance-radius)continue;
    const angle=Math.acos(Math.min(1,Math.max(-1,(v0*w0+v1*w1+v2*w2)/R)));if(angle+alpha<Math.asin(r/R)-1e-12)return true;
  }return false;
}

  function axialIntegral(t0,t1,d,B,N){
    const dt=t1-t0,d2=d*d,delta=Math.atan2(d*dt,d2+t0*t1),sine=Math.sin(delta),x=delta*delta;
    const remainder=delta<.02?delta*x*(1/6-x*(1/120-x*(1/5040-x/362880))):delta-sine;
    const cosine=t0*t1>=0?Math.sin((Math.atan2(d,Math.abs(t0))+Math.atan2(d,Math.abs(t1)))/2):Math.cos((Math.atan2(t0,d)+Math.atan2(t1,d))/2);
    return .5*B*(remainder+2*cosine*cosine*sine)+.5*N*d2*dt*(t1+t0)/((d2+t0*t0)*(d2+t1*t1));
  }
  function cylinderDensity(p,recv,src,scene,options){
  const s=src.source,k=s.axis==='x'?0:s.axis==='y'?1:2,a=k===0?1:0,b=k===2?1:2,qa=p[a]-s.center[a],qb=p[b]-s.center[b],R=Math.hypot(qa,qb),r=s.radius;
  if(R<=r)return 0;
  if(!options.disableFullConeCulling&&entireSourceBlocked(p,s,src.packed))return 0;
  const center=Math.atan2(qb,qa),half=Math.acos(r/R),emin=s.emitter?.phiStart||0,emax=emin+(s.emitter?.phiSweep||2*PI),ranges=[];
  for(let wrap=-2;wrap<=2;wrap++){const lo=Math.max(center-half,emin+wrap*2*PI),hi=Math.min(center+half,emax+wrap*2*PI);if(hi>lo)ranges.push([lo,hi]);}
  const beta=phi=>Math.atan2(r*Math.sin(phi-center),R-r*Math.cos(phi-center)),g=gauss(options.betaOrder||4),panels=options.betaPanels||Math.max(4,(options.panels||16)/2),possible=[],lo=p.map((x,i)=>Math.min(x,src.bounds.min[i])-1e-12),hi=p.map((x,i)=>Math.max(x,src.bounds.max[i])+1e-12);
  for(const block of src.packed)if(block.max[0]>=lo[0]&&block.min[0]<=hi[0]&&block.max[1]>=lo[1]&&block.min[1]<=hi[1]&&block.max[2]>=lo[2]&&block.min[2]<=hi[2])possible.push({block,rel:[p[0]-block.c[0],p[1]-block.c[1],p[2]-block.c[2]]});
  const ca=qa/R,cb=qb/R;let sum=0;
  for(const [plo,phi] of ranges){const blo=beta(plo),bhi=beta(phi),ratio=r/R,psiOf=x=>Math.asin(Math.min(1,Math.max(-1,Math.sin(x)/ratio))),llo=options.psiQuadrature?psiOf(blo):blo,lhi=options.psiQuadrature?psiOf(bhi):bhi;
    for(let panel=0;panel<panels;panel++)for(let j=0;j<g.nodes.length;j++){
      const xi=llo+(lhi-llo)*(panel+g.nodes[j])/panels,angle=options.psiQuadrature?Math.asin(ratio*Math.sin(xi)):xi,cs=Math.cos(angle),sn=Math.sin(angle),disc=Math.max(0,r*r-R*R*sn*sn),distance=(R-r)*(R+r)/(R*cs+Math.sqrt(disc)),weight=(lhi-llo)*g.weights[j]/panels*(options.psiQuadrature?ratio*Math.cos(xi)/cs:1);
      const da=-cs*ca-sn*cb,db=-cs*cb+sn*ca,pa=p[a]+distance*da,pb=p[b]+distance*db,na=(pa-s.center[a])/r,nb=(pb-s.center[b])/r,candidates=[];
      for(const item of possible){const block=item.block,n=block.axis===a?na:block.axis===b?nb:0,support=block.shape==='sphere'?block.r:Math.abs(n)*block.h+block.r*Math.sqrt(Math.max(0,1-n*n));if(na*(block.c[a]-pa)+nb*(block.c[b]-pb)+support>1e-10)candidates.push(item);}
      const B=recv.normal[a]*da+recv.normal[b]*db,N=recv.normal[k];
      if(!candidates.length&&!src.exposureBlockers.length){sum+=axialIntegral(s.center[k]-s.length/2-p[k],s.center[k]+s.length/2-p[k],distance,B,N)*weight;continue;}
      const d0=[0,0,0];d0[a]=distance*da;d0[b]=distance*db;const ex=src.exposureBlockers.length?exposedIntervals(s,Math.atan2(pb-s.center[b],pa-s.center[a]),src.exposureBlockers):{intervals:[[s.center[k]-s.length/2,s.center[k]+s.length/2]]};
      const allRoots=[];for(const item of candidates)shadowRootsRelative(item.rel,d0,k,item.block,allRoots);let visible=0;const direction=d0.slice();
      for(const [low,high] of ex.intervals){const t0=low-p[k],t1=high-p[k],cuts=[t0,t1,...allRoots.filter(x=>Number.isFinite(x)&&x>t0&&x<t1)].sort((a,b)=>a-b);
        for(let z=0;z<cuts.length-1;z++){if(cuts[z+1]-cuts[z]<1e-13)continue;direction[k]=(cuts[z]+cuts[z+1])/2;let blocked=false;for(const item of candidates)if(lineBlockedRelative(item.rel,direction,item.block)){blocked=true;break;}if(blocked)continue;
          const value=axialIntegral(cuts[z],cuts[z+1],distance,B,N);if(value<-1e-12)throw new Error('Negative axial physical integral');visible+=value;
        }
      }sum+=visible*weight;
    }
  }return sum/(PI*src.area);
}

  function makeDensity(scene,index,face,options={},preparedSource){
    const recv=receiver(scene,face),src=preparedSource||makeSource(scene,index,options),source=src.source,angular=options.angular||32,radial=options.radial||8,g=gauss(radial),disk=[];
    for(let k=0;k<radial;k++)for(let j=0;j<angular;j++){const a=2*PI*(j+.5)/angular;disk.push({s:g.nodes[k],c:Math.cos(a),sine:Math.sin(a),w:g.weights[k]/angular});}
    const maxHeight=Math.max(...src.blockers.map(s=>s.center[1]+(s.shape==='sphere'||s.axis!=='y'?s.radius:s.length/2)));
    function reverseDensity(p,fullHemisphere){
      const dc=source.center.map((x,i)=>x-p[i]),R=Math.hypot(...dc),w=fullHemisphere?recv.normal:dc.map(x=>x/R),e1=unit(cross(w,Math.abs(w[1])<.9?[0,1,0]:[1,0,0])),e2=cross(w,e1),alpha2=fullHemisphere?1:(source.radius/R)**2;let sum=0;
      for(const sample of disk){const sine=Math.sqrt(alpha2*sample.s),cosine=Math.sqrt(1-alpha2*sample.s),d=w.map((x,i)=>x*cosine+sine*(sample.c*e1[i]+sample.sine*e2[i]));let distance;
        if(source.shape==='sphere')distance=R*cosine-source.radius*Math.sqrt(1-sample.s);else distance=VF.cylinderHit(p,d,source,1e-10);
        if(!Number.isFinite(distance)||distance<=0)continue;
        if(source.shape!=='sphere'){
          const q=p.map((x,i)=>x+distance*d[i]),k=source.axis==='x'?0:source.axis==='y'?1:2;if(Math.abs(q[k]-source.center[k])>=source.length/2-1e-9)continue;
          if(source.emitter){const a=k===0?1:0,b=k===2?1:2,phi=Math.atan2(q[b]-source.center[b],q[a]-source.center[a]),offset=((phi-source.emitter.phiStart)%(2*PI)+2*PI)%(2*PI);if(offset>source.emitter.phiSweep)continue;}
        }
        const vector=d.map(x=>x*distance);if(src.packed.some(s=>lineBlocked(p,vector,s)))continue;
        sum+=sample.w*(fullHemisphere?1:dot(recv.normal,d)/cosine);
      }
      return fullHemisphere?sum/src.area:source.radius**2/(R*R*src.area)*sum;
    }
    function valueAt(p){
      if(source.shape==='sphere'){
        const d=source.center.map((x,i)=>x-p[i]),R2=dot(d,d);if(p[1]>=source.center[1]-source.radius&&maxHeight<source.center[1]-source.radius)return dot(recv.normal,d)/(4*PI*R2*Math.sqrt(R2));
        return options.sphereRadialExact===false?reverseDensity(p,false):sphereDensity(p,recv,src,options);
      }
      if(options.pointQuadrature!==true)return cylinderDensity(p,recv,src,scene,options);
      if(Math.hypot(...p.map((x,i)=>x-source.center[i]))<1.5*Math.hypot(source.radius,source.length/2))return reverseDensity(p,true);
      let sum=0;
      for(const node of src.nodes){const d=p.map((x,i)=>x-node.p[i]),c1=dot(node.n,d);if(c1<=0)continue;const c2=-dot(recv.normal,d);if(c2<=0)continue;
        if(node.candidates.some(s=>lineBlocked(node.p,d,s)))continue;const r2=dot(d,d);sum+=node.w*c1*c2/(r2*r2);
      }
      return sum/(PI*src.area);
    }
    const channel=JSON.stringify([VF.MODEL_SPEC.definitionHash,index,recv.normal,dot(recv.normal,recv.origin),options.betaOrder||4,options.betaPanels||Math.max(4,(options.panels||16)/2),!!options.psiQuadrature,!!options.pointQuadrature,options.sphereRadialExact!==false,angular,radial,src.area]);
    function density(u,v){const p=recv.point(u,v);return memo(channel,p,()=>valueAt(p),options.disablePointCache);}
    return {...recv,scene,source,sourceArea:src.area,density,preparedSource:src};
  }
  function sphereRectangle(context,r){
    const s=context.source,c=VF.localPointToWorld(s.center,context.scene.human),uv=VF.faceUV(context.face,c),point=context.world(0,0),n=context.face==='floor'?[0,1,0]:context.face==='ceiling'?[0,-1,0]:context.face==='west'?[1,0,0]:context.face==='east'?[-1,0,0]:context.face==='south'?[0,0,1]:[0,0,-1],distance=Math.abs(dot(c.map((x,i)=>x-point[i]),n));
    const f=(u,v)=>{const x=u-uv[0],y=v-uv[1];return Math.atan2(x*y,distance*Math.hypot(distance,x,y));};return (f(r.u1,r.v1)-f(r.u0,r.v1)-f(r.u1,r.v0)+f(r.u0,r.v0))/(4*PI);
  }
  function receiverEdges(context,scene,options){
    const n=options.grid||32,edges=[context.width,context.height].map((extent)=>Array.from({length:n+1},(_,i)=>extent*(i/n)));
    edges[0].push(context.anchorU);edges[1].push(context.anchorV);
    const center=VF.localPointToWorld(context.source.center,scene.human),uv=VF.faceUV(context.face,center),distance=Math.abs(dot(context.source.center.map((x,i)=>x-context.origin[i]),context.normal));
    if(distance<.1||options.gradeSource&&distance<1.5){
      const bounds=VF.segmentWorldBounds(context.source,scene.human),worldAxes=context.face==='west'||context.face==='east'?[2,1]:context.face==='south'||context.face==='north'?[0,1]:[0,2],sub=options.nearSubdivisions||12;
      for(let axis=0;axis<2;axis++){
        const k=worldAxes[axis],half=(bounds.max[k]-bounds.min[k])/2,c=uv[axis],padding=Math.max(distance,context.source.radius),lo=c-half,hi=c+half;
        for(let j=0;j<=sub;j++)edges[axis].push(lo+(hi-lo)*j/sub);
        if(options.gradeSource)for(let j=0;j<=4*sub;j++)edges[axis].push(c-2*padding+j*padding/sub);
        for(const a of [-2,-1,-.5,-.25,-.125,.125,.25,.5,1,2])edges[axis].push(lo+a*padding,hi+a*padding);
      }
    }
    if(options.regionEdges)for(const r of scene.compiled.byFace[context.face]){edges[0].push(r.u0,r.u1);edges[1].push(r.v0,r.v1);}
    if(options.gradeBlockers){
      const axes=context.face==='west'||context.face==='east'?[2,1]:context.face==='south'||context.face==='north'?[0,1]:[0,2],sub=options.nearSubdivisions||12;
      for(const solid of scene.solids){const k={x:0,y:1,z:2}[solid.axis],n=context.normal,support=solid.shape==='sphere'?solid.radius:Math.abs(n[k])*solid.length/2+solid.radius*Math.sqrt(Math.max(0,1-n[k]*n[k])),d=dot(solid.center.map((x,i)=>x-context.origin[i]),n)-support;if(d>.12)continue;
        const bounds=VF.segmentWorldBounds(solid,scene.human),center=VF.faceUV(context.face,VF.localPointToWorld(solid.center,scene.human)),padding=Math.max(solid.radius,d,.005);
        for(let a=0;a<2;a++){const lo=bounds.min[axes[a]],hi=bounds.max[axes[a]];for(let j=0;j<=sub;j++)edges[a].push(lo+(hi-lo)*j/sub);for(const f of [-2,-1,-.5,-.25,-.125,.125,.25,.5,1,2])edges[a].push(lo+f*padding,hi+f*padding);edges[a].push(center[a]);}
      }
    }
    // Generate and retain exact room endpoints explicitly. extent*i/n can
    // round one ULP above extent (e.g. 3.2*24/24), dropping an entire last row.
    return edges.map((values,axis)=>{const extent=[context.width,context.height][axis],interior=values.filter(x=>Number.isFinite(x)&&x>0&&x<extent).map(x=>Number(x.toPrecision(14))).filter(x=>x>0&&x<extent);return [0,...new Set(interior),extent].sort((a,b)=>a-b);});
  }
  function* buildGenerator(scene,index,face,options={},preparedSource){
    const context=makeDensity(scene,index,face,options,preparedSource),[u,v]=receiverEdges(context,scene,options),nx=u.length-1,ny=v.length-1,mass=new Float64Array(nx*ny),prefix=new Float64Array((nx+1)*(ny+1)),started=Date.now(),distance=Math.abs(dot(context.source.center.map((x,i)=>x-context.origin[i]),context.normal)),cellOrder=options.cellOrder||(distance<.1?2:1),cell=gauss(cellOrder);
    const q2=gauss(2),q4=gauss(4);let chunkStart=Date.now(),quadratureError=0,maxDepth=0,work=0;
    const rule=(a,b,c,d,q)=>{let sum=0;for(let i=0;i<q.nodes.length;i++)for(let j=0;j<q.nodes.length;j++)sum+=q.weights[i]*q.weights[j]*context.density(a+(b-a)*q.nodes[i],c+(d-c)*q.nodes[j]);return sum*(b-a)*(d-c);};
    function* adaptive(a,b,c,d,budget,depth){const low=rule(a,b,c,d,q2),high=rule(a,b,c,d,q4),error=Math.abs(high-low);maxDepth=Math.max(maxDepth,depth);work+=20;if(Date.now()-chunkStart>=8){chunkStart=Date.now();yield {face,row:0,rows:ny,quadratureWork:work};}if(error<=budget+(options.relativeQuadTolerance||2e-5)*high||depth>=(options.quadMaxDepth||4)){quadratureError+=error;return high;}const x=(a+b)/2,y=(c+d)/2;let value=0;for(const box of [[a,x,c,y],[x,b,c,y],[a,x,y,d],[x,b,y,d]])value+=yield* adaptive(...box,budget/4,depth+1);return value;}
    for(let j=0;j<ny;j++){
      for(let i=0;i<nx;i++){let value;if(options.adaptiveCells){value=yield* adaptive(u[i],u[i+1],v[j],v[j+1],(options.quadTolerance||1e-5)/(nx*ny),0);}else{let rho=0;for(let a=0;a<cellOrder;a++)for(let b=0;b<cellOrder;b++)rho+=cell.weights[a]*cell.weights[b]*context.density(u[i]+(u[i+1]-u[i])*cell.nodes[a],v[j]+(v[j+1]-v[j])*cell.nodes[b]);value=rho*(u[i+1]-u[i])*(v[j+1]-v[j]);}if(!Number.isFinite(value)||value<0)throw new Error('非有限或负的物理密度：'+context.source.name+' '+face);mass[j*nx+i]=value;if(Date.now()-chunkStart>=8){chunkStart=Date.now();yield {face,row:j+1,rows:ny};}}
    }
    const stride=nx+1;for(let j=0;j<ny;j++){let row=0;for(let i=0;i<nx;i++){row+=mass[j*nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
    return {version:VERSION,key:geometryKey(scene),segment:context.source.name,face,width:context.width,height:context.height,anchorU:context.anchorU,anchorV:context.anchorV,nx,ny,u,v,mass,prefix,total:prefix[ny*stride+nx],sourceArea:context.sourceArea,quadratureError,maxDepth,quadratureWork:work,integration:options.adaptiveCells?'positive adaptive Gauss cells':'positive fixed quadrature cells',buildMs:Date.now()-started};
  }
  function build(scene,index,face,options={},source){const g=buildGenerator(scene,index,face,options,source);let r;do{r=g.next();}while(!r.done);return r.value;}
  function locate(edges,x){let lo=0,hi=edges.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(x>=edges[m])lo=m;else hi=m-1;}return lo;}
  function cumulative(m,u,v){
    const i=locate(m.u,u),j=locate(m.v,v),a=(u-m.u[i])/(m.u[i+1]-m.u[i]),b=(v-m.v[j])/(m.v[j+1]-m.v[j]),s=m.nx+1,p=m.prefix;
    return p[j*s+i]+a*(p[j*s+i+1]-p[j*s+i])+b*(p[(j+1)*s+i]-p[j*s+i])+a*b*m.mass[j*m.nx+i];
  }
  function measure(m,r){
    for(const k of ['u0','u1','v0','v1'])if(!Number.isFinite(r[k]))throw new Error('区域坐标非有限');
    if(r.u0<0||r.v0<0||r.u1>m.width+1e-12||r.v1>m.height+1e-12||r.u1<r.u0||r.v1<r.v0)throw new Error('区域越界或边界反向');
    if(r.u0===r.u1||r.v0===r.v1)return 0;
    const a=cumulative(m,r.u1,r.v1),b=cumulative(m,r.u0,r.v1),c=cumulative(m,r.u1,r.v0),d=cumulative(m,r.u0,r.v0),value=a-b-c+d;
    if(value>128*Number.EPSILON*(a+b+c+d))return value;
    let sum=0;for(let j=locate(m.v,r.v0);j<=locate(m.v,r.v1);j++)for(let i=locate(m.u,r.u0);i<=locate(m.u,r.u1);i++){
      const du=Math.min(r.u1,m.u[i+1])-Math.max(r.u0,m.u[i]),dv=Math.min(r.v1,m.v[j+1])-Math.max(r.v0,m.v[j]);if(du>0&&dv>0)sum+=m.mass[j*m.nx+i]*(du/(m.u[i+1]-m.u[i]))*(dv/(m.v[j+1]-m.v[j]));
    }return sum;
  }
  function partition(model,scene){
    const list=scene.compiled.byFace[model.face],us=[...new Set([0,model.width,model.anchorU,...list.flatMap(r=>[r.u0,r.u1])].filter(x=>x>=0&&x<=model.width))].sort((a,b)=>a-b),vs=[...new Set([0,model.height,model.anchorV,...list.flatMap(r=>[r.v0,r.v1])].filter(x=>x>=0&&x<=model.height))].sort((a,b)=>a-b),values=Object.fromEntries(['base:'+model.face,...list.map(x=>x.id)].map(id=>[id,0])),zones={};
    const rec=receiver(scene,model.face);
    for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){const r={u0:us[i],u1:us[i+1],v0:vs[j],v1:vs[j+1]},p=rec.world((r.u0+r.u1)/2,(r.v0+r.v1)/2),id=scene.compiled.classify(model.face,p),zone=VF.paperZoneOfHit(model.face,p,scene.human,VF.MODEL_SPEC.referenceHeight).id,v=measure(model,r);values[id]+=v;zones[zone]=(zones[zone]||0)+v;}
    return {values,zones,sum:Object.values(values).reduce((a,b)=>a+b,0)};
  }
  return {IMPLEMENTATION_VERSION:"101902-scalar-1",VERSION,NUMERICAL_REVISION,FACES,MODEL_SPEC:VF.MODEL_SPEC,validateScene,geometryKey,receiver,exposedIntervals,makeSource,cylinderDensity,axialIntegral,shadowRoots,directionShadowRoots,sphereDensity,entireSourceBlocked,makeDensity,sphereRectangle,buildGenerator,build,measure,cumulative,partition,densityCacheStats};
});
