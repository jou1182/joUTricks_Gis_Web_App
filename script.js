// ====================================
// JoUTricks GIS Viewer v3.5 - Main Script
// Developed by: Dr. Youssef Seleim
// ====================================

'use strict';

/* ----- Configuration ----- */
const CONFIG = {
    CREDENTIALS: {
        username: 'jou',
        password: 'tricks'
    },
    DEFAULT_CENTER: [30.0444, 31.2357], // Cairo, Egypt
    DEFAULT_ZOOM: 5,
    SESSION_STORAGE_KEY: 'gisAuth',
    LAYERS_STORAGE_KEY: 'gisLayers',
    MAX_FILE_SIZE: 50 * 1024 * 1024 // 50 MB
};

/* ----- Global Variables ----- */
let map = null;
let layers = {}; // { id: { name, layer, visible, geojson, style } }
let currentEditingLayerId = null;

/* =====================================
   INITIALIZATION
   ===================================== */

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
});

function initializeAuth() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Check if already authenticated
    if (sessionStorage.getItem(CONFIG.SESSION_STORAGE_KEY) === 'true') {
        showApp();
    }
}

/* =====================================
   AUTHENTICATION
   ===================================== */

function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorElement = document.getElementById('loginError');

    if (username === CONFIG.CREDENTIALS.username && password === CONFIG.CREDENTIALS.password) {
        sessionStorage.setItem(CONFIG.SESSION_STORAGE_KEY, 'true');
        errorElement.textContent = '';
        errorElement.classList.remove('show');
        showApp();
    } else {
        errorElement.textContent = '❌ اسم المستخدم أو كلمة المرور خاطئ. حاول مرة أخرى.';
        errorElement.classList.add('show');
        
        // Auto-hide error after 3 seconds
        setTimeout(() => {
            errorElement.classList.remove('show');
        }, 3000);
    }
}

function handleLogout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        sessionStorage.removeItem(CONFIG.SESSION_STORAGE_KEY);
        localStorage.removeItem(CONFIG.LAYERS_STORAGE_KEY);
        location.reload();
    }
}

function showApp() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    
    initializeMap();
    attachEventListeners();
    restoreSession();
}

/* =====================================
   MAP INITIALIZATION
   ===================================== */

function initializeMap() {
    if (map) return;

    showMapLoading(true);

    try {
        // Initialize Leaflet map
        map = L.map('map', {
            center: CONFIG.DEFAULT_CENTER,
            zoom: CONFIG.DEFAULT_ZOOM,
            zoomControl: false
        });

        // Base layers
        const satelliteLayer = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: '© Esri',
                maxZoom: 20,
                id: 'satellite'
            }
        );

        const osmLayer = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                attribution: '© OpenStreetMap Contributors',
                maxZoom: 19,
                id: 'osm'
            }
        );

        const topoLayer = L.tileLayer(
            'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            {
                attribution: '© OpenTopoMap',
                maxZoom: 17,
                id: 'topo'
            }
        );

        // Add default layer
        satelliteLayer.addTo(map);

        // Layer control
        const baseMaps = {
            '🛰️ صور جوية': satelliteLayer,
            '🗺️ خريطة الشارع': osmLayer,
            '⛰️ خريطة تضاريسية': topoLayer
        };

        L.control.layers(baseMaps, {}, { position: 'topleft' }).addTo(map);
        
        // Custom zoom control
        L.control.zoom({ position: 'topleft' }).addTo(map);

        // Scale control
        L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

        // Map events
        map.on('click', () => {
            clearFeatureInfo();
        });

        showMapLoading(false);
        
        console.log('✅ تم تهيئة الخريطة بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تهيئة الخريطة:', error);
        showMapLoading(false);
        showStatus('uploadStatus', `❌ خطأ في تحميل الخريطة: ${error.message}`, 'error');
    }
}

function showMapLoading(show) {
    const loadingElement = document.getElementById('mapLoading');
    if (loadingElement) {
        loadingElement.style.display = show ? 'block' : 'none';
    }
}

/* =====================================
   EVENT LISTENERS
   ===================================== */

