import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents
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
  remove
} from "firebase/database";
import leoProfanity from "leo-profanity";

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
const LIMIT = 3; // 3 метки
const WINDOW = 10 * 60 * 1000; // 10 минут в мс

// Кастомизация marker-иконки, чтобы не было багов на vite+leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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

function AddMarker({ onAdd }: { onAdd: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e: any) {
      onAdd(e.latlng);
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

const headerFooterStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "14px 0",
  transition: "background 0.3s, color 0.3s"
};

function getMarkerTimes(userId: number): number[] {
  const data = localStorage.getItem('markerTimes-' + userId);
  return data ? JSON.parse(data) : [];
}
function setMarkerTimes(userId: number, times: number[]) {
  localStorage.setItem('markerTimes-' + userId, JSON.stringify(times));
}

export default function App() {
  // Telegram Mini App интеграция:
  const [tgUser, setTgUser] = useState<any>(null);

  useEffect(() => {
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe?.user) {
      setTgUser(tg.initDataUnsafe.user);
      tg.ready?.();
      tg.expand?.();
    }
  }, []);

  // Применим русский словарь для leo-profanity (обязательно!)
  useEffect(() => {
    leoProfanity.loadDictionary('ru');
  }, []);

  // Firebase
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [pendingLatLng, setPendingLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notify, setNotify] = useState<string | null>(null);

  // Подписка на базу
  useEffect(() => {
    onValue(markersRef, (snapshot: any) => {
      const dbMarkers = (snapshot.val() as any) || {};
      const result: MarkerData[] = Object.entries(dbMarkers).map(([key, value]: any) => ({
        key,
        ...(value as Omit<MarkerData, "key">)
      }));
      setMarkers(result);

      // автоматическое удаление старых меток (старше 2 часов)
      const now = Date.now();
      for (const [key, value] of Object.entries(dbMarkers)) {
        if (now - (value as any).timestamp > 2 * 60 * 60 * 1000) {
          remove(ref(db, `markers/${key}`));
        }
      }
    });
    return () => { off(markersRef); };
  }, []);

  // Для уведомлений
  const showNotify = (msg: string) => {
    setNotify(msg);
    setTimeout(() => setNotify(null), 3500);
  };

  const handleAddMarker = (latlng: { lat: number; lng: number }) => {
    setPendingLatLng(latlng);
    setCommentInput("");
  };

  const handleSave = () => {
    if (!tgUser) {
      showNotify("Войдите через Telegram!");
      return;
    }

    // === Фильтрация комментариев (цензура) ===
    if (leoProfanity.check(commentInput)) {
      showNotify("Комментарий содержит недопустимые слова.");
      return;
    }

    // === Лимит 3 метки за 10 минут ===
    let times = getMarkerTimes(tgUser.id);
    const now = Date.now();
    times = times.filter((t: number) => now - t < WINDOW);
    if (times.length >= LIMIT) {
      const firstTime = times[0];
      const waitMs = WINDOW - (now - firstTime);
      const waitMin = Math.ceil(waitMs / 60000);
      showNotify(`Лимит меток исчерпан. Метки восстановятся через ${waitMin} мин.`);
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
    // Обновляем метку: увеличиваем confirmCount и добавляем юзера в confirmedBy
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
  };

  // Simple Notification component
  function Notification() {
    if (!notify) return null;
    return (
      <div style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
        background: "#222e", color: "#fff", padding: "16px 30px", borderRadius: 10,
        fontWeight: "bold", fontSize: 18, zIndex: 1100, boxShadow: "0 6px 20px #0006",
        border: "2px solid #fff"
      }}>{notify}</div>
    );
  }

  // ------- SVG ICONS ---------
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
            fontWeight: "bold",
            fontSize: 22
          }}
        >
          Карта ДПС Воронеж
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, gap: 8 }}>
          {tgUser &&
            <span style={{fontWeight: 'bold', color: "#1976d2"}}>
              👤 {tgUser.first_name || tgUser.username}
            </span>
          }
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            style={{
              padding: "8px 18px",
              borderRadius: 7,
              background: theme === "dark" ? "#333" : "#fff",
              color: theme === "dark" ? "#fff" : "#333",
              border: "1px solid #bbb",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px 0 rgba(0,0,0,.05)"
            }}
            aria-label={theme === "dark" ? "Светлая карта" : "Тёмная карта"}
          >
            {theme === "dark" ? SunIcon : MoonIcon}
          </button>
        </div>

        <MapContainer
          center={[51.661535, 39.200287] as [number, number]}
          zoom={12}
          style={{ height: "80vh", width: "100%" }}
        >
          <TileLayer
            url={tileLayers[theme].url}
            attribution={tileLayers[theme].attribution as any}
          />
          <AddMarker onAdd={tgUser ? handleAddMarker : () => showNotify("Войдите через Telegram!")} />
          {markers.map((marker) => (
            <Marker key={marker.key} position={[marker.lat, marker.lng]}>
              <Popup>
                <b>Комментарий:</b> {marker.comment}<br />
                <small>Время: {marker.time}</small><br />
                <small>
                  {marker.creatorName && <>Отправил: {marker.creatorName}<br /></>}
                </small>
                <div style={{marginTop: 8}}>
                  {tgUser && marker.confirmedBy?.[tgUser.id] ? (
                    <span style={{color: 'green', fontWeight: 'bold'}}>
                      Вы уже подтвердили 👍
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConfirmMarker(marker)}
                      style={{
                        cursor: "pointer",
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: "1px solid #aaa",
                        background: "#e2f0d9",
                        fontWeight: 'bold'
                      }}
                    >✅ Подтвердить</button>
                  )}
                  <span style={{marginLeft: 10, fontWeight: 'bold', color: "#1976d2"}}>
                    {marker.confirmCount}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {!!pendingLatLng && (
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
                padding: 24,
                borderRadius: 10,
                minWidth: 270,
                textAlign: "center"
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 10 }}>
                Введите комментарий
              </div>
              <input
                style={{
                  width: "95%",
                  padding: 8,
                  marginTop: 8,
                  borderRadius: 6,
                  border: "1px solid #ccc"
                }}
                type="text"
                placeholder="Комментарий..."
                value={commentInput}
                onChange={e => setCommentInput((e as any).target.value)}
                autoFocus
              />
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={!commentInput.trim()}
                  style={{
                    marginRight: 8,
                    padding: "8px 16px",
                    borderRadius: 6,
                    background: "#1976d2",
                    color: "white",
                    border: "none",
                    cursor: !commentInput.trim() ? "not-allowed" : "pointer"
                  }}
                >
                  Добавить
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    background: "#e0e0e0",
                    color: "#333",
                    border: "none",
                    cursor: "pointer"
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
            fontSize: 15,
            background: theme === "dark" ? "#222" : "#fff",
            color: theme === "dark" ? "#e0e0e0" : "#222"
          }}
        >
          Кликните по карте, чтобы добавить метку (лимит: 3 метки на 10 минут). <br />
          Подтвердить метку можно только один раз.
        </div>
      </div>
    </>
  );
}