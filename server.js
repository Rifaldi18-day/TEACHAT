const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 25 * 1024 * 1024 // Limit 25 MB
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// DATABASE SERVER MEMORI
const users = {};        // { username: { password, avatar, bio, friends: [], friendRequests: [] } }
const chats = [];        // [ { id, sender, target, text, image, type, isSystem, timestamp, readBy: [] } ]
const groups = {};       // { id: { id, name, avatar, description, creator, code, codeExpiresAt, members: [] } }

function generateGroupCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Reset Kode Unik Grup Setiap 5 Menit
setInterval(() => {
    const now = Date.now();
    for (let gId in groups) {
        groups[gId].code = generateGroupCode();
        groups[gId].codeExpiresAt = now + (5 * 60 * 1000);
        io.to(gId).emit('group_code_updated', {
            groupId: gId,
            newCode: groups[gId].code
        });
    }
}, 5 * 60 * 1000);

function setupSocketUserRooms(socket, username) {
    socket.username = username;
    socket.join(username);

    const userGroups = [];
    for (let gId in groups) {
        if (groups[gId].members.includes(username)) {
            socket.join(gId);
            userGroups.push(groups[gId]);
        }
    }

    const profilesMap = {};
    if (users[username] && users[username].friends) {
        users[username].friends.forEach(f => {
            if (users[f]) profilesMap[f] = { avatar: users[f].avatar, bio: users[f].bio };
        });
    }

    const userChats = chats.filter(m => 
        (m.type === 'private' && (m.sender === username || m.target === username)) ||
        (m.type === 'group' && groups[m.target]?.members.includes(username))
    );

    return { userGroups, profilesMap, userChats };
}