function attachEventListeners() {
    // Upload area
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#764ba2';
            uploadArea.style.transform = 'scale(1.02)';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '';
            uploadArea.style.transform = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '';
            uploadArea.style.transform = '';
            handleFileUpload(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            handleFileUpload(e.target.files);
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Map controls
    addEventListenerSafe('zoomInBtn', 'click', () => map.zoomIn());
    addEventListenerSafe('zoomOutBtn', 'click', () => map.zoomOut());
    addEventListenerSafe('resetMapBtn', 'click', () => {
        map.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
        showStatus('uploadStatus', '✅ تم إعادة تعيين الخريطة', 'success');
    });
    addEventListenerSafe('clearLayersBtn', 'click', clearAllLayers);

    // Search
    addEventListenerSafe('searchBtn', 'click', () => {
        const field = document.getElementById('searchField').value.trim();
        const value = document.getElementById('searchValue').value.trim();
        searchFeatures(field, value);
    });

    // Session management
    addEventListenerSafe('saveSessionBtn', 'click', saveSession);
    addEventListenerSafe('loadSessionBtn', 'click', loadSessionFromUser);

    // Style editor
    addEventListenerSafe('applyStyleBtn', 'click', applyStyle);
    addEventListenerSafe('cancelStyleBtn', 'click', () => closeModal('styleEditorModal'));
    
    // Style editor color sync
    const styleColor = document.getElementById('styleColor');
    const styleColorText = document.getElementById('styleColorText');
    if (styleColor && styleColorText) {
        styleColor.addEventListener('input', (e) => {
            styleColorText.value = e.target.value.toUpperCase();
        });
        styleColorText.addEventListener('input', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                styleColor.value = e.target.value;
            }
        });
    }

    // Range inputs - live update display
    addRangeInputListener('styleWeight', 'weightValue');
    addRangeInputListener('styleOpacity', 'opacityValue');
    addRangeInputListener('styleRadius', 'radiusValue');

    // Layer picker
    addEventListenerSafe('cancelLayerPicker', 'click', () => closeModal('layerPickerModal'));

    // Export modal
    addEventListenerSafe('cancelExport', 'click', () => closeModal('exportModal'));
    addEventListenerSafe('exportGeoJSON', 'click', () => exportLayer('geojson'));
    addEventListenerSafe('exportShapefile', 'click', () => exportLayer('shapefile'));

    // Enter key support for search
    ['searchField', 'searchValue'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('searchBtn').click();
                }
            });
        }
    });
}

function addEventListenerSafe(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
    }
}

function addRangeInputListener(rangeId, displayId) {
    const rangeInput = document.getElementById(rangeId);
    const displaySpan = document.getElementById(displayId);
    if (rangeInput && displaySpan) {
        rangeInput.addEventListener('input', (e) => {
            displaySpan.textContent = e.target.value;
        });
    }
}

/* =====================================
   FILE HANDLING
   ===================================== */

async function handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const statusElement = document.getElementById('uploadStatus');
    
    // Process multiple files
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showStatus('uploadStatus', `❌ الملف ${file.name} كبير جداً. الحد الأقصى: 50 MB`, 'error');
            continue;
        }

        showStatus('uploadStatus', `⏳ جاري معالجة ${file.name}...`, 'info');

        try {
            const extension = file.name.split('.').pop().toLowerCase();

            switch (extension) {
                case 'geojson':
                case 'json':
                    await handleGeoJSON(file);
                    break;
                case 'zip':
                    await handleZip(file);
                    break;
                case 'kml':
                    await handleKML(file);
                    break;
                case 'kmz':
                    await handleKMZ(file);
                    break;
                case 'gpx':
                    await handleGPX(file);
                    break;
                case 'csv':
                    await handleCSV(file);
                    break;
                case 'topojson':
                    await handleTopoJSON(file);
                    break;
                case 'wkt':
                    await handleWKT(file);
                    break;
                default:
                    showStatus('uploadStatus', `❌ صيغة غير مدعومة: ${extension}`, 'error');
            }
        } catch (error) {
            console.error('خطأ في معالجة الملف:', error);
            showStatus('uploadStatus', `❌ خطأ: ${error.message}`, 'error');
        }
    }

    // Clear file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

/* ----- GeoJSON Handler ----- */
async function handleGeoJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const geojson = JSON.parse(e.target.result);
                validateGeoJSON(geojson);
                addGeoJSONLayer(geojson, file.name.replace(/\.(geo)?json$/i, ''), getDefaultStyle());
                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة GeoJSON: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsText(file);
    });
}

