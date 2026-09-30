// ==========================================================
// Références DOM
// ==========================================================
const cardCircle   = document.getElementById('cardCircle');
const cardContainer = document.getElementById('cardContainer');
const circleImg    = document.getElementById('circleImg');
const views        = document.querySelectorAll('.view');
const pseudoDialog = document.getElementById('pseudoDialog');
const pseudoForm   = document.getElementById('pseudoForm');
const pseudoInput  = document.getElementById('pseudoInput');
const pseudoCancel = document.getElementById('pseudoCancel');
const guideButtons = document.querySelectorAll('.swipe-guide-button');
const guideIcons   = document.querySelectorAll('.swipe-guide-button .swipe-guide-icon');
const guideHand    = document.getElementById('swipeGuideHand');
const guideText    = document.getElementById('swipeGuideText');
const instagramLink = document.getElementById('instagramLink');
const boopPhotoInstruction = document.getElementById('boopPhotoInstruction');
const defaultBoopInstruction = boopPhotoInstruction.textContent;
const boopThankYouMessages = [
    '🐾 Merci pour ton boop !',
    '💙 Merci pour ton passage !',
    '🐺 Merci d\'avoir laissé une trace !',
    '✨ Ton boop a bien été enregistré !',
    '🐾 Museau touché avec succès !',
    '💙 Skyzer apprécie cette attention !',
    '📸 Ravi de t\'avoir rencontré !',
    '🐾 Au plaisir de te recroiser en convention !',
    '💙 Merci pour cette belle rencontre !',
    '🐺 Heureux de t\'avoir croisé aujourd\'hui !'
];
let lastBoopThankYouIndex = -1;
let boopThankYouTimer = null;

let currentView = 0;

instagramLink.addEventListener('click', event => {
    if (!/Android/i.test(navigator.userAgent)) return;

    event.preventDefault();
    window.location.href = 'instagram://user?username=skyzer60';
});

