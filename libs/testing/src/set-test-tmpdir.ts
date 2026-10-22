import { pointTmpdirAtMemory } from './point-tmpdir-at-memory';

// Each test's SQLite databases fsync every commit, and on a small host's disk one fsync can wait
// seconds behind other writes. On tmpfs an fsync costs nothing, so a test's temp directory goes
// there when the host has room.
pointTmpdirAtMemory(process.env);
