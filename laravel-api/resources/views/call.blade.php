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
                

                <div class="flex gap-4">
                    <video id="local-video" autoplay playsinline muted class="w-1/2 bg-black rounded-md"></video>
                    <video id="remote-video" autoplay playsinline class="w-1/2 bg-black rounded-md"></video>
                </div>

                <div id="call-controls" class="flex flex-wrap gap-3">
                    <button
                        id="start-call-btn"
                        type="button"
                        class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                        Start Call
                    </button>
                    <button
                        id="toggle-camera-btn"
                        type="button"
                        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        disabled
                    >
                        Camera Off
                    </button>
                    <button
                        id="toggle-mic-btn"
                        type="button"
                        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                        disabled
                    >
                        Mic Off
                    </button>
                    <button
                        id="toggle-screen-share-btn"
                        type="button"
                        class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                        disabled
                    >
                        Share Screen
                    </button>
                    <button
                        id="leave-call-btn"
                        type="button"
                        class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        Leave Call
                    </button>
                </div>
                <p id="call-status" class="text-sm text-gray-700">Waiting to start...</p>
            </div>
        </div>
    </div>
</x-app-layout>
