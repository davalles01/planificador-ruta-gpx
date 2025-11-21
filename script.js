let temporalWaypointActivo = false;
let elevationControl;
let gpxXML = null; // XML original cargado
let map;
let trackPolyline;
let waypoints = [];
let editMode = "select"; // "select" | "add" | "remove"
let selectedWaypoint = null;

// Historial de waypoints
let waypointHistory = [];
let waypointHistoryIndex = -1;

// Decorador de la polyline
let polylineDecorator = null;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupFileInput();
  setupDragAndDrop();
  setupWaypointEditing();
  setupWaypointEditorForm();
  document.getElementById('generarTablaBtn').addEventListener('click', generarTablaWaypoints);

  //Generamos la funcionalidad de los botones undo redo
  document.getElementById('undoWaypointBtn').addEventListener('click', () => {
    if (waypointHistoryIndex > 0) {
      waypointHistoryIndex--;
      restoreWaypointHistory(waypointHistoryIndex);
    }
  });

  document.getElementById('redoWaypointBtn').addEventListener('click', () => {
    if (waypointHistoryIndex < waypointHistory.length - 1) {
      waypointHistoryIndex++;
      restoreWaypointHistory(waypointHistoryIndex);
    }
  });

  // Configuración del tema
  const lightBtn = document.getElementById('lightModeBtn');
  const darkBtn = document.getElementById('darkModeBtn');
  
  // Comprobar si hay un tema guardado
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    lightBtn.classList.remove('active');
    darkBtn.classList.add('active');
  }
  
  lightBtn.addEventListener('click', () => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
    lightBtn.classList.add('active');
    darkBtn.classList.remove('active');
  });
  
  darkBtn.addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    lightBtn.classList.remove('active');
    darkBtn.classList.add('active');
  });
});

// ===============================
// MAPA
// ===============================
function initMap() {
  // Crear mapa centrado en España
  map = L.map('map').setView([40.0, -3.7], 7);

  // --- Capas base ---
  const capaEstandar = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  const capaSatelite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }
  );

  // --- Capa superpuesta: curvas de nivel ---
  const capaCurvas = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
    }
  );

  // Añadir mapa estándar por defecto
  capaEstandar.addTo(map);

  const btnMapaEstandar = document.getElementById("btnMapaEstandar");
  const btnMapaSatelite = document.getElementById("btnMapaSatelite");
  const btnCurvasNivel = document.getElementById("btnCurvasNivel");

  btnMapaEstandar.classList.add("active");

  // --- Eventos de botones ---
  btnMapaEstandar.addEventListener('click', () => {
    // Quitar todas las capas
    map.removeLayer(capaSatelite);
    map.removeLayer(capaCurvas);
    // Añadir capa estándar
    capaEstandar.addTo(map);
    // Actualizar botones
    btnMapaEstandar.classList.add("active");
    btnMapaSatelite.classList.remove("active");
    btnCurvasNivel.classList.remove("active");
  });

  btnMapaSatelite.addEventListener('click', () => {
    // Quitar todas las capas
    map.removeLayer(capaEstandar);
    map.removeLayer(capaCurvas);
    // Añadir capa satélite
    capaSatelite.addTo(map);
    // Actualizar botones
    btnMapaSatelite.classList.add("active");
    btnMapaEstandar.classList.remove("active");
    btnCurvasNivel.classList.remove("active");
  });

  btnCurvasNivel.addEventListener('click', () => {
    // Quitar todas las capas
    map.removeLayer(capaEstandar);
    map.removeLayer(capaSatelite);
    // Añadir capa de curvas
    capaCurvas.addTo(map);
    // Actualizar botones
    btnCurvasNivel.classList.add("active");
    btnMapaEstandar.classList.remove("active");
    btnMapaSatelite.classList.remove("active");
  });

  // ===============================
  // PERFIL DE ELEVACIÓN
  // ===============================
  elevationControl = L.control.elevation({
    theme: "lime-theme",   // Tema del gráfico
    detached: true,        // Se renderiza en un contenedor externo
    elevationDiv: "#elevation-div",
    followMarker: false,   // No queremos que se mueva un marcador sobre el mapa
    imperial: false,       // Unidades métricas
    distanceMarkers: true, // Km marcados en el eje X
    collapsed: false
  });
  elevationControl.addTo(map);
}

// ===============================
// EDICIÓN DE WAYPOINTS
// ===============================

