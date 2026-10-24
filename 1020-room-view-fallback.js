(function(root){
  'use strict';
  function start(options={}){
    const VF=root.VFRebuild,view=root.VF1020SceneView,V=root.VF1020SolarView,status=options.status||(!options.element&&document.getElementById('info'));
    let scene=null,visual=null,selected=options.index??-1,active=options.active??true,queued=0,disposed=false,mode='room',showRays=false;
    const anchor=options.element,holder=anchor?anchor.parentNode:document.body;
    if(!anchor)document.getElementById('view')?.remove();
    const ui=VF1020Viewport.create(holder,{view:value=>{mode=value;Object.assign(camera,{zoom:1,panX:0,panY:0,yaw:-.64,pitch:.28});schedule();},rays:value=>{showRays=value;schedule();}},!!anchor);
    if(anchor){holder.insertBefore(ui.shell,anchor);anchor.hidden=true;anchor.style.display='none';}
    const canvas=document.createElement('canvas');canvas.id=anchor?'seg_room_fallback':'view';canvas.className=anchor?'seg-room-canvas':'';canvas.dataset.renderer='canvas';canvas.setAttribute('aria-label','人体多节段三维模型，可拖动旋转、滚轮缩放');ui.stage.append(canvas);
    const ctx=canvas.getContext('2d'),camera={yaw:-.64,pitch:.28,zoom:1,panX:0,panY:0};
    function schedule(){if(!queued&&!disposed)queued=requestAnimationFrame(draw);}
    function draw(){queued=0;if(disposed||!active||!scene)return;const ratio=Math.min(root.devicePixelRatio||1,1.5),width=Math.max(1,Math.round(ui.stage.clientWidth*ratio)),height=Math.max(1,Math.round(ui.stage.clientHeight*ratio));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;ctx.fillStyle='#f3f4f4';ctx.fillRect(0,0,width,height);
      camera.pitch=Math.max(.04,Math.min(.7,camera.pitch));const bounds=V.bodyBounds(scene),center=mode==='human'?bounds.center:[scene.room.width/2,scene.room.height/2,scene.room.depth/2],span=mode==='human'?Math.max(bounds.size[1]/.60,bounds.size[0]/(width/height)/.72,bounds.size[2]/(width/height)/.72):Math.max(scene.room.width,scene.room.depth,scene.room.height)*1.5,cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),scale=(mode==='human'?height/span:.86*Math.min(width/(Math.abs(cy)*scene.room.width+Math.abs(sy)*scene.room.depth),height/(Math.abs(cp)*scene.room.height+Math.abs(sp)*(Math.abs(sy)*scene.room.width+Math.abs(cy)*scene.room.depth))))*camera.zoom;
      const project=p=>{const dx=p[0]-center[0],dy=p[1]-center[1],dz=p[2]-center[2],rx=cy*dx-sy*dz,depth=sy*dx+cy*dz;return [width/2+rx*scale+camera.panX*width,height/2-(cp*dy-sp*depth)*scale+camera.panY*height,cp*depth+sp*dy,scale];};
      const rendered=V.drawCanvas(ctx,scene,project,visual,selected,view,{showRays});canvas.dataset.rayCount=String(rendered.rayCount);canvas.dataset.sceneReady='true';canvas.dataset.solarReady=String(!!visual);canvas.dataset.sunlitCells=String(visual?.cells.length||0);
      const p=[scene.human.x,.05,scene.human.z],o=project(p),east=project([p[0]+1,p[1],p[2]]),north=project([p[0],p[1],p[2]+1]);ui.compass([east[0]-o[0],east[1]-o[1]],[north[0]-o[0],north[1]-o[1]]);const sun=visual?.sun,point=sun?project(sun.position):[0,0];ui.sunAt(point[0]/ratio,point[1]/ratio,!!sun?.enabled);if(status){status.hidden=true;status.textContent='';}
    }
    function update(raw){try{scene=VF.validateScene(raw);schedule();}catch(error){if(status){status.hidden=false;status.textContent='人体模型显示失败：'+error.message;}}}
    function setSolar(value){visual=value;ui.info(selected,value?.sun);schedule();}
    function select(value){selected=Number(value);ui.info(selected,visual?.sun);schedule();}
    function setActive(value){active=!!value;if(active)schedule();}
    function message(event){if(event.source!==parent||!event.data)return;if(event.data.type==='segment-scene')update(event.data.scene);if(event.data.type==='segment-solar')setSolar(event.data.visual);if(event.data.type==='segment-selected')select(event.data.index);if(event.data.type==='segment-active')setActive(event.data.active);}
    view.attachCamera(canvas,camera,schedule,{rotateButton:0,panButton:2});canvas.addEventListener('contextmenu',e=>e.preventDefault());root.addEventListener('resize',schedule);root.addEventListener('pageshow',schedule);const observer=new ResizeObserver(schedule);observer.observe(ui.stage);
    if(!anchor){root.addEventListener('message',message);parent.postMessage({type:'segment-ready',renderer:'canvas'},'*');}if(options.scene)update(options.scene);ui.info(selected,visual?.sun);
    return {update,select,setSolar,setActive,destroy(){disposed=true;if(queued)cancelAnimationFrame(queued);observer.disconnect();root.removeEventListener('resize',schedule);root.removeEventListener('pageshow',schedule);root.removeEventListener('message',message);ui.destroy();}};
  }
  root.VF10701CanvasRoomView={start};
})(typeof window!=='undefined'?window:globalThis);
