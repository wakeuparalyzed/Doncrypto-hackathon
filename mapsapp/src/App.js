import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  CircleMarker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Если используешь markercluster плагин, убедись что скрипты и стили подключены (установлены через npm).
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "leaflet-routing-machine";

// Inline styles — можно вынести в отдельный CSS
const styles = {
  app: {
    height: "100vh",
    display: "flex",
    fontFamily: "Inter, Arial, Helvetica, sans-serif",
    color: "#f1f1f1",
    background: "#0e0e11",
  },
  sidebar: {
    width: 340,
    padding: 20,
    boxSizing: "border-box",
    background: "#141418",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
  },
  mapWrap: { flex: 1, position: "relative" },
  loginOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
  },
  loginCard: {
    width: 380,
    padding: 28,
    borderRadius: 14,
    background: "rgba(28,28,31,0.92)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
    textAlign: "center",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "none",
    background: "#1c1c1f",
    color: "#f1f1f1",
    marginBottom: 12,
    outline: "none",
  },
  buttonPrimary: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    background: "#4f8cff",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonGhost: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #4f8cff",
    background: "transparent",
    color: "#4f8cff",
    cursor: "pointer",
    fontWeight: 600,
  },
  smallMuted: { color: "#b0b0b0", fontSize: 13 },
};

// Helper: load/save to localStorage
const STORAGE_PREFIX = "mapsapp_v1_";
function save(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}
function load(key, fallback) {
  const raw = localStorage.getItem(STORAGE_PREFIX + key);
  return raw ? JSON.parse(raw) : fallback;
}

// Initial demo data (Donetsk-oriented sample)
const DEMO_LOCS = [
  {
    id: 1,
    name: "Кафе Капучино",
    category: "Кафе",
    lat: 48.0159,
    lng: 37.8028,
    address: "ул. Примерная 1, Донецк",
    hours: "08:00-22:00",
    status: "open",
    desc: "Уютное место в центре.",
    reviews: [{ id: 101, author: "Иван", rating: 5, text: "Отлично!" }],
  },
  {
    id: 2,
    name: "Парк Солнечный",
    category: "Парк",
    lat: 48.02,
    lng: 37.81,
    address: "ул. Парковая, Донецк",
    hours: "Круглосуточно",
    status: "open",
    desc: "Зелёное место для прогулок.",
  },
];

