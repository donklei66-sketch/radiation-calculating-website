(function(root,factory){const vf=typeof module==='object'&&module.exports?require('./vf-rebuild-core.js'):root.VFRebuild;const api=factory(vf);if(typeof module==='object'&&module.exports)module.exports=api;else root.VFSceneView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(VF){
  'use strict';
  // Meshes used for display are built from the production surface definition.
  function surfacePolygons(s,n=48){
    const polygons=[];
    if(s.shape==='sphere'){
      const lat=16,point=(a,b)=>[s.center[0]+s.radius*Math.sin(a)*Math.cos(b),s.center[1]+s.radius*Math.cos(a),s.center[2]+s.radius*Math.sin(a)*Math.sin(b)];
      for(let i=0;i<lat;i++)for(let j=0;j<n;j++)polygons.push([point(Math.PI*i/lat,2*Math.PI*j/n),point(Math.PI*(i+1)/lat,2*Math.PI*j/n),point(Math.PI*(i+1)/lat,2*Math.PI*(j+1)/n),point(Math.PI*i/lat,2*Math.PI*(j+1)/n)]);
    }else{
      const a=s.axis==='x'?0:s.axis==='y'?1:2,r=a===0?[1,2]:a===1?[0,2]:[0,1],start=s.emitter?s.emitter.phiStart:0,sweep=s.emitter?s.emitter.phiSweep:2*Math.PI,steps=Math.round(n*sweep/(2*Math.PI));
      const point=(t,phi)=>{const p=s.center.slice();p[a]+=t*s.length/2;p[r[0]]+=s.radius*Math.cos(phi);p[r[1]]+=s.radius*Math.sin(phi);return p;};
      for(let j=0;j<steps;j++){const p=start+sweep*j/steps,q=start+sweep*(j+1)/steps;polygons.push([point(-1,p),point(1,p),point(1,q),point(-1,q)]);}
    }
    return polygons;
  }
  function projection(scene,mode,w,h,camera={yaw:-.72,pitch:-.22,zoom:1}){
    const local=mode==='local',center=local?VF.localPointToWorld([0,.64,0],scene.human):[scene.room.width/2,scene.room.height/2,scene.room.depth/2],span=local?1.65:Math.max(scene.room.width,scene.room.depth,scene.room.height)*1.3,scale=Math.min(w,h)/span*(camera.zoom||1),cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
    return p=>{const dx=p[0]-center[0],dy=p[1]-center[1],dz=p[2]-center[2],rx=cy*dx-sy*dz,depth=sy*dx+cy*dz;return [w/2+rx*scale,h/2-(cp*dy-sp*depth)*scale,cp*depth+sp*dy,scale];};
  }
  function polygon(ctx,project,points,fill,stroke,dash=[]){const ps=points.map(project);ctx.beginPath();ctx.moveTo(ps[0][0],ps[0][1]);for(const p of ps.slice(1))ctx.lineTo(p[0],p[1]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}}
  function regionPoints(r,room){return [[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]].map(([u,v])=>r.face==='west'?[0,v,u]:r.face==='east'?[room.width,v,u]:r.face==='south'?[u,v,0]:r.face==='north'?[u,v,room.depth]:r.face==='floor'?[u,0,v]:[u,room.height,v]);}
  function drawRoom(ctx,scene,project){
    const W=scene.room.width,H=scene.room.height,D=scene.room.depth,p=[[0,0,0],[W,0,0],[W,H,0],[0,H,0],[0,0,D],[W,0,D],[W,H,D],[0,H,D]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    ctx.lineWidth=1.2;ctx.strokeStyle='#94a3b8';for(const [a,b] of edges){const A=project(p[a]),B=project(p[b]);ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();}
    for(const r of scene.compiled.overlays){const color=r.kind==='window'?'#0284c7':'#dc2626';ctx.lineWidth=2;polygon(ctx,project,regionPoints(r,scene.room),r.kind==='window'?'rgba(2,132,199,.12)':'rgba(220,38,38,.08)',color,r.kind==='panel'?[7,5]:[]);}
  }
  function drawBody(ctx,scene,selectedIndex,project){
    const surfaces=[];
    function add(s,index){for(const points of surfacePolygons(s)){const world=points.map(p=>VF.localPointToWorld(p,scene.human)),depth=world.reduce((sum,p)=>sum+project(p)[2],0)/world.length;surfaces.push({world,depth,index,aux:s.auxiliary});}}
    scene.segments.forEach(add);
    for(const solid of scene.solids||VF.buildOccludingSolids(scene.segments)){
      if(solid.auxiliary)add(solid,-1);
      if(solid.shape==='sphere')continue;
      const axis=solid.axis==='x'?0:solid.axis==='y'?1:2,radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];
      for(const end of [-1,1]){const points=[];for(let j=0;j<48;j++){const p=solid.center.slice();p[axis]+=end*solid.length/2;p[radial[0]]+=solid.radius*Math.cos(2*Math.PI*j/48);p[radial[1]]+=solid.radius*Math.sin(2*Math.PI*j/48);points.push(VF.localPointToWorld(p,scene.human));}surfaces.push({world:points,depth:points.reduce((sum,p)=>sum+project(p)[2],0)/points.length,index:-1,aux:true});}
    }
    surfaces.sort((a,b)=>a.depth-b.depth);
    for(const s of surfaces){const selected=s.index===selectedIndex;ctx.lineWidth=.35;polygon(ctx,project,s.world,selected?'#ef4444':s.aux?'#cbd5e1':'#94a3b8',selected?'#b91c1c':'#64748b');}
    const arrow=VF.localPointToWorld([.72,.3,0],scene.human),origin=VF.localPointToWorld([.58,.3,0],scene.human),A=project(origin),B=project(arrow);ctx.strokeStyle='#2563eb';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();ctx.fillStyle='#1d4ed8';ctx.font='13px system-ui';ctx.fillText('面朝',B[0]+3,B[1]);
    if(selectedIndex>=0){const s=scene.segments[selectedIndex],e=s.emitter,angle=e?e.phiStart+e.phiSweep/2:0,point=s.center.slice();if(e){point[0]+=s.radius*Math.cos(angle);point[2]+=s.radius*Math.sin(angle);}return project(VF.localPointToWorld(point,scene.human));}
    return null;
  }
  // Orthographic, per-pixel depth test. Target and body share the same depth
  // buffer, so visibility is independent of their drawing order or camera yaw.
  function drawDepthScene(ctx,scene,project,planes=[]){
    const width=ctx.canvas.width,height=ctx.canvas.height,pixels=ctx.getImageData(0,0,width,height),depths=new Float64Array(width*height);
    depths.fill(-Infinity);
    const faces=[];
    function add(s,index){for(const points of surfacePolygons(s))faces.push({points:points.map(p=>VF.localPointToWorld(p,scene.human)),color:s.auxiliary?[186,199,215]:[128,148,171],shade:true});}
    scene.segments.forEach(add);
    for(const solid of scene.solids||VF.buildOccludingSolids(scene.segments)){
      if(solid.auxiliary)add(solid,-1);
      if(solid.shape==='sphere')continue;
      const axis=solid.axis==='x'?0:solid.axis==='y'?1:2,radial=axis===0?[1,2]:axis===1?[0,2]:[0,1];
      for(const end of [-1,1]){const points=[];for(let j=0;j<48;j++){const p=solid.center.slice();p[axis]+=end*solid.length/2;p[radial[0]]+=solid.radius*Math.cos(2*Math.PI*j/48);p[radial[1]]+=solid.radius*Math.sin(2*Math.PI*j/48);points.push(VF.localPointToWorld(p,scene.human));}faces.push({points,color:[186,199,215],shade:true});}
    }
    faces.push(...planes);
    function pixel(x,y,z,color){if(x<0||y<0||x>=width||y>=height)return;const i=y*width+x;if(z<depths[i]-1e-8)return;depths[i]=z;const j=i*4;pixels.data[j]=color[0];pixels.data[j+1]=color[1];pixels.data[j+2]=color[2];pixels.data[j+3]=255;}
    function triangle(a,b,c,color){
      const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<1e-10)return;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,u=((b[0]-px)*(c[1]-py)-(b[1]-py)*(c[0]-px))/area,v=((c[0]-px)*(a[1]-py)-(c[1]-py)*(a[0]-px))/area,w=1-u-v;if(u>=-1e-9&&v>=-1e-9&&w>=-1e-9)pixel(x,y,u*a[2]+v*b[2]+w*c[2],color);}
    }
    for(const face of faces){
      const ps=face.points.map(project);let color=face.color;
      if(face.shade){const a=face.points[0],b=face.points[1],c=face.points[2],u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal),light=length?Math.abs((normal[0]*.3+normal[1]*.8+normal[2]*.5)/length):.5;const shade=.74+.26*light;color=color.map(v=>Math.round(v*shade));}
      for(let i=1;i<ps.length-1;i++)triangle(ps[0],ps[i],ps[i+1],color);
    }
    // Borders also use the depth buffer; a hidden edge cannot cut through skin.
    for(const face of planes){if(!face.stroke)continue;const ps=face.points.map(project),radius=(face.lineWidth||2)/2;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],steps=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))*2);for(let s=0;s<=steps;s++){const t=steps?s/steps:0,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;for(let yy=Math.floor(y-radius);yy<=Math.ceil(y+radius);yy++)for(let xx=Math.floor(x-radius);xx<=Math.ceil(x+radius);xx++)if((xx+.5-x)**2+(yy+.5-y)**2<=radius*radius)pixel(xx,yy,z+1e-7,face.stroke);}}}
    ctx.putImageData(pixels,0,0);
  }
  function attachCamera(canvas,camera,draw,options={}){
    const rotate=options.rotateButton??0,pan=options.panButton??null;
    canvas.style.touchAction='none';
    if(rotate===2)canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.button!==rotate&&e.button!==pan)return;e.preventDefault();camera.drag=true;camera.pointerId=e.pointerId;camera.action=e.pointerType==='touch'||e.button===rotate?'rotate':'pan';camera.x=e.clientX;camera.y=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!camera.drag||camera.pointerId!==e.pointerId)return;const dx=e.clientX-camera.x,dy=e.clientY-camera.y;if(camera.action==='pan'){const box=canvas.getBoundingClientRect();camera.panX=(camera.panX||0)+dx/box.width;camera.panY=(camera.panY||0)+dy/box.height;}else{camera.yaw+=dx*.008;camera.pitch=Math.max(-1.1,Math.min(.7,camera.pitch+dy*.006));}camera.x=e.clientX;camera.y=e.clientY;draw();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId!==camera.pointerId)return;camera.drag=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
    canvas.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=Math.max(.55,Math.min(3,camera.zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});
  }
  return {surfacePolygons,projection,drawBody,drawRoom,drawDepthScene,attachCamera};
});
