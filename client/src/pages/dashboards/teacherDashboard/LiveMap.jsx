import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './LiveMap.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Map Configuration — locked to Marinduque province, Philippines
const MAP_CONFIG = {
  center: [13.36, 121.95], // Marinduque province, Philippines
  bounds: [[12.9, 121.4], [13.7, 122.4]],
  initialZoom: 11,
  minZoom: 10,
  maxZoom: 18,
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
};

const SOCKET_CONFIG = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
};

function FitBounds({ batchId }) {
  const map = useMap();
  const framedBatchRef = useRef(null);

  useEffect(() => {
    if (framedBatchRef.current === batchId) return;
    map.setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);
    framedBatchRef.current = batchId;
  }, [map, batchId]);

  return null;
}

function MapLayerControl({ layer, onLayerChange }) {
  const map = useMap();

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!MARINDUQUE_BOUNDS.contains([latitude, longitude])) {
          alert('Your current location is outside Marinduque, so it cannot be shown on this map.');
          return;
        }
        map.setView([latitude, longitude], 15);
        L.marker([latitude, longitude]).addTo(map).bindPopup('Your Location').openPopup();
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Unable to retrieve your location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [map]);

  return (
    <div className={styles.layerControls}>
      <div className={styles.layerSwitcher}>
        {Object.entries(TILE_LAYERS).map(([key, config]) => (
          <button
            key={key}
            className={`${styles.layerButton} ${layer === key ? styles.layerButtonActive : ''}`}
            onClick={() => onLayerChange(key)}
            title={`${config.label} view`}
          >
            {key === 'standard' && '🗺️'}
            {key === 'terrain' && '⛰️'}
            {key === 'satellite' && '🛰️'}
            <span className={styles.layerButtonLabel}>{config.label}</span>
          </button>
        ))}
      </div>
      <button className={styles.locateButton} onClick={handleLocateMe} title="My Location">
        📍
      </button>
    </div>
  );
}

// Avatar marker showing the student's initials + name + ID directly on the map.
function getInitials(student) {
  const f = (student.first_name || '').trim().charAt(0);
  const l = (student.last_name || '').trim().charAt(0);
  return (f + l).toUpperCase() || '?';
}