guideButtons.forEach(button => {
    button.addEventListener('click', () => {
        const index = Number(button.dataset.guide);
        if (index === 1) loadFirebase();
        goToView(index);
    });
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

// ==========================================================
// Navigation swipe / flip (indépendant de Firebase)
// ==========================================================
function goToView(index) {
    if (index === currentView) return;
    cardCircle.classList.add('flipping');

    setTimeout(() => {
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
    if (typeof navigator.vibrate === 'function') navigator.vibrate(60);
    const pseudo = getStoredPseudo();
    if (pseudo) {
        registerBoopTap(pseudo);
    } else {
        if (!pseudoDialog.open) pseudoDialog.showModal();
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
let firebasePromise = null;
const boopTablePanel = document.getElementById('boopTablePanel');
const boopTableLoading = document.getElementById('boopTableLoading');
const boopTable = document.getElementById('boopTable');
const boopTableCaption = document.getElementById('boopTableCaption');
const boopTableHead = document.getElementById('boopTableHead');
const boopTableBody = document.getElementById('boopTableBody');
const lastBoopsTab = document.getElementById('lastBoopsTab');
const topBoopersTab = document.getElementById('topBoopersTab');
const boopersListLink = document.getElementById('boopersListLink');
const boopersListPanel = document.getElementById('boopersList');
const boopersListItems = document.getElementById('boopersListItems');
const boopTables = { recent: [], top: [] };
let activeBoopTable = 'recent';
let pendingBoopDisplay = null;
let lastBoopsSnapshotReady = false;
let boopLoadingTimer = null;
let allBoopersUnsubscribe = null;

function renderAllBoopers(snapshot) {
    const pseudos = snapshot.docs
        .map(doc => doc.data().pseudo)
        .filter(pseudo => typeof pseudo === 'string' && pseudo.trim())
        .sort((first, second) => first.localeCompare(second, 'fr', { sensitivity: 'base' }));

    boopersListItems.replaceChildren();
    if (pseudos.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = 'Personne pour le moment.';
        boopersListItems.appendChild(emptyItem);
        return;
    }

    pseudos.forEach(pseudo => {
        const item = document.createElement('li');
        item.textContent = pseudo;
        boopersListItems.appendChild(item);
    });
}

boopersListLink.addEventListener('click', async event => {
    event.preventDefault();
    const isExpanded = boopersListLink.getAttribute('aria-expanded') === 'true';
    boopersListLink.setAttribute('aria-expanded', String(!isExpanded));
    boopersListPanel.hidden = isExpanded;
    boopersListLink.textContent = isExpanded ? 'Voir tous les boopeurs' : 'Masquer la liste';

    if (allBoopersUnsubscribe) {
        allBoopersUnsubscribe();
        allBoopersUnsubscribe = null;
    }
    if (isExpanded) return;

    boopersListItems.replaceChildren();
    const loadingItem = document.createElement('li');
    loadingItem.textContent = 'Chargement…';
    boopersListItems.appendChild(loadingItem);
    const activeDb = db || await loadFirebase();
    if (!activeDb) {
        loadingItem.textContent = 'Liste indisponible pour le moment.';
        return;
    }

    allBoopersUnsubscribe = activeDb.collection('boopers').onSnapshot(renderAllBoopers, error => {
        console.error('Erreur lors du chargement de la liste des boopeurs :', error);
        boopersListItems.replaceChildren();
        const errorItem = document.createElement('li');
        errorItem.textContent = 'Liste indisponible pour le moment.';
        boopersListItems.appendChild(errorItem);
        allBoopersUnsubscribe = null;
    });
});

function setBoopLoading(isLoading, pseudo = null) {
    pendingBoopDisplay = isLoading ? pseudo : null;
    boopTablePanel.classList.toggle('is-loading', isLoading);
    boopTablePanel.setAttribute('aria-busy', String(isLoading));
    boopTableLoading.hidden = !isLoading;

    clearTimeout(boopLoadingTimer);
    if (isLoading) {
        boopLoadingTimer = setTimeout(() => setBoopLoading(false), 12000);
    }
}

function renderBoopTable() {
    const isRecent = activeBoopTable === 'recent';
    const headers = isRecent ? ['Pseudo', ''] : ['Pseudo', 'Boops'];
    const records = boopTables[activeBoopTable];
    const headerRow = document.createElement('tr');

    boopTableCaption.textContent = isRecent ? 'Derniers boops' : 'Top boopeurs';
    headers.forEach(label => {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        headerRow.appendChild(cell);
    });
    boopTableHead.replaceChildren(headerRow);
    boopTableBody.replaceChildren();
    boopTable.classList.toggle('last-boops-table', isRecent);
    boopTable.classList.toggle('top-boopers-table', !isRecent);

    records.forEach(data => {
        const row = document.createElement('tr');
        const pseudoCell = document.createElement('td');
        pseudoCell.textContent = data.pseudo;
        row.appendChild(pseudoCell);

        const detailCell = document.createElement('td');
        if (isRecent) {
            detailCell.appendChild(createBoopAge(data.lastBoopAt));
        } else {
            detailCell.textContent = data.count;
        }
        row.appendChild(detailCell);
        boopTableBody.appendChild(row);
    });
}

function selectBoopTable(table) {
    activeBoopTable = table;
    lastBoopsTab.classList.toggle('active', table === 'recent');
    lastBoopsTab.setAttribute('aria-pressed', String(table === 'recent'));
    topBoopersTab.classList.toggle('active', table === 'top');
    topBoopersTab.setAttribute('aria-pressed', String(table === 'top'));
    renderBoopTable();
}

lastBoopsTab.addEventListener('click', () => selectBoopTable('recent'));
topBoopersTab.addEventListener('click', () => selectBoopTable('top'));

const relativeBoopTime = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto', style: 'short' });

function timestampToDate(timestamp) {
    if (timestamp && typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'number') return new Date(timestamp);
    return null;
}

function formatRelativeBoopTime(timestamp) {
    const elapsedSeconds = (timestamp - Date.now()) / 1000;
    const elapsed = Math.abs(elapsedSeconds);
    const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1]
    ];
    const [unit, secondsPerUnit] = units.find(([, seconds]) => elapsed >= seconds) || units.at(-1);
    return relativeBoopTime.format(Math.round(elapsedSeconds / secondsPerUnit), unit);
}

function createBoopAge(timestamp) {
    const time = document.createElement('time');
    time.className = 'boop-age';
    const date = timestampToDate(timestamp);

    if (!date || Number.isNaN(date.getTime())) {
        time.textContent = 'À l’instant';
        return time;
    }

    time.dateTime = date.toISOString();
    time.dataset.timestamp = String(date.getTime());
    time.title = date.toLocaleString('fr-FR');
    time.textContent = formatRelativeBoopTime(date.getTime());
    return time;
}

function refreshRelativeBoopTimes() {
    document.querySelectorAll('.boop-age[data-timestamp]').forEach(time => {
        time.textContent = formatRelativeBoopTime(Number(time.dataset.timestamp));
    });
}

function initializeFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyAHGeMyMgza1FsJ6fBbdXl2k6VZ_n_Z6dc",
        authDomain: "skyzez-boop.firebaseapp.com",
        projectId: "skyzez-boop",
        storageBucket: "skyzez-boop.firebasestorage.app",
        messagingSenderId: "586663843005",
        appId: "1:586663843005:web:7d372cc6d02c1729de13d4"
    };

    if (firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // Affichage temps réel des derniers boops (une seule ligne par personne, la plus récente en premier)
    db.collection('boopers').orderBy('lastBoopAt', 'desc').limit(5)
        .onSnapshot(snapshot => {
            boopTables.recent = snapshot.docs.map(doc => doc.data());
            if (activeBoopTable === 'recent') renderBoopTable();

            const pendingBoopUpdated = lastBoopsSnapshotReady && pendingBoopDisplay
                && snapshot.docChanges().some(change =>
                    change.doc.data().pseudo === pendingBoopDisplay
                    && (change.type === 'added' || change.type === 'modified')
                );
            lastBoopsSnapshotReady = true;
            if (pendingBoopUpdated) setBoopLoading(false);
        });

    // Affichage temps réel du classement des meilleurs boopeurs
    db.collection('boopers').orderBy('count', 'desc').limit(5)
        .onSnapshot(snapshot => {
            boopTables.top = snapshot.docs.map(doc => doc.data());
            if (activeBoopTable === 'top') renderBoopTable();
        });

}

function loadFirebaseScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
        document.head.appendChild(script);
    });
}

