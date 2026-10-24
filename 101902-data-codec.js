(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VF101902DataCodec=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAGIC=0x56313032,MAX_BYTES=128*1024*1024;
  const NODE=typeof process==='object'&&process.versions?.node;
  // FIPS 180-4 section 6.2; fallback for static HTTP pages without SubtleCrypto.
  function sha256Fallback(bytes){
    const k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
    const view=new DataView(padded.buffer),bits=bytes.length*8;view.setUint32(padded.length-8,Math.floor(bits/4294967296));view.setUint32(padded.length-4,bits>>>0);
    const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64),ror=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let offset=0;offset<padded.length;offset+=64){
      for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(ror(a,7)^ror(a,18)^(a>>>3))+w[i-7]+(ror(b,17)^ror(b,19)^(b>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,j]=h;
      for(let i=0;i<64;i++){const t1=(j+(ror(e,6)^ror(e,11)^ror(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      for(const [i,v] of [a,b,c,d,e,f,g,j].entries())h[i]=(h[i]+v)>>>0;
    }
    return Array.from(h,v=>v.toString(16).padStart(8,'0')).join('');
  }
  async function digest(bytes){
    if(NODE)return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    if(globalThis.crypto?.subtle)return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    return sha256Fallback(bytes);
  }
  function encode(value){
    if(typeof require!=='function')throw new Error('Encoding is a build-time operation');
    const buffers=[];let length=0;
    const add=(data,kind)=>{const offset=Math.ceil(length/8)*8;buffers.push({data,kind,offset});length=offset+data.length;return {$vf101902:buffers.length-1};};
    function walk(v){
      if(Array.isArray(v)&&v.length>=8&&v.every(Number.isFinite)){const b=Buffer.alloc(v.length*8);v.forEach((n,i)=>b.writeDoubleLE(n,i*8));return add(b,'array-f64');}
      if(Array.isArray(v))return v.map(walk);
      if(v&&typeof v==='object'){const out={};for(const [key,item] of Object.entries(v)){if(key==='$vf101902')throw new Error('Reserved record marker');if(key==='massFloat32Base64'){const b=Buffer.from(item,'base64');if(b.length%4)throw new Error('Invalid Float32 cells');out.mass=add(b,'f32-to-f64');}else out[key]=walk(item);}return out;}
      return v;
    }
    const template=walk(value),metadata=Buffer.from(JSON.stringify({template,buffers:buffers.map(({kind,offset,data})=>({kind,offset,bytes:data.length}))})),start=Math.ceil((8+metadata.length)/8)*8,raw=Buffer.alloc(start+length);
    raw.writeUInt32LE(MAGIC,0);raw.writeUInt32LE(metadata.length,4);metadata.copy(raw,8);for(const b of buffers)b.data.copy(raw,start+b.offset);
    return {payload:require('node:zlib').gzipSync(raw,{level:9}).toString('base64'),rawBytes:raw.length,sha256:require('node:crypto').createHash('sha256').update(raw).digest('hex')};
  }
  async function encodeComputed(value){
    if(!NODE&&typeof CompressionStream==='undefined')return null;
    const buffers=[];let length=0;
    function add(values,kind){const offset=Math.ceil(length/8)*8,data=new Uint8Array(values.length*8),view=new DataView(data.buffer);for(let i=0;i<values.length;i++)view.setFloat64(i*8,values[i],true);buffers.push({data,kind,offset});length=offset+data.length;return {$vf101902:buffers.length-1};}
    function walk(v){
      if(v instanceof Float64Array)return add(v,'typed-f64');
      if(Array.isArray(v)&&v.length>=8&&v.every(Number.isFinite))return add(v,'array-f64');
      if(Array.isArray(v))return v.map(walk);
      if(v&&typeof v==='object'){const out={};for(const [key,item] of Object.entries(v)){if(key==='$vf101902')throw new Error('Reserved record marker');if(key==='prefix'&&v.mass instanceof Float64Array)continue;out[key]=walk(item);}return out;}return v;
    }
    const template=walk(value),metadata=new TextEncoder().encode(JSON.stringify({template,buffers:buffers.map(({kind,offset,data})=>({kind,offset,bytes:data.length}))})),start=Math.ceil((8+metadata.length)/8)*8,raw=new Uint8Array(start+length),view=new DataView(raw.buffer);
    if(raw.length>MAX_BYTES)return null;view.setUint32(0,MAGIC,true);view.setUint32(4,metadata.length,true);raw.set(metadata,8);for(const b of buffers)raw.set(b.data,start+b.offset);
    const payload=NODE?new Uint8Array(require('node:zlib').gzipSync(raw,{level:1})):new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    return {payload,rawBytes:raw.length,sha256:await digest(raw)};
  }
  async function decode(payload,expected){
    if(!expected||!Number.isSafeInteger(expected.rawBytes)||expected.rawBytes<8||expected.rawBytes>MAX_BYTES)throw new Error('响应记录大小无效 / invalid size');
    let bytes;
    if(NODE){let b;try{b=require('node:zlib').gunzipSync(typeof payload==='string'?Buffer.from(payload,'base64'):payload,{maxOutputLength:expected.rawBytes});}catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')throw new Error('响应记录大小超出清单 / size mismatch');throw error;}bytes=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);}
    else{
      if(typeof DecompressionStream==='undefined')throw new Error('浏览器缺少gzip解码组件，请使用新版Chrome或Edge');
      const compressed=typeof payload==='string'?Uint8Array.from(atob(payload),c=>c.charCodeAt(0)):payload,reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let total=0;
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>expected.rawBytes){await reader.cancel();throw new Error('响应记录大小超出清单 / size mismatch');}parts.push(value);}
      bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    }
    if(bytes.length!==expected.rawBytes)throw new Error('响应记录大小与清单不符 / size mismatch');
    if(await digest(bytes)!==expected.sha256)throw new Error('响应记录摘要不符 / digest mismatch');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(0,true)!==MAGIC)throw new Error('响应记录格式无效');
    const n=view.getUint32(4,true),start=Math.ceil((8+n)/8)*8;if(8+n>bytes.length||start>bytes.length)throw new Error('响应记录头部截断');
    const header=JSON.parse(new TextDecoder().decode(bytes.subarray(8,8+n))),restored=new Map();
    function restore(v){
      if(v&&typeof v==='object'&&Object.hasOwn(v,'$vf101902')){
        const index=v.$vf101902;if(restored.has(index))return restored.get(index);const b=header.buffers[index];if(!b||!Number.isSafeInteger(b.offset)||!Number.isSafeInteger(b.bytes)||b.offset<0||b.bytes<0||start+b.offset+b.bytes>bytes.length)throw new Error('响应数组越界');
        const a=start+b.offset;let out;
        if(b.kind==='f32-to-f64'&&b.bytes%4===0){out=new Float64Array(b.bytes/4);for(let i=0;i<out.length;i++)out[i]=view.getFloat32(a+4*i,true);}
        else if(b.kind==='array-f64'&&b.bytes%8===0){out=new Array(b.bytes/8);for(let i=0;i<out.length;i++)out[i]=view.getFloat64(a+8*i,true);}
        else if(b.kind==='typed-f64'&&b.bytes%8===0){out=new Float64Array(b.bytes/8);for(let i=0;i<out.length;i++)out[i]=view.getFloat64(a+8*i,true);}
        else throw new Error('响应数组类型无效');restored.set(index,out);return out;
      }
      if(Array.isArray(v))return v.map(restore);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,restore(x)]));return v;
    }
    return restore(header.template);
  }
  return {encode,encodeComputed,decode,sha256Fallback};
});
