// Configuration
const CONFIG = {
    CREDENTIALS: { username: 'jou', password: 'tricks' },
    DEFAULT_CENTER: [30.0444, 31.2357],
    DEFAULT_ZOOM: 5
};

let map = null;
let layers = {}; // { id: { name, layer, visible, geojson } }

// Temporary storage when uploading and styling
let tempGeoJSON = null;
let tempLayerName = '';

/* ----------------- AUTH ----------------- */
function initializeAuth() {
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);

    if (sessionStorage.getItem('gisAuth') === 'true') {
        showApp();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const err = document.getElementById('loginError');

    if (username === CONFIG.CREDENTIALS.username && password === CONFIG.CREDENTIALS.password) {
        sessionStorage.setItem('gisAuth', 'true');
        err.textContent = '';
        showApp();
    } else {
        err.textContent = '❌ اسم المستخدم أو كلمة المرور خاطئ. حاول مرة أخرى.';
        err.classList.add('show');
        setTimeout(() => err.classList.remove('show'), 3000);
    }
}

function showApp() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('logoutBtn').style.display = 'inline-block';
    initializeMap();
    attachEventListeners();
}

document.getElementById && document.addEventListener('DOMContentLoaded', initializeAuth);

/* ----------------- MAP ----------------- */
function initializeMap() {
    if (map) return;
    map = L.map('map', { center: CONFIG.DEFAULT_CENTER, zoom: CONFIG.DEFAULT_ZOOM });

    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 20
    });

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    });

    sat.addTo(map);
    L.control.layers({ 'صور جوية': sat, 'خريطة الشارع': osm }, {}, { position: 'topleft' }).addTo(map);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    map.on('click', () => {
        // hide feature info if clicked outside features
        document.getElementById('featureInfo').innerHTML = '<p class="empty-message">انقر على عنصر لعرض معلوماته هنا</p>';
    });
}

/* ----------------- UI & EVENTS ----------------- */
function attachEventListeners() {
    // Upload area
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.backgroundColor = '#dde8ff'; });
    uploadArea.addEventListener('dragleave', () => uploadArea.style.backgroundColor = '');
    uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.style.backgroundColor = ''; handleFileUpload(e.dataTransfer.files); });

    fileInput.addEventListener('change', (e) => handleFileUpload(e.target.files));

    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('gisAuth');
        location.reload();
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => map.zoomOut());
    document.getElementById('resetMapBtn').addEventListener('click', () => map.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM));
    document.getElementById('clearLayersBtn').addEventListener('click', clearAllLayers);

    document.getElementById('searchBtn').addEventListener('click', () => {
        const field = document.getElementById('searchField').value.trim();
        const value = document.getElementById('searchValue').value.trim();
        searchFeatures(field, value);
    });
}

/* ----------------- File handling ----------------- */
function handleFileUpload(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const status = document.getElementById('uploadStatus');
    status.textContent = '⏳ جاري المعالجة...';

    if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const geo = JSON.parse(e.target.result);
                addGeoJSONLayer(geo, file.name, getDefaultStyle());
                status.textContent = `✅ تمت إضافة ${file.name}`;
            } catch (err) {
                status.textContent = `❌ خطأ: ${err.message}`;
            }
        };
        reader.readAsText(file);
    } else if (file.name.endsWith('.zip')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arr = e.target.result;
                const geo = await shp(arr);
                // shp may return array of layers -> unify to FeatureCollection
                const fc = Array.isArray(geo) ? mergeShpToFC(geo) : geo;
                addGeoJSONLayer(fc, file.name.replace('.zip',''), getDefaultStyle());
                status.textContent = `✅ تمت إضافة ${file.name}`;
            } catch (err) {
                status.textContent = `❌ خطأ: ${err.message}`;
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        status.textContent = '❌ صيغة غير مدعومة';
    }
}

function mergeShpToFC(arr) {
    // flatten features arrays
    const allFeatures = arr.flatMap(item => item.features ? item.features : []);
    return { type: 'FeatureCollection', features: allFeatures };
}

/* ----------------- Styles & Add Layer ----------------- */
function getDefaultStyle() {
    return { color: '#ff6b6b', weight: 2, fillOpacity: 0.4, radius: 6, shape: 'circle' };
}