function createWaypointObject({ lat, lon, ele = 0, name = "", desc = "", xmlNode = null, original = false, iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png', pos = 0}) {
  // Crear marcador (NO draggable)
  const marker = L.marker([lat, lon], { draggable: false }).addTo(map);

  // Contenido del tooltip al hacer hover
  const tooltipContent = `
    <div>
      <strong>${name || '(Sin nombre)'}</strong><br>
      Elevación: ${ele.toFixed(1)} m<br>
      Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}
    </div>
  `;
  marker.bindTooltip(tooltipContent, {
    permanent: false,
    direction: 'top',
    className: 'waypoint-tooltip',
    offset: [0, -30]
  });

  const icon = L.icon({
    iconUrl: iconUrl,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  marker.setIcon(icon);

  const waypoint = { marker, name, desc, ele, lat, lon, original, xmlNode };

  // Evento de click para abrir el menú de edición
  marker.on('click', () => onWaypointClick({marker, pos}));

  waypoints.push(waypoint);
  return waypoint;
}

function updateEditModeButtons() {
  const selectBtn = document.getElementById('selectWaypointBtn');
  const addBtn = document.getElementById('addWaypointBtn');
  const removeBtn = document.getElementById('removeWaypointBtn');

  // Quitar clase active de todos los botones
  selectBtn.classList.remove('active');
  addBtn.classList.remove('active');
  removeBtn.classList.remove('active');

  // Añadir clase active al botón correspondiente
  switch(editMode) {
    case "select":
      selectBtn.classList.add('active');
      break;
    case "add":
      addBtn.classList.add('active');
      break;
    case "remove":
      removeBtn.classList.add('active');
      break;
  }
}

function setupWaypointEditing() {
  const selectBtn = document.getElementById('selectWaypointBtn');
  const addBtn = document.getElementById('addWaypointBtn');
  const removeBtn = document.getElementById('removeWaypointBtn');
  const status = document.getElementById('editModeStatus');

  function intentarCambiarModo(nuevoModo) {
    if (temporalWaypointActivo) {
      alert("Termina de guardar o cancelar el waypoint antes de cambiar de modo.");
      return; // bloqueamos el cambio de modo
    }
    if (selectedWaypoint) hideWaypointEditor();
    editMode = nuevoModo;
    updateEditModeButtons();
  }

  selectBtn.addEventListener('click', () => {
    intentarCambiarModo("select");
  });

  addBtn.addEventListener('click', () => {
    intentarCambiarModo(editMode === "add" ? "select" : "add");
  });

  removeBtn.addEventListener('click', () => {
    intentarCambiarModo(editMode === "remove" ? "select" : "remove");
  });

  map.on('click', (e) => {
    if (editMode === "add") addWaypoint(e.latlng);
  });

  updateEditModeButtons();
}

function addWaypoint(latLng) {
  if (!gpxXML) return;
  if (temporalWaypointActivo) {
    alert("Ya hay un waypoint temporal activo. Guarda o cancela antes de añadir otro.");
    return;
  }

  // Buscar el trkpt más cercano
  const closestPt = getClosestTrkpt(latLng.lat, latLng.lng, 0.05)
  if (!closestPt) {
    // Mostrar un pop-up temporal si no hay un trackpoint cercano
    const popup = L.popup()
      .setLatLng(latLng)
      .setContent("Selecciona un punto dentro de la ruta")
      .openOn(map);

    // Cerrar el pop-up después de 3 segundos
    setTimeout(() => {
      map.closePopup(popup);
    }, 3000);
    return;
  }

  const lat = parseFloat(closestPt.getAttribute('lat'));
  const lon = parseFloat(closestPt.getAttribute('lon'));
  const eleNode = closestPt.getElementsByTagName('ele')[0];
  const ele = eleNode ? parseFloat(eleNode.textContent) : 0;

  // Crear waypoint temporal (sin nombre ni descripción todavía)
  const tempWaypoint = createWaypointObject({
    lat,
    lon,
    ele,
    name: "",
    desc: "",
    xmlNode: null,
    original: false,
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'
  });

  temporalWaypointActivo = true;
  selectedWaypoint = tempWaypoint;

  // Mostrar el editor de waypoint
  showWaypointEditor(tempWaypoint);

  // Botones
  const form = document.getElementById('waypointForm');
  const cancelBtn = document.getElementById('cancelEdit');

  form.onsubmit = null;
  cancelBtn.onclick = null;

  // Guardar
  form.onsubmit = (e) => {
    e.preventDefault();

    let nameInput = document.getElementById('wptName').value.trim();
    const descInput = document.getElementById('wptDesc').value.trim();

    // Si no se ha puesto nombre → usar Waypoint_n
    if (!nameInput) {
      const num = waypoints.length + 1;
      nameInput = `Waypoint_${num}`;
    }

    // Crear nodo XML
    const newWpt = gpxXML.createElement("wpt");
    newWpt.setAttribute("lat", lat);
    newWpt.setAttribute("lon", lon);

    const eleNodeNew = gpxXML.createElement("ele");
    eleNodeNew.textContent = ele;
    newWpt.appendChild(eleNodeNew);

    const nameNode = gpxXML.createElement("name");
    nameNode.textContent = nameInput;
    newWpt.appendChild(nameNode);

    const descNode = gpxXML.createElement("desc");
    descNode.textContent = descInput;
    newWpt.appendChild(descNode);

    gpxXML.documentElement.appendChild(newWpt);

    // Actualizar el objeto temporal con los datos reales
    tempWaypoint.name = nameInput;
    tempWaypoint.desc = descInput;
    tempWaypoint.xmlNode = newWpt;

    // Actualizar tooltip con los datos definitivos
    updateWaypointTooltip(tempWaypoint);

    // Cambiar icono al normal (rojo)
    tempWaypoint.marker.setIcon(L.icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    }));

    // Guardar definitivamente en la lista
    waypoints.push(tempWaypoint);
    ordenarWaypointsPorTrack();
    saveWaypointHistory();

    // Reset estado
    temporalWaypointActivo = false;
    selectedWaypoint = null;
    hideWaypointEditor();
  };

  // Cancelar
  cancelBtn.onclick = () => {
    map.removeLayer(tempWaypoint.marker);
    temporalWaypointActivo = false;
    selectedWaypoint = null;
    hideWaypointEditor();
  };
}

// Ejemplo de control de cambio de modo
function cambiarModo(nuevoModo) {
  if (temporalWaypointActivo) {
    const confirmar = confirm("Hay un waypoint temporal activo que se perderá. ¿Deseas continuar?");
    if (!confirmar) return;
  }
  modoEdicion = nuevoModo;
  actualizarEstadoUI();
}

function onWaypointClick({marker, pos = 0}) {
  const waypoint = waypoints.find(w => w.marker === marker);
  if (!waypoint) return;

  if (editMode === "remove") {
    if(pos == 1){
      const seguro = confirm(`¿Estás seguro de que quieres eliminar el waypoint "${waypoint.name}"? Es el inicio de ruta.`);
      if (!seguro) return;
    } else if(pos == 2){
      const seguro = confirm(`¿Estás seguro de que quieres eliminar el waypoint "${waypoint.name}"?  Es el final de ruta.`);
      if (!seguro) return;
    } 

    map.removeLayer(marker);
    waypoints = waypoints.filter(w => w !== waypoint);
    ordenarWaypointsPorTrack();
    saveWaypointHistory();
    if (waypoint.xmlNode && gpxXML) waypoint.xmlNode.parentNode.removeChild(waypoint.xmlNode);
    if (selectedWaypoint === waypoint) hideWaypointEditor();
    return;
  }

  if (editMode === "select") {
    selectedWaypoint = waypoint;
    showWaypointEditor(waypoint);
    saveWaypointHistory();
  }
}

function getClosestTrkpt(lat, lon, maxDistance = 0.015) { // maxDistance en km. Por defecto 15 m
  if (!gpxXML) return null;
  const trkpts = gpxXML.getElementsByTagName('trkpt');
  let closestPt = null;
  let minDist = Infinity;
  for (let pt of trkpts) {
    const ptLat = parseFloat(pt.getAttribute('lat'));
    const ptLon = parseFloat(pt.getAttribute('lon'));
    const dist = haversine(lat, lon, ptLat, ptLon);
    if (dist < minDist) {
      minDist = dist;
      closestPt = pt;
    }
  }
  // Si el waypoint más cercano está más lejos que maxDistance, devolver null
  return minDist <= maxDistance ? closestPt : null;
}

// ===============================
// PANEL DE EDICIÓN DE WAYPOINT
// ===============================
function setupWaypointEditorForm() {
  const form = document.getElementById('waypointForm');
  const cancelBtn = document.getElementById('cancelEdit');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedWaypoint) return;

    const name = document.getElementById('wptName').value.trim();
    const desc = document.getElementById('wptDesc').value.trim();

    selectedWaypoint.name = name;
    selectedWaypoint.desc = desc;

    if (selectedWaypoint.xmlNode) {
      const nameNode = selectedWaypoint.xmlNode.getElementsByTagName('name')[0];
      const descNode = selectedWaypoint.xmlNode.getElementsByTagName('desc')[0];
      if (nameNode) nameNode.textContent = name;
      if (descNode) descNode.textContent = desc;
    }

    hideWaypointEditor();
  });

  cancelBtn.addEventListener('click', hideWaypointEditor);
}

