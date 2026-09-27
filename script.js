// ==========================================================
// Références DOM
// ==========================================================
const cardCircle   = document.getElementById('cardCircle');
const cardContainer = document.getElementById('cardContainer');
const circleImg    = document.getElementById('circleImg');
const views        = document.querySelectorAll('.view');
const pseudoForm   = document.getElementById('pseudoForm');
const pseudoInput  = document.getElementById('pseudoInput');
const pseudoSubmit = document.getElementById('pseudoSubmit');
const guideButtons = document.querySelectorAll('.swipe-guide-button');
const guideIcons   = document.querySelectorAll('.swipe-guide-button .swipe-guide-icon');
const guideHand    = document.getElementById('swipeGuideHand');
const guideText    = document.getElementById('swipeGuideText');
const boopPhotoInstruction = document.getElementById('boopPhotoInstruction');

let currentView = 0;

guideButtons.forEach(button => {
    button.addEventListener('click', () => goToView(Number(button.dataset.guide)));
});

function updateSwipeGuide(index) {
    const targetIndex = index === 0 ? 1 : 0;
    cardContainer.classList.toggle('boop-view-active', index === 1);
    boopPhotoInstruction.classList.toggle('visible', index === 1);
    guideIcons.forEach(icon => {
        const guideButton = icon.closest('.swipe-guide-button');
        icon.classList.toggle('active', guideButton.dataset.guide === String(index));
    });
    guideHand.classList.toggle('target-right', targetIndex === 1);
    guideHand.classList.toggle('target-left', targetIndex === 0);
    guideText.classList.toggle('target-right', targetIndex === 1);
    guideText.classList.toggle('target-left', targetIndex === 0);
    guideText.textContent = targetIndex === 1
        ? 'Clique ici pour laisser une trace de ton passage'
        : 'Clique ici pour avoir mes réseaux';
}

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
        updateSwipeGuide(index);
        currentView = index;
    }, 150); // swap de l'image au milieu de l'animation

    setTimeout(() => cardCircle.classList.remove('flipping'), 300);
}

// ==========================================================
// Clic sur l'image pour booper (le changement de page se fait avec les icônes)
// ==========================================================
cardCircle.addEventListener('click', handleTap);

function handleTap() {
    if (currentView !== 1) return; // le tap ne boope que sur la vue "boop"
    playBoopAnimation();
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
let boopAnimationTimer = null;
const FLUSH_DELAY = 1200; // ms de pause après le dernier tap avant d'envoyer à Firebase

function registerBoopTap(pseudo) {
    pendingBoopCount++;

    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushBoops(pseudo), FLUSH_DELAY);
}

function playBoopAnimation() {
    cardCircle.classList.remove('boop-pop');
    void cardCircle.offsetWidth; // force le navigateur à "relancer" l'animation même si elle tourne déjà
    cardCircle.classList.add('boop-pop');
    clearTimeout(boopAnimationTimer);
    boopAnimationTimer = setTimeout(() => cardCircle.classList.remove('boop-pop'), 200);
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
