// picker.js : le tirage au sort.
//
// Pour proposer une tenue, on fait trois choses dans l'ordre :
//   1. garder les tenues qui conviennent à la météo de demain
//      (même température ET même pluie que la prévision) ;
//   2. retirer celles déjà choisies depuis moins de 3 jours ;
//   3. en tirer une au hasard, en évitant celles déjà proposées ce soir
//      (quand on appuie sur « Autre tenue »).
//
// Utilisation typique, côté écran « Ce soir » :
//   const weather = await Weather.getTomorrow(settings);
//   const result = await Picker.suggest(weather, { skip: dejaVues });
//   result.status  -> "ok", "empty-wardrobe", "no-match" ou "all-recent"
//   result.outfit  -> la tenue proposée (ou null)

const Picker = (() => {
  // ---------- Étape 1 : la météo ----------

  // `weather` vient de Weather.getTomorrow : { temp: "cool", rain: "dry", ... }
  function getCandidates(outfits, weather) {
    return outfits.filter(
      (outfit) => outfit.temps.includes(weather.temp) && outfit.rain.includes(weather.rain)
    );
  }

  // ---------- Étape 2 : la règle des 3 jours ----------

  // Renvoie l'ensemble des tenues à écarter pour le jour `targetDate`.
  // Avec repeatDays = 3, une tenue choisie un jour J ne peut revenir qu'à
  // partir de J+3 : elle est donc écartée les 2 jours qui suivent (J+1, J+2).
  // On ne regarde que les jours AVANT la date visée : le choix déjà fait
  // pour cette date elle-même ne bloque pas un nouveau tirage.
  function recentIds(history, targetDate, repeatDays) {
    const days = Math.max(1, Math.floor(repeatDays) || 1);
    const cutoff = Store.addDays(targetDate, -(days - 1));
    return new Set(
      history
        .filter((h) => h.date >= cutoff && h.date < targetDate)
        .map((h) => h.outfitId)
    );
  }

  // ---------- Étape 3 : le tirage ----------

  function randomItem(list, random) {
    return list[Math.floor(random() * list.length)];
  }

  // Fonction "pure" : elle reçoit tout ce dont elle a besoin et ne touche
  // à rien d'autre, ce qui la rend facile à tester.
  //
  // options :
  //   recentIds    ensemble des tenues à écarter (règle des 3 jours)
  //   ignoreRecent true = ne pas appliquer la règle des 3 jours
  //   skip         identifiants déjà proposés ce soir, dans l'ordre
  //   random       générateur de hasard (Math.random par défaut)
  //
  // Renvoie { status, outfit, restarted, compatible, available } où status vaut :
  //   "ok"              : une tenue est proposée
  //   "empty-wardrobe"  : la garde-robe est vide
  //   "no-match"        : aucune tenue ne convient à cette météo
  //   "all-recent"      : les tenues qui conviennent ont toutes été choisies
  //                       ces derniers jours (voir ignoreRecent)
  function choose(outfits, weather, options = {}) {
    const {
      recentIds: recent = new Set(),
      ignoreRecent = false,
      skip = [],
      random = Math.random
    } = options;

    const result = (status, outfit = null, extra = {}) => ({
      status, outfit, restarted: false, compatible: 0, available: 0, ...extra
    });

    if (outfits.length === 0) return result("empty-wardrobe");

    const compatible = getCandidates(outfits, weather);
    if (compatible.length === 0) return result("no-match");

    const available = ignoreRecent
      ? compatible
      : compatible.filter((outfit) => !recent.has(outfit.id));
    const counts = { compatible: compatible.length, available: available.length };
    if (available.length === 0) return result("all-recent", null, counts);

    // On évite ce qui a déjà été proposé ce soir.
    let pool = available.filter((outfit) => !skip.includes(outfit.id));
    let restarted = false;
    if (pool.length === 0) {
      // Tout a été vu : on recommence, mais sans reproposer tout de suite
      // la dernière tenue montrée (sauf s'il n'y en a qu'une).
      restarted = true;
      const last = skip[skip.length - 1];
      pool = available.length > 1
        ? available.filter((outfit) => outfit.id !== last)
        : available;
    }
    return result("ok", randomItem(pool, random), { ...counts, restarted });
  }

  // ---------- Version complète, qui lit la base ----------

  // Récupère tenues, historique et réglages, puis tire une tenue pour la
  // date de la météo donnée. `options` : skip, ignoreRecent (voir choose).
  async function suggest(weather, options = {}) {
    const [outfits, settings] = await Promise.all([
      Store.getOutfits(),
      Store.getSettings()
    ]);
    const days = Math.max(1, Math.floor(settings.repeatDays) || 1);
    const cutoff = Store.addDays(weather.date, -(days - 1));
    const history = await Store.getChoicesSince(cutoff);
    return choose(outfits, weather, {
      ...options,
      recentIds: recentIds(history, weather.date, settings.repeatDays)
    });
  }

  return { getCandidates, recentIds, choose, suggest };
})();
