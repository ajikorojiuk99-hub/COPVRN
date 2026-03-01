import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  Polyline as RLPolyline,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  push,
  onValue,
  update,
  off,
  remove,
  set,
  onDisconnect
} from "firebase/database";
import leoProfanity from "leo-profanity";
import SplashScreen from "./SplashScreen";

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyAlxzHxukmQx4icJ899NOkmNPauhBfz-fo",
  authDomain: "dpsvrn-3ac57.firebaseapp.com",
  projectId: "dpsvrn-3ac57",
  storageBucket: "dpsvrn-3ac57.appspot.com",
  messagingSenderId: "319289269956",
  appId: "1:319289269956:web:c3320e215f17cda6faf391",
  measurementId: "G-WC95E4Z86S",
  databaseURL: "https://dpsvrn-3ac57-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const markersRef = ref(db, "markers");

// Лимиты
const LIMIT = 3;
const WINDOW = 10 * 60 * 1000;

// Кастомизация marker-иконки
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// МАЛЕНЬКИЙ ЗЕЛЕНЫЙ МАРКЕР для начала "чистого участка"
const greenStartIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  iconSize: [12, 20],
  iconAnchor: [6, 20],
  popupAnchor: [0, -18],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [30, 18],
  shadowAnchor: [6, 18]
});

type MarkerData = {
  key: string;
  lat: number;
  lng: number;
  time: string;
  timestamp: number;
  comment: string;
  confirmCount: number;
  createdBy?: number;
  creatorName?: string;
  confirmedBy?: { [uid: number]: boolean };
};

type PolylineData = {
  points: { lat: number; lng: number }[];
  time: string;
  createdBy: number;
  creatorName: string;
  timestamp: number;
};

// --- СТИЛИ КНОПОК (единый вид) ---
const unifiedButtonStyle: React.CSSProperties = {
  margin: "0 8px 0 0",
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: "bold",
  background: "#1976d2",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  boxShadow: "0 2px 7px #e9e9e9",
  transition: "background 0.15s"
};

const greenButtonStyle = {
  ...unifiedButtonStyle,
  background: "#23b30c",
  color: "#fff",
};

const grayButtonStyle = {
  ...unifiedButtonStyle,
  background: "#e0e0e0",
  color: "#222",
};

// --- Вспом. функции для линий ---
function getDistance(lat1:number, lng1:number, lat2:number, lng2:number) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2-lat1) * Math.PI / 180, Δλ = (lng2-lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function isPatrolNearLine(line: PolylineData, dpsMarkers: MarkerData[]) {
  const RADIUS = 50;
  return dpsMarkers.some(marker =>
    line.points.some(pt => getDistance(marker.lat, marker.lng, pt.lat, pt.lng) < RADIUS)
  );
}
function isLineExpired(line: PolylineData) {
  return Date.now() - line.timestamp > 60 * 60 * 1000;
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e: any) {
      onMapClick(e.latlng);
    }
  });
  return null;
}

const tileLayers: Record<string, { url: string; attribution: string }> = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors"
  },
  dark: {
    url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; <a href='https://carto.com/attributions'>CARTO</a>"
  }
};