export default function App() {
  // app state
  const [locations, setLocations] = useState(load("locations", DEMO_LOCS));
  useEffect(() => save("locations", locations), [locations]);

  const [users, setUsers] = useState(
    load("users", [
      { id: "u_guest", name: "Гость", role: "guest", blocked: false },
    ])
  );
  useEffect(() => save("users", users), [users]);

  const [currentUser, setCurrentUser] = useState(null);
  const [favorites, setFavorites] = useState(load("favorites", {}));
  useEffect(() => save("favorites", favorites), [favorites]);

  const [personalRoutes, setPersonalRoutes] = useState(
    load("personalRoutes", {})
  );
  useEffect(() => save("personalRoutes", personalRoutes), [personalRoutes]);

  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [distance, setDistance] = useState(5000);
  const [showLogin, setShowLogin] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const mapRef = useRef();
  const clusterRef = useRef(null);
  const routingRef = useRef(null);
  const userMarkerRef = useRef(null);

  // role perms
  const PERMS = {
    guest: {
      canView: true,
      canFav: false,
      canReview: false,
      canSaveRoutes: false,
      canEditLocation: false,
    },
    user: {
      canView: true,
      canFav: true,
      canReview: true,
      canSaveRoutes: true,
      canEditLocation: false,
    },
    owner: {
      canView: true,
      canFav: true,
      canReview: true,
      canSaveRoutes: true,
      canEditLocation: true,
    },
    moderator: {
      canView: true,
      canFav: true,
      canReview: true,
      canSaveRoutes: true,
      canEditLocation: true,
    },
    admin: {
      canView: true,
      canFav: true,
      canReview: true,
      canSaveRoutes: true,
      canEditLocation: true,
    },
  };

  // initial map center: Donetsk
  const initialCenter = [48.0159, 37.8028];

  // Setup marker cluster and map direct L access (plugin integration)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ensure cluster layer exists
    if (!clusterRef.current) clusterRef.current = L.markerClusterGroup();
    // add cluster to map if not present
    if (!map.hasLayer(clusterRef.current)) map.addLayer(clusterRef.current);

    // render markers into cluster
    clusterRef.current.clearLayers();
    locations.forEach((loc) => {
      const m = L.marker([loc.lat, loc.lng]);
      m.on("click", () => setSelectedLocation(loc));
      m.bindTooltip(loc.name);
      clusterRef.current.addLayer(m);
    });
  }, [locations, mapRef.current]);

  // try geolocation and place user marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude,
          lng = pos.coords.longitude;
        if (userMarkerRef.current) {
          map.removeLayer(userMarkerRef.current);
          userMarkerRef.current = null;
        }
        userMarkerRef.current = L.circleMarker([lat, lng], {
          radius: 7,
          color: "#0ea5a4",
          fillColor: "#0ea5a4",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("Вы здесь");
        map.setView([lat, lng], 13);
      },
      (err) => {
        console.warn("Geolocation failed:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 7000 }
    );
  }, [mapRef.current]);

  // helper: toggle favorite
  function toggleFav(locId) {
    if (!currentUser) return alert("Войдите в систему");
    if (!PERMS[currentUser.role].canFav)
      return alert("Нет прав добавлять в избранное");
    const uid = currentUser.id;
    const copy = { ...favorites };
    if (!copy[uid]) copy[uid] = [];
    const idx = copy[uid].indexOf(locId);
    if (idx === -1) copy[uid].push(locId);
    else copy[uid].splice(idx, 1);
    setFavorites(copy);
  }

  // apply filters simple
  function filteredLocations() {
    const q = searchQuery.trim().toLowerCase();
    return locations.filter((loc) => {
      if (category !== "all" && loc.category !== category) return false;
      if (q && !`${loc.name} ${loc.address || ""}`.toLowerCase().includes(q))
        return false;
      if (distance && userMarkerRef.current) {
        const upos = userMarkerRef.current.getLatLng();
        const d = mapRef.current.distance([loc.lat, loc.lng], upos);
        if (d > distance) return false;
      }
      return true;
    });
  }

  // build route using Leaflet Routing Machine
  function buildRouteTo(loc) {
    if (!navigator.geolocation) return alert("Геолокация не поддерживается");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const from = L.latLng(pos.coords.latitude, pos.coords.longitude);
        const to = L.latLng(loc.lat, loc.lng);
        if (routingRef.current) {
          mapRef.current.removeControl(routingRef.current);
          routingRef.current = null;
        }
        routingRef.current = L.Routing.control({
          waypoints: [from, to],
          fitSelectedRoute: true,
        }).addTo(mapRef.current);
      },
      (err) => alert("Не могу получить позицию: " + err.message)
    );
  }

  // UI handlers
  function handleLogin(name, role) {
    const id = "user_" + Date.now();
    const u = { id, name: name || role, role, blocked: false };
    setUsers((prev) => {
      const next = [...prev, u];
      save("users", next);
      return next;
    });
    setCurrentUser(u);
    setShowLogin(false);
  }

  function handleLogout() {
    setCurrentUser(null);
    setShowLogin(true);
  }

  // reference component to get map instance
  function MapStarter() {
    const map = useMap();
    useEffect(() => {
      mapRef.current = map;
    }, [map]);
    return null;
  }

  // categories for filter
  const categories = [
    "all",
    ...Array.from(new Set(locations.map((l) => l.category))),
  ];

  // Placeholders for Yandex API integration (geocoding / routing):
  // When you get Yandex API key, you can add functions using fetch to 'https://geocode-maps.yandex.ru/1.x/?apikey=KEY&geocode=QUERY&format=json' etc.

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar} id="sidebar">
        <h2 style={{ color: "#4f8cff", margin: 0 }}>MapsApp</h2>
        <div
          id="user-info"
          style={{ background: "#1f1f24", padding: 10, borderRadius: 12 }}
        >
          {currentUser ? (
            <div>
              <strong>{currentUser.name}</strong> —{" "}
              <span style={{ color: "#b0b0b0" }}>{currentUser.role}</span>
            </div>
          ) : (
            <div style={styles.smallMuted}>Не в сети</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {currentUser ? (
            <button
              style={{ ...styles.buttonGhost, flex: 1 }}
              onClick={handleLogout}
            >
              Выйти
            </button>
          ) : null}
        </div>

        <div
          style={{
            background: "rgba(28,28,31,0.95)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <input
            placeholder="Поиск по имени или адресу"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.input}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ ...styles.input, padding: 10 }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label style={{ color: "#b0b0b0", fontSize: 13 }}>
            Радиус поиска (м): <strong>{distance}</strong>
          </label>
          <input
            type="range"
            min="500"
            max="50000"
            step="500"
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <div
          style={{
            background: "rgba(28,28,31,0.95)",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <h3 style={{ margin: "4px 0", color: "#4f8cff" }}>Избранное</h3>
          <ul
            id="favorites-list"
            style={{ padding: 0, margin: 0, listStyle: "none" }}
          >
            {(favorites[currentUser?.id] || []).map((fid) => {
              const loc = locations.find((l) => l.id === fid);
              if (!loc) return null;
              return (
                <li
                  key={fid}
                  style={{
                    padding: "8px 10px",
                    background: "#1f1f24",
                    borderRadius: 10,
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    mapRef.current.setView([loc.lat, loc.lng], 15);
                    setSelectedLocation(loc);
                  }}
                >
                  {loc.name}
                </li>
              );
            })}
          </ul>
        </div>

        <div
          style={{
            background: "rgba(28,28,31,0.95)",
            padding: 12,
            borderRadius: 12,
            marginTop: "auto",
          }}
        >
          <h4 style={{ margin: 0, color: "#4f8cff" }}>Панель роли</h4>
          <div style={{ marginTop: 8 }}>
            {currentUser && PERMS[currentUser.role]?.canAddLocation ? (
              <button style={{ ...styles.buttonPrimary, width: "100%" }}>
                Добавить локацию
              </button>
            ) : (
              <div style={styles.smallMuted}>Нет дополнительных действий</div>
            )}
          </div>
        </div>
      </aside>

      <main style={styles.mapWrap}>
        <MapContainer
          center={initialCenter}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(mapInstance) => {
            mapRef.current = mapInstance;
          }}
        >
          <MapStarter />

          {/* local tiles first (offline) */}
          <TileLayer
            url="/tiles/{z}/{x}/{y}.png"
            maxZoom={19}
            errorTileUrl=""
          />
          {/* fallback to OSM */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          {/* Render filtered markers as react-leaflet Markers for accessibility; cluster handled by L.markerClusterGroup above */}
          {filteredLocations().map((loc) => (
            <Marker
              key={loc.id}
              position={[loc.lat, loc.lng]}
              eventHandlers={{ click: () => setSelectedLocation(loc) }}
            >
              <Popup>
                <div style={{ minWidth: 150 }}>
                  <strong>{loc.name}</strong>
                  <div style={{ fontSize: 13, color: "#b0b0b0" }}>
                    {loc.category}
                  </div>
                  <div style={{ marginTop: 6 }}>{loc.desc}</div>
                  <div style={{ marginTop: 6 }}>
                    <button
                      style={styles.buttonPrimary}
                      onClick={() => {
                        if (!currentUser) return alert("Войдите");
                        toggleFav(loc.id);
                      }}
                    >
                      {" "}
                      {(favorites[currentUser?.id] || []).includes(loc.id)
                        ? "★ Убрать"
                        : "☆ В избранное"}{" "}
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Location card (bottom) */}
        {selectedLocation ? (
          <div
            style={{
              position: "absolute",
              left: 360,
              right: 16,
              bottom: 16,
              background: "rgba(28,28,31,0.95)",
              padding: 14,
              borderRadius: 12,
              zIndex: 900,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 6px 0" }}>{selectedLocation.name}</h3>
                <div style={{ color: "#b0b0b0", fontSize: 13 }}>
                  {selectedLocation.category} · {selectedLocation.address}
                </div>
              </div>
              <div>
                <button
                  style={{ ...styles.buttonGhost }}
                  onClick={() => setSelectedLocation(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <p style={{ marginTop: 10 }}>{selectedLocation.desc}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={styles.buttonPrimary}
                onClick={() => buildRouteTo(selectedLocation)}
              >
                Построить маршрут
              </button>
              <button
                style={styles.buttonGhost}
                onClick={() => toggleFav(selectedLocation.id)}
              >
                {(favorites[currentUser?.id] || []).includes(
                  selectedLocation.id
                )
                  ? "★ Убрать"
                  : "☆ В избранное"}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: "6px 0" }}>Отзывы</h4>
              <ul style={{ padding: 0, margin: 0 }}>
                {(selectedLocation.reviews || []).map((r) => (
                  <li
                    key={r.id}
                    style={{
                      padding: 8,
                      background: "#1f1f24",
                      borderRadius: 8,
                      marginBottom: 6,
                    }}
                  >
                    <strong>{r.author}</strong> — {r.rating}★
                    <div style={{ marginTop: 6 }}>{r.text}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {/* Login overlay */}
        {showLogin ? (
          <div style={styles.loginOverlay}>
            <div style={styles.loginCard}>
              <h1 style={{ color: "#4f8cff", margin: "0 0 8px 0" }}>
                Добро пожаловать
              </h1>
              <p style={{ color: "#b0b0b0", marginTop: 0 }}>
                Выберите роль или продолжите как гость
              </p>
              <input
                placeholder="Ваше имя (опционально)"
                id="login-name"
                style={styles.input}
              />
              <select id="login-role" style={{ ...styles.input }}>
                <option value="guest">Гость</option>
                <option value="user">Пользователь</option>
                <option value="owner">Владелец бизнеса</option>
                <option value="moderator">Модератор</option>
                <option value="admin">Администратор</option>
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ ...styles.buttonPrimary, flex: 1 }}
                  onClick={() => {
                    const name = document
                      .getElementById("login-name")
                      .value.trim();
                    const role = document.getElementById("login-role").value;
                    handleLogin(name, role);
                  }}
                >
                  Войти
                </button>
                <button
                  style={{ ...styles.buttonGhost, flex: 1 }}
                  onClick={() => {
                    handleLogin("Гость", "guest");
                  }}
                >
                  Продолжить как гость
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <small style={styles.smallMuted}>
                  Фон карты ориентирован на Донецк (ДНР)
                </small>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