function showWaypointEditor(waypoint) {
  document.getElementById('wptLat').textContent = waypoint.lat.toFixed(6);
  document.getElementById('wptLon').textContent = waypoint.lon.toFixed(6);
  document.getElementById('wptEle').textContent = waypoint.ele.toFixed(1) + ' m';
  document.getElementById('wptName').value = waypoint.name;
  document.getElementById('wptDesc').value = waypoint.desc;
  document.getElementById('waypoint-editor').style.display = 'block';
}

function hideWaypointEditor() {
  if (selectedWaypoint) {
    // Si no tiene nombre asignado, le ponemos uno automático
    if (!selectedWaypoint.name || selectedWaypoint.name.trim() === "") {
      const n = waypoints.indexOf(selectedWaypoint) + 1;
      selectedWaypoint.name = `Waypoint_${n}`;

      // Actualizar XML si existe
      if (selectedWaypoint.xmlNode) {
        const nameNode = selectedWaypoint.xmlNode.getElementsByTagName('name')[0];
        if (nameNode) nameNode.textContent = selectedWaypoint.name;
      }
    }
  }

  document.getElementById('waypoint-editor').style.display = 'none';
  selectedWaypoint = null;
}

// ===============================
// GPX TRACK
// ===============================
function parseTrack(xml) {
  if (trackPolyline) {
    map.removeLayer(trackPolyline);
    if (polylineDecorator) map.removeLayer(polylineDecorator); // Limpiar flechas anteriores
    elevationControl.clear();
  }

  const trkpts = xml.getElementsByTagName('trkpt');
  const latlngs = [];
  for (let pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleNode = pt.getElementsByTagName('ele')[0];
    const ele = eleNode ? parseFloat(eleNode.textContent) : 0;

    // Crear LatLng con altitud
    const latlng = L.latLng(lat, lon, ele);
    latlngs.push(latlng);
  }

  if (latlngs.length > 0) {
    trackPolyline = L.polyline(latlngs, { color: 'red', weight: 5 }).addTo(map);
    map.fitBounds(trackPolyline.getBounds());

    // Flechas de dirección cada N puntos
    const totalPoints = latlngs.length;
    let step = Math.floor(totalPoints / 20); // Ajusta "20" para más/menos flechas
    if (step < 1) step = 1;

    // Borra decoraciones previas si las hay
    if (polylineDecorator) map.removeLayer(polylineDecorator);

    // Crea el decorador
    polylineDecorator = L.polylineDecorator(trackPolyline, {
      patterns: [
        {
          offset: 0,
          repeat: `${step}px`, // O usa `${step*3}px` para espaciar más
          symbol: L.Symbol.arrowHead({
            headAngle: 35,
            pixelSize: 12,
            polygon: true,
            pathOptions: { stroke: true, color: '#fffb00ff', weight: 2, fill: true, fillColor: '#fffb00ff', fillOpacity: 1 }
          })
        }
      ]
    }).addTo(map);

    elevationControl.clear();
    elevationControl.addData(trackPolyline);
    calcularInfoTrack(xml);
  }
}

// ===============================
// GPX FILE & DRAG&DROP
// ===============================
function setupFileInput() {
  document.getElementById('gpxFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) parseGPXFile(file);
  });
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('hover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    const file = e.dataTransfer.files[0];
    if (file) parseGPXFile(file);
  });
}

function parseGPXFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    gpxXML = new DOMParser().parseFromString(e.target.result, "application/xml");

    // Obtener el nombre de la ruta del GPX (ajusta el selector según tu estructura XML)
    const nameElement = gpxXML.querySelector('trk > name');
    const trackName = nameElement ? nameElement.textContent : file.name.replace('.gpx', '');
    
    // Establecer el nombre en el input
    document.getElementById('trackName').value = trackName;

    // Procesar track y calcular información
    const trkpts = gpxXML.getElementsByTagName('trkpt');
    const numTrkpts = trkpts.length;

    // Calcula la distancia total
    const totalDistance = calcularInfoTrack(gpxXML);

    // Densidad de trackpoints
    const trkptDensity = totalDistance / numTrkpts;

    // Verifica si la densidad supera el umbral
    if (trkptDensity > 0.015) {
      const continuar = confirm(
        `El archivo no tiene la exactitud idónea para algunas funcionalidades. ` +
        `Densidad de trackpoints: ${trkptDensity.toFixed(3)} km/pt. ¿Deseas continuar?`
      );
      if (!continuar) {
        return;
      }
    }

    // Si el usuario decide continuar o la densidad es adecuada, procede con la carga
    rebuildWaypointsFromXML(gpxXML);
    parseTrack(gpxXML);
    elevationControl.loadGPX(gpxXML);
  };
  reader.readAsText(file);
}

