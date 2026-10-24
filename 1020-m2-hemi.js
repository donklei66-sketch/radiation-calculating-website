(function(){
  "use strict";
  // Generated display adapter. The original M2 numerical kernel remains unchanged.
function drawM2Hemi(cv,M,P,dir){
  if(!cv)return;
  const W=M.W,D=M.D,H=M.H,{S,wins,panels}=buildRects(M);
  const {rows}=dirVF(M,P,dir);
  const wrap=cv.parentElement, avail=(wrap&&wrap.clientWidth>140)?wrap.clientWidth:340;
  const cw=Math.round(Math.min(avail,330)), pad=Math.max(16,Math.round(cw*0.07));   // 收窄成内嵌小图, 由 CSS 居中
  const raw=[]; for(const x of [0,W])for(const y of [0,D])for(const z of [0,H])raw.push(m2Proj(x,y,z));
  const rxs=raw.map(c=>c[0]),rys=raw.map(c=>c[1]);
  const bw=Math.max(...rxs)-Math.min(...rxs), bh=Math.max(...rys)-Math.min(...rys);
  const ch=Math.max(140,Math.round((bh/bw)*(cw-2*pad)+2*pad));
  const dpr=globalThis.devicePixelRatio||1;
  if(cv.width!==Math.round(cw*dpr)||cv.height!==Math.round(ch*dpr)){
    cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);
    cv.style.width=cw+"px";cv.style.height=ch+"px";}
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);
  const sc=Math.min((cw-2*pad)/bw,(ch-2*pad)/bh);
  const cx0=(Math.max(...rxs)+Math.min(...rxs))/2, cy0=(Math.max(...rys)+Math.min(...rys))/2;
  const OX=cw/2-cx0*sc, OY=ch/2+cy0*sc;
  const pj=p=>{const r=m2Proj(p[0],p[1],p[2]);return [OX+r[0]*sc,OY-r[1]*sc];};
  const quad=(pts,o)=>{ctx.save();ctx.beginPath();
    pts.forEach((p,i)=>{const q=pj(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});
    ctx.closePath();
    if(o.fill){ctx.fillStyle=o.fill;ctx.fill();}
    if(o.stroke){ctx.strokeStyle=o.stroke;ctx.lineWidth=o.lw||1;ctx.setLineDash(o.dash||[]);ctx.stroke();}
    ctx.restore();};
  const tag=(p,txt,col,dx,dy)=>{const q=pj(p);let x=q[0]+dx,y=q[1]+dy;
    ctx.save();ctx.font='600 10.5px system-ui,"Microsoft YaHei",sans-serif';
    const tw=ctx.measureText(txt).width+9;
    x=Math.max(tw/2+2,Math.min(cw-tw/2-2,x));y=Math.max(9,Math.min(ch-9,y));
    ctx.fillStyle="rgba(255,255,255,.93)";ctx.strokeStyle="rgba(79,70,229,.30)";ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x-tw/2,y-8,tw,16,5);ctx.fill();ctx.stroke();
    ctx.fillStyle=col;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(txt,x,y);ctx.restore();};

  // 房间线框
  const V=[[0,0,0],[W,0,0],[W,D,0],[0,D,0],[0,0,H],[W,0,H],[W,D,H],[0,D,H]];
  ctx.save();ctx.strokeStyle="#cbd3dd";ctx.lineWidth=1;
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){
    const a=pj(V[i]),b=pj(V[j]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
  ctx.restore();

  // 逐面: 切掉的画灰虚线, 计入的画强调色
  const labs=[];
  for(const k of ["west","east","south","north","floor","ceiling"]){
    const rect=S[k], clipped=clipRect(P,dir,rect);
    if(!clipped){ quad(rectCorners(rect),{fill:"rgba(148,163,184,.15)",stroke:"#8b9aab",lw:1,dash:[4,3]}); continue; }
    const cut=cutAwayRect(rect,dir,P);
    if(cut)quad(rectCorners(cut),{fill:"rgba(148,163,184,.15)",stroke:"#8b9aab",lw:1,dash:[4,3]});
    const cs=rectCorners(clipped);
    quad(cs,{fill:"rgba(79,70,229,.26)",stroke:"#4f46e5",lw:1.4});
    const F=rows.find(row=>row.name===SURF_CN[k])?.F||0;
    labs.push({F,name:SURF_CN[k],od:outwardOf(rect,W,D,H),
      cen:cs.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4,a[2]+p[2]/4],[0,0,0])});
  }
  // Use the calculation rectangles: panels already exclude windows and earlier panels.
  const styles={
    panel:{fill:"rgba(220,38,38,.22)",stroke:"#dc2626",color:"#b91c1c",faint:"rgba(220,38,38,.035)"},
    window:{fill:"rgba(22,163,74,.22)",stroke:"#168548",color:"#166534",faint:"rgba(22,163,74,.035)"}
  };
  function overlay(rect,kind){
    const style=styles[kind],included=clipRect(P,dir,rect);
    const excluded=included?cutAwayRect(rect,dir,P):rect;
    if(excluded)quad(rectCorners(excluded),{fill:style.faint,stroke:style.stroke,lw:.9,dash:[3,4]});
    if(included)quad(rectCorners(included),{fill:style.fill,stroke:style.stroke,lw:1.5,dash:kind==="panel"?[5,3]:[]});
    return included;
  }
  function surfaceLabel(rects,name,kind,parent){
    const area=rects.reduce((sum,r)=>sum+r.u*r.v,0);
    if(!area)return;
    const cen=rects.reduce((sum,r)=>{
      const center=rectCorners(r).reduce((a,p)=>a.map((v,i)=>v+p[i]/4),[0,0,0]);
      return sum.map((v,i)=>v+center[i]*r.u*r.v/area);
    },[0,0,0]);
    const F=rows.find(row=>row.name===name)?.F||0;
    labs.push({F,name,cen,color:styles[kind].color,od:outwardOf(parent,W,D,H)});
  }
  for(const win of wins){
    const rect=overlay(win,"window");
    if(rect)surfaceLabel([rect],SURF_CN[win.wall]+"窗","window",S[win.wall]);
  }
  for(const panel of panels){
    const rects=panel.parts.map(part=>overlay(part,"panel")).filter(Boolean);
    surfaceLabel(rects,panel.name,"panel",S[panel.wall]);
  }
  if(cv.id==="m2hemi"){
    const output=cv.parentElement;
    const panelNames=new Set(panels.map(p=>p.name)),windowNames=new Set(wins.map(w=>SURF_CN[w.wall]+"窗"));
    for(const cell of output.querySelectorAll(".barlist .nm")){
      cell.querySelector(".m2-surface-swatch")?.remove();
      const kind=panelNames.has(cell.textContent)?"panel":windowNames.has(cell.textContent)?"window":null;
      if(kind){
        const swatch=document.createElement("i");swatch.className="m2-surface-swatch";
        swatch.dataset.kind=kind;swatch.setAttribute("aria-hidden","true");cell.prepend(swatch);
      }
    }
    if(!output.querySelector(".m2-hemi-legend")){
      const legend=document.createElement("div");legend.className="m2-hemi-legend";legend.setAttribute("aria-label","半球示意图图例");
      legend.innerHTML='<span><i data-kind="wall"></i>计入围护面</span><span><i data-kind="panel"></i>辐射面</span><span><i data-kind="window"></i>窗户</span><span><i data-kind="excluded"></i>不计部分</span>';
      cv.before(legend);
    }
    const hint=cv.nextElementSibling;
    if(hint?.classList.contains("hint"))hint.textContent="蓝色为计入该方向半球的围护面，透明红色为辐射面，透明绿色为窗户；淡色虚线表示被切掉、不计入的部分。虚框为过评估点的切平面。表中 F 与图中裁剪区域对应，仅标注贡献最大的三项。";
    cv.setAttribute("role","img");
    cv.setAttribute("aria-label","微元面朝"+DIRS.find(d=>d[1]===dir)[0]+"的半球示意图，"+panels.length+"个辐射面用透明红色，"+wins.length+"扇窗用透明绿色；淡色虚线部分不计入本方向。");
  }

  // 切平面
  const a3=dir[1], vv=P[AX[a3]];
  quad(a3==="z"?[[0,0,vv],[W,0,vv],[W,D,vv],[0,D,vv]]
      :a3==="x"?[[vv,0,0],[vv,D,0],[vv,D,H],[vv,0,H]]
              :[[0,vv,0],[W,vv,0],[W,vv,H],[0,vv,H]],
    {fill:"rgba(79,70,229,.09)",stroke:"#4f46e5",lw:1.5,dash:[6,4]});

  // 只标最大的三片, 免得小字挤满
  labs.sort((a,b)=>b.F-a.F).slice(0,3).forEach(o=>{
    if(o.F<0.02)return;
    const q0=pj(o.cen),q1=pj([o.cen[0]+o.od[0]*0.8,o.cen[1]+o.od[1]*0.8,o.cen[2]+o.od[2]*0.8]);
    const dx=q1[0]-q0[0],dy=q1[1]-q0[1],L=Math.hypot(dx,dy)||1;
    tag(o.cen,o.name+" "+o.F.toFixed(3),o.color||"#4338ca",20*dx/L,20*dy/L);
  });

  // 评估点 + 方向箭头
  const pv=pj(P),dn=DIR_N[dir],len=Math.min(W,D,H)*0.5;
  const tip=pj([P[0]+dn[0]*len,P[1]+dn[1]*len,P[2]+dn[2]*len]);
  const ang=Math.atan2(tip[1]-pv[1],tip[0]-pv[0]);
  ctx.save();ctx.lineCap="round";
  for(const [w2,col] of [[6,"#ffffff"],[2.8,"#4338ca"]]){
    ctx.strokeStyle=col;ctx.lineWidth=w2;
    ctx.beginPath();ctx.moveTo(pv[0],pv[1]);ctx.lineTo(tip[0],tip[1]);ctx.stroke();}
  ctx.fillStyle="#4338ca";ctx.beginPath();ctx.moveTo(tip[0],tip[1]);
  ctx.lineTo(tip[0]-10*Math.cos(ang-0.42),tip[1]-10*Math.sin(ang-0.42));
  ctx.lineTo(tip[0]-10*Math.cos(ang+0.42),tip[1]-10*Math.sin(ang+0.42));
  ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.arc(pv[0],pv[1],4.5,0,7);ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();ctx.restore();

  // 坐标三元组(左下角, 不压箱体)
  ctx.save();ctx.lineWidth=1.6;ctx.lineCap="round";
  ctx.font='600 9.5px system-ui,"Microsoft YaHei",sans-serif';
  ctx.textAlign="left";ctx.textBaseline="middle";
  for(const [[dx2,dy2,dz2],col,txt] of [[[1,0,0],"#d63a4e","东"],[[0,1,0],"#15925a","北"],[[0,0,1],"#4338ca","上"]]){
    const r=m2Proj(dx2,dy2,dz2), ox2=18, oy2=ch-18, s2=18;
    const ex=ox2+r[0]*s2, ey=oy2-r[1]*s2;
    ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(ox2,oy2);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.fillStyle=col;ctx.fillText(txt,ex+4,ey);}
  ctx.restore();
}
  window.drawM2Hemi=drawM2Hemi;
})();
