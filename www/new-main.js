// Jalankan saat DOM siap
document.addEventListener("DOMContentLoaded", () => {
  confirmAppReady();
  console.log("App loaded successfully.");
});

async function confirmAppReady() {
  try {
    if (
      window.Capacitor &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.CapacitorUpdater
    ) {
      await window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady();
      console.log(
        "[CapgoUpdater] notifyAppReady sukses dipanggil secara global!",
      );
    }
  } catch (error) {
    console.error("[CapgoUpdater] Gagal memanggil notifyAppReady:", error);
  }
}

// ==============================================
// TOAST HELPER
// ==============================================
const TOAST = {
  init: function (icon, title) {
    return Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
    }).fire({
      icon: icon ?? "success",
      title: title ?? "Success",
    });
  },
  success: (title) => TOAST.init("success", title),
  error: (title) => TOAST.init("error", title),
  warning: (title) => TOAST.init("warning", title),
  info: (title) => TOAST.init("info", title),
};

// ==========================================
// STATE & VARIABLES
// ==========================================
let ws = null;
let isConnected = false;
let isEditMode = false;
let holdInterval = null;

let isStreaming = false;
let mouseSensitivity = 1.5;
let dragLastX = null;
let dragLastY = null;
let dragMoved = 0;
let html5QrcodeScanner = null;

let macroButtons = [];

window.onload = () => {
  if (localStorage.getItem("rem_ip"))
    document.getElementById("ipInput").value = localStorage.getItem("rem_ip");
  if (localStorage.getItem("rem_port"))
    document.getElementById("portInput").value =
      localStorage.getItem("rem_port");
  if (localStorage.getItem("rem_pin"))
    document.getElementById("pinInput").value = localStorage.getItem("rem_pin");

  loadMacroButtons();
  renderButtons();

  const savedSens = localStorage.getItem("rem_sensitivity");
  if (savedSens) {
    mouseSensitivity = parseFloat(savedSens);
    document.getElementById("sensSlider").value = mouseSensitivity;
    document.getElementById("sensValue").innerText = `${mouseSensitivity}x`;
  }

  setupStreamTouchpad();
};

