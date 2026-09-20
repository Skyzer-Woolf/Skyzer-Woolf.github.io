// ---- Ta config Firebase (récupérée à l'étape 3) ----
const firebaseConfig = {
    apiKey: "TA_CLE_API",
    authDomain: "TON_PROJET.firebaseapp.com",
    projectId: "TON_PROJET",
    storageBucket: "TON_PROJET.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- Références DOM ----
const cardCircle   = document.getElementById('cardCircle');
const circleImg    = document.getElementById('circleImg');
const views        = document.querySelectorAll('.view');
const dots         = document.querySelectorAll('.dot');
const pseudoForm   = document.getElementById('pseudoForm');
const pseudoInput  = document.getElementById('pseudoInput');
const pseudoSubmit = document.getElementById('pseudoSubmit');

let currentView = 0;

const presentationImg = "https://raw.githubusercontent.com/Skyzer-Woolf/Skyzer-Woolf.github.io/f9880bcde8451c459757730ca01dd7712e327cb0/Image_Presentation.png";
const boopImg = "URL_DE_TON_IMAGE_BOOP"; // à remplacer par une autre image si tu veux

// ---- Navigation swipe / flip ----
function goToView(index) {
    if (index === currentView) return;
    cardCircle.classList.add('flipping');

    setTimeout(() => {
        circleImg.src = index === 0 ? presentationImg : boopImg;
        views.forEach(v => v.classList.remove('active'));
        document.querySelector(`.view[data-view="${index}"]`).classList.add('active');
        dots.forEach(d => d.classList.remove('active'));
        document.querySelector(`.dot[data-target="${index}"]`).classList.add('active');
        currentView = index;
    }, 150); // swap au milieu de l'animation

    setTimeout(() => cardCircle.classList.remove('flipping'), 300);
}

// ---- Détection swipe / tap (pointer events = souris + tactile) ----
let startX = 0, startY = 0, startTime = 0;

cardCircle.addEventListener('pointerdown', e => {
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
});

cardCircle.addEventListener('pointerup', e => {
    const distX = e.clientX - startX;
    const distY = e.clientY - startY;
    const elapsed = Date.now() - startTime;

    if (elapsed <= 500 && Math.abs(distX) >= 40 && Math.abs(distY) <= 60) {
        // swipe détecté (gauche ou droite, une seule autre vue donc on bascule)
        goToView(currentView === 0 ? 1 : 0);
    } else if (Math.abs(distX) < 10 && Math.abs(distY) < 10 && elapsed < 300) {
        handleTap();
    }
});

// ---- Boop ----
const BOOP_COOLDOWN = 800;
let lastBoopTime = 0;

function getStoredPseudo() {
    return localStorage.getItem('skyzer_pseudo');
}

function handleTap() {
    if (currentView !== 1) return; // le tap ne boope que sur la vue "boop"
    const pseudo = getStoredPseudo();
    if (pseudo) {
        doBoop(pseudo);
    } else {
        pseudoForm.style.display = 'flex';
    }
}

pseudoSubmit.addEventListener('click', () => {
    const val = pseudoInput.value.trim();
    if (!val) return;
    localStorage.setItem('skyzer_pseudo', val);
    pseudoForm.style.display = 'none';
    doBoop(val);
});

function doBoop(pseudo) {
    const now = Date.now();
    if (now - lastBoopTime < BOOP_COOLDOWN) return;
    lastBoopTime = now;

    const cleanPseudo = pseudo.trim().slice(0, 20);
    if (!cleanPseudo) return;

    // Log interne (date/heure + pseudo) — consultable uniquement via la console Firebase
    db.collection('boops').add({
        pseudo: cleanPseudo,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Compteur par personne (pour le classement)
    const booperRef = db.collection('boopers').doc(cleanPseudo);
    db.runTransaction(async (t) => {
        const doc = await t.get(booperRef);
        if (!doc.exists) {
            t.set(booperRef, { pseudo: cleanPseudo, count: 1 });
        } else {
            t.update(booperRef, { count: doc.data().count + 1 });
        }
    });

    cardCircle.classList.add('boop-pop');
    setTimeout(() => cardCircle.classList.remove('boop-pop'), 200);
}

// ---- Affichage temps réel ----
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

db.collection('boops').orderBy('timestamp', 'desc').limit(5)
    .onSnapshot(snapshot => {
        const tbody = document.getElementById('lastBoopsBody');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(doc.data().pseudo)}</td>`;
            tbody.appendChild(tr);
        });
    });

db.collection('boopers').orderBy('count', 'desc').limit(5)
    .onSnapshot(snapshot => {
        const tbody = document.getElementById('topBoopersBody');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(data.pseudo)}</td><td>${data.count}</td>`;
            tbody.appendChild(tr);
        });
    });