function rebuildWaypointsFromXML(xml) {
  // Borrar marcadores antiguos
  waypoints.forEach(w => map.removeLayer(w.marker));
  waypoints = [];
  const wptNodes = xml.getElementsByTagName('wpt');
  const latlngs = [];
  let iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png';
  const trkpts = xml.getElementsByTagName('trkpt');
  let pos;

  for (let i = 0; i < wptNodes.length; i++) {
    pos = 0;
    const w = wptNodes[i];
    const lat = parseFloat(w.getAttribute('lat'));
    const lon = parseFloat(w.getAttribute('lon'));

    // Buscar el trkpt más cercano dentro de un rango de error aceptable (15m)
    const closestPt = getClosestTrkpt(lat, lon);
    if (closestPt) {
      // Ajustar el waypoint a la posición del trackpoint más cercano
      const closestLat = parseFloat(closestPt.getAttribute('lat'));
      const closestLon = parseFloat(closestPt.getAttribute('lon'));
      const eleNode = w.getElementsByTagName('ele')[0];
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
      const nameNode = w.getElementsByTagName('name')[0];
      const descNode = w.getElementsByTagName('desc')[0];
      let name = nameNode ? nameNode.textContent : "";
      let desc = descNode ? descNode.textContent : "";

      // Asignamos el color del icono y creamos inicio y final de ruta si hace falta
      if (i === 0) {
        iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png';
        pos = 1;
        const firstPt = trkpts[0];
        const firstLat = parseFloat(firstPt.getAttribute('lat'));
        const firstLon = parseFloat(firstPt.getAttribute('lon'));
        const firstEleNode = firstPt.getElementsByTagName('ele')[0];
        const firstEle = firstEleNode ? parseFloat(firstEleNode.textContent) : 0;
        if(haversine(closestLat, closestLon, firstLat, firstLon) > 0.1 ){// Si la distancia con el primer punto del track es mayor a 100 m, se crea un inicio de track
          createWaypointObject({ lat: firstLat, lon: firstLon, ele: firstEle, name:'Inicio de ruta', desc:'', original: true, iconUrl: iconUrl, pos: pos});
          iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png'; // Reasignamos el color azul para el waypoint
        } else {
          name = name + ' - Inicio de Ruta';
        }
      } else if (i === wptNodes.length - 1) {
        iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png';
        pos = 2;
        const lastPt = trkpts[trkpts.length - 1];
        const lastLat = parseFloat(lastPt.getAttribute('lat'));
        const lastLon = parseFloat(lastPt.getAttribute('lon'));
        const lastEleNode = lastPt.getElementsByTagName('ele')[0];
        const lastEle = lastEleNode ? parseFloat(lastEleNode.textContent) : 0;
        if(haversine(closestLat, closestLon, lastLat, lastLon) > 0.1 ){// Si la distancia con el último punto del track es mayor a 100 m, se crea un final de track
          createWaypointObject({ lat: lastLat, lon: lastLon, ele: lastEle, name:'Final de ruta', desc:'', original: true, iconUrl: iconUrl, pos: pos});
          iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png'; // Reasignamos el color azul para el waypoint
        } else {
          name = name + ' - Final de Ruta';
        }
      } else{
        iconUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png';
      }

      createWaypointObject({ lat: closestLat, lon: closestLon, ele, name, desc, xmlNode: w, original: true, iconUrl: iconUrl, pos: pos});
      latlngs.push([closestLat, closestLon]);
    }
  }
  if (latlngs.length > 0) {
    map.fitBounds(L.latLngBounds(latlngs));
  }
  ordenarWaypointsPorTrack();
  saveWaypointHistory();
}

// ===============================
// INFO TRACK / DISTANCIA
// ===============================
function calcularInfoTrack(xml) {
  let distanciaTotal = 0, desnivelPos = 0, desnivelNeg = 0;
  const trksegs = xml.getElementsByTagName('trkseg');
  for (let seg of trksegs) {
    const trkpts = seg.getElementsByTagName('trkpt');
    let prevLat = null, prevLon = null, prevEle = null;
    for (let i = 0; i < trkpts.length; i++) {
      const pt = trkpts[i];
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleNode = pt.getElementsByTagName('ele')[0];
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
      if (i > 0 && prevLat !== null) {
        distanciaTotal += haversine(prevLat, prevLon, lat, lon);
        const diffEle = ele - prevEle;
        if (diffEle > 0) desnivelPos += diffEle;
        else if (diffEle < 0) desnivelNeg += Math.abs(diffEle);
      }
      prevLat = lat;
      prevLon = lon;
      prevEle = ele;
    }
  }
  document.getElementById('distancia').textContent = distanciaTotal.toFixed(2);
  document.getElementById('desnivelPos').textContent = desnivelPos.toFixed(0);
  document.getElementById('desnivelNeg').textContent = desnivelNeg.toFixed(0);
  const tiempoHoras = (distanciaTotal / 4) + (desnivelPos / 400);
  const h = Math.floor(tiempoHoras);
  const m = Math.round((tiempoHoras - h) * 60);
  document.getElementById('duracion').textContent = `${h}h ${m}min`;

  return distanciaTotal; // Devuelve la distancia total calculada
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c / 1000;
}

// ===============================
// TABLA Y DESCARGA GPX
// ===============================
document.getElementById('downloadGPXBtn').addEventListener('click', () => {
  if (!gpxXML) return;

  // Actualizar el nombre en el XML antes de guardar
  const newName = document.getElementById('trackName').value.trim();
  const nameElement = gpxXML.querySelector('trk > name');
  if (nameElement) {
    nameElement.textContent = newName;
  } else {
    // Si no existe el elemento nombre, créalo
    const trkElement = gpxXML.querySelector('trk');
    if (trkElement) {
      const newNameElement = gpxXML.createElement('name');
      newNameElement.textContent = newName;
      trkElement.insertBefore(newNameElement, trkElement.firstChild);
    }
  }

  const serializer = new XMLSerializer();
  const gpxStr = serializer.serializeToString(gpxXML);
  const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = newName + ".gpx";  // Usar el nuevo nombre para el archivo
  a.click();
  
  URL.revokeObjectURL(url);
});

function updateWaypointTooltip(waypoint) {
  const tooltipContent = `
    <div>
      <strong>${waypoint.name || '(Sin nombre)'}</strong><br>
      Elevación: ${waypoint.ele.toFixed(1)} m<br>
      Lat: ${waypoint.lat.toFixed(5)}, Lon: ${waypoint.lon.toFixed(5)}
    </div>
  `;
  waypoint.marker.setTooltipContent(tooltipContent);
}

