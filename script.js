// JoUTricks GIS Viewer v3
const CONFIG={CREDENTIALS:{username:'jou',password:'tricks'},DEFAULT_CENTER:[24.7,46.7],DEFAULT_ZOOM:6,STORE_KEY:'jou_gis_layers_v3'};

let map=null;
let layers={}; // id -> {id,name,layer,geojson,style,visible}
let selectedLayerId=null;

/* ------------ Auth ------------- */
document.addEventListener('DOMContentLoaded',()=>{
  const auth=sessionStorage.getItem('gisAuth');
  if(auth==='true') showApp();
  else document.getElementById('loginForm').addEventListener('submit',handleLogin);
});
function handleLogin(e){
  e.preventDefault();
  const u=document.getElementById('username').value.trim();
  const p=document.getElementById('password').value.trim();
  const err=document.getElementById('loginError');
  if(u===CONFIG.CREDENTIALS.username && p===CONFIG.CREDENTIALS.password){ sessionStorage.setItem('gisAuth','true'); showApp(); }
  else { err.textContent='❌ خطأ في اسم المستخدم أو كلمة المرور'; }
}
function showApp(){
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('appContainer').classList.remove('hidden');
  document.getElementById('logoutBtn').onclick=()=>{sessionStorage.removeItem('gisAuth');location.reload();};
  document.getElementById('saveSessionBtn').onclick=saveSession;
  document.getElementById('clearSessionBtn').onclick=()=>{localStorage.removeItem(CONFIG.STORE_KEY); alert('تم مسح الجلسة.');};
  initializeMap();
  wireUI();
  restoreSession(); // attempt restore
}

/* ------------ Map ------------- */
function initializeMap(){
  if(map) return;
  map=L.map('map',{center:CONFIG.DEFAULT_CENTER,zoom:CONFIG.DEFAULT_ZOOM});
  const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  const esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20});
  L.control.layers({'خريطة الشارع':osm,'صور جوية':esri}).addTo(map);
  map.on('click',()=>document.getElementById('featureInfo').innerHTML='<p class="empty-message">انقر على عنصر لعرض بياناته</p>');
}

/* ------------ UI ------------- */
function wireUI(){
  const uploadArea=document.getElementById('uploadArea');
  const fileInput=document.getElementById('fileInput');
  uploadArea.onclick=()=>fileInput.click();
  uploadArea.addEventListener('dragover',e=>{e.preventDefault();uploadArea.style.backgroundColor='#ffecc9';});
  uploadArea.addEventListener('dragleave',()=>uploadArea.style.backgroundColor='');
  uploadArea.addEventListener('drop',e=>{e.preventDefault();uploadArea.style.backgroundColor='';handleFileUpload(e.dataTransfer.files);});
  fileInput.addEventListener('change',e=>handleFileUpload(e.target.files));

  document.getElementById('searchBtn').onclick=()=>{
    const f=document.getElementById('searchField').value.trim();
    const v=document.getElementById('searchValue').value.trim();
    searchFeatures(f,v);
  };
  document.getElementById('exportGeoJSONBtn').onclick=exportSelectedAsGeoJSON;
  document.getElementById('exportShpBtn').onclick=exportSelectedAsShapefile;

  document.getElementById('styleApplyBtn').onclick=applyStyleFromModal;
  document.getElementById('styleCancelBtn').onclick=()=>toggleStyleModal(false);
}