function addGeoJSONLayer(geojson, layerName, style = {}) {
    const layerId = `layer_${Date.now()}`;
    const appliedStyle = Object.assign(getDefaultStyle(), style);

    const geoLayer = L.geoJSON(geojson, {
        style: feature => ({
            color: appliedStyle.color,
            weight: appliedStyle.weight,
            opacity: 0.9,
            fillOpacity: appliedStyle.fillOpacity
        }),
        pointToLayer: (feature, latlng) => {
            if (appliedStyle.shape === 'marker') {
                return L.marker(latlng);
            } else if (appliedStyle.shape === 'circle') {
                return L.circleMarker(latlng, {
                    radius: appliedStyle.radius,
                    fillColor: appliedStyle.color,
                    color: '#fff',
                    weight: 1,
                    fillOpacity: appliedStyle.fillOpacity
                });
            } else {
                return L.circleMarker(latlng, {
                    radius: appliedStyle.radius,
                    fillColor: appliedStyle.color,
                    color: appliedStyle.color,
                    weight: 1,
                    fillOpacity: appliedStyle.fillOpacity
                });
            }
        },
        onEachFeature: (feature, layer) => {
            let popup = `<strong>${layerName}</strong><br/>`;
            if (feature.properties) {
                Object.entries(feature.properties).forEach(([k,v]) => {
                    popup += `<strong>${k}:</strong> ${v}<br/>`;
                });
            }
            layer.bindPopup(popup);
            layer.on('click', () => displayFeatureInfo(feature.properties, layerName));
        }
    }).addTo(map);

    layers[layerId] = { id: layerId, name: layerName, layer: geoLayer, geojson: geojson, visible: true, style: appliedStyle };
    updateLayersList();

    try {
        if (geoLayer.getBounds && geoLayer.getBounds().isValid()) {
            map.fitBounds(geoLayer.getBounds(), { padding: [30,30] });
        }
    } catch(e){ console.warn('fitBounds failed', e); }
}

/* ----------------- Layers list UI ----------------- */
function updateLayersList() {
    const container = document.getElementById('layersList');
    container.innerHTML = '';
    if (Object.keys(layers).length === 0) {
        container.innerHTML = '<p class="empty-message">لا توجد طبقات مضافة</p>';
        return;
    }
    Object.values(layers).forEach(ld => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.innerHTML = `
            <span class="layer-name" style="border-right:4px solid ${ld.style.color}; padding-right:8px;">${ld.name}</span>
            <div class="layer-actions">
                <button class="layer-btn layer-toggle">${ld.visible ? 'إخفاء' : 'إظهار'}</button>
                <button class="layer-btn layer-style">تعديل النمط</button>
                <button class="layer-btn layer-delete">حذف</button>
            </div>
        `;
        // actions
        item.querySelector('.layer-toggle').addEventListener('click', () => toggleLayer(ld.id));
        item.querySelector('.layer-delete').addEventListener('click', () => deleteLayer(ld.id));
        item.querySelector('.layer-style').addEventListener('click', () => openStyleEditor(ld.id));

        container.appendChild(item);
    });
}

function toggleLayer(id) {
    const ld = layers[id];
    if (!ld) return;
    if (ld.visible) {
        map.removeLayer(ld.layer);
        ld.visible = false;
    } else {
        map.addLayer(ld.layer);
        ld.visible = true;
    }
    updateLayersList();
}

function deleteLayer(id) {
    const ld = layers[id];
    if (!ld) return;
    map.removeLayer(ld.layer);
    delete layers[id];
    updateLayersList();
}

/* ----------------- Style Editor (Modal-lite) ----------------- */
function openStyleEditor(layerId) {
    const ld = layers[layerId];
    if (!ld) return;

    // Build a small prompt UI (simple prompt using prompt() for brevity)
    // For production, you can create a nice modal; here keep it simple and explain in video.
    const color = prompt('اختر لون الطبقة (hex) مثل #FF0000:', ld.style.color) || ld.style.color;
    const weight = parseInt(prompt('سماكة الخط (weight):', ld.style.weight),10) || ld.style.weight;
    const fillOpacity = parseFloat(prompt('إشفافية التعبئة (0-1):', ld.style.fillOpacity)) || ld.style.fillOpacity;
    const radius = parseInt(prompt('حجم نقاط (radius):', ld.style.radius),10) || ld.style.radius;
    const shape = prompt('شكل النقاط: circle / marker', ld.style.shape || 'circle') || ld.style.shape;

    // update style in object and re-create layer
    ld.style = { color, weight, fillOpacity, radius, shape };
    // remove and re-add layer
    map.removeLayer(ld.layer);
    addGeoJSONLayer(ld.geojson, ld.name, ld.style);
    // delete old ld entry (the new add creates another id) - remove previous one
    delete layers[layerId];
    updateLayersList();
}

/* ----------------- Feature info ----------------- */
function displayFeatureInfo(properties, layerName) {
    const info = document.getElementById('featureInfo');
    if (!properties || Object.keys(properties).length === 0) {
        info.innerHTML = '<p class="empty-message">لا توجد معلومات</p>';
        return;
    }
    let html = `<div class="feature-property"><strong style="color:#667eea">الطبقة:</strong> ${layerName}</div>`;
    Object.entries(properties).forEach(([k,v]) => {
        html += `<div class="feature-property"><span class="property-key">${k}:</span> <span class="property-value">${v}</span></div>`;
    });
    info.innerHTML = html;
}

