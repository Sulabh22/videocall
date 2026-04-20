<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            Video Call Room: {{ $roomCode }}
        </h2>
    </x-slot>

    <div class="py-8">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div
                id="call-root"
                data-room-code="{{ $roomCode }}"
                data-sfu-url="{{ $sfuUrl }}"
                class="bg-white overflow-hidden shadow-sm sm:rounded-lg p-6 space-y-4"
            >
                <p class="text-gray-700">
                    Open this same room code on another account/device to start a 1:1 call.
                </p>

                <div class="flex gap-4">
                    <video id="local-video" autoplay playsinline muted class="w-1/2 bg-black rounded-md"></video>
                    <video id="remote-video" autoplay playsinline class="w-1/2 bg-black rounded-md"></video>
                </div>

                <div class="flex gap-3">
                    <button id="start-call-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-md">
                        Start Call
                    </button>
                    <button id="leave-call-btn" class="px-4 py-2 bg-rose-600 text-white rounded-md">
                        Leave
                    </button>
                </div>

                <p id="call-status" class="text-sm text-gray-700">Waiting to start...</p>
            </div>
        </div>
    </div>
</x-app-layout>
