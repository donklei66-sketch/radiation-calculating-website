'use strict';
importScripts('vf-model-spec.js','vf-rebuild-core.js','vf-head-wall-pilot.js','101902-surface-density.js','101902-integral-core.js','101902-floor-response.js','10701-floor-verification.js','101902-data-manifest.js','101902-data-codec.js','101902-resource-loader.js','101902-integral-runner.js');
const resources=VF101902Resources.createProvider(),runner=VF10701IntegralRunner.createRunner({geometryProvider:resources.geometry,floorProvider:resources.floor});
let token=0;self.postMessage({type:'ready'});
self.onmessage=async event=>{
  const m=event.data;if(m.type==='cancel'){token++;return;}if(m.type!=='run')return;const mine=++token,cancelled=()=>mine!==token,start=performance.now();let last=0,lastPhase='';
  try{
    await runner.run(m.scene,{...m.options,yieldMs:32},{cancelled,progress:p=>{if(cancelled())return;const phase=p.segment+':'+p.face+':'+p.phase+':'+p.level,now=Date.now();if(now-last>=100||phase!==lastPhase){last=now;lastPhase=phase;self.postMessage({type:'progress',requestId:m.requestId,...p});}},segment:r=>{if(!cancelled())self.postMessage({type:'segment',requestId:m.requestId,result:r});}});
    if(!cancelled())self.postMessage({type:'done',requestId:m.requestId,elapsedMs:performance.now()-start,stats:{runner:runner.stats(),resources:resources.stats()}});
  }catch(error){if(!cancelled())self.postMessage({type:'error',requestId:m.requestId,message:error.message});}
};
