(function(root,factory){
  const vf=typeof module==='object'&&module.exports?require('./vf-rebuild-core.js'):root.VFRebuild;
  const api=factory(vf);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VFHeadWallPilot=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(VF){
  'use strict';
  // Experimental, head-to-one-wall only. No production calculator imports this file.
  const VERSION='head-wall-pilot-1.0',WALLS=['north','south','west','east'];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>{const r=Math.hypot(...a);return a.map(v=>v/r);};
  const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
  function gauss(n){
    const nodes=[],weights=[];
    for(let i=0;i<n;i++){
      let z=Math.cos(Math.PI*(i+.75)/(n+.5)),derivative=0;
      for(let k=0;k<30;k++){
        let p0=1,p1=z;for(let j=2;j<=n;j++){const p=((2*j-1)*z*p1-(j-1)*p0)/j;p0=p1;p1=p;}
        derivative=n*(z*p1-p0)/(z*z-1);const d=p1/derivative;z-=d;if(Math.abs(d)<1e-15)break;
      }
      // Gauss-Legendre, transformed from [-1,1] to [0,1].
      nodes.push((z+1)/2);weights.push(1/((1-z*z)*derivative*derivative));
    }
    return {nodes,weights};
  }
  function geometryKey(scene,face){
    return JSON.stringify({version:VERSION,hash:VF.MODEL_SPEC.definitionHash,room:[scene.room.width,scene.room.depth,scene.room.height],human:[scene.human.x,scene.human.z,scene.human.facing,scene.human.yawDegrees??null],face});
  }
  function validateOverlayScope(overlays){
    for(const r of overlays)if((r.kind||'panel')==='panel'&&WALLS.includes(r.face))throw new Error('局部辐射面仅支持顶棚和地板，侧墙不支持');
  }
  function makeContext(input,face,options={}){
    validateOverlayScope(input.regions||[]);
    if(!WALLS.includes(face))throw new Error('The pilot supports one vertical wall only');
    if(input.segments)throw new Error('The pilot only supports the frozen VF16-S2.0 geometry');
    const scene=VF.validateScene({...input,regions:[]}),head=scene.segments.find(s=>s.name==='head');
    const basis=VF.humanBasis(scene.human),toLocalPoint=p=>{const d=[p[0]-scene.human.x,p[1],p[2]-scene.human.z];return [dot(d,basis.forward),d[1],dot(d,basis.left)];};
    const toLocalDirection=p=>[dot(p,basis.forward),p[1],dot(p,basis.left)];
    const [width,height]=VF.faceDimensions(scene.room,face);
    const normal=face==='north'?[0,0,-1]:face==='south'?[0,0,1]:face==='west'?[1,0,0]:[-1,0,0];
    function wallPoint(u,v){return toLocalPoint(face==='north'?[u,v,scene.room.depth]:face==='south'?[u,v,0]:face==='west'?[0,v,u]:[scene.room.width,v,u]);}
    const normalLocal=toLocalDirection(normal),blockers=scene.solids.filter(s=>s.name!=='head');
    const maxBlockerHeight=Math.max(...blockers.map(s=>s.center[1]+(s.axis==='y'?s.length/2:s.radius)));
    const headBottom=head.center[1]-head.radius;
    if(maxBlockerHeight>=headBottom)throw new Error('Head exposure assumption invalid: a blocker reaches the head surface');
    const angular=Math.floor(options.angular||32),radial=Math.floor(options.radial||8);
    if(angular<8||angular%2||radial<2)throw new Error('Angular count must be even and >=8; radial count >=2');
    const g=gauss(radial),disk=[];
    for(let k=0;k<radial;k++)for(let i=0;i<angular;i++){
      const a=2*Math.PI*(i+.5)/angular;disk.push({s:g.nodes[k],cos:Math.cos(a),sin:Math.sin(a),weight:g.weights[k]/angular});
    }
    const epsilon=1e-9;
    function density(u,v,occlusion=true){
      const p=wallPoint(u,v),d=head.center.map((x,i)=>x-p[i]),R=Math.hypot(...d),w=d.map(x=>x/R),cos0=dot(normalLocal,w),rho0=cos0/(4*Math.PI*R*R);
      // The whole head is above every other body solid. This shortcut is exact,
      // since a segment joining two points above all blockers cannot hit them.
      if(!occlusion||v>=headBottom)return rho0;
      const e1=unit(cross(w,Math.abs(w[1])<.9?[0,1,0]:[1,0,0])),e2=cross(w,e1),alpha2=(head.radius/R)**2;
      let visible=0;
      for(const sample of disk){
        const sine=Math.sqrt(alpha2*sample.s),cosine=Math.sqrt(1-alpha2*sample.s);
        const dir=w.map((a,i)=>cosine*a+sine*(sample.cos*e1[i]+sample.sin*e2[i]));
        const tHead=R*cosine-head.radius*Math.sqrt(1-sample.s);
        let blocked=false;
        for(const solid of blockers){
          const hit=solid.shape==='sphere'?VF.sphereHit(p,dir,solid,epsilon):VF.cylinderHit(p,dir,solid,epsilon);
          if(hit<tHead-epsilon){blocked=true;break;}
        }
        // Sampling s=sin(theta)^2/sin(alpha)^2 gives dOmega=(pi*r^2/R^2)
        // ds*dphi/(2*pi*cos(theta)). All summands are nonnegative.
        if(!blocked)visible+=sample.weight*dot(normalLocal,dir)/cosine;
      }
      return visible/(4*Math.PI*R*R);
    }
    const centerWorld=VF.localPointToWorld(head.center,scene.human),uProjection=face==='north'||face==='south'?centerWorld[0]:centerWorld[2];
    return {scene,face,head,width,height,uProjection,referenceHeight:VF.MODEL_SPEC.referenceHeight,centerWorld,headBottom,maxBlockerHeight,normal,wallPoint,density,angular,radial,key:geometryKey(scene,face)};
  }
  // An unobstructed uniformly diffuse sphere and an external plane rectangle:
  // F=Omega(center,rectangle)/(4*pi). The sphere must lie wholly in front of the
  // plane. This is a benchmark, NOT the occluded full-body production model.
  function sphereRectangle(context,r){
    const p=context.wallPoint(0,0),center=context.head.center;
    const distance=Math.abs(dot(center.map((v,i)=>v-p[i]),unit(cross(context.wallPoint(1,0).map((v,i)=>v-p[i]),context.wallPoint(0,1).map((v,i)=>v-p[i])))));
    function primitive(u,v){const x=u-context.uProjection,y=v-center[1];return Math.atan2(x*y,distance*Math.hypot(distance,x,y));}
    return (primitive(r.u1,r.v1)-primitive(r.u0,r.v1)-primitive(r.u1,r.v0)+primitive(r.u0,r.v0))/(4*Math.PI);
  }
  function validRect(model,r){
    for(const k of ['u0','u1','v0','v1'])if(!Number.isFinite(r[k]))throw new Error('Non-finite rectangle');
    if(r.u0<0||r.v0<0||r.u1>model.width||r.v1>model.height||r.u1<r.u0||r.v1<r.v0)throw new Error('Rectangle outside the wall or reversed');
  }
  function build(input,face,options={}){
    const started=now(),context=makeContext(input,face,options),nx=Math.floor(options.nx||96),ny=Math.floor(options.ny||96);
    if(nx<8||ny<8)throw new Error('Grid must be >=8 by 8');
    const du=context.width/nx,dv=context.height/ny,mass=new Float64Array(nx*ny),prefix=new Float64Array((nx+1)*(ny+1));
    let minimumDensity=Infinity,maximumDensity=0;
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const rho=context.density((i+.5)*du,(j+.5)*dv,options.occlusion!==false);
      if(!Number.isFinite(rho)||rho<0)throw new Error('Invalid physical density; no clipping is applied');
      minimumDensity=Math.min(minimumDensity,rho);maximumDensity=Math.max(maximumDensity,rho);mass[j*nx+i]=rho*du*dv;
    }
    const stride=nx+1;for(let j=0;j<ny;j++){let row=0;for(let i=0;i<nx;i++){row+=mass[j*nx+i];prefix[(j+1)*stride+i+1]=prefix[j*stride+i+1]+row;}}
    const model={version:VERSION,geometryId:VF.MODEL_SPEC.geometryId,geometryHash:VF.MODEL_SPEC.definitionHash,key:context.key,face,room:input.room,human:input.human,width:context.width,height:context.height,uProjection:context.uProjection,referenceHeight:context.referenceHeight,headCenter:context.centerWorld,headRadius:context.head.radius,nx,ny,du,dv,mass,prefix,minimumDensity,maximumDensity,occlusion:options.occlusion!==false,angular:context.angular,radial:context.radial,buildMs:now()-started};
    model.total=prefix[ny*stride+nx];return model;
  }
  function cumulative(m,u,v){
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>m.width||v>m.height)throw new Error('Cumulative bounds outside wall');
    const x=u/m.du,y=v/m.dv,i=Math.min(m.nx,Math.floor(x)),j=Math.min(m.ny,Math.floor(y)),a=x-i,b=y-j,s=m.nx+1,p=m.prefix;
    let sum=p[j*s+i];
    if(i<m.nx)sum+=a*(p[j*s+i+1]-p[j*s+i]);
    if(j<m.ny)sum+=b*(p[(j+1)*s+i]-p[j*s+i]);
    if(i<m.nx&&j<m.ny)sum+=a*b*m.mass[j*m.nx+i];return sum;
  }
  function directMeasure(m,r){
    let sum=0;const i0=Math.floor(r.u0/m.du),i1=Math.min(m.nx-1,Math.ceil(r.u1/m.du)-1),j0=Math.floor(r.v0/m.dv),j1=Math.min(m.ny-1,Math.ceil(r.v1/m.dv)-1);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const dx=Math.min(r.u1,(i+1)*m.du)-Math.max(r.u0,i*m.du),dy=Math.min(r.v1,(j+1)*m.dv)-Math.max(r.v0,j*m.dv);
      if(dx>0&&dy>0)sum+=m.mass[j*m.nx+i]*(dx/m.du)*(dy/m.dv);
    }
    return sum;
  }
  function measure(m,r){
    validRect(m,r);if(r.u0===r.u1||r.v0===r.v1)return 0;
    const a=cumulative(m,r.u1,r.v1),b=cumulative(m,r.u0,r.v1),c=cumulative(m,r.u1,r.v0),d=cumulative(m,r.u0,r.v0),value=a-b-c+d;
    // For a very thin region, use the SAME positive cell integrals directly.
    // This avoids cancellation of nearly equal prefix sums; it is not a clamp.
    return value<=128*Number.EPSILON*(a+b+c+d)?directMeasure(m,r):value;
  }
  function fourParts(m,r){
    validRect(m,r);const cuts=(lo,hi,anchor)=>anchor>lo&&anchor<hi?[lo,anchor,hi]:[lo,hi],us=cuts(r.u0,r.u1,m.uProjection),vs=cuts(r.v0,r.v1,m.referenceHeight),parts=[];
    for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){
      const bounds={u0:us[i],u1:us[i+1],v0:vs[j],v1:vs[j+1]};parts.push({bounds,value:measure(m,bounds),horizontal:(us[i]+us[i+1])/2<m.uProjection?'left':'right',vertical:(vs[j]+vs[j+1])/2<m.referenceHeight?'lower':'upper'});
    }
    return parts;
  }
  function anchoredCumulative(m,horizontalSign,verticalSign,a,b){
    if(![-1,1].includes(horizontalSign)||![-1,1].includes(verticalSign)||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)throw new Error('Invalid anchored-quadrant coordinates');
    const u=m.uProjection+horizontalSign*a,v=m.referenceHeight+verticalSign*b;
    return measure(m,{u0:Math.min(u,m.uProjection),u1:Math.max(u,m.uProjection),v0:Math.min(v,m.referenceHeight),v1:Math.max(v,m.referenceHeight)});
  }
  function overlayFactors(m,overlays){
    validateOverlayScope(overlays);
    const compiled=VF.compileRegions(m.room,overlays),list=compiled.overlays.filter(r=>r.face===m.face),windows=list.filter(r=>r.kind==='window'),cells=[];
    const us=[...new Set([0,m.width,...list.flatMap(r=>[r.u0,r.u1])])].sort((a,b)=>a-b),vs=[...new Set([0,m.height,...list.flatMap(r=>[r.v0,r.v1])])].sort((a,b)=>a-b);
    const factors={['base:'+m.face]:0};for(const r of list)factors[r.id]=0;
    for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){
      const bounds={u0:us[i],u1:us[i+1],v0:vs[j],v1:vs[j+1]},u=(us[i]+us[i+1])/2,v=(vs[j]+vs[j+1])/2,inside=r=>u>=r.u0&&u<=r.u1&&v>=r.v0&&v<=r.v1;
      const selected=windows.find(inside)||list.find(r=>r.kind==='panel'&&inside(r)),id=selected?selected.id:'base:'+m.face,value=measure(m,bounds);factors[id]+=value;cells.push({id,bounds,value});
    }
    return {factors,cells,whole:m.total,sum:Object.values(factors).reduce((a,b)=>a+b,0),compiled};
  }
  function serialize(m){const {prefix,mass,...metadata}=m;return {...metadata,mass:Array.from(mass),prefix:Array.from(prefix)};}
  return {VERSION,WALLS,gauss,geometryKey,makeContext,sphereRectangle,build,cumulative,measure,directMeasure,fourParts,anchoredCumulative,overlayFactors,serialize};
});
