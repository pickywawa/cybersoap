'use strict';
const REPO = 'pickywawa/cybersoap';

let language = 'fr';
try {
  const saved = localStorage.getItem('cybersoap.site.language');
  language = saved || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'fr' || asked === 'en') language = asked;
} catch (_) {}

const views = {
  request: { image: 'assets/screen-request.png', fr: 'Requête à gauche, réponse formatée à droite, statut, temps, taille et assertions en un coup d’œil.', en: 'Request on the left, formatted response on the right, status, time, size and assertions at a glance.' },
  autocomplete: { image: 'assets/screen-autocomplete.png', fr: 'L’autocomplétion ne propose que les éléments valides à cet endroit, d’après le schéma du WSDL.', en: 'Autocompletion only offers the elements valid at this position, based on the WSDL schema.' },
  variables: { image: 'assets/screen-forecast.png', fr: '{{city}} vient des variables globales, l’environnement actif « dev » est choisi dans la barre du haut.', en: '{{city}} comes from global variables, the active “dev” environment is picked in the top bar.' },
  runner: { image: 'assets/screen-runner.png', fr: 'Le runner joue toute une collection et vérifie chaque réponse (thème Cyberdog Neon).', en: 'The runner plays a whole collection and checks every response (Cyberdog Neon theme).' },
  environments: { image: 'assets/screen-environments.png', fr: 'Variables globales et environnements partagés par toutes les collections.', en: 'Global variables and environments shared by all collections.' },
  light: { image: 'assets/screen-light.png', fr: 'Côté clair : Alucard, Daylight, Solar Flare, Frost Byte, Sakura Neon.', en: 'Light side: Alucard, Daylight, Solar Flare, Frost Byte, Sakura Neon.' }
};
let selectedView = 'request';
const $ = (s) => document.querySelector(s);

function updateView(key) {
  selectedView = key;
  const view = views[key];
  const image = $('#gallery-image');
  image.src = view.image;
  image.alt = view[language];
  $('#gallery-open').dataset.image = view.image;
  $('#gallery-caption').textContent = view[language];
  $('#view-panel').setAttribute('aria-labelledby', 'tab-' + key);
  document.querySelectorAll('[data-view]').forEach((b) => {
    const on = b.dataset.view === key;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function translate() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-fr][data-en]').forEach((el) => {
    el.textContent = el.dataset[language].replaceAll('\\n', '\n');
  });
  document.title = language === 'fr' ? 'CyberSoap — Vos web services SOAP, enfin testables.' : 'CyberSoap — Your SOAP web services, finally testable.';
  const b = $('#language');
  b.textContent = language === 'fr' ? 'EN' : 'FR';
  b.setAttribute('aria-label', language === 'fr' ? 'Switch to English' : 'Passer en français');
  updateView(selectedView);
  paintHeroToggle();
}

$('#language').addEventListener('click', () => {
  language = language === 'fr' ? 'en' : 'fr';
  try { localStorage.setItem('cybersoap.site.language', language); } catch (_) {}
  translate();
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => updateView(button.dataset.view));
  button.addEventListener('keydown', (e) => {
    const all = [...document.querySelectorAll('[data-view]')];
    const i = all.indexOf(button);
    let target;
    if (e.key === 'ArrowRight') target = all[(i + 1) % all.length];
    if (e.key === 'ArrowLeft') target = all[(i + all.length - 1) % all.length];
    if (target) { e.preventDefault(); target.focus(); updateView(target.dataset.view); }
  });
});

// lightbox
const lightbox = $('#lightbox');
document.querySelectorAll('.screenshot-open').forEach((b) =>
  b.addEventListener('click', () => {
    $('#lightbox-image').src = b.dataset.image;
    $('#lightbox-image').alt = b.querySelector('img').alt;
    lightbox.showModal();
  })
);
$('#lightbox-close').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
$('#year').textContent = new Date().getFullYear();

// hero video: never autoplay with reduced motion, always pausable
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const video = $('#hero-video');
const toggle = $('#hero-toggle');
function paintHeroToggle() {
  toggle.textContent = video.paused ? (language === 'fr' ? 'Lecture' : 'Play') : 'Pause';
  toggle.setAttribute('aria-pressed', String(video.paused));
}
if (reduced) { video.removeAttribute('autoplay'); video.pause(); }
toggle.addEventListener('click', () => (video.paused ? video.play().catch(() => {}) : video.pause()));
video.addEventListener('play', paintHeroToggle);
video.addEventListener('pause', paintHeroToggle);

// mini demos
const popupItems = [...document.querySelectorAll('#popup div')];
let popupIndex = 0;
setInterval(() => {
  if (reduced || document.hidden) return;
  popupItems.forEach((d, i) => d.classList.toggle('on', i === popupIndex));
  popupIndex = (popupIndex + 1) % popupItems.length;
}, 900);

const badges = [...document.querySelectorAll('[data-run]')];
let step = 0;
function paintRun() {
  badges.forEach((b, i) => {
    const state = i < step ? 'ok' : i === step ? 'run' : 'wait';
    b.className = 'badge ' + state;
    b.textContent = state === 'ok' ? 'PASSED' : state === 'run' ? 'RUNNING' : 'WAIT';
  });
  $('#run-track').style.width = Math.min(step / badges.length, 1) * 100 + '%';
}
paintRun();
setInterval(() => {
  if (reduced || document.hidden) return;
  step = step > badges.length + 1 ? 0 : step + 1;
  paintRun();
}, 1100);

// reveal on scroll
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }),
    { threshold: 0.08 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

// highlight the visitor's OS
const ua = navigator.userAgent.toLowerCase();
const os = ua.includes('mac') ? 'mac' : ua.includes('win') ? 'win' : ua.includes('linux') ? 'linux' : null;
if (os) document.querySelector(`.download-card[data-os="${os}"]`)?.classList.add('current');

translate();

// download links from the latest release (links already point to Releases if the API is unavailable)
fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { credentials: 'omit' })
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((release) => {
    if (!Array.isArray(release.assets)) return;
    $('#version').textContent = `${release.tag_name} · GitHub Releases ↗`;
    $('#version').href = release.html_url;
    document.querySelectorAll('[data-asset]').forEach((link) => {
      const asset = release.assets.find((a) => a.name.endsWith(link.dataset.asset));
      if (asset && asset.browser_download_url.startsWith(`https://github.com/${REPO}/releases/download/`)) link.href = asset.browser_download_url;
    });
  })
  .catch(() => {});
