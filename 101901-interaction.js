(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.UI101901Core=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  function createPoints(point){return {linked:true,m1:{...point},m2:{...point}};}
  function editPoint(state,source,axis,raw){
    if(!['m1','m2'].includes(source)||!['x','y','z'].includes(axis)||raw===null||String(raw).trim()==='')return false;
    const value=Number(raw);if(!Number.isFinite(value))return false;
    state[source][axis]=value;if(state.linked)state[source==='m1'?'m2':'m1'][axis]=value;return true;
  }
  function linkPoints(state,linked){state.linked=!!linked;if(state.linked)state.m2={...state.m1};}
  function clampPoints(state,room){
    if(![room.W,room.D,room.H].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid room bounds');
    // An evaluation point on a receiver has an undefined outward hemisphere.
    // Keep a 1 mm interior margin; this constrains coordinates, not the solver.
    const inside=v=>Number((v-.001).toFixed(6));
    let changed=false;for(const point of [state.m1,state.m2])for(const [axis,min,max] of [['x',.001,inside(room.W)],['y',.001,inside(room.D)],['z',.1,inside(room.H)]]){const v=Math.max(min,Math.min(max,point[axis]));changed=changed||v!==point[axis];point[axis]=v;}return changed;
  }
  // The existing M2 routines accept their evaluation point through mx1/my1/z.
  // This adapter supplies M2's point without altering the radiation formulas.
  function modelForM2(model){return {...model,mx1:Number.isFinite(model.mx2)?model.mx2:model.mx1,my1:Number.isFinite(model.my2)?model.my2:model.my1,z:Number.isFinite(model.z2)?model.z2:model.z};}
  return {createPoints,editPoint,linkPoints,clampPoints,modelForM2};
});
