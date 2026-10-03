import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import { getBatchCurrentLocations } from '../../../api/teacherApi';
import { buildBatchColorMap } from '../../../utils/batchColors';
import styles from './LiveMap.module.css';
import { SOCKET_URL } from '../../../config/api';



// Map Configuration — locked to Marinduque province, Philippines
const MAP_CONFIG = {
  center: [13.36, 121.95], // Marinduque province, Philippines
  bounds: [[12.9, 121.4], [13.7, 122.4]],
  initialZoom: 11,
  minZoom: 10,
  maxZoom: 18,
  // Panning is limited to a generous area around the province so the Esri
  // terrain/satellite tiles always have real imagery to load, instead of the
  // blank clipped region a tight bound produces.
  mapBounds: [[11.5, 119.5], [15.0, 124.5]],
};

const MARINDUQUE_BOUNDS = L.latLngBounds(MAP_CONFIG.bounds);

const TILE_LAYERS = {
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: 'Standard',
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    label: 'Terrain',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    label: 'Satellite',
  },
  // Flat dark-vector style: OpenStreetMap tiles with a dark filter applied
  // (dark charcoal land, light grey roads and labels), which matches the
  // reference night style. Chosen over CARTO/Stadia dark tiles because those
  // now require an API key and stamp the tiles with "API KEY REQUIRED".
  weather: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    label: 'Weather',
    overlay: true,
  },
};

// Marinduque's six municipalities, with each town's centre. Used by the
// municipality quick-jump buttons. Coords are the town centres (WGS84).
const MARINDUQUE_MUNICIPALITIES = [
  { name: 'Boac', center: [13.4463, 121.8403] },
  { name: 'Buenavista', center: [13.3514, 121.9250] },
  { name: 'Gasan', center: [13.3244, 121.8839] },
  { name: 'Mogpog', center: [13.4764, 121.8629] },
  { name: 'Torrijos', center: [13.3194, 122.0862] },
  { name: 'Santa Cruz', center: [13.4734, 122.0284] },
];

const MUNICIPALITY_ZOOM = 13;

// Weather source: Open-Meteo (no API key needed) for the live wind, gust and
// rain readings that drive the particle flow. Key-less, so no configuration.
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_REFRESH_MS = 10 * 60 * 1000;

