// Jalankan saat DOM siap
document.addEventListener("DOMContentLoaded", () => {
  confirmAppReady();
  console.log("App loaded successfully.");
});

async function confirmAppReady() {
  try {
    // Memastikan objek Capacitor dan pluginnya sudah tersedia secara global
    if (
      window.Capacitor &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.CapacitorUpdater
    ) {
      await window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady();
      console.log(
        "[CapgoUpdater] notifyAppReady sukses dipanggil secara global!",
      );
    } else {
      console.warn(
        "[CapgoUpdater] Plugin belum siap atau berjalan di browser biasa.",
      );
    }
  } catch (error) {
    console.error("[CapgoUpdater] Gagal memanggil notifyAppReady:", error);
  }
}

// ==============================================
// function TOAST SWEETALERT
// ==============================================
const TOAST = {
  init: function (icon, title) {
    return Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    }).fire({
      icon: icon ?? "success",
      title: title ?? "Success",
    });
  },
  success: (title) => {
    return TOAST.init("success", title);
  },
  error: (title) => {
    return TOAST.init("error", title);
  },
  warning: (title) => {
    return TOAST.init("warning", title);
  },
  info: (title) => {
    return TOAST.init("info", title);
  },
};

// ==========================================
// FITUR PULL TO REFRESH
// ==========================================
let touchStartY = 0;
let isPulling = false;
const ptrIndicator = document.getElementById("ptrIndicator");
const ptrText = document.getElementById("ptrText");

window.addEventListener(
  "touchstart",
  (e) => {
    if (window.scrollY === 0) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  },
  { passive: true },
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (!isPulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;

    if (diff > 0 && window.scrollY === 0) {
      const pullDistance = Math.min(diff * 0.4, 70);
      ptrIndicator.style.height = `${pullDistance}px`;
      if (pullDistance > 45) {
        ptrText.innerText = "release Lepaskan untuk memperbarui...";
      } else {
        ptrText.innerText = "🔄 Tarik ke bawah untuk memperbarui...";
      }
    } else {
      isPulling = false;
      ptrIndicator.style.height = "0px";
    }
  },
  { passive: true },
);

window.addEventListener("touchend", () => {
  if (!isPulling) return;
  isPulling = false;
  const currentHeight = parseInt(ptrIndicator.style.height || "0");
  if (currentHeight > 45) {
    ptrText.innerText = "Memuat ulang...";
    ptrIndicator.style.height = "40px";
    setTimeout(() => {
      window.location.reload();
    }, 400);
  } else {
    ptrIndicator.style.height = "0px";
  }
});

// ==========================================
// OVERRIDE CONSOLE UNTUK DEBUGGING DI APK
// ==========================================
(function () {
  const logBody = document.getElementById("debugLogBody");
  function appendLog(type, args) {
    if (!logBody) return;
    const div = document.createElement("div");
    div.className = `log-item log-${type}`;
    const time = new Date().toLocaleTimeString();
    let msg = args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
      .join(" ");
    div.innerText = `[${time}] ${msg}`;
    logBody.appendChild(div);
    logBody.scrollTop = logBody.scrollHeight;
  }

  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;

  console.log = function (...args) {
    origLog.apply(console, args);
    appendLog("info", args);
  };
  console.error = function (...args) {
    origErr.apply(console, args);
    appendLog("error", args);
  };
  console.warn = function (...args) {
    origWarn.apply(console, args);
    appendLog("info", args);
  };

  window.onerror = function (msg, url, line) {
    appendLog("error", [`Uncaught: ${msg} (${line})`]);
  };
})();

function toggleDebugConsole() {
  const consoleEl = document.getElementById("debugConsole");
  consoleEl.style.display =
    consoleEl.style.display === "flex" ? "none" : "flex";
}

function clearDebugLogs() {
  document.getElementById("debugLogBody").innerHTML = "";
}

let ws = null;
let isConnected = false;
let isEditMode = false;
let holdInterval = null;

// Trackpad & Screen Stream state
let isStreaming = false;
let lastFrameTime = 0;
let fpsDisplay = 0;
let mouseSensitivity = 1.5;
let dragLastX = null;
let dragLastY = null;
let dragMoved = 0;

// Blob URL frame stream saat ini - dilacak biar bisa di-revoke (cegah memory leak saat streaming lama)
let lastFrameBlobUrl = null;

