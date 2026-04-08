/**
 * Database module - IndexedDB via Dexie.js
 * Handles all persistent storage for operations data.
 */
const Database = (() => {
    let db;

    function init() {
        db = new Dexie('KPITool2026');

        db.version(1).stores({
            operations: '++id, type, category, date, store, staff, week, [store+date], [category+date], [type+date], [staff+date], [staff+week], [type+week]',
            imports: '++id, filename, date, rowCount',
            settings: 'key'
        });

        // v2: richer import log
        db.version(2).stores({
            operations: '++id, type, category, date, store, staff, week, [store+date], [category+date], [type+date], [staff+date], [staff+week], [type+week]',
            imports: '++id, source, filename, date, rowCount, dateFrom, dateTo, storeCount, stores',
            settings: 'key'
        });

        // v3: add reference index for deduplication
        db.version(3).stores({
            operations: '++id, reference, type, category, date, store, staff, week, [store+date], [category+date], [type+date], [staff+date], [staff+week], [type+week]',
            imports: '++id, source, filename, date, rowCount, dateFrom, dateTo, storeCount, stores',
            settings: 'key'
        });

        return db;
    }

    /**
     * Add operations in bulk, computing the business week for each record.
     * weekFn: function(dateStr) => weekNumber
     * source: string identifying the import source (for dedup)
     */
    async function bulkAddOperations(records, onProgress, weekFn, source) {
        const BATCH_SIZE = 1000;
        let added = 0;

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            for (const rec of batch) {
                if (weekFn) rec.week = weekFn(rec.date);
                if (source) rec.source = source;
            }
            await db.operations.bulkAdd(batch);
            added += batch.length;
            if (onProgress) onProgress(added, records.length);
        }

        return added;
    }

    async function logImport(meta) {
        return db.imports.add({
            source: meta.source || 'unknown',
            filename: meta.filename,
            date: new Date().toISOString(),
            rowCount: meta.rowCount || 0,
            dateFrom: meta.dateFrom || null,
            dateTo: meta.dateTo || null,
            storeCount: meta.storeCount || 0,
            stores: meta.stores || []
        });
    }

    /**
     * Build a Set of fingerprints for existing records that match
     * any of the given reference values (Order Numbers) AND the same source.
     * Fingerprint = "reference|price|category"
     * Dedup is per-source: the same order from different sources is NOT a duplicate.
     */
    async function getExistingFingerprints(references, source) {
        if (!references.length) return new Set();
        const existing = await db.operations
            .where('reference')
            .anyOf(references)
            .toArray();
        const fps = new Set();
        for (const r of existing) {
            if (r.source === source) {
                fps.add(`${r.reference}|${r.price}|${r.category}`);
            }
        }
        return fps;
    }

    async function getRecordCount() {
        return db.operations.count();
    }

    async function getDateRange() {
        const first = await db.operations.orderBy('date').first();
        const last = await db.operations.orderBy('date').last();
        if (!first || !last) return null;
        return { from: first.date, to: last.date };
    }

    async function getDistinctValues(field) {
        return db.operations.orderBy(field).uniqueKeys();
    }

    async function queryOperations(filters = {}, page = 1, pageSize = 50) {
        let collection = db.operations.toCollection();

        if (filters.type && filters.type !== 'all') {
            collection = db.operations.where('type').equalsIgnoreCase(filters.type);
        }

        if (filters.store && filters.store !== 'all') {
            collection = db.operations.where('store').equals(filters.store);
        }

        const total = await collection.count();
        const records = await collection
            .offset((page - 1) * pageSize)
            .limit(pageSize)
            .toArray();

        let filtered = records;
        if (filters.search) {
            const term = filters.search.toLowerCase();
            filtered = records.filter(r =>
                Object.values(r).some(v =>
                    String(v).toLowerCase().includes(term)
                )
            );
        }

        return { records: filtered, total, page, pageSize };
    }

    async function getOperationsForKPI(filters = {}) {
        let collection = db.operations.toCollection();

        if (filters.store && filters.store !== 'all') {
            collection = db.operations.where('store').equals(filters.store);
        }

        if (filters.dateFrom && filters.dateTo) {
            collection = db.operations
                .where('date')
                .between(filters.dateFrom, filters.dateTo);
        }

        return collection.toArray();
    }

    async function getImportHistory() {
        return db.imports.orderBy('date').reverse().toArray();
    }

    async function getSetting(key) {
        const row = await db.settings.get(key);
        return row ? row.value : null;
    }

    async function setSetting(key, value) {
        return db.settings.put({ key, value });
    }

    async function exportAll() {
        const operations = await db.operations.toArray();
        const imports = await db.imports.toArray();
        const settings = await db.settings.toArray();
        return { operations, imports, settings, exportDate: new Date().toISOString() };
    }

    async function importAll(data) {
        await db.operations.clear();
        await db.imports.clear();
        await db.settings.clear();
        if (data.operations) await db.operations.bulkAdd(data.operations);
        if (data.imports) await db.imports.bulkAdd(data.imports);
        if (data.settings) await db.settings.bulkAdd(data.settings);
    }

    async function clearAll() {
        await db.operations.clear();
        await db.imports.clear();
    }

    return {
        init,
        bulkAddOperations,
        logImport,
        getExistingFingerprints,
        getRecordCount,
        getDateRange,
        getDistinctValues,
        queryOperations,
        getOperationsForKPI,
        getImportHistory,
        getSetting,
        setSetting,
        exportAll,
        importAll,
        clearAll
    };
})();
