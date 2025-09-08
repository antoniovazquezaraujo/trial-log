
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, onSnapshot, addDoc, doc, query, where, getDoc, setDoc, updateDoc, deleteField, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

        let db, auth, functions, userId, selectedGroupId;
        let userGroups = [];
        let allSongs = [];
        let allRehearsals = [];
        let songChart = null;
        let rehearsalSession = {};
        let unsubscribeGroups = null;
        let unsubscribeSongs = null;
        let unsubscribeRehearsals = null;
        let unsubscribeMembers = null;

        document.addEventListener('DOMContentLoaded', () => {
            const loginView = document.getElementById('login-view');
            const mainContainer = document.getElementById('main-container');
            const loginBtn = document.getElementById('login-btn');
            const logoutBtn = document.getElementById('logout-btn');
            const userNameEl = document.getElementById('user-name');
            const userEmailEl = document.getElementById('user-email');

            const mainView = document.getElementById('main-view');
            const groupsSection = document.getElementById('groups-section');
            const addGroupBtn = document.getElementById('add-group-btn');
            const groupSelector = document.getElementById('group-selector');
            
            const membersSection = document.getElementById('members-section');
            const addMemberBtn = document.getElementById('add-member-btn');
            const membersListView = document.getElementById('members-list-view');

            const songsSection = document.getElementById('songs-section');
            const addSongBtn = document.getElementById('add-song-btn');
            const songsList = document.getElementById('songs-list');

            const rehearsalsSection = document.getElementById('rehearsals-section');
            const addRehearsalBtn = document.getElementById('add-rehearsal-btn');
            const rehearsalsList = document.getElementById('rehearsals-list');

            // History View
            const songHistoryView = document.getElementById('song-history-view');
            const backToMainBtn = document.getElementById('back-to-main-btn');
            const historySongName = document.getElementById('history-song-name');
            const songLinksContainer = document.getElementById('song-links-container');
            const songHistoryList = document.getElementById('song-history-list');
            const songHistoryChartCtx = document.getElementById('song-history-chart').getContext('2d');

            // Create Rehearsal View
            const createRehearsalView = document.getElementById('create-rehearsal-view');
            const backToMainFromRehearsalBtn = document.getElementById('back-to-main-from-rehearsal-btn');
            const createRehearsalForm = document.getElementById('create-rehearsal-form');
            const rehearsalDateInput = document.getElementById('rehearsal-date');
            const rehearsalDurationInput = document.getElementById('rehearsal-duration');
            const rehearsalSongsList = document.getElementById('rehearsal-songs-list');

            // Rehearsal-in-progress View
            const rehearsalView = document.getElementById('rehearsal-view');
            const currentSongTitleEl = document.getElementById('current-song-title');
            const rehearsalSongLinksContainer = document.getElementById('rehearsal-song-links');
            const songTimerEl = document.getElementById('song-timer');
            const progressFillEl = document.getElementById('progress-fill');
            const totalTimeDisplayEl = document.getElementById('total-time-display');
            const currentSongRatingsListEl = document.getElementById('current-song-ratings-list');
            const currentSongAverageRatingEl = document.getElementById('current-song-average-rating');
            const nextSongBtn = document.getElementById('next-song-btn');
            const finishRehearsalBtn = document.getElementById('finish-rehearsal-btn');

            // Modals
            const addGroupModal = document.getElementById('add-group-modal');
            const addSongModal = document.getElementById('add-song-modal');
            const inviteMemberModal = document.getElementById('invite-member-modal');
            const editSongModal = document.getElementById('edit-song-modal');

            const addGroupForm = document.getElementById('add-group-form');
            const newGroupNameInput = document.getElementById('new-group-name');
            
            const addSongForm = document.getElementById('add-song-form');

            const editSongForm = document.getElementById('edit-song-form');
            const editSongIdInput = document.getElementById('edit-song-id');
            const editSongNameInput = document.getElementById('edit-song-name');
            const editSongVideoUrlInput = document.getElementById('edit-song-video-url');
            const editSongScoreUrlInput = document.getElementById('edit-song-score-url');

            const inviteMemberForm = document.getElementById('invite-member-form');

            function initFirebase() {
                fetch('/__/firebase/init.json').then(async response => {
                    const firebaseConfig = await response.json();
                    const app = initializeApp(firebaseConfig);
                    auth = getAuth(app);
                    db = getFirestore(app);
                    functions = getFunctions(app);

                    if (window.location.hostname === "localhost") {
                        connectAuthEmulator(auth, "http://localhost:9099");
                        connectFirestoreEmulator(db, "localhost", 8080);
                        connectFunctionsEmulator(functions, "localhost", 5001);
                    }

                    loginBtn.disabled = false;

                    onAuthStateChanged(auth, user => {
                        if (user) {
                            userId = user.uid;
                            loginView.classList.add('hidden');
                            mainContainer.classList.remove('hidden');
                            saveUserToFirestore(user);
                            loadGroups();
                            showMainView();
                        } else {
                            userId = null;
                            selectedGroupId = null;
                            loginView.classList.remove('hidden');
                            mainContainer.classList.add('hidden');
                            if(unsubscribeGroups) unsubscribeGroups();
                            if(unsubscribeSongs) unsubscribeSongs();
                            if(unsubscribeRehearsals) unsubscribeRehearsals();
                            if(unsubscribeMembers) unsubscribeMembers();
                        }
                    });
                });
            }

            async function saveUserToFirestore(user) {
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);
                if (!userDoc.exists()) {
                    await setDoc(userRef, {
                        name: user.displayName,
                        email: user.email,
                        createdAt: new Date()
                    });
                }
            }

            function showMainView() {
                if (songChart) {
                    songChart.destroy();
                    songChart = null;
                }
                mainView.classList.remove('hidden');
                songHistoryView.classList.add('hidden');
                createRehearsalView.classList.add('hidden');
                rehearsalView.classList.add('hidden');
                logoutBtn.classList.remove('hidden');
            }

            function showSongHistoryView(song) {
                mainView.classList.add('hidden');
                createRehearsalView.classList.add('hidden');
                rehearsalView.classList.add('hidden');
                songHistoryView.classList.remove('hidden');
                logoutBtn.classList.add('hidden');

                historySongName.textContent = song.name;
                songHistoryList.innerHTML = '';
                songLinksContainer.innerHTML = '';

                if (song.videoUrl) {
                    const videoLink = document.createElement('a');
                    videoLink.href = song.videoUrl;
                    videoLink.target = '_blank';
                    videoLink.className = 'bg-red-500 text-white font-bold py-2 px-4 rounded-xl hover:bg-red-600';
                    videoLink.textContent = 'Ver Video';
                    songLinksContainer.appendChild(videoLink);
                }

                if (song.scoreUrl) {
                    const scoreLink = document.createElement('a');
                    scoreLink.href = song.scoreUrl;
                    scoreLink.target = '_blank';
                    scoreLink.className = 'bg-blue-500 text-white font-bold py-2 px-4 rounded-xl hover:bg-blue-600';
                    scoreLink.textContent = 'Ver Partitura';
                    songLinksContainer.appendChild(scoreLink);
                }

                const relevantRehearsals = allRehearsals
                    .filter(r => r.songs && r.songs.some(s => s.name === song.name))
                    .sort((a, b) => new Date(a.date) - new Date(b.date));

                if (relevantRehearsals.length === 0) {
                    songHistoryList.innerHTML = '<p class="text-gray-500">No hay historial para este tema.</p>';
                    if (songChart) songChart.destroy();
                    return;
                }

                const chartLabels = [];
                const chartData = [];

                relevantRehearsals.forEach(rehearsal => {
                    const songInRehearsal = rehearsal.songs.find(s => s.name === song.name);
                    if (songInRehearsal) {
                        const average = calculateAverage(songInRehearsal.ratings || []);
                        const historyEl = document.createElement('div');
                        historyEl.className = 'p-3 bg-gray-100 rounded-lg';
                        historyEl.innerHTML = `
                            <p><strong>Fecha:</strong> ${rehearsal.date}</p>
                            <p><strong>Calificaciones:</strong> ${(songInRehearsal.ratings || []).join(', ')}</p>
                            <p><strong>Promedio:</strong> ${average}</p>
                        `;
                        songHistoryList.appendChild(historyEl);

                        if (average !== 'N/A') {
                            chartLabels.push(rehearsal.date);
                            chartData.push(parseFloat(average));
                        }
                    }
                });

                if (songChart) {
                    songChart.destroy();
                }

                songChart = new Chart(songHistoryChartCtx, {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Calificación Promedio',
                            data: chartData,
                            borderColor: 'rgb(79, 70, 229)',
                            backgroundColor: 'rgba(79, 70, 229, 0.2)',
                            tension: 0.2,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, max: 5 }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }

            function showCreateRehearsalView() {
                mainView.classList.add('hidden');
                songHistoryView.classList.add('hidden');
                rehearsalView.classList.add('hidden');
                createRehearsalView.classList.remove('hidden');
                logoutBtn.classList.add('hidden');

                rehearsalDateInput.valueAsDate = new Date();
                rehearsalSongsList.innerHTML = '';

                const songsWithAvg = allSongs.map(song => {
                    const allRatings = allRehearsals
                        .flatMap(r => r.songs || [])
                        .filter(s => s.name === song.name)
                        .flatMap(s => s.ratings || []);
                    const average = calculateAverage(allRatings);
                    return { ...song, average: average === 'N/A' ? -1 : parseFloat(average) };
                });

                const sortedSongs = songsWithAvg.sort((a, b) => a.average - b.average);

                if (sortedSongs.length === 0) {
                    rehearsalSongsList.innerHTML = '<p class="text-gray-500">No hay temas para seleccionar.</p>';
                    return;
                }

                sortedSongs.forEach(song => {
                    const avgDisplay = song.average === -1 ? 'N/A' : song.average.toFixed(2);
                    const songEl = document.createElement('div');
                    songEl.className = 'flex items-center';
                    songEl.innerHTML = `
                        <input type="checkbox" id="song-${song.id}" name="selected-songs" value='${JSON.stringify(song)}' class="h-4 w-4 text-indigo-600 border-gray-300 rounded">
                        <label for="song-${song.id}" class="ml-3 block text-sm font-medium text-gray-700">${song.name} (${avgDisplay})</label>
                    `;
                    rehearsalSongsList.appendChild(songEl);
                });
            }

            function showRehearsalView() {
                mainView.classList.add('hidden');
                songHistoryView.classList.add('hidden');
                createRehearsalView.classList.add('hidden');
                rehearsalView.classList.remove('hidden');
                logoutBtn.classList.add('hidden');
                startSongTimer();
            }

            function loadGroups() {
                if(unsubscribeGroups) unsubscribeGroups();
                const q = query(collection(db, "groups"), where(`members.${userId}`, 'in', ['admin', 'reader', 'creator']));
                unsubscribeGroups = onSnapshot(q, snapshot => {
                    userGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    groupSelector.innerHTML = '';
                    if (userGroups.length === 0) {
                        groupSelector.innerHTML = '<option>Crea un grupo para empezar</option>';
                        membersSection.classList.add('hidden');
                        songsSection.classList.add('hidden');
                        rehearsalsSection.classList.add('hidden');
                        selectedGroupId = null;
                        return;
                    }
                    userGroups.forEach(group => {
                        const option = document.createElement('option');
                        option.value = group.id;
                        option.textContent = group.name;
                        if (group.id === selectedGroupId) {
                            option.selected = true;
                        }
                        groupSelector.appendChild(option);
                    });
                    // If no group was selected, or selected group was deleted, select the first one
                    if (!selectedGroupId || !userGroups.some(g => g.id === selectedGroupId)) {
                        selectGroup(userGroups[0].id);
                    }
                });
            }

            function selectGroup(groupId) {
                selectedGroupId = groupId;
                groupSelector.value = groupId;

                membersSection.classList.remove('hidden');
                songsSection.classList.remove('hidden');
                rehearsalsSection.classList.remove('hidden');
                loadMembers();
                loadSongs();
                loadRehearsals();
            }

            async function loadMembers() {
                if(unsubscribeMembers) unsubscribeMembers();
                if (!selectedGroupId) return;

                unsubscribeMembers = onSnapshot(doc(db, "groups", selectedGroupId), async (groupDoc) => {
                    const group = groupDoc.data();
                    membersListView.innerHTML = '';
                    if (!group || !group.members) return;

                    const memberUIDs = Object.keys(group.members);
                    const userDocs = await Promise.all(memberUIDs.map(uid => getDoc(doc(db, 'users', uid))));
                    
                    userDocs.forEach(userDoc => {
                        if(userDoc.exists()) {
                            const member = { uid: userDoc.id, ...userDoc.data() };
                            const memberEl = document.createElement('div');
                            memberEl.className = 'flex items-center justify-between p-2 bg-gray-100 rounded-lg';
                            memberEl.innerHTML = `
                                <div>
                                    <p class="font-semibold">${member.name || member.email}</p>
                                    <p class="text-sm text-gray-500">${group.members[member.uid]}</p>
                                </div>
                                ${group.owner !== member.uid ? `<button data-uid="${member.uid}" class="remove-member-btn bg-red-500 text-white px-2 py-1 rounded text-sm">Eliminar</button>` : '<span class="text-sm text-gray-500">(Propietario)</span>'}
                            `;
                            membersListView.appendChild(memberEl);
                        }
                    });
                });
            }

            function calculateAverage(ratings) {
                if (!ratings || ratings.length === 0) return 'N/A';
                const sum = ratings.reduce((total, rating) => total + rating, 0);
                return (sum / ratings.length).toFixed(2);
            }

            function renderSongs() {
                songsList.innerHTML = '';
                if (allSongs.length === 0) {
                    songsList.innerHTML = '<p class="text-gray-500">No hay temas. Añade uno nuevo.</p>';
                    return;
                }

                const songsWithAverage = allSongs.map(song => {
                    const allRatingsForSong = allRehearsals
                        .flatMap(rehearsal => rehearsal.songs || [])
                        .filter(rehearsalSong => rehearsalSong.name === song.name)
                        .flatMap(rehearsalSong => rehearsalSong.ratings || []);
                    const average = calculateAverage(allRatingsForSong);
                    return { ...song, average: average === 'N/A' ? -1 : parseFloat(average) }; // Use -1 for N/A to sort them first
                });

                songsWithAverage.sort((a, b) => {
                    if (a.average === -1 && b.average !== -1) return -1; // N/A comes first
                    if (a.average !== -1 && b.average === -1) return 1;  // N/A comes first
                    return a.average - b.average; // Sort by average ascending
                });

                songsWithAverage.forEach(song => {
                    const avgDisplay = song.average === -1 ? 'N/A' : song.average.toFixed(2);
                    const songEl = document.createElement('div');
                    songEl.className = 'flex items-center justify-between p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-indigo-100';
                    songEl.innerHTML = `
                        <span class="font-semibold">${song.name}</span>
                        <div class="flex items-center space-x-2">
                            <span class="font-bold text-purple-600 text-lg w-16 text-right">${avgDisplay}</span>
                            <button class="edit-song-btn bg-blue-500 text-white p-1.5 rounded-full shadow-md transition-transform transform hover:scale-110 hover:bg-blue-600" data-id="${song.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                        </div>
                    `;
                    songEl.addEventListener('click', (e) => {
                        // Only show history if edit button was not clicked
                        if (!e.target.closest('.edit-song-btn')) {
                            showSongHistoryView(song);
                        }
                    });
                    songsList.appendChild(songEl);
                });
            }

            function showEditSongModal(songId) {
                const songToEdit = allSongs.find(song => song.id === songId);
                if (songToEdit) {
                    editSongIdInput.value = songToEdit.id;
                    editSongNameInput.value = songToEdit.name;
                    editSongVideoUrlInput.value = songToEdit.videoUrl || '';
                    editSongScoreUrlInput.value = songToEdit.scoreUrl || '';
                    editSongModal.style.display = 'flex';
                }
            }

            function loadSongs() {
                if(unsubscribeSongs) unsubscribeSongs();
                if (!selectedGroupId) return;
                unsubscribeSongs = onSnapshot(collection(db, `groups/${selectedGroupId}/songs`), snapshot => {
                    allSongs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderSongs();
                });
            }

            function loadRehearsals() {
                if(unsubscribeRehearsals) unsubscribeRehearsals();
                if (!selectedGroupId) return;
                unsubscribeRehearsals = onSnapshot(collection(db, `groups/${selectedGroupId}/rehearsals`), snapshot => {
                    allRehearsals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderSongs(); // Re-render songs when rehearsals change
                    rehearsalsList.innerHTML = '';
                    if (snapshot.empty) {
                        rehearsalsList.innerHTML = '<p class="text-gray-500">No hay ensayos. Crea uno nuevo.</p>';
                        return;
                    }
                    snapshot.docs.sort((a, b) => {
                        const timeA = a.data().createdAt?.toMillis() || 0;
                        const timeB = b.data().createdAt?.toMillis() || 0;
                        return timeB - timeA;
                    }).forEach(doc => {
                        const rehearsal = { id: doc.id, ...doc.data() };
                        const songNames = (rehearsal.songs || []).map(s => s.name).join(', ');
                        const rehearsalEl = document.createElement('div');
                        rehearsalEl.className = 'flex items-center justify-between p-3 bg-gray-100 rounded-lg';
                        rehearsalEl.innerHTML = `
                        <div>
                            <span class="font-semibold">Ensayo del ${rehearsal.date}</span>
                            <div class="text-sm text-gray-600">${songNames}</div>
                        </div>
                        <button data-id="${rehearsal.id}" class="delete-rehearsal-btn bg-red-500 text-white p-1.5 rounded-full shadow-md transition-transform transform hover:scale-110 hover:bg-red-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                        `;
                        rehearsalsList.appendChild(rehearsalEl);
                    });
                });
            }

            function formatTime(seconds) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = Math.round(seconds % 60);
                return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            }

            function startSongTimer() {
                if (rehearsalSession.timerInterval) {
                    clearInterval(rehearsalSession.timerInterval);
                }
                updateRehearsalDisplay();
                
                rehearsalSession.timerInterval = setInterval(() => {
                    rehearsalSession.songTimeRemaining--;
                    rehearsalSession.totalTimeElapsed++;
                    updateRehearsalDisplay();
                    
                    if (rehearsalSession.songTimeRemaining <= 0) {
                        clearInterval(rehearsalSession.timerInterval);
                    }
                }, 1000);
            }

            function updateRehearsalDisplay() {
                const currentSong = rehearsalSession.songs[rehearsalSession.currentSongIndex];
                currentSongTitleEl.innerText = currentSong.name;
                songTimerEl.innerText = formatTime(rehearsalSession.songTimeRemaining);
                totalTimeDisplayEl.innerText = `Tiempo total: ${formatTime(rehearsalSession.totalTimeElapsed)} / ${formatTime(rehearsalSession.duration * 60)}`;
                const progressPercentage = (rehearsalSession.songTimeAllotted - rehearsalSession.songTimeRemaining) / rehearsalSession.songTimeAllotted * 100;
                progressFillEl.style.width = `${Math.min(100, progressPercentage)}%`;
                renderRehearsalSongLinks(currentSong);
                renderCurrentSongRatings(currentSong.ratings);
            }

            function renderRehearsalSongLinks(song) {
                rehearsalSongLinksContainer.innerHTML = '';
                if (song.videoUrl) {
                    const videoLink = document.createElement('a');
                    videoLink.href = song.videoUrl; videoLink.target = '_blank';
                    videoLink.className = 'bg-red-500 text-white font-bold py-2 px-4 rounded-xl';
                    videoLink.textContent = 'Video';
                    rehearsalSongLinksContainer.appendChild(videoLink);
                }
                if (song.scoreUrl) {
                    const scoreLink = document.createElement('a');
                    scoreLink.href = song.scoreUrl; scoreLink.target = '_blank';
                    scoreLink.className = 'bg-blue-500 text-white font-bold py-2 px-4 rounded-xl';
                    scoreLink.textContent = 'Partitura';
                    rehearsalSongLinksContainer.appendChild(scoreLink);
                }
            }

            function renderCurrentSongRatings(ratings) {
                currentSongRatingsListEl.innerHTML = '';
                if (!ratings || ratings.length === 0) {
                    currentSongRatingsListEl.innerHTML = '<span class="text-gray-500">Sin calificaciones.</span>';
                } else {
                    ratings.forEach(rating => {
                        const ratingSpan = document.createElement('span');
                        ratingSpan.className = 'bg-gray-300 text-gray-800 font-bold px-3 py-1 rounded-full';
                        ratingSpan.innerText = rating;
                        currentSongRatingsListEl.appendChild(ratingSpan);
                    });
                }
                currentSongAverageRatingEl.innerText = `Promedio: ${calculateAverage(ratings)}`;
            }

            function nextSong() {
                clearInterval(rehearsalSession.timerInterval);
                rehearsalSession.currentSongIndex++;
                if (rehearsalSession.currentSongIndex >= rehearsalSession.songs.length) {
                    finishRehearsal();
                } else {
                    rehearsalSession.songTimeRemaining = rehearsalSession.songTimeAllotted;
                    startSongTimer();
                }
            }

            async function finishRehearsal() {
                clearInterval(rehearsalSession.timerInterval);
                if (!rehearsalSession.isActive) return;

                const rehearsalData = {
                    date: rehearsalSession.date,
                    duration: rehearsalSession.duration,
                    songs: rehearsalSession.songs,
                    createdAt: new Date(),
                    createdBy: userId
                };

                try {
                    await addDoc(collection(db, `groups/${selectedGroupId}/rehearsals`), rehearsalData);
                    alert("¡Ensayo guardado con éxito!");
                } catch (error) {
                    console.error("Error guardando el ensayo:", error);
                    alert(`Error al guardar el ensayo: ${error.message}`);
                }
                rehearsalSession.isActive = false;
                showMainView();
            }

            // Modal handling
            function setupModal(modal, openBtn) {
                const closeBtn = modal.querySelector('.close-button');
                if(openBtn) openBtn.addEventListener('click', () => modal.style.display = 'flex');
                closeBtn.addEventListener('click', () => modal.style.display = 'none');
                window.addEventListener('click', (e) => {
                    if (e.target === modal) modal.style.display = 'none';
                });
            }

            setupModal(addGroupModal, addGroupBtn);
            setupModal(addSongModal, addSongBtn);
            setupModal(inviteMemberModal, addMemberBtn);
            setupModal(editSongModal);

            // Form submissions
            addGroupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const groupName = newGroupNameInput.value.trim();
                if (groupName && userId) {
                    await addDoc(collection(db, 'groups'), {
                        name: groupName,
                        owner: userId,
                        createdAt: new Date(),
                        members: { [userId]: 'admin' }
                    });
                    newGroupNameInput.value = '';
                    addGroupModal.style.display = 'none';
                }
            });

            addSongForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const songName = document.getElementById('new-song-name').value.trim();
                const videoUrl = document.getElementById('new-song-video-url').value.trim();
                const scoreUrl = document.getElementById('new-song-score-url').value.trim();

                if (songName && selectedGroupId) {
                    await addDoc(collection(db, `groups/${selectedGroupId}/songs`), {
                        name: songName,
                        videoUrl: videoUrl,
                        scoreUrl: scoreUrl,
                        createdAt: new Date(),
                        createdBy: userId
                    });
                    addSongForm.reset();
                    addSongModal.style.display = 'none';
                }
            });

            editSongForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const songId = editSongIdInput.value;
                const songName = editSongNameInput.value.trim();
                const videoUrl = editSongVideoUrlInput.value.trim();
                const scoreUrl = editSongScoreUrlInput.value.trim();

                if (songId && songName && selectedGroupId) {
                    try {
                        await updateDoc(doc(db, `groups/${selectedGroupId}/songs`, songId), {
                            name: songName,
                            videoUrl: videoUrl,
                            scoreUrl: scoreUrl
                        });
                        alert('Tema actualizado con éxito!');
                        editSongModal.style.display = 'none';
                    } catch (error) {
                        console.error("Error actualizando el tema:", error);
                        alert(`Error al actualizar el tema: ${error.message}`);
                    }
                }
            });

            createRehearsalForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const date = rehearsalDateInput.value;
                const duration = rehearsalDurationInput.value;
                const selectedSongs = Array.from(document.querySelectorAll('input[name="selected-songs"]:checked'))
                                         .map(checkbox => JSON.parse(checkbox.value));

                if (!date || !duration || selectedSongs.length === 0) {
                    alert('Por favor, completa todos los campos y selecciona al menos un tema.');
                    return;
                }

                rehearsalSession = {
                    isActive: true,
                    date: date,
                    duration: parseInt(duration, 10),
                    songs: selectedSongs.map(s => ({ ...s, ratings: [] })),
                    currentSongIndex: 0,
                    songTimeAllotted: (parseInt(duration, 10) * 60) / selectedSongs.length,
                    songTimeRemaining: 0,
                    totalTimeElapsed: 0,
                    timerInterval: null
                };
                rehearsalSession.songTimeRemaining = rehearsalSession.songTimeAllotted;
                showRehearsalView();
            });

            inviteMemberForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('new-member-email').value.trim();
                const role = document.getElementById('new-member-role').value;
                const groupId = selectedGroupId;
                if (email && role && groupId) {
                    const inviteUser = httpsCallable(functions, 'inviteUserToGroup');
                    try {
                        const result = await inviteUser({ email, groupId, role });
                        alert(result.data.message);
                        document.getElementById('new-member-email').value = '';
                        inviteMemberModal.style.display = 'none';
                    } catch (error) {
                        console.error("Error al invitar usuario:", error);
                        alert(`Error: ${error.message}`);
                    }
                }
            });

            rehearsalsList.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.delete-rehearsal-btn');
                if (deleteBtn) {
                    const rehearsalId = deleteBtn.dataset.id;
                    if (confirm('¿Estás seguro de que quieres eliminar este ensayo?')) {
                        try {
                            await deleteDoc(doc(db, `groups/${selectedGroupId}/rehearsals`, rehearsalId));
                        } catch (error) {
                            console.error("Error eliminando el ensayo:", error);
                            alert(`Error al eliminar el ensayo: ${error.message}`);
                        }
                    }
                }
            });

            membersListView.addEventListener('click', async (e) => {
                const removeBtn = e.target.closest('.remove-member-btn');
                if(removeBtn) {
                    const memberUid = removeBtn.dataset.uid;
                    if (confirm('¿Estás seguro de que quieres eliminar a este miembro?')) {
                        const groupRef = doc(db, 'groups', selectedGroupId);
                        await updateDoc(groupRef, { [`members.${memberUid}`]: deleteField() });
                    }
                }
            });

            rehearsalView.addEventListener('click', (e) => {
                const ratingBtn = e.target.closest('.rating-btn');
                if (ratingBtn) {
                    const rating = parseInt(ratingBtn.dataset.rating, 10);
                    const currentSong = rehearsalSession.songs[rehearsalSession.currentSongIndex];
                    if (currentSong) {
                        if (!currentSong.ratings) {
                            currentSong.ratings = [];
                        }
                        currentSong.ratings.push(rating);
                        renderCurrentSongRatings(currentSong.ratings);
                    }
                }
            });

            rehearsalSongsList.addEventListener('click', (e) => {
                if (e.target.matches('input[type="checkbox"]')) {
                    const allCheckboxes = rehearsalSongsList.querySelectorAll('input[type="checkbox"]');
                    const currentIndex = Array.from(allCheckboxes).indexOf(e.target);

                    if (e.target.checked) {
                        for (let i = 0; i <= currentIndex; i++) {
                            allCheckboxes[i].checked = true;
                        }
                    } else {
                        for (let i = currentIndex; i < allCheckboxes.length; i++) {
                            allCheckboxes[i].checked = false;
                        }
                    }
                }
            });

            songsList.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.edit-song-btn');
                if (editBtn) {
                    const songId = editBtn.dataset.id;
                    showEditSongModal(songId);
                }
            });

            // Event listeners
            loginBtn.addEventListener('click', () => {
                const provider = new GoogleAuthProvider();
                signInWithPopup(auth, provider).catch(error => console.error("Login failed:", error));
            });

            logoutBtn.addEventListener('click', () => signOut(auth));
            backToMainBtn.addEventListener('click', showMainView);
            addRehearsalBtn.addEventListener('click', showCreateRehearsalView);
            backToMainFromRehearsalBtn.addEventListener('click', showMainView);
            nextSongBtn.addEventListener('click', nextSong);
            finishRehearsalBtn.addEventListener('click', finishRehearsal);
            addMemberBtn.addEventListener('click', () => inviteMemberModal.style.display = 'flex');
            groupSelector.addEventListener('change', (e) => selectGroup(e.target.value));

            document.querySelectorAll('.section-toggle-title').forEach(title => {
                title.addEventListener('click', (e) => {
                    let content = e.target.nextElementSibling;
                    if (e.target.parentElement.id === 'groups-section') {
                        content = document.getElementById('group-selection-container');
                    } else {
                        content = e.target.parentElement.parentElement.querySelector('div:last-child');
                    }
                    if(content) {
                        content.classList.toggle('hidden');
                    }
                });
            });

            initFirebase();
        });
    