// ==========================================
// WEBSOCKET CONNECTION
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

  badge.innerText = "● Connecting...";
  badge.style.color = "#f59e0b";

  let wsUrl = ip.match(/[a-zA-Z]/)
    ? `wss://${ip.replace(/^(https?|wss?):\/\//, "")}`
    : `ws://${ip}:${port}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    TOAST.error("Gagal membuat koneksi WebSocket: " + err.message);
    resetUI();
    return;
  }

  ws.onopen = () => {
    isConnected = true;
    badge.innerText = "Connected";
    badge.className = "status-badge connected";
    badge.style.color = "";

    btn.innerText = "Putuskan Koneksi";
    btn.className = "btn btn-danger";

    document.getElementById("connectionCard").style.display = "none";
    document.getElementById("mainHeaderCard").style.display = "none";
    document.getElementById("tabBar").style.display = "flex";
    switchTab("macro");
  };

  ws.onmessage = (event) => {
    try {
      let data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (err) {
      console.warn("Pesan parse error");
    }
  };

  ws.onclose = () => resetUI();
  ws.onerror = () => {
    TOAST.warning("Gagal terhubung ke PC!");
    resetUI();
  };
}

function handleServerMessage(data) {
  if (data.type === "frame") {
    const img = document.getElementById("screenImage");
    const placeholder = document.getElementById("screenPlaceholder");
    img.src = `data:image/jpeg;base64,${data.data}`;
    img.classList.add("has-frame");
    if (placeholder) placeholder.style.display = "none";
  } else if (data.type === "stream_error") {
    TOAST.error(data.message || "Screen streaming gagal.");
    exitStreamTab();
  }
}

function updateClientCursor(x, y) {
  const cursor = document.getElementById("clientCursor");
  const img = document.getElementById("screenImage");
  if (!cursor || !img) return;

  cursor.style.display = "block";
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
}

function resetUI() {
  isConnected = false;
  stopHold();
  const badge = document.getElementById("statusBadge");
  const btn = document.getElementById("connectBtn");

  badge.innerText = "Disconnected";
  badge.className = "status-badge disconnected";
  badge.style.color = "";

  btn.innerText = "Hubungkan PC";
  btn.className = "btn";

  document.getElementById("connectionCard").style.display = "block";
  document.getElementById("mainHeaderCard").style.display = "flex";
  document.getElementById("tabBar").style.display = "none";

  exitStreamTab();
}

// ==========================================
// TAB BAR & STREAM AUTOMATION (FULLSCREEN & LANDSCAPE)
// ==========================================
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (tab === "macro") {
    document.getElementById("panel-macro").style.display = "block";
    exitStreamTab();
  } else if (tab === "stream") {
    document.getElementById("panel-macro").style.display = "none";
    enterStreamTab();
  }
}

async function enterStreamTab() {
  const streamWrapper = document.getElementById("panel-stream");
  streamWrapper.classList.add("active-stream-mode");
  document.getElementById("floatingPropBtn").style.display = "flex";

  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      await document.documentElement.webkitRequestFullscreen();
    }
  } catch (e) {
    console.warn("Fullscreen dibatasi browser:", e);
  }

  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (e) {
    console.warn("Screen orientation lock tidak didukung / ditolak:", e);
  }

  if (isConnected && !isStreaming) {
    isStreaming = true;
    sendToServer({ type: "stream_start" });
  }
}

function exitStreamTab() {
  const streamWrapper = document.getElementById("panel-stream");
  streamWrapper.classList.remove("active-stream-mode");
  document.getElementById("floatingPropBtn").style.display = "none";
  document.getElementById("propertiesPanel").style.display = "none";

  if (isStreaming) {
    isStreaming = false;
    sendToServer({ type: "stream_stop" });
  }

  try {
    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen();
    }
  } catch (e) {}

  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (e) {}

  document.getElementById("panel-macro").style.display = "block";
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === "macro");
  });
}

function togglePropertiesPanel() {
  const panel = document.getElementById("propertiesPanel");
  panel.style.display = panel.style.display === "flex" ? "none" : "flex";
}

// ==========================================
// TRACKPAD / TOUCH PAD DALAM STREAM VIEW
// ==========================================
function setupStreamTouchpad() {
  const pad = document.getElementById("streamTouchArea");
  const img = document.getElementById("screenImage");

  if (!pad || !img) return;

  pad.addEventListener(
    "touchstart",
    (e) => {
      if (
        e.target.closest("#propertiesPanel") ||
        e.target.closest("#floatingPropBtn")
      )
        return;

      const t = e.touches[0];
      dragLastX = t.clientX;
      dragLastY = t.clientY;
      dragMoved = 0;

      handleAbsolutePosition(t.clientX, t.clientY, img);
    },
    { passive: true },
  );

  pad.addEventListener(
    "touchmove",
    (e) => {
      if (dragLastX === null) return;
      const t = e.touches[0];

      const dx = t.clientX - dragLastX;
      const dy = t.clientY - dragLastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);

      dragLastX = t.clientX;
      dragLastY = t.clientY;

      handleAbsolutePosition(t.clientX, t.clientY, img);
    },
    { passive: true },
  );

  pad.addEventListener("touchend", (e) => {
    if (
      e.target.closest("#propertiesPanel") ||
      e.target.closest("#floatingPropBtn")
    )
      return;

    // Jika jari nyaris tidak bergeser, anggap sebagai klik kiri
    if (dragMoved < 4) {
      sendMouseClick("left");
    }
    dragLastX = null;
    dragLastY = null;
    dragMoved = 0;
  });
}

function handleAbsolutePosition(clientX, clientY, image) {
  if (!image.naturalWidth) return;

  const rect = image.getBoundingClientRect();
  const scale = Math.min(
    rect.width / image.naturalWidth,
    rect.height / image.naturalHeight,
  );

  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;

  const offsetX = rect.left + (rect.width - renderedWidth) / 2;
  const offsetY = rect.top + (rect.height - renderedHeight) / 2;

  let x = clientX - offsetX;
  let y = clientY - offsetY;

  x = Math.max(0, Math.min(x, renderedWidth));
  y = Math.max(0, Math.min(y, renderedHeight));

  updateClientCursor(clientX, clientY);

  const percentX = x / renderedWidth;
  const percentY = y / renderedHeight;

  sendToServer({
    type: "mouse_position_percent",
    percentX: percentX,
    percentY: percentY,
  });
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
// MACRO PAD LOGIC
// ==========================================
function startHold(index, event) {
  if (event) event.preventDefault();
  if (isEditMode) {
    openEditModal(index);
    return;
  }
  executeMacro(index);
  if (holdInterval) clearInterval(holdInterval);
  holdInterval = setInterval(() => executeMacro(index), 120);
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
  } catch (err) {}
}

function loadMacroButtons() {
  const saved = localStorage.getItem("rem_macro_pad");
  macroButtons = saved ? JSON.parse(saved) : [];
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
    el.onmousedown = (e) => startHold(idx, e);
    el.onmouseup = stopHold;
    el.onmouseleave = stopHold;
    el.ontouchstart = (e) => startHold(idx, e);
    el.ontouchend = stopHold;
    el.ontouchcancel = stopHold;

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
  } else {
    grid.classList.remove("edit-mode");
    editBtn.innerText = "Edit";
    editBtn.className = "btn btn-secondary";
  }
}

function openAddModal() {
  document.getElementById("modalTitle").innerText = "Buat Tombol Macro Baru";
  document.getElementById("editIndex").value = "-1";
  document.getElementById("mLabel").value = "";
  document.getElementById("mKey").value = "";
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

function sendToServer(payload) {
  if (!isConnected || !ws) return;
  payload.pin = document.getElementById("pinInput").value.trim() || "";
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {}
}

function openQrScanner() {
  if (isConnected) {
    TOAST.info("Putuskan koneksi terlebih dahulu sebelum scan QR!");
    return;
  }
  document.getElementById("qrModal").style.display = "flex";
  html5QrcodeScanner = new Html5Qrcode("qrReader");
  html5QrcodeScanner
    .start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
      closeQrScanner();
      try {
        let data = JSON.parse(text);
        if (data.ip) document.getElementById("ipInput").value = data.ip;
        if (data.port) document.getElementById("portInput").value = data.port;
        toggleConnection();
      } catch (e) {
        let parts = text.split(":");
        if (parts.length >= 2) {
          document.getElementById("ipInput").value = parts[0];
          document.getElementById("portInput").value = parts[1];
          toggleConnection();
        }
      }
    })
    .catch(() => closeQrScanner());
}

function closeQrScanner() {
  document.getElementById("qrModal").style.display = "none";
  if (html5QrcodeScanner) html5QrcodeScanner.stop().catch(() => {});
}
