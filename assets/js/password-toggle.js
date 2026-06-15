// v19 — Bouton oeil pour afficher / masquer le mot de passe
// S'applique automatiquement a TOUS les <input type="password"> de la page.
// Aucune modification du HTML necessaire : le script wrap chaque input dans
// un container relatif et ajoute un bouton 👁️ qui toggle entre type="password"
// et type="text".

(function () {
  function attachToggle(input) {
    if (!input || input.dataset.pwdToggleAttached === "1") return;
    input.dataset.pwdToggleAttached = "1";

    // Wrap l'input dans un container <div> position:relative pour pouvoir
    // positionner le bouton oeil en absolu a droite.
    const wrapper = document.createElement("div");
    wrapper.className = "pwd-toggle-wrapper";
    wrapper.style.cssText = "position:relative;display:block;";

    // On insere le wrapper a la place de l'input puis on bouge l'input dedans
    const parent = input.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Reserve un espace a droite pour ne pas que le texte tape passe sous le bouton
    try {
      const currentPad = parseInt(window.getComputedStyle(input).paddingRight, 10) || 0;
      if (currentPad < 38) input.style.paddingRight = "40px";
    } catch (e) { input.style.paddingRight = "40px"; }

    // Bouton oeil
    const btn = document.createElement("button");
    btn.type = "button";              // ne soumet pas le formulaire
    btn.tabIndex = -1;                // hors flow clavier (l'input garde focus)
    btn.setAttribute("aria-label", "Afficher ou masquer le mot de passe");
    btn.title = "Afficher / masquer le mot de passe";
    btn.style.cssText = [
      "position:absolute",
      "right:8px",
      "top:50%",
      "transform:translateY(-50%)",
      "background:transparent",
      "border:none",
      "cursor:pointer",
      "font-size:18px",
      "padding:4px 6px",
      "color:#555",
      "line-height:1",
      "user-select:none",
      "z-index:2"
    ].join(";");
    btn.textContent = "👁";  // 👁

    btn.addEventListener("click", function () {
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈"; // 🙈
        btn.title = "Masquer le mot de passe";
      } else {
        input.type = "password";
        btn.textContent = "👁"; // 👁
        btn.title = "Afficher le mot de passe";
      }
      try { input.focus(); } catch (e) {}
    });

    wrapper.appendChild(btn);
  }

  function init() {
    try {
      document.querySelectorAll('input[type="password"]').forEach(attachToggle);
    } catch (e) { console.warn("[password-toggle] init", e); }
  }

  // S'execute au DOMContentLoaded ET observe les inputs ajoutes dynamiquement
  // (modales d'inscription, formulaires generes par JS, etc.).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // MutationObserver pour les inputs password injectes apres le load (modales, etc.)
  try {
    const mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          if (n.matches && n.matches('input[type="password"]')) attachToggle(n);
          if (n.querySelectorAll) {
            n.querySelectorAll('input[type="password"]').forEach(attachToggle);
          }
        });
      });
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
