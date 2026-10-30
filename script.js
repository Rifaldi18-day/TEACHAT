// PALET WARNA UTAMA FRUTIGER AERO
const frutigerAeroPalette = {
  skyBlue: '#00A8E8',       // Biru langit cerah khas Windows Aero
  auroraTeal: '#00C9A7',     // Biru kehijauan / teal yang menyala
  ecoGreen: '#4E9F3D',       // Hijau daun segar (representasi alam)
  brightLime: '#99B898',     // Hijau limau lembut untuk aksen gradasi
  glassWhite: '#FFFFFFB3',   // Putih transparan (efek kaca/glassmorphism)
  deepWater: '#1A374D'       // Biru tua gelap untuk kontras/teks
};

// HYBRID SOCKET HANDLER (Real-Time Server + Offline Fallback)
function createFallbackSocket() {
    const listeners = {};
    const localUsers = {};
    const localGroups = {};
    const localChats = [];

    return {
        on(event, handler) {
            listeners[event] = handler;
        },
        emit(event, data, callback) {
            if (typeof callback !== 'function') callback = () => {};
            
            if (event === 'signup') {
                const u = (data.username || '').trim();
                const p = (data.password || '').trim();
                if (!u || !p) return callback({ success: false, message: 'Username & Password wajib diisi!' });
                if (localUsers[u]) return callback({ success: false, message: 'username sudah digunakan' });
                localUsers[u] = { username: u, password: p, avatar: null, bio: 'Halo! Aku pakai TEACHAT!', friends: [], friendRequests: [] };
                return callback({ success: true, message: 'Pendaftaran berhasil! Silakan Login.' });
            }
            if (event === 'login' || event === 'auto_login') {
                const u = (data.username || '').trim();
                const p = (data.password || '').trim();
                if (!localUsers[u]) return callback({ success: false, message: 'Akun mu tidak ditemukan!' });
                if (event === 'login' && localUsers[u].password !== p) return callback({ success: false, message: 'Password salah!' });
                return callback({
                    success: true,
                    username: u,
                    avatar: localUsers[u].avatar,
                    bio: localUsers[u].bio,
                    friends: localUsers[u].friends,
                    friendRequests: localUsers[u].friendRequests,
                    groups: Object.values(localGroups).filter(g => g.members.includes(u)),
                    profilesMap: {},
                    chatsHistory: localChats
                });
            }
            if (event === 'search_users') {
                const search = (data.search || '').toLowerCase();
                const currentUser = data.currentUser;
                const results = Object.keys(localUsers)
                    .filter(u => u !== currentUser && (search === '' || u.toLowerCase().includes(search)))
                    .map(u => ({
                        username: u,
                        avatar: localUsers[u].avatar,
                        bio: localUsers[u].bio,
                        isFriend: localUsers[currentUser]?.friends.includes(u) || false,
                        isPending: localUsers[u]?.friendRequests.includes(currentUser) || false
                    }));
                return callback({ success: true, users: results });
            }
            if (event === 'send_friend_request') {
                const { from, to } = data;
                if (!localUsers[to]) return callback({ success: false, message: 'Pengguna tidak ditemukan' });
                if (!localUsers[to].friendRequests.includes(from)) localUsers[to].friendRequests.push(from);
                return callback({ success: true, message: `Permintaan kenalan dikirim ke ${to}` });
            }
            if (event === 'respond_friend_request') {
                const { currentUser, targetUser, accept } = data;
                const idx = localUsers[currentUser]?.friendRequests.indexOf(targetUser);
                if (idx !== undefined && idx !== -1) localUsers[currentUser].friendRequests.splice(idx, 1);
                if (accept) {
                    if (!localUsers[currentUser].friends.includes(targetUser)) localUsers[currentUser].friends.push(targetUser);
                    if (localUsers[targetUser] && !localUsers[targetUser].friends.includes(currentUser)) localUsers[targetUser].friends.push(currentUser);
                }
                return callback({ success: true, message: accept ? `Sekarang berteman dengan ${targetUser}` : 'Permintaan ditolak' });
            }
            if (event === 'unfriend') {
                const { currentUser, targetUser } = data;
                if (localUsers[currentUser]?.friends) {
                    const i1 = localUsers[currentUser].friends.indexOf(targetUser);
                    if (i1 !== -1) localUsers[currentUser].friends.splice(i1, 1);
                }
                if (localUsers[targetUser]?.friends) {
                    const i2 = localUsers[targetUser].friends.indexOf(currentUser);
                    if (i2 !== -1) localUsers[targetUser].friends.splice(i2, 1);
                }
                return callback({ success: true });
            }
            if (event === 'create_group') {
                const gId = 'GRP_' + Date.now();
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                const members = [data.creator, ...(data.initialMembers || [])];
                localGroups[gId] = { id: gId, name: data.groupName || 'Grup Chat', avatar: null, description: data.description || '', creator: data.creator, code, members };
                const sysMsg = { id: 'SYS_' + Date.now(), sender: 'System', target: gId, text: `${data.creator} telah membuat grup "${data.groupName}"`, type: 'group', isSystem: true, timestamp: Date.now(), readBy: members };
                localChats.push(sysMsg);
                return callback({ success: true, group: localGroups[gId] });
            }
            if (event === 'check_group_code') {
                const code = (data.code || '').trim();
                const grp = Object.values(localGroups).find(g => g.code === code);
                if (!grp) return callback({ success: false, message: 'Kode yang dimasukkan tidak cocok!' });
                return callback({ success: true, group: grp });
            }
            if (event === 'confirm_join_group') {
                const grp = localGroups[data.groupId];
                if (!grp) return callback({ success: false, message: 'Grup tidak ditemukan!' });
                if (!grp.members.includes(data.username)) grp.members.push(data.username);
                return callback({ success: true, group: grp });
            }
            if (event === 'send_message') {
                const msg = { ...data, timestamp: Date.now(), readBy: [data.sender] };
                localChats.push(msg);
                if (listeners['receive_message']) listeners['receive_message'](msg);
            }
            if (event === 'mark_as_read') {
                localChats.forEach(m => {
                    if (!m.readBy.includes(data.reader)) m.readBy.push(data.reader);
                });
            }
            if (event === 'update_profile') {
                if (localUsers[data.username]) {
                    if (data.avatar !== undefined) localUsers[data.username].avatar = data.avatar;
                    if (data.bio !== undefined) localUsers[data.username].bio = data.bio;
                }
                return callback({ success: true, avatar: data.avatar, bio: data.bio });
            }
            if (event === 'edit_group') {
                if (localGroups[data.groupId]) {
                    if (data.groupName) localGroups[data.groupId].name = data.groupName;
                    if (data.description !== undefined) localGroups[data.groupId].description = data.description;
                    if (data.groupAvatar !== undefined) localGroups[data.groupId].avatar = data.groupAvatar;
                }
                return callback({ success: true, group: localGroups[data.groupId] });
            }
            if (event === 'add_members_to_group') {
                const grp = localGroups[data.groupId];
                if (grp && Array.isArray(data.newMembers)) {
                    data.newMembers.forEach(m => { if (!grp.members.includes(m)) grp.members.push(m); });
                }
                return callback({ success: true, group: grp });
            }
            if (event === 'leave_group') {
                const grp = localGroups[data.groupId];
                if (grp) grp.members = grp.members.filter(m => m !== data.username);
                return callback({ success: true });
            }
        }
    };
}

let socket;
if (typeof io === 'function') {
    try {
        socket = io();
    } catch(e) {
        socket = createFallbackSocket();
    }
} else {
    socket = createFallbackSocket();
}

let currentUser = sessionStorage.getItem('teachat_active_user') || null;
let currentUserAvatar = sessionStorage.getItem('teachat_user_avatar') || null;
let currentUserBio = sessionStorage.getItem('teachat_user_bio') || 'Halo! Aku pakai TEACHAT!';