/* ------------ Files Handling ------------- */
async function handleFileUpload(files){
  if(!files || !files.length) return;
  const file=files[0];
  const name=file.name.toLowerCase();
  const status=document.getElementById('uploadStatus');
  status.textContent='⏳ جاري المعالجة...';

  try{
    if(name.endsWith('.geojson')||name.endsWith('.json')){
      const text=await file.text();
      addGeoJSONLayer(JSON.parse(text), file.name);
    } else if(name.endsWith('.zip')){
      const buf=await file.arrayBuffer();
      const geo=await shp(buf);
      const fc=Array.isArray(geo)?mergeShpToFC(geo):geo;
      addGeoJSONLayer(fc, file.name.replace('.zip',''));
    } else if(name.endsWith('.kml')||name.endsWith('.kmz')){
      const text=await (name.endsWith('.kmz')?JSZip.loadAsync(file).then(z=>z.file(/\.kml$/i)[0].async('string')):file.text());
      const dom=new DOMParser().parseFromString(text,'text/xml');
      const geo=toGeoJSON.kml(dom);
      addGeoJSONLayer(geo, file.name.replace(/\.(kml|kmz)/,''));
    } else if(name.endsWith('.gpx')){
      const text=await file.text();
      const dom=new DOMParser().parseFromString(text,'text/xml');
      const geo=toGeoJSON.gpx(dom);
      addGeoJSONLayer(geo, file.name.replace('.gpx',''));
    } else if(name.endsWith('.csv')){
      const txt=await file.text();
      const parsed=Papa.parse(txt,{header:true,skipEmptyLines:true});
      const fc=csvToGeoJSON(parsed.data);
      addGeoJSONLayer(fc, file.name.replace('.csv',''));
    } else if(name.endsWith('.topojson')){
      const text=await file.text();
      const topo=JSON.parse(text);
      // convert all objects to a single FeatureCollection
      const fcs=Object.keys(topo.objects).map(k=>topojson.feature(topo, topo.objects[k]));
      const fc=mergeShpToFC(fcs);
      addGeoJSONLayer(fc, file.name.replace('.topojson',''));
    } else if(name.endsWith('.wkt') || name.endsWith('.txt')){
      const text=await file.text();
      const fc=wktToFeatureCollection(text);
      addGeoJSONLayer(fc, file.name);
    } else if(name.endsWith('.gpkg')){
      alert('دعم GeoPackage داخل المتصفح قيد الإضافة (v3.1). يُرجى مؤقتًا تحويله إلى GeoJSON أو Shapefile.');
      status.textContent='⚠️ GeoPackage غير مدعوم حالياً (بيئة المتصفح فقط).';
      return;
    } else {
      status.textContent='❌ صيغة غير مدعومة.'; return;
    }
    status.textContent=`✅ تمت إضافة ${file.name}`;
  }catch(err){
    status.textContent=`❌ خطأ: ${err.message}`;
    console.error(err);
  }
}

function csvToGeoJSON(rows){
  // توقع وجود أعمدة: lat/lon أو y/x أو latitude/longitude (غير حساسة لحالة الأحرف)
  const keys=rows.length?Object.keys(rows[0]).reduce((acc,k)=>{acc[k.toLowerCase()]=k;return acc;},{}):{};
  const latKey=keys['lat']||keys['latitude']||keys['y'];
  const lonKey=keys['lon']||keys['lng']||keys['longitude']||keys['x'];
  if(!latKey||!lonKey) throw new Error('الملف CSV يجب أن يحتوي أعمدة lat/lon أو x/y');
  const features=rows.map(r=>({
    type:'Feature',
    properties:Object.assign({}, r),
    geometry:{type:'Point',coordinates:[parseFloat(r[lonKey]),parseFloat(r[latKey])]}
  })).filter(f=>Number.isFinite(f.geometry.coordinates[0])&&Number.isFinite(f.geometry.coordinates[1]));
  return {type:'FeatureCollection',features};
}

function wktToFeatureCollection(text){
  // يسمح بسطر واحد أو عدة أسطر كل سطر هندسة
  const features=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(w=>{
    try{
      const geom=Terraformer.WKT.parse(w);
      return {type:'Feature',properties:{wkt:w},geometry:geom};
    }catch(_){return null;}
  }).filter(Boolean);
  return {type:'FeatureCollection',features};
}

function mergeShpToFC(arr){
  const all=arr.flatMap(item=>item && item.features ? item.features : []);
  return {type:'FeatureCollection',features:all};
}

