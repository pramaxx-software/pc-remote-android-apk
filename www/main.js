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
    if (data.ip) document.getElementById("ipInput").value = data.ip;
    if (data.port) document.getElementById("portInput").value = data.port;
    if (data.pin) document.getElementById("pinInput").value = data.pin;

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

  isEditMode = false;
  document.getElementById("macroGrid").classList.remove("edit-mode");
  document.getElementById("editModeBtn").innerText = "Edit";
  document.getElementById("editModeBtn").className = "btn btn-secondary";
}

// ==========================================
// LOGIKA HOLD-TO-REPEAT
// ==========================================
function startHold(index, event) {
  if (event) event.preventDefault();

  if (isEditMode) {
    openEditModal(index);
    return;
  }

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
