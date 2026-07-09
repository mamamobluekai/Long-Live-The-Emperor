import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import { useAuth } from '../../../context/AuthContext';
import styles from './LiveMap.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Marinduque province, Philippines — restrict the map to this area only.
const MARINDUQUE_CENTER = [13.36, 121.95];
const MARINDUQUE_BOUNDS = [
  [12.9, 121.4],
  [13.7, 122.4],
];

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ students }) {
  const map = useMap();
  useEffect(() => {
    const points = students
      .filter((s) => s.latitude && s.longitude)
      .map((s) => [Number(s.latitude), Number(s.longitude)]);
    if (points.length > 0) {
      map.fitBounds(points, { padding: [50, 50] });
    }
  }, [map, students]);
  return null;
}

function LiveMap() {
  const { token } = useAuth();
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await axios.get(`${API_URL}/coordinator/teacher-batches/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const batchList = res.data?.batches || [];
        setBatches(batchList);
        if (batchList.length > 0 && !selectedBatchId) {
          setSelectedBatchId(batchList[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch batches', err);
        const msg = err.response?.data?.error || err.message || 'Could not load your teacher batches.';
        setError(msg);
      }
    };

    fetchBatches();
  }, [token, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;

    const fetchLocations = async () => {
      setLoading(true);
      try {
        const res = await axios.get(
          `${API_URL}/tracking/location/batch/${selectedBatchId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStudents(res.data || []);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch locations', err);
        setError('Could not load student locations.');
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();
  }, [selectedBatchId, token]);

  useEffect(() => {
    if (!token) return;

    socketRef.current = io(SOCKET_URL, { auth: { token } });

    socketRef.current.on('connect', () => {
      console.log('Teacher socket connected');
    });

    socketRef.current.on('student:location_update', (data) => {
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.student_id === data.studentId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...data };
          return next;
        }
        return prev;
      });
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [token, selectedBatchId]);

  useEffect(() => {
    if (!token || !selectedBatchId) return;
    if (socketRef.current?.connected) {
      socketRef.current.emit('student:join_batch', selectedBatchId);
    }
  }, [token, selectedBatchId]);

  const activeStudents = students.filter((s) => s.status === 'checked_in');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Live Student Map — Marinduque, Philippines</h2>

        {batches.length === 0 && !loading && (
          <p className={styles.info}>You have not been assigned to a batch yet.</p>
        )}

        {batches.length > 0 && (
          <div className={styles.controls}>
            <label className={styles.label}>Batch:</label>
            <select
              className={styles.select}
              value={selectedBatchId || ''}
              onChange={(e) => setSelectedBatchId(Number(e.target.value))}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_label}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {loading && <p className={styles.info}>Loading map data...</p>}

        {!loading && selectedBatchId && (
          <div className={styles.mapWrapper}>
            {activeStudents.length === 0 && !loading && (
              <p className={styles.info}>
                No students are currently checked in for this batch.
              </p>
            )}
            <MapContainer
              center={MARINDUQUE_CENTER}
              zoom={11}
              minZoom={10}
              maxBounds={MARINDUQUE_BOUNDS}
              maxBoundsViscosity={1.0}
              className={styles.map}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds students={activeStudents} />
              {activeStudents.map((s) => {
                if (!s.latitude || !s.longitude) return null;
                return (
                  <Marker
                    key={s.student_id}
                    position={[Number(s.latitude), Number(s.longitude)]}
                    icon={greenIcon}
                  >
                    <Popup>
                      <strong>
                        {s.first_name} {s.last_name}
                      </strong>
                      <br />
                      Checked in: {new Date(s.check_in_time).toLocaleTimeString()}
                      <br />
                      Accuracy: {s.accuracy ? `${Math.round(s.accuracy)}m` : 'N/A'}
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        )}

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.dotGreen}></span>
            <span>{activeStudents.length} active student{activeStudents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className={styles.legendItem}>
            <span>
              {students.length - activeStudents.length} student{students.length - activeStudents.length !== 1 ? 's' : ''} not checked in
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveMap;
