document.getElementById("root").innerHTML = "<h1>Schwingen Pro läuft!</h1><p>Die App ist jetzt offlinefähig.</p>";
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}