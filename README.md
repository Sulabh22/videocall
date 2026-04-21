# Video Call App (Laravel + Socket.IO + mediasoup)

This repository is a fullstack 1:1 video calling app in a **single project**:

- Laravel handles authentication, room management, and Blade UI.
- A Node.js SFU server (`server.js`) handles signaling and mediasoup media routing.

## Stack

- PHP 8.1+, Laravel 10, Laravel Breeze
- MySQL (XAMPP compatible)
- Node.js + Vite (frontend assets)
- Socket.IO + mediasoup (WebRTC SFU)

## Project Structure

- `app/Services/RoomService.php` - room creation and join business logic
- `app/Repositories/RoomRepository.php` - room data access
- `app/Http/Controllers/Api/RoomController.php` - room API endpoints
- `resources/views/dashboard.blade.php` - create/join room UI
- `resources/views/call.blade.php` - call page UI
- `resources/js/app.js` - frontend call logic and WebRTC client flow
- `server.js` - Socket.IO + mediasoup SFU server

## Setup

1. Clone and enter the project.
2. Install PHP dependencies:

```bash
composer install
```

3. Install Node dependencies:

```bash
npm install
```

4. Configure environment:

```bash
cp .env.example .env
php artisan key:generate
```

5. Create a MySQL database (example: `video_call_app`) and update `.env` if needed.
6. Run migrations:

```bash
php artisan migrate
```

## Run the App (3 terminals)

Terminal 1 - Laravel server:

```bash
php artisan serve
```

Terminal 2 - Vite dev server:

```bash
npm run dev
```

Terminal 3 - SFU server:

```bash
node server.js
```

Default local URLs:

- Laravel: `http://127.0.0.1:8000`
- SFU: `http://localhost:4000`

## Environment Notes

- `SFU_SERVER_URL` is used by the call page and defaults to `http://localhost:4000`.
- mediasoup uses UDP/TCP ports from `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` (see `server.js` defaults).
- `LISTEN_IP` and `ANNOUNCED_IP` can be set in `.env` for different network setups.

## API Endpoints

Authenticated routes:

- `POST /api/rooms` - create a room
- `POST /api/rooms/join` - join a room by code

## Call Flow (High Level)

1. User registers/logs in using Laravel Breeze.
2. From dashboard, user creates a room or joins with a room code.
3. User enters `/call/{roomCode}`.
4. Frontend connects to SFU using Socket.IO.
5. WebRTC transports are created and connected through mediasoup.
6. Local tracks are produced; remote tracks are consumed.
7. Camera/mic/screen-share toggles are synced through signaling events.

## Windows + mediasoup

If mediasoup fails to install/build on Windows:

- Use Node.js 20 LTS.
- Install Visual Studio Build Tools (Desktop development with C++).