io.on('connection', (socket) => {

    socket.on('join_group_room', ({ groupId }) => {
        if (groupId) socket.join(groupId);
    });

    // 1. SIGNUP
    socket.on('signup', ({ username, password }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const trimmedU = (username || '').trim();
        const trimmedP = (password || '').trim();

        if (!trimmedU || !trimmedP) {
            return callback({ success: false, message: 'Username & Password wajib diisi!' });
        }
        
        const existingKey = Object.keys(users).find(u => u.toLowerCase() === trimmedU.toLowerCase());
        if (existingKey) {
            return callback({ success: false, message: 'username sudah digunakan' });
        }

        users[trimmedU] = {
            username: trimmedU,
            password: trimmedP,
            avatar: null,
            bio: 'Halo! Aku pakai TEACHAT!',
            friends: [],
            friendRequests: []
        };

        callback({ success: true, message: 'Pendaftaran berhasil! Silakan Login.' });
    });

    // 2. LOGIN MANUAL
    socket.on('login', ({ username, password }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const trimmedU = (username || '').trim();
        const trimmedP = (password || '').trim();

        const userKey = Object.keys(users).find(u => u.toLowerCase() === trimmedU.toLowerCase());
        if (!userKey || !users[userKey]) {
            return callback({ success: false, message: 'Akun mu tidak ditemukan!' });
        }
        if (users[userKey].password !== trimmedP) {
            return callback({ success: false, message: 'Password salah!' });
        }

        const realUsername = users[userKey].username;
        const { userGroups, profilesMap, userChats } = setupSocketUserRooms(socket, realUsername);

        callback({ 
            success: true, 
            username: realUsername,
            avatar: users[realUsername].avatar,
            bio: users[realUsername].bio,
            friends: users[realUsername].friends,
            friendRequests: users[realUsername].friendRequests,
            groups: userGroups,
            profilesMap,
            chatsHistory: userChats
        });

        io.emit('user_status_change', { username: realUsername, status: 'online' });
    });

    // 3. AUTO LOGIN
    socket.on('auto_login', ({ username }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const trimmedU = (username || '').trim();
        const userKey = Object.keys(users).find(u => u.toLowerCase() === trimmedU.toLowerCase());

        if (!userKey || !users[userKey]) {
            return callback({ success: false, message: 'Sesi tidak valid' });
        }

        const realUsername = users[userKey].username;
        const { userGroups, profilesMap, userChats } = setupSocketUserRooms(socket, realUsername);

        callback({ 
            success: true, 
            username: realUsername,
            avatar: users[realUsername].avatar,
            bio: users[realUsername].bio,
            friends: users[realUsername].friends,
            friendRequests: users[realUsername].friendRequests,
            groups: userGroups,
            profilesMap,
            chatsHistory: userChats
        });
    });

    // 4. UPDATE PROFIL PRIBADI
    socket.on('update_profile', ({ username, avatar, bio }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        if (users[username]) {
            if (avatar !== undefined) users[username].avatar = avatar;
            if (bio !== undefined) users[username].bio = bio;

            callback({ success: true, avatar: users[username].avatar, bio: users[username].bio });

            io.emit('user_profile_updated', { 
                username, 
                avatar: users[username].avatar,
                bio: users[username].bio 
            });
        } else {
            callback({ success: false, message: 'User tidak ditemukan' });
        }
    });

    // 5. CARI AKUN
    socket.on('search_users', ({ search, currentUser }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const query = (search || '').toLowerCase().trim();
        const results = Object.keys(users)
            .filter(u => u !== currentUser && (query === '' || u.toLowerCase().includes(query)))
            .map(u => ({
                username: u,
                avatar: users[u].avatar,
                bio: users[u].bio || 'Pengguna TEACHAT!',
                isFriend: users[currentUser]?.friends.includes(u) || false,
                isPending: users[u]?.friendRequests.includes(currentUser) || false
            }));
        callback({ success: true, users: results });
    });

    // 6. KIRIM PERMINTAAN KENALAN
    socket.on('send_friend_request', ({ from, to }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        if (!users[to]) return callback({ success: false, message: 'Pengguna tidak ditemukan' });
        if (users[to].friends.includes(from)) return callback({ success: false, message: 'Sudah berteman' });

        if (!users[to].friendRequests.includes(from)) {
            users[to].friendRequests.push(from);
            io.to(to).emit('new_friend_request', { from, avatar: users[from]?.avatar || null });
        }
        callback({ success: true, message: `Permintaan kenalan dikirim ke ${to}` });
    });

    // 7. RESPOND KENALAN & UN-KENALAN
    socket.on('respond_friend_request', ({ currentUser, targetUser, accept }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        if (!users[currentUser]) return callback({ success: false, message: 'User tidak ditemukan' });

        const index = users[currentUser].friendRequests.indexOf(targetUser);
        if (index !== -1) users[currentUser].friendRequests.splice(index, 1);

        if (accept) {
            if (!users[currentUser].friends.includes(targetUser)) users[currentUser].friends.push(targetUser);
            if (users[targetUser] && !users[targetUser].friends.includes(currentUser)) users[targetUser].friends.push(currentUser);

            io.to(targetUser).emit('friend_accepted', { by: currentUser, avatar: users[currentUser].avatar, bio: users[currentUser].bio });
            io.to(currentUser).emit('friend_accepted', { by: targetUser, avatar: users[targetUser]?.avatar || null, bio: users[targetUser]?.bio || '' });

            callback({ success: true, message: `Sekarang berteman dengan ${targetUser}` });
        } else {
            callback({ success: true, message: 'Permintaan kenalan ditolak' });
        }
    });

    socket.on('unfriend', ({ currentUser, targetUser }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        if (users[currentUser] && users[currentUser].friends) {
            const idx1 = users[currentUser].friends.indexOf(targetUser);
            if (idx1 !== -1) users[currentUser].friends.splice(idx1, 1);
        }
        if (users[targetUser] && users[targetUser].friends) {
            const idx2 = users[targetUser].friends.indexOf(currentUser);
            if (idx2 !== -1) users[targetUser].friends.splice(idx2, 1);
        }
        io.to(targetUser).emit('unfriend_event', { by: currentUser });
        callback({ success: true, message: `Berhasil hapus kenalan ${targetUser}` });
    });

    // 8. BUAT GRUP
    socket.on('create_group', ({ groupName, creator, initialMembers, description }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const gId = 'GRP_' + Date.now();
        const joinCode = generateGroupCode();
        
        const memberList = [creator];
        if (Array.isArray(initialMembers)) {
            initialMembers.forEach(m => {
                if (users[m] && !memberList.includes(m)) {
                    memberList.push(m);
                }
            });
        }

        groups[gId] = {
            id: gId,
            name: groupName || 'Grup Chat',
            avatar: null,
            description: description || 'Grup chat TEACHAT!',
            creator,
            code: joinCode,
            codeExpiresAt: Date.now() + (5 * 60 * 1000),
            members: memberList
        };

        socket.join(gId);

        const sysMsg = {
            id: 'SYS_' + Date.now(),
            sender: 'System',
            target: gId,
            text: `${creator} telah membuat grup "${groups[gId].name}"`,
            type: 'group',
            isSystem: true,
            timestamp: Date.now(),
            readBy: memberList
        };
        chats.push(sysMsg);

        memberList.forEach(m => {
            io.to(m).emit('added_to_group', { group: groups[gId], sysMsg });
        });

        callback({ success: true, group: groups[gId] });
    });

    // 9. CEK KODE GRUP
    socket.on('check_group_code', ({ code }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const trimmedCode = (code || '').trim();
        let foundGroup = null;
        for (let gId in groups) {
            if (groups[gId].code === trimmedCode) {
                foundGroup = groups[gId];
                break;
            }
        }

        if (!foundGroup) {
            return callback({ success: false, message: 'Kode yang dimasukkan tidak cocok!' });
        }

        callback({
            success: true,
            group: {
                id: foundGroup.id,
                name: foundGroup.name,
                avatar: foundGroup.avatar,
                description: foundGroup.description,
                memberCount: foundGroup.members.length
            }
        });
    });

    // 10. KONFIRMASI GABUNG GRUP
    socket.on('confirm_join_group', ({ username, groupId }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const group = groups[groupId];
        if (!group) return callback({ success: false, message: 'Grup tidak ditemukan!' });

        if (!group.members.includes(username)) {
            group.members.push(username);
        }

        socket.join(groupId);

        const sysMsg = {
            id: 'SYS_' + Date.now(),
            sender: 'System',
            target: groupId,
            text: `${username} bergabung ke dalam grup via kode unik`,
            type: 'group',
            isSystem: true,
            timestamp: Date.now(),
            readBy: group.members
        };
        chats.push(sysMsg);

        group.members.forEach(m => {
            io.to(m).emit('receive_message', sysMsg);
            io.to(m).emit('group_members_updated', { groupId, members: group.members });
        });

        callback({ success: true, group });
    });

    // 11. TAMBAH ANGGOTA GRUP
    socket.on('add_members_to_group', ({ groupId, addedBy, newMembers }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const group = groups[groupId];
        if (!group) return callback({ success: false, message: 'Grup tidak ditemukan!' });

        const addedList = [];
        if (Array.isArray(newMembers)) {
            newMembers.forEach(m => {
                if (!group.members.includes(m)) {
                    group.members.push(m);
                    addedList.push(m);
                }
            });
        }

        if (addedList.length > 0) {
            const sysMsg = {
                id: 'SYS_' + Date.now(),
                sender: 'System',
                target: groupId,
                text: `${addedBy} menambahkan ${addedList.join(', ')} ke dalam grup`,
                type: 'group',
                isSystem: true,
                timestamp: Date.now(),
                readBy: group.members
            };
            chats.push(sysMsg);

            addedList.forEach(m => {
                io.to(m).emit('added_to_group', { group, sysMsg });
            });

            group.members.forEach(m => {
                io.to(m).emit('receive_message', sysMsg);
                io.to(m).emit('group_members_updated', { groupId, members: group.members });
            });
        }

        callback({ success: true, group });
    });

    // 12. KELUAR DARI GRUP
    socket.on('leave_group', ({ username, groupId }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        const group = groups[groupId];
        if (!group) return callback({ success: false, message: 'Grup tidak ditemukan!' });

        const idx = group.members.indexOf(username);
        if (idx !== -1) {
            group.members.splice(idx, 1);
            socket.leave(groupId);

            const sysMsg = {
                id: 'SYS_' + Date.now(),
                sender: 'System',
                target: groupId,
                text: `${username} keluar dari grup`,
                type: 'group',
                isSystem: true,
                timestamp: Date.now(),
                readBy: group.members
            };
            chats.push(sysMsg);

            group.members.forEach(m => {
                io.to(m).emit('receive_message', sysMsg);
                io.to(m).emit('group_members_updated', { groupId, members: group.members });
            });
        }

        callback({ success: true });
    });

    // 13. EDIT INFO GRUP
    socket.on('edit_group', ({ groupId, groupName, groupAvatar, description }, callback) => {
        if (typeof callback !== 'function') callback = () => {};
        if (groups[groupId]) {
            if (groupName) groups[groupId].name = groupName;
            if (groupAvatar !== undefined) groups[groupId].avatar = groupAvatar;
            if (description !== undefined) groups[groupId].description = description;

            groups[groupId].members.forEach(m => {
                io.to(m).emit('group_updated', groups[groupId]);
            });
            callback({ success: true, group: groups[groupId] });
        } else {
            callback({ success: false, message: 'Grup tidak ditemukan' });
        }
    });

    // 14. TYPING INDICATOR
    socket.on('typing_status', ({ sender, target, type, isTyping }) => {
        if (type === 'private') {
            io.to(target).emit('user_typing_status', { sender, target, type, isTyping });
        } else if (type === 'group') {
            const grp = groups[target];
            if (grp && grp.members) {
                grp.members.forEach(m => {
                    if (m !== sender) io.to(m).emit('user_typing_status', { sender, target, type, isTyping });
                });
            }
        }
    });

    // 15. KIRIM PESAN REALTIME (TEKS & GAMBAR BASE64/KAMERA)
    socket.on('send_message', (msgData) => {
        if (!msgData || !msgData.target || !msgData.sender || !msgData.type) return;

        msgData.readBy = [msgData.sender];
        msgData.timestamp = Date.now();
        chats.push(msgData);

        if (msgData.type === 'private') {
            io.to(msgData.target).emit('receive_message', msgData);
            if (msgData.sender !== msgData.target) {
                io.to(msgData.sender).emit('receive_message', msgData);
            }
        } else if (msgData.type === 'group') {
            const grp = groups[msgData.target];
            if (grp && grp.members) {
                grp.members.forEach(m => {
                    io.to(m).emit('receive_message', msgData);
                });
            } else {
                io.to(msgData.target).emit('receive_message', msgData);
            }
        }
    });

    // 16. MARK AS READ
    socket.on('mark_as_read', ({ reader, target, type }) => {
        chats.forEach(m => {
            if (type === 'private' && m.type === 'private' && m.sender === target && m.target === reader) {
                if (!m.readBy.includes(reader)) m.readBy.push(reader);
            } else if (type === 'group' && m.type === 'group' && m.target === target) {
                if (!m.readBy.includes(reader)) m.readBy.push(reader);
            }
        });
        
        if (type === 'group' && groups[target]) {
            groups[target].members.forEach(m => {
                io.to(m).emit('messages_read_updated', { by: reader, target, type });
            });
        } else {
            io.to(target).emit('messages_read_updated', { by: reader, target, type });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('user_status_change', { username: socket.username, status: 'offline' });
        }
    });
});

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 TEACHAT! Server berjalan di http://localhost:${PORT}`);
});