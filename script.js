// ============================================
// GIS Viewer Application - Main Script
// ============================================

// Configuration
const CONFIG = {
    // Credentials (Simple Client-Side Protection)
    CREDENTIALS: {
        username: 'gisuser',
        password: 'gispass'
    },
    // Default Map Center (Cairo, Egypt)
    DEFAULT_CENTER: [30.0444, 31.2357],
    DEFAULT_ZOOM: 5,
};

// Global Variables
let map = null;
let layers = {};
let isAuthenticated = false;

// ## متغيرات جديدة لتخزين الطبقة مؤقتاً قبل اختيار النمط ##
let tempGeoJSON = null;
let tempLayerName = '';


// ============================================
// Authentication System
// ============================================

function initializeAuth() {
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);

    // Check if already authenticated
    if (sessionStorage.getItem('gisAuth') === 'true') {
        isAuthenticated = true;
        showApp();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    // Simple validation
    if (username === CONFIG.CREDENTIALS.username && password === CONFIG.CREDENTIALS.password) {
        isAuthenticated = true;
        sessionStorage.setItem('gisAuth', 'true');
        errorDiv.classList.remove('show');
        showApp();
    } else {
        errorDiv.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة';
        errorDiv.classList.add('show');
    }
}

function showApp() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    initializeMap();
    attachEventListeners();
}

function handleLogout() {
    isAuthenticated = false;
    sessionStorage.removeItem('gisAuth');
    document.getElementById('loginModal').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginForm').reset();
    
    // Destroy map
    if (map) {
        map.remove();
        map = null;
    }
    layers = {};
}

// ============================================
// Map Initialization
// ============================================

function initializeMap() {
    // Create map
    map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

    // 1. طبقة الصور الجوية
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
        maxZoom: 20,
        minZoom: 2
    });

    // 2. طبقة خريطة الشارع
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 2
    });

    // إضافة الطبقة الافتراضية (الجوية) إلى الخريطة
    satelliteLayer.addTo(map);

    // Layer control
    const baseLayers = {
        '🛰️ صور جوية': satelliteLayer,
        '🗺️ خريطة الشارع': streetLayer
    };
    
    L.control.layers(baseLayers, {}, { position: 'topleft' }).addTo(map);

    // Add zoom control
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Add fullscreen control
    L.control.fullscreen({ position: 'topleft' }).addTo(map);

    // Map click event for feature info
    map.on('click', handleMapClick);
}

// ============================================
// Event Listeners
// ============================================

function attachEventListeners() {
    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = '#dde8ff';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.backgroundColor = '#f0f4ff';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = '#f0f4ff';
        handleFileUpload(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFileUpload(e.target.files);
    });

    // Buttons
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('zoomInBtn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => map.zoomOut());
    document.getElementById('resetMapBtn').addEventListener('click', resetMap);
    document.getElementById('clearLayersBtn').addEventListener('click', clearAllLayers);
    document.getElementById('shareBtn').addEventListener('click', shareLink);

    // ## ربط زر نافذة اختيار النمط ##
    document.getElementById('styleForm').addEventListener('submit', handleStyleSubmit);
}

// ============================================
// File Upload and Processing
// ============================================

function handleFileUpload(files) {
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.textContent = '⏳ جاري معالجة الملفات...';
    statusDiv.classList.add('success');

    // نأخذ ملف واحد فقط في كل مرة لإظهار نافذة النمط
    const file = files[0];
    if (!file) return;

    if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        handleGeoJSON(file, statusDiv);
    } else if (file.name.endsWith('.zip')) {
        handleShapefile(file, statusDiv);
    } else if (file.name.endsWith('.kml')) {
        handleKML(file, statusDiv);
    } else if (file.name.endsWith('.kmz')) {
        handleKMZ(file, statusDiv);
    } else {
         statusDiv.textContent = `❌ صيغة ملف غير مدعومة: ${file.name}`;
         statusDiv.classList.add('error');
         statusDiv.classList.remove('success');
    }
}

