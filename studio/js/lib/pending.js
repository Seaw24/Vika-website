export function createPendingStore({ readText, writeText }) {
  let memory = [];
  let volatile = false;
  return {
    read() {
      if (!volatile) {
        try {
          const rows = JSON.parse(readText());
          if (Array.isArray(rows)) return rows;
        } catch { /* Keep using memory if storage cannot be read. */ }
      }
      return memory;
    },
    write(rows) {
      memory = rows;
      try {
        writeText(JSON.stringify(rows));
        volatile = false;
      } catch {
        volatile = true;
      }
    },
  };
}

// Remove acknowledged rows from the latest snapshot, preserving concurrent additions.
export function createPendingQueue({ read, write, send }) {
  let flushing = null;
  async function drain() {
    while (read().length) {
      const row = read()[0];
      try {
        if (!(await send(row))) break;
      } catch {
        break;
      }
      write(read().filter((pending) => pending.client_id !== row.client_id));
    }
    return read().length;
  }
  return {
    add(row) { write([...read(), row]); },
    flush() {
      flushing ??= drain().finally(() => { flushing = null; });
      return flushing;
    },
  };
}
