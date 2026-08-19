const queueNames = ['email', 'files', 'indexing', 'metadata', 'publication'] as const;

// Queue consumers are intentionally not started until validated environment and adapters exist.
console.log(
  JSON.stringify({
    level: 'info',
    event: 'worker.foundation.ready',
    queues: queueNames,
    timestamp: new Date().toISOString(),
  }),
);