function handleGeoJSON(file, statusDiv) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const geojson = JSON.parse(e.target.result);
            
            // ## تعديل: إظهار نافذة النمط بدلاً من الإضافة المباشرة ##
            tempGeoJSON = geojson;
            tempLayerName = file.name;
            showStyleModal(file.name);
            
            statusDiv.textContent = `✅ تم اختيار ${file.name}، يرجى تحديد النمط.`;
            statusDiv.classList.remove('error');
            statusDiv.classList.add('success');
        } catch (error) {
            statusDiv.textContent = `❌ خطأ في معالجة ${file.name}: ${error.message}`;
            statusDiv.classList.add('error');
            statusDiv.classList.remove('success');
        }
    };
    reader.readAsText(file);
}

function handleShapefile(file, statusDiv) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            shp(e.target.result).then(data => {
                const geojson = Array.isArray(data) ? {
                    type: 'FeatureCollection',
                    features: data.flatMap(d => d.features || [d])
                } : data;
                
                // ## تعديل: إظهار نافذة النمط بدلاً من الإضافة المباشرة ##
                tempGeoJSON = geojson;
                tempLayerName = file.name.replace('.zip', '');
                showStyleModal(tempLayerName);

                statusDiv.textContent = `✅ تم اختيار ${file.name}، يرجى تحديد النمط.`;
                statusDiv.classList.remove('error');
                statusDiv.classList.add('success');
            }).catch(error => {
                statusDiv.textContent = `❌ خطأ في معالجة Shapefile: ${error.message}`;
                statusDiv.classList.add('error');
                statusDiv.classList.remove('success');
            });
        } catch (error) {
            statusDiv.textContent = `❌ خطأ في قراءة الملف: ${error.message}`;
            statusDiv.classList.add('error');
            statusDiv.classList.remove('success');
        }
    };
    reader.readAsArrayBuffer(file);
}


function handleKML(file, statusDiv) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const kmlText = e.target.result;
            const parser = new DOMParser();
            const kmlDom = parser.parseFromString(kmlText, 'text/xml');
            
            const geojson = toGeoJSON.kml(kmlDom);
            
            // ## تعديل: إظهار نافذة النمط بدلاً من الإضافة المباشرة ##
            tempGeoJSON = geojson;
            tempLayerName = file.name;
            showStyleModal(file.name);

            statusDiv.textContent = `✅ تم اختيار ${file.name}، يرجى تحديد النمط.`;
            statusDiv.classList.remove('error');
            statusDiv.classList.add('success');
        } catch (error) {
            statusDiv.textContent = `❌ خطأ في معالجة ${file.name}: ${error.message}`;
            statusDiv.classList.add('error');
            statusDiv.classList.remove('success');
        }
    };
    reader.readAsText(file);
}

