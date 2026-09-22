// ============================================================================
// CONFIG DE PRODUCCION — para aplicar sobre assets/js/config.js en la rama MAIN
// durante el cutover. NO poner esto en la rama dev (dev debe seguir apuntando
// a su propio proyecto Firebase de test).
// ============================================================================

// Configuración del entorno PRODUCCIÓN.
// Apunta al proyecto Firebase de producción (panel-control-movistar-prod).
// Los dos proyectos Firebase (dev y prod) son completamente independientes.

window.PANEL_CONFIG = {
  // Google Drive (legacy). Inerte mientras USE_FIRESTORE_AS_SOURCE = true.
  // Se conserva por si alguna vez se volviera a la carga desde Drive.
  GOOGLE_CLIENT_ID: "679270086294-uforgvhb3j32mp2pst4gu148sgnrmtek.apps.googleusercontent.com",
  GOOGLE_API_KEY: "AIzaSyCfP4msV5hM8D3nCoGGvF56lhWHuKMNSPQ",
  GOOGLE_DRIVE_FILE_ID: "1_ftcdXkF2Pa6NQouFVvNXuhqqMODqUxI",
  GOOGLE_DRIVE_FILE_NAME: "PANEL_CONTROL_DATA.xlsx",

  // Fuente de datos: en PRODUCCIÓN leemos de Firestore (el cutover ya está hecho).
  USE_FIRESTORE_AS_SOURCE: true,

  // Cuenta compartida autorizada a escribir (validada por las Security Rules).
  AUTHORIZED_EDITOR_EMAIL: "panel.editormp@gmail.com",
};

// Firebase — proyecto PRODUCCIÓN (panel-control-movistar-prod).
// Claves públicas por diseño; la seguridad real está en las Security Rules.
window.PANEL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB_2KzwBGCTFdJYW1wTqVNpBZPkIDhA6EM",
  authDomain: "panel-control-movistar-prod.firebaseapp.com",
  projectId: "panel-control-movistar-prod",
  storageBucket: "panel-control-movistar-prod.firebasestorage.app",
  messagingSenderId: "487669378862",
  appId: "1:487669378862:web:895d99bf6d3a5232ab54bf",
};
