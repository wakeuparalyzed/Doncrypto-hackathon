/* =========== Простая Data-layer (локальная имитация сервера) =========== */
/* Структуры хранятся в localStorage. Продакшн: заменить на API calls. */

const STORAGE_PREFIX = "mapsapp_v1_";

function save(key, value) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}
function load(key, fallback) {
  const raw = localStorage.getItem(STORAGE_PREFIX + key);
  return raw ? JSON.parse(raw) : fallback;
}

/* Demo locations (если в storage пусто — заполним) */
let LOCATIONS = load("locations", [
  {
    id: 1,
    name: "Кафе Капучино",
    category: "Кафе",
    lat: 55.7558,
    lng: 37.6176,
    address: "ул. Примерная 1",
    hours: "08:00-22:00",
    status: "open",
    desc: "Уютное местечко",
    photos: [],
    reviews: [{ id: 101, author: "Иван", rating: 5, text: "Отлично!" }],
  },
  {
    id: 2,
    name: "Парк Солнечный",
    category: "Парк",
    lat: 55.76,
    lng: 37.62,
    address: "ул. Парковая",
    hours: "Круглосуточно",
    status: "open",
    desc: "Зелёное место",
    photos: [],
    reviews: [],
  },
]);
save("locations", LOCATIONS);

/* Users and roles (simple) */
let USERS = load("users", [
  { id: "u_guest", name: "Гость", role: "guest", blocked: false },
  // можно добавить преднастроенных админов и тп
]);
save("users", USERS);

/* =========== UI elements =========== */
const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const enterBtn = document.getElementById("enter-btn");
const continueGuestBtn = document.getElementById("continue-guest-btn");
const usernameInput = document.getElementById("username-input");
const roleSelect = document.getElementById("role-select");

const userInfoEl = document.getElementById("user-info");
const logoutBtn = document.getElementById("logout-btn");

const searchInput = document.getElementById("search");
const categoryFilter = document.getElementById("category-filter");
const distRange = document.getElementById("distance");
const distLabel = document.getElementById("dist-label");

const favoritesList = document.getElementById("favorites-list");
const rolePanel = document.getElementById("role-panel");

const favToggleBtn = document.getElementById("fav-toggle-btn");
const routeBtn = document.getElementById("route-btn");
const editLocBtn = document.getElementById("edit-loc-btn");
const locationCard = document.getElementById("location-card");
const closeCard = document.getElementById("close-card");

const locName = document.getElementById("loc-name");
const locCategory = document.getElementById("loc-category");
const locDesc = document.getElementById("loc-desc");
const locAddress = document.getElementById("loc-address");
const locHours = document.getElementById("loc-hours");
const locStatus = document.getElementById("loc-status");

const reviewsList = document.getElementById("reviews-list");
const reviewAuthor = document.getElementById("review-author");
const reviewRating = document.getElementById("review-rating");
const reviewText = document.getElementById("review-text");
const saveReviewBtn = document.getElementById("save-review-btn");
const cancelReviewBtn = document.getElementById("cancel-review-btn");

const personalRoutesEl = document.getElementById("personal-routes");
const saveRouteArea = document.getElementById("save-route-area");
const routeNameInput = document.getElementById("route-name");
const saveRouteBtn = document.getElementById("save-route-btn");

/* =========== App state =========== */
let CURRENT_USER = null; // {id, name, role}
let map, markersLayer, clusterGroup, userMarker, routingControl;
let selectedLocation = null;
let favorites = load("favorites", {}); // {userId: [locId,...]}
let personalRoutes = load("personalRoutes", {}); // {userId: [{name, waypoints}, ...]}
let blockedUsers = load("blockedUsers", []); // list of user ids