// Zoom & Pan Screen Stream
let streamZoom = 1;
let streamPanX = 0;
let streamPanY = 0;
const STREAM_ZOOM_MIN = 1;
const STREAM_ZOOM_MAX = 4;
let pinchStartDist = null;
let pinchStartZoom = 1;
let panStartX = null;
let panStartY = null;
let panOriginX = 0;
let panOriginY = 0;
let lastTapTime = 0;
let sortableMacroPad = null;

// Scanner Instance
let html5QrcodeScanner = null;

const DEFAULT_BUTTONS = [];

let macroButtons = [];

window.onload = () => {
  console.log("App loaded successfully.");
  if (localStorage.getItem("rem_ip"))
    document.getElementById("ipInput").value = localStorage.getItem("rem_ip");
  if (localStorage.getItem("rem_port"))
    document.getElementById("portInput").value =
      localStorage.getItem("rem_port");
  if (localStorage.getItem("rem_pin")) {
    localStorage.removeItem("rem_pin");
  }

  loadMacroButtons();
  renderButtons();

  const savedSens = localStorage.getItem("rem_sensitivity");
  if (savedSens) {
    mouseSensitivity = parseFloat(savedSens);
    document.getElementById("sensSlider").value = mouseSensitivity;
    document.getElementById("sensValue").innerText = `${mouseSensitivity}x`;
  }

  setupTrackpad();
  setupTypeInput();
  setupStreamZoom();
};

// ==========================================
// FITUR SCANNER QR CODE
// ==========================================
function openQrScanner() {
  if (isConnected) {
    TOAST.info("Putuskan koneksi terlebih dahulu sebelum scan QR!");
    return;
  }

  document.getElementById("qrModal").style.display = "flex";

  html5QrcodeScanner = new Html5Qrcode("qrReader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrcodeScanner
    .start({ facingMode: "environment" }, config, onScanSuccess)
    .catch((err) => {
      console.error("Camera error:", err);
      TOAST.error("Gagal mengakses kamera. Pastikan izin kamera aktif!");
      closeQrScanner();
    });
}

function closeQrScanner() {
  document.getElementById("qrModal").style.display = "none";
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().catch((err) => console.error(err));
  }
}

function onScanSuccess(decodedText) {
  console.log("QR Scanned:", decodedText);
  closeQrScanner();

  try {
    let data = JSON.parse(decodedText);
    console.log(data.resolume_shortcuts);

    if (data.ip) document.getElementById("ipInput").value = data.ip;
    if (data.port) document.getElementById("portInput").value = data.port;
    if (data.pin) document.getElementById("pinInput").value = data.pin;
    if (data.resolume_shortcuts) {
      const resolumeShortcut = data.resolume_shortcuts;
      resolumeShortcut.forEach((item) => {
        macroButtons.push(generateShortcutQr(item));
      });
      console.log(macroButtons);

      window.localStorage.setItem(
        "rem_macro_pad",
        JSON.stringify(macroButtons),
      );

      renderButtons();
    }

    toggleConnection();
  } catch (e) {
    let parts = decodedText.split(":");
    if (parts.length >= 2) {
      document.getElementById("ipInput").value = parts[0];
      document.getElementById("portInput").value = parts[1];
      if (parts[2]) document.getElementById("pinInput").value = parts[2];

      toggleConnection();
    } else {
      TOAST.error("Format QR Code tidak dikenali!");
    }
  }
}