let activeChatTarget = null; // { type: 'private'|'group', target: string }
let currentAuthMode = 'login'; // 'login' | 'signup'

let myFriends = [];
let myFriendRequests = [];
let myGroups = [];
let myMessages = [];

let userAvatarsMap = {}; 
let userBiosMap = {};
let groupDataMap = {};   
let tempAvatarBase64 = null;
let pendingJoinGroupTarget = null;
let typingTimeout = null;

// STATE KAMERA WEBRTC LIVE STREAM
let cameraStream = null;
let currentFacingMode = 'user'; // 'user' (depan) | 'environment' (belakang)
let capturedCameraImageBase64 = null;

// ROOMCHAT WALLPAPER STORAGE MAP: { targetId: wallpaperUrl }
let roomWallpapers = {};
try {
    const savedWp = localStorage.getItem('teachat_room_wallpapers');
    if (savedWp) roomWallpapers = JSON.parse(savedWp);
} catch(e) { roomWallpapers = {}; }

function saveRoomWallpapers() {
    try { localStorage.setItem('teachat_room_wallpapers', JSON.stringify(roomWallpapers)); } catch(e) {}
}

// PERSONAL PINNED CHATS STORAGE (PER USER)
let pinnedChats = [];

function loadUserPinnedChats() {
    if (!currentUser) { pinnedChats = []; return; }
    try {
        const savedPins = localStorage.getItem(`teachat_pinned_chats_${currentUser}`);
        pinnedChats = savedPins ? JSON.parse(savedPins) : [];
    } catch(e) { pinnedChats = []; }
}

function saveUserPinnedChats() {
    if (!currentUser) return;
    try {
        localStorage.setItem(`teachat_pinned_chats_${currentUser}`, JSON.stringify(pinnedChats));
    } catch(e) {}
}

function togglePinChat(targetId, event) {
    if (event) event.stopPropagation();

    const idx = pinnedChats.indexOf(targetId);
    if (idx !== -1) {
        pinnedChats.splice(idx, 1);
    } else {
        if (pinnedChats.length >= 3) {
            alert('Maksimal 3 roomchat yang bisa di-pin!');
            return;
        }
        pinnedChats.unshift(targetId);
    }

    saveUserPinnedChats();
    renderChatList();
    if (activeChatTarget && activeChatTarget.target === targetId) {
        updatePinMenuText();
    }
}

function togglePinCurrentRoom() {
    if (!activeChatTarget) return;
    togglePinChat(activeChatTarget.target, null);
    togglePrivateDropdown();
    toggleGroupDropdown();
}

function updatePinMenuText() {
    if (!activeChatTarget) return;
    const isPinned = pinnedChats.includes(activeChatTarget.target);
    const privText = document.getElementById('pinPrivateMenuText');
    const grpText = document.getElementById('pinGroupMenuText');
    if (privText) privText.innerText = isPinned ? 'Unpin Obrolan Ini' : 'Pin Obrolan Ini';
    if (grpText) grpText.innerText = isPinned ? 'Unpin Grup Ini' : 'Pin Grup Ini';
}

// PALET WARNA BUBBLE CHAT UNIK ANGGOTA GRUP DARI FRUTIGER AERO PALETTE
const grpColorClasses = [
    'chat-bubble-grp-sky',
    'chat-bubble-grp-teal',
    'chat-bubble-grp-green',
    'chat-bubble-grp-lime'
];

function getMemberColorClass(senderName) {
    let hash = 0;
    for (let i = 0; i < senderName.length; i++) {
        hash = senderName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % grpColorClasses.length;
    return grpColorClasses[index];
}

// Jam Digital Live
setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (timeEl) timeEl.innerText = timeStr;
    if (dateEl) dateEl.innerText = dateStr;
}, 1000);

if (socket && typeof socket.on === 'function') {
    socket.on('connect', () => {
        if (currentUser) {
            syncSessionWithServer();
        }
    });
}

window.addEventListener('load', () => {
    generateFloatingBubbles();
    if (currentUser) {
        syncSessionWithServer();
    } else {
        showLandingView();
    }
});

function syncSessionWithServer() {
    if (!currentUser) return;
    socket.emit('auto_login', { username: currentUser }, (res) => {
        if (res && res.success) {
            currentUserAvatar = res.avatar || null;
            currentUserBio = res.bio || 'Halo! Aku pakai TEACHAT!';
            myFriends = res.friends || [];
            myFriendRequests = res.friendRequests || [];
            myGroups = res.groups || [];
            myMessages = res.chatsHistory || [];

            if (res.profilesMap) {
                for (let f in res.profilesMap) {
                    userAvatarsMap[f] = res.profilesMap[f].avatar;
                    userBiosMap[f] = res.profilesMap[f].bio;
                }
            }

            myGroups.forEach(g => { 
                groupDataMap[g.id] = g;
                socket.emit('join_group_room', { groupId: g.id });
            });

            loadUserPinnedChats();
            showDashboard();
            if (activeChatTarget) {
                openChat(activeChatTarget.type, activeChatTarget.target);
            }
        } else {
            logout();
        }
    });
}

// GENERATE GELEMBUNG TEH FRUTIGER AERO
function generateFloatingBubbles() {
    const container = document.getElementById('bubbleContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        const size = Math.random() * 60 + 25;
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.left = `${Math.random() * 100}%`;
        bubble.style.animationDelay = `${Math.random() * 8}s`;
        bubble.style.animationDuration = `${Math.random() * 10 + 8}s`;
        container.appendChild(bubble);
    }
}

// LOGIK FUNGSI KAMERA WEBRTC & VIEWFINDER
async function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    capturedCameraImageBase64 = null;
    const previewImg = document.getElementById('cameraPreviewImg');
    const video = document.getElementById('cameraVideo');
    const shutter = document.getElementById('shutterBtn');
    const confirmBtns = document.getElementById('cameraConfirmBtns');

    if (previewImg) previewImg.classList.add('hidden');
    if (video) video.classList.remove('hidden');
    if (shutter) shutter.classList.remove('hidden');
    if (confirmBtns) confirmBtns.classList.add('hidden');

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Browser kamu tidak mendukung akses kamera langsung WebRTC.');
            closeCameraModal();
            return;
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        if (video) {
            video.srcObject = cameraStream;
        }
    } catch(err) {
        alert('Gagal mengakses kamera: ' + err.message);
        closeCameraModal();
    }
}

function closeCameraModal() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const modal = document.getElementById('cameraModal');
    if (modal) modal.classList.add('hidden');
}

async function switchCameraFacing() {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
    await openCameraModal();
}

function takeCameraPhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const previewImg = document.getElementById('cameraPreviewImg');
    const shutter = document.getElementById('shutterBtn');
    const confirmBtns = document.getElementById('cameraConfirmBtns');

    if (!video || !canvas || !previewImg) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    capturedCameraImageBase64 = canvas.toDataURL('image/jpeg', 0.85);

    previewImg.src = capturedCameraImageBase64;
    previewImg.classList.remove('hidden');
    video.classList.add('hidden');

    if (shutter) shutter.classList.add('hidden');
    if (confirmBtns) confirmBtns.classList.remove('hidden');
}

function retakeCameraPhoto() {
    capturedCameraImageBase64 = null;
    const previewImg = document.getElementById('cameraPreviewImg');
    const video = document.getElementById('cameraVideo');
    const shutter = document.getElementById('shutterBtn');
    const confirmBtns = document.getElementById('cameraConfirmBtns');

    if (previewImg) previewImg.classList.add('hidden');
    if (video) video.classList.remove('hidden');
    if (shutter) shutter.classList.remove('hidden');
    if (confirmBtns) confirmBtns.classList.add('hidden');
}

function sendCameraPhoto() {
    if (!capturedCameraImageBase64) return;
    sendChatMessage(capturedCameraImageBase64);
    closeCameraModal();
}

