(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./101902-integral-core.js'):root.VF10701Integral,node?require('./101902-resource-loader.js'):root.VF101902Resources,node?require('./101902-data-codec.js'):root.VF101902DataCodec);if(node)module.exports=api;else root.VF10701IntegralRunner=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C,R,codec){
  'use strict';
  function createRunner(config={}){
    const cache=R.createByteCache(config.geometryBudgetBytes??16*1024*1024),compressed=R.createByteCache(config.compressedBudgetBytes??96*1024*1024),registered=R.createByteCache(config.registeredBudgetBytes??48*1024*1024);let builds=0,hits=0;
    async function restore(key){const value=cache.get(key)||registered.get(key);if(value)return value;const record=compressed.get(key);return record?C.unpackGeometry(await codec.decode(record.payload,record)):null;}
    return {async run(input,options={},hooks={}){
      const scene=C.validateScene(input),key=C.geometryKey(scene),results=[];
      for(let index=0;index<scene.segments.length;index++){
        if(hooks.cancelled?.())throw new Error('计算已取消');const itemKey=key+'#'+index;let old=cache.get(itemKey),fromRegistered=false;
        let compressedRecord;
        if(!old){compressedRecord=compressed.get(itemKey);if(compressedRecord)old=C.unpackGeometry(await codec.decode(compressedRecord.payload,compressedRecord));}
        if(!old){old=registered.get(itemKey);fromRegistered=!!old;}
        if(!old&&config.geometryProvider){old=await config.geometryProvider(scene,index,hooks);fromRegistered=!!old;}
        if(hooks.cancelled?.())throw new Error('计算已取消');
        if(!old&&scene.segments[index].name.startsWith('r_')){const left=await restore(key+'#'+(index-1));if(hooks.cancelled?.())throw new Error('计算已取消');if(left)old=C.mirrorGeometry(left,scene,index);}
        let geometry=old,result=old?C.evaluateGeometry(old,scene,options):null;
        if(!result||!result.quality.passed){let seed=old;const needsFloor=!old||result.quality.checks.some(check=>!check.passed&&(check.id==='floor'||scene.compiled.byId.get(check.id)?.face==='floor'));
          if(needsFloor&&config.floorProvider){hooks.progress?.({index,segment:scene.segments[index].name,phase:'读取地板响应',face:'floor',level:''});const floor=await config.floorProvider(scene,index,hooks);if(hooks.cancelled?.())throw new Error('计算已取消');if(floor)seed=old?{...old,faces:{...old.faces,floor}}:{key,index,segment:scene.segments[index].name,geometryHash:C.MODEL_SPEC.definitionHash,faces:{floor}};}
          builds++;geometry=await C.buildGeometry(scene,index,options,seed,hooks);fromRegistered=false;if(hooks.cancelled?.())throw new Error('计算已取消');result=C.evaluateGeometry(geometry,scene,options);
        }
        (fromRegistered?registered:cache).set(itemKey,geometry);
        if(!fromRegistered&&(!compressedRecord||geometry!==old)){const record=await codec.encodeComputed(geometry);if(hooks.cancelled?.())throw new Error('计算已取消');if(record)compressed.set(itemKey,record);}
        result.reusedGeometry=geometry===old;if(result.reusedGeometry)hits++;delete result.grids;results.push(result);hooks.segment?.(result,index);await new Promise(resolve=>setTimeout(resolve,0));
      }return results;
    },clear(){cache.clear();compressed.clear();registered.clear();},stats:()=>{const a=cache.stats(),b=registered.stats(),c=compressed.stats();return {builds,hits,geometryCache:{bytes:a.bytes+b.bytes+c.bytes,limit:a.limit+b.limit+c.limit,entries:a.entries+b.entries+c.entries,evictions:a.evictions+b.evictions+c.evictions},computedCache:a,registeredCache:b,compressedCache:c};},cacheSize:()=>cache.stats().entries+registered.stats().entries+compressed.stats().entries};
  }
  return {createRunner};
});