// ==========================================
// LOGIKA KONEKSI WEBSOCKET
// ==========================================
function toggleConnection() {
  if (isConnected) {
    ws.close();
    return;
  }

  const ip = document.getElementById("ipInput").value.trim();
  const port = document.getElementById("portInput").value.trim();
  const pin = document.getElementById("pinInput").value.trim();

  if (!ip) {
    TOAST.info("Masukkan IP LAN atau Domain Cloudflare dulu!");
    return;
  }

  localStorage.setItem("rem_ip", ip);
  localStorage.setItem("rem_port", port);
  localStorage.setItem("rem_pin", pin);

  const badge = document.getElementById("statusBadge");
  const btn = document.getElementById("connectBtn");
  const scanBtn = document.getElementById("scanBtn");

  badge.innerText = "● Connecting...";
  badge.className = "status-badge";
  badge.style.color = "#f59e0b";

  let wsUrl = ip.match(/[a-zA-Z]/)
    ? `wss://${ip.replace(/^(https?|wss?):\/\//, "")}`
    : `ws://${ip}:${port}`;

  console.log("Connecting to WebSocket:", wsUrl);

  try {
    ws = new WebSocket(wsUrl);
    // WAJIB: frame stream sekarang dikirim server sebagai binary (bukan base64 lagi).
    // Tanpa ini, event.data bakal jadi Blob dan parsing DataView-nya gagal.
    ws.binaryType = "arraybuffer";
  } catch (err) {
    console.error("WebSocket constructor error:", err);
    TOAST.error("Gagal membuat koneksi WebSocket: " + err.message);
    resetUI();
    return;
  }

  ws.onopen = () => {
    console.log("WebSocket connected successfully!");
    isConnected = true;
    badge.innerText = "Connected";
    badge.className = "status-badge connected";
    badge.style.color = "";

    btn.innerText = "Putuskan Koneksi";
    btn.className = "btn btn-danger";
    scanBtn.style.display = "none";

    document.getElementById("connectionCard").style.display = "none";
    document.getElementById("tabBar").style.display = "flex";
    switchTab("macro");
  };

  ws.onmessage = (event) => {
    // Frame screen stream datang sebagai binary ArrayBuffer.
    // Command/status lain (stream_error dll) tetap JSON teks seperti biasa.
    if (event.data instanceof ArrayBuffer) {
      handleBinaryFrame(event.data);
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.warn("Pesan tidak valid dari server:", event.data);
      return;
    }
    handleServerMessage(data);
  };

  ws.onclose = (event) => {
    console.warn(
      "WebSocket closed. Code:",
      event.code,
      "Reason:",
      event.reason,
    );
    resetUI();
  };

  ws.onerror = (e) => {
    console.error("WebSocket error event triggered:", e);
    TOAST.warning(
      "Gagal terhubung ke PC! Pastikan IP/Domain benar dan program desktop sudah berjalan.",
    );
    resetUI();
  };
}

// ==========================================
// FRAME BINARY DARI SERVER (SCREEN STREAM)
// Format: [1 byte type=1][2 byte width u16 BE][2 byte height u16 BE][JPEG bytes...]
// ==========================================
function handleBinaryFrame(buffer) {
  if (!buffer || buffer.byteLength < 5) return;

  const view = new DataView(buffer);
  const msgType = view.getUint8(0);
  if (msgType !== 1) return; // tipe lain diabaikan buat sekarang

  const jpegBytes = new Uint8Array(buffer, 5);
  const blob = new Blob([jpegBytes], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);

  const img = document.getElementById("screenImage");
  const placeholder = document.getElementById("screenPlaceholder");
  if (!img) {
    URL.revokeObjectURL(url);
    return;
  }

  // Revoke blob URL frame SEBELUMNYA setelah frame baru selesai di-render.
  // Ini krusial buat streaming realtime - kalau nggak di-revoke, tiap frame
  // (30-60x/detik) bikin blob nyangkut di memori dan lama-lama app jadi berat/nge-lag.
  const prevUrl = lastFrameBlobUrl;
  img.onload = () => {
    if (prevUrl) URL.revokeObjectURL(prevUrl);
  };
  img.onerror = () => {
    if (prevUrl) URL.revokeObjectURL(prevUrl);
  };

  img.src = url;
  lastFrameBlobUrl = url;

  img.classList.add("has-frame");
  if (placeholder) placeholder.style.display = "none";

  if (isStreaming) {
    const now = performance.now();
    if (lastFrameTime) {
      const instFps = 1000 / Math.max(now - lastFrameTime, 1);
      fpsDisplay = fpsDisplay ? fpsDisplay * 0.8 + instFps * 0.2 : instFps;
    }
    lastFrameTime = now;
    const statusEl = document.getElementById("streamStatus");
    if (statusEl) {
      statusEl.innerText = `● Live ~${Math.round(fpsDisplay)} fps`;
      statusEl.className = "stream-status-pill live";
    }
  }
}

// ==========================================
// PESAN JSON MASUK DARI SERVER (STATUS, ERROR, DLL)
// ==========================================
function handleServerMessage(data) {
  if (data.type === "stream_error") {
    TOAST.error(data.message || "Screen streaming gagal diaktifkan.");
    stopStreamingAuto();
  }
}

function clearFrameBlobUrl() {
  if (lastFrameBlobUrl) {
    URL.revokeObjectURL(lastFrameBlobUrl);
    lastFrameBlobUrl = null;
  }
}