function loadFirebase() {
    if (db) return Promise.resolve(db);
    if (firebasePromise) return firebasePromise;

    firebasePromise = loadFirebaseScript('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js')
        .then(() => loadFirebaseScript('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js'))
        .then(() => {
            try {
                initializeFirebase();
                return db;
            } catch (error) {
                console.error('Erreur Firebase (le swipe et le tap fonctionnent quand même) :', error);
                return null;
            }
        })
        .catch(error => {
            console.error('Erreur Firebase (le swipe et le tap fonctionnent quand même) :', error);
            firebasePromise = null;
            return null;
        });

    return firebasePromise;
}

// ==========================================================
// Boop (feedback instantané à chaque tap, écriture Firebase
// regroupée une fois la rafale de taps terminée)
// ==========================================================
pseudoForm.addEventListener('submit', event => {
    event.preventDefault();
    const val = pseudoInput.value.trim();
    if (!val) {
        pseudoInput.value = '';
        pseudoInput.reportValidity();
        return;
    }
    localStorage.setItem('skyzer_pseudo', val);
    pseudoDialog.close();
    registerBoopTap(val);
});

pseudoCancel.addEventListener('click', () => pseudoDialog.close());

let pendingBoopCount = 0;
let flushTimer = null;
let boopAnimationTimer = null;
const FLUSH_DELAY = 1200; // ms de pause après le dernier tap avant d'envoyer à Firebase
const DAILY_BOOP_LIMIT = 10;

function registerBoopTap(pseudo) {
    pendingBoopCount++;
    showBoopThankYou();
    setBoopLoading(true, pseudo);

    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushBoops(pseudo), FLUSH_DELAY);
}

function showBoopThankYou() {
    let messageIndex = Math.floor(Math.random() * boopThankYouMessages.length);
    if (messageIndex === lastBoopThankYouIndex) {
        messageIndex = (messageIndex + 1 + Math.floor(Math.random() * (boopThankYouMessages.length - 1)))
            % boopThankYouMessages.length;
    }

    lastBoopThankYouIndex = messageIndex;
    boopPhotoInstruction.textContent = boopThankYouMessages[messageIndex];
    boopPhotoInstruction.classList.remove('message-pop');
    void boopPhotoInstruction.offsetWidth;
    boopPhotoInstruction.classList.add('message-pop');

    clearTimeout(boopThankYouTimer);
    boopThankYouTimer = setTimeout(() => {
        boopPhotoInstruction.textContent = defaultBoopInstruction;
        boopPhotoInstruction.classList.remove('message-pop');
    }, 15000);
}

