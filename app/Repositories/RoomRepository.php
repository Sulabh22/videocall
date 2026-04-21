<?php

namespace App\Repositories;

use App\Models\Room;

class RoomRepository
{
    public function create(array $data): Room
    {
        return Room::create($data);
    }

    public function findByCode(string $roomCode): ?Room
    {
        return Room::where('code', $roomCode)->first();
    }

    public function save(Room $room): Room
    {
        $room->save();

        return $room;
    }
}
