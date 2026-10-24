(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./vf-rebuild-core.js'):root.VFRebuild,node?require('./1020-direct-solar.js'):root.VF1020DirectSolar);if(node)module.exports=api;else root.VF1020SolarView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(VF,S){
  'use strict';
  const palette={background:0xf3f4f4,body:0x879197,selected:0xc7514d,lit:0xf2c94c,floor:0xe7ebeb,edge:0xb8c1c3,window:0xa8c6d0};
  function cellPoints(scene,c,offset=0){const s=scene.segments[c.index];return [[c.u0,c.v0],[c.u1,c.v0],[c.u1,c.v1],[c.u0,c.v1]].map(q=>{const p=VF.sampleSurface(s,q);return VF.localPointToWorld(p.point.map((v,i)=>v+offset*p.normal[i]),scene.human);});}
  function cellNormals(scene,c){return [[c.u0,c.v0],[c.u1,c.v0],[c.u1,c.v1],[c.u0,c.v1]].map(q=>VF.localDirectionToWorld(VF.sampleSurface(scene.segments[c.index],q).normal,scene.human));}
  function triangleOrder(points,normals){const order=[];for(let i=1;i<points.length-1;i++){const a=points[i].map((v,j)=>v-points[0][j]),b=points[i+1].map((v,j)=>v-points[0][j]),cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],normal=normals[0];order.push(...(cross.reduce((sum,v,j)=>sum+v*normal[j],0)<0?[0,i+1,i]:[0,i,i+1]));}return order;}
  function displayPolygons(segment){const uCount=segment.shape==='sphere'?24:1,vCount=64,polygons=[];for(let u=0;u<uCount;u++)for(let v=0;v<vCount;v++)polygons.push([[u/uCount,v/vCount],[(u+1)/uCount,v/vCount],[(u+1)/uCount,(v+1)/vCount],[u/uCount,(v+1)/vCount]].map(q=>VF.sampleSurface(segment,q).point));return polygons;}
  function bodyBounds(scene){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const s of scene.solids||scene.segments){const a=s.axis==='x'?0:s.axis==='y'?1:2,e=[s.radius,s.radius,s.radius];if(s.shape!=='sphere')e[a]=s.length/2;for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const p=VF.localPointToWorld(s.center.map((v,i)=>v+[x,y,z][i]*e[i]),scene.human);for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}}}return {center:min.map((v,i)=>(v+max[i])/2),size:min.map((v,i)=>max[i]-v)};}
  function regionPoints(r,R){return [[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]].map(([u,v])=>r.face==='west'?[0,v,u]:r.face==='east'?[R.width,v,u]:r.face==='south'?[u,v,0]:r.face==='north'?[u,v,R.depth]:r.face==='floor'?[u,0,v]:[u,R.height,v]);}
  function roomEnvelope(R){const W=R.width,H=R.height,D=R.depth,p=[[0,0,0],[W,0,0],[W,H,0],[0,H,0],[0,0,D],[W,0,D],[W,H,D],[0,H,D]],definitions=[['floor',[0,4,5,1],0xe7ebeb,1],['west',[0,3,7,4],0xcbd7dd,.10],['east',[1,5,6,2],0xcbd7dd,.14],['south',[0,1,2,3],0xd7e0e4,.12],['north',[4,7,6,5],0xd7e0e4,.10],['ceiling',[3,2,6,7],0xdde5e8,.07]],pairs=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];return {faces:definitions.map(([face,indices,color,opacity])=>({face,points:indices.map(i=>p[i]),color,opacity})),edges:pairs.map(([a,b])=>[p[a],p[b]])};}
  function makeVisual(input,solar,resolution={}){
    const ctx=S.prepare(input,solar),scene=ctx.scene,cells=[],rays=[],raySegments=new Set(),uCount=resolution.u||24,vCount=resolution.v||64,enabled=solar.on&&solar.idir>0&&solar.alt>0;
    if(enabled)for(let index=0;index<scene.segments.length;index++)for(let u=0;u<uCount;u++)for(let v=0;v<vCount;v++){
      let coverage=0;const ids={};for(const a of [.25,.75])for(const b of [.25,.75]){const q=S.classify(ctx,index,(u+a)/uCount,(v+b)/vCount);const win=q.windowId&&ctx.scene.compiled.byId.get(q.windowId);if(win&&(win.tsol??win.transmittance??0)>0){coverage+=.25;ids[win.id]=(ids[win.id]||0)+.25;if(rays.length<8&&!raySegments.has(index)&&u%6===0&&v%7===0){rays.push({index,from:q.entry,to:q.point,windowId:win.id});raySegments.add(index);}}}
      if(coverage>0)cells.push({index,u0:u/uCount,u1:(u+1)/uCount,v0:v/vCount,v1:(v+1)/vCount,coverage,windows:ids});
    }
    const R=scene.room,center=[R.width/2,R.height/2,R.depth/2],distance=Math.max(R.width,R.depth,R.height)*.64;
    return {key:S.geometryKey(scene,solar),cells,rays,sun:{enabled:!!solar.on&&solar.alt>0,direction:ctx.s,position:center.map((v,i)=>v+ctx.s[i]*distance),alt:solar.alt,az:solar.az},resolution:{u:uCount,v:vCount,samplesPerCell:4}};
  }
  function drawCanvas(ctx,scene,project,visual,selected,view,options={}){
    const R=scene.room,W=R.width,D=R.depth,H=R.height;
    function polygon(points,fill,stroke,dash=[],lineWidth=1){const ps=points.map(project);ctx.beginPath();ctx.moveTo(ps[0][0],ps[0][1]);for(const p of ps.slice(1))ctx.lineTo(p[0],p[1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}}
    const envelope=roomEnvelope(R),walls=envelope.faces.filter(f=>f.face!=='floor').sort((a,b)=>a.points.reduce((s,p)=>s+project(p)[2],0)-b.points.reduce((s,p)=>s+project(p)[2],0));
    for(const wall of walls){const r=wall.color>>16&255,g=wall.color>>8&255,b=wall.color&255;polygon(wall.points,'rgba('+r+','+g+','+b+','+wall.opacity+')');}
    for(const r of scene.compiled.overlays)if(r.face!=='floor')polygon(regionPoints(r,R),r.kind==='window'?'#dae7eb':'rgba(220,38,38,.08)');
    const planes=[{points:[[0,0,0],[W,0,0],[W,0,D],[0,0,D]],color:[231,235,235],shade:false}];
    for(const edge of envelope.edges)planes.push({points:edge,color:[148,166,175],stroke:[148,166,175],lineWidth:1.1,shade:false});
    for(const r of scene.compiled.overlays)if(r.face!=='floor'){const points=regionPoints(r,R),window=r.kind==='window',stroke=window?[156,185,196]:[220,38,38];for(let i=0;i<4;i++)planes.push({points:[points[i],points[(i+1)%4]],color:stroke,stroke,lineWidth:window?1:2,dash:window?null:[7,5],shade:false});}
    for(const r of scene.compiled.overlays)if(r.face==='floor')planes.push({points:regionPoints(r,R).map(p=>[p[0],p[1]+.0002,p[2]]),color:r.kind==='window'?[218,231,235]:[230,219,219],stroke:r.kind==='window'?[156,185,196]:[220,38,38],lineWidth:r.kind==='window'?1:2,dash:r.kind==='window'?null:[7,5],shade:false});
    for(const c of visual?.cells||[]){const base=c.index===selected?[199,81,77]:[135,145,151];planes.push({points:cellPoints(scene,c,.00065),color:[242,201,76].map((v,i)=>Math.round(v*c.coverage+base[i]*(1-c.coverage))),shade:true});}
    const rays=visual?.rays||[],main=rays.find(r=>r.index===selected)||rays[Math.floor(rays.length/2)],shown=options.showRays?rays:main?[main]:[];
    for(const ray of shown){planes.push({points:[ray.from,ray.to],color:[242,201,76],stroke:[220,177,57],lineWidth:1.1,shade:false});const d=ray.to.map((v,i)=>v-ray.from[i]),n=Math.hypot(...d)||1,u=d.map(v=>v/n),r=[u[2],0,-u[0]],rn=Math.hypot(...r)||1;for(const sign of [-1,1])planes.push({points:[ray.to,ray.to.map((v,i)=>v-u[i]*.07+sign*r[i]/rn*.025)],color:[242,201,76],stroke:[220,177,57],lineWidth:1.1,shade:false});}
    view.drawDepthScene(ctx,scene,project,planes,{selected});return {rayCount:shown.length};
  }
  return {makeVisual,cellPoints,cellNormals,triangleOrder,displayPolygons,bodyBounds,regionPoints,roomEnvelope,palette,drawCanvas};
});
