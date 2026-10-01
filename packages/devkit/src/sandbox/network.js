// Simulated network conditions between the sandbox and each screen: latency
// with jitter, and connections that drop and come back.
//
// Delivery stays in order per direction, as on the platform's WebSocket and
// WebRTC channels: jitter varies the delay, it never reorders messages.

export const LAG_PRESETS = {
    off: { label: 'Off', latency: 0, jitter: 0 },
    wifi: { label: 'Wi-Fi (40 ms)', latency: 40, jitter: 15 },
    '4g': { label: '4G (120 ms)', latency: 120, jitter: 50 },
    '3g': { label: 'Slow 3G (400 ms)', latency: 400, jitter: 150 },
    awful: { label: 'Terrible (1.2 s)', latency: 1200, jitter: 600 },
};

export function createNetworkSimulator() {
    // Players get the default; the board runs the engine in Local hosting, so
    // it has no lag unless you give it some.
    let playerPreset = 'off';
    const overrides = new Map(); // clientId -> preset name
    const queues = new Map(); // `in:id` / `out:id` -> { items: [{ at, deliver }], timer }
    const offline = new Set();
    const held = new Map(); // clientId -> [deliver] sent while offline

    function presetFor(clientId) {
        const name = overrides.get(clientId) || (clientId === 'board' ? 'off' : playerPreset);
        return LAG_PRESETS[name] || LAG_PRESETS.off;
    }

    // One way is half the round trip.
    function delayFor(clientId) {
        const { latency, jitter } = presetFor(clientId);
        if (!latency && !jitter) return 0;
        return Math.max(0, latency / 2 + ((Math.random() * 2 - 1) * jitter) / 2);
    }

    function run(deliver) {
        try {
            deliver();
        } catch (error) {
            console.error('⚠️ Sandbox delivery error:', error);
        }
    }

    function pump(queue) {
        if (queue.timer || queue.items.length === 0) return;
        queue.timer = setTimeout(() => {
            queue.timer = null;
            const now = Date.now();
            while (queue.items.length && queue.items[0].at <= now) run(queue.items.shift().deliver);
            pump(queue);
        }, Math.max(0, queue.items[0].at - Date.now()));
    }

    function enqueue(key, clientId, deliver) {
        let queue = queues.get(key);
        if (!queue) {
            queue = { items: [], timer: null };
            queues.set(key, queue);
        }
        const delay = delayFor(clientId);
        if (delay === 0 && queue.items.length === 0) {
            run(deliver);
            return;
        }
        const last = queue.items.length ? queue.items[queue.items.length - 1].at : 0;
        queue.items.push({ at: Math.max(Date.now() + delay, last), deliver });
        pump(queue);
    }

    function clearQueue(key) {
        const queue = queues.get(key);
        if (!queue) return;
        clearTimeout(queue.timer);
        queues.delete(key);
    }

    return {
        /** A message to a screen. Lost while that screen is offline. */
        toClient(clientId, deliver) {
            if (offline.has(clientId)) return;
            enqueue(`out:${clientId}`, clientId, () => {
                if (!offline.has(clientId)) deliver();
            });
        },

        /**
         * A message from a screen. While offline it's held and sent after the
         * reconnect, as the platform's bridge resends unacknowledged actions.
         */
        fromClient(clientId, deliver) {
            if (offline.has(clientId)) {
                if (!held.has(clientId)) held.set(clientId, []);
                held.get(clientId).push(deliver);
                return;
            }
            enqueue(`in:${clientId}`, clientId, deliver);
        },

        disconnect(clientId) {
            if (offline.has(clientId)) return false;
            offline.add(clientId);
            // Whatever was on its way to the screen is gone with the connection.
            clearQueue(`out:${clientId}`);
            return true;
        },

        /** Brings a screen back. Returns what it sent while offline, or null if it wasn't. */
        reconnect(clientId) {
            if (!offline.has(clientId)) return null;
            offline.delete(clientId);
            const pending = held.get(clientId) || [];
            held.delete(clientId);
            return pending;
        },

        isOffline: (clientId) => offline.has(clientId),

        /** clientId null sets every player's default; a preset of null clears an override. */
        setLag(clientId, preset) {
            if (preset && !LAG_PRESETS[preset]) return;
            if (!clientId) {
                playerPreset = preset || 'off';
            } else if (preset) {
                overrides.set(clientId, preset);
            } else {
                overrides.delete(clientId);
            }
        },

        forget(clientId) {
            offline.delete(clientId);
            held.delete(clientId);
            clearQueue(`in:${clientId}`);
            clearQueue(`out:${clientId}`);
        },

        /** Drops connections and queues; lag settings stay. */
        reset() {
            [...queues.keys()].forEach(clearQueue);
            offline.clear();
            held.clear();
        },

        describe() {
            return {
                playerPreset,
                overrides: Object.fromEntries(overrides),
                offline: [...offline],
                held: Object.fromEntries([...held].map(([id, list]) => [id, list.length])),
                presets: Object.fromEntries(Object.entries(LAG_PRESETS).map(([name, preset]) => [name, preset.label])),
            };
        },
    };
}
