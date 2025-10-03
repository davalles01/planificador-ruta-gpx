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

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupFileInput();
  setupDragAndDrop();
  setupWaypointEditing();
  setupWaypointEditorForm();
  document.getElementById('generarTablaBtn').addEventListener('click', generarTabla);

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
    map.removeLayer(capaSatelite);
    capaEstandar.addTo(map);
    btnMapaEstandar.classList.add("active");
    btnMapaSatelite.classList.remove("active");
  });

  btnMapaSatelite.addEventListener('click', () => {
    map.removeLayer(capaEstandar);
    capaSatelite.addTo(map);
    btnMapaSatelite.classList.add("active");
    btnMapaEstandar.classList.remove("active");
  });

  // Alternar curvas de nivel
  let curvasActivas = false;
  btnCurvasNivel.addEventListener('click', () => {
    if (curvasActivas) {
      btnCurvasNivel.textContent = "🏔️ Poner curvas de nivel";
      map.removeLayer(capaCurvas);
      curvasActivas = false;
    } else {
      btnCurvasNivel.textContent = "❌ Quitar curvas de nivel";
      capaCurvas.addTo(map);
      curvasActivas = true;
    }
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

function setupWaypointEditing() {
  const selectBtn = document.getElementById('selectWaypointBtn');
  const addBtn = document.getElementById('addWaypointBtn');
  const removeBtn = document.getElementById('removeWaypointBtn');
  const status = document.getElementById('editModeStatus');

  const updateStatus = () => {
    let text = "selección";
    if (editMode === "add") text = "añadir waypoint";
    if (editMode === "remove") text = "eliminar waypoint";
    status.textContent = `Modo edición: ${text}`;
  };

  function intentarCambiarModo(nuevoModo) {
    if (temporalWaypointActivo) {
      alert("Termina de guardar o cancelar el waypoint antes de cambiar de modo.");
      return; // bloqueamos el cambio de modo
    }
    if (selectedWaypoint) hideWaypointEditor();
    editMode = nuevoModo;
    updateStatus();
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
}

function addWaypoint(latLng) {
  if (!gpxXML) return;
  if (temporalWaypointActivo) {
    alert("Ya hay un waypoint temporal activo. Guarda o cancela antes de añadir otro.");
    return;
  }

  // Buscar el trkpt más cercano
  const closestPt = getClosestTrkpt(latLng.lat, latLng.lng, 0.025)
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
    elevationControl.clear();  // Limpiar perfil anterior
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
    // Polyline para mostrar en el mapa
    trackPolyline = L.polyline(latlngs, { color: 'red' }).addTo(map);
    map.fitBounds(trackPolyline.getBounds());

    // Solo añadir el track al perfil de elevación
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
function generarTabla() {
  const num = document.getElementById('numPersonas').value;
  const edad = document.getElementById('edadMedia').value;
  alert(`Tabla pendiente de implementar\nPersonas: ${num}\nEdad media: ${edad}`);
}

document.getElementById('downloadGPXBtn').addEventListener('click', () => {
  if (!gpxXML) return;

  const serializer = new XMLSerializer();
  const gpxStr = serializer.serializeToString(gpxXML);
  const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = "ruta_modificada.gpx";
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
  waypoints.sort((a, b) => {
    const ia = (typeof a.closestTrkptIndex === "number") ? a.closestTrkptIndex : Infinity;
    const ib = (typeof b.closestTrkptIndex === "number") ? b.closestTrkptIndex : Infinity;
    return ia - ib;
  });
}