/* =========== Role permissions config =========== */
const PERMS = {
  guest: {
    canView: true,
    canFav: false,
    canReview: false,
    canSaveRoutes: false,
    canEditLocation: false,
    canAddLocation: false,
    canModerate: false,
    canManageUsers: false,
  },
  user: {
    canView: true,
    canFav: true,
    canReview: true,
    canSaveRoutes: true,
    canEditLocation: false,
    canAddLocation: false,
    canModerate: false,
    canManageUsers: false,
  },
  owner: {
    canView: true,
    canFav: true,
    canReview: true,
    canSaveRoutes: true,
    canEditLocation: true,
    canAddLocation: false,
    canModerate: false,
    canManageUsers: false,
  },
  moderator: {
    canView: true,
    canFav: true,
    canReview: true,
    canSaveRoutes: true,
    canEditLocation: true,
    canAddLocation: true,
    canModerate: true,
    canManageUsers: false,
  },
  admin: {
    canView: true,
    canFav: true,
    canReview: true,
    canSaveRoutes: true,
    canEditLocation: true,
    canAddLocation: true,
    canModerate: true,
    canManageUsers: true,
  },
};

/* =========== Helpers =========== */
function uid(prefix = "id") {
  return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
}

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

/* =========== LOGIN / ROLE logic =========== */
enterBtn.onclick = () => {
  const name = usernameInput.value.trim() || roleSelect.value;
  const role = roleSelect.value;
  const id = uid("user");
  CURRENT_USER = { id, name, role, blocked: false };
  USERS.push(CURRENT_USER);
  save("users", USERS);
  initApp();
};

continueGuestBtn.onclick = () => {
  CURRENT_USER = { id: "guest", name: "Гость", role: "guest", blocked: false };
  initApp();
};

logoutBtn.onclick = () => {
  location.reload();
};

/* =========== INIT APP =========== */
function initApp() {
  // check blocked
  if (blockedUsers.includes(CURRENT_USER.id)) {
    alert("Вас заблокировали. Обратитесь к администратору.");
    return;
  }

  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");

  userInfoEl.innerHTML = `<div>${CURRENT_USER.name} — <span class="muted">${CURRENT_USER.role}</span></div>`;

  setupRolePanel();
  populateCategoryFilter();
  renderFavorites();
  renderPersonalRoutes();

  initMap();
  attachUIEvents();
}

/* =========== Role panel (simple controls per role) =========== */
function setupRolePanel() {
  const r = CURRENT_USER.role;
  const perms = PERMS[r];
  rolePanel.innerHTML = `<div><strong>Панель роли: ${r}</strong></div>`;
  if (perms.canAddLocation) {
    const btn = document.createElement("button");
    btn.textContent = "Добавить локацию";
    btn.onclick = () => promptAddLocation();
    rolePanel.appendChild(btn);
  }
  if (perms.canManageUsers) {
    const btn2 = document.createElement("button");
    btn2.textContent = "Управление пользователями";
    btn2.onclick = () => openUserManagement();
    rolePanel.appendChild(btn2);
  }
  if (perms.canModerate) {
    const btn3 = document.createElement("button");
    btn3.textContent = "Модерация отзывов";
    btn3.onclick = () => openReviewModeration();
    rolePanel.appendChild(btn3);
  }
}

/* =========== MAP initialization =========== */
function initMap() {
  // create map
  map = L.map("map", { preferCanvas: true }).setView([55.7558, 37.6176], 12);

  // try local tile layer first (offline)
  const localTile = L.tileLayer("./tiles/{z}/{x}/{y}.png", {
    maxZoom: 19,
    errorTileUrl: "", // if tile missing, leaflet will show blank or fallback below
  });

  localTile.addTo(map);

  // add fallback OSM on top but with lower zIndex — will show where local tiles missing if online
  const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19 }
  );
  osm.addTo(map);

  // clustering
  clusterGroup = L.markerClusterGroup();
  map.addLayer(clusterGroup);

  // markers rendering
  renderAllLocations();

  // try to get user location and center map
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude,
          lng = pos.coords.longitude;
        map.setView([lat, lng], 13);
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], {
          radius: 7,
          color: "#0ea5a4",
          fillColor: "#0ea5a4",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("Вы здесь")
          .openPopup();
      },
      (err) => {
        console.warn("Geolocation failed:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 7000 }
    );
  }

  // map click hides card
  map.on("click", () => hide(locationCard));
}