// Open-Meteo WMO weather codes -> label, icon and PAGASA-style severity.
function describeWeather(code) {
  if (code == null) return { label: 'No data', icon: '·', level: 'unknown' };
  if (code === 0) return { label: 'Clear sky', icon: '☀️', level: 'clear' };
  if ([1, 2].includes(code)) return { label: 'Partly cloudy', icon: '⛅', level: 'cloudy' };
  if (code === 3) return { label: 'Overcast', icon: '☁️', level: 'cloudy' };
  if ([45, 48].includes(code)) return { label: 'Fog', icon: '🌫️', level: 'warning' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: '🌦️', level: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', icon: '🌧️', level: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: '🌨️', level: 'warning' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: '⛈️', level: 'severe' };
  return { label: 'Unsettled', icon: '🌦️', level: 'rain' };
}

// Classify a municipality as a weather advisory risk (PAGASA-style signal).
function assessRisk({ code, rainMm, windKmh, gustKmh }) {
  if ([95, 96, 99].includes(code)) return 'severe';
  if (gustKmh >= 60 || windKmh >= 40) return 'severe';
  if (rainMm >= 7.5) return 'warning';
  if (gustKmh >= 40 || windKmh >= 25) return 'warning';
  if (rainMm > 0.2) return 'rain';
  return 'clear';
}

function compassPoint(deg) {
  if (deg == null) return '';
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}

// The teacher's chosen view (centre + zoom + layer) is remembered so reloading
// the page does not snap the map back to the province default or reset the zoom.
const VIEW_STORAGE_KEY = 'wim-live-map-view';

function readStoredView() {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { center, zoom, layer } = parsed || {};
    if (!Array.isArray(center) || center.length !== 2) return null;
    const lat = Number(center[0]);
    const lng = Number(center[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    const z = Number(zoom);
    return {
      center: [lat, lng],
      zoom: isNaN(z) ? MAP_CONFIG.initialZoom : Math.min(MAP_CONFIG.maxZoom, Math.max(MAP_CONFIG.minZoom, z)),
      layer: TILE_LAYERS[layer] ? layer : 'standard',
    };
  } catch {
    return null;
  }
}

function writeStoredView(center, zoom, layer) {
  try {
    window.localStorage.setItem(
      VIEW_STORAGE_KEY,
      JSON.stringify({ center, zoom, layer })
    );
  } catch {
    /* storage unavailable (private mode) — view simply won't persist */
  }
}

const SOCKET_CONFIG = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
};

// Restores the previously saved view once the map is ready, then keeps saving
// every centre/zoom change so a page refresh keeps the exact same framing.
function ViewPersistence({ layer, enabled }) {
  const map = useMap();
  const restoredRef = useRef(false);
  const layerRef = useRef(layer);

  useEffect(() => {
    layerRef.current = layer;
  }, [layer]);

  useEffect(() => {
    if (restoredRef.current || !enabled) return;
    const stored = readStoredView();
    if (stored) {
      map.setView(stored.center, stored.zoom, { animate: false });
      if (stored.layer !== layerRef.current) {
        window.dispatchEvent(new CustomEvent('wim-map-layer', { detail: stored.layer }));
      }
    }
    restoredRef.current = true;
  }, [map, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleMove = () => {
      const c = map.getCenter();
      writeStoredView([c.lat, c.lng], map.getZoom(), layerRef.current);
    };
    map.on('moveend zoomend', handleMove);
    return () => {
      map.off('moveend zoomend', handleMove);
    };
  }, [map, enabled]);

  return null;
}

function MapBridge({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function MapLayerControl({ layer, onLayerChange }) {
  return (
    <div className={styles.layerSwitcher}>
      {Object.entries(TILE_LAYERS).map(([key, config]) => (
        <button
          key={key}
          type="button"
          className={`${styles.layerButton} ${layer === key ? styles.layerButtonActive : ''}`}
          onClick={() => onLayerChange(key)}
          title={
            key === 'weather'
              ? 'Dark map with live wind, cloud and rain movement'
              : `${config.label} view`
          }
        >
          <span className={styles.layerButtonLabel}>{config.label}</span>
        </button>
      ))}
    </div>
  );
}

function MunicipalityControls({ map }) {
  const [activeName, setActiveName] = useState(null);

  const goToMunicipality = useCallback(
    (name, center) => {
      setActiveName(name);
      if (!map) return;
      map.flyTo(center, MUNICIPALITY_ZOOM, { duration: 0.8 });
    },
    [map]
  );

  return (
    <div className={styles.municipalityControls}>
      <span className={styles.municipalityTitle}>Go to:</span>
      {MARINDUQUE_MUNICIPALITIES.map((m) => (
        <button
          key={m.name}
          type="button"
          className={`${styles.municipalityButton} ${activeName === m.name ? styles.municipalityButtonActive : ''}`}
          onClick={() => goToMunicipality(m.name, m.center)}
          title={`Zoom to ${m.name}`}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

// Avatar marker showing the student's initials + name + ID directly on the map.
// The avatar fill encodes the student's BATCH (so a teacher handling several
// batches can tell them apart); check-in status stays readable through the
// status dot and a dashed ring on the avatar.
function getInitials(student) {
  const f = (student.first_name || '').trim().charAt(0);
  const l = (student.last_name || '').trim().charAt(0);
  return (f + l).toUpperCase() || '?';
}

function makeAvatarIcon(student, color) {
  const isCheckedIn = student.status === 'checked_in';
  const fill = color || '#64748b';
  const initials = getInitials(student);
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const sid = student.student_number || student.student_id || '';
  const ring = isCheckedIn ? '3px solid #ffffff' : '3px dashed rgba(255,255,255,0.85)';
  const opacity = isCheckedIn ? '1' : '0.75';
  const batchTag = '';

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
      <div style="position:relative;width:40px;height:40px;">
        <div style="width:40px;height:40px;border-radius:50%;background:${fill};border:${ring};box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;font-family:inherit;opacity:${opacity};">
          ${initials}
        </div>
        <div style="position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;background:${isCheckedIn ? '#16a34a' : '#9ca3af'};border:2px solid #fff;"></div>
      </div>
      <div style="margin-top:3px;background:#0f172a;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;white-space:nowrap;font-family:inherit;max-width:120px;overflow:hidden;text-overflow:ellipsis;">
        ${name}
      </div>
      <div style="font-size:9px;color:#334155;background:#fff;border:1px solid #e2e8f0;padding:0 5px;border-radius:5px;white-space:nowrap;font-family:inherit;">
        #${sid}
      </div>
      ${batchTag}
    </div>
  `;

  return L.divIcon({
    html,
    className: 'student-avatar-marker',
    iconSize: [40, 72],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function StudentMarker({ student, color }) {
  const isCheckedIn = student.status === 'checked_in';
  const icon = makeAvatarIcon(student, color);
  const lat = Number(student.latitude);
  const lng = Number(student.longitude);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
  if (!MARINDUQUE_BOUNDS.contains([lat, lng])) return null;

  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const photo = student.photo_url;
  const sid = student.student_number || student.student_id;
  const strand = [student.grade_level && `Grade ${student.grade_level}`, student.track_strand]
    .filter(Boolean)
    .join(' · ');
  const phone = student.contact_number || student.supervisor_phone;
  const email = student.email || student.supervisor_email;
  const lastSeen = student.recorded_at
    ? new Date(student.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Marker key={student.student_id} position={[lat, lng]} icon={icon}>
      <Popup>
        <div className={styles.popupContent}>
          <div className={styles.studentCard}>
            <div className={styles.studentCardHeader}>
              <div className={styles.studentCardAvatarWrap}>
                {photo ? (
                  <img src={photo} alt={name} className={styles.studentCardAvatar} />
                ) : (
                  <div
                    className={`${styles.popupAvatar} ${isCheckedIn ? styles.popupAvatarActive : styles.popupAvatarInactive}`}
                  >
                    {getInitials(student)}
                  </div>
                )}
              </div>
              <div className={styles.studentCardIdentity}>
                <strong className={styles.studentCardName}>{name}</strong>
                <span className={styles.studentCardId}>Student ID: {sid}</span>
              </div>
              {student.batch_label && (
                <span className={styles.studentCardBatch}>
                  <span
                    className={styles.studentCardBatchDot}
                
                  />
                 
                </span>
              )}
            </div>

            <div className={styles.studentCardBody}>
              {strand && <div className={styles.studentCardLine}>{strand}</div>}
              {student.company_name && (
                <div className={styles.studentCardLine}>{student.company_name}</div>
              )}
              {student.supervisor_name && (
                <div className={styles.studentCardLine}>
                  <span className={styles.studentCardLabel}>Supervisor:</span>{' '}
                  {student.supervisor_name}
                </div>
              )}
              {phone && (
                <div className={styles.studentCardLine}>📞 {phone}</div>
              )}
              {email && <div className={styles.studentCardLine}>✉️ {email}</div>}
            </div>

            <div className={styles.studentCardFooter}>
              <span
                className={`${styles.studentCardStatus} ${isCheckedIn ? styles.statusActive : styles.statusInactive}`}
              >
                {isCheckedIn ? '● Present' : '○ Not checked in'}
              </span>
              <div className={styles.studentCardMeta}>
                {isCheckedIn && student.check_in_time && (
                  <div>
                    <span className={styles.studentCardLabel}>Time In:</span>{' '}
                    {new Date(student.check_in_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
                <div>
                  <span className={styles.studentCardLabel}>Last Updated:</span> {lastSeen}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.popupMeta}>
            Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
            {student.accuracy != null ? ` · ±${Math.round(student.accuracy)}m` : ''}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// ---------------------------------------------------------------------------
// Animated weather layer: real air movement rendered on a canvas.
// Air particles stream in the current wind direction, clouds drift with the
// same flow, and rain streaks fall when it is raining. During a tropical
// cyclone the flow speeds up, tightens into a spiral and the palette shifts to
// PAGASA warning colours. No markers, icons or popups are used — just movement.
// ---------------------------------------------------------------------------

const MAX_AIR_PARTICLES = 420;
const MAX_CLOUDS = 26;
const MAX_RAIN_DROPS = 900;

// Used until the live reading arrives, so the flow always has a direction.
const DEFAULT_CONDITIONS = {
  windKmh: 12,
  windDirDeg: 45,
  rainMm: 0,
  gustKmh: 18,
  level: 'calm',
};

const STORM_COLORS = {
  calm: { streak: '180, 220, 255', cloud: '255, 255, 255', rain: '190, 220, 255' },
  rain: { streak: '170, 205, 255', cloud: '225, 230, 240', rain: '150, 190, 255' },
  severe: { streak: '255, 175, 120', cloud: '210, 180, 200', rain: '255, 140, 140' },
};

function mixStreak(base, level) {
  // Stronger wind pushes the streak colour towards the warning orange.
  const palette = STORM_COLORS[level] || STORM_COLORS.calm;
  return level === 'severe' ? palette.streak : base;
}

// Borderless weather icon per municipality. The icon itself is the only thing
// on the map — no card, no background — and it carries a small coloured ring so
// the severity is readable at a glance. Clicking opens the full report.
const WEATHER_RING = {
  clear: 'rgba(34, 197, 94, 0.95)',
  cloudy: 'rgba(148, 163, 184, 0.95)',
  rain: 'rgba(59, 130, 246, 0.95)',
  warning: 'rgba(245, 158, 11, 0.95)',
  severe: 'rgba(239, 68, 68, 0.95)',
  unknown: 'rgba(148, 163, 184, 0.7)',
};

function makeWeatherIcon(weather) {
  const { desc, level, windKmh, gustKmh } = weather;
  const ring = WEATHER_RING[level] || WEATHER_RING.unknown;
  const size = level === 'severe' ? 46 : 38;
  const scale = level === 'severe' ? 1.9 : level === 'warning' ? 1.6 : 1.3;
  const gust = gustKmh > windKmh + 5 ? `<div class="wmi-gust">${Math.round(gustKmh)}</div>` : '';
  const html = `
    <div class="wmi" style="--wmi-ring:${ring};">
      <div class="wmi-pulse" style="--wmi-size:${size}px;--wmi-scale:${scale};"></div>
      <div class="wmi-icon" style="font-size:${size}px;">${desc.icon}</div>
      ${gust}
    </div>
  `;
  return L.divIcon({
    html,
    className: 'wim-weather-icon',
    iconSize: [size, size + 12],
    iconAnchor: [size / 2, size / 2 + 6],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// Plain-language guidance so a teacher knows what to do about the reading.
function weatherAdvice(w) {
  if (w.level === 'severe') {
    return 'Fair weather. Normal outdoor work conditions.';
  }
  if (w.level === 'warning') {
    return 'Caution advised. Strong winds or heavy rain — secure equipment and prepare to stop.';
  }
  if (w.level === 'rain') {
    return 'Light rain. Outdoor work can continue, but watch for slippery ground.';
  }
  if (w.level === 'cloudy') {
    return 'Cloudy but workable. Normal monitoring.';
  }
  return 'Fair weather. Normal outdoor work conditions.';
}

// The single headline a teacher reads first.
const WORK_VERDICT = {
  clear: { text: 'GOOD FOR OUTDOOR WORK', tone: 'good' },
  cloudy: { text: 'OKAY FOR OUTDOOR WORK', tone: 'good' },
  rain: { text: 'CAUTION — RAIN', tone: 'caution' },
  warning: { text: 'CAUTION — STRONG WEATHER', tone: 'caution' },
  severe: { text: 'NOT SAFE — SUSPEND WORK', tone: 'danger' },
  unknown: { text: 'NO DATA AVAILABLE', tone: 'neutral' },
};

const VERDICT_COLORS = {
  good: '#16a34a',
  caution: '#d97706',
  danger: '#dc2626',
  neutral: '#64748b',
};

function WeatherIconMarker({ weather }) {
  const icon = useMemo(() => makeWeatherIcon(weather), [weather]);
  const { desc, level, windKmh, gustKmh, rainMm, point, name, tempC } = weather;
  const verdict = WORK_VERDICT[level] || WORK_VERDICT.unknown;
  const dotColor = VERDICT_COLORS[verdict.tone];

  return (
    <Marker position={weather.center} icon={icon} zIndexOffset={1000} keyboard={false}>
      <Popup className="wim-weather-popup" minWidth={250}>
        <div className={styles.wxCard}>
          <div className={styles.wxHeader}>
            <span className={styles.wxHeaderIcon}>{desc.icon}</span>
            <div>
              <strong className={styles.wxName}>{name}</strong>
              <div className={styles.wxCondition}>{desc.label}</div>
            </div>
          </div>

          <div className={styles.wxGrid}>
            <div className={styles.wxCell}>
              <div className={styles.wxCellLabel}>💨 Wind</div>
              <div className={styles.wxCellValue}>
                {Math.round(windKmh)} km/h {point ? `→ ${point}` : ''}
              </div>
            </div>
            <div className={styles.wxCell}>
              <div className={styles.wxCellLabel}>🌬 Strongest</div>
              <div className={styles.wxCellValue}>{Math.round(gustKmh)} km/h</div>
            </div>
            <div className={styles.wxCell}>
              <div className={styles.wxCellLabel}>🌧 Rain</div>
              <div className={styles.wxCellValue}>
                {rainMm > 0 ? `${rainMm.toFixed(1)} mm` : 'None'}
              </div>
            </div>
            <div className={styles.wxCell}>
              <div className={styles.wxCellLabel}>🌡 Temp.</div>
              <div className={styles.wxCellValue}>{tempC.toFixed(1)}°C</div>
            </div>
          </div>

          <div className={styles.wxVerdict} style={{ color: dotColor }}>
            <span className={styles.wxVerdictDot} style={{ background: dotColor }} />
            {verdict.text}
          </div>

          <p className={styles.wxAdvice}>{weatherAdvice(weather)}</p>
        </div>
      </Popup>
    </Marker>
  );
}

function AirParticleLayer({ conditions, level }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef(null);
  const conditionsRef = useRef(conditions);

  useEffect(() => {
    conditionsRef.current = conditions;
  }, [conditions]);

  // Created once and mounted into the overlay pane. Declared before the
  // animation effect below so the canvas exists when the loop starts.
  const canvas = useMemo(() => L.DomUtil.create('canvas', 'wim-air-canvas'), []);

  useEffect(() => {
    canvasRef.current = canvas;
    map.getPanes().overlayPane.appendChild(canvas);
    return () => {
      canvasRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map, canvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let dpr = 1;

    const rand = (a, b) => a + Math.random() * (b - a);

    const seedState = () => {
      stateRef.current = {
        air: Array.from({ length: MAX_AIR_PARTICLES }, () => ({
          x: Math.random(),
          y: Math.random(),
          len: rand(0.5, 1),
          speed: rand(0.6, 1.4),
          alpha: rand(0.18, 0.6),
        })),
        clouds: Array.from({ length: MAX_CLOUDS }, () => ({
          x: Math.random(),
          y: Math.random(),
          r: rand(0.05, 0.18),
          alpha: rand(0.12, 0.4),
          drift: rand(0.5, 1.3),
        })),
        rain: Array.from({ length: MAX_RAIN_DROPS }, () => ({
          x: Math.random(),
          y: Math.random(),
          len: rand(0.01, 0.04),
          speed: rand(0.6, 1.5),
          alpha: rand(0.15, 0.5),
        })),
        time: 0,
      };
    };

    const resize = () => {
      const size = map.getSize();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = size.x;
      height = size.y;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      position();
    };

    // The overlay pane is anchored to the map's layer-point origin, so the
    // canvas has to be re-anchored to the current top-left corner of the
    // viewport on every pan/zoom to stay glued over the visible area.
    const position = () => {
      const topLeft = map.latLngToLayerPoint(map.getBounds().getNorthWest());
      L.DomUtil.setPosition(canvas, topLeft);
    };

    const draw = () => {
      const state = stateRef.current;
      if (!state) {
        seedState();
        resize();
      }
      const { windKmh, windDirDeg, rainMm } = conditionsRef.current;
      const colors = STORM_COLORS[level] || STORM_COLORS.calm;

      // Meteorology-driven speeds: 10 km/h is a breeze, 60+ is storm force.
      const windNorm = Math.min(Math.max(windKmh, 4) / 60, 1.4);
      const rainNorm = Math.min(Math.max(rainMm, 0) / 10, 1);
      // Wind direction is where the wind comes FROM; particles travel the
      // other way, i.e. the direction it is blowing towards.
      const rad = ((windDirDeg + 180) * Math.PI) / 180;
      const vx = Math.sin(rad);
      const vy = -Math.cos(rad);
      const baseSpeed = 0.06 + windNorm * 0.5;

      state.time += 1;
      ctx.clearRect(0, 0, width, height);

      // --- clouds: soft blobs sliding along the wind ---
      const activeClouds = Math.round(6 + rainNorm * 20);
      for (let i = 0; i < Math.min(activeClouds, MAX_CLOUDS); i += 1) {
        const c = state.clouds[i];
        c.x += vx * baseSpeed * 0.35 * c.drift * 0.01;
        c.y += vy * baseSpeed * 0.35 * c.drift * 0.01;
        if (c.x < -0.25) c.x += 1.5;
        if (c.x > 1.25) c.x -= 1.5;
        if (c.y < -0.3) c.y += 1.6;
        if (c.y > 1.3) c.y -= 1.6;
        const px = c.x * width;
        const py = c.y * height;
        const r = c.r * Math.min(width, height);
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(${colors.cloud},${c.alpha})`);
        g.addColorStop(1, `rgba(${colors.cloud},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- rain streaks: fall, tilted by the wind ---
      const activeRain = Math.round(rainNorm * MAX_RAIN_DROPS);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(${colors.rain},0.5)`;
      ctx.beginPath();
      for (let i = 0; i < activeRain; i += 1) {
        const d = state.rain[i];
        d.y += 0.006 * d.speed * (1 + rainNorm);
        d.x += vx * baseSpeed * d.speed * 0.35;
        if (d.y > 1.05) {
          d.y -= 1.1;
          d.x = Math.random();
        }
        if (d.x < -0.05) d.x += 1.1;
        if (d.x > 1.05) d.x -= 1.1;
        const px = d.x * width;
        const py = d.y * height;
        ctx.moveTo(px, py);
        ctx.lineTo(px + vx * d.len * width * 0.6, py + d.len * height);
      }
      ctx.stroke();

      // --- air particles: the visible wind flow ---
      const activeAir = Math.round(80 + windNorm * 300);
      const streak = mixStreak(colors.streak, level);
      for (let i = 0; i < Math.min(activeAir, MAX_AIR_PARTICLES); i += 1) {
        const p = state.air[i];
        const step = baseSpeed * p.speed * 0.02;
        p.x += vx * step;
        p.y += vy * step;
        if (p.x < -0.1) p.x += 1.2;
        if (p.x > 1.1) p.x -= 1.2;
        if (p.y < -0.1) p.y += 1.2;
        if (p.y > 1.1) p.y -= 1.2;
        const px = p.x * width;
        const py = p.y * height;
        const tailX = px - vx * p.len * 60 * (0.4 + windNorm);
        const tailY = py - vy * p.len * 60 * (0.4 + windNorm);
        ctx.strokeStyle = `rgba(${streak},${p.alpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    seedState();
    resize();
    map.on('resize', resize);
    map.on('move', position);
    map.on('zoom', position);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('resize', resize);
      map.off('move', position);
      map.off('zoom', position);
    };
  }, [map, level]);

  return null;
}

function LiveMap() {
  const { token } = useAuth();
  const { batches, loading: batchesLoading } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [mapLayer, setMapLayer] = useState(() => readStoredView()?.layer || 'standard');
  const [mapInstance, setMapInstance] = useState(null);
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherList, setWeatherList] = useState([]);

  const socketRef = useRef(null);
  const abortControllerRef = useRef(null);
  const locationUpdateTimeoutRef = useRef(null);

  // Keep the tile layer in sync with what ViewPersistence restores.
  useEffect(() => {
    const handleLayerRestore = (event) => {
      const next = event?.detail;
      if (TILE_LAYERS[next]) setMapLayer(next);
    };
    window.addEventListener('wim-map-layer', handleLayerRestore);
    return () => window.removeEventListener('wim-map-layer', handleLayerRestore);
  }, []);

  // The map is NOT scoped to the selected batch: it shows the students of
  // every batch the teacher handles, colored by batch.
  const batchKey = useMemo(() => batches.map((b) => Number(b.id)).join(','), [batches]);
  const batchIds = useMemo(() => batchKey ? batchKey.split(',').map(Number) : [], [batchKey]);
  const colorMap = useMemo(() => buildBatchColorMap(batches), [batches]);
  const hasBatches = batches.length > 0;

  // Start from the last saved view so a refresh never jumps back to defaults.
  const initialView = useMemo(
    () => readStoredView() || { center: MAP_CONFIG.center, zoom: MAP_CONFIG.initialZoom },
    []
  );

  // Live wind + rain for the province, averaged across all six municipalities.
  // Drives the particle flow direction, speed, cloud cover and rain density.
  useEffect(() => {
    if (mapLayer !== 'weather') {
      setWeather(null);
      setWeatherList([]);
      return undefined;
    }
    let cancelled = false;
    const loadWeather = async () => {
      const lat = MARINDUQUE_MUNICIPALITIES.map((m) => m.center[0]).join(',');
      const lng = MARINDUQUE_MUNICIPALITIES.map((m) => m.center[1]).join(',');
      const url =
        `${WEATHER_API}?latitude=${lat}&longitude=${lng}` +
        '&current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
        '&wind_speed_unit=kmh&timezone=Asia%2FManila';
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : [raw];
        if (cancelled || !list.length) return;
        const mean = (key) => {
          const values = list.map((e) => Number(e?.current?.[key])).filter((v) => !isNaN(v));
          if (!values.length) return 0;
          return values.reduce((a, b) => a + b, 0) / values.length;
        };
        // Circular mean so 350° and 10° do not average to a bogus 180°.
        const windDirDeg = (() => {
          const dirs = list.map((e) => Number(e?.current?.wind_direction_10m)).filter((v) => !isNaN(v));
          if (!dirs.length) return 0;
          const sin = dirs.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0) / dirs.length;
          const cos = dirs.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0) / dirs.length;
          return ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
        })();
        const windKmh = mean('wind_speed_10m');
        const gustKmh = Math.max(mean('wind_gusts_10m'), windKmh);
        const rainMm = mean('precipitation');
        const code = list.find((e) => e?.current?.weather_code != null)?.current.weather_code ?? null;
        setWeather({
          windKmh,
          gustKmh,
          rainMm,
          windDirDeg,
          code,
          tempC: mean('temperature_2m'),
          point: compassPoint(windDirDeg),
          desc: describeWeather(code),
          level: assessRisk({ code, rainMm, windKmh, gustKmh }),
        });
        // Per-municipality readings drive the icons sitting on the map.
        setWeatherList(
          list
            .map((entry, index) => {
              const municipality = MARINDUQUE_MUNICIPALITIES[index];
              if (!municipality || !entry?.current) return null;
              const c = entry.current;
              const mWind = Number(c.wind_speed_10m) || 0;
              const mGust = Math.max(Number(c.wind_gusts_10m) || 0, mWind);
              const mRain = Number(c.precipitation) || 0;
              const mCode = c.weather_code ?? null;
              const mDir = Number(c.wind_direction_10m) || 0;
              return {
                name: municipality.name,
                center: municipality.center,
                windKmh: mWind,
                gustKmh: mGust,
                rainMm: mRain,
                code: mCode,
                tempC: Number(c.temperature_2m) || 0,
                point: compassPoint(mDir),
                desc: describeWeather(mCode),
                level: assessRisk({ code: mCode, rainMm: mRain, windKmh: mWind, gustKmh: mGust }),
              };
            })
            .filter(Boolean)
        );
      } catch {
        /* weather service unreachable — the map itself keeps working */
      }
    };
    loadWeather();
    const interval = setInterval(loadWeather, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mapLayer]);

  // Fetch student locations for every assigned batch
  useEffect(() => {
    if (!token || !hasBatches) {
      setStudents([]);
      setLoading(!batchesLoading);
      return undefined;
    }
    let cancelled = false;
    const fetchLocations = async () => {
      setLoading(true);
      setError(null);
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      try {
        const results = await Promise.all(
          batchIds.map((id) =>
            getBatchCurrentLocations(id, token, { signal: abortControllerRef.current.signal })
          )
        );
        if (cancelled) return;
        const merged = [];
        const seen = new Set();
        let message = null;
        results.forEach((res, index) => {
          const id = batchIds[index];
          const label = batches.find((b) => Number(b.id) === id)?.batch_label || '';
          if (res?.message && !message) message = res.message;
          (res?.students || []).forEach((s) => {
            if (seen.has(s.student_id)) return;
            seen.add(s.student_id);
            merged.push({ ...s, batch_id: id, batch_label: label });
          });
        });
        setStudents(merged);
        setScheduleMessage(message);
        setLastUpdate(new Date());
      } catch (err) {
        if (!cancelled && err.name !== 'CanceledError') {
          console.error('Failed to fetch locations:', err);
          setError('Could not load student locations. Retrying...');
          const timeout = setTimeout(fetchLocations, 3000);
          locationUpdateTimeoutRef.current = timeout;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchLocations();
    const pollInterval = setInterval(fetchLocations, 30000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      abortControllerRef.current?.abort();
      if (locationUpdateTimeoutRef.current) clearTimeout(locationUpdateTimeoutRef.current);
    };
    // `batches` is stable state from the shared provider; it only changes when
    // the batch list is (re)loaded, so this effect keys off the batch set.
  }, [batchIds, batches, batchesLoading, hasBatches, token]);

  // Socket connection management
  useEffect(() => {
    if (!token) return;
    socketRef.current = io(SOCKET_URL, { auth: { token }, ...SOCKET_CONFIG });

    socketRef.current.on('connect', () => {
      setSocketStatus('connected');
      batchIds.forEach((id) => socketRef.current?.emit('student:join_batch', id));
    });
    socketRef.current.on('disconnect', () => setSocketStatus('disconnected'));
    socketRef.current.on('connect_error', () => setSocketStatus('error'));

    socketRef.current.on('student:location_update', (data) => {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.student_id === data.studentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            status: data.status || updated[idx].status,
            check_in_time: data.check_in_time || updated[idx].check_in_time,
            recorded_at: new Date().toISOString(),
            first_name: data.studentName ? data.studentName.split(' ')[0] : updated[idx].first_name,
            last_name: data.studentName ? data.studentName.split(' ').slice(1).join(' ') : updated[idx].last_name,
          };
          return updated;
        }
        return prev;
      });
      setLastUpdate(new Date());
    });

    // Live refresh on check-in / check-out
    socketRef.current.on('student:checked_in', (data) => {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.student_id === data.studentId);
        const nameParts = (data.studentName || '').split(' ');
        const patch = {
          status: 'checked_in',
          check_in_time: data.time,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          first_name: nameParts[0] || undefined,
          last_name: nameParts.slice(1).join(' ') || undefined,
          recorded_at: new Date().toISOString(),
        };
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...patch };
          return updated;
        }
        return [
          ...prev,
          {
            student_id: data.studentId,
            student_number: data.studentNumber,
            ...patch,
          },
        ];
      });
      setLastUpdate(new Date());
    });

    socketRef.current.on('student:checked_out', (data) => {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.student_id === data.studentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: 'checked_out', check_out_time: data.time, recorded_at: new Date().toISOString() };
          return updated;
        }
        return prev;
      });
      setLastUpdate(new Date());
    });

    return () => socketRef.current?.disconnect();
  }, [batchIds, token]);

  // (Re)join every assigned batch room whenever the batch set changes
  useEffect(() => {
    if (!batchIds.length || socketRef.current?.disconnected) return;
    batchIds.forEach((id) => {
      socketRef.current?.emit('student:join_batch', id, (ack) => {
        if (ack?.success) console.log('Joined batch room:', id);
      });
    });
  }, [batchIds]);

  const activeStudents = useMemo(() => students.filter((s) => s.status === 'checked_in'), [students]);

  const batchSummary = useMemo(
    () =>
      batches.map((b) => ({
        ...b,
        color: colorMap[b.id],
        total: students.filter((s) => Number(s.batch_id) === Number(b.id)).length,
      })),
    [batches, colorMap, students]
  );

  const statusIndicatorClass =
    {
      connected: styles.statusConnected,
      disconnected: styles.statusDisconnected,
      error: styles.statusError,
    }[socketStatus] || styles.statusDisconnected;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>Live Student Map — Marinduque, Philippines</h2>
          <div className={styles.statusBar}>
            <div className={`${styles.statusIndicator} ${statusIndicatorClass}`} />
            <span className={styles.statusText}>
              {socketStatus === 'connected' ? 'Live' : socketStatus === 'error' ? 'Connection Error' : 'Offline'}
            </span>
            {lastUpdate && <span className={styles.lastUpdate}>Updated: {lastUpdate.toLocaleTimeString()}</span>}
          </div>
        </div>

        {!batchesLoading && !hasBatches && <p className={styles.info}>You have not been assigned to a batch yet.</p>}

        {hasBatches && (
          <p className={styles.batchTag}>
            Showing all {batches.length} batch{batches.length !== 1 ? 'es' : ''} — marker color identifies the batch
          </p>
        )}

        {error && (
          <div className={styles.errorContainer}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        {loading && hasBatches && <p className={styles.info}>Loading map data...</p>}

        {!loading && hasBatches && (
          <div className={styles.mapWrapper}>
            {scheduleMessage && students.length === 0 && <p className={styles.info}>{scheduleMessage}</p>}
            {!scheduleMessage && students.length === 0 && <p className={styles.info}>No student data available for your batches.</p>}
            {students.length > 0 && activeStudents.length === 0 && (
              <p className={styles.info}>No students are currently checked in.</p>
            )}
        {students.length > 0 && (
              <div className={styles.mapToolbar}>
                <MunicipalityControls map={mapInstance} />
                <MapLayerControl layer={mapLayer} onLayerChange={setMapLayer} />
              </div>
            )}

            {students.length > 0 && (
              <MapContainer
                center={initialView.center}
                zoom={initialView.zoom}
                minZoom={MAP_CONFIG.minZoom}
                maxZoom={MAP_CONFIG.maxZoom}
                maxBounds={MAP_CONFIG.mapBounds}
                maxBoundsViscosity={0.6}
                className={styles.map}
              >
                <TileLayer
                  key={mapLayer}
                  attribution={TILE_LAYERS[mapLayer].attribution}
                  url={TILE_LAYERS[mapLayer].url}
                  className={TILE_LAYERS[mapLayer].overlay ? 'wim-dark-tiles' : ''}
                  maxNativeZoom={mapLayer === 'standard' ? 19 : 18}
                  maxZoom={MAP_CONFIG.maxZoom}
                />
                {TILE_LAYERS[mapLayer].overlay && (
                  <AirParticleLayer
                    conditions={weather || DEFAULT_CONDITIONS}
                    level={(weather?.level && weather.level !== 'unknown' ? weather.level : 'calm')}
                  />
                )}
                {TILE_LAYERS[mapLayer].overlay &&
                  weatherList.map((w) => <WeatherIconMarker key={w.name} weather={w} />)}
                <MapBridge onReady={setMapInstance} />
                <ViewPersistence layer={mapLayer} enabled />
                {students.map((s) => (
                  <StudentMarker key={s.student_id} student={s} color={colorMap[s.batch_id]} />
                ))}
              </MapContainer>
            )}
          </div>
        )}

        {hasBatches && batchSummary.length > 0 && (
          <div className={styles.batchLegend}>
            <div className={styles.batchLegendItems}>
              {batchSummary.map((b) => (
                <span key={b.id} className={styles.batchLegendItem}>
                  <span className={styles.batchSwatch} style={{ background: b.color }} />
                  <span className={styles.batchLegendLabel}>{b.batch_label}</span>
                  <span className={styles.batchLegendCount}>{b.total}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              className={styles.batchPanelButton}
              onClick={() => setBatchPanelOpen(true)}
            >
              Batches ({batchSummary.length})
            </button>
          </div>
        )}
      </div>

      {batchPanelOpen && (
        <>
          <div
            className={styles.drawerOverlay}
            role="presentation"
            onClick={() => setBatchPanelOpen(false)}
          />
          <aside className={styles.batchDrawer} role="dialog" aria-modal="true" aria-label="Batch students">
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.drawerEyebrow}>Live attendance</span>
                <h3>Students by batch</h3>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setBatchPanelOpen(false)}
                aria-label="Close batch list"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerBody}>
              {batchSummary.map((batch) => {
                const batchStudents = activeStudents.filter(
                  (s) => s.batch_id === batch.id
                );
                return (
                  <section key={batch.id} className={styles.drawerGroup}>
                    <header className={styles.drawerGroupHeader}>
                      <span className={styles.batchSwatch} style={{ background: batch.color }} />
                      <strong>{batch.batch_label}</strong>
                      <span className={styles.drawerGroupCount}>
                        {batchStudents.length}/{batch.total} timed in
                      </span>
                    </header>

                    {batchStudents.length === 0 ? (
                      <p className={styles.drawerEmpty}>No students timed in for this batch.</p>
                    ) : (
                      <ul className={styles.drawerList}>
                        {batchStudents.map((student) => (
                          <li key={student.student_id} className={styles.drawerItem}>
                            <span
                              className={styles.drawerAvatar}
                              style={{ background: batch.color }}
                            >
                              {getInitials(student)}
                            </span>
                            <div className={styles.drawerItemBody}>
                              <strong>
                                {`${student.first_name || ''} ${student.last_name || ''}`.trim()}
                              </strong>
                              <span>
                                {student.student_number || student.student_id}
                              </span>
                            </div>
                            <div className={styles.drawerTimes}>
                              <span>
                                <em>Time in</em>
                                {student.check_in_time
                                  ? new Date(student.check_in_time).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </span>
                              <span>
                                <em>Time out</em>
                                {student.check_out_time
                                  ? new Date(student.check_out_time).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default LiveMap;