function makeAvatarIcon(student) {
  const isCheckedIn = student.status === 'checked_in';
  const color = isCheckedIn ? '#22c55e' : '#9ca3af';
  const initials = getInitials(student);
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const sid = student.student_number || student.student_id || '';

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
      <div style="position:relative;width:40px;height:40px;">
        <div style="width:40px;height:40px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;font-family:inherit;">
          ${initials}
        </div>
        ${isCheckedIn ? `<div style="position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;background:#16a34a;border:2px solid #fff;"></div>` : ''}
      </div>
      <div style="margin-top:3px;background:#0f172a;color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:6px;white-space:nowrap;font-family:inherit;max-width:120px;overflow:hidden;text-overflow:ellipsis;">
        ${name}
      </div>
      <div style="font-size:9px;color:#334155;background:#fff;border:1px solid #e2e8f0;padding:0 5px;border-radius:5px;white-space:nowrap;font-family:inherit;">
        #${sid}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'student-avatar-marker',
    iconSize: [40, 76],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function StudentMarker({ student }) {
  const isCheckedIn = student.status === 'checked_in';
  const icon = makeAvatarIcon(student);
  const lat = Number(student.latitude);
  const lng = Number(student.longitude);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
  if (!MARINDUQUE_BOUNDS.contains([lat, lng])) return null;

  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  const photo = student.photo_url;

  return (
    <Marker key={student.student_id} position={[lat, lng]} icon={icon}>
      <Popup>
        <div className={styles.popupContent}>
          <div className={styles.popupProfile}>
            {photo ? (
              <img src={photo} alt={name} className={styles.popupPhoto} />
            ) : (
              <div className={`${styles.popupAvatar} ${isCheckedIn ? styles.popupAvatarActive : styles.popupAvatarInactive}`}>
                {getInitials(student)}
              </div>
            )}
            <div className={styles.popupIdentity}>
              <strong>{name}</strong>
              <small>ID: {student.student_number || student.student_id}</small>
            </div>
          </div>
          <div className={styles.popupStatusRow}>
            Status:{' '}
            <span className={isCheckedIn ? styles.statusActive : styles.statusInactive}>
              {isCheckedIn ? 'Checked in' : 'Not checked in'}
            </span>
          </div>
          {(student.grade_level || student.track_strand) && (
            <div className={styles.popupMeta}>
              {[student.grade_level, student.track_strand].filter(Boolean).join(' · ')}
            </div>
          )}
          <div className={styles.popupMeta}>
            Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
          {student.accuracy != null && (
            <div className={styles.popupMeta}>Accuracy: {Math.round(student.accuracy)}m</div>
          )}
          {student.recorded_at && (
            <div className={styles.popupMeta}>
              Last seen: {new Date(student.recorded_at).toLocaleTimeString()}
            </div>
          )}
          {isCheckedIn && student.check_in_time && (
            <div className={styles.popupMeta}>
              Checked in: {new Date(student.check_in_time).toLocaleTimeString()}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

function LiveMap() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [mapLayer, setMapLayer] = useState('standard');

  const socketRef = useRef(null);
  const abortControllerRef = useRef(null);
  const locationUpdateTimeoutRef = useRef(null);

  // Fetch student locations for selected batch
  useEffect(() => {
    if (!selectedBatchId || !token) return;
    const fetchLocations = async () => {
      setLoading(true);
      setError(null);
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      try {
        const res = await axios.get(`${API_URL}/tracking/location/batch/${selectedBatchId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortControllerRef.current.signal,
        });
        setStudents(res.data || []);
        setLastUpdate(new Date());
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error('Failed to fetch locations:', err);
          setError('Could not load student locations. Retrying...');
          const timeout = setTimeout(fetchLocations, 3000);
          locationUpdateTimeoutRef.current = timeout;
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
    const pollInterval = setInterval(fetchLocations, 30000);
    return () => {
      clearInterval(pollInterval);
      abortControllerRef.current?.abort();
      if (locationUpdateTimeoutRef.current) clearTimeout(locationUpdateTimeoutRef.current);
    };
  }, [selectedBatchId, token]);

  // Socket connection management
  useEffect(() => {
    if (!token) return;
    socketRef.current = io(SOCKET_URL, { auth: { token }, ...SOCKET_CONFIG });

    socketRef.current.on('connect', () => {
      setSocketStatus('connected');
      if (selectedBatchId) socketRef.current?.emit('student:join_batch', selectedBatchId);
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
        return prev;
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
  }, [token]);

  // Join batch room when selected
  useEffect(() => {
    if (!selectedBatchId || socketRef.current?.disconnected) return;
    socketRef.current?.emit('student:join_batch', selectedBatchId, (ack) => {
      if (ack?.success) console.log('Joined batch room:', selectedBatchId);
    });
  }, [selectedBatchId]);

  const activeStudents = useMemo(() => students.filter((s) => s.status === 'checked_in'), [students]);
  const inactiveStudents = useMemo(() => students.filter((s) => s.status !== 'checked_in'), [students]);

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

        {!selectedBatchId && !loading && <p className={styles.info}>You have not been assigned to a batch yet.</p>}

        {batchLabel && (
          <p className={styles.batchTag}>Batch: {batchLabel}</p>
        )}

        {error && (
          <div className={styles.errorContainer}>
            <p className={styles.error}>{error}</p>
          </div>
        )}

        {loading && selectedBatchId && <p className={styles.info}>Loading map data...</p>}

        {!loading && selectedBatchId && (
          <div className={styles.mapWrapper}>
            {students.length === 0 && <p className={styles.info}>No student data available for this batch.</p>}
            {students.length > 0 && activeStudents.length === 0 && (
              <p className={styles.info}>No students are currently checked in for this batch.</p>
            )}
            {students.length > 0 && (
              <MapContainer
                center={MAP_CONFIG.center}
                zoom={MAP_CONFIG.initialZoom}
                minZoom={MAP_CONFIG.minZoom}
                maxZoom={MAP_CONFIG.maxZoom}
                maxBounds={MAP_CONFIG.bounds}
                maxBoundsViscosity={1.0}
                className={styles.map}
              >
                <TileLayer key={mapLayer} attribution={TILE_LAYERS[mapLayer].attribution} url={TILE_LAYERS[mapLayer].url} />
                <MapLayerControl layer={mapLayer} onLayerChange={setMapLayer} />
                <FitBounds batchId={selectedBatchId} />
                {students.map((s) => (
                  <StudentMarker key={s.student_id} student={s} />
                ))}
              </MapContainer>
            )}
          </div>
        )}

        {students.length > 0 && (
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={styles.dotGreen}></span>
              <span>{activeStudents.length} checked in</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.dotGrey}></span>
              <span>{inactiveStudents.length} not checked in</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.total}>Total: {students.length} student{students.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveMap;
