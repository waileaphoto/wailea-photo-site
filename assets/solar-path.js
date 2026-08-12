(function(){
  const study=document.querySelector('[data-solar-study]');
  if(!study)return;

  const LAT=20.6685,LON=-156.4425,RAD=Math.PI/180,DEG=180/Math.PI,ZENITH=90.833;
  const pad=n=>String(n).padStart(2,'0');
  const hawaiiParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Pacific/Honolulu',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const today=`${hawaiiParts.year}-${hawaiiParts.month}-${hawaiiParts.day}`;
  const normalize=degrees=>((degrees%360)+360)%360;

  function solarHour(isSunrise,dayOfYear){
    const longitudeHour=LON/15;
    const approximate=dayOfYear+((isSunrise?6:18)-longitudeHour)/24;
    const meanAnomaly=.9856*approximate-3.289;
    let longitude=meanAnomaly+1.916*Math.sin(meanAnomaly*RAD)+.02*Math.sin(2*meanAnomaly*RAD)+282.634;
    longitude=normalize(longitude);
    let rightAscension=normalize(DEG*Math.atan(.91764*Math.tan(longitude*RAD)));
    rightAscension+=Math.floor(longitude/90)*90-Math.floor(rightAscension/90)*90;
    rightAscension/=15;
    const sinDeclination=.39782*Math.sin(longitude*RAD);
    const cosDeclination=Math.cos(Math.asin(sinDeclination));
    const cosHour=(Math.cos(ZENITH*RAD)-sinDeclination*Math.sin(LAT*RAD))/(cosDeclination*Math.cos(LAT*RAD));
    if(cosHour>1||cosHour<-1)return null;
    const hour=(isSunrise?360-DEG*Math.acos(cosHour):DEG*Math.acos(cosHour))/15;
    return normalize((hour+rightAscension-.06571*approximate-6.622-longitudeHour)*15)/15;
  }

  function hstMinutes(utcHour){return Math.round(utcHour*60)-600;}
  function format(minutes){
    minutes=((minutes%1440)+1440)%1440;
    const hour=Math.floor(minutes/60),minute=minutes%60;
    return `${hour%12||12}:${pad(minute)} ${hour>=12?'PM':'AM'}`;
  }
  const range=(start,end)=>`${format(start)}–${format(end)}`;
  const input=study.querySelector('[data-solar-date-input]');
  const todayButton=study.querySelector('[data-solar-today]');

  function render(value){
    const [year,month,day]=value.split('-').map(Number);
    const date=new Date(Date.UTC(year,month-1,day));
    const dayOfYear=Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,1))/86400000)+1;
    const sunriseUtc=solarHour(true,dayOfYear),sunsetUtc=solarHour(false,dayOfYear);
    if(sunriseUtc===null||sunsetUtc===null)return;
    const sunrise=hstMinutes(sunriseUtc),sunset=hstMinutes(sunsetUtc);
    study.querySelectorAll('[data-solar-sunrise]').forEach(el=>{el.textContent=range(sunrise+10,sunrise+30);});
    study.querySelectorAll('[data-solar-first-half]').forEach(el=>{el.textContent=range(sunset-95,sunset-65);});
    study.querySelectorAll('[data-solar-last-half]').forEach(el=>{el.textContent=range(sunset-30,sunset);});
    study.querySelector('[data-solar-date]').textContent=new Intl.DateTimeFormat('en-US',{
      timeZone:'UTC',month:'long',day:'numeric',year:'numeric'
    }).format(date);
    input.value=value;
    todayButton.hidden=value===today;
  }

  input.min=today;
  input.value=today;
  input.addEventListener('change',()=>{if(input.value)render(input.value);});
  todayButton.addEventListener('click',()=>render(today));
  render(today);
})();
