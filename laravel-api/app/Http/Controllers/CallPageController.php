<?php

namespace App\Http\Controllers;

class CallPageController extends Controller
{
    public function show(string $roomCode)
    {
        return view('call', [
            'roomCode' => strtoupper($roomCode),
            'sfuUrl' => config('services.sfu.url'),
        ]);
    }
}