// UPDATE BADGE NOTIFIKASI
function updateTabBadges() {
    const totalUnreadPrivate = myMessages.filter(m => 
        m.type === 'private' && m.sender !== currentUser && (!m.readBy || !m.readBy.includes(currentUser))
    ).length;

    const totalPendingRequests = myFriendRequests ? myFriendRequests.length : 0;

    const totalUnreadGroup = myMessages.filter(m => 
        m.type === 'group' && m.sender !== currentUser && (!m.readBy || !m.readBy.includes(currentUser))
    ).length;

    const tabBerandaLabel = document.getElementById('tabBerandaLabel');
    if (tabBerandaLabel) tabBerandaLabel.innerText = 'Beranda';

    const badgeBeranda = document.getElementById('badgeBeranda');
    if (badgeBeranda) {
        if (totalUnreadPrivate > 0) {
            badgeBeranda.innerText = totalUnreadPrivate;
            badgeBeranda.classList.remove('hidden');
        } else {
            badgeBeranda.classList.add('hidden');
        }
    }

    const badgeKenalan = document.getElementById('badgeKenalan');
    if (badgeKenalan) {
        if (totalPendingRequests > 0) {
            badgeKenalan.innerText = totalPendingRequests;
            badgeKenalan.classList.remove('hidden');
        } else {
            badgeKenalan.classList.add('hidden');
        }
    }

    const pendingReqCountLabel = document.getElementById('pendingReqCountLabel');
    if (pendingReqCountLabel) pendingReqCountLabel.innerText = totalPendingRequests;

    const badgeGrup = document.getElementById('badgeGrup');
    if (badgeGrup) {
        if (totalUnreadGroup > 0) {
            badgeGrup.innerText = totalUnreadGroup;
            badgeGrup.classList.remove('hidden');
        } else {
            badgeGrup.classList.add('hidden');
        }
    }
}

// INITIAL AUTH SCREEN NAVIGATION
function showLandingView() {
    const screen = document.getElementById('authScreen');
    if (screen) screen.classList.remove('hidden');
    const main = document.getElementById('mainDashboard');
    if (main) main.classList.add('hidden');
    const topH = document.getElementById('topUserHeader');
    if (topH) topH.classList.add('hidden');

    const landingV = document.getElementById('authLandingView');
    if (landingV) landingV.classList.remove('hidden');
    const formV = document.getElementById('authFormView');
    if (formV) formV.classList.add('hidden');
    hideAuthAlert();
}

function showAuthForm(mode) {
    currentAuthMode = mode;
    const landingV = document.getElementById('authLandingView');
    if (landingV) landingV.classList.add('hidden');
    const formV = document.getElementById('authFormView');
    if (formV) formV.classList.remove('hidden');
    hideAuthAlert();

    const titleEl = document.getElementById('authFormTitle');
    const labelEl = document.getElementById('authSubmitLabel');
    const usernameInput = document.getElementById('authUsername');
    const passwordInput = document.getElementById('authPassword');

    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';

    if (mode === 'login') {
        if (titleEl) titleEl.innerText = 'Form Login Akun';
        if (labelEl) labelEl.innerText = 'Masuk Sekarang';
    } else {
        if (titleEl) titleEl.innerText = 'Form Daftar Akun Baru';
        if (labelEl) labelEl.innerText = 'Daftar Akun Baru';
    }
}

function showAuthAlert(msg, isSuccess = false) {
    const box = document.getElementById('authAlert');
    if (!box) return;
    box.classList.remove('hidden');
    const textEl = document.getElementById('authAlertText');
    if (textEl) textEl.innerText = msg;
    box.className = isSuccess 
        ? "mb-5 p-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 bg-emerald-100 text-emerald-900 border-emerald-300" 
        : "mb-5 p-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 bg-red-100 text-red-900 border-red-300";
}

function hideAuthAlert() { 
    const box = document.getElementById('authAlert');
    if (box) box.classList.add('hidden'); 
}

function handleAuthSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const usernameInput = document.getElementById('authUsername');
    const passwordInput = document.getElementById('authPassword');
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (!username || !password) {
        return showAuthAlert('Username dan password wajib diisi!');
    }

    const btn = document.getElementById('authSubmitBtn');
    if (btn) btn.disabled = true;

    if (currentAuthMode === 'signup') {
        socket.emit('signup', { username, password }, (res) => {
            if (btn) btn.disabled = false;
            if (res && res.success) {
                showAuthAlert(res.message, true);
                setTimeout(() => showAuthForm('login'), 1200);
            } else {
                showAuthAlert(res ? res.message : 'username sudah digunakan');
            }
        });
    } else {
        socket.emit('login', { username, password }, (res) => {
            if (btn) btn.disabled = false;
            if (res && res.success) {
                currentUser = res.username;
                currentUserAvatar = res.avatar || null;
                currentUserBio = res.bio || 'Halo! Aku pakai TEACHAT!';
                myFriends = res.friends || [];
                myFriendRequests = res.friendRequests || [];
                myGroups = res.groups || [];
                myMessages = res.chatsHistory || [];

                if (res.profilesMap) {
                    for (let f in res.profilesMap) {
                        userAvatarsMap[f] = res.profilesMap[f].avatar;
                        userBiosMap[f] = res.profilesMap[f].bio;
                    }
                }

                myGroups.forEach(g => { 
                    groupDataMap[g.id] = g;
                    socket.emit('join_group_room', { groupId: g.id });
                });

                sessionStorage.setItem('teachat_active_user', currentUser);
                if (currentUserAvatar) sessionStorage.setItem('teachat_user_avatar', currentUserAvatar);
                sessionStorage.setItem('teachat_user_bio', currentUserBio);

                loadUserPinnedChats();
                showDashboard();
            } else {
                showAuthAlert(res ? res.message : 'Akun mu tidak ditemukan!');
            }
        });
    }
}

// EDIT PROFIL PRIBADI
function openProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
    const uEl = document.getElementById('modalUsername');
    if (uEl) uEl.innerText = currentUser;
    const bioIn = document.getElementById('modalBioInput');
    if (bioIn) bioIn.value = currentUserBio;
    
    const box = document.getElementById('modalAvatarPreview');
    if (box) {
        if (currentUserAvatar) {
            box.innerHTML = `<img src="${currentUserAvatar}" class="w-full h-full object-cover">`;
        } else {
            box.innerText = currentUser ? currentUser.charAt(0).toUpperCase() : '?';
        }
    }
}

function closeProfileModal() { 
    tempAvatarBase64 = null;
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden'); 
}

function previewProfileAvatar(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
        tempAvatarBase64 = evt.target.result;
        const box = document.getElementById('modalAvatarPreview');
        if (box) box.innerHTML = `<img src="${tempAvatarBase64}" class="w-full h-full object-cover">`;
    };
    reader.readAsDataURL(file);
}

function saveProfileChanges() {
    const bioIn = document.getElementById('modalBioInput');
    const newBio = bioIn ? bioIn.value.trim() : '';
    const avatarToSend = tempAvatarBase64 !== null ? tempAvatarBase64 : currentUserAvatar;

    socket.emit('update_profile', { username: currentUser, avatar: avatarToSend, bio: newBio }, (res) => {
        if (res && res.success) {
            currentUserAvatar = res.avatar;
            currentUserBio = res.bio;
            userAvatarsMap[currentUser] = res.avatar;
            userBiosMap[currentUser] = res.bio;

            sessionStorage.setItem('teachat_user_avatar', currentUserAvatar || '');
            sessionStorage.setItem('teachat_user_bio', currentUserBio);

            renderUserHeaderAvatar();
            closeProfileModal();
            renderMessages();
            renderChatList();
        }
    });
}

function renderUserHeaderAvatar() {
    const box = document.getElementById('headerUserAvatar');
    if (!box) return;
    if (currentUserAvatar) {
        box.innerHTML = `<img src="${currentUserAvatar}" class="w-full h-full object-cover">`;
    } else {
        box.innerText = currentUser ? currentUser.charAt(0).toUpperCase() : '?';
    }
}