function resetUI() {
  isConnected = false;
  stopHold();
  const badge = document.getElementById("statusBadge");
  const btn = document.getElementById("connectBtn");
  const scanBtn = document.getElementById("scanBtn");

  badge.innerText = "Disconnected";
  badge.className = "status-badge disconnected";
  badge.style.color = "";

  btn.innerText = "Hubungkan PC";
  btn.className = "btn";
  scanBtn.style.display = "flex";

  document.getElementById("connectionCard").style.display = "block";
  document.getElementById("tabBar").style.display = "none";

  isEditMode = false;
  document.getElementById("macroGrid").classList.remove("edit-mode");
  document.getElementById("editModeBtn").innerText = "Edit";
  document.getElementById("editModeBtn").className = "btn btn-secondary";

  const drawer = document.getElementById("controlDrawer");
  if (drawer) drawer.classList.remove("open");

  stopStreamingAuto();
  exitFullscreenSafe();
  unlockOrientation();

  const img = document.getElementById("screenImage");
  const placeholder = document.getElementById("screenPlaceholder");
  if (img) {
    img.classList.remove("has-frame");
    img.src = "";
  }
  if (placeholder) placeholder.style.display = "flex";

  clearFrameBlobUrl();
}

// ==========================================
// FITUR TAB BAR
// ==========================================
function switchTab(tab) {
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.style.display = panel.id === `panel-${tab}` ? "block" : "none";
  });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (tab === "stream") {
    enterStreamView();
  } else {
    exitStreamView();
  }
}

// ==========================================
// FULLSCREEN + LANDSCAPE (TAB STREAM)
// ==========================================
function enterStreamView() {
  const stagePanel = document.getElementById("panel-stream");
  requestFullscreenSafe(stagePanel);
  lockLandscape();
  if (isConnected && !isStreaming) {
    startStreamingAuto();
  }
}

function exitStreamView() {
  const drawer = document.getElementById("controlDrawer");
  const stage = document.getElementById("streamStage");
  const fab = document.getElementById("fabToggle");
  if (drawer) drawer.classList.remove("open");
  if (stage) stage.classList.remove("drawer-open");
  if (fab) fab.classList.remove("faded");

  resetStreamZoom();

  if (isStreaming) {
    stopStreamingAuto();
  }
  exitFullscreenSafe();
  unlockOrientation();
}

function requestFullscreenSafe(el) {
  if (!el) return;
  try {
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.msRequestFullscreen;
    if (req) {
      req.call(el).catch((err) => console.warn("Fullscreen gagal:", err));
    }
  } catch (err) {
    console.warn("Fullscreen tidak didukung di perangkat ini:", err);
  }
}

function exitFullscreenSafe() {
  try {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document).catch(() => {});
    }
  } catch (err) {
    console.warn("Gagal keluar dari fullscreen:", err);
  }
}

function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation
        .lock("landscape")
        .catch((err) =>
          console.warn("Lock landscape gagal:", err.message || err),
        );
    } else if (
      window.Capacitor &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.ScreenOrientation
    ) {
      window.Capacitor.Plugins.ScreenOrientation.lock({
        orientation: "landscape",
      }).catch((err) => console.warn("Lock landscape (Capacitor) gagal:", err));
    }
  } catch (err) {
    console.warn("Orientasi landscape tidak didukung:", err);
  }
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    } else if (
      window.Capacitor &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.ScreenOrientation
    ) {
      window.Capacitor.Plugins.ScreenOrientation.unlock().catch(() => {});
    }
  } catch (err) {
    console.warn("Gagal unlock orientasi:", err);
  }
}

// Kalau user keluar fullscreen lewat tombol back sistem/gesture,
// sinkronkan UI kembali ke tab Macro
function handleFullscreenChange() {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  const streamPanel = document.getElementById("panel-stream");
  if (!fsEl && streamPanel && streamPanel.style.display !== "none") {
    switchTab("macro");
  }
}
document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

// ==========================================
// FLOATING CONTROL DRAWER (MOUSE & KEYBOARD)
// ==========================================
function toggleControlDrawer() {
  const drawer = document.getElementById("controlDrawer");
  const stage = document.getElementById("streamStage");
  const fab = document.getElementById("fabToggle");
  if (!drawer) return;

  const willOpen = !drawer.classList.contains("open");
  drawer.classList.toggle("open", willOpen);
  if (stage) stage.classList.toggle("drawer-open", willOpen);
  if (fab) fab.classList.toggle("faded", willOpen);

  // Area video berubah ukuran (transisi 0.25s) -> re-clamp pan biar gambar gak nyangkut di luar frame
  if (streamZoom > 1) {
    setTimeout(() => {
      clampStreamPan();
      applyStreamTransform();
    }, 260);
  }
}

