(function(root){
  'use strict';
  const names=['头部','胸部','背部','腹部','左上臂','右上臂','左前臂','右前臂','左手','右手','左大腿','右大腿','左小腿','右小腿','左足','右足'];
  function create(container,handlers={},embedded=false){
    const shell=document.createElement('section');shell.className='vf-viewport'+(embedded?' vf-embedded':'');
    shell.setAttribute('aria-label','人体受照分布三维视图');
    shell.innerHTML='<div class="vf-view-toolbar"><div class="vf-view-switch" role="group" aria-label="三维视角"><button type="button" data-view="human" aria-pressed="false">人体视角</button><button type="button" data-view="room" aria-pressed="true">房间全景</button></div><label class="vf-ray-toggle"><input type="checkbox">显示光路</label></div><div class="vf-view-stage"><div class="vf-view-info" aria-live="polite"><p class="vf-current"><i></i><span>当前节段：未选择</span></p><p class="vf-sun-angles">太阳状态读取中</p></div><div class="vf-sun-marker" hidden><i></i><span>太阳</span></div><svg class="vf-compass" viewBox="0 0 110 90" aria-label="东与北方向"><g fill="none" stroke="currentColor" stroke-width="1.6"><path data-axis="east"/><path data-axis="north"/></g><text data-label="east">东 E</text><text data-label="north">北 N</text></svg><div class="vf-gesture">拖动旋转 · 滚轮缩放</div></div><div class="vf-view-legend"><span><i class="vf-neutral"></i>未受直射</span><span><i class="vf-selected"></i>当前节段</span><span><i class="vf-lit"></i>透窗直射</span></div>';
    container.append(shell);const stage=shell.querySelector('.vf-view-stage'),buttons=[...shell.querySelectorAll('[data-view]')],rays=shell.querySelector('input'),marker=shell.querySelector('.vf-sun-marker');
    buttons.forEach(button=>button.onclick=()=>{setMode(button.dataset.view);handlers.view?.(button.dataset.view);});rays.onchange=()=>handlers.rays?.(rays.checked);
    function setMode(mode){buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===mode)));}
    function info(index,sun){shell.querySelector('.vf-current span').textContent='当前节段：'+(names[index]||'未选择');shell.querySelector('.vf-current').classList.toggle('is-empty',!names[index]);shell.querySelector('.vf-sun-angles').textContent=sun?.enabled?'太阳高度角 '+sun.alt+'° · 方位角 '+sun.az+'°':sun?'太阳直射未启用':'等待太阳结果';rays.disabled=!sun?.enabled;if(!sun?.enabled)marker.hidden=true;}
    function sunAt(x,y,visible){marker.hidden=!visible;if(!visible)return;const w=stage.clientWidth,h=stage.clientHeight;marker.style.left=Math.max(28,Math.min(w-68,x))+'px';marker.style.top=Math.max(32,Math.min(h-70,y))+'px';}
    function compass(east,north){for(const [key,vector] of [['east',east],['north',north]]){const length=Math.hypot(...vector)||1,dx=vector[0]/length*29,dy=vector[1]/length*29,x=49+dx,y=48+dy,ux=dx/29,uy=dy/29;stage.querySelector('[data-axis='+key+']').setAttribute('d','M49 48L'+x+' '+y+'M'+(x-ux*6-uy*3)+' '+(y-uy*6+ux*3)+'L'+x+' '+y+'L'+(x-ux*6+uy*3)+' '+(y-uy*6-ux*3));const label=stage.querySelector('[data-label='+key+']');label.setAttribute('x',x+dx/29*13);label.setAttribute('y',y+dy/29*12+4);label.setAttribute('text-anchor',Math.abs(dx)<8?'middle':dx>0?'start':'end');}}
    return {shell,stage,info,sunAt,compass,setMode,rays,destroy:()=>shell.remove()};
  }
  root.VF1020Viewport={create};
})(typeof window!=='undefined'?window:globalThis);
