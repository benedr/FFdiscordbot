import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DATA_PATH = 'data/users.json';

function ensureFile() {
    const dir = dirname(DATA_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(DATA_PATH)) writeFileSync(DATA_PATH, JSON.stringify({}, null, 2));
}

export function loadUsers() {
    try {
        ensureFile();
        const raw = readFileSync(DATA_PATH, 'utf8');
        return JSON.parse(raw || '{}');
    } catch {
        return {};
    }
}

export function saveUsers(users) {
    ensureFile();
    writeFileSync(DATA_PATH, JSON.stringify(users, null, 2));
}