function logout() {
    sessionStorage.clear();
    currentUser = null;
    currentUserAvatar = null;
    activeChatTarget = null;
    pinnedChats = [];
    showLandingView();
}

function showDashboard() {
    const screen = document.getElementById('authScreen');
    if (screen) screen.classList.add('hidden');
    const main = document.getElementById('mainDashboard');
    if (main) main.classList.remove('hidden');
    const topH = document.getElementById('topUserHeader');
    if (topH) topH.classList.remove('hidden');
    const userEl = document.getElementById('displayUsername');
    if (userEl) userEl.innerText = currentUser;

    renderUserHeaderAvatar();
    renderChatList();
    renderGroupList();
    renderPendingRequests();
    updateTabBadges();
}

// SOCKET LISTENERS REAL-TIME
if (socket && typeof socket.on === 'function') {
    socket.on('receive_message', (msg) => {
        const existingIdx = myMessages.findIndex(m => m.id === msg.id);
        if (existingIdx !== -1) {
            myMessages[existingIdx] = msg;
        } else {
            myMessages.push(msg);
        }
        
        if (activeChatTarget) {
            const isMatch = (
                (msg.type === 'private' && activeChatTarget.type === 'private' && 
                    ((msg.sender === currentUser && msg.target === activeChatTarget.target) || 
                     (msg.sender === activeChatTarget.target && msg.target === currentUser))) ||
                (msg.type === 'group' && activeChatTarget.type === 'group' && msg.target === activeChatTarget.target)
            );

            if (isMatch) {
                renderMessages();
                if (msg.sender !== currentUser) {
                    socket.emit('mark_as_read', { reader: currentUser, target: activeChatTarget.target, type: activeChatTarget.type });
                    if (!msg.readBy.includes(currentUser)) msg.readBy.push(currentUser);
                }
            }
        }
        
        renderChatList();
        updateTabBadges();
    });

    socket.on('user_typing_status', ({ sender, target, type, isTyping }) => {
        if (activeChatTarget && activeChatTarget.target === (type === 'group' ? target : sender)) {
            const indicator = document.getElementById('typingIndicator');
            const subtitle = document.getElementById('activeChatSubtitle');
            if (indicator && subtitle) {
                if (isTyping) {
                    indicator.classList.remove('hidden');
                    subtitle.classList.add('hidden');
                } else {
                    indicator.classList.add('hidden');
                    subtitle.classList.remove('hidden');
                }
            }
        }
    });

    socket.on('added_to_group', ({ group, sysMsg }) => {
        if (!myGroups.some(g => g.id === group.id)) {
            myGroups.push(group);
        }
        groupDataMap[group.id] = group;
        socket.emit('join_group_room', { groupId: group.id });

        if (sysMsg && !myMessages.some(m => m.id === sysMsg.id)) {
            myMessages.push(sysMsg);
        }
        renderGroupList();
        renderChatList();
        updateTabBadges();
    });

    socket.on('group_members_updated', ({ groupId, members }) => {
        if (groupDataMap[groupId]) {
            groupDataMap[groupId].members = members;
            if (activeChatTarget && activeChatTarget.target === groupId) {
                const sub = document.getElementById('activeChatSubtitle');
                if (sub) sub.innerText = `${members.length} Anggota`;
            }
        }
    });

    socket.on('new_friend_request', ({ from, avatar }) => {
        if (!myFriendRequests.includes(from)) myFriendRequests.push(from);
        if (avatar) userAvatarsMap[from] = avatar;
        renderPendingRequests();
        updateTabBadges();
    });

    socket.on('friend_accepted', ({ by, avatar, bio }) => {
        if (!myFriends.includes(by)) myFriends.push(by);
        if (avatar) userAvatarsMap[by] = avatar;
        if (bio) userBiosMap[by] = bio;
        renderChatList();
        updateTabBadges();
        const fSidebar = document.getElementById('sidebarFriends');
        if (fSidebar && !fSidebar.classList.contains('hidden')) {
            searchUsersServer();
        }
    });

    socket.on('unfriend_event', ({ by }) => {
        myFriends = myFriends.filter(f => f !== by);
        if (activeChatTarget && activeChatTarget.target === by) {
            activeChatTarget = null;
            const ph = document.getElementById('emptyChatPlaceholder');
            if (ph) ph.classList.remove('hidden');
            const ib = document.getElementById('chatInputBar');
            if (ib) ib.classList.add('hidden');
            const pm = document.getElementById('privateMenuSection');
            if (pm) pm.classList.add('hidden');
            const titleEl = document.getElementById('activeChatTitle');
            if (titleEl) titleEl.innerText = 'Pilih Obrolan';
            const subEl = document.getElementById('activeChatSubtitle');
            if (subEl) subEl.innerText = 'Klik teman atau grup di beranda';
        }
        renderChatList();
        updateTabBadges();
    });

    socket.on('user_profile_updated', ({ username, avatar, bio }) => {
        userAvatarsMap[username] = avatar;
        userBiosMap[username] = bio;
        renderChatList();
        renderMessages();
    });

    socket.on('group_updated', (group) => {
        groupDataMap[group.id] = group;
        renderGroupList();
        renderChatList();
        if (activeChatTarget && activeChatTarget.target === group.id) {
            const titleEl = document.getElementById('activeChatTitle');
            if (titleEl) titleEl.innerText = group.name;
            const subEl = document.getElementById('activeChatSubtitle');
            if (subEl) subEl.innerText = `${group.members ? group.members.length : 1} Anggota • ${group.description || ''}`;
            if (group.avatar) {
                const avBox = document.getElementById('activeAvatar');
                if (avBox) avBox.innerHTML = `<img src="${group.avatar}" class="w-full h-full object-cover">`;
            }
        }
    });

    socket.on('group_code_updated', ({ groupId, newCode }) => {
        if (groupDataMap[groupId]) {
            groupDataMap[groupId].code = newCode;
            if (activeChatTarget && activeChatTarget.target === groupId) {
                const box = document.getElementById('generatedCodeBox');
                const modal = document.getElementById('displayCodeModal');
                if (box && modal && !modal.classList.contains('hidden')) {
                    box.innerText = newCode;
                }
            }
        }
    });
}

function handleTyping() {
    if (!activeChatTarget) return;
    socket.emit('typing_status', { sender: currentUser, target: activeChatTarget.target, type: activeChatTarget.type, isTyping: true });
    
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing_status', { sender: currentUser, target: activeChatTarget.target, type: activeChatTarget.type, isTyping: false });
    }, 2000);
}

