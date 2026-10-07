// Écran « Réglages » : la ville de la météo, les seuils de température,
// la règle des jours, et l'export / import des données.

const SettingsScreen = (() => {
  const $ = (id) => document.getElementById(id);
  const el = (...args) => App.el(...args); // création d'éléments, voir app.js

  // ---------- Messages ----------

  // Affiche un message sous une section. isError = true : en rouge.
  function setMessage(id, text, isError = false) {
    const box = $(id);
    box.textContent = text;
    box.className = "status" + (text ? (isError ? " error" : " ok") : "");
    box.hidden = !text;
  }

  function clearMessages() {
    ["city-message", "th-message", "backup-message"].forEach((id) => setMessage(id, ""));
  }

  // ---------- Valeurs affichées ----------

  // Lit un nombre dans un champ ; renvoie NaN si le champ est vide ou invalide.
  function readNumber(id) {
    const text = $(id).value.trim().replace(",", ".");
    return text === "" ? NaN : Number(text);
  }

  // Résumé des trois catégories de température, mis à jour pendant la saisie.
  function updateSummary() {
    const cold = readNumber("th-cold");
    const hot = readNumber("th-hot");
    $("th-summary").textContent =
      Number.isFinite(cold) && Number.isFinite(hot) && cold < hot
        ? `Très froid sous ${cold} °C · frais de ${cold} à ${hot} °C · chaud au-dessus de ${hot} °C.`
        : "";
  }

  // Relit la base et remplit les champs de l'écran.
  async function refresh() {
    const settings = await Store.getSettings();
    $("settings-city").textContent = settings.city.name;
    $("th-cold").value = settings.thresholds.cold;
    $("th-hot").value = settings.thresholds.hot;
    $("th-rain").value = settings.thresholds.rain;
    $("th-repeat").value = settings.repeatDays;
    updateSummary();
  }

  // ---------- Ville ----------

  async function searchCity(event) {
    event.preventDefault();
    setMessage("city-message", "");
    $("city-results").textContent = "";
    const query = $("city-query").value.trim();
    if (query.length < 2) {
      setMessage("city-message", "Tape au moins 2 lettres.", true);
      return;
    }

    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const cities = await Weather.searchCity(query);
      if (cities.length === 0) {
        setMessage("city-message", "Aucune ville trouvée pour « " + query + " ».", true);
        return;
      }
      cities.forEach((city) => {
        const choice = el("button", "choice", city.label);
        choice.type = "button";
        choice.addEventListener("click", () => chooseCity(city));
        $("city-results").append(choice);
      });
    } catch (err) {
      setMessage("city-message", "Recherche impossible. Vérifie ta connexion.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function chooseCity(city) {
    try {
      await Store.saveSettings({
        city: { name: city.name, latitude: city.latitude, longitude: city.longitude }
      });
      $("city-results").textContent = "";
      $("city-query").value = "";
      await refresh();
      setMessage("city-message", "Ville enregistrée : " + city.label + ".");
    } catch (err) {
      setMessage("city-message", "Impossible d'enregistrer la ville.", true);
    }
  }

  // ---------- Seuils et règle des jours ----------

  async function saveThresholds(event) {
    event.preventDefault();
    const cold = readNumber("th-cold");
    const hot = readNumber("th-hot");
    const rain = readNumber("th-rain");
    const repeat = readNumber("th-repeat");

    if (!Number.isFinite(cold) || !Number.isFinite(hot)) {
      return setMessage("th-message", "Indique les deux températures en chiffres.", true);
    }
    if (cold >= hot) {
      return setMessage("th-message",
        "Le seuil « très froid » doit être plus bas que le seuil « chaud ».", true);
    }
    if (!Number.isInteger(rain) || rain < 1 || rain > 100) {
      return setMessage("th-message",
        "La probabilité de pluie doit être un nombre entier entre 1 et 100.", true);
    }
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 14) {
      return setMessage("th-message",
        "Le nombre de jours doit être un entier entre 1 et 14.", true);
    }

    try {
      await Store.saveSettings({ thresholds: { cold, hot, rain }, repeatDays: repeat });
      setMessage("th-message", "Réglages enregistrés. Ils s'appliquent tout de suite.");
    } catch (err) {
      setMessage("th-message", "L'enregistrement a échoué.", true);
    }
  }

  async function resetThresholds() {
    const defaults = Store.DEFAULT_SETTINGS;
    try {
      await Store.saveSettings({
        thresholds: { ...defaults.thresholds },
        repeatDays: defaults.repeatDays
      });
      await refresh();
      setMessage("th-message", "Valeurs par défaut rétablies.");
    } catch (err) {
      setMessage("th-message", "Impossible de rétablir les valeurs.", true);
    }
  }

  // ---------- Export / import ----------

  const plural = (n) => n + " tenue" + (n > 1 ? "s" : "");

  async function exportData() {
    try {
      const data = await Store.exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tenues-" + Store.dayKey() + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage("backup-message", "Sauvegarde téléchargée (" + plural(data.outfits.length) + ").");
    } catch (err) {
      setMessage("backup-message", "L'export a échoué.", true);
    }
  }

  async function importData(event) {
    const file = event.target.files[0];
    event.target.value = ""; // permet de rechoisir le même fichier ensuite
    if (!file) return;

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      return setMessage("backup-message", "Ce fichier n'est pas une sauvegarde valable.", true);
    }
    if (!data || data.app !== "tenues" || !Array.isArray(data.outfits)) {
      return setMessage("backup-message", "Ce fichier n'est pas une sauvegarde de l'application.", true);
    }

    const ok = confirm(
      "Remplacer toutes tes données actuelles par cette sauvegarde (" +
      plural(data.outfits.length) + ") ?"
    );
    if (!ok) return;

    try {
      await Store.importAll(data);
      await refresh();
      setMessage("backup-message", "Sauvegarde importée (" + plural(data.outfits.length) + ").");
    } catch (err) {
      setMessage("backup-message", "L'import a échoué : " + err.message, true);
    }
  }

  // ---------- Cycle de vie de l'écran ----------

  function init() {
    $("city-form").addEventListener("submit", searchCity);
    $("thresholds-form").addEventListener("submit", saveThresholds);
    $("th-reset").addEventListener("click", resetThresholds);
    $("th-cold").addEventListener("input", updateSummary);
    $("th-hot").addEventListener("input", updateSummary);
    $("export-btn").addEventListener("click", exportData);
    $("import-input").addEventListener("change", importData);
  }

  // Appelée à chaque affichage de l'écran.
  async function show() {
    clearMessages();
    $("city-results").textContent = "";
    await refresh();
  }

  return { init, show };
})();
