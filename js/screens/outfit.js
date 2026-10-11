// Écran « Fiche d'une tenue » : photo, titre, description, étiquettes météo,
// boutons Enregistrer et Supprimer. Sert à créer une tenue (App.show("outfit"))
// comme à en modifier une (App.show("outfit", { id: 3 })).

const OutfitScreen = (() => {
  // La tenue en cours d'édition : son id (vide si nouvelle) et sa photo.
  let current = { id: null, photo: null, createdAt: undefined };
  let previewUrl = null;

  const $ = (id) => document.getElementById(id);

  // ---------- Photo ----------

  // Réduit la photo : un téléphone en prend de plusieurs Mo, inutiles ici.
  // On la redessine à 900 px maximum et on l'enregistre en JPEG léger.
  async function compressImage(file, maxSize = 900, quality = 0.8) {
    let bitmap;
    try {
      // "from-image" : respecte l'orientation de la photo (portrait/paysage).
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (err) {
      bitmap = await createImageBitmap(file);
    }
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression impossible"))),
        "image/jpeg",
        quality
      );
    });
  }

  // Met à jour la photo de la tenue en cours et l'aperçu à l'écran.
  function setPhoto(blob) {
    current.photo = blob || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = blob ? URL.createObjectURL(blob) : null;
    const img = $("outfit-photo-preview");
    img.hidden = !blob;
    if (blob) img.src = previewUrl; else img.removeAttribute("src");
    $("outfit-photo-remove").hidden = !blob;
  }

  async function onPhotoChosen(event) {
    const file = event.target.files[0];
    if (!file) return;
    clearError();
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      showError("Impossible de lire cette photo. Essaie-en une autre.");
    }
    event.target.value = ""; // permet de rechoisir la même photo ensuite
  }

  // ---------- Messages d'erreur ----------

  function showError(message, fieldId) {
    const box = $("outfit-error");
    box.textContent = message;
    box.hidden = false;
    if (fieldId) $(fieldId).focus();
  }

  function clearError() {
    const box = $("outfit-error");
    box.textContent = "";
    box.hidden = true;
  }

  // ---------- Étiquettes météo ----------

  // Crée une case à cocher par valeur : [Sec] [Mouillé], [Chaud] [Frais] [Très froid].
  function buildChips(containerId, values, labels, name) {
    const box = $(containerId);
    box.textContent = "";
    values.forEach((value) => {
      const label = document.createElement("label");
      label.className = "chip";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = name;
      input.value = value;
      const span = document.createElement("span");
      span.textContent = labels[value];
      label.append(input, span);
      box.append(label);
    });
  }

  // Même principe, mais en boutons « radio » : un seul choix possible.
  function buildRadios(containerId, values, labels, name, defaultValue) {
    const box = $(containerId);
    box.textContent = "";
    values.forEach((value) => {
      const label = document.createElement("label");
      label.className = "chip";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      // defaultChecked : c'est ce que « reset() » du formulaire rétablit.
      input.defaultChecked = value === defaultValue;
      const span = document.createElement("span");
      span.textContent = labels[value];
      label.append(input, span);
      box.append(label);
    });
  }

  const checkedValues = (name) =>
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
      .map((input) => input.value);

  function setChecked(name, values) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = values.includes(input.value);
    });
  }

  // ---------- Actions ----------

  async function save(event) {
    event.preventDefault();
    clearError();
    const title = $("outfit-title").value.trim();
    const rain = checkedValues("rain");
    const temps = checkedValues("temps");

    if (!title) return showError("Donne un titre à la tenue.", "outfit-title");
    if (rain.length === 0 || temps.length === 0) {
      return showError("Coche au moins une météo sur chaque ligne : sec ou mouillé, et une température.");
    }

    const button = $("outfit-save");
    button.disabled = true; // évite un double clic
    try {
      await Store.saveOutfit({
        id: current.id,
        createdAt: current.createdAt,
        title,
        description: $("outfit-description").value,
        photo: current.photo,
        frequency: checkedValues("frequency")[0] || "normal",
        rain,
        temps
      });
      App.show("wardrobe");
    } catch (err) {
      showError("L'enregistrement a échoué : " + err.message);
    } finally {
      button.disabled = false;
    }
  }

  async function remove() {
    if (current.id === null || current.id === undefined) return;
    const title = $("outfit-title").value.trim() || "cette tenue";
    if (!confirm(`Supprimer « ${title} » ?`)) return;
    try {
      await Store.deleteOutfit(current.id);
      App.show("wardrobe");
    } catch (err) {
      showError("La suppression a échoué : " + err.message);
    }
  }

  // ---------- Cycle de vie de l'écran ----------

  function init() {
    buildChips("outfit-rain", Store.RAIN, Weather.RAIN_LABELS, "rain");
    buildChips("outfit-temps", Store.TEMPS, Weather.TEMP_LABELS, "temps");
    buildRadios("outfit-frequency", Store.FREQUENCIES, Picker.FREQUENCY_LABELS, "frequency", "normal");

    $("outfit-back").addEventListener("click", () => App.show("wardrobe"));
    // Deux entrées, un seul traitement : appareil photo ou galerie.
    $("outfit-photo-camera").addEventListener("change", onPhotoChosen);
    $("outfit-photo-input").addEventListener("change", onPhotoChosen);
    $("outfit-photo-remove").addEventListener("click", () => setPhoto(null));
    $("outfit-form").addEventListener("submit", save);
    $("outfit-delete").addEventListener("click", remove);
  }

  // Appelée à chaque affichage : formulaire vide, ou rempli si on modifie.
  async function show(params = {}) {
    clearError();
    $("outfit-form").reset();
    const editing = params.id !== undefined && params.id !== null;

    // Le titre et le bouton Supprimer changent tout de suite, avant même
    // que la lecture de la base soit terminée.
    $("outfit-heading").textContent = editing ? "Modifier la tenue" : "Nouvelle tenue";
    $("outfit-delete").hidden = !editing;

    if (editing) {
      const outfit = await Store.getOutfit(params.id);
      if (!outfit) return App.show("wardrobe"); // tenue introuvable
      current = { id: outfit.id, photo: null, createdAt: outfit.createdAt };
      $("outfit-title").value = outfit.title;
      $("outfit-description").value = outfit.description;
      setChecked("rain", outfit.rain);
      setChecked("temps", outfit.temps);
      setChecked("frequency", [outfit.frequency || "normal"]);
      setPhoto(outfit.photo);
    } else {
      current = { id: null, photo: null, createdAt: undefined };
      setPhoto(null);
    }
  }

  return { init, show };
})();