function getMarkerTimes(userId: number): number[] {
  const data = localStorage.getItem('markerTimes-' + userId);
  return data ? JSON.parse(data) : [];
}
function setMarkerTimes(userId: number, times: number[]) {
  localStorage.setItem('markerTimes-' + userId, JSON.stringify(times));
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;

  // Telegram Mini App интеграция:
  const [tgUser, setTgUser] = useState<any>(null);

  // --- USERS & ONLINE COUNTS
  const [usersCount, setUsersCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe?.user) {
      setTgUser(tg.initDataUnsafe.user);
      tg.ready?.();
      tg.expand?.();
    }
  }, []);

  useEffect(() => {
    if (!tgUser) return;
    const userRef = ref(db, "users/" + tgUser.id);
    set(userRef, {
      id: tgUser.id,
      name: tgUser.first_name,
      username: tgUser.username || null
    });
  }, [tgUser]);

  useEffect(() => {
    if (!tgUser) return;
    const presenceRef = ref(db, "presence/" + tgUser.id);
    set(presenceRef, true);
    onDisconnect(presenceRef).remove();
    return () => {
      set(presenceRef, null);
    };
  }, [tgUser]);

  useEffect(() => {
    const usersRef = ref(db, "users");
    onValue(usersRef, snap => {
      const val = snap.val() || {};
      setUsersCount(Object.keys(val).length);
    });

    const presenceRef = ref(db, "presence");
    onValue(presenceRef, snap => {
      const val = snap.val() || {};
      setOnlineCount(Object.keys(val).length);
    });
  }, []);

  useEffect(() => {
    leoProfanity.loadDictionary('ru');
  }, []);

  // Firebase маркеры
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [pendingLatLng, setPendingLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notify, setNotify] = useState<string | null>(null);

  // Polyline ЧИСТЫЙ УЧАСТОК
  const [mode, setMode] = useState<null | "choose" | "dps" | "clean">(null);
  const [firstClick, setFirstClick] = useState<{lat: number; lng: number} | null>(null);
  const [cleanPoints, setCleanPoints] = useState<{lat: number, lng: number}[]>([]);
  const [polylines, setPolylines] = useState<PolylineData[]>([]);

  useEffect(() => {
    onValue(markersRef, (snapshot: any) => {
      const dbMarkers = (snapshot.val() as any) || {};
      const result: MarkerData[] = Object.entries(dbMarkers).map(
        ([key, value]: [string, any]) => ({
          key,
          ...(value as MarkerData)
        })
      );
      setMarkers(result);

      // автоматическое удаление старых меток (старше 2 часов)
      const now = Date.now();
      for (const [key, value] of Object.entries(dbMarkers)) {
        if (now - (value as any).timestamp > 2 * 60 * 60 * 1000) {
          remove(ref(db, `markers/${key}`));
        }
      }
    });
    return () => {
      off(markersRef);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPolylines(prev => prev.filter(line => !isLineExpired(line)));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const showNotify = (msg: string) => {
    setNotify(msg);
    setTimeout(() => setNotify(null), 3500);
  };

  function handleMapClick(latlng: {lat: number, lng: number}) {
    if (mode === null) {
      setFirstClick(latlng);
      setMode("choose");
      return;
    }
    if (mode === "clean") {
      setCleanPoints((prev) => [...prev, latlng]);
      return;
    }
    if (mode === "dps") {
      setPendingLatLng(latlng);
      setMode(null);
      return;
    }
  }

  const handleAddMarker = (latlng: { lat: number; lng: number }) => {
    setPendingLatLng(latlng);
    setCommentInput("");
  };

  const handleSave = () => {
    if (!tgUser) {
      showNotify("Войдите через Telegram!");
      return;
    }
    if (leoProfanity.check(commentInput)) {
      showNotify("Комментарий содержит недопустимые слова.");
      return;
    }
    let times = getMarkerTimes(tgUser.id);
    const now = Date.now();
    times = times.filter((t: number) => now - t < WINDOW);
    if (times.length >= LIMIT) {
      const firstTime = times[0];
      const waitMs = WINDOW - (now - firstTime);
      const waitMin = Math.ceil(waitMs / 60000);
      showNotify(
        `Лимит меток исчерпан. Метки восстановятся через ${waitMin} мин.`
      );
      return;
    }
    times.push(now);
    setMarkerTimes(tgUser.id, times);
    if (pendingLatLng && commentInput.trim()) {
      const newMarker = {
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng,
        comment: commentInput,
        time: new Date().toLocaleTimeString(),
        timestamp: now,
        confirmCount: 0,
        createdBy: tgUser.id,
        creatorName: tgUser.first_name,
        confirmedBy: {}
      };
      push(markersRef, newMarker);
      setPendingLatLng(null);
      setCommentInput("");
      showNotify("Метка добавлена 👍");
    }
  };

  const handleConfirmMarker = (marker: MarkerData) => {
    if (!tgUser) {
      showNotify("Войдите через Telegram!");
      return;
    }
    if (marker.confirmedBy && marker.confirmedBy[tgUser.id]) {
      showNotify("Вы уже подтвердили эту метку!");
      return;
    }
    const updateRef = ref(db, `markers/${marker.key}`);
    update(updateRef, {
      confirmCount: (marker.confirmCount || 0) + 1,
      confirmedBy: {
        ...(marker.confirmedBy || {}),
        [tgUser.id]: true
      }
    });
    showNotify("Подтверждение принято 👍");
  };

  const handleCancel = () => {
    setPendingLatLng(null);
    setCommentInput("");
    setCleanPoints([]);
    setMode(null);
    setFirstClick(null);
  };

  function finishCleanLine() {
    if (!tgUser) {
      showNotify("Войдите через Telegram!");
      return;
    }
    if (cleanPoints.length < 2) {
      showNotify("Укажите хотя бы 2 точки");
      return;
    }
    setPolylines(prev => [
      ...prev,
      {
        points: cleanPoints,
        time: new Date().toLocaleTimeString(),
        createdBy: tgUser.id,
        creatorName: tgUser.first_name,
        timestamp: Date.now()
      }
    ]);
    setCleanPoints([]);
    setMode(null);
    setFirstClick(null);
  }

  const headerFooterStyle: React.CSSProperties = {
    textAlign: "center",
    padding: isMobile ? "10px 0" : "14px 0",
    fontSize: isMobile ? 17 : 22,
    transition: "background 0.3s, color 0.3s"
  };

  // SVG ICONS
  const SunIcon = (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle cx="13" cy="13" r="5.5" stroke="currentColor" strokeWidth="2"/>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="13" y1="2" x2="13" y2="6"/>
        <line x1="13" y1="20" x2="13" y2="24"/>
        <line x1="2" y1="13" x2="6" y2="13"/>
        <line x1="20" y1="13" x2="24" y2="13"/>
        <line x1="5.222" y1="5.222" x2="8.05" y2="8.05"/>
        <line x1="17.95" y1="17.95" x2="20.778" y2="20.778"/>
        <line x1="5.222" y1="20.778" x2="8.05" y2="17.95"/>
        <line x1="17.95" y1="8.05" x2="20.778" y2="5.222"/>
      </g>
    </svg>
  );

  const MoonIcon = (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21 17C19.8203 17.5927 18.4311 17.8616 17 17.7222C13.134 17.3426 10 14.2086 10 10.3426C10 8.91158 10.2689 7.52245 10.8616 6.34264C6.93108 7.54233 4 11.1165 4 15.3426C4 19.7607 7.58172 23.3426 12 23.3426C14.5295 23.3426 16.7732 22.1322 18.2222 20.2222C18.0822 18.7912 18.3511 17.4016 19 16.2222Z"
        stroke="currentColor" strokeWidth="2" fill="none"
      />
    </svg>
  );

  function Notification() {
    if (!notify) return null;
    return (
      <div style={{
        position: 'fixed',
        top: isMobile ? 8 : 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: "#222e",
        color: "#fff",
        padding: isMobile ? "10px 10px" : "16px 30px",
        borderRadius: 10,
        fontWeight: "bold",
        fontSize: isMobile ? 15 : 18,
        zIndex: 1100,
        boxShadow: "0 6px 20px #0006",
        border: "2px solid #fff"
      }}>{notify}</div>
    );
  }

  if (showSplash) {
    return <SplashScreen onEnd={() => setShowSplash(false)} />;
  }

  return (
    <>
      <style>
        {`.leaflet-control-attribution { display: none !important; }`}
      </style>
      <div
        style={{
          background: theme === "dark" ? "#171d22" : "#fff",
          minHeight: "100vh",
          transition: "background 0.3s"
        }}
      >
        <Notification />
        <div
          style={{
            ...headerFooterStyle,
            background: theme === "dark" ? "#222" : "#fff",
            color: theme === "dark" ? "#e0e0e0" : "#222",
            fontWeight: "bold"
          }}
        >
          Карта ДПС Воронеж
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: isMobile ? 3 : 8,
            gap: isMobile ? 8 : 14,
            flexWrap: isMobile ? "wrap" : "nowrap"
          }}>
          {tgUser &&
            <span style={{ fontWeight: 'bold', color: "#1976d2", fontSize: isMobile ? 14 : 18 }}>
              👤 {tgUser.first_name || tgUser.username}
            </span>
          }
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            style={{
              padding: isMobile ? "6px 13px" : "8px 18px",
              borderRadius: 7,
              background: theme === "dark" ? "#333" : "#fff",
              color: theme === "dark" ? "#fff" : "#333",
              border: "1px solid #bbb",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: isMobile ? 18 : 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px 0 rgba(0,0,0,.05)",
              margin: isMobile ? "4px 0" : ""
            }}
            aria-label={theme === "dark" ? "Светлая карта" : "Тёмная карта"}
          >
            {theme === "dark" ? SunIcon : MoonIcon}
          </button>
          <div style={{ minWidth: 60, marginLeft: 8, textAlign: "left", lineHeight: "1.1", fontSize: isMobile ? 13 : 15 }}>
            <div style={{ color: "#aaa", fontSize: isMobile ? 11 : 13 }}>Всего: {usersCount}</div>
            <div style={{ color: "#27ae60", fontWeight: "bold" }}>Онлайн: {onlineCount}</div>
          </div>
        </div>
        <MapContainer
          center={[51.661535, 39.200287]}
          zoom={12}
          style={{
            width: "100vw",
            maxWidth: "100vw",
            height: isMobile ? "62vh" : "80vh",
            minHeight: 260,
            maxHeight: isMobile ? "73vh" : "81vh",
          }}
        >
          <TileLayer
            url={tileLayers[theme].url}
            attribution={tileLayers[theme].attribution as any}
          />
          <MapClickHandler onMapClick={handleMapClick} />

          {/* Чистые участки (фильтрация автоматически скрывает старые и с DПС) */}
          {polylines
            .filter(line => !isLineExpired(line))
            .filter(line => !isPatrolNearLine(line, markers))
            .map((line, i) => (
              <RLPolyline
                key={i}
                positions={line.points.map(pt => [pt.lat, pt.lng])}
                pathOptions={{ color: "green", weight: 8, opacity: 0.65 }}
              >
                <Popup>
                  Чистый участок<br />
                  <small>Отправил: {line.creatorName}</small><br />
                  <small>Время: {line.time}</small>
                </Popup>
              </RLPolyline>
          ))}

          {/* Текущая линия при добавлении */}
          {mode === "clean" && cleanPoints.length > 0 &&
            <RLPolyline
              positions={cleanPoints.map(pt=>[pt.lat, pt.lng])}
              pathOptions={{ color: "lime", weight: 6, dashArray: "5 10" }}
            />
          }

          {/* Первый маркер “чистый участок” с зеленой иконкой */}
          {mode === "clean" && cleanPoints.length > 0 && (
            <Marker position={[cleanPoints[0].lat, cleanPoints[0].lng]} icon={greenStartIcon}>
              <Popup>Старт участка</Popup>
            </Marker>
          )}

          {/* Маркеры ДПС */}
          {markers.map((marker: MarkerData) => (
            <Marker key={marker.key} position={[marker.lat, marker.lng]}>
              <Popup>
                <b>Комментарий:</b> {marker.comment}<br />
                <small>Время: {marker.time}</small><br />
                <small>
                  {marker.creatorName && <>Отправил: {marker.creatorName}<br /></>}
                </small>
                <div style={{ marginTop: 8 }}>
                  {tgUser && marker.confirmedBy?.[tgUser.id] ? (
                    <span style={{ color: 'green', fontWeight: 'bold', fontSize: isMobile ? 15 : 16 }}>
                      Вы уже подтвердили 👍
                    </span>
                  ) : (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleConfirmMarker(marker);
                      }}
                      style={{
                        cursor: "pointer",
                        padding: isMobile ? "7px 12px" : "8px 16px",
                        borderRadius: 6,
                        fontSize: isMobile ? 15 : 18,
                        background: "#1976d2",
                        color: "white",
                        border: "none",
                        fontWeight: "bold",
                        marginRight: 8
                      }}
                    >✅ Подтвердить</button>
                  )}
                  <span style={{ marginLeft: 10, fontWeight: 'bold', color: "#1976d2", fontSize: isMobile ? 14 : 15 }}>
                    {marker.confirmCount}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        
        {/* --- UI выбора --- */}
        {mode === "choose" && firstClick && (
          <div style={{
            position: "fixed", left: "50%", top: "23%", zIndex: 1001,
            transform: "translateX(-50%)", background: "#fff", borderRadius: 12,
            padding: 18, boxShadow: "0 2px 12px #0001", display: "flex", flexDirection: "column", alignItems: "center"
          }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Добавить:</div>
            <button
              style={{ ...unifiedButtonStyle, margin: "0 0 7px 0", background: "#ed4040" }}
              onClick={() => { setMode("dps"); setPendingLatLng(firstClick); }}
            >
              Патруль ДПС
            </button>
            <button
              style={{ ...greenButtonStyle, margin: "0 0 7px 0" }}
              onClick={() => { setMode("clean"); setCleanPoints([firstClick]); }}
            >
              Чистый участок
            </button>
            <button
              style={{ ...grayButtonStyle, margin: "5px 0 0 0", fontSize: 14 }}
              onClick={handleCancel}
            >
              Отмена
            </button>
          </div>
        )}

        {/* --- UI добавления линии --- */}
        {mode === "clean" && cleanPoints.length > 0 && (
          <div style={{
            position: "fixed", left: "50%", top: isMobile ? "8%" : "15%", zIndex: 1001,
            transform: "translateX(-50%)", background: "#fff", borderRadius: 12,
            padding: 18, boxShadow: "0 2px 12px #0001",
            display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", gap: 8
          }}>
            <div style={{marginBottom: isMobile ? 8 : 0}}>Точек: {cleanPoints.length}</div>
            <button onClick={finishCleanLine} style={greenButtonStyle}>
              Завершить участок
            </button>
            <button onClick={handleCancel} style={grayButtonStyle}>
              Отмена
            </button>
          </div>
        )}

        {/* Подсказка для второй точки */}
        {mode === "clean" && cleanPoints.length === 1 && (
          <div
            style={{
              position: "fixed", left: "50%", top: isMobile ? "15%" : "25%", zIndex: 1002,
              background: "#fff", borderRadius: 12, padding: 12, transform: "translateX(-50%)",
              color: "#1976d2", fontWeight: 500
            }}>Укажи конечную точку</div>
        )}

        {!!pendingLatLng && !mode?.startsWith('clean') && (
          <div
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
            }}
            onClick={handleCancel}
          >
            <div
              style={{
                background: "white",
                padding: isMobile ? 12 : 24,
                borderRadius: 10,
                width: isMobile ? "94vw" : 270,
                minWidth: isMobile ? "unset" : 270,
                textAlign: "center"
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: "bold", fontSize: isMobile ? 15 : 16, marginBottom: 10 }}>
                Введите комментарий
              </div>
              <input
                style={{
                  width: "94%",
                  fontSize: isMobile ? 15 : 18,
                  padding: isMobile ? 7 : 8,
                  marginTop: 8,
                  borderRadius: 6,
                  border: "1px solid #ccc"
                }}
                type="text"
                placeholder="Комментарий..."
                value={commentInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommentInput(e.target.value)}
                autoFocus
              />
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={!commentInput.trim()}
                  style={{
                    marginRight: 8,
                    padding: isMobile ? "7px 12px" : "8px 16px",
                    borderRadius: 6,
                    fontSize: isMobile ? 15 : 18,
                    background: "#1976d2",
                    color: "white",
                    border: "none",
                    cursor: !commentInput.trim() ? "not-allowed" : "pointer",
                    marginBottom: 8
                  }}
                >
                  Добавить
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: isMobile ? "7px 12px" : "8px 16px",
                    borderRadius: 6,
                    fontSize: isMobile ? 15 : 18,
                    background: "#e0e0e0",
                    color: "#333",
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 8
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
        <div
          style={{
            ...headerFooterStyle,
            fontWeight: "normal",
            background: theme === "dark" ? "#222" : "#fff",
            color: theme === "dark" ? "#e0e0e0" : "#222",
            fontSize: isMobile ? 13 : 15
          }}
        >
          Кликните по карте, чтобы добавить метку (лимит: 3 метки на 10 минут). <br />
          Подтвердить метку можно только один раз.
        </div>
      </div>
    </>
  );
}