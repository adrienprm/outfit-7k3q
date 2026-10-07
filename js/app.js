// app.js : le chef d'orchestre. Il gère la navigation entre les écrans
// et enregistre le service worker (pour le mode hors ligne).
//
// Chaque écran (fichier dans js/screens/) peut fournir deux fonctions :
//   init() : appelée une fois au démarrage (branche les boutons)
//   show(params) : appelée à chaque fois que l'écran s'affiche (recharge les données)

const App = (() => {
  const screens = {
    tonight: TonightScreen,
    wardrobe: WardrobeScreen,
    outfit: OutfitScreen,
    settings: SettingsScreen
  };

  // Crée un élément HTML. On utilise textContent (jamais innerHTML) pour
  // que le texte saisi par l'utilisateur ne puisse pas être pris pour du code.
  // Exemple : el("p", "muted", "Bonjour") -> <p class="muted">Bonjour</p>
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Affiche l'écran demandé et cache tous les autres.
  // `params` est transmis à l'écran, par ex. App.show("outfit", { id: 3 }).
  function show(name, params) {
    document.querySelectorAll(".screen").forEach((section) => {
      section.classList.toggle("active", section.id === "screen-" + name);
    });
    // La barre du bas surligne l'écran affiché. La fiche d'une tenue
    // dépend de la garde-robe : c'est elle qui est surlignée.
    const highlighted = name === "outfit" ? "wardrobe" : name;
    document.querySelectorAll("nav button").forEach((button) => {
      button.classList.toggle("active", button.dataset.screen === highlighted);
    });
    window.scrollTo(0, 0);

    const screen = screens[name];
    if (screen && screen.show) {
      Promise.resolve(screen.show(params)).catch((err) => {
        console.error("Erreur à l'affichage de l'écran " + name, err);
      });
    }
  }

  function start() {
    Object.values(screens).forEach((screen) => screen.init && screen.init());
    document.querySelectorAll("nav button").forEach((button) => {
      button.addEventListener("click", () => show(button.dataset.screen));
    });
    show("tonight");

    // Le service worker ne fonctionne qu'en HTTPS (ou en local).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.warn("Service worker non enregistré :", err);
      });
    }
  }

  return { show, start, el };
})();

App.start();