/* ----- Shapefile (ZIP) Handler ----- */
async function handleZip(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const geojson = await shp(arrayBuffer);

                // shp() may return array or single FeatureCollection
                if (Array.isArray(geojson)) {
                    if (geojson.length === 1) {
                        addGeoJSONLayer(geojson[0], file.name.replace('.zip', ''), getDefaultStyle());
                    } else {
                        // Multiple layers - show picker
                        const layersInfo = geojson.map((layer, index) => ({
                            name: layer.fileName || `الطبقة ${index + 1}`,
                            geometry: detectGeometryType(layer),
                            count: layer.features ? layer.features.length : 0,
                            data: layer
                        }));
                        openLayerPicker(layersInfo, file.name);
                    }
                } else {
                    addGeoJSONLayer(geojson, file.name.replace('.zip', ''), getDefaultStyle());
                }

                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة Shapefile: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsArrayBuffer(file);
    });
}

/* ----- KML Handler ----- */
async function handleKML(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const kmlText = e.target.result;
                const parser = new DOMParser();
                const kmlDom = parser.parseFromString(kmlText, 'application/xml');
                const geojson = toGeoJSON.kml(kmlDom);
                
                validateGeoJSON(geojson);
                addGeoJSONLayer(geojson, file.name.replace('.kml', ''), getDefaultStyle());
                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة KML: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsText(file);
    });
}

/* ----- KMZ Handler ----- */
async function handleKMZ(file) {
    return new Promise(async (resolve, reject) => {
        try {
            const zip = await JSZip.loadAsync(file);
            let kmlFile = null;

            // Find KML file inside KMZ
            for (let filename in zip.files) {
                if (filename.toLowerCase().endsWith('.kml')) {
                    kmlFile = await zip.files[filename].async('string');
                    break;
                }
            }

            if (!kmlFile) {
                reject(new Error('لم يتم العثور على ملف KML داخل KMZ'));
                return;
            }

            const parser = new DOMParser();
            const kmlDom = parser.parseFromString(kmlFile, 'application/xml');
            const geojson = toGeoJSON.kml(kmlDom);

            validateGeoJSON(geojson);
            addGeoJSONLayer(geojson, file.name.replace('.kmz', ''), getDefaultStyle());
            showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
            resolve();
        } catch (error) {
            reject(new Error(`خطأ في قراءة KMZ: ${error.message}`));
        }
    });
}

/* ----- GPX Handler ----- */
async function handleGPX(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const gpxText = e.target.result;
                const parser = new DOMParser();
                const gpxDom = parser.parseFromString(gpxText, 'application/xml');
                const geojson = toGeoJSON.gpx(gpxDom);

                validateGeoJSON(geojson);
                addGeoJSONLayer(geojson, file.name.replace('.gpx', ''), getDefaultStyle());
                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة GPX: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsText(file);
    });
}

/* ----- CSV Handler ----- */
async function handleCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                try {
                    const geojson = csvToGeoJSON(results.data);
                    validateGeoJSON(geojson);
                    addGeoJSONLayer(geojson, file.name.replace('.csv', ''), getDefaultStyle());
                    showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            },
            error: (error) => {
                reject(new Error(`خطأ في قراءة CSV: ${error.message}`));
            }
        });
    });
}

function csvToGeoJSON(rows) {
    if (!rows || rows.length === 0) {
        throw new Error('ملف CSV فارغ');
    }

    // Detect lat/lon columns (case-insensitive)
    const keys = Object.keys(rows[0]).reduce((acc, k) => {
        acc[k.toLowerCase()] = k;
        return acc;
    }, {});

    const latKey = keys['lat'] || keys['latitude'] || keys['y'];
    const lonKey = keys['lon'] || keys['lng'] || keys['longitude'] || keys['x'] || keys['long'];

    if (!latKey || !lonKey) {
        throw new Error('CSV يجب أن يحتوي على أعمدة lat/lon أو x/y');
    }

    const features = rows
        .map(row => {
            const lat = parseFloat(row[latKey]);
            const lon = parseFloat(row[lonKey]);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return null;
            }

            return {
                type: 'Feature',
                properties: Object.assign({}, row),
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                }
            };
        })
        .filter(Boolean);

    if (features.length === 0) {
        throw new Error('لم يتم العثور على إحداثيات صالحة في CSV');
    }

    return {
        type: 'FeatureCollection',
        features: features
    };
}

