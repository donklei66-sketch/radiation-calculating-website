(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./101902-integral-core.js'):root.VF10701Integral);if(typeof module==='object'&&module.exports)module.exports=api;else root.VF1020SolarThermal=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const SIGMA=5.670374419e-8,BODY_EMISSIVITY=.95;
  function validateSolar(solar){for(const key of ['idir','asa','alt','az'])if(!Number.isFinite(solar[key]))throw new Error('太阳参数须为有限数值：'+key);if(solar.idir<0||solar.idir>1000)throw new Error('直射法向辐照度须为 0–1000 W/m²');if(solar.asa<0||solar.asa>1)throw new Error('短波吸收率须为 0–1');if(solar.alt<0||solar.alt>90)throw new Error('太阳高度角须为 0–90°');return solar;}
  function windowMap(windows){return new Map(windows.filter(w=>w.kind==='window').map(w=>{const tau=w.tsol??w.transmittance??0;if(!Number.isFinite(tau)||tau<0||tau>1)throw new Error('窗太阳透射率须为 0–1：'+w.id);return [w.id,{...w,tau}];}));}
  function zeroReason(solar,wins){return !solar.on?'太阳关闭':solar.idir===0?'直射辐照度为 0':solar.alt<=0?'太阳位于地平线':!wins.size?'未启用窗':Array.from(wins.values()).every(w=>w.tau===0)?'窗透射率均为 0':null;}
  function scaleResponse(response,solar,windows){
    validateSolar(solar);const wins=windowMap(windows),reason=zeroReason(solar,wins),segments=response.segments.map(r=>{let incidentPower=0,sunlitArea=0;const contributions={};for(const [id,w] of Object.entries(r.windows)){const tau=wins.get(id)?.tau??0,p=reason?0:solar.idir*tau*w.projectedArea,lit=reason||tau===0?0:w.sunlitArea;incidentPower+=p;sunlitArea+=lit;contributions[id]={projectedArea:w.projectedArea,sunlitArea:lit,transmittance:tau,incidentPower:p,absorbedPower:p*solar.asa};}
      const maxTau=Math.max(0,...Array.from(wins.values(),w=>w.tau)),powerError=reason?0:solar.idir*maxTau*r.error.projectedAreaBound,change=reason?0:solar.idir*maxTau*(r.error.projectedAreaChange??r.error.projectedAreaBound);
      return {segment:r.segment,segmentIndex:r.segmentIndex,exposedArea:r.exposedArea,incidentPower,absorbedPower:incidentPower*solar.asa,sunlitArea,sunlitFraction:r.exposedArea>0?sunlitArea/r.exposedArea:null,windows:contributions,error:{incidentPowerBound:powerError,absorbedPowerBound:powerError*solar.asa,incidentPowerChange:change,absorbedPowerChange:change*solar.asa,exposedAreaBound:r.error.exposedAreaBound,sunlitAreaBound:reason?0:r.error.sunlitAreaBound},quality:{passed:reason?true:r.quality.passed&&change<=Math.max(.02,incidentPower*.005)},stats:r.stats};});
    return {version:response.version,geometryKey:response.key,geometryHash:response.geometryHash,direction:response.direction,solar:{...solar},bodyEmissivity:BODY_EMISSIVITY,zeroReason:reason,components:{direct:!solar.on?'disabled':'computed',diffuse:'notComputed',reflected:'notComputed'},segments,quality:{passed:segments.every(r=>r.quality.passed)},stats:response.stats};
  }
  function combine(results,scene,direct){
    const byName=new Map((direct?.segments||[]).map(x=>[x.segment,x])),segments=[];let N=0,D=0,Q=0,E=0,quality=!!direct?.quality?.passed;
    for(const r of results){const d=byName.get(r.segment),m=C.mrt(r,scene),A=r.exposedAreaEstimate,ready=!!d&&m.celsius!==null&&A>0&&m.denominator>0;let combinedMRT=null,delta=null,thermalError=null,areaDifference=null,areaPassed=true;
      if(ready){const change=d.error.absorbedPowerChange??d.error.absorbedPowerBound;combinedMRT=d.absorbedPower===0?m.celsius:((m.numerator+d.absorbedPower/(BODY_EMISSIVITY*SIGMA*A))/m.denominator)**.25-273.15;delta=combinedMRT-m.celsius;thermalError=change===0?0:((m.numerator+(d.absorbedPower+change)/(BODY_EMISSIVITY*SIGMA*A))/m.denominator)**.25-273.15-combinedMRT;
        if(Number.isFinite(d.exposedArea)){areaDifference=Math.abs(d.exposedArea-A);areaPassed=areaDifference<=(d.error.exposedAreaBound||0)+(r.areaErrorRelative||0)*A+1e-8;}
        N+=A*m.numerator;D+=A*m.denominator;Q+=d.absorbedPower;E+=change;
      }
      const passed=ready&&r.quality?.passed!==false&&d.quality.passed&&areaPassed&&thermalError<=.05;quality=quality&&passed;segments.push({segment:r.segment,longwaveMRT:m.celsius,directDMRT:delta,combinedMRT,incidentPower:d?.incidentPower??null,absorbedPower:d?.absorbedPower??null,exposedArea:A,sunlitArea:d?.sunlitArea??null,sunlitFraction:d?d.sunlitArea/A:null,error:{directMRTChange:thermalError,areaDifference,areaPassed},quality:{passed}});
    }
    const complete=results.length===scene.segments.length&&segments.every(r=>r.combinedMRT!==null);let lw=null,eq=null,err=null;
    if(complete){lw=C.wholeMRT(results,scene).celsius;eq=Q===0?lw:((N+Q/(BODY_EMISSIVITY*SIGMA))/D)**.25-273.15;err=E===0?0:((N+(Q+E)/(BODY_EMISSIVITY*SIGMA))/D)**.25-273.15-eq;quality=quality&&err<=.05;}
    return {definition:'epsilon-F weighted environmental MRT plus energy-equivalent transmitted direct solar; diffuse/reflected shortwave not computed',segments,whole:{longwaveMRT:lw,combinedMRT:eq,directDMRT:eq===null?null:eq-lw,absorbedPower:complete?Q:null,refinementChange:err},quality:{passed:quality&&complete,complete}};
  }
  function verificationRecord(response){return {geometryHash:response.geometryHash,integration:response.integration,powerAcceptance:{absoluteWatts:.02,relative:.005},mrtAcceptanceCelsius:.05,quality:response.quality,segments:response.segments.map(r=>({segment:r.segment,nominalArea:r.nominalArea??null,exposedArea:r.exposedArea,error:r.error,quality:r.quality,stats:r.stats||null})),stats:response.stats};}
  function requiresRefinement(direct,combined){return !!direct&&(!direct.quality.passed||!!combined?.segments.some(r=>r.error.directMRTChange>.05||r.error.areaPassed===false));}
  return {SIGMA,BODY_EMISSIVITY,validateSolar,windowMap,zeroReason,scaleResponse,combine,verificationRecord,requiresRefinement};
});
