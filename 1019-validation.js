(function(){
  'use strict';
  const segment=document.getElementById('segment-filter'),face=document.getElementById('face-filter'),reset=document.getElementById('reset-filters'),count=document.getElementById('row-count'),rows=[...document.querySelectorAll('[data-direct-row]')];
  if(!segment||!face||!count)return;
  function apply(){let visible=0;for(const row of rows){row.hidden=!(segment.value==='all'||row.dataset.segment===segment.value)||!(face.value==='all'||row.dataset.face===face.value);if(!row.hidden)visible++;}count.textContent='显示'+visible+' / '+rows.length+'项';}
  segment.addEventListener('change',apply);face.addEventListener('change',apply);reset.addEventListener('click',()=>{segment.value='all';face.value='all';apply();});apply();
})();