/* ------------ Add layer & styles ------------- */
function defaultStyle(){ return {color:'#ff6b6b',weight:2,fillOpacity:0.4,radius:6,shape:'circle'}; }

function addGeoJSONLayer(geojson, name, style={}){
  const id='layer_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const s=Object.assign(defaultStyle(), style);
  const layer=L.geoJSON(geojson,{
    style:()=>({color:s.color,weight:s.weight,opacity:0.95,fillOpacity:s.fillOpacity}),
    pointToLayer:(f,latlng)=> s.shape==='marker' ? L.marker(latlng) :
      L.circleMarker(latlng,{radius:s.radius,fillColor:s.color,color:'#fff',weight:1,fillOpacity:s.fillOpacity}),
    onEachFeature:(f,l)=>{
      const html = '<strong>'+name+'</strong><br>'+Object.entries(f.properties||{}).map(([k,v])=>`<b>${k}</b>: ${v}`).join('<br>');
      l.bindPopup(html);
      l.on('click',()=>displayFeatureInfo(f.properties,name));
    }
  }).addTo(map);

  layers[id]={id,name,layer,geojson,style:s,visible:true};
  updateLayersList();

  try{ const b=layer.getBounds(); if(b.isValid()) map.fitBounds(b,{padding:[24,24]}); }catch(e){}
}

function updateLayersList(){
  const c=document.getElementById('layersList');
  c.innerHTML='';
  const ids=Object.keys(layers);
  if(!ids.length){ c.innerHTML='<p class="empty-message">لا توجد طبقات مضافة</p>'; return; }
  ids.forEach(id=>{
    const ld=layers[id];
    const el=document.createElement('div');
    el.className='layer-item';
    el.innerHTML=`
      <span class="layer-name" style="border-right:4px solid ${ld.style.color};padding-right:8px;">${ld.name}</span>
      <div class="layer-actions">
        <button class="btn small select-btn">${selectedLayerId===id?'✅ محددة':'تحديد'}</button>
        <button class="btn small visibility-btn">${ld.visible?'إخفاء':'إظهار'}</button>
        <button class="btn small style-btn">نمط</button>
        <button class="btn small delete-btn">حذف</button>
      </div>`;
    el.querySelector('.select-btn').onclick=()=>{selectedLayerId=id; updateLayersList();};
    el.querySelector('.visibility-btn').onclick=()=>toggleLayer(id);
    el.querySelector('.delete-btn').onclick=()=>deleteLayer(id);
    el.querySelector('.style-btn').onclick=()=>openStyleModal(id);
    c.appendChild(el);
  });
}

function toggleLayer(id){
  const ld=layers[id]; if(!ld) return;
  if(ld.visible){ map.removeLayer(ld.layer); ld.visible=false; } else { map.addLayer(ld.layer); ld.visible=true; }
  updateLayersList();
}
function deleteLayer(id){
  const ld=layers[id]; if(!ld) return;
  map.removeLayer(ld.layer); delete layers[id];
  if(selectedLayerId===id) selectedLayerId=null;
  updateLayersList();
}

function openStyleModal(id){
  const ld=layers[id]; if(!ld) return;
  selectedLayerId=id;
  document.getElementById('styleColor').value = ld.style.color;
  document.getElementById('styleWeight').value = ld.style.weight;
  document.getElementById('styleFill').value = ld.style.fillOpacity;
  document.getElementById('styleRadius').value = ld.style.radius;
  document.getElementById('styleShape').value = ld.style.shape;
  toggleStyleModal(true);
}
function toggleStyleModal(show){
  document.getElementById('styleModal').classList[show?'remove':'add']('hidden');
}
function applyStyleFromModal(){
  const id=selectedLayerId; const ld=layers[id]; if(!ld) return;
  const s={
    color:document.getElementById('styleColor').value,
    weight:parseInt(document.getElementById('styleWeight').value,10),
    fillOpacity:parseFloat(document.getElementById('styleFill').value),
    radius:parseInt(document.getElementById('styleRadius').value,10),
    shape:document.getElementById('styleShape').value
  };
  ld.style=s;
  map.removeLayer(ld.layer);
  addGeoJSONLayer(ld.geojson, ld.name, s);
  delete layers[id]; // old entry
  toggleStyleModal(false);
}