// SIDEBAR NAV TAB SWITCHER
function switchSidebarTab(tab) {
    ['chats', 'friends', 'groups'].forEach(t => {
        const panel = document.getElementById(`sidebar${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        
        if (t === tab) {
            if (panel) panel.classList.remove('hidden');
            if (btn) btn.className = 'tab-nav-btn active-tab flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 relative whitespace-nowrap';
        } else {
            if (panel) panel.classList.add('hidden');
            if (btn) btn.className = 'tab-nav-btn flex-1 py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 relative whitespace-nowrap';
        }
    });
    if (tab === 'friends') searchUsersServer();
}

// TAB KENALAN: SEARCH USERS
function searchUsersServer() {
    const searchInput = document.getElementById('searchUserInput');
    const search = searchInput ? searchInput.value : '';

    socket.emit('search_users', { search, currentUser }, (res) => {
        const resultsContainer = document.getElementById('userSearchResults');
        if (!resultsContainer) return;
        resultsContainer.innerHTML = '';

        if (!res || !res.users || res.users.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-sky-900/60 p-2 text-center font-bold">Tidak ada pengguna lain.</div>';
            return;
        }

        const recommendations = res.users.filter(u => !u.isFriend && !myFriends.includes(u.username));

        if (recommendations.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-sky-900/60 p-2 text-center font-bold">Semua pengguna yang ditemukan sudah menjadi kenalan kamu!</div>';
            return;
        }

        recommendations.forEach(u => {
            if (u.avatar) userAvatarsMap[u.username] = u.avatar;
            userBiosMap[u.username] = u.bio;

            const item = document.createElement('div');
            item.className = 'glass-panel-item p-2 rounded-xl flex items-center justify-between';

            let actionBtn = `<button onclick="sendFriendRequest('${u.username}')" class="aero-btn text-[10px] text-white px-2.5 py-1 rounded-lg font-bold">Kenalan</button>`;
            if (u.isPending) actionBtn = `<span class="text-[10px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md font-bold">Pending</span>`;

            const avHtml = u.avatar ? `<img src="${u.avatar}" class="w-8 h-8 rounded-full object-cover border border-white">` : `<div class="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs">${u.username.charAt(0).toUpperCase()}</div>`;

            item.innerHTML = `
                <div class="flex items-center gap-2">
                    ${avHtml} 
                    <div>
                        <span class="text-xs font-bold text-sky-950 block">${u.username}</span>
                        <span class="text-[9px] text-sky-800 block truncate max-w-[110px]">${u.bio || 'Pengguna TEACHAT!'}</span>
                    </div>
                </div> 
                ${actionBtn}
            `;
            resultsContainer.appendChild(item);
        });
    });
}

function sendFriendRequest(to) {
    socket.emit('send_friend_request', { from: currentUser, to }, (res) => {
        alert(res ? res.message : 'Permintaan terkirim');
        searchUsersServer();
    });
}

function renderPendingRequests() {
    const list = document.getElementById('pendingRequestsList');
    if (!list) return;
    list.innerHTML = '';
    myFriendRequests.forEach(req => {
        const item = document.createElement('div');
        item.className = 'p-2 bg-white/60 border border-white rounded-xl flex items-center justify-between';
        item.innerHTML = `
            <span class="text-xs font-bold text-sky-950">${req}</span>
            <div class="flex gap-1">
                <button onclick="respondRequest('${req}', true)" class="aero-btn aero-btn-green text-[10px] text-white px-2 py-0.5 rounded"><i class="fa-solid fa-check"></i></button>
                <button onclick="respondRequest('${req}', false)" class="aero-btn aero-btn-danger text-[10px] text-white px-2 py-0.5 rounded"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
    updateTabBadges();
}

function respondRequest(targetUser, accept) {
    socket.emit('respond_friend_request', { currentUser, targetUser, accept }, (res) => {
        if (accept && !myFriends.includes(targetUser)) myFriends.push(targetUser);
        myFriendRequests = myFriendRequests.filter(u => u !== targetUser);
        renderPendingRequests();
        renderChatList();
        updateTabBadges();
        const fSidebar = document.getElementById('sidebarFriends');
        if (fSidebar && !fSidebar.classList.contains('hidden')) {
            searchUsersServer();
        }
    });
}

function unfriendCurrentTarget() {
    if (!activeChatTarget || activeChatTarget.type !== 'private') return;
    const friendName = activeChatTarget.target;
    togglePrivateDropdown();

    if (confirm(`Apakah Anda yakin ingin menghapus kenalan dengan ${friendName}?`)) {
        socket.emit('unfriend', { currentUser, targetUser: friendName }, (res) => {
            myFriends = myFriends.filter(f => f !== friendName);
            activeChatTarget = null;

            const ph = document.getElementById('emptyChatPlaceholder');
            if (ph) ph.classList.remove('hidden');
            const ib = document.getElementById('chatInputBar');
            if (ib) ib.classList.add('hidden');
            const pm = document.getElementById('privateMenuSection');
            if (pm) pm.classList.add('hidden');
            const titleEl = document.getElementById('activeChatTitle');
            if (titleEl) titleEl.innerText = 'Pilih Obrolan';
            const subEl = document.getElementById('activeChatSubtitle');
            if (subEl) subEl.innerText = 'Klik teman atau grup di beranda';

            renderChatList();
            updateTabBadges();
        });
    }
}

// RENDER BERANDA CHAT (PINNED CHATS DIPOSISIKAN PALING ATAS DENGAN SIFAT PERSONAL & LIFO)
function renderChatList(filterQuery = '') {
    const container = document.getElementById('chatListContainer');
    if (!container) return;
    container.innerHTML = '';

    const allItems = [];

    // 1. Kenalan
    myFriends.forEach(friend => {
        const msgs = myMessages.filter(m => m.type === 'private' && ((m.sender === currentUser && m.target === friend) || (m.sender === friend && m.target === currentUser)));
        const last = msgs[msgs.length - 1];
        const unreadCount = msgs.filter(m => m.type === 'private' && m.sender === friend && (!m.readBy || !m.readBy.includes(currentUser))).length;

        allItems.push({
            id: friend,
            type: 'private',
            title: friend,
            avatar: userAvatarsMap[friend] || null,
            lastMsg: last ? (last.text || '📷 [Gambar]') : 'Belum ada obrolan',
            time: last ? new Date(last.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
            timestamp: last ? last.timestamp : 0,
            unreadCount,
            isPinned: pinnedChats.includes(friend)
        });
    });

    // 2. Grup
    myGroups.forEach(grp => {
        const msgs = myMessages.filter(m => m.type === 'group' && m.target === grp.id);
        const last = msgs[msgs.length - 1];
        const unreadCount = msgs.filter(m => m.type === 'group' && m.sender !== currentUser && (!m.readBy || !m.readBy.includes(currentUser))).length;

        allItems.push({
            id: grp.id,
            type: 'group',
            title: grp.name,
            avatar: grp.avatar || null,
            lastMsg: last ? (last.isSystem ? last.text : `${last.sender}: ${last.text || '📷 [Gambar]'}`) : 'Grup baru dibuat',
            time: last ? new Date(last.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
            timestamp: last ? last.timestamp : 0,
            unreadCount,
            isPinned: pinnedChats.includes(grp.id)
        });
    });

    // SORTING: Personal Pinned Chat di atas (urutan LIFO: yang terakhir di-pin di posisi #1), disusul non-pinned terbaru
    allItems.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        if (a.isPinned && b.isPinned) {
            return pinnedChats.indexOf(a.id) - pinnedChats.indexOf(b.id);
        }
        return b.timestamp - a.timestamp;
    });

    const query = filterQuery.toLowerCase().trim();
    const filtered = allItems.filter(item => item.title.toLowerCase().includes(query));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-xs text-sky-900/60 p-3 text-center font-bold">Belum ada obrolan. Cari teman di tab Kenalan!</div>';
        return;
    }

    filtered.forEach(c => {
        const item = document.createElement('div');
        const isActive = activeChatTarget && activeChatTarget.target === c.id;
        item.className = `glass-panel-item ${c.isPinned ? 'pinned-item' : ''} p-2.5 rounded-2xl flex items-center justify-between cursor-pointer ${isActive ? 'active' : ''}`;
        
        item.onclick = (e) => {
            e.preventDefault();
            openChat(c.type, c.id);
        };

        const avHtml = c.avatar ? 
            `<img src="${c.avatar}" class="w-9 h-9 rounded-full object-cover border border-white">` : 
            `<div class="w-9 h-9 rounded-full ${c.type === 'group' ? 'bg-emerald-600' : 'bg-sky-600'} text-white flex items-center justify-center font-bold text-xs uppercase">${c.title.charAt(0)}</div>`;
        
        const badgeHtml = c.unreadCount > 0 ? `<span class="bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm animate-bounce">${c.unreadCount}</span>` : '';

        item.innerHTML = `
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
                ${avHtml}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                        <h4 class="text-xs font-bold text-sky-950 truncate">${c.title}</h4>
                        ${c.isPinned ? '<span class="text-[8px] bg-emerald-200 text-emerald-900 font-extrabold px-1 rounded">📌 PINNED</span>' : ''}
                        ${c.type === 'group' ? '<span class="text-[8px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold px-1 py-0.2 rounded-full">GRUP</span>' : ''}
                    </div>
                    <p class="text-[10px] ${c.unreadCount > 0 ? 'font-bold text-emerald-900' : 'text-sky-800'} truncate">${c.lastMsg}</p>
                </div>
            </div>
            <div class="flex flex-col items-end gap-1 ml-2">
                <span class="text-[9px] text-sky-800 font-bold">${c.time}</span>
                ${badgeHtml}
            </div>
        `;
        container.appendChild(item);
    });

    updateTabBadges();
}

function renderGroupList() {
    const container = document.getElementById('groupListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (myGroups.length === 0) {
        container.innerHTML = '<div class="text-xs text-sky-900/60 p-3 text-center font-bold">Belum ada grup yang dimiliki. Silakan buat atau masukin kode grup!</div>';
        return;
    }

    myGroups.forEach(g => {
        const item = document.createElement('div');
        item.className = 'glass-panel-item p-2 rounded-xl flex items-center justify-between cursor-pointer';
        item.onclick = () => openChat('group', g.id);

        const avHtml = g.avatar ? 
            `<img src="${g.avatar}" class="w-7 h-7 rounded-full object-cover border border-white">` : 
            `<div class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">${g.name.charAt(0)}</div>`;

        item.innerHTML = `
            <div class="flex items-center gap-2">
                ${avHtml}
                <div>
                    <span class="text-xs font-bold text-sky-950 block">${g.name}</span>
                    <span class="text-[9px] text-sky-800">${g.members ? g.members.length : 1} Anggota</span>
                </div>
            </div>
            <span class="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">Buka</span>
        `;
        container.appendChild(item);
    });
}

// BUKA OBROLAN
function openChat(type, target) {
    if (!type || !target) return;
    
    activeChatTarget = { type, target };

    const placeholder = document.getElementById('emptyChatPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');

    const inputBar = document.getElementById('chatInputBar');
    if (inputBar) inputBar.classList.remove('hidden');

    const isGrp = (type === 'group');
    
    const privateMenu = document.getElementById('privateMenuSection');
    if (privateMenu) privateMenu.classList.toggle('hidden', isGrp);

    const groupMenu = document.getElementById('groupMenuSection');
    if (groupMenu) groupMenu.classList.toggle('hidden', !isGrp);

    let titleName = target;
    let subtitleStr = 'Obrolan Pribadi';

    const typeTag = document.getElementById('activeChatTypeTag');
    if (typeTag) {
        typeTag.classList.remove('hidden');
        if (isGrp) {
            typeTag.innerText = 'Grup Chat';
            typeTag.className = 'text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300';
        } else {
            typeTag.innerText = 'Obrolan Pribadi';
            typeTag.className = 'text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase bg-sky-100 text-sky-800 border border-sky-300';
        }
    }

    if (isGrp) {
        const gInfo = groupDataMap[target] || myGroups.find(g => g.id === target || g.name === target);
        titleName = gInfo ? gInfo.name : target;
        subtitleStr = gInfo ? `${gInfo.members ? gInfo.members.length : 1} Anggota • ${gInfo.description || ''}` : 'Obrolan Grup';
    } else {
        subtitleStr = userBiosMap[target] || 'Obrolan Pribadi';
    }

    // UPDATE HEADER TITLE, SUBTITLE & AVATAR
    const titleEl = document.getElementById('activeChatTitle');
    if (titleEl) titleEl.innerText = titleName;

    const subEl = document.getElementById('activeChatSubtitle');
    if (subEl) subEl.innerText = subtitleStr;

    const activeAv = isGrp ? groupDataMap[target]?.avatar : userAvatarsMap[target];
    const avatarBox = document.getElementById('activeAvatar');
    if (avatarBox) {
        if (activeAv) {
            avatarBox.innerHTML = `<img src="${activeAv}" class="w-full h-full object-cover">`;
        } else {
            avatarBox.innerText = titleName.charAt(0).toUpperCase();
        }
    }

    updatePinMenuText();
    applyRoomWallpaper(target);

    // MARK PESAN SEBAGAI TERBACA
    socket.emit('mark_as_read', { reader: currentUser, target, type });
    myMessages.forEach(m => {
        if (type === 'private' && m.type === 'private' && m.sender === target && m.target === currentUser) {
            if (!m.readBy.includes(currentUser)) m.readBy.push(currentUser);
        } else if (type === 'group' && m.type === 'group' && m.target === target) {
            if (!m.readBy.includes(currentUser)) m.readBy.push(currentUser);
        }
    });

    renderMessages();
    renderChatList();
    updateTabBadges();
}

// ROOMCHAT WALLPAPER LOGIC
function applyRoomWallpaper(targetId) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const wp = roomWallpapers[targetId];
    if (wp) {
        container.style.backgroundImage = `url('${wp}')`;
    } else {
        container.style.backgroundImage = 'none';
    }
}

function openWallpaperModal() {
    if (!activeChatTarget) return;
    const modal = document.getElementById('wallpaperModal');
    if (!modal) return;

    let targetName = activeChatTarget.target;
    if (activeChatTarget.type === 'group' && groupDataMap[targetName]) {
        targetName = groupDataMap[targetName].name;
    }

    const span = document.getElementById('wallpaperTargetSpan');
    if (span) span.innerText = `(${targetName})`;
    modal.classList.remove('hidden');
}

function closeWallpaperModal() {
    const modal = document.getElementById('wallpaperModal');
    if (modal) modal.classList.add('hidden');
}

function handleCustomWallpaperUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeChatTarget) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
        roomWallpapers[activeChatTarget.target] = evt.target.result;
        saveRoomWallpapers();
        applyRoomWallpaper(activeChatTarget.target);
        e.target.value = '';
    };
    reader.readAsDataURL(file);
}

