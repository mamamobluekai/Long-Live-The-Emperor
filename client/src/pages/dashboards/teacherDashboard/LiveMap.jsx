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

function FitBounds({ viewKey }) {
  const map = useMap();
  const framedBatchRef = useRef(null);

  useEffect(() => {
    if (framedBatchRef.current === viewKey) return;
    map.setView(MAP_CONFIG.center, MAP_CONFIG.initialZoom);
    framedBatchRef.current = viewKey;
  }, [map, viewKey]);

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
  const batchTag = student.batch_label
    ? `<div style="margin-top:2px;display:inline-block;background:${fill};color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:5px;white-space:nowrap;font-family:inherit;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${student.batch_label}</div>`
    : '';

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
    iconSize: [40, 92],
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
          {student.batch_label && (
            <div className={styles.popupMeta}>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: color,
                  marginRight: '6px',
                }}
              />
              Batch: {student.batch_label}
            </div>
          )}
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
  const { batches, loading: batchesLoading } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [mapLayer, setMapLayer] = useState('standard');
  const [scheduleMessage, setScheduleMessage] = useState(null);

  const socketRef = useRef(null);
  const abortControllerRef = useRef(null);
  const locationUpdateTimeoutRef = useRef(null);

  // The map is NOT scoped to the selected batch: it shows the students of
  // every batch the teacher handles, colored by batch.
  const batchKey = useMemo(() => batches.map((b) => Number(b.id)).join(','), [batches]);
  const batchIds = useMemo(() => batchKey ? batchKey.split(',').map(Number) : [], [batchKey]);
  const colorMap = useMemo(() => buildBatchColorMap(batches), [batches]);
  const hasBatches = batches.length > 0;

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
  const inactiveStudents = useMemo(() => students.filter((s) => s.status !== 'checked_in'), [students]);

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
                <FitBounds viewKey={batchKey} />
                {students.map((s) => (
                  <StudentMarker key={s.student_id} student={s} color={colorMap[s.batch_id]} />
                ))}
              </MapContainer>
            )}
          </div>
        )}

        {hasBatches && batchSummary.length > 0 && (
          <div className={styles.batchLegend}>
            {batchSummary.map((b) => (
              <span key={b.id} className={styles.batchLegendItem}>
                <span className={styles.batchSwatch} style={{ background: b.color }} />
                <span className={styles.batchLegendLabel}>{b.batch_label}</span>
                <span className={styles.batchLegendCount}>{b.total}</span>
              </span>
            ))}
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
