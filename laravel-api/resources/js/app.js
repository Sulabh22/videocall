import './bootstrap';

import Alpine from 'alpinejs';
import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

window.Alpine = Alpine;

Alpine.start();

const roomActionsRoot = document.getElementById('room-actions');
const callRoot = document.getElementById('call-root');

if (roomActionsRoot) {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const roomMessage = document.getElementById('room-message');

    // Create room through Laravel API, then move user to call page.
    createBtn?.addEventListener('click', async () => {
        try {
            const { data } = await window.axios.post('/api/rooms');
            window.location.href = `/call/${data.room.code}`;
        } catch (error) {
            roomMessage.textContent = error?.response?.data?.message || 'Could not create room.';
        }
    });

    // Join room through API validation before opening call page.
    joinBtn?.addEventListener('click', async () => {
        const roomCode = roomCodeInput?.value?.trim()?.toUpperCase();

        try {
            await window.axios.post('/api/rooms/join', { room_code: roomCode });
            window.location.href = `/call/${roomCode}`;
        } catch (error) {
            roomMessage.textContent = error?.response?.data?.message || 'Could not join room.';
        }
    });
}

if (callRoot) {
    const roomCode = callRoot.dataset.roomCode;
    const sfuUrl = callRoot.dataset.sfuUrl;
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const startBtn = document.getElementById('start-call-btn');
    const leaveBtn = document.getElementById('leave-call-btn');
    const status = document.getElementById('call-status');

    let socket;
    let device;
    let localStream;
    let remoteStream = new MediaStream();
    let sendTransport;
    let recvTransport;
    const consumedProducerIds = new Set();

    remoteVideo.srcObject = remoteStream;

    const updateStatus = (message) => {
        status.textContent = message;
    };

    const mediaDevicesSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    if (!mediaDevicesSupported) {
        updateStatus('Camera API unavailable on this origin. Joining in receive-only mode.');
    }

    // Small helper to convert Socket.IO callback APIs into Promise APIs.
    const request = (event, payload = {}) => {
        return new Promise((resolve, reject) => {
            socket.emit(event, payload, (response) => {
                if (response?.error) {
                    reject(new Error(response.error));
                    return;
                }
                resolve(response);
            });
        });
    };

    const consumeProducer = async (producerId) => {
        if (!producerId || !recvTransport || consumedProducerIds.has(producerId)) return;

        const data = await request('consume', {
            producerId,
            rtpCapabilities: device.rtpCapabilities,
        });

        const consumer = await recvTransport.consume({
            id: data.id,
            producerId: data.producerId,
            kind: data.kind,
            rtpParameters: data.rtpParameters,
        });

        if (!remoteVideo.srcObject) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }

        remoteStream.addTrack(consumer.track);
        consumedProducerIds.add(producerId);
        console.log('Consumer received:', consumer);
        console.log('Track:', consumer.track);

        await request('resumeConsumer', { consumerId: consumer.id });
        remoteVideo.play().catch(() => {
            // Autoplay can still be blocked by browser policy.
        });
    };

    const setupSendTransport = async () => {
        // If local media is unavailable, allow receive-only mode.
        if (!localStream || localStream.getTracks().length === 0) {
            return;
        }

        const params = await request('createWebRtcTransport', { direction: 'send' });
        sendTransport = device.createSendTransport(params);

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await request('connectTransport', {
                    transportId: sendTransport.id,
                    dtlsParameters,
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });

        sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
                const { id } = await request('produce', {
                    transportId: sendTransport.id,
                    kind,
                    rtpParameters,
                });
                callback({ id });
            } catch (error) {
                errback(error);
            }
        });

        for (const track of localStream.getTracks()) {
            await sendTransport.produce({ track });
        }
    };

    const setupRecvTransport = async () => {
        const params = await request('createWebRtcTransport', { direction: 'recv' });
        recvTransport = device.createRecvTransport(params);

        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await request('connectTransport', {
                    transportId: recvTransport.id,
                    dtlsParameters,
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });

        const { producerIds } = await request('listProducers');
        for (const producerId of producerIds) {
            await consumeProducer(producerId);
        }
    };

    startBtn?.addEventListener('click', async () => {
        try {
            updateStatus('Connecting to SFU server...');
            socket = io(sfuUrl, { transports: ['websocket'] });

            socket.on('new-producer', async ({ producerId }) => {
                console.log('new-producer event', producerId);
                await consumeProducer(producerId);
            });

            socket.on('consumer-resumed', ({ consumerId }) => {
                console.log('consumer-resumed event', consumerId);
            });

            const joinResult = await new Promise((resolve, reject) => {
                socket.emit('joinRoom', { roomCode }, (response) => {
                    if (response?.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                });
            });

            device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: joinResult.routerRtpCapabilities });

            if (mediaDevicesSupported) {
                updateStatus('Requesting camera/microphone...');
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    localVideo.srcObject = localStream;
                } catch (mediaError) {
                    localStream = null;
                    updateStatus(`Local camera unavailable (${mediaError.message}). Joining as receive-only...`);
                }
            } else {
                localStream = null;
            }

            await setupRecvTransport();
            await setupSendTransport();

            updateStatus(localStream ? 'Call is live.' : 'Call is live (receive-only mode).');
        } catch (error) {
            updateStatus(error.message || 'Could not start call.');
        }
    });

    leaveBtn?.addEventListener('click', () => {
        if (socket) socket.disconnect();
        if (sendTransport) sendTransport.close();
        if (recvTransport) recvTransport.close();
        localStream?.getTracks().forEach((track) => track.stop());
        remoteStream = new MediaStream();
        consumedProducerIds.clear();
        remoteVideo.srcObject = remoteStream;
        updateStatus('You left the room.');
    });
}