/* ----------------- Search by attribute ----------------- */
function searchFeatures(field, value) {
    const status = document.getElementById('searchStatus');
    if (!field || !value) {
        status.textContent = 'من فضلك أدخل اسم الحقل وقيمة البحث.';
        return;
    }
    let found = false;
    Object.values(layers).forEach(ld => {
        if (!ld.visible) return; // optional: include hidden layers if you want
        ld.layer.eachLayer(layer => {
            const props = layer.feature && layer.feature.properties;
            if (props && props[field] !== undefined && String(props[field]).toLowerCase().includes(value.toLowerCase())) {
                found = true;
                // highlight / open popup and zoom
                if (layer.getBounds) {
                    map.fitBounds(layer.getBounds(), { padding: [30,30] });
                } else if (layer.getLatLng) {
                    map.setView(layer.getLatLng(), 14);
                }
                layer.openPopup && layer.openPopup();
                displayFeatureInfo(props, ld.name);
            }
        });
    });
    status.textContent = found ? '✅ تم العثور على نتائج.' : '⚠️ لا توجد نتائج.';
    setTimeout(() => status.textContent = '', 3000);
}

/* ----------------- Clear all ----------------- */
function clearAllLayers() {
    if (!confirm('هل تريد حذف جميع الطبقات؟')) return;
    Object.values(layers).forEach(ld => map.removeLayer(ld.layer));
    layers = {};
    updateLayersList();
    document.getElementById('featureInfo').innerHTML = '<p class="empty-message">انقر على عنصر لعرض معلوماته هنا</p>';
}

// FadeIn animation keyframes (ensure exists)
(function(){
  const s=document.createElement('style');
  s.textContent='@keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}';
  document.head.appendChild(s);
})();
// ===== Layer Picker Helpers =====
function openLayerPicker(layersInfo, fileName){
  window._layerCandidates = layersInfo;
  const modal = document.getElementById('layerPickerModal');
  const table = document.getElementById('layerPickerTable');
  const fileLabel = document.getElementById('layerFileName');
  if(!modal || !table) return;
  table.innerHTML='';
  fileLabel.textContent = '📁 الملف: ' + (fileName || '');
  layersInfo.forEach((info, i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${info.name||'-'}</td>
      <td>${info.geometry||'-'}</td>
      <td>${info.count||0}</td>
      <td><button class="btn small" data-i="${i}">عرض</button></td>`;
    table.appendChild(tr);
  });
  table.querySelectorAll('button[data-i]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const idx = parseInt(e.currentTarget.getAttribute('data-i'),10);
      selectLayerFromPicker(idx);
    });
  });
  modal.classList.add('show'); modal.classList.remove('hidden');
}
function toggleLayerPicker(show){
  const modal = document.getElementById('layerPickerModal');
  if(!modal) return;
  if(show){ modal.classList.add('show'); modal.classList.remove('hidden'); }
  else { modal.classList.remove('show'); modal.classList.add('hidden'); }
}
function selectLayerFromPicker(index){
  const info = (window._layerCandidates||[])[index];
  if(!info) return;
  addGeoJSONLayer(info.data, info.name);
  toggleLayerPicker(false);
}
document.addEventListener('DOMContentLoaded', ()=>{
  const cancelBtn = document.getElementById('cancelLayerPicker');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=>toggleLayerPicker(false));
  const overlay = document.getElementById('layerPickerModal');
  if(overlay) overlay.addEventListener('click', (e)=>{ if(e.target && e.target.id==='layerPickerModal') toggleLayerPicker(false); });
});


function csvToGeoJSON(rows){
  // try lat/lon or y/x
  const keys = rows.length ? Object.keys(rows[0]).reduce((acc,k)=>{acc[k.toLowerCase()]=k;return acc;}, {}) : {};
  const latKey = keys['lat']||keys['latitude']||keys['y'];
  const lonKey = keys['lon']||keys['lng']||keys['longitude']||keys['x'];
  if(!latKey || !lonKey) throw new Error('CSV يجب أن يحتوي أعمدة lat/lon أو x/y');
  const features = rows.map(r=>({
    type:'Feature',
    properties:Object.assign({}, r),
    geometry:{type:'Point',coordinates:[parseFloat(r[lonKey]), parseFloat(r[latKey])]}
  })).filter(f=>Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));
  return {type:'FeatureCollection',features};
}



function wktToFeatureCollection(text){
  const features = text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(w=>{
    try{
      const geom = Terraformer.WKT.parse(w);
      return {type:'Feature', properties:{wkt:w}, geometry: geom};
    }catch(_){ return null; }
  }).filter(Boolean);
  return {type:'FeatureCollection', features};
}

