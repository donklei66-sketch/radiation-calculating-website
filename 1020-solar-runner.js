(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./1020-direct-solar.js'):root.VF1020DirectSolar,node?require('./1020-solar-thermal.js'):root.VF1020SolarThermal);if(node)module.exports=api;else root.VF1020SolarRunner=api;})(typeof globalThis!=='undefined'?globalThis:this,function(S,T){
  'use strict';
  function createRunner({budgetBytes=32*1024*1024}={}){
    const cache=new Map();let bytes=0,builds=0,hits=0;
    return {async run(scene,solar,options={},hooks={}){
      T.validateSolar(solar);if(hooks.cancelled?.())throw new Error('直射计算已取消');
      const key=S.geometryKey(scene,solar,options),windows=scene.compiled?.overlays||scene.regions||[],reason=T.zeroReason(solar,T.windowMap(windows));
      if(reason){const response={version:S.VERSION,geometryHash:S.MODEL_HASH,key,direction:S.sunDirection(solar),integration:{...S.integrationSettings(options),method:'exact zero shortcut',applied:false,reason},segments:scene.segments.map((s,index)=>({segment:s.name,segmentIndex:index,exposedArea:null,windows:{},error:{projectedAreaBound:0,projectedAreaChange:0,exposedAreaBound:0,exposedAreaChange:0,sunlitAreaBound:0,sunlitAreaChange:0},quality:{passed:true,zeroShortcut:true}})),quality:{passed:true},stats:{elapsedMs:0,cells:0,zeroReason:reason}};return {response,direct:T.scaleResponse(response,solar,windows)};}
      let record=cache.get(key),response;
      if(record){hits++;cache.delete(key);cache.set(key,record);response=record.value;}else{builds++;response=await S.buildResponse(scene,solar,options,hooks);if(hooks.cancelled?.())throw new Error('直射计算已取消');const size=JSON.stringify(response).length*2;if(size<=budgetBytes){while(bytes+size>budgetBytes&&cache.size){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}cache.set(key,{value:response,bytes:size});bytes+=size;}}
      return {response,direct:T.scaleResponse(response,solar,scene.compiled?.overlays||scene.regions||[])};
    },stats(){return {bytes,budgetBytes,entries:cache.size,builds,hits};},clear(){cache.clear();bytes=0;}};
  }
  return {createRunner};
});
