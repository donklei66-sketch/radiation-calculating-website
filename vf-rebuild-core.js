(function(root,factory){
  const modelSpec=typeof module==='object'&&module.exports?require('./vf-model-spec.js'):root.VFModelSpec;
  const api=factory(modelSpec);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VFRebuild=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(MODEL_SPEC){
  'use strict';

  if(!MODEL_SPEC)throw new Error('VF model specification is required');
  const VERSION='0.5.0';
  const SIGMA=5.670374419e-8;
  const FACE_NAMES=['west','east','south','north','floor','ceiling'];
  const TWO_PI=2*Math.PI;
  const UINT_SCALE=4294967296;
  const T95={1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,10:2.228,11:2.201,12:2.179,13:2.160,14:2.145,15:2.131,16:2.120};

  const PAPER_TYPES=MODEL_SPEC.types;
  const AUTHOR_LAYOUT=MODEL_SPEC.segments.map(segment=>[
    segment.name,segment.type,PAPER_TYPES[segment.type].shape,segment.center.slice(),segment.axis
  ]);

  function createPaperDimensionAuthorLayout(){
    return MODEL_SPEC.segments.map(def=>{
      const {name,type,center,axis}=def,shape=PAPER_TYPES[type].shape;
      const p=PAPER_TYPES[type];
      return {...def,name,type,shape,center:center.slice(),axis,radius:p.radius,length:p.length,
        paperArea:p.paperArea,geometricArea:shape==='sphere'?4*Math.PI*p.radius*p.radius:(def.emitter?def.emitter.phiSweep:TWO_PI)*p.radius*p.length,
        dimensionSource:MODEL_SPEC.dimensionSource,layoutSource:MODEL_SPEC.postureSource,geometryId:MODEL_SPEC.geometryId};
    });
  }

  function assertFiniteNumber(value,label){
    if(!Number.isFinite(value))throw new Error(label+' must be finite');
  }
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function norm(v){return Math.hypot(v[0],v[1],v[2]);}
  function unit(v){const n=norm(v);if(!(n>0))throw new Error('zero vector');return [v[0]/n,v[1]/n,v[2]/n];}
  function addScaled(a,b,s){return [a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];}
  function clamp01Open(x){return Math.min(1-Number.EPSILON,Math.max(Number.EPSILON,x));}
  function hash32(x){
    x=(x+0x9e3779b9)>>>0;x^=x>>>16;x=Math.imul(x,0x21f0aaad);x^=x>>>15;
    x=Math.imul(x,0x735a2d97);x^=x>>>15;return x>>>0;
  }

  const SOBOL_PARAMS=[null,{s:0,a:0,m:[]},{s:1,a:0,m:[1]},{s:2,a:1,m:[1,3]},{s:3,a:1,m:[1,3,1]}];
  function makeSobolDirections(dim){
    const dirs=new Uint32Array(32);
    if(dim===1){for(let i=1;i<=32;i++)dirs[i-1]=(2**(32-i))>>>0;return dirs;}
    const {s,a,m}=SOBOL_PARAMS[dim];
    for(let i=1;i<=s;i++)dirs[i-1]=(m[i-1]*2**(32-i))>>>0;
    for(let i=s+1;i<=32;i++){
      let value=(dirs[i-s-1]^(dirs[i-s-1]>>>s))>>>0;
      for(let k=1;k<s;k++)if((a>>>(s-1-k))&1)value=(value^dirs[i-k-1])>>>0;
      dirs[i-1]=value;
    }
    return dirs;
  }
  const SOBOL_DIRS=[null,makeSobolDirections(1),makeSobolDirections(2),makeSobolDirections(3),makeSobolDirections(4)];
  function sobol4(index,seed=0){
    if(!Number.isInteger(index)||index<0)throw new Error('Sobol index must be a non-negative integer');
    const gray=(index^(index>>>1))>>>0,out=[];
    for(let dim=1;dim<=4;dim++){
      let x=hash32((seed+Math.imul(dim,0x85ebca6b))>>>0),g=gray,bit=0;
      while(g&&bit<32){if(g&1)x=(x^SOBOL_DIRS[dim][bit])>>>0;g>>>=1;bit++;}
      out.push(((x>>>0)+.5)/UINT_SCALE);
    }
    return out;
  }

  function sampleSurface(segment,q){
    const [q0,q1]=q;
    if(segment.shape==='sphere'){
      const y=1-2*q0,angle=TWO_PI*q1,r=Math.sqrt(Math.max(0,1-y*y));
      const normal=[r*Math.cos(angle),y,r*Math.sin(angle)];
      return {point:addScaled(segment.center,normal,segment.radius),normal};
    }
    const axis=segment.axis==='x'?0:segment.axis==='y'?1:2;
    const radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];
    const point=segment.center.slice(),normal=[0,0,0],angle=segment.emitter?segment.emitter.phiStart+segment.emitter.phiSweep*q1:TWO_PI*q1;
    const c=Math.cos(angle),s=Math.sin(angle);
    point[axis]+=(q0-.5)*segment.length;
    point[radial[0]]+=segment.radius*c;point[radial[1]]+=segment.radius*s;
    normal[radial[0]]=c;normal[radial[1]]=s;
    return {point,normal};
  }

  function cosineDirection(normal,q2,q3){
    const anchor=Math.abs(normal[1])<.9?[0,1,0]:[1,0,0];
    const u=unit(cross(anchor,normal)),v=cross(normal,u);
    const radius=Math.sqrt(clamp01Open(q2)),angle=TWO_PI*q3;
    const a=radius*Math.cos(angle),b=radius*Math.sin(angle),c=Math.sqrt(Math.max(0,1-radius*radius));
    return [a*u[0]+b*v[0]+c*normal[0],a*u[1]+b*v[1]+c*normal[1],a*u[2]+b*v[2]+c*normal[2]];
  }

  function pointInside(segment,p,tol=0){
    const rel=[p[0]-segment.center[0],p[1]-segment.center[1],p[2]-segment.center[2]];
    if(segment.shape==='sphere')return dot(rel,rel)<(segment.radius-tol)**2;
    const axis=segment.axis==='x'?0:segment.axis==='y'?1:2;
    const radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];
    return Math.abs(rel[axis])<segment.length/2-tol&&rel[radial[0]]**2+rel[radial[1]]**2<(segment.radius-tol)**2;
  }

  function sphereHit(origin,direction,segment,epsilon){
    const rel=[origin[0]-segment.center[0],origin[1]-segment.center[1],origin[2]-segment.center[2]];
    const b=dot(rel,direction),c=dot(rel,rel)-segment.radius**2,disc=b*b-c;
    if(disc<0)return Infinity;
    const root=Math.sqrt(disc),near=-b-root,far=-b+root;
    return near>epsilon?near:far>epsilon?far:Infinity;
  }

  function cylinderHit(origin,direction,segment,epsilon){
    const axis=segment.axis==='x'?0:segment.axis==='y'?1:2;
    const radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];
    const p=[origin[0]-segment.center[0],origin[1]-segment.center[1],origin[2]-segment.center[2]];
    const a=radial[0],b=radial[1],A=direction[a]**2+direction[b]**2;
    const B=p[a]*direction[a]+p[b]*direction[b],C=p[a]**2+p[b]**2-segment.radius**2;
    let nearest=Infinity;
    if(A>1e-18){
      const disc=B*B-A*C;
      if(disc>=0){
        const root=Math.sqrt(disc);
        for(const t of [(-B-root)/A,(-B+root)/A])
          if(t>epsilon&&t<nearest&&Math.abs(p[axis]+t*direction[axis])<=segment.length/2+epsilon)nearest=t;
      }
    }
    if(Math.abs(direction[axis])>1e-18){
      for(const cap of [-segment.length/2,segment.length/2]){
        const t=(cap-p[axis])/direction[axis];
        if(t>epsilon&&t<nearest&&(p[a]+t*direction[a])**2+(p[b]+t*direction[b])**2<=segment.radius**2+epsilon)nearest=t;
      }
    }
    return nearest;
  }

  function facingBasis(facing){
    if(Number.isFinite(facing)){
      const angle=facing*Math.PI/180;
      return {forward:[Math.sin(angle),0,Math.cos(angle)],left:[-Math.cos(angle),0,Math.sin(angle)]};
    }
    if(facing==='north')return {forward:[0,0,1],left:[-1,0,0]};
    if(facing==='east')return {forward:[1,0,0],left:[0,0,1]};
    if(facing==='south')return {forward:[0,0,-1],left:[1,0,0]};
    if(facing==='west')return {forward:[-1,0,0],left:[0,0,-1]};
    throw new Error('Unsupported facing: '+facing);
  }
  function humanBasis(human){return facingBasis(Number.isFinite(human.yawDegrees)?human.yawDegrees:human.facing);}
  function localPointToWorld(p,human){
    const b=humanBasis(human);
    return [human.x+p[0]*b.forward[0]+p[2]*b.left[0],p[1],human.z+p[0]*b.forward[2]+p[2]*b.left[2]];
  }
  function localDirectionToWorld(d,human){
    const b=humanBasis(human);
    return [d[0]*b.forward[0]+d[2]*b.left[0],d[1],d[0]*b.forward[2]+d[2]*b.left[2]];
  }

  function faceDimensions(room,face){
    if(face==='west'||face==='east')return [room.depth,room.height];
    if(face==='south'||face==='north')return [room.width,room.height];
    return [room.width,room.depth];
  }
  function faceUV(face,p){
    if(face==='west'||face==='east')return [p[2],p[1]];
    if(face==='south'||face==='north')return [p[0],p[1]];
    return [p[0],p[2]];
  }
  function rectArea(r){return Math.max(0,r.u1-r.u0)*Math.max(0,r.v1-r.v0);}
  function overlapArea(a,b){return Math.max(0,Math.min(a.u1,b.u1)-Math.max(a.u0,b.u0))*Math.max(0,Math.min(a.v1,b.v1)-Math.max(a.v0,b.v0));}
  function pointInRect(u,v,r,tol=1e-12){return u>=r.u0-tol&&u<=r.u1+tol&&v>=r.v0-tol&&v<=r.v1+tol;}

  function compileRegions(room,overlays=[]){
    for(const key of ['width','depth','height']){assertFiniteNumber(room[key],'room.'+key);if(room[key]<=0)throw new Error('Room dimensions must be positive');}
    const bases=FACE_NAMES.map(face=>{const [u1,v1]=faceDimensions(room,face);return {id:'base:'+face,label:face,kind:'base',face,u0:0,u1,v0:0,v1,area:u1*v1,effectiveArea:u1*v1,temperature:22,emissivity:1};});
    const normalized=overlays.map((input,index)=>{
      const r={...input,id:String(input.id||('region-'+index)),kind:input.kind||'panel'};
      if(r.id.startsWith('base:'))throw new Error('Region id uses reserved prefix: '+r.id);
      if(!FACE_NAMES.includes(r.face))throw new Error('Invalid face for '+r.id);
      if(!['window','panel'].includes(r.kind))throw new Error('Invalid region kind for '+r.id);
      for(const k of ['u0','u1','v0','v1'])assertFiniteNumber(r[k],r.id+'.'+k);
      const [umax,vmax]=faceDimensions(room,r.face);
      if(!(r.u0>=0&&r.v0>=0&&r.u1<=umax&&r.v1<=vmax&&r.u1>r.u0&&r.v1>r.v0))throw new Error('Region outside face or empty: '+r.id);
      r.area=rectArea(r);if(r.temperature===undefined)r.temperature=22;else assertFiniteNumber(r.temperature,r.id+'.temperature');if(r.emissivity===undefined)r.emissivity=1;else assertFiniteNumber(r.emissivity,r.id+'.emissivity');
      if(r.emissivity<0||r.emissivity>1)throw new Error('Emissivity outside [0,1]: '+r.id);
      return r;
    });
    if(new Set(normalized.map(r=>r.id)).size!==normalized.length)throw new Error('Region ids must be unique');
    for(let i=0;i<normalized.length;i++)for(let j=i+1;j<normalized.length;j++){
      const a=normalized[i],b=normalized[j];if(a.face!==b.face)continue;
      const overlap=overlapArea(a,b);if(overlap<=1e-14)continue;
      if(a.kind===b.kind||a.kind==='panel'&&b.kind==='panel')throw new Error('Overlapping '+a.kind+' regions: '+a.id+' and '+b.id);
    }
    const windows=normalized.filter(r=>r.kind==='window');
    for(const r of normalized){
      r.effectiveArea=r.kind==='panel'?Math.max(0,r.area-windows.filter(w=>w.face===r.face).reduce((s,w)=>s+overlapArea(r,w),0)):r.area;
    }
    for(const base of bases){
      const suppliedTemperature=room.surfaceTemperatures&&room.surfaceTemperatures[base.face],suppliedEmissivity=room.surfaceEmissivities&&room.surfaceEmissivities[base.face];
      if(suppliedTemperature===undefined)base.temperature=22;else{assertFiniteNumber(suppliedTemperature,base.id+'.temperature');base.temperature=suppliedTemperature;}
      if(suppliedEmissivity===undefined)base.emissivity=1;else{assertFiniteNumber(suppliedEmissivity,base.id+'.emissivity');base.emissivity=suppliedEmissivity;}
      if(base.emissivity<0||base.emissivity>1)throw new Error('Emissivity outside [0,1]: '+base.id);
      base.effectiveArea=base.area-normalized.filter(r=>r.face===base.face).reduce((s,r)=>s+r.effectiveArea,0);
      if(base.effectiveArea<-1e-10)throw new Error('Regions exceed face area: '+base.face);
    }
    const byFace=Object.fromEntries(FACE_NAMES.map(face=>[face,normalized.filter(r=>r.face===face).sort((a,b)=>(a.kind==='window'?-1:1)-(b.kind==='window'?-1:1))]));
    const byId=new Map([...bases,...normalized].map(r=>[r.id,r]));
    function classify(face,p){
      const [u,v]=faceUV(face,p),list=byFace[face];
      for(const kind of ['window','panel'])for(const r of list)if(r.kind===kind&&pointInRect(u,v,r))return r.id;
      return 'base:'+face;
    }
    return {bases,overlays:normalized,regions:[...bases,...normalized],byId,byFace,classify};
  }

  function segmentWorldBounds(segment,human){
    const center=localPointToWorld(segment.center,human);
    if(segment.shape==='sphere')return {min:center.map(x=>x-segment.radius),max:center.map(x=>x+segment.radius)};
    const localAxis=segment.axis==='x'?[1,0,0]:segment.axis==='y'?[0,1,0]:[0,0,1],axis=localDirectionToWorld(localAxis,human),extent=axis.map(component=>Math.abs(component)*segment.length/2+segment.radius*Math.sqrt(Math.max(0,1-component*component)));
    return {min:center.map((x,i)=>x-extent[i]),max:center.map((x,i)=>x+extent[i])};
  }

  // Radiating patches can share a single closed blocking solid.
  function buildOccludingSolids(segments){
    const solids=[],byId=new Map();
    for(const segment of segments){
      const id=segment.solidId||segment.name;
      if(!byId.has(id)){const solid={...segment,name:id,emitter:undefined,patches:[]};byId.set(id,solid);solids.push(solid);}
      const solid=byId.get(id);
      if(solid.shape!==segment.shape||solid.axis!==segment.axis||solid.radius!==segment.radius||solid.length!==segment.length||solid.center.some((v,i)=>v!==segment.center[i]))throw new Error('Inconsistent shared solid: '+id);
      solid.patches.push({name:segment.name,emitter:segment.emitter});
      for(const part of segment.occlusionParts||[]){
        if(byId.has(part.name))throw new Error('Duplicate auxiliary solid: '+part.name);
        const auxiliary={...part,center:segment.center.map((v,i)=>v+part.offset[i]),patches:[{name:part.name}],auxiliary:true};byId.set(part.name,auxiliary);solids.push(auxiliary);
      }
    }
    return solids;
  }
  function solidReceiverAt(solid,point){
    if(solid.patches.length===1)return solid.patches[0].name;
    const axis=solid.axis==='x'?0:solid.axis==='y'?1:2,radial=axis===0?[1,2]:axis===1?[0,2]:[0,1],phi=Math.atan2(point[radial[1]]-solid.center[radial[1]],point[radial[0]]-solid.center[radial[0]]);
    for(const patch of solid.patches){const e=patch.emitter;if(!e)return patch.name;const angle=((phi-e.phiStart)%TWO_PI+TWO_PI)%TWO_PI;if(angle<e.phiSweep+1e-12)return patch.name;}
    throw new Error('Unclassified solid patch: '+solid.name);
  }

  function validateScene(scene){
    if(!scene||!scene.room||!scene.human)throw new Error('Scene needs room and human');
    const room=scene.room,human=scene.human;
    for(const key of ['x','z'])assertFiniteNumber(human[key],'human.'+key);
    humanBasis(human);
    if(!(human.x>0&&human.x<room.width&&human.z>0&&human.z<room.depth))throw new Error('Human origin outside room');
    const segments=scene.segments||createPaperDimensionAuthorLayout();
    const limits=[room.width,room.height,room.depth],tolerance=Math.hypot(...limits)*1e-10;
    const solids=buildOccludingSolids(segments);
    for(const segment of solids){const bounds=segmentWorldBounds(segment,human);for(let k=0;k<3;k++)if(bounds.min[k]<-tolerance||bounds.max[k]>limits[k]+tolerance)throw new Error('Body segment outside room: '+segment.name);}
    const compiled=compileRegions(room,scene.regions||[]);
    return {...scene,segments,solids,compiled};
  }

  function roomBoundaryHit(origin,direction,room,epsilon){
    const candidates=[];
    function add(t,face){if(t>0&&Number.isFinite(t))candidates.push([t,face]);}
    if(Math.abs(direction[0])>1e-18){add((0-origin[0])/direction[0],'west');add((room.width-origin[0])/direction[0],'east');}
    if(Math.abs(direction[2])>1e-18){add((0-origin[2])/direction[2],'south');add((room.depth-origin[2])/direction[2],'north');}
    if(Math.abs(direction[1])>1e-18){add((0-origin[1])/direction[1],'floor');add((room.height-origin[1])/direction[1],'ceiling');}
    candidates.sort((a,b)=>a[0]-b[0]);
    for(const [t,face] of candidates){
      const p=addScaled(origin,direction,t);
      if(p[0]>=-epsilon&&p[0]<=room.width+epsilon&&p[1]>=-epsilon&&p[1]<=room.height+epsilon&&p[2]>=-epsilon&&p[2]<=room.depth+epsilon)return {t,face,point:p};
    }
    return null;
  }

  const PAPER_ZONE_IDS=[
    'ceiling:FL','ceiling:FR','ceiling:BL','ceiling:BR',
    'floor:FL','floor:FR','floor:BL','floor:BR',
    'Fwall:LU','Fwall:RU','Fwall:LD','Fwall:RD',
    'Bwall:LU','Bwall:RU','Bwall:LD','Bwall:RD',
    'Lwall:FU','Lwall:BU','Lwall:FD','Lwall:BD',
    'Rwall:FU','Rwall:BU','Rwall:FD','Rwall:BD'
  ];

  function physicalFaceDirection(face){
    return face==='east'?[1,0,0]:face==='west'?[-1,0,0]:face==='north'?[0,0,1]:face==='south'?[0,0,-1]:null;
  }

  function paperWallRole(face,human){
    const direction=physicalFaceDirection(face);
    if(!direction)throw new Error('Horizontal face has no wall role: '+face);
    const basis=humanBasis(human),front=dot(direction,basis.forward),left=dot(direction,basis.left);
    if(front>.5)return 'Fwall';
    if(front<-.5)return 'Bwall';
    return left>.5?'Lwall':'Rwall';
  }

  function paperZoneOfHit(face,point,human,centerHeight=.6){
    const basis=humanBasis(human),dx=point[0]-human.x,dz=point[2]-human.z;
    const front=dx*basis.forward[0]+dz*basis.forward[2]>=0;
    const left=dx*basis.left[0]+dz*basis.left[2]>=0;
    if(face==='ceiling'||face==='floor'){
      const quadrant=(front?'F':'B')+(left?'L':'R');
      return {id:face+':'+quadrant,faceRole:face,quadrant};
    }
    const faceRole=paperWallRole(face,human),up=point[1]>=centerHeight;
    const quadrant=(faceRole==='Fwall'||faceRole==='Bwall')
      ?(left?'L':'R')+(up?'U':'D')
      :(front?'F':'B')+(up?'U':'D');
    return {id:faceRole+':'+quadrant,faceRole,quadrant};
  }

  function traceAcceptedRay(scene,segmentIndex,sequenceIndex,seed,epsilon,excludeBuriedSurface=true,rayHuman=scene.human){
    const segments=scene.segments,source=segments[segmentIndex],q=sobol4(sequenceIndex,seed),sampled=sampleSurface(source,q);
    const solids=scene.solids||buildOccludingSolids(segments),sourceSolid=source.solidId||source.name;
    if(excludeBuriedSurface&&solids.some(other=>other.name!==sourceSolid&&pointInside(other,sampled.point,epsilon)))return null;
    const localOrigin=addScaled(sampled.point,sampled.normal,epsilon),worldOrigin=localPointToWorld(localOrigin,rayHuman);
    if(worldOrigin[0]<=0||worldOrigin[0]>=scene.room.width||worldOrigin[1]<=0||worldOrigin[1]>=scene.room.height||worldOrigin[2]<=0||worldOrigin[2]>=scene.room.depth)return null;
    const localDirection=cosineDirection(sampled.normal,q[2],q[3]),worldDirection=localDirectionToWorld(localDirection,rayHuman);
    const boundary=roomBoundaryHit(worldOrigin,worldDirection,scene.room,epsilon);
    if(!boundary)throw new Error('Ray missed enclosure for '+source.name);
    let nearest=boundary.t,receiver=null;
    for(const other of solids){
      if(other.name===sourceSolid)continue;
      const t=other.shape==='sphere'?sphereHit(localOrigin,localDirection,other,epsilon):cylinderHit(localOrigin,localDirection,other,epsilon);
      if(t<nearest){nearest=t;receiver='body:'+solidReceiverAt(other,addScaled(localOrigin,localDirection,t));}
    }
    const environment=!receiver;
    if(environment)receiver=scene.compiled.classify(boundary.face,boundary.point);
    const end=addScaled(worldOrigin,worldDirection,nearest);
    return {origin:worldOrigin,surfacePoint:localPointToWorld(sampled.point,rayHuman),surfaceNormal:localDirectionToWorld(sampled.normal,rayHuman),direction:worldDirection,end,receiver,boundaryFace:environment?boundary.face:null,
      zone:environment?paperZoneOfHit(boundary.face,boundary.point,rayHuman):null};
  }

  function tCritical95(batchCount){
    const df=batchCount-1;if(df<=1)return 12.706;if(df>16)return 1.96;return T95[df]||2.365;
  }
  function summarize(values){
    const n=values.length,mean=values.reduce((s,x)=>s+x,0)/n;
    if(n<2)return {mean,halfWidth95:Infinity,sd:Infinity};
    const variance=values.reduce((s,x)=>s+(x-mean)**2,0)/(n-1),sd=Math.sqrt(variance);
    return {mean,sd,halfWidth95:tCritical95(n)*sd/Math.sqrt(n)};
  }
  function precisionTarget(factor,mode){
    if(mode==='validation')return factor>=.01?Math.min(.0005,.01*factor):.0001;
    return factor>=.01?Math.min(.001,.02*factor):.0002;
  }

  function traceSegment(inputScene,segmentIndex,options={}){
    const scene=inputScene.compiled?inputScene:validateScene(inputScene);
    const segments=scene.segments,source=segments[segmentIndex];
    if(!source)throw new Error('Invalid segment index');
    const batches=Math.max(2,Math.floor(options.batches||8));
    const samplesPerBatch=Math.max(1000,Math.floor(options.samplesPerBatch||62500));
    const seed=(options.seed===undefined?240927:options.seed)>>>0;
    const precision=options.precision||'standard';
    const excludeBuriedSurface=options.excludeBuriedSurface!==false;
    const yawAngles=options.yawAngles===undefined?null:options.yawAngles.map(Number);
    if(yawAngles&&(!yawAngles.length||yawAngles.some(angle=>!Number.isFinite(angle))))throw new Error('yawAngles must contain finite values');
    const yawHumans=yawAngles?yawAngles.map(yawDegrees=>({...scene.human,yawDegrees})):null;
    const diagonal=Math.hypot(scene.room.width,scene.room.depth,scene.room.height);
    const epsilon=Number.isFinite(options.epsilon)?options.epsilon:Math.max(1e-10,diagonal*1e-8);
    const regionIds=scene.compiled.regions.map(r=>r.id),bodyIds=scene.solids.flatMap(s=>s.name===(source.solidId||source.name)?[]:s.patches.map(p=>'body:'+p.name));
    const receiverIds=[...regionIds,...bodyIds],batchFactors=[],batchZoneFactors=[],batchAttempts=[];
    for(let batch=0;batch<batches;batch++){
      const counts=Object.fromEntries(receiverIds.map(id=>[id,0])),zoneCounts=Object.fromEntries(PAPER_ZONE_IDS.map(id=>[id,0]));
      const batchSeed=hash32(seed^Math.imul(batch+1,0x9e3779b9)^Math.imul(segmentIndex+1,0x85ebca6b));
      let accepted=0,attempts=0;
      const yawAccepted=yawHumans?yawHumans.map(()=>0):null,yawAttempts=yawHumans?yawHumans.map(()=>0):null;
      const yawTargets=yawHumans?yawHumans.map((_,i)=>Math.floor(samplesPerBatch/yawHumans.length)+(i<samplesPerBatch%yawHumans.length?1:0)):null;
      let yawCursor=0;
      while(accepted<samplesPerBatch){
        if(attempts>samplesPerBatch*20)throw new Error('Too much buried emitting surface for '+source.name);
        let rayHuman=scene.human,sequenceIndex=attempts,raySeed=batchSeed,yawIndex=-1;
        if(yawHumans){
          let checked=0;while(yawAccepted[yawCursor]>=yawTargets[yawCursor]&&checked<yawHumans.length){yawCursor=(yawCursor+1)%yawHumans.length;checked++;}
          yawIndex=yawCursor;rayHuman=yawHumans[yawIndex];sequenceIndex=yawAttempts[yawIndex]++;
          raySeed=hash32(batchSeed^Math.imul(yawIndex+1,0x27d4eb2d));yawCursor=(yawCursor+1)%yawHumans.length;
        }
        const ray=traceAcceptedRay(scene,segmentIndex,sequenceIndex,raySeed,epsilon,excludeBuriedSurface,rayHuman);attempts++;
        if(!ray)continue;
        accepted++;if(yawAccepted)yawAccepted[yawIndex]++;
        if(!(ray.receiver in counts))throw new Error('Unclassified receiver '+ray.receiver);
        counts[ray.receiver]++;
        if(ray.zone)zoneCounts[ray.zone.id]++;
      }
      batchAttempts.push(attempts);
      batchFactors.push(Object.fromEntries(receiverIds.map(id=>[id,counts[id]/samplesPerBatch])));
      batchZoneFactors.push(Object.fromEntries(PAPER_ZONE_IDS.map(id=>[id,zoneCounts[id]/samplesPerBatch])));
    }
    const receivers={};
    for(const id of receiverIds)receivers[id]=summarize(batchFactors.map(b=>b[id]));
    const faces={};
    for(const face of FACE_NAMES){
      const ids=scene.compiled.regions.filter(r=>r.face===face).map(r=>r.id);
      faces[face]=summarize(batchFactors.map(b=>ids.reduce((s,id)=>s+b[id],0)));
    }
    const roomTotal=summarize(batchFactors.map(b=>regionIds.reduce((s,id)=>s+b[id],0)));
    const bodyTotal=summarize(batchFactors.map(b=>bodyIds.reduce((s,id)=>s+b[id],0)));
    const closure=summarize(batchFactors.map(b=>regionIds.concat(bodyIds).reduce((s,id)=>s+b[id],0)));
    const paperZones=Object.fromEntries(PAPER_ZONE_IDS.map(id=>[id,summarize(batchZoneFactors.map(b=>b[id]))]));
    const paperZoneTotal=summarize(batchZoneFactors.map(b=>PAPER_ZONE_IDS.reduce((s,id)=>s+b[id],0)));
    const batchReceivers=Object.fromEntries(receiverIds.map(id=>[id,batchFactors.map(batch=>batch[id])]));
    const batchFaces=Object.fromEntries(FACE_NAMES.map(face=>{const ids=scene.compiled.regions.filter(r=>r.face===face).map(r=>r.id);return [face,batchFactors.map(batch=>ids.reduce((sum,id)=>sum+batch[id],0))];}));
    const batchRoomTotal=batchFactors.map(batch=>regionIds.reduce((sum,id)=>sum+batch[id],0));
    const batchBodyTotal=batchFactors.map(batch=>bodyIds.reduce((sum,id)=>sum+batch[id],0));
    const batchPaperZones=Object.fromEntries(PAPER_ZONE_IDS.map(id=>[id,batchZoneFactors.map(batch=>batch[id])]));
    const convergenceItems=[...scene.compiled.regions.filter(r=>r.effectiveArea>1e-14).map(r=>receivers[r.id]),roomTotal];
    const converged=convergenceItems.every(x=>x.halfWidth95<=precisionTarget(x.mean,precision));
    const exposedSamplingAcceptance=(batches*samplesPerBatch)/batchAttempts.reduce((s,x)=>s+x,0);
    return {segment:source.name,segmentIndex,method:'cosine-weighted independently digital-shifted Sobol ray casting',precision,seed,
      batches,samplesPerBatch,totalAccepted:batches*samplesPerBatch,totalAttempts:batchAttempts.reduce((s,x)=>s+x,0),
      exposedSamplingAcceptance,nominalGeometricArea:source.geometricArea,paperArea:source.paperArea,
      exposedAreaEstimate:source.geometricArea*exposedSamplingAcceptance,epsilon,excludeBuriedSurface,
      azimuthAverage:yawAngles?{angles:yawAngles.slice(),count:yawAngles.length}:null,
      receivers,faces,roomTotal,bodyTotal,closure,paperZones,paperZoneTotal,
      batchEstimates:{receivers:batchReceivers,faces:batchFaces,roomTotal:batchRoomTotal,bodyTotal:batchBodyTotal,paperZones:batchPaperZones},converged};
  }

  function traceScene(inputScene,options={}){
    const scene=validateScene(inputScene),results=[];
    for(let i=0;i<scene.segments.length;i++)results.push(traceSegment(scene,i,options));
    return {engineVersion:VERSION,geometryId:MODEL_SPEC.geometryId,modelSpec:MODEL_SPEC,room:{...scene.room},human:{...scene.human},
      regionMetadata:scene.compiled.regions.map(r=>({...r})),options:{...options},segments:results};
  }

  function traceSegmentAdaptive(inputScene,segmentIndex,options={}){
    const precision=options.precision||'standard';
    if(precision==='preview')return {...traceSegment(inputScene,segmentIndex,{...options,precision:'standard',samplesPerBatch:options.samplesPerBatch||6250}),adaptiveHistory:[]};
    const requiredMinimum=precision==='validation'?625000:62500,maxPerBatch=Math.max(requiredMinimum,Math.floor(options.maxSamplesPerBatch||(precision==='validation'?625000:250000)));
    let perBatch=Math.max(requiredMinimum,Math.min(maxPerBatch,Math.floor(options.samplesPerBatch||requiredMinimum))),result,history=[];
    while(true){
      result=traceSegment(inputScene,segmentIndex,{...options,precision,samplesPerBatch:perBatch});
      history.push({samplesPerBatch:perBatch,totalAccepted:result.totalAccepted,converged:result.converged,
        maximumFaceHalfWidth95:Math.max(...Object.values(result.faces).map(x=>x.halfWidth95)),roomHalfWidth95:result.roomTotal.halfWidth95});
      if(result.converged||perBatch>=maxPerBatch)break;
      perBatch=Math.min(maxPerBatch,perBatch*2);
    }
    return {...result,adaptiveHistory:history,reachedSampleLimit:!result.converged&&perBatch>=maxPerBatch};
  }

  function regionThermalMap(scene){
    const checked=scene.compiled?scene:validateScene(scene);
    return Object.fromEntries(checked.compiled.regions.map(r=>[r.id,{temperature:r.temperature,emissivity:r.emissivity,kind:r.kind,face:r.face}]));
  }
  function effectiveMRT(segmentResult,thermalById){
    let numerator=0,denominator=0;
    for(const [id,stat] of Object.entries(segmentResult.receivers)){
      if(id.startsWith('body:'))continue;
      const thermal=thermalById[id];if(!thermal)throw new Error('Missing thermal data for '+id);
      const kelvin=thermal.temperature+273.15;if(!(kelvin>0))throw new Error('Non-physical temperature for '+id);
      numerator+=stat.mean*kelvin**4;denominator+=stat.mean;
    }
    if(!(denominator>0))throw new Error('No visible enclosure for '+segmentResult.segment);
    const kelvin=(numerator/denominator)**.25;
    return {kelvin,celsius:kelvin-273.15,visibleEnclosureFactor:denominator};
  }

  function environmentWeights(segmentResult){
    const total=segmentResult.roomTotal.mean;
    if(!(total>0))throw new Error('No visible enclosure for '+segmentResult.segment);
    const regions={},faces={},paperZones={};
    for(const [id,stat] of Object.entries(segmentResult.receivers))if(!id.startsWith('body:'))regions[id]=stat.mean/total;
    for(const [id,stat] of Object.entries(segmentResult.faces))faces[id]=stat.mean/total;
    for(const [id,stat] of Object.entries(segmentResult.paperZones||{}))paperZones[id]=stat.mean/total;
    return {total,regions,faces,paperZones};
  }

  function paperPrintedMRT(segmentResult,thermalById){
    let fourthPower=0;
    for(const [id,stat] of Object.entries(segmentResult.receivers)){
      if(id.startsWith('body:'))continue;
      const thermal=thermalById[id];if(!thermal)throw new Error('Missing thermal data for '+id);
      const kelvin=thermal.temperature+273.15;if(!(kelvin>0))throw new Error('Non-physical temperature for '+id);
      fourthPower+=stat.mean*kelvin**4;
    }
    const kelvin=fourthPower**.25;
    return {kelvin,celsius:kelvin-273.15,visibleEnclosureFactor:segmentResult.roomTotal.mean,
      interpretation:'literal reproduction of printed Equation (8), without external-factor normalization'};
  }

  function illustrateRays(inputScene,segmentIndex,options={}){
    const scene=inputScene.compiled?inputScene:validateScene(inputScene),count=Math.max(1,Math.min(256,Math.floor(options.count||36)));
    const diagonal=Math.hypot(scene.room.width,scene.room.depth,scene.room.height),epsilon=Number.isFinite(options.epsilon)?options.epsilon:Math.max(1e-10,diagonal*1e-8);
    const seed=(options.seed===undefined?20240927:options.seed)>>>0,rays=[];
    let attempts=0;
    while(rays.length<count&&attempts<count*50){const ray=traceAcceptedRay(scene,segmentIndex,attempts,seed,epsilon,options.excludeBuriedSurface!==false);attempts++;if(ray)rays.push(ray);}
    if(rays.length<count)throw new Error('Unable to generate requested illustration rays');
    return {segment:scene.segments[segmentIndex].name,segmentIndex,rays,attempts,seed,method:'the same surface sampling, cosine direction and first-hit classification used by the solver'};
  }

  function resultArea(result,areaMode){
    if(areaMode==='paper')return result.paperArea;
    if(areaMode==='geometric')return result.nominalGeometricArea;
    if(areaMode==='exposed')return result.exposedAreaEstimate;
    throw new Error('Unsupported whole-body area mode: '+areaMode);
  }

  function wholeBodyViewFactors(traceResult,options={}){
    if(!traceResult||!Array.isArray(traceResult.segments)||!traceResult.segments.length)throw new Error('Whole-body results require traced segments');
    const areaMode=options.areaMode||'exposed',normalizeEnvironment=options.normalizeEnvironment!==false,faces=Object.fromEntries(FACE_NAMES.map(face=>[face,0])),regions={},paperZones={};
    let visibleRadiantArea=0,nominalArea=0,selfInterceptArea=0;
    for(const result of traceResult.segments){
      const area=resultArea(result,areaMode);
      if(!(area>0))throw new Error('Missing '+areaMode+' area for '+result.segment);
      nominalArea+=area;
      visibleRadiantArea+=area*result.roomTotal.mean;
      selfInterceptArea+=area*result.bodyTotal.mean;
      for(const face of FACE_NAMES)faces[face]+=area*result.faces[face].mean;
      for(const [id,stat] of Object.entries(result.receivers))if(!id.startsWith('body:'))regions[id]=(regions[id]||0)+area*stat.mean;
      for(const [id,stat] of Object.entries(result.paperZones||{}))paperZones[id]=(paperZones[id]||0)+area*stat.mean;
    }
    if(!(visibleRadiantArea>0))throw new Error('No whole-body visible radiant area');
    const normalizationArea=normalizeEnvironment?visibleRadiantArea:nominalArea;
    for(const face of FACE_NAMES)faces[face]/=normalizationArea;
    for(const id of Object.keys(regions))regions[id]/=normalizationArea;
    for(const id of Object.keys(paperZones))paperZones[id]/=normalizationArea;
    let uncertainty=null;
    const batchCount=Math.min(...traceResult.segments.map(result=>result.batchEstimates?result.batchEstimates.roomTotal.length:0));
    if(batchCount>=2){
      const regionIds=[...new Set(traceResult.segments.flatMap(result=>Object.keys(result.receivers).filter(id=>!id.startsWith('body:'))))];
      const zoneIds=[...new Set(traceResult.segments.flatMap(result=>Object.keys(result.paperZones||{})))];
      const batchFaceValues=Object.fromEntries(FACE_NAMES.map(face=>[face,[]])),batchRegionValues=Object.fromEntries(regionIds.map(id=>[id,[]])),batchZoneValues=Object.fromEntries(zoneIds.map(id=>[id,[]]));
      for(let batch=0;batch<batchCount;batch++){
        let denominator=normalizeEnvironment?0:nominalArea;if(normalizeEnvironment)for(const result of traceResult.segments)denominator+=resultArea(result,areaMode)*result.batchEstimates.roomTotal[batch];
        for(const face of FACE_NAMES){let numerator=0;for(const result of traceResult.segments)numerator+=resultArea(result,areaMode)*result.batchEstimates.faces[face][batch];batchFaceValues[face].push(numerator/denominator);}
        for(const id of regionIds){let numerator=0;for(const result of traceResult.segments){const values=result.batchEstimates.receivers[id];if(values)numerator+=resultArea(result,areaMode)*values[batch];}batchRegionValues[id].push(numerator/denominator);}
        for(const id of zoneIds){let numerator=0;for(const result of traceResult.segments){const values=result.batchEstimates.paperZones[id];if(values)numerator+=resultArea(result,areaMode)*values[batch];}batchZoneValues[id].push(numerator/denominator);}
      }
      uncertainty={batchCount,faces:Object.fromEntries(FACE_NAMES.map(face=>[face,summarize(batchFaceValues[face])])),
        regions:Object.fromEntries(regionIds.map(id=>[id,summarize(batchRegionValues[id])])),paperZones:Object.fromEntries(zoneIds.map(id=>[id,summarize(batchZoneValues[id])]))};
    }
    return {geometryId:traceResult.geometryId||MODEL_SPEC.geometryId,areaMode,normalization:normalizeEnvironment?'visible-environment':'emitting-area',faces,regions,paperZones,
      visibleRadiantArea,nominalArea,selfInterceptArea,visibleFraction:visibleRadiantArea/nominalArea,
      selfInterceptFraction:selfInterceptArea/nominalArea,closure:(visibleRadiantArea+selfInterceptArea)/nominalArea,
      faceSum:FACE_NAMES.reduce((sum,face)=>sum+faces[face],0),uncertainty};
  }

  function wholeBodyMRT(traceResult,thermalById,options={}){
    const areaMode=options.areaMode||'exposed';
    let numerator=0,denominator=0;
    for(const result of traceResult.segments){
      const area=resultArea(result,areaMode);
      for(const [id,stat] of Object.entries(result.receivers)){
        if(id.startsWith('body:'))continue;
        const thermal=thermalById[id];if(!thermal)throw new Error('Missing thermal data for '+id);
        const kelvin=thermal.temperature+273.15;
        numerator+=area*stat.mean*kelvin**4;denominator+=area*stat.mean;
      }
    }
    if(!(denominator>0))throw new Error('No whole-body enclosure factor');
    const kelvin=(numerator/denominator)**.25;
    return {kelvin,celsius:kelvin-273.15,weightedVisibleAreaFactor:denominator,areaMode};
  }

  return {VERSION,SIGMA,MODEL_SPEC,FACE_NAMES,PAPER_TYPES,AUTHOR_LAYOUT,PAPER_ZONE_IDS,createPaperDimensionAuthorLayout,sobol4,sampleSurface,cosineDirection,
    pointInside,sphereHit,cylinderHit,facingBasis,humanBasis,localPointToWorld,localDirectionToWorld,faceDimensions,faceUV,
    compileRegions,segmentWorldBounds,buildOccludingSolids,solidReceiverAt,validateScene,roomBoundaryHit,paperWallRole,paperZoneOfHit,summarize,precisionTarget,traceSegment,traceSegmentAdaptive,traceScene,
    regionThermalMap,effectiveMRT,environmentWeights,paperPrintedMRT,illustrateRays,wholeBodyViewFactors,wholeBodyMRT};
});
