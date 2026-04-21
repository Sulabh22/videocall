<?php

namespace App\Http\Controllers\Api;

use App\Http\Requests\JoinRoomRequest;
use App\Http\Requests\StoreRoomRequest;
use App\Http\Controllers\Controller;
use App\Services\RoomService;

class RoomController extends Controller
{
    public function __construct(private readonly RoomService $roomService)
    {
    }

    public function store(StoreRoomRequest $request)
    {
        $room = $this->roomService->createRoom($request->user());

        return response()->json([
            'message' => 'Room created successfully.',
            'room' => $room,
        ], 201);
    }

    public function join(JoinRoomRequest $request)
    {
        $room = $this->roomService->joinRoom(
            strtoupper($request->validated('room_code')),
            $request->user()
        );

        return response()->json([
            'message' => 'Joined room successfully.',
            'room' => $room,
        ]);
    }
}