/* =========== Render locations (markers) =========== */
function renderAllLocations() {
  clusterGroup.clearLayers();
  LOCATIONS.forEach((loc) => {
    const marker = L.marker([loc.lat, loc.lng]);
    marker.on("click", () => openLocationCard(loc));
    marker.bindTooltip(loc.name);
    clusterGroup.addLayer(marker);
  });
}

/* =========== Open location card =========== */
function openLocationCard(loc) {
  selectedLocation = loc;
  locName.textContent = loc.name;
  locCategory.textContent = loc.category;
  locDesc.textContent = loc.desc;
  locAddress.textContent = loc.address;
  locHours.textContent = loc.hours;
  locStatus.textContent = loc.status === "open" ? "Открыто" : "Закрыто";

  // fav button text
  const favs = favorites[CURRENT_USER.id] || [];
  favToggleBtn.textContent = favs.includes(loc.id)
    ? "★ Убрать"
    : "☆ В избранное";

  // show/hide edit button by role
  const perms = PERMS[CURRENT_USER.role];
  if (
    perms.canEditLocation ||
    (CURRENT_USER.role === "owner" && ownsLocation(CURRENT_USER, loc))
  ) {
    show(editLocBtn);
  } else hide(editLocBtn);

  renderReviews(loc);
  renderPersonalRoutes();
  show(locationCard);
}

/* =========== Favorites =========== */
function toggleFavoriteForCurrent(locId) {
  const id = CURRENT_USER.id;
  if (!favorites[id]) favorites[id] = [];
  const idx = favorites[id].indexOf(locId);
  if (idx === -1) favorites[id].push(locId);
  else favorites[id].splice(idx, 1);
  save("favorites", favorites);
  renderFavorites();
  // update button text
  if (selectedLocation && selectedLocation.id === locId) {
    favToggleBtn.textContent = favorites[id].includes(locId)
      ? "★ Убрать"
      : "☆ В избранное";
  }
}
function renderFavorites() {
  const id = CURRENT_USER.id;
  const list = favorites[id] || [];
  favoritesList.innerHTML = "";
  list.forEach((locId) => {
    const loc = LOCATIONS.find((l) => l.id === locId);
    if (!loc) return;
    const li = document.createElement("li");
    li.textContent = loc.name;
    li.onclick = () => {
      map.setView([loc.lat, loc.lng], 15);
      openLocationCard(loc);
    };
    favoritesList.appendChild(li);
  });
}

