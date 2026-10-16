// Mapa con un punto por registro (comparables o avalúos); al seleccionar uno se avisa con onSelect.
// Usa Leaflet y los mosaicos de OpenStreetMap que sirve el propio servidor con caché (/api/map-tiles).
(function (root) {
  const MARK = '#1f6fb5';
  const MARK_SELECTED = '#0a2f4f';
  const RING = '#ffffff';

  function createSummaryMap(container, { onSelect, emptyText = 'Sin ubicaciones para mostrar.' } = {}) {
    const map = L.map(container, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('/api/map-tiles/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
    }).addTo(map);
    map.setView([19.4326, -99.1332], 5);
    // La rueda del ratón solo hace zoom después de hacer clic en el mapa, para no atrapar el desplazamiento de la página.
    map.on('click', () => map.scrollWheelZoom.enable());
    container.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

    const layer = L.layerGroup().addTo(map);
    const markers = new Map();
    let selectedId = null;

    const empty = document.createElement('div');
    empty.className = 'map-empty';
    empty.textContent = emptyText;
    // Se oculta con style.display: el CSS de la página le da display:flex, que anularía el atributo hidden.
    empty.style.display = 'none';
    container.appendChild(empty);

    function style(point, selected) {
      return {
        radius: selected ? 11 : 7,
        // Punto hueco (relleno blanco): el borde va en azul para que se distinga sobre el mapa.
        color: selected ? MARK_SELECTED : (point.hollow ? MARK : RING),
        weight: selected ? 3 : 2,
        fillColor: point.hollow ? RING : (selected ? MARK_SELECTED : MARK),
        fillOpacity: point.hollow ? 0.9 : 1,
        dashArray: point.approximate && !selected ? '3 3' : null
      };
    }

    // Puntos que comparten coordenadas (comparables ubicados en la zona del sujeto) se abren en círculo para poder elegirlos.
    function spread(points) {
      const groups = new Map();
      points.forEach(point => {
        const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(point);
      });
      return points.map(point => {
        const group = groups.get(`${point.lat.toFixed(5)},${point.lon.toFixed(5)}`);
        if (group.length === 1) return { ...point, displayLat: point.lat, displayLon: point.lon };
        const index = group.indexOf(point);
        const angle = (2 * Math.PI * index) / group.length;
        const radius = 0.00025 * Math.max(1, group.length / 6);
        return { ...point, displayLat: point.lat + radius * Math.sin(angle), displayLon: point.lon + radius * Math.cos(angle) / Math.cos(point.lat * Math.PI / 180) };
      });
    }

    function setPoints(points, { fit = true } = {}) {
      layer.clearLayers();
      markers.clear();
      const placed = spread(points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)));
      placed.forEach(point => {
        const marker = L.circleMarker([point.displayLat, point.displayLon], style(point, point.id === selectedId));
        marker.bindTooltip(point.label, { direction: 'top', offset: [0, -8] });
        marker.on('click', () => {
          select(point.id, { pan: false });
          if (onSelect) onSelect(point.id);
        });
        marker.point = point;
        marker.addTo(layer);
        markers.set(point.id, marker);
      });
      empty.style.display = placed.length ? 'none' : '';
      if (fit && placed.length) {
        const bounds = L.latLngBounds(placed.map(point => [point.displayLat, point.displayLon]));
        map.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
      }
      if (selectedId !== null && !markers.has(selectedId)) selectedId = null;
      return placed.length;
    }

    function select(id, { pan = true } = {}) {
      if (selectedId !== null && markers.has(selectedId)) {
        const previous = markers.get(selectedId);
        previous.setStyle(style(previous.point, false)).setRadius(style(previous.point, false).radius);
      }
      selectedId = id;
      const marker = markers.get(id);
      if (!marker) return false;
      marker.setStyle(style(marker.point, true)).setRadius(style(marker.point, true).radius);
      marker.bringToFront();
      if (pan) map.panTo(marker.getLatLng());
      return true;
    }

    // Leaflet necesita recalcular su tamaño si el contenedor cambia (por ejemplo, al girar el celular).
    window.addEventListener('resize', () => map.invalidateSize());
    return { setPoints, select, map };
  }

  root.SummaryMap = { createSummaryMap };
}(window));
