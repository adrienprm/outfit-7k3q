// Écran « Garde-robe » : la liste des tenues et le bouton « + ».

const WardrobeScreen = (() => {
  let photoUrls = []; // adresses temporaires des photos affichées

  const listBox = () => document.getElementById("wardrobe-list");

  const el = (...args) => App.el(...args); // création d'éléments, voir app.js

  // "Frais, très froid · Sec"
  function summary(outfit) {
    const temps = Store.TEMPS.filter((t) => outfit.temps.includes(t))
      .map((t) => Weather.TEMP_LABELS[t]);
    const rain = Store.RAIN.filter((r) => outfit.rain.includes(r))
      .map((r) => Weather.RAIN_LABELS[r]);
    // La fréquence n'est mentionnée que si elle sort de l'ordinaire.
    const frequency = outfit.frequency && outfit.frequency !== "normal"
      ? "Proposée " + Picker.FREQUENCY_LABELS[outfit.frequency].toLowerCase()
      : "";
    return [temps.join(", "), rain.join(", "), frequency].filter(Boolean).join(" · ");
  }

  function renderRow(outfit) {
    const row = el("button", "row");
    row.type = "button";

    const thumb = el("div", "thumb");
    if (outfit.photo) {
      const url = URL.createObjectURL(outfit.photo);
      photoUrls.push(url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      thumb.append(img);
    } else {
      thumb.textContent = "👚";
    }

    const text = el("div", "row-text");
    text.append(el("strong", "", outfit.title), el("span", "muted", summary(outfit)));

    row.append(thumb, text, el("span", "chevron", "›"));
    row.addEventListener("click", () => App.show("outfit", { id: outfit.id }));
    return row;
  }

  function renderEmpty() {
    const box = el("div", "empty");
    const button = el("button", "btn primary", "Ajouter une tenue");
    button.type = "button";
    button.addEventListener("click", () => App.show("outfit", {}));
    box.append(
      el("strong", "", "Ta garde-robe est vide"),
      el("p", "muted", "Ajoute une première tenue pour commencer."),
      button
    );
    return box;
  }

  function init() {
    document.getElementById("wardrobe-add")
      .addEventListener("click", () => App.show("outfit", {}));
  }

  // Appelée à chaque affichage : on relit la base et on redessine la liste.
  async function show() {
    const box = listBox();
    photoUrls.forEach((url) => URL.revokeObjectURL(url));
    photoUrls = [];
    box.textContent = "";

    let outfits;
    try {
      outfits = await Store.getOutfits();
    } catch (err) {
      box.append(el("p", "error", "Impossible de lire la garde-robe."));
      throw err;
    }
    if (outfits.length === 0) {
      box.append(renderEmpty());
      return;
    }
    outfits.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    outfits.forEach((outfit) => box.append(renderRow(outfit)));
  }

  return { init, show };
})();