/* ----- TopoJSON Handler ----- */
async function handleTopoJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const topology = JSON.parse(e.target.result);
                
                // Convert TopoJSON to GeoJSON
                const objectKeys = Object.keys(topology.objects);
                if (objectKeys.length === 0) {
                    reject(new Error('TopoJSON لا يحتوي على كائنات'));
                    return;
                }

                // Use first object
                const geojson = topojson.feature(topology, topology.objects[objectKeys[0]]);
                
                validateGeoJSON(geojson);
                addGeoJSONLayer(geojson, file.name.replace('.topojson', ''), getDefaultStyle());
                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة TopoJSON: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsText(file);
    });
}

/* ----- WKT Handler ----- */
async function handleWKT(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const wktText = e.target.result;
                const geojson = wktToGeoJSON(wktText);
                
                validateGeoJSON(geojson);
                addGeoJSONLayer(geojson, file.name.replace('.wkt', ''), getDefaultStyle());
                showStatus('uploadStatus', `✅ تمت إضافة ${file.name}`, 'success');
                resolve();
            } catch (error) {
                reject(new Error(`خطأ في قراءة WKT: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('خطأ في قراءة الملف'));
        reader.readAsText(file);
    });
}

function wktToGeoJSON(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    
    if (lines.length === 0) {
        throw new Error('ملف WKT فارغ');
    }

    const features = lines
        .map(wkt => {
            try {
                // Simple WKT parser (basic support)
                // For production, use a proper library like terraformer-wkt-parser
                const match = wkt.match(/^(\w+)\s*\((.*)\)$/);
                if (!match) return null;

                const type = match[1].toUpperCase();
                const coords = match[2];

                let geometry = null;

                if (type === 'POINT') {
                    const [x, y] = coords.split(/\s+/).map(parseFloat);
                    geometry = { type: 'Point', coordinates: [x, y] };
                } else {
                    // For other types, would need more complex parsing
                    console.warn('نوع WKT غير مدعوم:', type);
                    return null;
                }

                return {
                    type: 'Feature',
                    properties: { wkt: wkt },
                    geometry: geometry
                };
            } catch (err) {
                console.warn('خطأ في تحليل WKT:', err);
                return null;
            }
        })
        .filter(Boolean);

    if (features.length === 0) {
        throw new Error('لم يتم العثور على معالم صالحة في WKT');
    }

    return {
        type: 'FeatureCollection',
        features: features
    };
}

/* =====================================
   LAYER MANAGEMENT
   ===================================== */

function getDefaultStyle() {
    return {
        color: '#ff6b6b',
        weight: 2,
        fillOpacity: 0.4,
        radius: 6,
        shape: 'circle'
    };
}

function validateGeoJSON(geojson) {
    if (!geojson || typeof geojson !== 'object') {
        throw new Error('بيانات GeoJSON غير صالحة');
    }

    if (geojson.type === 'FeatureCollection') {
        if (!Array.isArray(geojson.features)) {
            throw new Error('GeoJSON يجب أن يحتوي على مصفوفة features');
        }
        if (geojson.features.length === 0) {
            throw new Error('GeoJSON لا يحتوي على أي معالم');
        }
    } else if (geojson.type === 'Feature') {
        if (!geojson.geometry) {
            throw new Error('Feature يجب أن يحتوي على geometry');
        }
    } else if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geojson.type)) {
        // Direct geometry
        if (!geojson.coordinates) {
            throw new Error('Geometry يجب أن يحتوي على coordinates');
        }
    } else {
        throw new Error('نوع GeoJSON غير مدعوم: ' + geojson.type);
    }

    return true;
}

function addGeoJSONLayer(geojson, layerName, style = {}) {
    const layerId = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const appliedStyle = Object.assign({}, getDefaultStyle(), style);

    try {
        const geoLayer = L.geoJSON(geojson, {
            style: feature => ({
                color: appliedStyle.color,
                weight: appliedStyle.weight,
                opacity: 0.9,
                fillColor: appliedStyle.color,
                fillOpacity: appliedStyle.fillOpacity
            }),
            pointToLayer: (feature, latlng) => {
                if (appliedStyle.shape === 'marker') {
                    return L.marker(latlng);
                } else {
                    return L.circleMarker(latlng, {
                        radius: appliedStyle.radius,
                        fillColor: appliedStyle.color,
                        color: '#fff',
                        weight: 1,
                        fillOpacity: appliedStyle.fillOpacity
                    });
                }
            },
            onEachFeature: (feature, layer) => {
                // Build popup content
                let popupContent = `<div style="max-width: 250px;">`;
                popupContent += `<strong style="color: ${appliedStyle.color}; font-size: 14px;">${layerName}</strong><hr style="margin: 6px 0;">`;

                if (feature.properties && Object.keys(feature.properties).length > 0) {
                    Object.entries(feature.properties).forEach(([key, value]) => {
                        popupContent += `<div style="margin-bottom: 4px;">`;
                        popupContent += `<strong>${key}:</strong> ${value !== null && value !== undefined ? value : '-'}`;
                        popupContent += `</div>`;
                    });
                } else {
                    popupContent += `<em>لا توجد خصائص</em>`;
                }

                popupContent += `</div>`;
                layer.bindPopup(popupContent);

                // Click event
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    displayFeatureInfo(feature.properties, layerName, appliedStyle.color);
                });
            }
        }).addTo(map);

        // Store layer data
        layers[layerId] = {
            id: layerId,
            name: layerName,
            layer: geoLayer,
            geojson: geojson,
            visible: true,
            style: appliedStyle
        };

        // Fit bounds
        try {
            const bounds = geoLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            }
        } catch (e) {
            console.warn('تعذر تطبيق fitBounds:', e);
        }

        updateLayersList();
        
        console.log('✅ تمت إضافة الطبقة:', layerName);

    } catch (error) {
        console.error('❌ خطأ في إضافة الطبقة:', error);
        throw new Error(`فشل في إضافة الطبقة: ${error.message}`);
    }
}

function updateLayersList() {
    const container = document.getElementById('layersList');
    const layerCountElement = document.getElementById('layerCount');
    
    if (!container) return;

    const layerCount = Object.keys(layers).length;
    
    if (layerCountElement) {
        layerCountElement.textContent = `(${layerCount})`;
    }

    if (layerCount === 0) {
        container.innerHTML = '<p class="empty-message">لا توجد طبقات مضافة بعد</p>';
        return;
    }

    container.innerHTML = '';

    Object.values(layers).forEach(layerData => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.style.borderRightColor = layerData.style.color;

        item.innerHTML = `
            <span class="layer-name" title="${layerData.name}">${truncate(layerData.name, 20)}</span>
            <div class="layer-actions">
                <button class="layer-btn layer-toggle" title="${layerData.visible ? 'إخفاء' : 'إظهار'}">
                    ${layerData.visible ? '👁️' : '🚫'}
                </button>
                <button class="layer-btn layer-style" title="تعديل النمط">🎨</button>
                <button class="layer-btn layer-export" title="تصدير">📥</button>
                <button class="layer-btn layer-delete" title="حذف">🗑️</button>
            </div>
        `;

        // Event listeners
        item.querySelector('.layer-toggle').addEventListener('click', () => toggleLayer(layerData.id));
        item.querySelector('.layer-style').addEventListener('click', () => openStyleEditor(layerData.id));
        item.querySelector('.layer-export').addEventListener('click', () => openExportModal(layerData.id));
        item.querySelector('.layer-delete').addEventListener('click', () => deleteLayer(layerData.id));

        container.appendChild(item);
    });
}

function toggleLayer(layerId) {
    const layerData = layers[layerId];
    if (!layerData) return;

    if (layerData.visible) {
        map.removeLayer(layerData.layer);
        layerData.visible = false;
    } else {
        map.addLayer(layerData.layer);
        layerData.visible = true;
    }

    updateLayersList();
}

function deleteLayer(layerId) {
    const layerData = layers[layerId];
    if (!layerData) return;

    if (!confirm(`هل تريد حذف الطبقة "${layerData.name}"؟`)) return;

    map.removeLayer(layerData.layer);
    delete layers[layerId];
    updateLayersList();
    clearFeatureInfo();
    
    showStatus('uploadStatus', `🗑️ تم حذف الطبقة: ${layerData.name}`, 'info');
}

function clearAllLayers() {
    if (Object.keys(layers).length === 0) {
        showStatus('uploadStatus', '⚠️ لا توجد طبقات لحذفها', 'warning');
        return;
    }

    if (!confirm('هل تريد حذف جميع الطبقات؟')) return;

    Object.values(layers).forEach(layerData => {
        map.removeLayer(layerData.layer);
    });

    layers = {};
    updateLayersList();
    clearFeatureInfo();
    
    showStatus('uploadStatus', '✅ تم حذف جميع الطبقات', 'success');
}

/* =====================================
   STYLE EDITOR
   ===================================== */

function openStyleEditor(layerId) {
    const layerData = layers[layerId];
    if (!layerData) return;

    currentEditingLayerId = layerId;

    // Populate form with current style
    document.getElementById('styleColor').value = layerData.style.color;
    document.getElementById('styleColorText').value = layerData.style.color.toUpperCase();
    document.getElementById('styleWeight').value = layerData.style.weight;
    document.getElementById('weightValue').textContent = layerData.style.weight;
    document.getElementById('styleOpacity').value = layerData.style.fillOpacity;
    document.getElementById('opacityValue').textContent = layerData.style.fillOpacity;
    document.getElementById('styleRadius').value = layerData.style.radius;
    document.getElementById('radiusValue').textContent = layerData.style.radius;
    document.getElementById('styleShape').value = layerData.style.shape;

    openModal('styleEditorModal');
}

function applyStyle() {
    if (!currentEditingLayerId || !layers[currentEditingLayerId]) {
        closeModal('styleEditorModal');
        return;
    }

    const layerData = layers[currentEditingLayerId];
    const oldLayerId = currentEditingLayerId;

    // Get new style values
    const newStyle = {
        color: document.getElementById('styleColor').value,
        weight: parseInt(document.getElementById('styleWeight').value, 10),
        fillOpacity: parseFloat(document.getElementById('styleOpacity').value),
        radius: parseInt(document.getElementById('styleRadius').value, 10),
        shape: document.getElementById('styleShape').value
    };

    // Remove old layer
    map.removeLayer(layerData.layer);
    delete layers[oldLayerId];

    // Add new layer with updated style
    addGeoJSONLayer(layerData.geojson, layerData.name, newStyle);

    closeModal('styleEditorModal');
    currentEditingLayerId = null;

    showStatus('uploadStatus', `✅ تم تحديث نمط الطبقة: ${layerData.name}`, 'success');
}

/* =====================================
   EXPORT
   ===================================== */

function openExportModal(layerId) {
    currentEditingLayerId = layerId;
    openModal('exportModal');
}

function exportLayer(format) {
    if (!currentEditingLayerId || !layers[currentEditingLayerId]) {
        closeModal('exportModal');
        return;
    }

    const layerData = layers[currentEditingLayerId];

    try {
        if (format === 'geojson') {
            exportGeoJSON(layerData);
        } else if (format === 'shapefile') {
            exportShapefile(layerData);
        }

        closeModal('exportModal');
        currentEditingLayerId = null;
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        alert(`❌ خطأ في التصدير: ${error.message}`);
    }
}

function exportGeoJSON(layerData) {
    const dataStr = JSON.stringify(layerData.geojson, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${layerData.name}.geojson`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    showStatus('uploadStatus', `✅ تم تصدير ${layerData.name} كـ GeoJSON`, 'success');
}

function exportShapefile(layerData) {
    if (typeof shpwrite === 'undefined') {
        throw new Error('مكتبة shp-write غير محملة');
    }

    const options = {
        folder: layerData.name,
        types: {
            point: 'points',
            polygon: 'polygons',
            line: 'lines'
        }
    };

    shpwrite.download(layerData.geojson, options);
    
    showStatus('uploadStatus', `✅ تم تصدير ${layerData.name} كـ Shapefile`, 'success');
}

/* =====================================
   FEATURE INFO
   ===================================== */

function displayFeatureInfo(properties, layerName, color = '#667eea') {
    const infoContainer = document.getElementById('featureInfo');
    if (!infoContainer) return;

    if (!properties || Object.keys(properties).length === 0) {
        infoContainer.innerHTML = '<p class="empty-message">لا توجد معلومات لهذا العنصر</p>';
        return;
    }

    let html = `<div class="feature-property" style="border-left-color: ${color};">`;
    html += `<strong style="color: ${color}; font-size: 14px;">الطبقة: ${layerName}</strong>`;
    html += `</div>`;

    Object.entries(properties).forEach(([key, value]) => {
        html += `<div class="feature-property">`;
        html += `<span class="property-key">${key}:</span> `;
        html += `<span class="property-value">${value !== null && value !== undefined ? value : '-'}</span>`;
        html += `</div>`;
    });

    infoContainer.innerHTML = html;
}

function clearFeatureInfo() {
    const infoContainer = document.getElementById('featureInfo');
    if (infoContainer) {
        infoContainer.innerHTML = '<p class="empty-message">انقر على عنصر في الخريطة لعرض معلوماته</p>';
    }
}

/* =====================================
   ATTRIBUTE SEARCH
   ===================================== */

function searchFeatures(field, value) {
    const statusElement = document.getElementById('searchStatus');

    if (!field || !value) {
        showStatus('searchStatus', '⚠️ من فضلك أدخل اسم الحقل وقيمة البحث', 'warning');
        return;
    }

    let found = false;
    let foundLayer = null;
    let foundFeature = null;

    // Search through all visible layers
    Object.values(layers).forEach(layerData => {
        if (!layerData.visible) return;

        layerData.layer.eachLayer(layer => {
            const props = layer.feature && layer.feature.properties;
            
            if (props && props[field] !== undefined) {
                const propValue = String(props[field]).toLowerCase();
                const searchValue = value.toLowerCase();

                if (propValue.includes(searchValue)) {
                    found = true;
                    foundLayer = layerData;
                    foundFeature = layer;

                    // Zoom to feature
                    if (layer.getBounds) {
                        map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 16 });
                    } else if (layer.getLatLng) {
                        map.setView(layer.getLatLng(), 14);
                    }

                    // Open popup
                    if (layer.openPopup) {
                        layer.openPopup();
                    }

                    // Display info
                    displayFeatureInfo(props, layerData.name, layerData.style.color);

                    return false; // Stop after first match
                }
            }
        });

        if (found) return false;
    });

    if (found) {
        showStatus('searchStatus', `✅ تم العثور على نتائج في الطبقة: ${foundLayer.name}`, 'success');
    } else {
        showStatus('searchStatus', `⚠️ لم يتم العثور على نتائج للبحث: ${field} = ${value}`, 'warning');
    }
}

