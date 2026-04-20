<?php

namespace App\Services;

use App\Models\Room;
use App\Models\User;
use App\Repositories\RoomRepository;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

class RoomService
{
    public function __construct(private readonly RoomRepository $roomRepository)
    {
    }

    public function createRoom(User $user): Room
    {
        return $this->roomRepository->create([
            'code' => strtoupper(Str::random(8)),
            'created_by' => $user->id,
            'participant_one_id' => $user->id,
            'status' => 'waiting',
        ]);
    }

    public function joinRoom(string $roomCode, User $user): Room
    {
        $room = $this->roomRepository->findByCode($roomCode);

        if (! $room) {
            throw ValidationException::withMessages([
                'room_code' => ['Room not found.'],
            ]);
        }

        if ($room->participant_one_id !== $user->id && ! $room->participant_one_id) {
            $room->participant_one_id = $user->id;
        } elseif ($room->participant_one_id !== $user->id && $room->participant_two_id !== $user->id && $room->participant_two_id) {
            throw ValidationException::withMessages([
                'room_code' => ['Room is full. Only two users are allowed.'],
            ]);
        } elseif ($room->participant_two_id !== $user->id) {
            $room->participant_two_id = $user->id;
        }

        $room->status = $room->participant_one_id && $room->participant_two_id ? 'ready' : 'waiting';

        return $this->roomRepository->save($room);
    }
}
