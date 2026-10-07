// storage.js : enregistre et relit les données sur le téléphone (IndexedDB).
//
// IndexedDB est une petite base de données intégrée au navigateur. On
// l'utilise plutôt que localStorage parce qu'elle accepte les photos.
// Trois "tiroirs" (object stores) :
//   - outfits  : les tenues (titre, description, photo, étiquettes météo)
//   - history  : une ligne par jour = la tenue choisie ce jour-là
//   - settings : les réglages (ville, seuils de température)
//
// Toutes les fonctions sont asynchrones : elles renvoient une "promesse"
// qu'on attend avec await, par exemple :  const tenues = await Store.getOutfits();

const Store = (() => {
  const DB_NAME = "tenues";
  const DB_VERSION = 1;

  // Les valeurs possibles des étiquettes météo d'une tenue.
  const RAIN = ["dry", "wet"];           // sec, mouillé
  const TEMPS = ["hot", "cool", "cold"]; // chaud, frais, très froid

  // Réglages par défaut, utilisés tant que rien n'a été modifié.
  const DEFAULT_SETTINGS = {
    city: { name: "Paris", latitude: 48.8566, longitude: 2.3522 },
    thresholds: {
      cold: 8,   // en dessous de 8 °C : très froid
      hot: 22,   // au-dessus de 22 °C : chaud (entre les deux : frais)
      rain: 50   // à partir de 50 % de probabilité de pluie : mouillé
    },
    repeatDays: 3 // une tenue choisie n'est pas reproposée avant 3 jours
  };

  // ---------- Ouverture de la base ----------

  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Appelé à la toute première ouverture : on crée les tiroirs.
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("outfits", { keyPath: "id", autoIncrement: true });
          db.createObjectStore("history", { keyPath: "date" });
          db.createObjectStore("settings", { keyPath: "key" });
        };
        request.onsuccess = () => {
          resolve(request.result);
          // On demande au navigateur de ne pas effacer ces données tout seul
          // quand le téléphone manque de place.
          if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
          }
        };
        request.onerror = () => {
          dbPromise = null; // permet de réessayer plus tard
          reject(request.error);
        };
      });
    }
    return dbPromise;
  }

  // Exécute un travail dans une "transaction" (un lot d'opérations qui
  // réussit en entier ou pas du tout). `work` reçoit la transaction et
  // renvoie la requête dont on veut le résultat.
  async function run(storeNames, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ---------- Dates ----------
  // Une date est stockée sous forme de texte "2026-10-05" (heure locale),
  // ce qui se trie et se compare simplement.

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Ajoute (ou retire, si n est négatif) des jours à une date "2026-10-05".
  function addDays(key, n) {
    const [y, m, d] = key.split("-").map(Number);
    return dayKey(new Date(y, m - 1, d + n));
  }

  // ---------- Tenues ----------

  function cleanOutfit(outfit) {
    const title = String(outfit.title || "").trim();
    if (!title) throw new Error("Le titre est obligatoire.");
    const clean = {
      title,
      description: String(outfit.description || "").trim(),
      photo: outfit.photo || null, // un Blob (fichier image) ou rien
      rain: (outfit.rain || []).filter((v) => RAIN.includes(v)),
      temps: (outfit.temps || []).filter((v) => TEMPS.includes(v)),
      createdAt: outfit.createdAt || Date.now()
    };
    if (outfit.id !== undefined && outfit.id !== null) clean.id = outfit.id;
    return clean;
  }

  const getOutfits = () =>
    run("outfits", "readonly", (tx) => tx.objectStore("outfits").getAll());

  const getOutfit = (id) =>
    run("outfits", "readonly", (tx) => tx.objectStore("outfits").get(id));

  // Ajoute la tenue si elle n'a pas d'id, la remplace sinon.
  // Renvoie l'id de la tenue.
  const saveOutfit = (outfit) =>
    run("outfits", "readwrite", (tx) =>
      tx.objectStore("outfits").put(cleanOutfit(outfit))
    );

  // Supprime la tenue ET les jours d'historique qui la mentionnent.
  const deleteOutfit = (id) =>
    run(["outfits", "history"], "readwrite", (tx) => {
      const history = tx.objectStore("history");
      history.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        if (cursor.value.outfitId === id) cursor.delete();
        cursor.continue();
      };
      return tx.objectStore("outfits").delete(id);
    });

  // ---------- Historique des choix ----------

  // Enregistre la tenue choisie pour un jour. Un seul choix par jour :
  // choisir à nouveau pour la même date remplace le précédent.
  const setChoice = (date, outfitId) =>
    run("history", "readwrite", (tx) =>
      tx.objectStore("history").put({ date, outfitId, chosenAt: Date.now() })
    );

  const getChoice = (date) =>
    run("history", "readonly", (tx) => tx.objectStore("history").get(date));

  // Tous les choix à partir d'une date incluse (pour la règle des 3 jours).
  const getChoicesSince = (date) =>
    run("history", "readonly", (tx) =>
      tx.objectStore("history").getAll(IDBKeyRange.lowerBound(date))
    );

  // ---------- Réglages ----------

  async function getSettings() {
    const row = await run("settings", "readonly", (tx) =>
      tx.objectStore("settings").get("main")
    );
    const saved = row ? row.value : {};
    // On complète avec les valeurs par défaut pour ne jamais avoir de trou.
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      city: { ...DEFAULT_SETTINGS.city, ...(saved.city || {}) },
      thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(saved.thresholds || {}) }
    };
  }

  // Ne modifie que ce qu'on lui donne : saveSettings({ city: {...} })
  async function saveSettings(changes) {
    const merged = { ...(await getSettings()), ...changes };
    await run("settings", "readwrite", (tx) =>
      tx.objectStore("settings").put({ key: "main", value: merged })
    );
    return merged;
  }

  // ---------- Export / import ----------
  // L'export produit un objet JSON qu'on peut enregistrer dans un fichier.
  // Les photos sont converties en texte (base64) pour tenir dans le JSON.

  async function blobToDataURL(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  }

  function dataURLToBlob(url) {
    const [head, base64] = url.split(",");
    const type = head.slice(5, head.indexOf(";"));
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  async function exportAll() {
    const [outfits, history, settings] = await Promise.all([
      getOutfits(),
      run("history", "readonly", (tx) => tx.objectStore("history").getAll()),
      getSettings()
    ]);
    const outfitsOut = [];
    for (const outfit of outfits) {
      outfitsOut.push({
        ...outfit,
        photo: outfit.photo ? await blobToDataURL(outfit.photo) : null
      });
    }
    return {
      app: "tenues",
      version: 1,
      exportedAt: new Date().toISOString(),
      outfits: outfitsOut,
      history,
      settings
    };
  }

  // Remplace TOUTES les données actuelles par celles du fichier.
  async function importAll(data) {
    if (!data || data.app !== "tenues" || !Array.isArray(data.outfits)) {
      throw new Error("Ce fichier n'est pas une sauvegarde de l'application.");
    }
    // On prépare tout avant d'ouvrir la transaction.
    const outfits = data.outfits.map((o) => ({
      ...o,
      photo: o.photo ? dataURLToBlob(o.photo) : null
    }));
    const history = data.history || [];
    const settings = data.settings || {};

    await run(["outfits", "history", "settings"], "readwrite", (tx) => {
      tx.objectStore("outfits").clear();
      tx.objectStore("history").clear();
      tx.objectStore("settings").clear();
      outfits.forEach((o) => tx.objectStore("outfits").put(o));
      history.forEach((h) => tx.objectStore("history").put(h));
      return tx.objectStore("settings").put({ key: "main", value: settings });
    });
  }

  return {
    RAIN, TEMPS, DEFAULT_SETTINGS,
    open, dayKey, addDays,
    getOutfits, getOutfit, saveOutfit, deleteOutfit,
    setChoice, getChoice, getChoicesSince,
    getSettings, saveSettings,
    exportAll, importAll
  };
})();
