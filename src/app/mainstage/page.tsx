'use client';

import { useEffect } from 'react';
import { meet } from '@googleworkspace/meet-addons/meet.addons';

export default function MainStage() {
    /**
     * Prepares the add-on Main Stage Client, which signals that the add-on
     * has successfully launched in the main stage.
     */
    useEffect(() => {
        (async () => {
            const session = await meet.addon.createAddonSession({
                cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
            });
            await session.createMainStageClient();
        })();
    }, []);

    return (
        <div className="p-8 h-full flex flex-col">
            <h1 className="text-3xl font-bold mb-6">Meet Audio Streamer - Main Stage</h1>

            <div className="bg-blue-50 p-6 rounded-lg mb-8">
                <p className="mb-4">This is the add-on Main Stage. Everyone in the call can see this.</p>
                <p>Here you can display the transcription results to all meeting participants.</p>
            </div>

            <div className="flex-grow border border-gray-300 rounded-lg p-6 overflow-y-auto">
                <h2 className="text-2xl font-semibold mb-4">Live Transcription</h2>

                <div className="space-y-4">
                    {/* Sample transcript items - in a real implementation, these would come from your backend */}
                    <div className="p-4 bg-white rounded-lg shadow">
                        <div className="font-bold text-blue-600">Speaker 1:</div>
                        <div>Hello everyone, thank you for joining this meeting today.</div>
                    </div>

                    <div className="p-4 bg-white rounded-lg shadow">
                        <div className="font-bold text-green-600">Speaker 2:</div>
                        <div>Thank you for having me. I&apos;m excited to discuss the project.</div>
                    </div>

                    <div className="p-4 bg-yellow-50 rounded-lg shadow border-l-4 border-yellow-500">
                        <div className="font-bold text-purple-600">Speaker 1:</div>
                        <div>Let&apos;s start by reviewing the quarterly results...</div>
                        <div className="text-sm text-gray-500 mt-2">Transcribing...</div>
                    </div>
                </div>
            </div>

            <div className="mt-6 text-sm text-gray-500">
                <p>This is a shared view. All participants can see the transcription in real-time.</p>
            </div>
        </div>
    );
}