function resetRoomWallpaper() {
    if (!activeChatTarget) return;
    delete roomWallpapers[activeChatTarget.target];
    saveRoomWallpapers();
    applyRoomWallpaper(activeChatTarget.target);
}

// RENDER PESAN DENGAN BUBBLE CHAT FRUTIGER AERO RAMPING & PALET WARNA UNIK
function renderMessages() {
    if (!activeChatTarget) return;
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.innerHTML = '';

    const isGroupChat = activeChatTarget.type === 'group';

    const filtered = myMessages.filter(m => {
        if (activeChatTarget.type === 'private') {
            return m.type === 'private' && (
                (m.sender === currentUser && m.target === activeChatTarget.target) ||
                (m.sender === activeChatTarget.target && m.target === currentUser)
            );
        } else if (activeChatTarget.type === 'group') {
            return m.type === 'group' && m.target === activeChatTarget.target;
        }
        return false;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center text-sky-900/80 p-6 room-wallpaper-content">
                <i class="fa-solid fa-comments text-4xl mb-2 text-sky-600/60"></i>
                <p class="text-xs font-bold text-sky-950">Belum ada pesan di sini. Ketik pesan di bawah untuk memulai!</p>
            </div>
        `;
        return;
    }

    filtered.forEach(msg => {
        if (msg.isSystem) {
            const sysWrapper = document.createElement('div');
            sysWrapper.className = 'flex justify-center my-2 room-wallpaper-content';
            sysWrapper.innerHTML = `
                <div class="chat-bubble-system px-3.5 py-1 rounded-full text-center max-w-[85%] shadow-sm">
                    <i class="fa-solid fa-circle-info mr-1.5 text-sky-500"></i>${escapeHtml(msg.text)}
                </div>
            `;
            container.appendChild(sysWrapper);
            return;
        }

        const isSent = msg.sender === currentUser;
        const wrapper = document.createElement('div');
        wrapper.className = `flex flex-col ${isSent ? 'items-end' : 'items-start'} room-wallpaper-content my-1.5`;

        let tick = isSent ? (msg.readBy && msg.readBy.length > 1 ? ' <i class="fa-solid fa-check-double text-sky-100"></i>' : ' <i class="fa-solid fa-check text-sky-100"></i>') : '';
        
        let bubbleClass = 'chat-bubble-base ';
        if (isSent) {
            bubbleClass += 'chat-bubble-sent';
        } else if (!isGroupChat) {
            bubbleClass += 'chat-bubble-received';
        } else {
            // WARNA BUBBLE UNIK BERBAGAI ANGGOTA GRUP (DARI PALET FRUTIGER AERO)
            bubbleClass += getMemberColorClass(msg.sender);
        }

        let senderHeaderHtml = '';
        if (!isSent && isGroupChat) {
            const senderAv = userAvatarsMap[msg.sender];
            const avImgHtml = senderAv ? 
                `<img src="${senderAv}" class="w-4 h-4 rounded-full inline object-cover mr-1 border border-white">` : 
                `<span class="w-4 h-4 rounded-full bg-white/30 text-white inline-flex items-center justify-center text-[9px] font-bold mr-1">${msg.sender.charAt(0).toUpperCase()}</span>`;

            senderHeaderHtml = `
                <div class="text-[10px] font-extrabold text-white/95 mb-1 flex items-center pb-0.5 border-b border-white/20">
                    ${avImgHtml}
                    <span>${escapeHtml(msg.sender)}</span>
                </div>
            `;
        }

        wrapper.innerHTML = `
            <div class="px-3.5 py-2 text-xs ${bubbleClass}">
                ${senderHeaderHtml}
                ${msg.image ? `<img src="${msg.image}" class="max-w-full rounded-xl my-1 border border-white/50 max-h-60 object-contain">` : ''}
                ${msg.text ? `<div class="break-words font-semibold text-xs leading-relaxed mt-0.5">${escapeHtml(msg.text)}</div>` : ''}
                <div class="text-[9px] text-right mt-1 opacity-85 font-bold">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}${tick}</div>
            </div>
        `;
        container.appendChild(wrapper);
    });
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

function sendChatMessage(imageB64 = null) {
    if (!activeChatTarget) return;
    const input = document.getElementById('chatMessageInput');
    const text = input ? input.value.trim() : '';
    if (!text && !imageB64) return;

    const msgData = {
        id: 'MSG_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        sender: currentUser,
        target: activeChatTarget.target,
        text,
        image: imageB64,
        type: activeChatTarget.type,
        timestamp: Date.now()
    };

    socket.emit('send_message', msgData);
    if (input) input.value = '';
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.add('hidden');
}

function handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
        alert('Ukuran gambar maksimal 20MB!');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
        sendChatMessage(evt.target.result);
        e.target.value = '';
    };
    reader.readAsDataURL(file);
}

function toggleEmojiPicker() { 
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.toggle('hidden'); 
}

function insertEmoji(emoji) { 
    const input = document.getElementById('chatMessageInput');
    if (input) input.value += emoji; 
}

function togglePrivateDropdown() {
    const dropdown = document.getElementById('privateDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

function toggleGroupDropdown() {
    const dropdown = document.getElementById('groupDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

// FLOW BUAT GRUP
function openCreateGroupModalStep1() {
    const s1 = document.getElementById('createGroupStep1');
    if (s1) s1.classList.remove('hidden');
    const s2 = document.getElementById('createGroupStep2');
    if (s2) s2.classList.add('hidden');
    const nameIn = document.getElementById('newGroupName');
    if (nameIn) nameIn.value = '';
    const descIn = document.getElementById('newGroupDesc');
    if (descIn) descIn.value = '';
    const modal = document.getElementById('createGroupModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCreateGroupModal() { 
    const modal = document.getElementById('createGroupModal');
    if (modal) modal.classList.add('hidden'); 
}

function proceedCreateGroupStep2() {
    const nameInput = document.getElementById('newGroupName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return alert('Masukkan nama grup terlebih dahulu!');

    const span = document.getElementById('createGroupTargetNameSpan');
    if (span) span.innerText = `"${name}"`;

    const container = document.getElementById('initialMembersList');
    if (container) {
        container.innerHTML = '';

        if (myFriends.length === 0) {
            container.innerHTML = '<div class="text-[11px] text-sky-900/60 p-2 text-center font-bold">Belum ada kenalan untuk ditambahkan.</div>';
        } else {
            myFriends.forEach(f => {
                const div = document.createElement('label');
                div.className = 'flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/80 cursor-pointer text-xs font-bold text-sky-950';
                div.innerHTML = `
                    <input type="checkbox" value="${f}" class="create-group-friend-chk rounded text-sky-600">
                    <span>${f}</span>
                `;
                container.appendChild(div);
            });
        }
    }

    const s1 = document.getElementById('createGroupStep1');
    if (s1) s1.classList.add('hidden');
    const s2 = document.getElementById('createGroupStep2');
    if (s2) s2.classList.remove('hidden');
}

function backToCreateGroupStep1() {
    const s1 = document.getElementById('createGroupStep1');
    if (s1) s1.classList.remove('hidden');
    const s2 = document.getElementById('createGroupStep2');
    if (s2) s2.classList.add('hidden');
}

function submitCreateGroup(autoOpenCodeModal = false) {
    const nameInput = document.getElementById('newGroupName');
    const descInput = document.getElementById('newGroupDesc');
    const name = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (!name) return alert('Masukkan nama grup!');

    const chks = document.querySelectorAll('.create-group-friend-chk:checked');
    const selectedFriends = Array.from(chks).map(c => c.value);

    socket.emit('create_group', { groupName: name, creator: currentUser, initialMembers: selectedFriends, description }, (res) => {
        closeCreateGroupModal();
        if (res && res.success) {
            if (!myGroups.some(g => g.id === res.group.id)) {
                myGroups.push(res.group);
            }
            groupDataMap[res.group.id] = res.group;
            renderGroupList();
            renderChatList();
            updateTabBadges();
            
            openChat('group', res.group.id);

            if (autoOpenCodeModal) {
                setTimeout(() => showGroupCodeModal(), 300);
            }
        } else {
            alert(res ? res.message : 'Gagal membuat grup');
        }
    });
}

function openJoinGroupModal() {
    const inStep = document.getElementById('joinCodeStepInput');
    if (inStep) inStep.classList.remove('hidden');
    const confStep = document.getElementById('joinCodeStepConfirm');
    if (confStep) confStep.classList.add('hidden');
    const codeIn = document.getElementById('joinGroupCodeInput');
    if (codeIn) codeIn.value = '';
    const modal = document.getElementById('joinGroupModal');
    if (modal) modal.classList.remove('hidden');
}

function closeJoinGroupModal() {
    pendingJoinGroupTarget = null;
    const modal = document.getElementById('joinGroupModal');
    if (modal) modal.classList.add('hidden');
}

function checkGroupCodeBeforeJoin() {
    const codeInput = document.getElementById('joinGroupCodeInput');
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code) return alert('Masukkan 6 digit kode grup!');

    socket.emit('check_group_code', { code }, (res) => {
        if (res && res.success) {
            pendingJoinGroupTarget = res.group.id;
            const nameSpan = document.getElementById('confirmGroupNameSpan');
            if (nameSpan) nameSpan.innerText = `"${res.group.name}"`;
            const inStep = document.getElementById('joinCodeStepInput');
            if (inStep) inStep.classList.add('hidden');
            const confStep = document.getElementById('joinCodeStepConfirm');
            if (confStep) confStep.classList.remove('hidden');
        } else {
            alert(res ? res.message : 'Kode yang dimasukkan tidak cocok!');
        }
    });
}

function confirmJoinGroupSubmit() {
    if (!pendingJoinGroupTarget) return;

    socket.emit('confirm_join_group', { username: currentUser, groupId: pendingJoinGroupTarget }, (res) => {
        if (res && res.success) {
            closeJoinGroupModal();
            if (!myGroups.some(g => g.id === res.group.id)) {
                myGroups.push(res.group);
            }
            groupDataMap[res.group.id] = res.group;
            renderGroupList();
            renderChatList();
            updateTabBadges();
            
            openChat('group', res.group.id);
        } else {
            alert(res ? res.message : 'Gagal bergabung ke grup');
        }
    });
}

function showGroupCodeModal() {
    toggleGroupDropdown();
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const gInfo = groupDataMap[activeChatTarget.target];
    if (gInfo) {
        const box = document.getElementById('generatedCodeBox');
        if (box) box.innerText = gInfo.code;
        const copyTxt = document.getElementById('copyBtnText');
        if (copyTxt) copyTxt.innerText = 'Copy';
        const modal = document.getElementById('displayCodeModal');
        if (modal) modal.classList.remove('hidden');
    }
}

function closeDisplayCodeModal() { 
    const modal = document.getElementById('displayCodeModal');
    if (modal) modal.classList.add('hidden'); 
}

function copyGroupCode() {
    const box = document.getElementById('generatedCodeBox');
    const code = box ? box.innerText : '';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            const txt = document.getElementById('copyBtnText');
            if (txt) txt.innerText = 'Tersalin! ✓';
            setTimeout(() => {
                if (txt) txt.innerText = 'Copy';
            }, 2000);
        });
    } else {
        alert('Kode grup: ' + code);
    }
}

function openAddMembersModal() {
    toggleGroupDropdown();
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const gInfo = groupDataMap[activeChatTarget.target];
    const container = document.getElementById('addMembersContainerList');
    if (!container) return;
    container.innerHTML = '';

    const eligibleFriends = myFriends.filter(f => !gInfo.members.includes(f));

    if (eligibleFriends.length === 0) {
        container.innerHTML = '<div class="text-[11px] text-sky-900/60 p-2 text-center font-bold">Semua kenalan kamu sudah masuk di grup ini.</div>';
    } else {
        eligibleFriends.forEach(f => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/80 cursor-pointer text-xs font-bold text-sky-950';
            label.innerHTML = `
                <input type="checkbox" value="${f}" class="add-member-chk rounded text-emerald-600">
                <span>${f}</span>
            `;
            container.appendChild(label);
        });
    }

    const modal = document.getElementById('addMembersModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAddMembersModal() { 
    const modal = document.getElementById('addMembersModal');
    if (modal) modal.classList.add('hidden'); 
}

function submitAddMembersToGroup() {
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const chks = document.querySelectorAll('.add-member-chk:checked');
    const selected = Array.from(chks).map(c => c.value);

    if (selected.length === 0) return alert('Pilih minimal 1 kenalan!');

    socket.emit('add_members_to_group', { groupId: activeChatTarget.target, addedBy: currentUser, newMembers: selected }, (res) => {
        if (res && res.success) {
            closeAddMembersModal();
            groupDataMap[res.group.id] = res.group;
            renderMessages();
        } else {
            alert(res ? res.message : 'Gagal menambahkan anggota');
        }
    });
}

function openViewMembersModal() {
    toggleGroupDropdown();
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const gInfo = groupDataMap[activeChatTarget.target];
    const container = document.getElementById('viewMembersContainerList');
    if (!container) return;
    container.innerHTML = '';

    if (gInfo && gInfo.members) {
        gInfo.members.forEach(m => {
            const isCreator = (m === gInfo.creator);
            const av = userAvatarsMap[m];
            const avHtml = av ? `<img src="${av}" class="w-8 h-8 rounded-full object-cover border border-white">` : `<div class="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs">${m.charAt(0).toUpperCase()}</div>`;

            const item = document.createElement('div');
            item.className = 'p-2 bg-white/60 border border-white rounded-xl flex items-center justify-between';
            item.innerHTML = `
                <div class="flex items-center gap-2">
                    ${avHtml}
                    <div>
                        <span class="text-xs font-bold text-sky-950 block">${m} ${m === currentUser ? ' (Saya)' : ''}</span>
                        <span class="text-[9px] text-sky-800">${userBiosMap[m] || 'Pengguna TEACHAT!'}</span>
                    </div>
                </div>
                ${isCreator ? '<span class="text-[9px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-extrabold border border-amber-300">Pembuat</span>' : '<span class="text-[9px] bg-sky-100 text-sky-900 px-2 py-0.5 rounded-full font-bold">Anggota</span>'}
            `;
            container.appendChild(item);
        });
    }

    const modal = document.getElementById('viewMembersModal');
    if (modal) modal.classList.remove('hidden');
}

function closeViewMembersModal() { 
    const modal = document.getElementById('viewMembersModal');
    if (modal) modal.classList.add('hidden'); 
}

function confirmLeaveGroup() {
    toggleGroupDropdown();
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const gInfo = groupDataMap[activeChatTarget.target];
    const name = gInfo ? gInfo.name : 'grup ini';

    if (confirm(`Apakah Anda yakin ingin keluar dari "${name}"?`)) {
        socket.emit('leave_group', { username: currentUser, groupId: activeChatTarget.target }, (res) => {
            if (res && res.success) {
                const gId = activeChatTarget.target;
                myGroups = myGroups.filter(g => g.id !== gId);
                delete groupDataMap[gId];
                
                activeChatTarget = null;
                const ph = document.getElementById('emptyChatPlaceholder');
                if (ph) ph.classList.remove('hidden');
                const ib = document.getElementById('chatInputBar');
                if (ib) ib.classList.add('hidden');
                const gm = document.getElementById('groupMenuSection');
                if (gm) gm.classList.add('hidden');
                const titleEl = document.getElementById('activeChatTitle');
                if (titleEl) titleEl.innerText = 'Pilih Obrolan';
                const subEl = document.getElementById('activeChatSubtitle');
                if (subEl) subEl.innerText = 'Klik teman atau grup di beranda';

                renderGroupList();
                renderChatList();
                updateTabBadges();
            } else {
                alert(res ? res.message : 'Gagal keluar dari grup');
            }
        });
    }
}

function openEditGroupModal() {
    toggleGroupDropdown();
    if (!activeChatTarget || activeChatTarget.type !== 'group') return;

    const gInfo = groupDataMap[activeChatTarget.target];
    if (gInfo) {
        const nameIn = document.getElementById('editGroupNameInput');
        if (nameIn) nameIn.value = gInfo.name;
        const descIn = document.getElementById('editGroupDescInput');
        if (descIn) descIn.value = gInfo.description || '';
        const modal = document.getElementById('editGroupModal');
        if (modal) modal.classList.remove('hidden');
    }
}

function closeEditGroupModal() { 
    const modal = document.getElementById('editGroupModal');
    if (modal) modal.classList.add('hidden'); 
}

function saveGroupEdit() {
    const nameIn = document.getElementById('editGroupNameInput');
    const newName = nameIn ? nameIn.value.trim() : '';
    const descIn = document.getElementById('editGroupDescInput');
    const newDesc = descIn ? descIn.value.trim() : '';
    const avatarInput = document.getElementById('editGroupAvatarInput');
    const avatarFiles = avatarInput ? avatarInput.files : null;

    if (avatarFiles && avatarFiles.length > 0) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            sendEditGroupServer(newName, evt.target.result, newDesc);
        };
        reader.readAsDataURL(avatarFiles[0]);
    } else {
        sendEditGroupServer(newName, undefined, newDesc);
    }
}

function sendEditGroupServer(groupName, groupAvatar, description) {
    socket.emit('edit_group', { groupId: activeChatTarget.target, groupName, groupAvatar, description }, (res) => {
        if (res && res.success) {
            closeEditGroupModal();
        }
    });
}
