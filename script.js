// ==========================================================
// Références DOM
// ==========================================================
const cardCircle   = document.getElementById('cardCircle');
const circleImg    = document.getElementById('circleImg');
const views        = document.querySelectorAll('.view');
const dots         = document.querySelectorAll('.dot');
const pseudoForm   = document.getElementById('pseudoForm');
const pseudoInput  = document.getElementById('pseudoInput');
const pseudoSubmit = document.getElementById('pseudoSubmit');

let currentView = 0;

const presentationImg = "https://raw.githubusercontent.com/Skyzer-Woolf/Skyzer-Woolf.github.io/f9880bcde8451c459757730ca01dd7712e327cb0/Image_Presentation.png";
const boopImg = "https://raw.githubusercontent.com/Skyzer-Woolf/Skyzer-Woolf.github.io/f9880bcde8451c459757730ca01dd7712e327cb0/Image_Presentation.png"; // à remplacer par ton image pour la vue "boop"

// ==========================================================
// Navigation swipe / flip (indépendant de Firebase)
// ==========================================================
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
    }, 150); // swap de l'image au milieu de l'animation

    setTimeout(() => cardCircle.classList.remove('flipping'), 300);
}

// ==========================================================
// Détection swipe / tap (pointer events = souris + tactile)
// ==========================================================
let startX = 0, startY = 0, startTime = 0;

cardCircle.addEventListener('pointerdown', e => {
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    cardCircle.setPointerCapture(e.pointerId); // garde les events sur cardCircle même si le doigt dévie
});

cardCircle.addEventListener('pointerup', e => {
    const distX = e.clientX - startX;
    const distY = e.clientY - startY;
    const elapsed = Date.now() - startTime;

    if (elapsed <= 500 && Math.abs(distX) >= 40 && Math.abs(distY) <= 60) {
        // swipe détecté (gauche ou droite -> on bascule entre les deux vues)
        goToView(currentView === 0 ? 1 : 0);
    } else if (Math.abs(distX) < 10 && Math.abs(distY) < 10 && elapsed < 300) {
        // tap détecté
        handleTap();
    }
});

function handleTap() {
    if (currentView !== 1) return; // le tap ne boope que sur la vue "boop"
    const pseudo = getStoredPseudo();
    if (pseudo) {
        registerBoopTap(pseudo);
    } else {
        pseudoForm.style.display = 'flex';
    }
}

function getStoredPseudo() {
    return localStorage.getItem('skyzer_pseudo');
}

// ==========================================================
// Firebase (isolé dans un try/catch : ne doit jamais bloquer
// le reste du script si la config pose problème)
// ==========================================================
let db = null;

try {
    const firebaseConfig = {
        apiKey: "AIzaSyAHGeMyMgza1FsJ6fBbdXl2k6VZ_n_Z6dc",
        authDomain: "skyzez-boop.firebaseapp.com",
        projectId: "skyzez-boop",
        storageBucket: "skyzez-boop.firebasestorage.app",
        messagingSenderId: "586663843005",
        appId: "1:586663843005:web:7d372cc6d02c1729de13d4"
    };

    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // Affichage temps réel des derniers boops (une seule ligne par personne, la plus récente en premier)
    db.collection('boopers').orderBy('lastBoopAt', 'desc').limit(5)
        .onSnapshot(snapshot => {
            const tbody = document.getElementById('lastBoopsBody');
            tbody.innerHTML = '';
            snapshot.forEach(doc => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${escapeHtml(doc.data().pseudo)}</td>`;
                tbody.appendChild(tr);
            });
        });

    // Affichage temps réel du classement des meilleurs boopeurs
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

} catch (err) {
    console.error('Erreur Firebase (le swipe et le tap fonctionnent quand même) :', err);
}

// ==========================================================
// Boop (feedback instantané à chaque tap, écriture Firebase
// regroupée une fois la rafale de taps terminée)
// ==========================================================
pseudoSubmit.addEventListener('click', () => {
    const val = pseudoInput.value.trim();
    if (!val) return;
    localStorage.setItem('skyzer_pseudo', val);
    pseudoForm.style.display = 'none';
    registerBoopTap(val);
});

let pendingBoopCount = 0;
let flushTimer = null;
const FLUSH_DELAY = 1200; // ms de pause après le dernier tap avant d'envoyer à Firebase

function registerBoopTap(pseudo) {
    pendingBoopCount++;
    playBoopAnimation(); // feedback immédiat, à CHAQUE tap, même rapproché

    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushBoops(pseudo), FLUSH_DELAY);
}

function playBoopAnimation() {
    cardCircle.classList.remove('boop-pop');
    void cardCircle.offsetWidth; // force le navigateur à "relancer" l'animation même si elle tourne déjà
    cardCircle.classList.add('boop-pop');
}

function flushBoops(pseudo) {
    const countToSend = pendingBoopCount;
    pendingBoopCount = 0;
    if (countToSend === 0) return;

    const cleanPseudo = pseudo.trim().slice(0, 20);
    if (!cleanPseudo) return;

    if (!db) {
        console.warn('Firebase non configuré : les boops ne sont pas enregistrés.');
        return;
    }

    // Un seul log pour toute la "rafale" de taps
    db.collection('boops').add({
        pseudo: cleanPseudo,
        count: countToSend,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Compteur + date du dernier boop pour cette personne
    const booperRef = db.collection('boopers').doc(cleanPseudo);
    db.runTransaction(async (t) => {
        const doc = await t.get(booperRef);
        if (!doc.exists) {
            t.set(booperRef, {
                pseudo: cleanPseudo,
                count: countToSend,
                lastBoopAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            t.update(booperRef, {
                count: doc.data().count + countToSend,
                lastBoopAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

// ==========================================================
// Utilitaire
// ==========================================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
