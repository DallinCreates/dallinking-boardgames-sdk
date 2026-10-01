// The state inspector's timeline: a snapshot of the engine after everything
// that can change it (actions, joins, starts, timers), so you can look back at
// any point and rewind the engine to it.

const DEFAULT_LIMIT = 500;

function toJson(value) {
    try {
        return { json: JSON.stringify(value === undefined ? null : value), ok: true };
    } catch (error) {
        return { json: JSON.stringify({ '⚠️ not JSON': error instanceof Error ? error.message : String(error) }), ok: false };
    }
}

export function createHistory({ limit = DEFAULT_LIMIT } = {}) {
    let entries = [];
    let nextId = 1;

    return {
        /**
         * Adds a snapshot. With onlyIfChanged, skips it when the state matches
         * the latest entry (timer callbacks that changed nothing).
         */
        record({ kind, label, actor = null, payload, engine, room, error = null, onlyIfChanged = false }) {
            const { json: stateJson, ok: stateOk } = toJson(engine?.state);
            const last = entries[entries.length - 1];
            if (onlyIfChanged && last && last.stateJson === stateJson) return null;

            const entry = {
                id: nextId++,
                at: Date.now(),
                kind,
                label,
                actor,
                payloadJson: payload === undefined ? null : toJson(payload).json,
                stateJson,
                stateOk,
                hasStarted: Boolean(engine?.hasStarted),
                isGameOver: Boolean(engine?.isGameOver),
                room: { phase: room.phase, gameStarted: room.gameStarted, results: room.results },
                error: error ? (error instanceof Error ? error.message : String(error)) : null,
            };
            entries.push(entry);
            if (entries.length > limit) entries = entries.slice(entries.length - limit);
            return entry;
        },

        get: (id) => entries.find((entry) => entry.id === id) || null,
        latest: () => entries[entries.length - 1] || null,
        all: () => entries,

        /** Drops everything after this entry. Returns how many were dropped. */
        truncateAfter(id) {
            const index = entries.findIndex((entry) => entry.id === id);
            if (index === -1) return 0;
            const dropped = entries.length - index - 1;
            entries = entries.slice(0, index + 1);
            return dropped;
        },

        clear() {
            entries = [];
        },
    };
}