function showBoopLimitMessage() {
    boopPhotoInstruction.textContent = 'Tu as atteint la limite de 10 boops pour aujourd’hui.';
    boopPhotoInstruction.classList.remove('message-pop');
    void boopPhotoInstruction.offsetWidth;
    boopPhotoInstruction.classList.add('message-pop');

    clearTimeout(boopThankYouTimer);
    boopThankYouTimer = setTimeout(() => {
        boopPhotoInstruction.textContent = defaultBoopInstruction;
        boopPhotoInstruction.classList.remove('message-pop');
    }, 5000);
}

function playBoopAnimation() {
    cardCircle.classList.remove('boop-pop');
    void cardCircle.offsetWidth; // force le navigateur à "relancer" l'animation même si elle tourne déjà
    cardCircle.classList.add('boop-pop');
    clearTimeout(boopAnimationTimer);
    boopAnimationTimer = setTimeout(() => cardCircle.classList.remove('boop-pop'), 650);
}

async function flushBoops(pseudo) {
    const countToSend = pendingBoopCount;
    pendingBoopCount = 0;
    if (countToSend === 0) return;

    const cleanPseudo = pseudo.trim().slice(0, 20);
    if (!cleanPseudo) return;

    if (!db) db = await loadFirebase();
    if (!db) {
        console.warn('Firebase non configuré : les boops ne sont pas enregistrés.');
        setBoopLoading(false);
        return;
    }

    const now = new Date();
    const dailyYear = now.getUTCFullYear();
    const dailyMonth = now.getUTCMonth() + 1;
    const dailyDay = now.getUTCDate();
    const booperRef = db.collection('boopers').doc(cleanPseudo);
    const boopLogRef = db.collection('boops').doc();

    db.runTransaction(async (t) => {
        const doc = await t.get(booperRef);
        const data = doc.exists ? doc.data() : {};
        const sameDay = data.dailyYear === dailyYear
            && data.dailyMonth === dailyMonth
            && data.dailyDay === dailyDay;
        const dailyCount = sameDay ? Number(data.dailyCount) || 0 : 0;
        const acceptedCount = Math.min(countToSend, Math.max(0, DAILY_BOOP_LIMIT - dailyCount));
        if (acceptedCount === 0) return 0;

        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const updatedBooper = {
            pseudo: cleanPseudo,
            count: (Number(data.count) || 0) + acceptedCount,
            dailyYear,
            dailyMonth,
            dailyDay,
            dailyCount: dailyCount + acceptedCount,
            lastBoopAt: timestamp
        };

        if (doc.exists) {
            t.update(booperRef, updatedBooper);
        } else {
            t.set(booperRef, updatedBooper);
        }
        t.set(boopLogRef, {
            pseudo: cleanPseudo,
            count: acceptedCount,
            timestamp
        });
        return acceptedCount;
    }).then(acceptedCount => {
        setBoopLoading(false);
        if (acceptedCount < countToSend) showBoopLimitMessage();
    }).catch(err => {
        console.error('Erreur lors de l’enregistrement du boop :', err);
        setBoopLoading(false);
    });
}

