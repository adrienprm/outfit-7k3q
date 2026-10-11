// messages.js : les messages de fête affichés en haut de l'écran « Ma tenue ».
//
// Un message n'apparaît QUE le jour J (même jour et même mois, chaque année),
// d'après la date du téléphone. Le reste de l'année, il reste invisible :
// ta copine peut donc avoir l'application bien avant sans le découvrir.
//
// ===== À PERSONNALISER =====
//   FIRST_NAME : son prénom. Laisse "" pour ne pas l'afficher.
//   EVENTS     : chaque message a un mois (1 à 12), un jour, un titre et des
//                paragraphes. {prenom} dans un titre est remplacé par
//                " Prénom" (avec l'espace), ou par rien si FIRST_NAME est vide.
//                month: 0 désactive un message (date pas encore choisie).
//
// Pour voir un message avant le jour J, ouvre la console du navigateur (F12)
// et tape :  Messages.preview("birthday")   puis   Messages.preview(null)
// pour revenir à la normale.

const Messages = (() => {
  const FIRST_NAME = "Alice"; // pas utilisé par les textes actuels (voir {prenom})

  // (\u00a0 = espace insécable : le « ! » reste collé au mot et ne passe jamais seul à la ligne.)
  const EVENTS = [
    {
      key: "birthday",
      month: 11,
      day: 6,
      icon: "🎂",
      title: "Joyeux anniversaire Lissou\u00a0!",
      paragraphs: []
    },
    {
      key: "nameday",
      month: 12, // la Sainte Alice, le 16 décembre (calendrier français)
      day: 16,
      icon: "🌟",
      title: "Bonne fête\u00a0!",
      paragraphs: []
    }
  ];

  let previewKey = null; // message forcé par preview(), sinon null

  // Remplace {prenom} dans un texte.
  function fill(event) {
    const name = FIRST_NAME.trim();
    return {
      key: event.key,
      icon: event.icon,
      title: event.title.replace("{prenom}", name ? " " + name : ""),
      paragraphs: event.paragraphs
    };
  }

  // Les messages du jour `dateKey` ("2026-11-06"). Renvoie une liste, vide
  // presque toute l'année.
  function forDate(dateKey) {
    const month = Number(dateKey.slice(5, 7));
    const day = Number(dateKey.slice(8, 10));
    return EVENTS
      .filter((event) => previewKey
        ? event.key === previewKey
        : event.month > 0 && event.month === month && event.day === day) // month: 0 = désactivé
      .map(fill);
  }

  // Aperçu pour tester : Messages.preview("birthday"), Messages.preview(null).
  function preview(key) {
    if (key !== null && !EVENTS.some((event) => event.key === key)) {
      throw new Error("Message inconnu. Choix possibles : " + EVENTS.map((e) => e.key).join(", "));
    }
    previewKey = key;
    if (typeof App !== "undefined") App.show("tonight");
  }

  return { forDate, preview };
})();