/* =====================================
   SESSION MANAGEMENT
   ===================================== */

function saveSession() {
    if (Object.keys(layers).length === 0) {
        showStatus('uploadStatus', '⚠️ لا توجد طبقات لحفظها', 'warning');
        return;
    }

    try {
        const sessionData = {
            version: '3.5',
            timestamp: new Date().toISOString(),
            mapView: {
                center: map.getCenter(),
                zoom: map.getZoom()
            },
            layers: Object.values(layers).map(layerData => ({
                name: layerData.name,
                geojson: layerData.geojson,
                style: layerData.style,
                visible: layerData.visible
            }))
        };

        localStorage.setItem(CONFIG.LAYERS_STORAGE_KEY, JSON.stringify(sessionData));
        showStatus('uploadStatus', '✅ تم حفظ الجلسة بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في حفظ الجلسة:', error);
        showStatus('uploadStatus', `❌ خطأ في الحفظ: ${error.message}`, 'error');
    }
}

function loadSessionFromUser() {
    if (!confirm('هل تريد استعادة الجلسة المحفوظة؟ سيتم حذف الطبقات الحالية.')) return;
    
    restoreSession();
}

function restoreSession() {
    try {
        const savedData = localStorage.getItem(CONFIG.LAYERS_STORAGE_KEY);
        if (!savedData) {
            console.log('لا توجد جلسة محفوظة');
            return;
        }

        const sessionData = JSON.parse(savedData);
        
        // Clear current layers
        Object.values(layers).forEach(layerData => {
            map.removeLayer(layerData.layer);
        });
        layers = {};

        // Restore map view
        if (sessionData.mapView) {
            map.setView(
                [sessionData.mapView.center.lat, sessionData.mapView.center.lng],
                sessionData.mapView.zoom
            );
        }

        // Restore layers
        if (sessionData.layers && Array.isArray(sessionData.layers)) {
            sessionData.layers.forEach(layerInfo => {
                try {
                    addGeoJSONLayer(layerInfo.geojson, layerInfo.name, layerInfo.style);
                    
                    // Apply visibility
                    const layerId = Object.keys(layers).pop();
                    if (layerId && !layerInfo.visible) {
                        toggleLayer(layerId);
                    }
                } catch (error) {
                    console.error('خطأ في استعادة الطبقة:', layerInfo.name, error);
                }
            });
        }

        showStatus('uploadStatus', `✅ تم استعادة ${sessionData.layers.length} طبقة`, 'success');
    } catch (error) {
        console.error('خطأ في استعادة الجلسة:', error);
        showStatus('uploadStatus', `❌ خطأ في الاستعادة: ${error.message}`, 'error');
    }
}