function switchControlTab(ctrl) {
  const mousePanel = document.getElementById("ctrl-mouse");
  const keyboardPanel = document.getElementById("ctrl-keyboard");
  if (mousePanel)
    mousePanel.style.display = ctrl === "mouse" ? "block" : "none";
  if (keyboardPanel)
    keyboardPanel.style.display = ctrl === "keyboard" ? "block" : "none";

  document.querySelectorAll(".drawer-tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.ctrl === ctrl);
  });
}

// ==========================================
// LOGIKA HOLD-TO-REPEAT
// ==========================================
function startHold(index, event) {
  // Jika sedang mode Edit, jangan lakukan apa-apa.
  // Biarkan event default berjalan agar Sortable bisa membaca geseran drag & drop.
  // Eksekusi modal edit akan ditangani oleh el.onclick di renderButtons.
  if (isEditMode) return;

  // Hentikan fungsi default browser (seperti scroll / long-press select) khusus saat normal mode
  if (event && event.cancelable) event.preventDefault();

  executeMacro(index);

  if (holdInterval) clearInterval(holdInterval);
  holdInterval = setInterval(() => {
    executeMacro(index);
  }, 120);
}

function stopHold() {
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
}

function executeMacro(index) {
  if (!isConnected || !ws) return;

  const btn = macroButtons[index];
  const pinVal = document.getElementById("pinInput").value.trim() || "";
  let payload = { pin: pinVal };

  if (btn.type === "shortcut") {
    payload.type = "shortcut";
    payload.keys = btn.key
      .toLowerCase()
      .split("+")
      .map((k) => k.trim());
  } else {
    payload.type = "press";
    payload.key = btn.key.toLowerCase().trim();
  }

  try {
    ws.send(JSON.stringify(payload));
    if (navigator.vibrate) navigator.vibrate(20);
  } catch (err) {
    console.error("Failed to send WebSocket message:", err);
  }
}

// ==========================================
// RENDER & MANAGEMENT TOMBOL (TAMBAH & EDIT)
// ==========================================
function loadMacroButtons() {
  const saved = localStorage.getItem("rem_macro_pad");
  if (saved) {
    try {
      macroButtons = JSON.parse(saved);
    } catch (err) {
      console.error("Error parsing macro buttons:", err);
      macroButtons = [...DEFAULT_BUTTONS];
    }
  } else {
    macroButtons = [...DEFAULT_BUTTONS];
  }
}

function generateShortcutQr(key) {
  return {
    color: `theme-${mappingGenerateColorMacroPad()}`,
    key: String(key).toLocaleLowerCase(),
    label: String(key).toLocaleUpperCase(),
    type: "press",
  };
}

function mappingGenerateColorMacroPad() {
  const colors = ["blue", "green", "red", "purple", "yellow", "dark"];
  const randomIndex = Math.floor(Math.random() * colors.length);

  return colors[randomIndex]; // Langsung balikin 1 string warna
}

function saveMacroButtons() {
  localStorage.setItem("rem_macro_pad", JSON.stringify(macroButtons));
}

function renderButtons() {
  const grid = document.getElementById("macroGrid");
  grid.innerHTML = "";

  macroButtons.forEach((btn, idx) => {
    const el = document.createElement("div");
    el.className = `macro-btn ${btn.color}`;

    // Event listener untuk menahan (hold)
    el.onmousedown = (e) => startHold(idx, e);
    el.onmouseup = stopHold;
    el.onmouseleave = stopHold;
    el.ontouchstart = (e) => startHold(idx, e);
    el.ontouchend = stopHold;
    el.ontouchcancel = stopHold;

    // BUKA MODAL EDIT VIA KLIK (agar tidak bentrok dengan event drag)
    el.onclick = () => {
      if (isEditMode) {
        openEditModal(idx);
      }
    };

    el.innerHTML = `
                    <span class="edit-badge">Edit</span>
                    <div class="macro-label">${btn.label}</div>
                    <div class="macro-sub">${btn.key.toUpperCase()}</div>
                `;
    grid.appendChild(el);
  });
}

