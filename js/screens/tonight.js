// Écran « Ma tenue » : la météo du jour visé (aujourd'hui avant 14 h, demain
// ensuite), la tenue tirée au sort, et les boutons « Autre tenue » et « Je la prends ».
//
// Trois situations possibles :
//   - une tenue est PROPOSÉE : on peut en demander une autre ou la prendre ;
//   - une tenue est déjà CHOISIE pour ce jour : on la rappelle (et on peut changer) ;
//   - aucune tenue ne peut être proposée : un message explique pourquoi.

const TonightScreen = (() => {
  const $ = (id) => document.getElementById(id);
  const el = (...args) => App.el(...args); // création d'éléments, voir app.js

  // Ce que l'écran retient tant que l'application reste ouverte, pour que
  // la tenue proposée ne change pas à chaque aller-retour entre les écrans.
  const state = {
    date: null,          // le jour visé (demain), au format "2026-10-07"
    weather: null,       // la météo de demain (voir weather.js)
    city: "",
    outfit: null,        // la tenue affichée
    shown: [],           // identifiants des tenues déjà proposées ce soir
    changing: false,     // true = elle a demandé à changer une tenue déjà choisie
    ignoreRecent: false, // true = on passe outre la règle des 3 jours
    available: 0,        // nombre de tenues encore possibles
    notice: ""           // petit message sous la tenue
  };

  let runId = 0;      // numéro de l'affichage en cours (évite les mélanges)
  let busy = false;   // true pendant un enregistrement (évite le double clic)
  let photoUrl = null;

  // ---------- Petits utilitaires ----------

  function button(label, className, onClick) {
    const node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  // "2026-10-07" -> "mercredi 7 octobre"
  function dateLabel(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long"
    });
  }

  function resetForNewDay(date) {
    state.date = date;
    state.outfit = null;
    state.shown = [];
    state.changing = false;
    state.ignoreRecent = false;
    state.available = 0;
    state.notice = "";
  }

  // ---------- Affichage ----------

  // Les messages de fête du jour (anniversaire, fête du prénom), s'il y en a.
  // Ils s'affichent avant la météo : même sans réseau, le message est là.
  function renderGreetings() {
    const box = $("tonight-greeting");
    box.textContent = "";
    // Le message se règle sur le jour d'AUJOURD'HUI (date du téléphone), pas sur demain.
    Messages.forDate(Store.dayKey()).forEach((message) => {
      const icon = el("span", "greeting-icon", message.icon);
      icon.setAttribute("aria-hidden", "true");
      const text = el("div", "greeting-text");
      text.append(el("strong", "greeting-title", message.title));
      message.paragraphs.forEach((paragraph) => text.append(el("p", "", paragraph)));
      const card = el("div", message.paragraphs.length ? "greeting" : "greeting short");
      card.setAttribute("role", "region");
      card.setAttribute("aria-label", message.title);
      card.append(icon, text);
      box.append(card);
    });
  }

  function renderWeather() {
    const w = state.weather;
    $("tonight-date").textContent = (w.isToday ? "Aujourd'hui, " : "Demain, ") + dateLabel(w.date);

    const box = $("tonight-weather");
    box.textContent = "";
    const icon = el("span", "weather-icon", w.icon);
    icon.setAttribute("aria-hidden", "true");
    const top = el("div", "weather-top");
    top.append(
      icon,
      el("span", "weather-temp", Math.round(w.tempMax) + " °C"),
      el("span", "tag accent", w.tempLabel),
      el("span", "tag", w.rainLabel)
    );
    const detail = [
      w.label,
      "min " + Math.round(w.tempMin) + " °C",
      Math.round(w.rainProb) + " % de pluie",
      state.city
    ].filter(Boolean).join(" · ");
    box.append(top, el("p", "muted", detail));
    if (w.stale) {
      box.append(el("p", "muted", "Météo enregistrée plus tôt : pas de connexion."));
    }
  }

  // La carte de la tenue : photo à gauche, titre et description à droite.
  function outfitCard(outfit, badge) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;

    const photo = el("div", "outfit-photo");
    if (outfit.photo) {
      photoUrl = URL.createObjectURL(outfit.photo);
      const img = document.createElement("img");
      img.src = photoUrl;
      img.alt = "";
      photo.append(img);
    } else {
      photo.textContent = "👚";
    }

    const text = el("div", "outfit-text");
    if (badge) text.append(el("span", "tag success", badge));
    text.append(el("strong", "outfit-title", outfit.title));
    if (outfit.description) text.append(el("span", "muted", outfit.description));

    const card = el("div", "outfit-card");
    card.append(photo, text);
    return card;
  }

  function renderProposal() {
    const body = $("tonight-body");
    body.textContent = "";
    body.append(outfitCard(state.outfit));
    if (state.notice) body.append(el("p", "notice", state.notice));

    const actions = el("div", "actions");
    // S'il n'y a qu'une seule tenue possible, « Autre tenue » ne servirait à rien.
    if (state.available > 1) actions.append(button("↻ Autre tenue", "btn", onAnother));
    actions.append(button("✓ Je la prends", "btn primary", onTake));
    body.append(actions);
  }

  function renderConfirmed() {
    const body = $("tonight-body");
    body.textContent = "";
    body.append(outfitCard(state.outfit, state.weather.isToday ? "✓ Choisie pour aujourd'hui" : "✓ Choisie pour demain"));
    const actions = el("div", "actions");
    actions.append(button("Changer de tenue", "btn", onChange));
    body.append(actions);
  }

  // Un message quand aucune tenue ne peut être proposée.
  function renderProblem(result) {
    const body = $("tonight-body");
    body.textContent = "";
    const w = state.weather;
    const box = el("div", "empty");

    if (result.status === "empty-wardrobe") {
      box.append(
        el("strong", "", "Ta garde-robe est vide"),
        el("p", "muted", "Ajoute des tenues pour que je puisse t'en proposer."),
        button("Ajouter une tenue", "btn primary", () => App.show("outfit", {}))
      );
    } else if (result.status === "no-match") {
      box.append(
        el("strong", "", "Aucune tenue pour cette météo"),
        el("p", "muted",
          `Il faut une tenue cochée « ${w.tempLabel.toLowerCase()} » et « ${w.rainLabel.toLowerCase()} ». ` +
          "Ajoute-en une, ou coche cette météo sur une tenue existante."),
        button("Voir la garde-robe", "btn primary", () => App.show("wardrobe"))
      );
    } else { // "all-recent"
      const n = result.compatible;
      box.append(
        el("strong", "", "Tout a déjà été porté récemment"),
        el("p", "muted",
          n === 1
            ? "La seule tenue qui convient a été choisie ces derniers jours."
            : `Les ${n} tenues qui conviennent ont été choisies ces derniers jours.`),
        button("Proposer quand même", "btn primary", onIgnoreRecent)
      );
    }
    body.append(box);
  }

  function renderWeatherError(err) {
    $("tonight-date").textContent = "";
    $("tonight-weather").textContent = "";
    const body = $("tonight-body");
    body.textContent = "";
    const box = el("div", "empty");
    box.append(
      el("strong", "", "Météo indisponible"),
      el("p", "muted", err.message),
      button("Réessayer", "btn primary", () => show())
    );
    body.append(box);
  }

  function showActionError(message) {
    const body = $("tonight-body");
    const old = body.querySelector(".action-error");
    if (old) old.remove();
    const p = el("p", "error action-error", message);
    p.setAttribute("role", "alert");
    body.append(p);
  }

  // ---------- Tirage ----------

  // Demande une tenue au tirage, en écartant celles déjà montrées ce soir.
  async function draw() {
    const run = runId;
    const result = await Picker.suggest(state.weather, {
      skip: state.shown,
      ignoreRecent: state.ignoreRecent
    });
    if (run !== runId) return; // l'écran a été rechargé entre-temps

    if (result.status !== "ok") {
      state.outfit = null;
      renderProblem(result);
      return;
    }
    state.outfit = result.outfit;
    state.available = result.available;
    if (result.available === 1) {
      state.notice = "C'est la seule tenue qui convient à cette météo.";
    } else if (result.restarted) {
      state.notice = "Tu as tout vu : on recommence.";
    } else {
      state.notice = "";
    }
    // Quand on recommence, un nouveau cycle commence avec cette tenue.
    state.shown = result.restarted ? [result.outfit.id] : [...state.shown, result.outfit.id];
    renderProposal();
  }

  // ---------- Boutons ----------

  async function onAnother() {
    if (busy) return;
    try { await draw(); }
    catch (err) { showActionError("Impossible de tirer une autre tenue."); }
  }

  async function onTake() {
    if (busy || !state.outfit) return;
    busy = true;
    try {
      await Store.setChoice(state.weather.date, state.outfit.id);
      state.changing = false;
      state.shown = [];
      state.notice = "";
      renderConfirmed();
    } catch (err) {
      showActionError("Impossible d'enregistrer ton choix. Réessaie.");
    } finally {
      busy = false;
    }
  }

  // Changer une tenue déjà choisie : on en tire une autre tout de suite.
  async function onChange() {
    if (busy) return;
    state.changing = true;
    state.shown = state.outfit ? [state.outfit.id] : [];
    try { await draw(); }
    catch (err) { showActionError("Impossible de tirer une autre tenue."); }
  }

  async function onIgnoreRecent() {
    state.ignoreRecent = true;
    try { await draw(); }
    catch (err) { showActionError("Impossible de tirer une tenue."); }
  }

  // ---------- Cycle de vie de l'écran ----------

  // Appelée à chaque affichage : météo, puis tenue choisie ou proposée.
  async function show() {
    const run = ++runId;
    renderGreetings();
    $("tonight-body").textContent = "";
    $("tonight-body").append(el("p", "muted", "Je regarde la météo…"));

    let settings, weather;
    try {
      settings = await Store.getSettings();
      weather = await Weather.getTomorrow(settings);
    } catch (err) {
      if (run === runId) renderWeatherError(err);
      return;
    }
    if (run !== runId) return;

    if (state.date !== weather.date) resetForNewDay(weather.date);
    state.weather = weather;
    state.city = settings.city.name;
    renderWeather();

    // Une tenue est-elle déjà choisie pour ce jour ?
    const choice = await Store.getChoice(weather.date);
    const chosen = choice ? await Store.getOutfit(choice.outfitId) : null;
    if (run !== runId) return;
    if (chosen && !state.changing) {
      state.outfit = chosen;
      renderConfirmed();
      return;
    }

    // Sinon, on garde la tenue proposée tant qu'elle existe et convient
    // encore (elle a pu être modifiée ou supprimée dans la garde-robe).
    if (state.outfit) {
      const fresh = await Store.getOutfit(state.outfit.id);
      if (run !== runId) return;
      const stillFits = fresh && Picker.getCandidates([fresh], weather).length > 0;
      state.outfit = stillFits ? fresh : null;
    }
    if (state.outfit) renderProposal();
    else await draw();
  }

  return { show };
})();
