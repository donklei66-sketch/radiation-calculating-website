(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.VF101902Resources=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function estimateBytes(value,seen=new Set()){
    if(typeof value==='string')return value.length*2;if(typeof value==='number')return 8;if(!value||typeof value!=='object'||seen.has(value))return 0;seen.add(value);
    if(ArrayBuffer.isView(value)){if(seen.has(value.buffer))return 0;seen.add(value.buffer);return value.buffer.byteLength;}
    if(value instanceof ArrayBuffer)return value.byteLength;
    let bytes=48;for(const [k,v] of Object.entries(value))bytes+=k.length*2+estimateBytes(v,seen);return bytes;
  }
  function createByteCache(limit){
    const entries=new Map();let bytes=0,evictions=0;
    function remove(key){const old=entries.get(key);if(old){bytes-=old.bytes;entries.delete(key);}}
    return {get(key){const old=entries.get(key);if(!old)return;entries.delete(key);entries.set(key,old);return old.value;},set(key,value,weight=estimateBytes(value)){remove(key);if(weight>limit)return value;while(bytes+weight>limit&&entries.size){remove(entries.keys().next().value);evictions++;}entries.set(key,{value,bytes:weight});bytes+=weight;return value;},clear(){entries.clear();bytes=0;},stats:()=>({bytes,limit,entries:entries.size,evictions})};
  }
  function createProvider(config={}){
    const C=config.core||root.VF10701Integral,F=config.floor||root.VF10701FloorResponse,validation=config.validation||root.VF10701FloorVerification,manifest=config.manifest||root.VF101902DataManifest,codec=config.codec||root.VF101902DataCodec,densityVersion=config.densityVersion||root.VFSurfaceDensity?.VERSION;
    if(!C||!Array.isArray(manifest?.groups))throw new Error('资源清单缺失，请解压完整101902发布包');
    const groups=new Map(manifest.groups.filter(g=>g.geometryHash===C.MODEL_SPEC.definitionHash&&g.engineVersion===C.VERSION).map(g=>[g.key,new Map(g.segments.map(s=>[s.index,s]))])),floorCache=createByteCache(config.floorBudgetBytes??48*1024*1024),pending=new Map();
    const counts={loadedRecords:0,loadedBytes:0,geometryLoads:0,floorLoads:0,geometryMisses:0};
    async function scriptRecord(item){
      if(!/^101902-data\/[a-z0-9-]+\.js$/.test(item.file))throw new Error('资源路径无效');
      if(typeof importScripts==='function')importScripts(item.file);
      else if(typeof document!=='undefined')await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=item.file;const timer=setTimeout(()=>{script.remove();reject(new Error('资源载入超时'));},15000);script.onload=()=>{clearTimeout(timer);script.remove();resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('资源文件缺失'));};document.head.append(script);});
      else throw new Error('需要提供资源读取器');
      const payload=root.VF101902RawData?.[item.id];if(root.VF101902RawData)delete root.VF101902RawData[item.id];if(typeof payload!=='string')throw new Error('资源记录缺失');return codec.decode(payload,item);
    }
    function record(item,kind){
      if(pending.has(item.id))return pending.get(item.id);
      const promise=Promise.resolve().then(()=>{counts.loadedRecords++;counts.loadedBytes+=item.bytes||0;counts[kind==='geometry'?'geometryLoads':'floorLoads']++;return (config.loadRecord||scriptRecord)(item);}).catch(error=>{throw new Error(item.file+'：'+error.message+'；请使用完整发布目录或ZIP');}).finally(()=>pending.delete(item.id));pending.set(item.id,promise);return promise;
    }
    return {
      async geometry(scene,index){const item=groups.get(C.geometryKey(scene))?.get(index);if(!item){counts.geometryMisses++;return null;}const raw=await record(item,'geometry');if(raw.key!==C.geometryKey(scene)||raw.index!==index||raw.geometryHash!==C.MODEL_SPEC.definitionHash)throw new Error('几何缓存身份与当前工况不匹配');return C.unpackGeometry(raw);},
      async floor(scene,index,hooks={}){
        if(!F||!validation?.passed||validation.geometryHash!==C.MODEL_SPEC.definitionHash||validation.densityVersion!==densityVersion||validation.responseVersion!==F.VERSION||!validation.indices?.includes(index))return null;
        if([scene.human.x,scene.room.width-scene.human.x,scene.human.z,scene.room.depth-scene.human.z].some(x=>x>4+1e-12))return null;
        const base=index>=5&&index%2===1?index-1:index,item=manifest.floors[base];if(!item)return null;let raw=floorCache.get(base);
        if(!raw){const packed=await record(item,'floor');if(packed.geometryHash!==C.MODEL_SPEC.definitionHash||packed.method!==F.VERSION||packed.index!==base||packed.qualification!==validation.verificationSha256)throw new Error('地板响应身份或核查摘要不匹配');raw=F.unpack(packed);floorCache.set(base,raw);}
        if(hooks.cancelled?.())throw new Error('计算已取消');const chosen=raw.index===index?raw:F.mirror(raw,index),pair=F.project(chosen,scene,index);return pair&&F.needsRefinement(pair,scene)?F.refineProjectedPair(scene,index,pair,hooks):pair;
      },
      stats:()=>({...counts,pending:pending.size,floorCache:floorCache.stats()}),clear(){floorCache.clear();}
    };
  }
  return {createByteCache,estimateBytes,createProvider};
});