/* ------------ Info & Search ------------- */
function displayFeatureInfo(props,name){
  const info=document.getElementById('featureInfo');
  if(!props || !Object.keys(props).length){ info.innerHTML='<p class="empty-message">لا توجد معلومات</p>'; return; }
  let html=`<div><strong style="color:#667eea">الطبقة:</strong> ${name}</div>`;
  Object.entries(props).forEach(([k,v])=>{ html+=`<div><b>${k}:</b> ${v}</div>`; });
  info.innerHTML=html;
}
function searchFeatures(field,value){
  const status=document.getElementById('searchStatus');
  if(!field||!value){ status.textContent='أدخل اسم الحقل وقيمة البحث.'; return; }
  let found=false;
  Object.values(layers).forEach(ld=>{
    ld.layer.eachLayer(l=>{
      const p=l.feature && l.feature.properties;
      if(p && p[field]!==undefined && String(p[field]).toLowerCase().includes(value.toLowerCase())){
        found=true;
        if(l.getBounds) map.fitBounds(l.getBounds(),{padding:[24,24]});
        else if(l.getLatLng) map.setView(l.getLatLng(),14);
        l.openPopup && l.openPopup();
        displayFeatureInfo(p, ld.name);
      }
    });
  });
  status.textContent=found?'✅ تم العثور على نتائج.':'⚠️ لا توجد نتائج.';
  setTimeout(()=>status.textContent='',2500);
}

/* ------------ Session (LocalStorage) ------------- */
function saveSession(){
  const items=Object.values(layers).map(ld=>({name:ld.name,style:ld.style,geojson:ld.geojson}));
  const view={center:map.getCenter(),zoom:map.getZoom()};
  const payload={items,view,ts:Date.now()};
  localStorage.setItem(CONFIG.STORE_KEY, JSON.stringify(payload));
  alert('تم حفظ الجلسة على هذا الجهاز.');
}
function restoreSession(){
  try{
    const raw=localStorage.getItem(CONFIG.STORE_KEY);
    if(!raw) return;
    const {items,view}=JSON.parse(raw);
    if(Array.isArray(items)) items.forEach(it=>addGeoJSONLayer(it.geojson,it.name,it.style));
    if(view && view.center) map.setView([view.center.lat,view.center.lng], view.zoom||CONFIG.DEFAULT_ZOOM);
  }catch(e){ console.warn('restore failed', e); }
}

/* ------------ Export ------------- */
function getSelectedLayer(){
  if(!selectedLayerId){ alert('اختر طبقة أولًا من القائمة.'); return null; }
  const ld=layers[selectedLayerId]; if(!ld){ alert('لا توجد طبقة محددة.'); return null; }
  return ld;
}
function exportSelectedAsGeoJSON(){
  const ld=getSelectedLayer(); if(!ld) return;
  const data='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(ld.geojson));
  const a=document.createElement('a'); a.href=data; a.download=(ld.name||'layer')+'.geojson'; a.click();
}
function exportSelectedAsShapefile(){
  const ld=getSelectedLayer(); if(!ld) return;
  try{
    shpwrite.download(ld.geojson, {file: (ld.name||'layer').toString().replace(/\.[^/.]+$/,'')});
  }catch(e){
    alert('تعذر إنشاء Shapefile لهذا النوع من البيانات. يدعم النقاط والخطوط والمضلعات فقط.');
  }
}
document.getElementById('styleCancelBtn').addEventListener('click', () => toggleStyleModal(false));
