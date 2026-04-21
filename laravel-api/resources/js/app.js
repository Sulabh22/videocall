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
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const toggleMicBtn = document.getElementById('toggle-mic-btn');
    const toggleScreenShareBtn = document.getElementById('toggle-screen-share-btn');
    const leaveBtn = document.getElementById('leave-call-btn');
    const status = document.getElementById('call-status');

    let socket;
    let device;
    let localStream;
    let remoteStream = new MediaStream();
    let sendTransport;
    let recvTransport;
    let audioProducer;
    let videoProducer;
    let cameraOn = false;
    let micOn = false;
    let isScreenSharing = false;
    let screenVideoTrack = null;
    const consumedProducerIds = new Set();

    remoteVideo.srcObject = remoteStream;

    const updateStatus = (message) => {
        status.textContent = message;
    };

    const updateCameraButton = () => {
        if (!toggleCameraBtn) return;

        if (!mediaDevicesSupported || !sendTransport) {
            toggleCameraBtn.textContent = 'Camera Off';
            toggleCameraBtn.disabled = true;
            return;
        }

        toggleCameraBtn.disabled = false;
        toggleCameraBtn.textContent = cameraOn ? 'Camera Off' : 'Camera On';
    };

    const updateMicButton = () => {
        if (!toggleMicBtn) return;

        if (!mediaDevicesSupported || !sendTransport) {
            toggleMicBtn.textContent = 'Mic Off';
            toggleMicBtn.disabled = true;
            return;
        }

        toggleMicBtn.disabled = false;
        toggleMicBtn.textContent = micOn ? 'Mic Off' : 'Mic On';
    };

    const updateScreenShareButton = () => {
        if (!toggleScreenShareBtn) return;

        if (!sendTransport || !navigator.mediaDevices?.getDisplayMedia) {
            toggleScreenShareBtn.textContent = 'Share Screen';
            toggleScreenShareBtn.disabled = true;
            return;
        }

        toggleScreenShareBtn.disabled = false;
        toggleScreenShareBtn.textContent = isScreenSharing ? 'Stop Sharing' : 'Share Screen';
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

    const stopScreenSharing = async (notifyServer = true) => {
        if (!isScreenSharing) return;

        if (screenVideoTrack) {
            screenVideoTrack.stop();
            screenVideoTrack = null;
        }

        if (cameraOn) {
            const camTrack = localStream?.getVideoTracks?.()[0];
            if (camTrack && videoProducer) {
                await videoProducer.replaceTrack({ track: camTrack });
            }
        } else if (videoProducer) {
            videoProducer.close();
            videoProducer = null;
        }

        isScreenSharing = false;
        updateScreenShareButton();
        updateCameraButton();

        if (notifyServer && socket?.connected) {
            await request('toggleScreenShare', { enabled: false });
        }
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
            const producer = await sendTransport.produce({ track });
            if (track.kind === 'video') {
                videoProducer = producer;
                cameraOn = true;
            }
            if (track.kind === 'audio') {
                audioProducer = producer;
                micOn = true;
            }
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

            socket.on('call-started', ({ by }) => {
                updateStatus(by === socket.id ? 'Call started.' : 'Other participant started the call.');
            });

            socket.on('peer-camera-toggled', ({ by, enabled }) => {
                if (by !== socket.id) {
                    updateStatus(`Remote camera ${enabled ? 'on' : 'off'}.`);
                }
            });

            socket.on('peer-left', () => {
                updateStatus('Other participant left the call.');
            });

            socket.on('peer-mic-toggled', ({ by, enabled }) => {
                if (by !== socket.id) {
                    updateStatus(`Remote mic ${enabled ? 'on' : 'off'}.`);
                }
            });

            socket.on('peer-screen-share-toggled', ({ by, enabled }) => {
                if (by !== socket.id) {
                    updateStatus(`Remote screen share ${enabled ? 'started' : 'stopped'}.`);
                }
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
            updateCameraButton();
            updateMicButton();
            updateScreenShareButton();

            await request('startCall', { roomCode });
            if (startBtn) startBtn.disabled = true;

            updateStatus(localStream ? 'Call is live.' : 'Call is live (receive-only mode).');
        } catch (error) {
            updateStatus(error.message || 'Could not start call.');
        }
    });

    toggleCameraBtn?.addEventListener('click', async () => {
        try {
            if (!sendTransport) {
                updateStatus('Start call first, then control camera.');
                return;
            }

            if (cameraOn) {
                if (isScreenSharing) {
                    updateStatus('Stop screen sharing before turning camera off.');
                    return;
                }

                const oldTrack = localStream?.getVideoTracks?.()[0];

                if (videoProducer) {
                    videoProducer.close();
                    videoProducer = null;
                }

                if (oldTrack) {
                    oldTrack.stop();
                    localStream.removeTrack(oldTrack);
                }

                cameraOn = false;
                localVideo.srcObject = localStream;
            } else {
                const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                const newVideoTrack = camStream.getVideoTracks()[0];
                if (!newVideoTrack) throw new Error('Could not capture video track.');

                if (!localStream) localStream = new MediaStream();
                localStream.addTrack(newVideoTrack);
                localVideo.srcObject = localStream;

                videoProducer = await sendTransport.produce({ track: newVideoTrack });
                cameraOn = true;
            }

            updateCameraButton();

            if (socket?.connected) {
                await request('toggleCamera', { enabled: cameraOn });
            }

            updateStatus(`Your camera is now ${cameraOn ? 'on' : 'off'}.`);
        } catch (error) {
            updateStatus(error.message || 'Could not toggle camera.');
        }
    });

    toggleMicBtn?.addEventListener('click', async () => {
        try {
            if (!sendTransport) {
                updateStatus('Start call first, then control mic.');
                return;
            }

            if (micOn) {
                const oldTrack = localStream?.getAudioTracks?.()[0];

                if (audioProducer) {
                    audioProducer.close();
                    audioProducer = null;
                }

                if (oldTrack) {
                    oldTrack.stop();
                    localStream.removeTrack(oldTrack);
                }

                micOn = false;
            } else {
                const micStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                const newAudioTrack = micStream.getAudioTracks()[0];
                if (!newAudioTrack) throw new Error('Could not capture audio track.');

                if (!localStream) localStream = new MediaStream();
                localStream.addTrack(newAudioTrack);

                audioProducer = await sendTransport.produce({ track: newAudioTrack });
                micOn = true;
            }

            updateMicButton();

            if (socket?.connected) {
                await request('toggleMic', { enabled: micOn });
            }

            updateStatus(`Your mic is now ${micOn ? 'on' : 'off'}.`);
        } catch (error) {
            updateStatus(error.message || 'Could not toggle mic.');
        }
    });

    toggleScreenShareBtn?.addEventListener('click', async () => {
        try {
            if (!sendTransport || !videoProducer) {
                updateStatus('Start call with camera first, then share screen.');
                return;
            }

            if (isScreenSharing) {
                await stopScreenSharing(true);
                updateStatus('Screen sharing stopped.');
                return;
            }

            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const displayTrack = displayStream.getVideoTracks()[0];
            if (!displayTrack) throw new Error('Could not capture screen track.');

            screenVideoTrack = displayTrack;
            screenVideoTrack.onended = async () => {
                try {
                    await stopScreenSharing(true);
                    updateStatus('Screen sharing stopped.');
                } catch (error) {
                    updateStatus(error.message || 'Could not stop screen sharing cleanly.');
                }
            };

            await videoProducer.replaceTrack({ track: displayTrack });
            isScreenSharing = true;
            updateScreenShareButton();
            updateStatus('Screen sharing started.');

            if (socket?.connected) {
                await request('toggleScreenShare', { enabled: true });
            }
        } catch (error) {
            updateStatus(error.message || 'Could not start screen sharing.');
        }
    });

    leaveBtn?.addEventListener('click', async () => {
        if (isScreenSharing) {
            await stopScreenSharing(false);
        }
        if (socket) socket.disconnect();
        if (videoProducer) videoProducer.close();
        if (audioProducer) audioProducer.close();
        if (sendTransport) sendTransport.close();
        if (recvTransport) recvTransport.close();
        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;
        videoProducer = null;
        audioProducer = null;
        cameraOn = false;
        micOn = false;
        isScreenSharing = false;
        screenVideoTrack = null;
        remoteStream = new MediaStream();
        consumedProducerIds.clear();
        localVideo.srcObject = null;
        remoteVideo.srcObject = remoteStream;
        if (startBtn) startBtn.disabled = false;
        updateCameraButton();
        updateMicButton();
        updateScreenShareButton();
        updateStatus('You left the room.');
    });
}
