// frontend/useLocationTracker.js
// Drop into a React student dashboard. Handles:
//  - requesting geolocation permission
//  - checking in / out via the API
//  - streaming live position over the same socket while checked in

import { useState, useRef, useCallback, useEffect } from "react";
import { io } from "socket.io-client";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

function classifyLocationError(err) {
  if (!navigator.geolocation) {
    return { issueType: "unsupported", message: "This browser doesn't support location sharing. Please use Chrome, Safari, or Edge." };
  }
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        issueType: "permission_denied",
        message: "Location access is blocked. Tap the site info icon next to the address bar (or Settings > Site settings) and allow Location for this site, then try again.",
      };
    case err.POSITION_UNAVAILABLE:
      return {
        issueType: "position_unavailable",
        message: "Your device's Location/GPS is turned off. Turn it on in your phone's Settings, then try again.",
      };
    case err.TIMEOUT:
      return {
        issueType: "timeout",
        message: "Getting your location took too long. Check your GPS/network signal and try again.",
      };
    default:
      return { issueType: "position_unavailable", message: "Couldn't get your location. Please check your location settings and try again." };
  }
}

export function useLocationTracker({ token, teacherBatchId: propTeacherBatchId }) {
  const [status, setStatus] = useState("checked_out");
  const [teacherBatchId, setTeacherBatchId] = useState(propTeacherBatchId || null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { auth: { token } });
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!socketRef.current) return;
    if (teacherBatchId) {
      socketRef.current.emit("student:join_batch", teacherBatchId);
    }
  }, [teacherBatchId]);

  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Geolocation is not supported by this browser."));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });

  const startWatching = useCallback(() => {
    if (!token) {
      console.error('startWatching called without token');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          await axios.post(
            `${API_URL}/tracking/location/update`,
            { latitude, longitude, accuracy },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (err) {
          console.error("Failed to push location:", err);
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, [token]);

  const checkIn = useCallback(async () => {
    if (!token) {
      setError('Not authenticated. Please log in again.');
      return;
    }

    let pos;
    try {
      pos = await getCurrentPosition();
    } catch (err) {
      const { issueType, message } = classifyLocationError(err);
      setError(message);
      try {
        await axios.post(
          `${API_URL}/tracking/attendance/location-issue`,
          { issueType },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (reportErr) {
        console.error("Failed to report location issue:", reportErr);
      }
      return;
    }

    try {
      const { latitude, longitude } = pos.coords;
      const res = await axios.post(
        `${API_URL}/tracking/attendance/check-in`,
        { latitude, longitude },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError(null);
      setStatus("checked_in");
      if (res.data?.teacherBatchId) {
        setTeacherBatchId(res.data.teacherBatchId);
      }
      startWatching();
    } catch (err) {
      setError(err.response?.data?.message || "Could not check in.");
    }
  }, [token, startWatching]);

  const checkOut = useCallback(async () => {
    if (!token) {
      setError('Not authenticated. Please log in again.');
      return;
    }

    // GPS is best-effort on checkout: if we can't read a position we still
    // let the student check out, just without a check-out coordinate.
    let latitude, longitude;
    try {
      const pos = await getCurrentPosition();
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch (err) {
      const { issueType } = classifyLocationError(err);
      try {
        await axios.post(
          `${API_URL}/tracking/attendance/location-issue`,
          { issueType },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (reportErr) {
        console.error("Failed to report location issue:", reportErr);
      }
    }

    try {
      await axios.post(
        `${API_URL}/tracking/attendance/check-out`,
        { latitude, longitude },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setStatus("checked_out");
      setTeacherBatchId(null);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not check out.");
    }
  }, [token]);

  // Safety: stop the GPS watch if the component unmounts mid-session
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return { status, teacherBatchId, error, checkIn, checkOut };
}