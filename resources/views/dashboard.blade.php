<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Dashboard') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                <div class="p-6 text-gray-900">
                    <p class="mb-4">{{ __("You're logged in!") }}</p>
                    <div id="room-actions" class="space-y-4">
                        <button id="create-room-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-md">
                            Create a Call Room
                        </button>

                        <div class="flex gap-2">
                            <input
                                id="room-code-input"
                                type="text"
                                maxlength="8"
                                placeholder="Enter Room Code"
                                class="border-gray-300 rounded-md shadow-sm uppercase"
                            />
                            <button id="join-room-btn" class="px-4 py-2 bg-emerald-600 text-white rounded-md">
                                Join Room
                            </button>
                        </div>

                        <p id="room-message" class="text-sm text-gray-700"></p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</x-app-layout>