// FUNCIONES HISTORIAL Y BOTONES UNDO REDO

function saveWaypointHistory() {
  // Crea una copia profunda del estado actual
  const snapshot = waypoints.map(w => ({
    lat: w.lat,
    lon: w.lon,
    ele: w.ele,
    name: w.name,
    desc: w.desc,
    // Puedes guardar más campos si necesitas (original, iconUrl, etc)
  }));

  // Si estás en medio del historial (después de un undo), descarta los "redos"
  if (waypointHistoryIndex < waypointHistory.length - 1) {
    waypointHistory = waypointHistory.slice(0, waypointHistoryIndex + 1);
  }

  waypointHistory.push(snapshot);
  waypointHistoryIndex = waypointHistory.length - 1;
}

function restoreWaypointHistory(index) {
  // Evita restaurar fuera de rango
  if (index < 0 || index >= waypointHistory.length) return;

  // Elimina los waypoints actuales del mapa
  waypoints.forEach(w => map.removeLayer(w.marker));
  waypoints = [];

  // Reconstruye cada waypoint del snapshot
  const snapshot = waypointHistory[index];
  snapshot.forEach(w => {
    createWaypointObject({
      lat: w.lat,
      lon: w.lon,
      ele: w.ele,
      name: w.name,
      desc: w.desc,
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png'
    });
  });
  ordenarWaypointsPorTrack();
}

// ORDENAR WAYPOINTS

function ordenarWaypointsPorTrack() {
    if (!gpxXML || !waypoints || waypoints.length === 0) return;

    // Obtener todos los trackpoints una sola vez
    const trkpts = Array.from(gpxXML.getElementsByTagName('trkpt'));
    if (trkpts.length === 0) return;

    // Para cada waypoint, encontrar el índice del trackpoint más cercano
    waypoints.forEach(wpt => {
        let minDist = Infinity;
        let minIdx = 0;
        for (let i = 0; i < trkpts.length; i++) {
            const trkLat = parseFloat(trkpts[i].getAttribute('lat'));
            const trkLon = parseFloat(trkpts[i].getAttribute('lon'));
            const dist = Math.abs(wpt.lat - trkLat) + Math.abs(wpt.lon - trkLon);
            if (dist < minDist) {
                minDist = dist;
                minIdx = i;
            }
        }
        wpt._trkIdx = minIdx; // Guardar el índice del trackpoint más cercano
    });

    // Ordenar los waypoints por el índice del trackpoint más cercano
    waypoints.sort((a, b) => a._trkIdx - b._trkIdx);

    // Eliminar posibles duplicados consecutivos (mismo punto)
    for (let i = waypoints.length - 1; i > 0; i--) {
        if (waypoints[i]._trkIdx === waypoints[i - 1]._trkIdx) {
            // Elimina el segundo (puedes cambiar la lógica si prefieres el primero)
            waypoints.splice(i, 1);
        }
    }
}

// Función para convertir coordenadas GPS a UTM (zona 31T)
function convertirUTM(lat, lon) {
    // Parámetros del elipsoide WGS84
    const a = 6378137;
    const f = 1 / 298.257223563;
    const e2 = 2 * f - f * f;
    
    // Zona UTM 31T
    const zonaCentral = -3; // Meridiano central de la zona 31
    
    // Conversión a radianes
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    
    // Parámetros de la proyección
    const k0 = 0.9996;
    const FalsoEste = 500000;
    const FalsoNorte = (lat < 0) ? 10000000 : 0;
    
    // Cálculos intermedios
    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad)**2);
    const T = Math.tan(latRad)**2;
    const C = e2 / (1 - e2) * Math.cos(latRad)**2;
    const A = (lonRad - (zonaCentral * Math.PI / 180)) * Math.cos(latRad);
    
    // Cálculo de coordenadas UTM
    const M = a * ((1 - e2/4 - 3*e2**2/64 - 5*e2**3/256) * latRad - 
               (3*e2/8 + 3*e2**2/32 + 45*e2**3/1024) * Math.sin(2*latRad) + 
               (15*e2**2/256 + 45*e2**3/1024) * Math.sin(4*latRad) - 
               (35*e2**3/3072) * Math.sin(6*latRad));
    
    const Este = k0 * N * (A + (1 - T + C) * A**3/6 + 
                (5 - 18*T + T**2 + 72*C - 58*e2) * A**5/120) + FalsoEste;
    
    const Norte = k0 * (M + N * Math.tan(latRad) * 
                (A**2/2 + (5 - T + 9*C + 4*C**2) * A**4/24 + 
                (61 - 58*T + T**2 + 600*C - 330*e2) * A**6/720)) + FalsoNorte;
    
    return {
        x: Este / 1000, // Convertir a km
        y: Norte // Ya está en metros
    };
}

// Variables globales para penalizaciones, descansos y notas (persisten entre renders)
let penalizaciones = [];
let descansos = [];
let notasArray = [];
let horaInicio = "08:00";

