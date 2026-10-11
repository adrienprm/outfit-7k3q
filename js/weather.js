// weather.js : récupère la météo de demain (service gratuit Open-Meteo),
// la convertit en catégories (sec/mouillé, chaud/frais/très froid) avec les
// seuils des réglages, et choisit le symbole à afficher.
//
// Utilisation typique :
//   const settings = await Store.getSettings();
//   const w = await Weather.getTomorrow(settings);
//   w.icon, w.temp ("hot"|"cool"|"cold"), w.rain ("dry"|"wet"), w.tempMax ...

const Weather = (() => {
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const CACHE_KEY = "tenues-weather";
  const CACHE_MAX_AGE = 60 * 60 * 1000; // on réutilise la météo pendant 1 h
  const TIMEOUT = 8000;                 // on abandonne après 8 s sans réponse

  const TEMP_LABELS = { hot: "Chaud", cool: "Frais", cold: "Très froid" };
  const RAIN_LABELS = { dry: "Sec", wet: "Mouillé" };

  // ---------- Symbole selon le "code météo" ----------
  // Open-Meteo décrit le temps par un nombre (norme WMO). On le traduit
  // en un symbole (emoji, qui s'affiche sans rien installer) et un mot.
  function describe(code) {
    if (code === 0) return { icon: "☀️", label: "Ensoleillé" };
    if (code === 1) return { icon: "🌤️", label: "Plutôt dégagé" };
    if (code === 2) return { icon: "⛅", label: "Éclaircies" };
    if (code === 3) return { icon: "☁️", label: "Couvert" };
    if (code === 45 || code === 48) return { icon: "🌫️", label: "Brouillard" };
    if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Bruine" };
    if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Pluie" };
    if (code >= 71 && code <= 77) return { icon: "❄️", label: "Neige" };
    if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Averses" };
    if (code === 85 || code === 86) return { icon: "❄️", label: "Averses de neige" };
    if (code >= 95 && code <= 99) return { icon: "⛈️", label: "Orage" };
    return { icon: "🌡️", label: "Météo" };
  }

  // ---------- Catégories ----------
  // Température : on regarde le maximum de la journée.
  //   très froid : sous le seuil "cold" ; chaud : au-dessus du seuil "hot" ;
  //   frais : entre les deux (bornes comprises).
  // Pluie : "mouillé" dès que la probabilité atteint le seuil "rain".
  function categorize(day, thresholds) {
    let temp = "cool";
    if (day.tempMax < thresholds.cold) temp = "cold";
    else if (day.tempMax > thresholds.hot) temp = "hot";
    const rain = day.rainProb >= thresholds.rain ? "wet" : "dry";
    return { temp, rain };
  }

  // ---------- Réseau ----------

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Réponse " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Demande les prévisions pour une ville { latitude, longitude }.
  // Renvoie un tableau de jours : [{ date, tempMax, tempMin, rainProb, code }]
  async function fetchForecast(city) {
    const params = new URLSearchParams({
      latitude: city.latitude,
      longitude: city.longitude,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
      timezone: "auto", // les dates sont celles de la ville demandée
      forecast_days: 4
    });
    const data = await fetchJSON(FORECAST_URL + "?" + params);
    const d = data.daily;
    if (!d || !Array.isArray(d.time)) throw new Error("Réponse inattendue");
    return d.time.map((date, i) => ({
      date,
      tempMax: d.temperature_2m_max[i],
      tempMin: d.temperature_2m_min[i],
      rainProb: d.precipitation_probability_max[i] ?? 0,
      code: d.weather_code[i]
    }));
  }

  // ---------- Mémoire de la dernière météo ----------
  // On garde la dernière réponse dans le téléphone : elle évite de
  // redemander la météo à chaque ouverture, et elle sert de secours
  // quand il n'y a pas de réseau.

  const cityKey = (city) => city.latitude + "," + city.longitude;

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); }
    catch (e) { return null; }
  }

  function writeCache(city, days) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        city: cityKey(city), fetchedAt: Date.now(), days
      }));
    } catch (e) { /* stockage plein ou indisponible : tant pis */ }
  }

  // Renvoie { days, stale } : stale = true si on affiche une ancienne météo
  // faute de réseau.
  async function getForecast(city, { force = false } = {}) {
    const cache = readCache();
    const sameCity = cache && cache.city === cityKey(city);

    if (!force && sameCity && Date.now() - cache.fetchedAt < CACHE_MAX_AGE) {
      return { days: cache.days, stale: false };
    }
    try {
      const days = await fetchForecast(city);
      writeCache(city, days);
      return { days, stale: false };
    } catch (err) {
      if (sameCity) return { days: cache.days, stale: true };
      throw new Error("Impossible de récupérer la météo. Vérifie ta connexion.");
    }
  }

  // ---------- Demain ----------

  // Renvoie la météo du jour visé (aujourd'hui avant 14 h, demain ensuite),
  // prête à afficher et à utiliser pour le tirage :
  // { date, tempMax, tempMin, rainProb, code, icon, label,
  //   temp, rain, tempLabel, rainLabel, isToday, stale }
  // (le nom « getTomorrow » est resté : c'est le cas le plus courant.)
  async function getTomorrow(settings, options) {
    const { days, stale } = await getForecast(settings.city, options);
    // Le jour visé : aujourd'hui avant 14 h, demain ensuite (voir Store.targetDay).
    const today = Store.dayKey();
    const wanted = Store.targetDay();
    const isToday = wanted === today;
    // On cherche cette date ; à défaut (décalage horaire), le 1er ou le 2e jour.
    const day = days.find((x) => x.date === wanted) || days[isToday ? 0 : 1];
    if (!day) throw new Error("Pas de prévision pour ce jour.");
    const cat = categorize(day, settings.thresholds);
    const info = describe(day.code);
    return {
      ...day,
      ...info,
      ...cat,
      tempLabel: TEMP_LABELS[cat.temp],
      rainLabel: RAIN_LABELS[cat.rain],
      isToday,
      stale
    };
  }

  // ---------- Recherche d'une ville (pour les réglages) ----------
  // Renvoie jusqu'à 5 villes : [{ name, label, latitude, longitude }]
  async function searchCity(query) {
    const text = String(query || "").trim();
    if (text.length < 2) return [];
    const params = new URLSearchParams({
      name: text, count: 5, language: "fr", format: "json"
    });
    const data = await fetchJSON(GEOCODING_URL + "?" + params);
    return (data.results || []).map((r) => ({
      name: r.name,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude
    }));
  }

  return {
    TEMP_LABELS, RAIN_LABELS,
    describe, categorize, getForecast, getTomorrow, searchCity
  };
})();