/* =========== Reviews =========== */
function renderReviews(loc) {
  reviewsList.innerHTML = "";
  (loc.reviews || []).forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${r.author}</strong> — ${r.rating}★<div>${r.text}</div>`;
    // moderation buttons
    if (
      PERMS[CURRENT_USER.role].canModerate ||
      (CURRENT_USER.role === "owner" && ownsLocation(CURRENT_USER, loc))
    ) {
      const btnDelete = document.createElement("button");
      btnDelete.textContent = "Удалить";
      btnDelete.className = "secondary";
      btnDelete.onclick = () => {
        loc.reviews = loc.reviews.filter((rr) => rr.id !== r.id);
        save("locations", LOCATIONS);
        renderReviews(loc);
      };
      li.appendChild(btnDelete);
    }
    reviewsList.appendChild(li);
  });
}

/* Save review (add or edit) */
saveReviewBtn.onclick = () => {
  if (!PERMS[CURRENT_USER.role].canReview) {
    return alert("У вас нет прав добавлять отзывы (войдите как пользователь).");
  }
  const author = reviewAuthor.value.trim() || CURRENT_USER.name || "Аноним";
  const rating = Number(reviewRating.value);
  const text = reviewText.value.trim();
  if (!text) return alert("Введите текст отзыва");
  const review = { id: uid("review"), author, rating, text };
  selectedLocation.reviews = selectedLocation.reviews || [];
  selectedLocation.reviews.push(review);
  save("locations", LOCATIONS);
  renderReviews(selectedLocation);
  reviewAuthor.value = "";
  reviewText.value = "";
};

/* =========== Routes (personal) =========== */
routeBtn.onclick = () => {
  if (!selectedLocation) return;
  if (!navigator.geolocation) return alert("Геолокация не поддерживается");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const from = L.latLng(pos.coords.latitude, pos.coords.longitude);
      const to = L.latLng(selectedLocation.lat, selectedLocation.lng);
      // remove existing
      if (routingControl) map.removeControl(routingControl);
      routingControl = L.Routing.control({
        waypoints: [from, to],
        fitSelectedRoute: true,
      }).addTo(map);

      // show save route box for allowed roles
      if (PERMS[CURRENT_USER.role].canSaveRoutes) {
        show(saveRouteArea);
      }
    },
    (err) => alert("Не могу получить позицию: " + err.message)
  );
};

saveRouteBtn.onclick = () => {
  const name =
    routeNameInput.value.trim() || "Маршрут " + new Date().toLocaleString();
  if (!routingControl) return alert("Сначала постройте маршрут");
  const wp = routingControl
    .getWaypoints()
    .map((w) => ({ lat: w.latLng.lat, lng: w.latLng.lng }));
  if (!personalRoutes[CURRENT_USER.id]) personalRoutes[CURRENT_USER.id] = [];
  personalRoutes[CURRENT_USER.id].push({
    id: uid("route"),
    name,
    waypoints: wp,
  });
  save("personalRoutes", personalRoutes);
  renderPersonalRoutes();
  routeNameInput.value = "";
  hide(saveRouteArea);
};

function renderPersonalRoutes() {
  personalRoutesEl.innerHTML = "";
  const list = personalRoutes[CURRENT_USER.id] || [];
  list.forEach((r) => {
    const li = document.createElement("li");
    const btnLoad = document.createElement("button");
    btnLoad.textContent = "Загрузить";
    btnLoad.onclick = () => {
      if (routingControl) map.removeControl(routingControl);
      const wps = r.waypoints.map((p) => L.latLng(p.lat, p.lng));
      routingControl = L.Routing.control({
        waypoints: wps,
        fitSelectedRoute: true,
      }).addTo(map);
    };
    const btnDel = document.createElement("button");
    btnDel.textContent = "Удалить";
    btnDel.onclick = () => {
      personalRoutes[CURRENT_USER.id] = personalRoutes[CURRENT_USER.id].filter(
        (rr) => rr.id !== r.id
      );
      save("personalRoutes", personalRoutes);
      renderPersonalRoutes();
    };
    li.textContent = r.name;
    li.appendChild(btnLoad);
    li.appendChild(btnDel);
    personalRoutesEl.appendChild(li);
  });
}

/* =========== Ownership check (owner owns locations with ownerId property) =========== */
function ownsLocation(user, loc) {
  // demo: owner matches by name included in loc.ownerName (not secure — for demo only)
  if (!loc.ownerId) return false;
  return loc.ownerId === user.id;
}

/* =========== Edit location (owner/moderator) =========== */
editLocBtn.onclick = () => {
  if (!selectedLocation) return;
  const perms = PERMS[CURRENT_USER.role];
  if (
    !perms.canEditLocation &&
    !(
      CURRENT_USER.role === "owner" &&
      ownsLocation(CURRENT_USER, selectedLocation)
    )
  ) {
    return alert("Нет прав редактировать информацию.");
  }
  const newName =
    prompt("Название", selectedLocation.name) || selectedLocation.name;
  const newDesc =
    prompt("Описание", selectedLocation.desc) || selectedLocation.desc;
  const newHours =
    prompt("Часы работы", selectedLocation.hours) || selectedLocation.hours;
  const newStatus =
    prompt("Статус (open/closed)", selectedLocation.status) ||
    selectedLocation.status;

  selectedLocation.name = newName;
  selectedLocation.desc = newDesc;
  selectedLocation.hours = newHours;
  selectedLocation.status = newStatus;
  save("locations", LOCATIONS);
  renderAllLocations();
  openLocationCard(selectedLocation);
};

/* =========== Add location (moderator) =========== */
function promptAddLocation() {
  const name = prompt("Название новой локации");
  if (!name) return;
  const category = prompt("Категория", "Разное");
  const lat = Number(prompt("Широта (lat)", "55.75"));
  const lng = Number(prompt("Долгота (lng)", "37.61"));
  const address = prompt("Адрес", "");
  const desc = prompt("Описание", "");
  const hours = prompt("Часы", "09:00-18:00");
  const loc = {
    id: Date.now(),
    name,
    category,
    lat,
    lng,
    address,
    desc,
    hours,
    status: "open",
    photos: [],
    reviews: [],
  };
  LOCATIONS.push(loc);
  save("locations", LOCATIONS);
  renderAllLocations();
}

/* =========== Moderation UI (simple) =========== */
function openReviewModeration() {
  // show basic list of all reviews with delete option
  let msg = "Отзывы во всех локациях:\\n";
  LOCATIONS.forEach((l) => {
    (l.reviews || []).forEach((r) => {
      msg += `${l.name} — ${r.author}: ${r.text}\\n`;
    });
  });
  alert(msg || "Нет отзывов");
}

/* =========== User management (very simple local) =========== */
function openUserManagement() {
  const users = USERS.map(
    (u) => `${u.id} — ${u.name} — ${u.role}${u.blocked ? " (blocked)" : ""}`
  ).join("\\n");
  const cmd = prompt(
    "Пользователи:\\n" +
      users +
      "\\n\\nКоманда: block <userId> | setrole <userId> <role>"
  );
  if (!cmd) return;
  const parts = cmd.split(" ");
  if (parts[0] === "block") {
    const uid = parts[1];
    blockedUsers.push(uid);
    save("blockedUsers", blockedUsers);
    alert("Заблокировано: " + uid);
  } else if (parts[0] === "setrole") {
    const uid = parts[1],
      role = parts[2];
    const u = USERS.find((x) => x.id === uid);
    if (!u) return alert("Пользователь не найден");
    u.role = role;
    save("users", USERS);
    alert("Роль изменена");
  }
}

/* =========== Search & filters =========== */
searchInput.oninput = applyFilters;
categoryFilter.onchange = applyFilters;
distRange.oninput = () => {
  distLabel.textContent = distRange.value;
  applyFilters();
};

function populateCategoryFilter() {
  const cats = ["all", ...new Set(LOCATIONS.map((l) => l.category))];
  categoryFilter.innerHTML = "";
  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categoryFilter.appendChild(opt);
  });
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const maxD = Number(distRange.value);

  clusterGroup.clearLayers();

  LOCATIONS.forEach((loc) => {
    let show = true;
    if (q && !loc.name.toLowerCase().includes(q)) show = false;
    if (cat !== "all" && loc.category !== cat) show = false;
    if (maxD && userMarker) {
      const upos = userMarker.getLatLng();
      const d = map.distance([loc.lat, loc.lng], upos);
      if (d > maxD) show = false;
    }
    if (show) {
      const marker = L.marker([loc.lat, loc.lng]);
      marker.on("click", () => openLocationCard(loc));
      marker.bindTooltip(loc.name);
      clusterGroup.addLayer(marker);
    }
  });
}

/* =========== UI events attach =========== */
function attachUIEvents() {
  favToggleBtn.onclick = () => {
    if (!PERMS[CURRENT_USER.role].canFav)
      return alert("Только для авторизованных пользователей.");
    toggleFavoriteForCurrent(selectedLocation.id);
  };

  closeCard.onclick = () => hide(locationCard);

  // save review/cancel handled earlier
  cancelReviewBtn.onclick = () => {
    reviewAuthor.value = "";
    reviewText.value = "";
  };

  // search etc attached earlier
}

/* =========== Offline tile notes (explain to user) =========== */
console.log(`Офлайн-тайлы: если хотите полностью офлайн-карту,
скачайте тайлы (zoom диапазон) и поместите их в папку tiles/{z}/{x}/{y}.png.
Альтернативы: MBTiles + локальный tile-server (mbtileserver) или vector-tiles + tippecanoe.`);

/* =========== Initial demo load / defaults =========== */
renderAllLocations();
populateCategoryFilter();
renderFavorites();