function toggleEditMode() {
  isEditMode = !isEditMode;
  const grid = document.getElementById("macroGrid");
  const editBtn = document.getElementById("editModeBtn");

  if (isEditMode) {
    grid.classList.add("edit-mode");
    editBtn.innerText = "Selesai";
    editBtn.className = "btn btn-success";

    // INIT SORTABLEJS UNTUK DRAG & DROP
    if (typeof Sortable !== "undefined") {
      sortableMacroPad = new Sortable(grid, {
        animation: 150,
        delay: 100, // Beri delay sedikit agar layar HP tetap bisa di-scroll
        delayOnTouchOnly: true,
        ghostClass: "sortable-ghost",
        dragClass: "sortable-drag",
        onEnd: function (evt) {
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;
          if (oldIndex !== newIndex) {
            // Pindahkan posisi item di dalam array
            const movedItem = macroButtons.splice(oldIndex, 1)[0];
            macroButtons.splice(newIndex, 0, movedItem);
            saveMacroButtons();
            // Wajib render ulang agar ID/index DOM selaras dengan Array
            renderButtons();
          }
        },
      });
    }
  } else {
    grid.classList.remove("edit-mode");
    editBtn.innerText = "Edit";
    editBtn.className = "btn btn-secondary";

    // MATIKAN SORTABLEJS KETIKA KELUAR MODE EDIT
    if (sortableMacroPad) {
      sortableMacroPad.destroy();
      sortableMacroPad = null;
    }
  }
}

function openAddModal() {
  document.getElementById("modalTitle").innerText = "Buat Tombol Macro Baru";
  document.getElementById("editIndex").value = "-1";
  document.getElementById("mLabel").value = "";
  document.getElementById("mType").value = "press";
  document.getElementById("mKey").value = "";
  document.getElementById("mColor").value = "theme-blue";

  document.getElementById("modalActionButtons").innerHTML = `
                <button class="btn btn-secondary" onclick="closeMacroModal()">Batal</button>
                <button class="btn btn-success" onclick="saveMacroButton()">Simpan</button>
            `;
  document.getElementById("macroModal").style.display = "flex";
}

function openEditModal(index) {
  const btn = macroButtons[index];
  document.getElementById("modalTitle").innerText = "Edit Tombol Macro";
  document.getElementById("editIndex").value = index;
  document.getElementById("mLabel").value = btn.label;
  document.getElementById("mType").value = btn.type;
  document.getElementById("mKey").value = btn.key;
  document.getElementById("mColor").value = btn.color;

  document.getElementById("modalActionButtons").innerHTML = `
                <button class="btn btn-danger" onclick="deleteMacroButton(${index})">Hapus</button>
                <button class="btn btn-secondary" onclick="closeMacroModal()">Batal</button>
                <button class="btn btn-success" onclick="saveMacroButton()">Perbarui</button>
            `;
  document.getElementById("macroModal").style.display = "flex";
}

function closeMacroModal() {
  document.getElementById("macroModal").style.display = "none";
}

function saveMacroButton() {
  const index = parseInt(document.getElementById("editIndex").value);
  const label = document.getElementById("mLabel").value.trim();
  const type = document.getElementById("mType").value;
  const key = document.getElementById("mKey").value.trim();
  const color = document.getElementById("mColor").value;

  if (!label || !key) {
    TOAST.info("Nama label dan tombol keyboard wajib diisi!");
    return;
  }

  if (index === -1) {
    macroButtons.push({ label, type, key, color });
  } else {
    macroButtons[index] = { label, type, key, color };
  }

  saveMacroButtons();
  renderButtons();
  closeMacroModal();
}

function deleteMacroButton(index) {
  Swal.fire({
    icon: "warning",
    title: `Hapus tombol "${macroButtons[index].label}"?`,
    text: "Tindakan ini tidak dapat dibatalkan.",
    showCancelButton: true,
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
    buttonsStyling: false, // Wajib false agar menggunakan custom class CSS kita
    customClass: {
      confirmButton: "swal2-confirm swal2-deny", // Pakai style tombol merah
      cancelButton: "swal2-cancel",
    },
  }).then((result) => {
    if (result.isConfirmed) {
      macroButtons.splice(index, 1);
      saveMacroButtons();
      renderButtons();
      closeMacroModal();
    }
  });
}

// ==========================================
// HELPER: KIRIM PAYLOAD KE SERVER
// ==========================================
function sendToServer(payload) {
  if (!isConnected || !ws) return;
  const pinVal = document.getElementById("pinInput").value.trim() || "";
  payload.pin = pinVal;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("Gagal mengirim data ke server:", err);
  }
}

