# Fullstack Video Calling (Laravel + mediasoup)

This project contains **two separate services**:

1. `laravel-api` - authentication, room management, and frontend pages.
2. `node-sfu` - Socket.IO signaling + mediasoup SFU media routing.

## Architecture (Clean and Simple)

- `Laravel (Presentation/API Layer)`
  - Breeze auth (register/login/profile)
  - Room APIs
  - Blade UI for creating/joining rooms and rendering call page
- `Laravel (Application Layer)`
  - `RoomService` handles room create/join business rules
- `Laravel (Data Layer)`
  - `RoomRepository` and Eloquent `Room` model
- `Node SFU Service`
  - mediasoup worker + router lifecycle
  - WebRTC transport creation/connection
  - produce / consume / resume-consumer events
  - Socket.IO room signaling

## 1) Run Laravel Service

```bash
cd laravel-api
cp .env.example .env
php artisan key:generate
# Create this MySQL database first (XAMPP): video_call_app
php artisan migrate
npm install
npm run dev
php artisan serve
```

Laravel runs on `http://127.0.0.1:8000` by default.

## 2) Run Node SFU Service

```bash
cd node-sfu
cp .env.example .env
npm install
npm run dev
```

SFU runs on `http://localhost:4000` by default.

## mediasoup Windows note

`mediasoup` may require build tooling on Windows (Visual Studio C++ build tools) depending on your Node version.
For the smoothest local setup:

- Use Node.js 20 LTS for `node-sfu`
- Install Visual Studio Build Tools (Desktop development with C++)

## How Video Call Works (Step-by-Step)

1. User logs in from Laravel authentication pages.
2. User opens Dashboard and creates a room or joins an existing room code.
3. App redirects to `/call/{ROOMCODE}` and loads the call UI.
4. Left video panel (`local-video`) is used for webcam/microphone preview.
5. On **Start Call**:
   - frontend connects to Socket.IO SFU server (`SFU_SERVER_URL`)
   - user joins room (`joinRoom`)
   - mediasoup device is created in browser
   - send transport is created and connected
   - local audio/video tracks are produced to SFU
6. Right video panel (`personalVideo`) is for personal/local playback:
   - user selects a file from `videoInput`
   - browser creates a local object URL (`URL.createObjectURL`)
   - selected video plays directly in right panel
   - this right panel playback does not depend on socket or mediasoup
7. On **Leave**:
   - socket disconnects
   - transports close
   - local tracks stop
   - personal video player is reset

## API Endpoints

- `POST /api/rooms` (auth required) - create room
- `POST /api/rooms/join` (auth required) - join room

## Important Files

- `laravel-api/app/Services/RoomService.php`
- `laravel-api/app/Repositories/RoomRepository.php`
- `laravel-api/app/Http/Controllers/Api/RoomController.php`
- `laravel-api/resources/js/app.js`
- `laravel-api/resources/views/dashboard.blade.php`
- `laravel-api/resources/views/call.blade.php`
- `laravel-api/server.js` (moved signaling server file)