// ==========================================================
// Trajectoires de pas du loup en arrière-plan
// ==========================================================
function startPawTrailEffect() {
    const pawLayer = document.getElementById('pawTrails');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stepDelay = 220;
    const appearanceDuration = 520;
    const restingDuration = 2800;
    const fadeDuration = 400;
    let nextTrailTimer;
    let removeTrailTimer;
    let previousTrailCenter = null;

    if (!pawLayer || reducedMotion.matches) return;

    // Crée une trajectoire courbe, puis vérifie que chaque patte reste loin du contenu.
    function findTrail(count) {
        const pawSize = parseFloat(getComputedStyle(pawLayer).getPropertyValue('--paw-size')) || 26;
        const stepSpacing = Math.min(pawSize * 1.55, 52);
        const sideOffset = pawSize * 0.25;
        const protectedElements = cardContainer.querySelectorAll('h1, p, a, button, input, img, table');
        const protectedRects = Array.from(protectedElements)
            .filter(element => element.getClientRects().length > 0)
            .map(element => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left - 6, top: rect.top - 6, right: rect.right + 6, bottom: rect.bottom + 6 };
            });
        const edgeMargin = pawSize;
        const pawClearance = pawSize * 0.72 + 6;

        for (let attempt = 0; attempt < 220; attempt++) {
            let heading = Math.random() * Math.PI * 2;
            const curve = (Math.random() - 0.5) * 0.045;
            let pathX = 0;
            let pathY = 0;
            const points = [];

            for (let index = 0; index < count; index++) {
                if (index > 0) {
                    heading += curve;
                    pathX += Math.cos(heading) * stepSpacing;
                    pathY += Math.sin(heading) * stepSpacing;
                }

                const side = index % 2 === 0 ? -1 : 1;
                const perpendicular = heading + Math.PI / 2;
                points.push({
                    x: pathX + Math.cos(perpendicular) * side * sideOffset,
                    y: pathY + Math.sin(perpendicular) * side * sideOffset,
                    rotation: `${heading * 180 / Math.PI + 90 + side * 3}deg`
                });
            }

            const minX = Math.min(...points.map(point => point.x));
            const maxX = Math.max(...points.map(point => point.x));
            const minY = Math.min(...points.map(point => point.y));
            const maxY = Math.max(...points.map(point => point.y));
            const minLeft = edgeMargin - minX;
            const maxLeft = window.innerWidth - edgeMargin - maxX;
            const minTop = edgeMargin - minY;
            const maxTop = window.innerHeight - edgeMargin - maxY;

            if (minLeft > maxLeft || minTop > maxTop) continue;

            const left = minLeft + Math.random() * (maxLeft - minLeft);
            const top = minTop + Math.random() * (maxTop - minTop);
            const placedPoints = points.map(point => ({ ...point, x: left + point.x, y: top + point.y }));
            const center = placedPoints.reduce((result, point) => ({ x: result.x + point.x / count, y: result.y + point.y / count }), { x: 0, y: 0 });
            const minimumTravel = Math.min(360, Math.hypot(window.innerWidth, window.innerHeight) * 0.3);
            if (previousTrailCenter && Math.hypot(center.x - previousTrailCenter.x, center.y - previousTrailCenter.y) < minimumTravel) {
                continue;
            }

            const overlapsContent = placedPoints.some(point => protectedRects.some(rect =>
                point.x - pawClearance < rect.right && point.x + pawClearance > rect.left &&
                point.y - pawClearance < rect.bottom && point.y + pawClearance > rect.top
            ));

            if (!overlapsContent) return { points: placedPoints, center };
        }

        return null;
    }

    // Une seule série existe à la fois; ses pas sont ajoutés dans l'ordre de marche.
    function createTrail() {
        const count = 4 + Math.floor(Math.random() * 7);
        const placement = findTrail(count);
        if (!placement) return false;
        previousTrailCenter = placement.center;

        const trail = document.createElement('div');
        trail.className = 'paw-trail';

        placement.points.forEach((point, index) => {
            const paw = document.createElement('span');
            paw.className = 'paw-print';
            paw.style.left = `${point.x}px`;
            paw.style.top = `${point.y}px`;
            paw.style.setProperty('--paw-rotation', point.rotation);
            paw.style.setProperty('--paw-opacity', `${0.1 + Math.random() * 0.08}`);
            paw.style.setProperty('--step-delay', `${index * stepDelay}ms`);
            paw.style.setProperty('--fade-delay', `${index * fadeDuration}ms`);
            trail.appendChild(paw);
        });

        pawLayer.appendChild(trail);
        const trailDuration = (count - 1) * stepDelay + appearanceDuration + restingDuration;
        removeTrailTimer = setTimeout(() => {
            trail.classList.add('is-fading');
            removeTrailTimer = setTimeout(() => {
                trail.remove();
                scheduleNextTrail(0);
            }, count * fadeDuration);
        }, trailDuration);

        return true;
    }

    function scheduleNextTrail(delay = 1200) {
        clearTimeout(nextTrailTimer);
        if (document.hidden || reducedMotion.matches) return;
        nextTrailTimer = setTimeout(() => {
            if (!createTrail()) scheduleNextTrail(100);
        }, delay);
    }

    // Met en pause le décor dans les onglets cachés et respecte la réduction des animations.
    function resetTrailEffect() {
        clearTimeout(nextTrailTimer);
        clearTimeout(removeTrailTimer);
        pawLayer.replaceChildren();
        if (!document.hidden && !reducedMotion.matches) scheduleNextTrail();
    }

    document.addEventListener('visibilitychange', resetTrailEffect);
    reducedMotion.addEventListener?.('change', resetTrailEffect);
    scheduleNextTrail();
}

startPawTrailEffect();

setInterval(refreshRelativeBoopTimes, 60000);