function generarTablaWaypoints() {
  // Validación previa
  let isValid = true;
  if (!document.getElementById('numPersonas').value) {
    document.getElementById('numPersonas').classList.add('validation-error');
    mostrarAviso('Introduce el número de personas');
    isValid = false;
  }
  if (!document.getElementById('nivelTecnico').value) {
    document.getElementById('nivelTecnico').classList.add('validation-error');
    mostrarAviso('Selecciona el nivel técnico del grupo');
    isValid = false;
  }
  if (!gpxXML) {
    document.getElementById('dropZone').classList.add('validation-error');
    mostrarAviso('Carga una ruta GPX primero');
    isValid = false;
  }
  if (!isValid) return;

  ordenarWaypointsPorTrack();

  // Datos base
  const trkpts = Array.from(gpxXML.getElementsByTagName('trkpt'));
  let container = document.getElementById('tables-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tables-container';
    document.body.appendChild(container);
  }
  container.innerHTML = '';
  container.style.display = 'block';

  // Inicialización de arrays persistentes
  if (penalizaciones.length !== waypoints.length) penalizaciones = Array(waypoints.length).fill(0);
  if (descansos.length !== waypoints.length) descansos = Array(waypoints.length).fill(0);
  if (notasArray.length !== waypoints.length) notasArray = Array(waypoints.length).fill("");

  // Inicializaciones para acumulados
  let acumuladoDist = 0, acumuladoPos = 0, acumuladoNeg = 0;
  let acumuladoTiempo = 0; // en minutos

  // Crear tabla
  const tabla = document.createElement('table');
  tabla.className = 'tabla-waypoints';

  // Cabecera compleja
  tabla.innerHTML = `
    <thead>
      <tr>
        <th rowspan="2">Waypoint</th>
        <th colspan="3">Distance</th>
        <th colspan="6">Timing</th>
        <th rowspan="2">Notes</th>
      </tr>
      <tr>
        <th>Position</th>
        <th>Segment</th>
        <th>Route</th>
        <th>Segment</th>
        <th>Penalty (%)</th>
        <th>Rest (min)</th>
        <th>Total</th>
        <th>Prog.</th>
        <th>Time</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tabla.querySelector('tbody');

  // Recorrer waypoints
  for (let i = 0; i < waypoints.length; i++) {
    const wpt = waypoints[i];
    const isStart = (i === 0);
    const isEnd = (i === waypoints.length - 1);

    // Coordenadas UTM (simplificadas; puedes mejorar con tu función)
    const utm = convertirUTM(wpt.lat, wpt.lon);
    const utmStr = `${String(Math.round(utm.x*1000)).padStart(5,"0")}E ${String(Math.round(utm.y)).slice(0,6)}N`;

    // Altitud
    const altitud = Math.round(wpt.ele) + "m";

    // Cálculos de tramo/segmento
    let segPos = 0, segNeg = 0, segDist = 0, segTiempo = 0;
    if (!isStart) {
      const prev = waypoints[i-1];
      const idxIni = prev._trkIdx, idxFin = wpt._trkIdx;
      let prevEle = trkpts[idxIni] ? parseFloat(trkpts[idxIni].getElementsByTagName('ele')[0].textContent) : prev.ele;
      for (let j = idxIni+1; j <= idxFin; j++) {
        const pt = trkpts[j];
        const ele = pt && pt.getElementsByTagName('ele')[0] ? parseFloat(pt.getElementsByTagName('ele')[0].textContent) : prevEle;
        segPos += Math.max(0, ele - prevEle);
        segNeg += Math.max(0, prevEle - ele);
        // Distancia entre puntos
        const lat1 = parseFloat(trkpts[j-1].getAttribute('lat'));
        const lon1 = parseFloat(trkpts[j-1].getAttribute('lon'));
        const lat2 = parseFloat(pt.getAttribute('lat'));
        const lon2 = parseFloat(pt.getAttribute('lon'));
        segDist += haversine(lat1, lon1, lat2, lon2);
        prevEle = ele;
      }
      // Tiempos por tramo (usa tus parámetros de velocidad si quieres)
      let baseTiempo = (segDist/4)*60 + (segPos/300) + (segNeg/500); // En minutos
      let penalizacion = penalizaciones[i] || 0;
      let descanso = descansos[i] || 0;
      segTiempo = baseTiempo * (1 + penalizacion/100) + descanso;
    }

    // Acumular valores
    if (!isStart) {
      acumuladoDist += segDist;
      acumuladoPos += segPos;
      acumuladoNeg += segNeg;
      acumuladoTiempo += segTiempo;
    }

    // Progresión
    let prog = (acumuladoDist / parseFloat(document.getElementById('distancia').textContent)) * 100;
    if (isNaN(prog)) prog = 0;

    // Hora de paso
    let horaPaso = horaInicio;
    if (!isStart) {
      let mins = Math.round(acumuladoTiempo);
      let [h, m] = horaInicio.split(":").map(x=>parseInt(x));
      m += mins;
      h += Math.floor(m / 60);
      m = m % 60;
      horaPaso = (""+h).padStart(2,"0")+":"+(""+m).padStart(2,"0");
    }

    // Notas
    let notasTxt = notasArray[i] && notasArray[i].trim() !== "" ? notasArray[i] : "<span class=\"notes-text\">No notes</span>";

    // Render fila
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="waypoint-nombre ${isStart?'waypoint-inicio':''} ${isEnd?'waypoint-fin':''}">
        ${isStart ? 'Start: ' : isEnd ? 'End: ' : ''}${wpt.name}
        <br>
        <label><input type="checkbox" class="decision-checkbox" data-wpt="${i}"> Decision point</label>
      </td>
      <td>
        <div class="coordenada">${utmStr}</div>
        <div class="altitud">${altitud}</div>
      </td>
      <td>
        ${isStart ? '—' : `
          <div><span class="positivo">↑${Math.round(segPos)}m</span></div>
          <div><span class="negativo">↓${Math.round(segNeg)}m</span></div>
          <div><span class="distancia">${segDist.toFixed(2)}km</span></div>
        `}
      </td>
      <td>
        <div><span class="positivo">↑${Math.round(acumuladoPos)}m</span></div>
        <div><span class="negativo">↓${Math.round(acumuladoNeg)}m</span></div>
        <div><span class="distancia">${acumuladoDist.toFixed(2)}km</span></div>
      </td>
      <td class="tiempo-tramo">
        ${isStart ? '—' : minutosAHHMM(segTiempo)}
      </td>
      <td class="editable-cell" data-type="penalty" data-idx="${i}">
        ${isStart ? '—' : `<span class="penalty-val">${penalizaciones[i] || 0}%</span><span class="edit-lapiz" title="Editar penalización">&#9998;</span>`}
      </td>
      <td class="editable-cell" data-type="rest" data-idx="${i}">
        ${isStart ? '—' : `<span class="rest-val">${descansos[i] || 0}min</span><span class="edit-lapiz" title="Editar descanso">&#9998;</span>`}
      </td>
      <td class="tiempo-total">
        ${minutosAHHMM(acumuladoTiempo)}
      </td>
      <td>
        ${Math.round(prog)}%
      </td>
      <td class="editable-cell hora-td" data-type="hora" data-idx="${i}">
        ${isStart ? `<input type="text" class="hora-editable" value="${horaInicio}" data-idx="${i}">` : `<span>${horaPaso}</span>`}
      </td>
      <td class="editable-cell notas-td" data-type="notas" data-idx="${i}">
        ${notasTxt}
        <span class="edit-lapiz" title="Editar notas">&#9998;</span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  container.appendChild(tabla);

  // Elimina botón anterior si existe
  let oldBtn = document.getElementById('downloadPDFBtn');
  if (oldBtn) oldBtn.remove();

  // Crea y añade el botón
  const pdfBtn = document.createElement('button');
  pdfBtn.id = "downloadPDFBtn";
  pdfBtn.textContent = "Descargar en Formato PDF";
  pdfBtn.className = "pdf-download-btn";
  container.appendChild(pdfBtn);

  // Centrar el botón
  pdfBtn.style.display = "block";
  pdfBtn.style.margin = "2rem auto 0 auto";

  // Evento
  pdfBtn.onclick = descargarTablaPDF;

  // Eventos de edición inline
  tabla.addEventListener('click', function(e) {
    // Penalización
    if (e.target.classList.contains('edit-lapiz') && e.target.parentNode.dataset.type === 'penalty') {
      const idx = parseInt(e.target.parentNode.dataset.idx);
      const td = e.target.parentNode;
      td.innerHTML = `<input type="number" min="0" max="100" value="${penalizaciones[idx] || 0}" style="width:3em;"> <span>%</span>
        <span class="edit-lapiz" title="Guardar">&#10004;</span>`;
      td.querySelector('input').focus();
      td.querySelector('.edit-lapiz').onclick = () => {
        const val = parseInt(td.querySelector('input').value) || 0;
        penalizaciones[idx] = val;
        generarTablaWaypoints();
      }
    }
    // Descanso
    if (e.target.classList.contains('edit-lapiz') && e.target.parentNode.dataset.type === 'rest') {
      const idx = parseInt(e.target.parentNode.dataset.idx);
      const td = e.target.parentNode;
      td.innerHTML = `<input type="number" min="0" max="240" value="${descansos[idx] || 0}" style="width:3em;"> <span>min</span>
        <span class="edit-lapiz" title="Guardar">&#10004;</span>`;
      td.querySelector('input').focus();
      td.querySelector('.edit-lapiz').onclick = () => {
        const val = parseInt(td.querySelector('input').value) || 0;
        descansos[idx] = val;
        generarTablaWaypoints();
      }
    }
    // Notas
    if (e.target.classList.contains('edit-lapiz') && e.target.parentNode.dataset.type === 'notas') {
      const idx = parseInt(e.target.parentNode.dataset.idx);
      const td = e.target.parentNode;
      td.innerHTML = `<input type="text" value="${notasArray[idx] || ""}" style="width:90%;">
        <span class="edit-lapiz" title="Guardar">&#10004;</span>`;
      td.querySelector('input').focus();
      td.querySelector('.edit-lapiz').onclick = () => {
        notasArray[idx] = td.querySelector('input').value;
        generarTablaWaypoints();
      }
    }
    // Hora de inicio
    if (e.target.classList.contains('hora-editable')) {
      e.target.onchange = function() {
        horaInicio = e.target.value;
        generarTablaWaypoints();
      }
    }
  });
}

