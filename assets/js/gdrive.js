(function () {
  const config = window.PANEL_CONFIG;
  if (!config) {
    console.error("[gdrive] PANEL_CONFIG missing — load config.js before gdrive.js");
    return;
  }

  const FILE_ID = config.GOOGLE_DRIVE_FILE_ID;
  const API_KEY = config.GOOGLE_API_KEY;
  const CLIENT_ID = config.GOOGLE_CLIENT_ID;
  // Project number = primera parte del CLIENT_ID antes del primer guion.
  // Necesario para que el Picker asocie el grant drive.file con este cliente OAuth.
  const APP_ID = CLIENT_ID.split("-")[0];
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let pendingTokenResolvers = [];
  let pickerLoaded = false;

  window.GoogleDrive = {
    init,
    isSignedIn,
    signIn,
    signOut,
    showGate,
    hideGate,
    loadXlsxBuffer,
    saveXlsxBuffer,
  };

  function init() {
    if (tokenClient) return true;
    if (!window.google?.accounts?.oauth2) return false;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: handleTokenResponse,
    });
    return true;
  }

  async function handleTokenResponse(resp) {
    if (resp.error) {
      console.error("[gdrive] token error:", resp);
      pendingTokenResolvers.forEach((p) => p.reject(new Error(resp.error)));
      pendingTokenResolvers = [];
      return;
    }
    accessToken = resp.access_token;
    tokenExpiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;

    // drive.file: comprobar que el archivo del panel está autorizado.
    // Si no lo está (primer login con esta cuenta), mostrar Picker para que
    // el usuario lo seleccione → eso concede el permiso per-file.
    try {
      const accessible = await checkFileAccess(accessToken);
      if (!accessible) {
        hideGate();
        await showPickerForAuth(accessToken);
      }
    } catch (err) {
      console.error("[gdrive] file authorization failed:", err);
      showGate();
      pendingTokenResolvers.forEach((p) => p.reject(err));
      pendingTokenResolvers = [];
      accessToken = null;
      tokenExpiresAt = 0;
      return;
    }

    hideGate();
    document.dispatchEvent(new CustomEvent("gdrive:signedin"));
    pendingTokenResolvers.forEach((p) => p.resolve(accessToken));
    pendingTokenResolvers = [];
  }

  function isSignedIn() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  function signIn(opts = {}) {
    if (!init()) {
      console.error("[gdrive] GIS not loaded yet, cannot sign in");
      return;
    }
    // prompt="" → Google muestra solo lo estrictamente necesario:
    //   - Si nunca se ha consentido: muestra consentimiento.
    //   - Si ya hay consent server-side: lo salta (mejor UX).
    tokenClient.requestAccessToken({ prompt: "" });
  }

  function signOut() {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    showGate();
  }

  function ensureToken() {
    if (isSignedIn()) return Promise.resolve(accessToken);
    return new Promise((resolve, reject) => {
      pendingTokenResolvers.push({ resolve, reject });
      try {
        signIn({ silent: true });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function checkFileAccess(token) {
    const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
    });
    return resp.ok;
  }

  function loadPicker() {
    return new Promise((resolve, reject) => {
      if (pickerLoaded) return resolve();
      if (!window.gapi) {
        return reject(new Error("gapi no cargado — falta <script src='https://apis.google.com/js/api.js'>"));
      }
      window.gapi.load("picker", {
        callback: () => { pickerLoaded = true; resolve(); },
        onerror: () => reject(new Error("No se pudo cargar Google Picker")),
      });
    });
  }

  async function showPickerForAuth(token) {
    await loadPicker();
    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView()
        .setIncludeFolders(false)
        .setMimeTypes(MIME_XLSX)
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setTitle("Selecciona el archivo del Panel de Control")
        .setLocale("es")
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            const picked = data.docs && data.docs[0];
            if (picked && picked.id === FILE_ID) {
              resolve();
            } else {
              reject(new Error(
                `El archivo seleccionado no es el correcto. ` +
                `Por favor, selecciona PANEL_CONTROL_DATA.xlsx`
              ));
            }
          } else if (data.action === google.picker.Action.CANCEL) {
            reject(new Error("Selección de archivo cancelada"));
          }
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function loadXlsxBuffer({ useAuth = false } = {}) {
    if (useAuth) {
      const token = await ensureToken();
      const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      });
      if (!resp.ok) throw new Error(`Drive fetch failed: HTTP ${resp.status}`);
      return await resp.arrayBuffer();
    }
    const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media&key=${API_KEY}`;
    const resp = await fetch(url, { credentials: "omit" });
    if (!resp.ok) throw new Error(`Drive fetch failed: HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  }

  async function saveXlsxBuffer(buffer) {
    let token = await ensureToken();
    let resp = await uploadOnce(buffer, token);
    if (resp.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
      token = await ensureToken();
      resp = await uploadOnce(buffer, token);
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Drive upload failed: HTTP ${resp.status} ${errText}`);
    }
    return await resp.json().catch(() => ({}));
  }

  function uploadOnce(buffer, token) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${FILE_ID}?uploadType=media`;
    return fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": MIME_XLSX,
      },
      body: buffer,
    });
  }

  let gateInjected = false;

  function showGate() {
    ensureGateInjected();
    document.getElementById("gdrive-gate").classList.add("visible");
    const app = document.getElementById("app");
    if (app) app.style.display = "none";
  }

  function hideGate() {
    if (!gateInjected) return;
    const gate = document.getElementById("gdrive-gate");
    if (gate) gate.classList.remove("visible");
    const app = document.getElementById("app");
    if (app) app.style.display = "";
  }

  function ensureGateInjected() {
    if (gateInjected) return;
    const style = document.createElement("style");
    style.textContent = `
      #gdrive-gate {
        position: fixed; inset: 0;
        background: rgba(15, 18, 28, 0.92);
        display: none; align-items: center; justify-content: center;
        z-index: 9999; font-family: system-ui, -apple-system, sans-serif;
      }
      #gdrive-gate.visible { display: flex; }
      #gdrive-gate .gdrive-card {
        background: #fff; padding: 32px 36px; border-radius: 14px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5); max-width: 440px; text-align: center;
      }
      #gdrive-gate h2 {
        margin: 0 0 12px; font-size: 22px; color: #1f2937;
      }
      #gdrive-gate p {
        margin: 0 0 24px; color: #4b5563; line-height: 1.55; font-size: 14.5px;
      }
      #gdrive-gate button {
        background: #1a73e8; color: #fff; border: 0;
        padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600;
        cursor: pointer; transition: background 0.15s;
      }
      #gdrive-gate button:hover { background: #1557b0; }
      #gdrive-gate button:disabled { opacity: 0.6; cursor: wait; }
    `;
    document.head.appendChild(style);

    const gate = document.createElement("div");
    gate.id = "gdrive-gate";
    gate.innerHTML = `
      <div class="gdrive-card">
        <h2>Acceso al editor</h2>
        <p>Para editar el Panel de Control necesitas iniciar sesión con la cuenta autorizada.</p>
        <button id="gdrive-signin-btn" type="button">Iniciar sesión</button>
      </div>
    `;
    document.body.appendChild(gate);
    document.getElementById("gdrive-signin-btn").addEventListener("click", () => {
      signIn({ silent: false });
    });
    gateInjected = true;
  }

  function tryAutoInit(retriesLeft = 50) {
    if (init()) return;
    if (retriesLeft <= 0) return;
    setTimeout(() => tryAutoInit(retriesLeft - 1), 100);
  }
  tryAutoInit();
})();