/* =====================================
   LAYER PICKER
   ===================================== */

window._layerCandidates = [];

function openLayerPicker(layersInfo, fileName) {
    window._layerCandidates = layersInfo;
    
    const modal = document.getElementById('layerPickerModal');
    const table = document.getElementById('layerPickerTable');
    const fileLabel = document.getElementById('layerFileName');

    if (!modal || !table) return;

    table.innerHTML = '';
    fileLabel.textContent = `📁 الملف: ${fileName || 'غير معروف'}`;

    layersInfo.forEach((info, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${info.name || '-'}</td>
            <td>${info.geometry || '-'}</td>
            <td>${info.count || 0}</td>
            <td>
                <button class="btn-view-layer" data-index="${index}">
                    <span class="icon">👁️</span> عرض
                </button>
            </td>
        `;
        table.appendChild(tr);
    });

    // Attach event listeners
    table.querySelectorAll('.btn-view-layer').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            selectLayerFromPicker(index);
        });
    });

    openModal('layerPickerModal');
}

function selectLayerFromPicker(index) {
    const layerInfo = (window._layerCandidates || [])[index];
    if (!layerInfo) return;

    try {
        addGeoJSONLayer(layerInfo.data, layerInfo.name, getDefaultStyle());
        closeModal('layerPickerModal');
        showStatus('uploadStatus', `✅ تمت إضافة الطبقة: ${layerInfo.name}`, 'success');
    } catch (error) {
        console.error('خطأ في إضافة الطبقة:', error);
        showStatus('uploadStatus', `❌ خطأ: ${error.message}`, 'error');
    }
}

/* =====================================
   UTILITY FUNCTIONS
   ===================================== */

function detectGeometryType(geojson) {
    if (!geojson || !geojson.features || geojson.features.length === 0) {
        return 'غير معروف';
    }

    const types = new Set();
    geojson.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type) {
            types.add(feature.geometry.type);
        }
    });

    const typeArray = Array.from(types);
    if (typeArray.length === 1) {
        return translateGeometryType(typeArray[0]);
    } else {
        return 'مختلط (' + typeArray.map(t => translateGeometryType(t)).join(', ') + ')';
    }
}

function translateGeometryType(type) {
    const translations = {
        'Point': 'نقطة',
        'MultiPoint': 'نقاط متعددة',
        'LineString': 'خط',
        'MultiLineString': 'خطوط متعددة',
        'Polygon': 'مضلع',
        'MultiPolygon': 'مضلعات متعددة',
        'GeometryCollection': 'مجموعة هندسية'
    };
    return translations[type] || type;
}

function truncate(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.textContent = message;
    element.className = 'status-message';

    // Apply styling based on type
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        warning: '#ff9800',
        info: '#2196F3'
    };

    element.style.color = colors[type] || colors.info;
    element.style.backgroundColor = `${colors[type] || colors.info}15`;
    element.style.padding = '10px';
    element.style.borderRadius = '8px';
    element.style.border = `2px solid ${colors[type] || colors.info}`;

    // Auto-clear after 5 seconds
    setTimeout(() => {
        element.textContent = '';
        element.style.cssText = '';
    }, 5000);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('show');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('show');
    }
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        if (modalId) {
            closeModal(modalId);
        }
    }
});

/* =====================================
   CONSOLE BRANDING
   ===================================== */

console.log('%c🌍 JoUTricks GIS Viewer v3.5', 'color: #667eea; font-size: 20px; font-weight: bold;');
console.log('%cDeveloped by Dr. Youssef Seleim', 'color: #764ba2; font-size: 14px;');
console.log('%cJoUTricks - Learn Smart. Work Smarter.', 'color: #CD980E; font-size: 12px;');