// ==========================================
// FITUR TRACKPAD MOUSE
// ==========================================
function setupTrackpad() {
  const pad = document.getElementById("trackpadArea");
  if (!pad) return;

  // Touch (Android/mobile)
  pad.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      dragLastX = t.clientX;
      dragLastY = t.clientY;
      dragMoved = 0;
    },
    { passive: true },
  );

  pad.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      handleTrackpadMove(t.clientX, t.clientY);
    },
    { passive: true },
  );

  pad.addEventListener("touchend", () => {
    handleTrackpadRelease();
  });

  // Mouse (buat testing di browser desktop)
  let mouseDown = false;
  pad.addEventListener("mousedown", (e) => {
    mouseDown = true;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    dragMoved = 0;
  });
  pad.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    handleTrackpadMove(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", () => {
    if (!mouseDown) return;
    mouseDown = false;
    handleTrackpadRelease();
  });

  // Scroll dengan mouse wheel (testing di browser)
  pad.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      sendMouseScroll(e.deltaY > 0 ? -1 : 1);
    },
    { passive: false },
  );
}

function handleTrackpadMove(clientX, clientY) {
  if (dragLastX === null) {
    dragLastX = clientX;
    dragLastY = clientY;
    return;
  }
  const dx = clientX - dragLastX;
  const dy = clientY - dragLastY;
  dragLastX = clientX;
  dragLastY = clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);

  if (dx || dy) {
    sendToServer({
      type: "mouse_move",
      dx: dx * mouseSensitivity,
      dy: dy * mouseSensitivity,
    });
  }
}

function handleTrackpadRelease() {
  if (dragMoved < 4) {
    sendMouseClick("left");
  }
  dragLastX = null;
  dragLastY = null;
  dragMoved = 0;
}

function sendMouseClick(button, double) {
  sendToServer({ type: "mouse_click", button: button, double: !!double });
  if (navigator.vibrate) navigator.vibrate(15);
}

function sendMouseScroll(direction) {
  sendToServer({ type: "mouse_scroll", dx: 0, dy: direction });
}

function onSensitivityChange(value) {
  mouseSensitivity = parseFloat(value);
  document.getElementById("sensValue").innerText = `${mouseSensitivity}x`;
  localStorage.setItem("rem_sensitivity", mouseSensitivity);
}

// ==========================================
// FITUR SCREEN STREAMING (AUTO SAAT MASUK TAB STREAM)
// ==========================================
function startStreamingAuto() {
  if (!isConnected) return;
  isStreaming = true;
  lastFrameTime = 0;
  fpsDisplay = 0;
  sendToServer({ type: "stream_start" });

  const statusEl = document.getElementById("streamStatus");
  if (statusEl) {
    statusEl.innerText = "Menyambung...";
    statusEl.className = "stream-status-pill connecting";
  }
}

function stopStreamingAuto() {
  if (isStreaming) {
    sendToServer({ type: "stream_stop" });
  }
  isStreaming = false;
  resetStreamZoom();

  const statusEl = document.getElementById("streamStatus");
  if (statusEl) {
    statusEl.innerText = "Nonaktif";
    statusEl.className = "stream-status-pill";
  }

  const img = document.getElementById("screenImage");
  const placeholder = document.getElementById("screenPlaceholder");
  if (img) img.classList.remove("has-frame");
  if (placeholder) placeholder.style.display = "flex";

  clearFrameBlobUrl();
}

// ==========================================
// FITUR KEYBOARD DI DALAM CONTROL DRAWER
// ==========================================
const STREAM_KEY_MAP = {
  Enter: "enter",
  Backspace: "backspace",
  Escape: "esc",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Control: "ctrl",
  Alt: "alt",
  Shift: "shift",
  Meta: "win",
  " ": "space",
};

function setupTypeInput() {
  const input = document.getElementById("typeInput");
  if (!input) return;

  input.addEventListener("keydown", (e) => {
    let key = STREAM_KEY_MAP[e.key];
    if (!key && /^F([1-9]|1[0-2])$/.test(e.key)) key = e.key.toLowerCase();
    if (!key && e.key.length === 1) key = e.key;

    if (key) sendKeyPress(key);
    e.preventDefault();
  });
}

function sendKeyPress(key) {
  sendToServer({ type: "press", key: key });
  if (navigator.vibrate) navigator.vibrate(10);
}

function sendDrawerShortcut() {
  const raw = document.getElementById("drawerShortcutInput").value.trim();
  if (!raw) return;
  const keys = raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keys.length) {
    sendToServer({ type: "shortcut", keys });
  }
}