function handleKMZ(file, statusDiv) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            JSZip.loadAsync(e.target.result).then(zip => {
                const kmlFile = zip.file(/\.kml$/i)[0];
                
                if (kmlFile) {
                    kmlFile.async('string').then(kmlText => {
                        const parser = new DOMParser();
                        const kmlDom = parser.parseFromString(kmlText, 'text/xml');
                        const geojson = toGeoJSON.kml(kmlDom);
                        
                        // ## تعديل: إظهار نافذة النمط بدلاً من الإضافة المباشرة ##
                        tempGeoJSON = geojson;
                        tempLayerName = file.name;
                        showStyleModal(file.name);

                        statusDiv.textContent = `✅ تم اختيار ${file.name}، يرجى تحديد النمط.`;
                        statusDiv.classList.remove('error');
                        statusDiv.classList.add('success');
                    });
                } else {
                    throw new Error('لم يتم العثور على ملف KML داخل ملف KMZ.');
                }
            }).catch(error => {
                 statusDiv.textContent = `❌ خطأ في معالجة ${file.name}: ${error.message}`;
                statusDiv.classList.add('error');
                statusDiv.classList.remove('success');
            });
        } catch (error) {
            statusDiv.textContent = `❌ خطأ في قراءة ${file.name}: ${error.message}`;
            statusDiv.classList.add('error');
            statusDiv.classList.remove('success');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ============================================
// ## دوال جديدة خاصة بنافذة اختيار النمط ##
// ============================================

/**
 * إظهار نافذة اختيار النمط
 */
function showStyleModal(layerName) {
    document.getElementById('styleLayerName').textContent = layerName;
    document.getElementById('styleModal').classList.remove('hidden');
}

/**
 * معالجة إرسال النمط وإضافة الطبقة
 */
function handleStyleSubmit(e) {
    e.preventDefault();
    
    // جلب الأنماط من النافذة
    const style = {
        color: document.getElementById('layerColor').value,
        weight: parseInt(document.getElementById('layerWeight').value, 10),
        fillOpacity: parseFloat(document.getElementById('layerOpacity').value),
        radius: parseInt(document.getElementById('pointRadius').value, 10)
    };

    // استخدام البيانات المؤقتة المخزنة
    if (tempGeoJSON) {
        addGeoJSONLayer(tempGeoJSON, tempLayerName, style);
    }
    
    // إخفاء النافذة وإعادة تعيين المتغيرات
    document.getElementById('styleModal').classList.add('hidden');
    tempGeoJSON = null;
    tempLayerName = '';
}


// ============================================
// GeoJSON Layer Management
// ============================================

/**
 * ## تم تعديل هذه الدالة بالكامل ##
 * لتقبل الأنماط المخصصة
 */
function addGeoJSONLayer(geojson, layerName, customStyle) {
    
    const layerId = `layer_${Date.now()}`;
    const layerColor = customStyle.color; // اللون الذي اختاره المستخدم

    const geoJSONLayer = L.geoJSON(geojson, {
        style: (feature) => {
            // هذا النمط سيطبق على الخطوط والمضلعات
            return {
                color: customStyle.color,
                weight: customStyle.weight,
                opacity: 0.8,
                fillOpacity: customStyle.fillOpacity
            };
        },
        pointToLayer: (feature, latlng) => {
            // هذا النمط سيطبق على النقاط
            return L.circleMarker(latlng, {
                radius: customStyle.radius,
                fillColor: customStyle.color,
                color: '#fff', // حدود بيضاء للنقطة
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        },
        onEachFeature: (feature, layer) => {
            // إنشاء نافذة منبثقة بالبيانات
            let popupContent = `<strong>${layerName}</strong><br>`;
            if (feature.properties) {
                Object.entries(feature.properties).forEach(([key, value]) => {
                    popupContent += `<strong>${key}:</strong> ${value}<br>`;
                });
            }
            layer.bindPopup(popupContent);

            // إظهار البيانات في الشريط الجانبي عند النقر
            layer.on('click', (e) => {
                displayFeatureInfo(feature.properties, layerName);
            });
        }
    }).addTo(map);

    // تخزين الطبقة
    layers[layerId] = {
        name: layerName,
        layer: geoJSONLayer,
        visible: true,
        color: layerColor, // لحفظ اللون المختار
        geojson: geojson
    };

    // تحديث قائمة الطبقات
    updateLayersList();

    // تقريب الخريطة إلى حدود الطبقة الجديدة
    if (geoJSONLayer.getBounds().isValid()) {
        map.fitBounds(geoJSONLayer.getBounds(), { padding: [50, 50] });
    }
}

function updateLayersList() {
    const layersList = document.getElementById('layersList');
    
    if (Object.keys(layers).length === 0) {
        layersList.innerHTML = '<p class="empty-message">لا توجد طبقات مضافة</p>';
        return;
    }

    layersList.innerHTML = '';
    Object.entries(layers).forEach(([layerId, layerData]) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';
        // استخدام اللون المختار من المستخدم
        layerItem.innerHTML = `
            <span class="layer-name" style="border-right: 4px solid ${layerData.color}; padding-right: 8px;">
                ${layerData.name}
            </span>
            <div class="layer-actions">
                <button class="layer-btn layer-toggle" onclick="toggleLayer('${layerId}')">
                    ${layerData.visible ? '👁️ إخفاء' : '🙈 إظهار'}
                </button>
                <button class="layer-btn layer-delete" onclick="deleteLayer('${layerId}')">🗑️</button>
            </div>
        `;
        layersList.appendChild(layerItem);
    });
}

function toggleLayer(layerId) {
    if (layers[layerId]) {
        layers[layerId].visible = !layers[layerId].visible;
        if (layers[layerId].visible) {
            map.addLayer(layers[layerId].layer);
        } else {
            map.removeLayer(layers[layerId].layer);
        }
        updateLayersList();
    }
}

function deleteLayer(layerId) {
    if (layers[layerId]) {
        map.removeLayer(layers[layerId].layer);
        delete layers[layerId];
        updateLayersList();
        document.getElementById('featureInfo').innerHTML = '<p class="empty-message">انقر على عنصر في الخريطة لعرض معلوماته</p>';
    }
}

function clearAllLayers() {
    if (confirm('هل تريد حذف جميع الطبقات؟')) {
        Object.keys(layers).forEach(layerId => {
            map.removeLayer(layers[layerId].layer);
        });
        layers = {};
        updateLayersList();
        document.getElementById('featureInfo').innerHTML = '<p class="empty-message">انقر على عنصر في الخريطة لعرض معلوماته</p>';
    }
}

// ============================================
// Feature Info Display
// ============================================

function displayFeatureInfo(properties, layerName) {
    const featureInfo = document.getElementById('featureInfo');
    
    if (!properties || Object.keys(properties).length === 0) {
        featureInfo.innerHTML = '<p class="empty-message">لا توجد معلومات متاحة</p>';
        return;
    }

    let html = `<div class="feature-property"><strong style="color: #667eea;">الطبقة:</strong> ${layerName}</div>`;
    Object.entries(properties).forEach(([key, value]) => {
        html += `
            <div class="feature-property">
                <span class="property-key">${key}:</span>
                <span class="property-value">${value}</span>
            </div>
        `;
    });

    featureInfo.innerHTML = html;
}

function handleMapClick(e) {
    // Check if clicked on a feature
    let foundFeature = false;
    Object.values(layers).forEach(layerData => {
        if (layerData.visible) {
            layerData.layer.eachLayer(layer => {
                // محاولة التحقق بطريقة أكثر مرونة
                if (layer.contains && layer.contains(e.latlng)) {
                     foundFeature = true;
                } else if (layer.getLatLng && layer.getLatLng().equals(e.latlng)) {
                    foundFeature = true;
                }
            });
        }
    });

    if (!foundFeature) {
        // إخفاء بيانات الطبقة فقط إذا لم يتم النقر على أي عنصر
        document.getElementById('featureInfo').innerHTML = '<p class="empty-message">انقر على عنصر في الخريطة لعرض معلوماته</p>';
    }
}

// ============================================
// Map Controls
// ============================================

function resetMap() {
    map.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
}

// ============================================
// Share Functionality
// ============================================

function shareLink() {
    const shareStatus = document.getElementById('shareStatus');
    const currentUrl = window.location.href;
    
    // Copy to clipboard
    navigator.clipboard.writeText(currentUrl).then(() => {
        shareStatus.textContent = '✅ تم نسخ الرابط إلى الحافظة';
        shareStatus.classList.add('success');
        shareStatus.classList.remove('error');
        
        setTimeout(() => {
            shareStatus.textContent = '';
            shareStatus.classList.remove('success');
        }, 3000);
    }).catch(err => {
        shareStatus.textContent = '❌ فشل نسخ الرابط';
        shareStatus.classList.add('error');
        shareStatus.classList.remove('success');
    });
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
});