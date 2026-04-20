require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = Number(process.env.PORT || 4000);

// Keep everything room scoped so we can separate each call cleanly.
const roomState = new Map();

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

let worker;

async function createWorker() {
  // mediasoup worker is the core process that does RTP routing.
  worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 20000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 20100),
  });

  worker.on('died', () => {
    console.error('mediasoup worker died. Exiting process.');
    setTimeout(() => process.exit(1), 2000);
  });
}

async function createRoomIfNeeded(roomCode) {
  if (roomState.has(roomCode)) return roomState.get(roomCode);

  const router = await worker.createRouter({ mediaCodecs });
  const room = {
    router,
    peers: new Map(),
  };

  roomState.set(roomCode, room);
  return room;
}

function getPeerOrThrow(room, socketId) {
  const peer = room.peers.get(socketId);
  if (!peer) {
    throw new Error('Peer not found in room.');
  }
  return peer;
}

function getProducerIdsForPeer(room, socketId) {
  const ids = [];
  for (const [peerId, peer] of room.peers.entries()) {
    if (peerId === socketId) continue;
    for (const producer of peer.producers.values()) {
      ids.push(producer.id);
    }
  }
  return ids;
}

io.on('connection', (socket) => {
  const onSignal = (eventNames, handler) => {
    for (const eventName of eventNames) {
      socket.on(eventName, handler);
    }
  };

  onSignal(['join-room', 'joinRoom'], async ({ roomCode }, callback) => {
    try {
      const normalizedRoomCode = String(roomCode || '').toUpperCase();
      if (!normalizedRoomCode) throw new Error('roomCode is required.');

      const room = await createRoomIfNeeded(normalizedRoomCode);

      // Hard limit to 2 users per room (1:1 call).
      if (!room.peers.has(socket.id) && room.peers.size >= 2) {
        callback({ error: 'Room is full.' });
        return;
      }

      room.peers.set(socket.id, {
        socketId: socket.id,
        roomCode: normalizedRoomCode,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
      socket.data.roomCode = normalizedRoomCode;

      socket.join(normalizedRoomCode);
      console.log(`[join-room] socket=${socket.id} room=${normalizedRoomCode} peers=${room.peers.size}`);

      callback({
        routerRtpCapabilities: room.router.rtpCapabilities,
      });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['create-transport', 'createWebRtcTransport'], async ({ direction }, callback) => {
    try {
      const peerEntry = [...roomState.values()].find((room) => room.peers.has(socket.id));
      if (!peerEntry) throw new Error('Join room before creating transport.');

      const room = peerEntry;
      const peer = getPeerOrThrow(room, socket.id);

      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: process.env.LISTEN_IP || '127.0.0.1', announcedIp: process.env.ANNOUNCED_IP || undefined }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      peer.transports.set(transport.id, { transport, direction });
      console.log(`[create-transport] socket=${socket.id} direction=${direction} transport=${transport.id}`);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        direction,
      });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['connect-transport', 'connectTransport'], async ({ transportId, dtlsParameters }, callback) => {
    try {
      const room = [...roomState.values()].find((entry) => entry.peers.has(socket.id));
      if (!room) throw new Error('Room not found.');
      const peer = getPeerOrThrow(room, socket.id);

      const transportInfo = peer.transports.get(transportId);
      if (!transportInfo) throw new Error('Transport not found.');

      await transportInfo.transport.connect({ dtlsParameters });
      console.log(`[connect-transport] socket=${socket.id} transport=${transportId}`);
      callback({ connected: true });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['produce'], async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      const room = [...roomState.values()].find((entry) => entry.peers.has(socket.id));
      if (!room) throw new Error('Room not found.');
      const peer = getPeerOrThrow(room, socket.id);
      const transportInfo = peer.transports.get(transportId);
      if (!transportInfo) throw new Error('Transport not found.');

      const producer = await transportInfo.transport.produce({ kind, rtpParameters });
      peer.producers.set(producer.id, producer);
      console.log(`[produce] socket=${socket.id} kind=${kind} producer=${producer.id}`);

      // Notify other peer that there is a new producer to consume.
      socket.to(peer.roomCode).emit('new-producer', { producerId: producer.id });

      callback({ id: producer.id });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['list-producers', 'listProducers'], (payload, callback) => {
    try {
      const room = [...roomState.values()].find((entry) => entry.peers.has(socket.id));
      if (!room) throw new Error('Room not found.');

      callback({ producerIds: getProducerIdsForPeer(room, socket.id) });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['consume'], async ({ producerId, rtpCapabilities }, callback) => {
    try {
      const room = [...roomState.values()].find((entry) => entry.peers.has(socket.id));
      if (!room) throw new Error('Room not found.');

      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('Cannot consume this producer.');
      }

      const peer = getPeerOrThrow(room, socket.id);
      const recvTransportInfo = [...peer.transports.values()].find((entry) => entry.direction === 'recv');
      if (!recvTransportInfo) throw new Error('Receive transport not found.');

      const consumer = await recvTransportInfo.transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
        appData: { consumerTag: uuidv4() },
      });

      peer.consumers.set(consumer.id, consumer);
      console.log(`[consume] socket=${socket.id} producer=${producerId} consumer=${consumer.id}`);

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  onSignal(['resume-consumer', 'resumeConsumer'], async ({ consumerId }, callback) => {
    try {
      const room = [...roomState.values()].find((entry) => entry.peers.has(socket.id));
      if (!room) throw new Error('Room not found.');
      const peer = getPeerOrThrow(room, socket.id);
      const consumer = peer.consumers.get(consumerId);
      if (!consumer) throw new Error('Consumer not found.');

      await consumer.resume();
      socket.emit('consumer-resumed', { consumerId });
      console.log(`[consumer-resumed] socket=${socket.id} consumer=${consumerId}`);
      callback({ resumed: true });
    } catch (error) {
      callback({ error: error.message });
    }
  });

  socket.on('disconnect', () => {
    for (const [roomCode, room] of roomState.entries()) {
      const peer = room.peers.get(socket.id);
      if (!peer) continue;

      for (const transportInfo of peer.transports.values()) transportInfo.transport.close();
      for (const producer of peer.producers.values()) producer.close();
      for (const consumer of peer.consumers.values()) consumer.close();
      room.peers.delete(socket.id);

      if (room.peers.size === 0) {
        roomState.delete(roomCode);
      }
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

createWorker()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`SFU service listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Could not start mediasoup worker.', error);
    process.exit(1);
  });
