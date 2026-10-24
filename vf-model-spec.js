(function(root,factory){
  const spec=factory();
  if(typeof module==='object'&&module.exports)module.exports=spec;
  else root.VFModelSpec=spec;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function deepFreeze(value){
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}
    return value;
  }

  const types={
    head:{shape:'sphere',radius:.0955,length:null,paperArea:.1146},
    chest:{shape:'cylinder',radius:.1419,length:.26,paperArea:null,source:'project front half of the published large torso cylinder'},
    back:{shape:'cylinder',radius:.1419,length:.26,paperArea:null,source:'project rear half of the same large torso cylinder'},
    abdomen:{shape:'cylinder',radius:.1319,length:.29,paperArea:.2362,paperName:'pelvis'},
    upperarm:{shape:'cylinder',radius:.0382,length:.30,paperArea:.0718},
    forearm:{shape:'cylinder',radius:.0303,length:.25,paperArea:.0471,paperName:'lower arm'},
    hand:{shape:'cylinder',radius:.0241,length:.18,paperArea:.0273},
    thigh:{shape:'cylinder',radius:.0729,length:.36,paperArea:.1645},
    leg:{shape:'cylinder',radius:.0515,length:.35,paperArea:.1146,paperName:'calf'},
    foot:{shape:'cylinder',radius:.0307,length:.26,paperArea:.0492}
  };

  const segments=[
    {name:'head',type:'head',center:[0,1.17871,0],axis:null},
    {name:'chest',type:'chest',center:[0,.8314,0],axis:'y',solidId:'torso',emitter:{phiStart:-Math.PI/2,phiSweep:Math.PI},occlusionParts:[{name:'neck',shape:'cylinder',offset:[0,.19,0],axis:'y',radius:.0605,length:.12,emits:false}]},
    {name:'back',type:'back',center:[0,.8314,0],axis:'y',solidId:'torso',emitter:{phiStart:Math.PI/2,phiSweep:Math.PI}},
    {name:'abdomen',type:'abdomen',center:[0,.5564,0],axis:'y'},
    {name:'l_upperarm',type:'upperarm',center:[0,.8114,.2],axis:'y'},
    {name:'r_upperarm',type:'upperarm',center:[0,.8114,-.2],axis:'y'},
    {name:'l_forearm',type:'forearm',center:[0,.5364,.2],axis:'y'},
    {name:'r_forearm',type:'forearm',center:[0,.5364,-.2],axis:'y'},
    {name:'l_hand',type:'hand',center:[0,.3214,.2],axis:'y'},
    {name:'r_hand',type:'hand',center:[0,.3214,-.2],axis:'y'},
    {name:'l_thigh',type:'thigh',center:[.3119,.4843,.09],axis:'x'},
    {name:'r_thigh',type:'thigh',center:[.3119,.4843,-.09],axis:'x'},
    {name:'l_leg',type:'leg',center:[.4404,.2365,.09],axis:'y'},
    {name:'r_leg',type:'leg',center:[.4404,.2365,-.09],axis:'y'},
    {name:'l_foot',type:'foot',center:[.5189,.0307,.09],axis:'x'},
    {name:'r_foot',type:'foot',center:[.5189,.0307,-.09],axis:'x'}
  ];

  return deepFreeze({
    schemaVersion:2,
    geometryId:'VF16-S2.0',
    definitionHash:'sha256:3C06964EABFEEC8BE42682588A5C5A76B2F5C1D38F23BD937A88AEE15788D317',
    hashScope:'SHA-256 of JSON.stringify({schemaVersion,geometryId,postureId,referenceHeight,coordinateSystem,emittingSurface,occludingSurface,chairOcclusion,footFloorContact,types,segments})',
    displayName:'胸背分面的独立几何多节段坐姿模型',
    postureId:'product-seated-v2',
    referenceHeight:0.6,
    coordinateSystem:{x:'body forward',y:'up',z:'body left'},
    dimensionSource:'Zeng et al. (2024), Table 1 primitive dimensions; front/rear torso segmentation is a declared project assumption, not a reproduction of the paper chest row',
    postureSource:'project-defined posture initialized from the author public display GLB and frozen for independent validation',
    emittingSurface:'sphere and cylinder lateral surfaces; chest/back partition one torso lateral surface into front/rear halves without duplication; buried points excluded; neck is an auxiliary blocker, not an emitting chest segment',
    occludingSurface:'unique physical sphere/cylinder solids with end caps; shared torso plus auxiliary neck; first-hit torso receiver classified by front/rear half',
    limitations:['Own surface segmentation and posture, not the unpublished CFD mesh or original fitted local factors','Cylinder end caps and the auxiliary neck are blockers only; whole-body MRT represents the 16 declared emitting patches, not every square centimetre of skin','Curved chest/back patches can see the opposite room wall near their side edges; exact zero is a property of a single planar emitter, not of an entire half-cylinder','Pelvis retains the published lower-torso cylinder size and project position; abdominal subdivisions and chair occlusion are not resolved'],
    chairOcclusion:false,
    footFloorContact:true,
    types,
    segments
  });
});