// ==========================================
// FITUR ZOOM & PAN SCREEN STREAM
// Pinch 2 jari, double-tap, atau tombol +/-/reset
// ==========================================
function setupStreamZoom() {
  const stage = document.getElementById("streamStage");
  if (!stage) return;

  stage.addEventListener("touchstart", onStreamTouchStart, { passive: false });
  stage.addEventListener("touchmove", onStreamTouchMove, { passive: false });
  stage.addEventListener("touchend", onStreamTouchEnd, { passive: false });
  stage.addEventListener("touchcancel", onStreamTouchEnd, { passive: false });

  // Testing di browser desktop: Ctrl+Scroll buat zoom, double click buat quick zoom
  stage.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomStreamBy(e.deltaY < 0 ? 0.25 : -0.25);
    },
    { passive: false },
  );
  // stage.addEventListener("dblclick", () => toggleQuickZoom());
}

function streamTouchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onStreamTouchStart(e) {
  // Jangan ganggu tap tombol FAB/exit/zoom toolbar yang menumpuk di atas stage
  if (
    e.target.closest(
      ".fab-btn, .exit-stream-btn, .zoom-toolbar, .control-drawer",
    )
  ) {
    return;
  }

  if (e.touches.length === 2) {
    e.preventDefault();
    pinchStartDist = streamTouchDistance(e.touches[0], e.touches[1]);
    pinchStartZoom = streamZoom;
    panStartX = null;
  } else if (e.touches.length === 1) {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      lastTapTime = 0;
      toggleQuickZoom();
      return;
    }
    lastTapTime = now;

    if (streamZoom > 1) {
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panOriginX = streamPanX;
      panOriginY = streamPanY;
    }
  }
}

function onStreamTouchMove(e) {
  if (e.touches.length === 2 && pinchStartDist) {
    e.preventDefault();
    const newDist = streamTouchDistance(e.touches[0], e.touches[1]);
    setStreamZoom((newDist / pinchStartDist) * pinchStartZoom);
  } else if (e.touches.length === 1 && panStartX !== null) {
    e.preventDefault();
    const dx = e.touches[0].clientX - panStartX;
    const dy = e.touches[0].clientY - panStartY;
    streamPanX = panOriginX + dx;
    streamPanY = panOriginY + dy;
    clampStreamPan();
    applyStreamTransform();
  }
}

function onStreamTouchEnd(e) {
  if (e.touches.length < 2) pinchStartDist = null;
  if (e.touches.length === 0) {
    panStartX = null;
    panStartY = null;
  }
}

function toggleQuickZoom() {
  setStreamZoom(streamZoom > 1 ? 1 : 2.5);
}

function zoomStreamBy(delta) {
  setStreamZoom(streamZoom + delta);
}

function setStreamZoom(zoom) {
  streamZoom = Math.min(STREAM_ZOOM_MAX, Math.max(STREAM_ZOOM_MIN, zoom));
  if (streamZoom === 1) {
    streamPanX = 0;
    streamPanY = 0;
  } else {
    clampStreamPan();
  }
  applyStreamTransform();
  updateZoomLabel();
}

function resetStreamZoom() {
  streamZoom = 1;
  streamPanX = 0;
  streamPanY = 0;
  applyStreamTransform();
  updateZoomLabel();
}

function clampStreamPan() {
  const img = document.getElementById("screenImage");
  const stage = document.getElementById("streamStage");
  if (!img || !stage) return;

  const baseW = img.offsetWidth;
  const baseH = img.offsetHeight;
  if (!baseW || !baseH) return;

  const scaledW = baseW * streamZoom;
  const scaledH = baseH * streamZoom;

  const maxPanX = Math.max(0, (scaledW - stage.clientWidth) / 2);
  const maxPanY = Math.max(0, (scaledH - stage.clientHeight) / 2);

  streamPanX = Math.min(maxPanX, Math.max(-maxPanX, streamPanX));
  streamPanY = Math.min(maxPanY, Math.max(-maxPanY, streamPanY));
}

function applyStreamTransform() {
  const img = document.getElementById("screenImage");
  if (!img) return;
  img.style.transform = `translate(${streamPanX}px, ${streamPanY}px) scale(${streamZoom})`;
}

function updateZoomLabel() {
  const label = document.getElementById("zoomLabel");
  if (label) label.innerText = `${Math.round(streamZoom * 100)}%`;
}
