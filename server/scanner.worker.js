const { parentPort, workerData } = require('worker_threads');
const { probeUbiquiti } = require('./ubiquiti.service');

async function pLimit(tasks, concurrency = 50) {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
        const p = task().then(r => { executing.delete(p); return r; });
        executing.add(p);
        results.push(p);
        if (executing.size >= concurrency) await Promise.race(executing);
    }
    return Promise.allSettled(results);
}

async function runWorker() {
    const { hostIPs, BATCH = 40 } = workerData;
    let scannedCount = 0;
    const totalCount = hostIPs.length;
    const allDevices = [];

    try {
        for (let i = 0; i < hostIPs.length; i += BATCH) {
            const batchIPs = hostIPs.slice(i, i + BATCH);
            // Execute SSH checks with concurrency limiter to avoid fd/socket exhaustion
            const batchResults = await pLimit(batchIPs.map(ip => () => probeUbiquiti(ip)), 50);

            const foundDevices = batchResults
                .filter(r => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value);

            allDevices.push(...foundDevices);
            scannedCount += batchIPs.length;

            parentPort.postMessage({
                type: 'progress',
                data: {
                    scanned: scannedCount,
                    total: totalCount,
                    found: foundDevices,
                    percent: Math.round((scannedCount / totalCount) * 100)
                }
            });
        }

        parentPort.postMessage({
            type: 'complete',
            data: {
                success: true,
                scanned: scannedCount,
                total: totalCount,
                devices: allDevices
            }
        });
    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            data: { message: error.message }
        });
    }
}

runWorker();