// Función auxiliar: minutos a hh:mm
function minutosAHHMM(mins) {
  mins = Math.round(mins || 0);
  const h = Math.floor(mins/60);
  const m = mins%60;
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
}

async function descargarTablaPDF() {
  // 1. Recoge datos generales
  const nombre = document.getElementById('trackName').value.trim() || "Ruta GPX";
  const distancia = document.getElementById('distancia').textContent || "";
  const desnivelPos = document.getElementById('desnivelPos').textContent || "";
  const desnivelNeg = document.getElementById('desnivelNeg').textContent || "";
  const duracion = document.getElementById('duracion').textContent || "";

  const doc = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const marginX = 15;
  const usableWidth = doc.internal.pageSize.getWidth() - 2 * marginX;
  let y = 18;

  // Función para dividir texto largo en líneas
  function splitTextToLines(text, maxWidth, fontSize = 21, fontStyle = 'bold') {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, maxWidth);
  }

  // Título general (adaptado a varias líneas si es necesario)
  let tituloLineas = splitTextToLines(nombre, usableWidth);
  doc.setFontSize(21);
  doc.setFont("helvetica", "bold");
  let tituloY = y;
  tituloLineas.forEach((line, idx) => {
    doc.text(line, doc.internal.pageSize.getWidth()/2, tituloY, { align: "center" });
    tituloY += 8;
  });
  y = tituloY + 2;

  // Datos generales de la ruta
  doc.setFontSize(12);
  doc.setFont("helvetica","normal");
  doc.text(`Distancia:`, marginX, y);           doc.text(`${distancia} km`, marginX+38, y);
  y += 6;
  doc.text(`Desnivel positivo:`, marginX, y);   doc.text(`${desnivelPos} m`, marginX+38, y);
  y += 6;
  doc.text(`Desnivel negativo:`, marginX, y);   doc.text(`${desnivelNeg} m`, marginX+38, y);
  y += 6;
  doc.text(`Duración estimada:`, marginX, y);   doc.text(`${duracion}`, marginX+38, y);
  y += 10;

  // Tablas por tramo: varias por página, máximo 3 por página
  const tabla = document.querySelector('.tabla-waypoints');
  const filas = [...tabla.querySelectorAll("tbody tr")];
  const tramosPorPagina = 3;
  let tramosEnPag = 0;

  // Extraer cabeceras relevantes (las de la fila 2 del thead)
  // No hace falta, definidas manualmente

  // Función para limpiar contenido de celda y formatear desniveles
  const limpiarCelda = (html, tipo = "") => {
    let txt = html.replace(/[\u2191\u2193]/g, '')
                  .replace(/&nbsp;/g, " ")
                  .replace(/<\/?[^>]+(>|$)/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
    // Extraer desniveles y formatear +/-
    if (tipo === "desnivel") {
      // Busca todos los valores de desnivel y antepone +/-
      txt = txt.replace(/Desnivel \+?:?\s*(\d+)m/gi, (m, p1) => `+${p1} m`);
      txt = txt.replace(/Desnivel -:?\s*(\d+)m/gi, (m, p1) => `-${p1} m`);
      txt = txt.replace(/↑\s*(\d+)m/gi, (m, p1) => `+${p1} m`);
      txt = txt.replace(/↓\s*(\d+)m/gi, (m, p1) => `-${p1} m`);
    }
    // Para las distancias también
    txt = txt.replace(/(\d+\.\d+)km/g, '$1 km');
    return txt;
  };

  y += 2;

  for (let i = 0; i < filas.length; i++) {

    // PREPARA DATOS DEL TRAMO Y LA TABLA
    let celdas = Array.from(filas[i].children);

    // Nombres de campos
    let nombreTramo = filas[i].querySelector(".waypoint-nombre")?.childNodes[0]?.textContent.trim() || `Waypoint ${i+1}`;
    nombreTramo = nombreTramo.replace(/\n.*$/,''); // Quitar decision point
    let nombreTramoLineas = splitTextToLines(nombreTramo, usableWidth, 13, 'bold');

    // Prepara los datos clave (limpiando texto y símbolos)
    let datosFila = [
      ["Posición", limpiarCelda(celdas[1]?.innerText || "")],
      ["Desnivel y Distancia (segmento)", limpiarCelda(celdas[2]?.innerText || "", "desnivel")],
      ["Desnivel y Distancia (acumulado)", limpiarCelda(celdas[3]?.innerText || "", "desnivel")],
      ["Tiempo tramo", limpiarCelda(celdas[4]?.innerText || "")],
      ["Penalización", limpiarCelda(celdas[5]?.innerText || "")],
      ["Descanso", limpiarCelda(celdas[6]?.innerText || "")],
      ["Tiempo total", limpiarCelda(celdas[7]?.innerText || "")],
      ["Progresión", limpiarCelda(celdas[8]?.innerText || "")],
      ["Hora", limpiarCelda(celdas[9]?.innerText || "")],
      ["Notas", limpiarCelda(celdas[10]?.innerText || "")]
    ];

    // Calcula altura estimada: título + tabla
    let tempY = y;
    tempY += nombreTramoLineas.length * 5.5 + 2;
    tempY += (datosFila.length * 6.5) + 10; // tabla pequeña

    // Si no cabe, pasa página
    if (tempY > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 16;
      tramosEnPag = 0;
    }

    // Título del tramo, adaptado a varias líneas si es necesario
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    let tramoY = y;
    nombreTramoLineas.forEach((line, idx) => {
      doc.text(line, marginX, tramoY);
      tramoY += 5.5;
    });
    y = tramoY;

    // Define el color de cabecera según posición
    let cabeceraColor = [109,143,163]; // gris azulado por defecto
    if (i === 0) cabeceraColor = [56,204,108]; // verde
    else if (i === filas.length-1) cabeceraColor = [230,61,61]; // rojo

    // Usa autoTable en modo compacto
    doc.autoTable({
      head: [["Campo", "Valor"]],
      body: datosFila,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.5, rowPageBreak: 'avoid', halign: 'left', valign: 'middle', overflow: 'linebreak', minCellHeight: 5 },
      headStyles: { fillColor: cabeceraColor, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 10 },
      margin: { left: marginX, right: marginX },
      tableWidth: usableWidth,
      columnStyles: { 0: {cellWidth: 38}, 1: {cellWidth: usableWidth-38} }
    });

    y = doc.lastAutoTable.finalY + 7;
    tramosEnPag++;
    // Si ya hemos puesto los tramos por página máximos, fuerza salto, aunque el siguiente quepa
    if (tramosEnPag >= tramosPorPagina) {
      doc.addPage();
      y = 16;
      tramosEnPag = 0;
    }
  }

  // Añadir página con capturas de mapa y perfil de elevación
  try {
    // Antes de capturar, ajusta el zoom del mapa con fitBounds y un "padding extra" para que salga bien grande el track
    if (trackPolyline && typeof trackPolyline.getBounds === "function") {
      // Ajusta el mapa: centra y hace zoom al track con padding pequeño
      map.fitBounds(trackPolyline.getBounds(), {padding: [25,25], maxZoom: 14});
      // Espera a que el mapa renderice
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    doc.addPage();
    y = 16;
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text("Vista del Mapa", doc.internal.pageSize.getWidth()/2, y, { align: "center" });
    y += 3;

    // Captura solo el mapa Leaflet (canvas)
    const mapDiv = document.getElementById('map');
    const mapCanvas = await html2canvas(mapDiv, {
      useCORS: true,
      backgroundColor: null,
      width: mapDiv.offsetWidth,
      height: mapDiv.offsetHeight,
      windowWidth: document.body.scrollWidth,
      windowHeight: document.body.scrollHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
    const imgData = mapCanvas.toDataURL("image/png");
    const pageWidth = doc.internal.pageSize.getWidth() - 2*marginX;
    const mapRatio = mapDiv.offsetHeight / mapDiv.offsetWidth;
    const imgHeight = pageWidth * mapRatio * 0.6; // 0.6 para que no sea tan grande!
    doc.addImage(imgData, 'PNG', marginX, y+4, pageWidth, imgHeight, undefined, 'FAST');

    y += imgHeight + 14;

    // Captura del perfil de elevación
    doc.setFontSize(13);
    doc.setFont("helvetica","bold");
    doc.text("Perfil de Elevación", doc.internal.pageSize.getWidth()/2, y, { align: "center" });
    y += 3;

    const elevDiv = document.getElementById('elevation-div');
    const elevCanvas = await html2canvas(elevDiv, {useCORS: true, backgroundColor: null});
    const elevImg = elevCanvas.toDataURL("image/png");
    const elevRatio = elevDiv.offsetHeight / elevDiv.offsetWidth;
    const elevHeight = pageWidth * elevRatio * 0.8; // 0.8 = más pequeño que el mapa
    doc.addImage(elevImg, 'PNG', marginX, y+4, pageWidth, elevHeight, undefined, 'FAST');
  } catch (e) {
    // Si falla, no añadir imágenes
    console.warn("No se ha podido capturar el mapa o el perfil:", e);
  }

  // Descarga
  doc.save(`${nombre.replace(/[^a-z0-9]/gi,'_').toLowerCase()}_plan.pdf`);
}