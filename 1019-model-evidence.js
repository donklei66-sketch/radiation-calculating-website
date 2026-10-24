(function () {
  'use strict';
  const data=window.VF1019ModelEvidenceData,card=document.getElementById('seg_model_evidence');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>Number.isFinite(v)?v.toFixed(8):'—';
  function mismatches(){
    if(!data)return ['证据数据未加载'];
    return [[data.geometryHash,window.VFModelSpec?.definitionHash,'人体几何'],[data.engineVersion,window.VF10701Integral?.VERSION,'积分核心'],[data.densityVersion,window.VFSurfaceDensity?.VERSION,'表面密度'],[data.numericalRevision,window.VFSurfaceDensity?.NUMERICAL_REVISION,'积分修订'],[data.floorResponseVersion,window.VF10701FloorResponse?.VERSION,'地板响应']].filter(([a,b])=>!a||a!==b).map(([a,b,label])=>label+'版本不匹配（记录 '+a+'，当前 '+(b||'未加载')+'）');
  }
  function getAssessment(){
    const reasons=mismatches();
    if(!data)return {recordAvailable:false,currentModelMatched:false,currentInputCertified:false,mismatchReasons:reasons};
    const {rows,segmentSummary,...record}=data;
    return JSON.parse(JSON.stringify({...record,recordAvailable:true,currentModelMatched:reasons.length===0,currentInputCertified:false,mismatchReasons:reasons,inputCertification:'Registered benchmark evidence; current design inputs are not independently certified by this record.',runtimeVerification:'Geometry and algorithm version compatibility only; source byte digests were checked at build time.'}));
  }
  // Shared result export reads this established API name. Earlier pages keep their own renderer.
  window.VF1010ModelEvidence=Object.freeze({getAssessment});
  window.VF1019ModelEvidence=window.VF1010ModelEvidence;
  if(!card)return;
  if(!data){card.innerHTML='<h3>计算依据与验证</h3><p>证据数据未加载。请将1019-model-evidence-data.js与网页一同保存，然后刷新。计算功能仍可使用。</p><a href="1019-validation.html">打开验证资料页</a>';return;}
  const reasons=mismatches(),matched=!reasons.length,f=data.evidence.fluent;
  card.innerHTML='<div class="model-evidence-heading"><h3>计算依据与验证</h3><span>'+esc(data.geometryId)+' · 证据更新 '+esc(data.date)+'</span></div>'
    +'<p class="model-evidence-intro">'+esc(data.conclusions.application)+'</p>'
    +(matched?'<p class="model-evidence-state">模型与算法版本兼容；以下为登记基准的验证证据。</p>':'<p class="model-evidence-mismatch">以下为历史记录，不能作为当前版本的验证依据。'+reasons.map(esc).join('；')+'。</p>')
    +'<div class="model-evidence-grid">'
    +'<section><h4>同几何数值校核</h4><b>独立方法与区域校核</b><p>表面积分与独立射线对照，并检查闭合、局部矩形、地板区域可加性和等温MRT。各组记录分别列示。</p></section>'
    +'<section><h4>全身文献对照</h4><b>参考工况的分布支持</b><p>Fanger 128点平均绝对差 '+data.evidence.wholeBody.fanger.mae.toFixed(6)+'；Kubaha 25点 '+data.evidence.wholeBody.kubaha.mae.toFixed(6)+'。Dan六面为不同人体模型的补充参考。</p></section>'
    +'<section><h4>16节段Fluent基准</h4><b>'+f.passedCount+'/'+f.count+'项通过项目经验筛查</b><p>2 × 2 × 2 m，居中朝北，人体到六个整面。平均绝对差 '+fmt(f.mae)+'，最大绝对差 '+fmt(f.maximumAbsolute)+'。</p><p class="model-evidence-limit">采用人体直接发射方向；<a href="1019-validation.html#limits" target="_blank" rel="noopener">SIF对应量及脚部、网格限制</a>见详细说明。</p></section></div>'
    +'<p class="model-evidence-scope">当前结果表的精化变化 ΔF / ΔMRT 表示当前输入的数值稳定性；登记证据不代表当前设计已另用Fluent计算。窗与局部板面的依据见独立区域校核。</p>'
    +'<div class="model-evidence-links"><a href="1019-validation.html#fluent" target="_blank" rel="noopener">查看16节段对照</a><a href="1019-validation.html#literature" target="_blank" rel="noopener">查看全身文献对照</a><a href="1019-validation.html#methods" target="_blank" rel="noopener">方法与适用范围</a></div>'
    +'<p class="model-evidence-foot">节段结果为原始角系数，保留人体自遮挡，六面不强制归一化。全身文献相对角系数采用另一分母；经验筛查限值不构成通用误差保证。</p>';
})();
