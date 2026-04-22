/**
 * CapiMetrics 2026 - Main Application Controller
 */
const App = (() => {
    let currentPreviewData = null;
    let currentImportSource = 'baby-banking';

    const SOURCE_LABELS = {
        'baby-banking': 'Baby Banking ES',
        'baby-banking-ic': 'Baby Banking IC',
        'ecom': 'Ecom Sales',
        'captacion': 'Captacion',
        'stocks': 'Stocks (AIO)'
    };


    async function init() {
        try {
            Database.init();

            // Load saved settings
            const savedMapping = await Database.getSetting('columnMapping');
            if (savedMapping) CSVParser.setMapping(savedMapping);

            const savedCourseStart = await Database.getSetting('courseStartDate');
            if (savedCourseStart) {
                KPIEngine.setCourseStart(savedCourseStart);
                const el = document.getElementById('course-start-date');
                if (el) el.value = UI.formatDate(savedCourseStart);
            }

            // Drive (non-blocking)
            const driveClientId = await Database.getSetting('driveClientId');
            const driveApiKey = await Database.getSetting('driveApiKey');
            if (driveClientId) DriveSync.init(driveClientId, driveApiKey);
        } catch (e) {
            console.error('Init settings error (non-fatal):', e);
        }

        bindEvents();

        try {
            await refreshHome();
        } catch (e) {
            console.error('Init refreshHome error:', e);
        }

        updateTopbarWeek();

        console.log('CapiMetrics 2026 initialized');
    }

    // ============================
    // EVENT BINDING
    // ============================
    function bindEvents() {
        // Sidebar navigation
        document.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.section));
        });

        // Home card actions
        document.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', () => handleAction(el.dataset.action));
        });

        // CSV import: each drop zone is its own source
        document.querySelectorAll('.import-zone:not(.disabled)').forEach(zone => {
            const input = zone.querySelector('input[type="file"]');
            const source = zone.dataset.source;

            zone.addEventListener('click', () => input.click());
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                if (e.dataTransfer.files[0]) {
                    currentImportSource = source;
                    handleFileSelected(e.dataTransfer.files[0]);
                }
            });
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    currentImportSource = source;
                    handleFileSelected(e.target.files[0]);
                }
                e.target.value = '';
            });
        });

        document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);
        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            currentPreviewData = null;
            UI.hidePreview();
        });

        // Data explorer toggle
        document.getElementById('btn-toggle-explorer').addEventListener('click', toggleDataExplorer);
        document.getElementById('data-search').addEventListener('input', debounce(loadDataExplorer, 300));
        document.getElementById('data-filter-type').addEventListener('change', loadDataExplorer);
        document.getElementById('data-filter-store').addEventListener('change', loadDataExplorer);
        document.getElementById('data-filter-category').addEventListener('change', loadDataExplorer);
        document.getElementById('data-filter-channel').addEventListener('change', loadDataExplorer);
        document.getElementById('data-filter-date-from').addEventListener('input', debounce(loadDataExplorer, 500));
        document.getElementById('data-filter-date-to').addEventListener('input', debounce(loadDataExplorer, 500));
        document.getElementById('data-pagination').addEventListener('click', (e) => {
            if (e.target.dataset.page) loadDataExplorer(parseInt(e.target.dataset.page));
        });

        // Store selects (searchable)
        initStoreSelect('kpi-panel-store', 'kpi-panel-store-list', refreshEvolution);

        // Vista tienda/empleado filters (evolucion semanal unificada)
        document.getElementById('evo-week-from').addEventListener('change', refreshEvolution);
        document.getElementById('evo-week-to').addEventListener('change', refreshEvolution);
        document.getElementById('evo-metric').addEventListener('change', () => {
            const m = document.getElementById('evo-metric').value;
            document.getElementById('evo-min-ops').disabled = !METRICS[m]?.isPct;
            refreshEvolution();
        });
        document.getElementById('evo-min-ops').addEventListener('change', refreshEvolution);
        document.getElementById('evo-scope').addEventListener('change', refreshEvolution);

        // Top N + ecom filter + chart toggle
        document.getElementById('evo-top-n').addEventListener('change', refreshEvolution);
        document.getElementById('evo-exclude-ecom')?.addEventListener('change', refreshEvolution);
        document.getElementById('evo-merge-stores')?.addEventListener('change', refreshEvolution);
        document.getElementById('btn-toggle-chart').addEventListener('click', toggleEvoChart);

        // Dashboard: general
        document.getElementById('dg-week-from').addEventListener('change', refreshDashGeneral);
        document.getElementById('dg-week-to').addEventListener('change', refreshDashGeneral);
        document.getElementById('dg-exclude-ecom').addEventListener('change', refreshDashGeneral);

        // Dashboard: detail
        document.getElementById('dd-week').addEventListener('change', refreshDashDetail);
        document.getElementById('dd-metric').addEventListener('change', refreshDashDetail);
        document.getElementById('dd-exclude-ecom').addEventListener('change', refreshDashDetail);

        // Changelog
        document.getElementById('btn-changelog').addEventListener('click', openChangelog);
        document.getElementById('btn-changelog-close').addEventListener('click', closeChangelog);
        document.getElementById('changelog-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeChangelog();
        });

        // JSON import
        document.getElementById('json-input').addEventListener('change', handleJsonImport);

        // Settings
        document.getElementById('btn-reset-tool').addEventListener('click', resetTool);
        document.getElementById('btn-save-course-start').addEventListener('click', saveCourseStart);
    }

    function handleAction(action) {
        switch (action) {
            case 'go-home': navigateTo('home'); break;
            case 'go-import': navigateTo('import'); break;
            case 'go-settings': navigateTo('settings'); break;
            case 'go-dash-general': navigateTo('dash-general'); break;
            case 'go-dash-detail': navigateTo('dash-detail'); break;
            case 'go-dash-store': navigateTo('dash-store'); break;
            case 'export-json': exportData(); break;
            case 'import-json': document.getElementById('json-input').click(); break;
            case 'drive-sync': syncDrive(); break;
        }
    }

    // ============================
    // NAVIGATION
    // ============================
    function navigateTo(sectionId) {
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        document.getElementById(`section-${sectionId}`).classList.remove('hidden');

        document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
        const sidebarBtn = document.querySelector(`.sidebar-btn[data-section="${sectionId}"]`);
        if (sidebarBtn) sidebarBtn.classList.add('active');

        if (sectionId === 'home') refreshHome();
        if (sectionId === 'import') { renderImportHistory(); renderEcomTimeline(); }
        if (sectionId === 'settings') loadSettings();
        if (sectionId === 'dash-general') refreshDashGeneral();
        if (sectionId === 'dash-detail') refreshDashDetail();
        if (sectionId === 'dash-store') refreshDashStore();
    }

    // ============================
    // TOPBAR
    // ============================
    function updateTopbarWeek() {
        const today = new Date().toISOString().substring(0, 10);
        const wk = KPIEngine.helpers.businessWeek(today);
        document.getElementById('topbar-week').textContent = `Semana ${wk}`;
    }

    // ============================
    // HOME: Refresh all
    // ============================
    async function refreshHome() {
        const count = await Database.getRecordCount();
        document.getElementById('db-status-badge').textContent = `DB: ${count.toLocaleString()}`;

        // Store count shown next to COBERTURA label
        const stores = await Database.getDistinctValues('store');
        const storeCountEl = document.getElementById('coverage-store-count');
        if (storeCountEl) {
            if (stores.length === 0) storeCountEl.textContent = '';
            else if (stores.length === 1) storeCountEl.textContent = `· ${stores[0]}`;
            else storeCountEl.textContent = `· ${stores.length} tiendas`;
        }

        updateTopbarWeek();
        await renderCoverageBars();
    }

    async function renderCoverageBars() {
        const container = document.getElementById('coverage-bars');
        const emptyMsg = document.getElementById('coverage-empty');
        const ranges = await Database.getDateRangeBySource();

        const sources = {
            'baby-banking': { label: 'Baby Banking ES', cssClass: 'coverage-bar-bb' },
            'baby-banking-ic': { label: 'Baby Banking IC', cssClass: 'coverage-bar-bb-ic' },
            'ecom': { label: 'Ecom Sales', cssClass: 'coverage-bar-ecom' },
            'captacion': { label: 'Captacion de socios', cssClass: 'coverage-bar-captacion' },
            'stocks': { label: 'Stocks (AIO)', cssClass: 'coverage-bar-stocks' }
        };

        // Find global min/max
        let globalMin = null, globalMax = null;
        for (const src of Object.keys(sources)) {
            const r = ranges[src];
            if (!r) continue;
            if (!globalMin || r.from < globalMin) globalMin = r.from;
            if (!globalMax || r.to > globalMax) globalMax = r.to;
        }

        if (!globalMin) {
            container.innerHTML = '';
            emptyMsg.classList.remove('hidden');
            return;
        }
        emptyMsg.classList.add('hidden');

        const minMs = new Date(globalMin + 'T00:00:00').getTime();
        const maxMs = new Date(globalMax + 'T00:00:00').getTime();
        const span = maxMs - minMs || 1;

        let html = '';
        for (const [src, meta] of Object.entries(sources)) {
            const r = ranges[src];
            const leftPct = r ? ((new Date(r.from + 'T00:00:00').getTime() - minMs) / span * 100) : 0;
            const rightPct = r ? ((new Date(r.to + 'T00:00:00').getTime() - minMs) / span * 100) : 0;
            const widthPct = r ? Math.max(rightPct - leftPct, 1) : 0;

            html += `<div class="coverage-row">
                <div class="coverage-bar-title" style="margin-left:${r ? leftPct : 0}%;width:${r ? widthPct : 100}%">${meta.label}${r ? '' : ' — sin datos'}</div>
                <div class="coverage-track">
                    ${r ? `<div class="coverage-bar ${meta.cssClass}" style="left:${leftPct}%;width:${widthPct}%"></div>` : ''}
                </div>
                ${r ? `<div class="coverage-dates" style="margin-left:${leftPct}%;width:${widthPct}%">
                    <span>${UI.formatDate(r.from)}</span>
                    <span>${UI.formatDate(r.to)}</span>
                </div>` : ''}
            </div>`;
        }

        container.innerHTML = html;
    }

    // ============================
    // SEARCHABLE STORE SELECT
    // ============================
    const storeSelects = {};

    function initStoreSelect(inputId, listId, onChange) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        const state = { stores: [], value: 'all', onChange };
        storeSelects[inputId] = state;

        input.addEventListener('focus', () => {
            renderStoreList(inputId);
            list.classList.add('open');
        });

        input.addEventListener('input', () => {
            renderStoreList(inputId);
            list.classList.add('open');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { list.classList.remove('open'); input.blur(); }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('open');
                // If text doesn't match a store, reset to current
                syncInputDisplay(inputId);
            }
        });
    }

    function renderStoreList(inputId) {
        const state = storeSelects[inputId];
        const input = document.getElementById(inputId);
        const list = document.getElementById(inputId + '-list');
        const filter = input.value.toLowerCase();

        const options = [{ value: 'all', label: 'Todas las tiendas' }];
        for (const s of state.stores) {
            options.push({ value: s, label: s });
        }

        const filtered = options.filter(o => o.label.toLowerCase().includes(filter));

        list.innerHTML = filtered.map(o =>
            `<div class="search-select-option" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</div>`
        ).join('');

        list.querySelectorAll('.search-select-option').forEach(opt => {
            opt.addEventListener('mousedown', (e) => {
                e.preventDefault();
                state.value = opt.dataset.value;
                syncInputDisplay(inputId);
                list.classList.remove('open');
                if (state.onChange) state.onChange();
            });
        });
    }

    function syncInputDisplay(inputId) {
        const state = storeSelects[inputId];
        const input = document.getElementById(inputId);
        input.value = state.value === 'all' ? '' : state.value;
        input.placeholder = state.value === 'all' ? 'Todas las tiendas' : state.value;
    }

    function populateStoreSelect(inputId, stores) {
        const state = storeSelects[inputId];
        if (!state) return;
        state.stores = stores;
        syncInputDisplay(inputId);
    }

    function getStoreValue(inputId) {
        const state = storeSelects[inputId];
        return state ? state.value : 'all';
    }

    // ============================
    // HOME: Summary panel
    // ============================
    /**
     * Compute date range for a period selector value.
     * Uses UTC arithmetic to avoid DST issues.
     */

    // ============================
    // DASHBOARD: STORE/STAFF (evolucion por KPI - unifica Ventas + Moviles + futuros)
    // ============================
    async function refreshDashStore() {
        const stores = await Database.getDistinctValues('store');
        populateStoreSelect('kpi-panel-store', stores);

        const today = new Date().toISOString().substring(0, 10);
        const currentWeek = KPIEngine.helpers.businessWeek(today);
        const fromEl = document.getElementById('evo-week-from');
        const toEl = document.getElementById('evo-week-to');

        const savedFrom = await Database.getSetting('evoWeekFrom');
        const savedTo = await Database.getSetting('evoWeekTo');
        if (savedFrom && savedTo) {
            fromEl.value = savedFrom;
            toEl.value = savedTo;
        } else if (parseInt(toEl.value) < 2) {
            fromEl.value = Math.max(1, currentWeek - 3);
            toEl.value = currentWeek;
        }

        refreshEvolution();
    }

    function formatPct(val) {
        const cls = val > 40 ? 'pct-good' : val >= 30 ? 'pct-ok' : 'pct-low';
        return `<span class="pct-cell ${cls}">${val}%</span>`;
    }

    function formatPctDetail(numerator, denominator) {
        if (denominator <= 0) return '--';
        const pct = Math.round((numerator / denominator) * 100);
        const cls = pct > 40 ? 'pct-good' : pct >= 30 ? 'pct-ok' : 'pct-low';
        return `<span class="pct-cell ${cls}">${pct}%</span> <small class="pct-units">${numerator}/${denominator}</small>`;
    }

    // ============================
    // METRIC REGISTRY (unificado Ventas + Moviles + Compras)
    // ============================
    function emptyBucket() {
        return {
            saleRevenue: 0, saleUnits: 0, refundAmount: 0,
            ticketRefs: {},
            mobiles: 0, mobilesTotal: 0, services: 0, basics: 0,
            cashBuyAmount: 0, exchangeAmount: 0
        };
    }

    function addToBucket(b, r) {
        const total = r.total || 0;
        const qty = r.quantity || 0;
        const catLower = (r.category || '').toLowerCase();
        if (r.type === 'sale') {
            if ((r.price || 0) > 0) {
                b.saleRevenue += total;
                b.saleUnits += qty;
                const ref = r.reference || `_noref_${r.id || Math.random()}`;
                b.ticketRefs[ref] = (b.ticketRefs[ref] || 0) + 1;
            }
            if (catLower.includes('moviles')) { b.mobiles += qty; b.mobilesTotal += total; }
            if (catLower.includes('services')) { b.services += qty; }
            if (catLower.includes('basics')) { b.basics += qty; }
        } else if (r.type === 'refund') {
            b.refundAmount += Math.abs(total);
        } else if (r.type === 'cash buy') {
            b.cashBuyAmount += Math.abs(total);
        } else if (r.type === 'exchange') {
            b.exchangeAmount += Math.abs(total);
        }
    }

    function mergeBuckets(dst, src) {
        dst.saleRevenue += src.saleRevenue;
        dst.saleUnits += src.saleUnits;
        dst.refundAmount += src.refundAmount;
        for (const [ref, c] of Object.entries(src.ticketRefs)) {
            dst.ticketRefs[ref] = (dst.ticketRefs[ref] || 0) + c;
        }
        dst.mobiles += src.mobiles;
        dst.mobilesTotal += src.mobilesTotal;
        dst.services += src.services;
        dst.basics += src.basics;
        dst.cashBuyAmount += src.cashBuyAmount;
        dst.exchangeAmount += src.exchangeAmount;
    }

    function bucketTickets(b) { return b ? Object.keys(b.ticketRefs).length : 0; }
    function bucketMultiTickets(b) { return b ? Object.values(b.ticketRefs).filter(c => c > 1).length : 0; }

    const METRICS = {
        // Ventas
        netSales:      { label: 'Ventas netas',          isCurrency: true,
            value: b => b.saleRevenue - b.refundAmount,
            format: v => formatCurrency(v) },
        grossSales:    { label: 'Ventas brutas',         isCurrency: true,
            value: b => b.saleRevenue,
            format: v => formatCurrency(v) },
        refundsAmount: { label: 'Refunds',               isCurrency: true,
            value: b => b.refundAmount,
            format: v => formatCurrency(v) },
        totalItems:    { label: 'Articulos vendidos',
            value: b => b.saleUnits,
            format: v => (v || 0).toLocaleString('es-ES') },
        tickets:       { label: 'Tickets',
            value: b => bucketTickets(b),
            format: v => (v || 0).toLocaleString('es-ES') },
        multiTickets:  { label: 'Tickets multiples',
            value: b => bucketMultiTickets(b),
            format: v => (v || 0).toLocaleString('es-ES') },
        pctMulti:      { label: '% Venta complementaria', isPct: true,
            minOpsOf: b => bucketTickets(b),
            value: b => { const t = bucketTickets(b); return t > 0 ? (bucketMultiTickets(b) / t) * 100 : 0; },
            format: (v, b) => formatPctDetail(bucketMultiTickets(b), bucketTickets(b)) },
        avgItems:      { label: 'Media articulos/ticket', isPct: true,
            minOpsOf: b => bucketTickets(b),
            value: b => { const t = bucketTickets(b); return t > 0 ? b.saleUnits / t : 0; },
            format: (v, b) => {
                const t = bucketTickets(b);
                return t > 0 ? `${(b.saleUnits / t).toFixed(1)} <small class="pct-units">(${b.saleUnits}/${t})</small>` : '--';
            } },
        // Moviles
        mobiles:       { label: 'Moviles (uds)',
            value: b => b.mobiles,
            format: v => (v || 0).toLocaleString('es-ES') },
        mobilesTotal:  { label: 'Moviles (EUR)',         isCurrency: true,
            value: b => b.mobilesTotal,
            format: v => formatCurrency(v) },
        services:      { label: 'Protectores de gel',
            value: b => b.services,
            format: v => (v || 0).toLocaleString('es-ES') },
        pctServices:   { label: '% Gel/Movil',           isPct: true,
            minOpsOf: b => b.mobiles,
            value: b => b.mobiles > 0 ? (b.services / b.mobiles) * 100 : 0,
            format: (v, b) => formatPctDetail(b.services, b.mobiles) },
        basics:        { label: 'Basics',
            value: b => b.basics,
            format: v => (v || 0).toLocaleString('es-ES') },
        pctBasics:     { label: '% Basics/Movil',        isPct: true,
            minOpsOf: b => b.mobiles,
            value: b => b.mobiles > 0 ? (b.basics / b.mobiles) * 100 : 0,
            format: (v, b) => formatPctDetail(b.basics, b.mobiles) },
        pctCombo:      { label: '% Combo/Movil',         isPct: true,
            minOpsOf: b => b.mobiles,
            value: b => b.mobiles > 0 ? ((b.services + b.basics) / b.mobiles) * 100 : 0,
            format: (v, b) => formatPctDetail(b.services + b.basics, b.mobiles) },
        // Compras
        buys:          { label: 'Compras (EUR)',         isCurrency: true,
            value: b => b.cashBuyAmount + b.exchangeAmount,
            format: v => formatCurrency(v) },
        cashBuys:      { label: 'Cash buys (EUR)',       isCurrency: true,
            value: b => b.cashBuyAmount,
            format: v => formatCurrency(v) },
        exchanges:     { label: 'Exchanges (EUR)',       isCurrency: true,
            value: b => b.exchangeAmount,
            format: v => formatCurrency(v) },
        pctVale:       { label: '% Vale',                isPct: true,
            value: b => { const t = b.cashBuyAmount + b.exchangeAmount; return t > 0 ? (b.exchangeAmount / t) * 100 : 0; },
            format: (v, b) => {
                const t = b.cashBuyAmount + b.exchangeAmount;
                return t > 0 ? formatPctDetail(Math.round(b.exchangeAmount), Math.round(t)) : '--';
            } }
    };

    // ============================
    // EVOLUTION TABLE
    // ============================
    let evoState = {
        staffWeekData: {},
        weeks: [],
        scope: 'staff',
        metric: 'netSales',
        sortCol: null,
        sortDir: 'desc',
        selectedStaff: null  // clicked row for chart highlight
    };

    async function refreshEvolution() {
        const weekFrom = parseInt(document.getElementById('evo-week-from').value) || 1;
        const weekTo = parseInt(document.getElementById('evo-week-to').value) || weekFrom;
        evoState.metric = document.getElementById('evo-metric').value;
        evoState.scope = document.getElementById('evo-scope').value;
        const store = getStoreValue('kpi-panel-store');

        // Persist week range
        await Database.setSetting('evoWeekFrom', weekFrom);
        await Database.setSetting('evoWeekTo', weekTo);

        // Week range label
        const courseStart = KPIEngine.getCourseStart();
        const cs = courseStart.split('-');
        const startMs = Date.UTC(cs[0], cs[1] - 1, cs[2]);
        const fromDate = new Date(startMs + (weekFrom - 1) * 7 * 86400000).toISOString().substring(0, 10);
        const toDate = new Date(startMs + weekTo * 7 * 86400000 - 86400000).toISOString().substring(0, 10);
        document.getElementById('kpi-panel-week-range').textContent =
            weekFrom === weekTo
                ? `Semana ${weekFrom} (${UI.formatDate(fromDate)} - ${UI.formatDate(toDate)})`
                : `Semanas ${weekFrom}-${weekTo} (${UI.formatDate(fromDate)} - ${UI.formatDate(toDate)})`;

        // Reset sort on data change
        evoState.sortCol = null;
        evoState.sortDir = 'desc';

        evoState.weeks = [];
        for (let w = weekFrom; w <= weekTo; w++) evoState.weeks.push(w);

        if (evoState.weeks.length === 0 || evoState.weeks.length > 52) {
            document.getElementById('evo-tbody').innerHTML =
                '<tr><td class="empty-msg">Rango de semanas no valido.</td></tr>';
            return;
        }

        const allData = await Database.getOperationsForKPI({});
        let records = allData;
        if (store && store !== 'all') {
            records = records.filter(r => r.store === store);
        }
        const excludeEcom = document.getElementById('evo-exclude-ecom')?.checked;
        if (excludeEcom) {
            records = records.filter(r => r.channel !== 'ecom');
        }

        evoState.staffWeekData = {};
        evoState.staffStore = {};
        const nameStores = {};
        for (const r of records) {
            const wk = r.week;
            if (wk < weekFrom || wk > weekTo) continue;
            // Compras agregan a la tienda, no al empleado (no se atribuyen a staff).
            // Para scope=staff descartamos cash buy/exchange/refund.
            if (evoState.scope === 'staff' && (r.type === 'cash buy' || r.type === 'exchange' || r.type === 'refund')) {
                continue;
            }

            const staffName = r.staff || 'N/A';
            const storeName = r.store || '?';
            let key;
            if (evoState.scope === 'store') {
                key = storeName;
            } else {
                key = `${staffName}\t${storeName}`;
                evoState.staffStore[key] = storeName;
                if (!nameStores[staffName]) nameStores[staffName] = new Set();
                nameStores[staffName].add(storeName);
            }

            if (!evoState.staffWeekData[key]) evoState.staffWeekData[key] = {};
            if (!evoState.staffWeekData[key][wk]) evoState.staffWeekData[key][wk] = emptyBucket();
            addToBucket(evoState.staffWeekData[key][wk], r);
        }

        // Track names that appear in multiple stores
        evoState.nameStoresMap = {};
        for (const [name, stores] of Object.entries(nameStores)) {
            if (stores.size > 1) evoState.nameStoresMap[name] = [...stores];
        }

        // Merge stores if toggle is on
        const mergeStores = document.getElementById('evo-merge-stores')?.checked;
        if (mergeStores && evoState.scope === 'staff') {
            const merged = {};
            const mergedStores = {};
            for (const [key, weekData] of Object.entries(evoState.staffWeekData)) {
                const name = key.includes('\t') ? key.split('\t')[0] : key;
                if (!merged[name]) { merged[name] = {}; mergedStores[name] = new Set(); }
                const store = evoState.staffStore[key];
                if (store) mergedStores[name].add(store);
                for (const [wk, cell] of Object.entries(weekData)) {
                    if (!merged[name][wk]) merged[name][wk] = emptyBucket();
                    mergeBuckets(merged[name][wk], cell);
                }
            }
            evoState.staffWeekData = merged;
            evoState.mergedStoresMap = {};
            for (const [name, stores] of Object.entries(mergedStores)) {
                evoState.mergedStoresMap[name] = [...stores];
            }
        } else {
            evoState.mergedStoresMap = null;
        }

        renderEvolution();
    }

    function sortEvolution(col) {
        if (evoState.sortCol === col) {
            evoState.sortDir = evoState.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
            evoState.sortCol = col;
            evoState.sortDir = 'desc';
        }
        renderEvolution();
        // Re-rank chart if visible
        if (!document.getElementById('evo-chart-section').classList.contains('collapsed')) {
            renderEvoChart();
        }
    }

    function evoSortValue(name, col, metric, weeks) {
        const wd = evoState.staffWeekData[name];
        if (col === 'name') return (name.includes('\t') ? name.split('\t')[0] : name).toLowerCase();
        if (col === 'store') return (evoState.staffStore?.[name] || '').toLowerCase();
        const def = METRICS[metric];
        if (!def) return 0;
        let bucket;
        if (col === 'total') {
            bucket = emptyBucket();
            for (const wk of weeks) { const c = wd?.[wk]; if (c) mergeBuckets(bucket, c); }
        } else {
            bucket = wd?.[col] || emptyBucket();
        }
        const v = def.value(bucket);
        // For pct metrics without denominator, sort to bottom
        if (def.isPct && v === 0 && def.minOpsOf && def.minOpsOf(bucket) === 0) return -1;
        return v;
    }

    function evoCellValue(cellData, metricKey) {
        const def = METRICS[metricKey];
        if (!def) return '0';
        const bucket = cellData || emptyBucket();
        if (!cellData) {
            if (def.isPct) return '--';
            if (def.isCurrency) return formatCurrency(0);
            return '0';
        }
        return def.format(def.value(bucket), bucket);
    }

    function evoRowTotal(weekData, metricKey, weeks) {
        const def = METRICS[metricKey];
        if (!def) return 0;
        const bucket = emptyBucket();
        for (const wk of weeks) { const c = weekData[wk]; if (c) mergeBuckets(bucket, c); }
        return def.format(def.value(bucket), bucket);
    }

    function renderEvolution() {
        const { staffWeekData, weeks, scope, metric, sortCol, sortDir } = evoState;
        const thead = document.getElementById('evo-thead');
        const tbody = document.getElementById('evo-tbody');
        const tfoot = document.getElementById('evo-tfoot');

        const sortCls = (col) => {
            if (sortCol !== col) return '';
            return sortDir === 'desc' ? ' sort-desc' : ' sort-asc';
        };

        const showStore = scope === 'staff';
        const nameHeader = scope === 'store' ? 'Tienda' : 'Empleado';
        thead.innerHTML = `<tr>
            <th class="col-rank">#</th>
            <th class="sortable${sortCls('name')}" data-evo-sort="name">${nameHeader}</th>
            ${showStore ? `<th class="sortable${sortCls('store')}" data-evo-sort="store">Tienda</th>` : ''}
            ${weeks.map(w => `<th class="sortable${sortCls(w)}" data-evo-sort="${w}">W${w}</th>`).join('')}
            <th class="sortable col-total${sortCls('total')}" data-evo-sort="total"><strong>Total</strong></th>
        </tr>`;

        // Bind sort clicks
        thead.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.evoSort;
                sortEvolution(col === 'name' || col === 'total' || col === 'store' ? col : parseInt(col));
            });
        });

        let staffNames = Object.keys(staffWeekData);

        if (staffNames.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${weeks.length + (showStore ? 4 : 3)}" class="empty-msg">Sin datos para estas semanas.</td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        // Sort: default by total desc, or by clicked column
        const rankCol = sortCol || 'total';
        const rankDir = sortCol ? sortDir : 'desc';
        staffNames.sort((a, b) => {
            const va = evoSortValue(a, rankCol, metric, weeks);
            const vb = evoSortValue(b, rankCol, metric, weeks);
            if (typeof va === 'string') return rankDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return rankDir === 'asc' ? va - vb : vb - va;
        });

        // Filter by min operations for percentage/average metrics
        const metricDef = METRICS[metric];
        if (metricDef?.isPct && metricDef.minOpsOf) {
            const minOps = parseInt(document.getElementById('evo-min-ops').value) || 0;
            if (minOps > 0) {
                staffNames = staffNames.filter(key => {
                    let total = 0;
                    for (const wk of weeks) {
                        const c = staffWeekData[key]?.[wk];
                        if (c) total += metricDef.minOpsOf(c);
                    }
                    return total >= minOps;
                });
            }
        }

        // Apply top-n filter
        const topNVal = document.getElementById('evo-top-n').value;
        if (topNVal !== 'all') {
            staffNames = staffNames.slice(0, parseInt(topNVal));
        }

        const isMerged = !!evoState.mergedStoresMap;
        tbody.innerHTML = staffNames.map((key, idx) => {
            const wd = staffWeekData[key];
            const selected = evoState.selectedStaff === key ? ' class="evo-row-selected"' : '';
            const displayName = key.includes('\t') ? key.split('\t')[0] : key;
            let nameHtml = escapeHtml(displayName);
            let storeCell = '';
            if (showStore) {
                if (isMerged) {
                    const stores = evoState.mergedStoresMap[key] || [];
                    storeCell = stores.length > 1
                        ? `<td class="col-store"><span title="${stores.join(', ')}">${stores.length} tiendas</span></td>`
                        : `<td class="col-store">${escapeHtml(stores[0] || '')}</td>`;
                } else {
                    const storeName = evoState.staffStore?.[key] || '';
                    const dupStores = evoState.nameStoresMap?.[displayName];
                    if (dupStores) {
                        nameHtml += ` <span class="dup-mark" title="Tambien en: ${dupStores.filter(s => s !== storeName).join(', ')}">*</span>`;
                    }
                    storeCell = `<td class="col-store">${escapeHtml(storeName)}</td>`;
                }
            }
            return `<tr${selected} data-staff="${escapeHtml(key)}">
                <td class="col-rank">${idx + 1}</td>
                <td>${nameHtml}</td>
                ${storeCell}
                ${weeks.map(w => `<td>${evoCellValue(wd?.[w], metric)}</td>`).join('')}
                <td class="col-total"><strong>${evoRowTotal(wd || {}, metric, weeks)}</strong></td>
            </tr>`;
        }).join('');

        if (staffNames.length > 1) {
            const colTotals = {};
            for (const w of weeks) {
                colTotals[w] = emptyBucket();
                for (const name of staffNames) {
                    const c = staffWeekData[name]?.[w];
                    if (c) mergeBuckets(colTotals[w], c);
                }
            }
            tfoot.innerHTML = `<tr data-staff="__TOTAL__">
                <td class="col-rank"></td>
                <td>TOTAL</td>
                ${showStore ? '<td></td>' : ''}
                ${weeks.map(w => `<td><strong>${evoCellValue(colTotals[w], metric)}</strong></td>`).join('')}
                <td class="col-total"><strong>${evoRowTotal(colTotals, metric, weeks)}</strong></td>
            </tr>`;
        } else {
            tfoot.innerHTML = '';
        }

        // Click any row (staff or total) to select for chart
        function selectRow(name, tr) {
            evoState.selectedStaff = evoState.selectedStaff === name ? null : name;
            // Update highlight across both tbody and tfoot
            const table = document.getElementById('evo-table');
            table.querySelectorAll('tr').forEach(r => r.classList.remove('evo-row-selected'));
            if (evoState.selectedStaff) tr.classList.add('evo-row-selected');
            // Open chart if collapsed, then render
            const section = document.getElementById('evo-chart-section');
            if (section.classList.contains('collapsed')) {
                section.classList.remove('collapsed');
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    try { renderEvoChart(); } catch(e) { console.error('Chart error:', e); }
                }));
            } else {
                try { renderEvoChart(); } catch(e) { console.error('Chart error:', e); }
            }
        }

        document.querySelectorAll('#evo-table tr[data-staff]').forEach(tr => {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => selectRow(tr.dataset.staff, tr));
        });

        // Conditional gradient for absolute metrics
        if (metricDef && !metricDef.isPct) {
            const evoExtractor = (cell) => cell ? (metricDef.value(cell) || 0) : 0;
            applyHeatmap('evo-table', staffWeekData, weeks, evoExtractor);
        }

        // Refresh chart if visible
        if (!document.getElementById('evo-chart-section').classList.contains('collapsed')) {
            renderEvoChart();
        }
    }

    // ============================
    // EVOLUTION CHART
    // ============================
    let evoChartInstance = null;

    const CHART_METRIC_INFO = {
        netSales: 'Ventas netas = ventas brutas - refunds',
        grossSales: 'Suma de ventas (type=sale)',
        refundsAmount: 'Importe de devoluciones (valor absoluto)',
        totalItems: 'Unidades vendidas (lineas de venta)',
        tickets: 'Numero de tickets unicos (Order Number distintos en sales)',
        multiTickets: 'Tickets con mas de 1 linea',
        pctMulti: '% Venta complementaria.\nNumerador: tickets con >1 linea\nDenominador: tickets totales',
        avgItems: 'Media de articulos por ticket.\nNumerador: articulos\nDenominador: tickets',
        pctServices: 'Porcentaje de geles (Services)\nvendidos por movil.\n\nNumerador: lineas Services\nDenominador: lineas Moviles',
        pctBasics: 'Porcentaje de CeX Basics\nvendidos por movil.\n\nNumerador: lineas Basics\nDenominador: lineas Moviles',
        pctCombo: 'Porcentaje combinado de\ngeles + basics por movil.\n\nNumerador: Services + Basics\nDenominador: lineas Moviles',
        mobiles: 'Unidades de moviles vendidos\n(lineas con categoria "Moviles")',
        mobilesTotal: 'Importe total de moviles vendidos',
        services: 'Unidades de Services vendidos\n(lineas con categoria "Services")',
        basics: 'Unidades de CeX Basics vendidos\n(lineas con categoria "basics")',
        buys: 'Compras totales (cash buy + exchange) en valor absoluto',
        cashBuys: 'Compras pagadas en efectivo',
        exchanges: 'Compras pagadas en vale de tienda (mas rentables)',
        pctVale: '% de compras pagadas en vale.\nNumerador: exchange EUR\nDenominador: cash buy + exchange EUR'
    };

    function toggleEvoChart() {
        const section = document.getElementById('evo-chart-section');
        const isCollapsed = section.classList.contains('collapsed');
        if (isCollapsed) {
            section.classList.remove('collapsed');
            // Double rAF: first to apply display change, second to let layout compute
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try { renderEvoChart(); }
                    catch (e) { console.error('Chart render error:', e); }
                });
            });
        } else {
            section.classList.add('collapsed');
        }
    }

    function renderEvoChart() {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            return;
        }

        const chartMetric = evoState.metric;
        const { staffWeekData, weeks, scope } = evoState;

        document.getElementById('evo-chart-info').title = CHART_METRIC_INFO[chartMetric] || '';

        const canvas = document.getElementById('evo-chart');
        if (!canvas) { console.error('Canvas not found'); return; }

        if (evoChartInstance) {
            evoChartInstance.destroy();
            evoChartInstance = null;
        }

        const allStaff = Object.keys(staffWeekData);
        if (weeks.length === 0 || allStaff.length === 0) return;

        // Ensure canvas has dimensions
        const container = canvas.parentElement;
        if (container.offsetHeight === 0) {
            console.warn('Chart container has no height, skipping render');
            return;
        }

        const labels = weeks.map(w => `W${w}`);
        const metricDef = METRICS[chartMetric];
        const isPct = !!metricDef?.isPct;
        const isCurrency = !!metricDef?.isCurrency;
        const topNVal = document.getElementById('evo-top-n').value;
        const showTotal = allStaff.length === 1;
        const maxLines = topNVal === 'all' ? 999 : parseInt(topNVal) || 999;

        const colors = [
            '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
            '#db2777', '#0891b2', '#65a30d', '#ea580c', '#6366f1',
            '#be123c', '#0d9488', '#c026d3', '#ca8a04', '#475569'
        ];

        // Aggregate total bucket across all staff for a week
        const totalBucketAtWeek = (w) => {
            const b = emptyBucket();
            for (const name of allStaff) {
                const c = staffWeekData[name]?.[w];
                if (c) mergeBuckets(b, c);
            }
            return b;
        };

        let datasets;

        // If a row is selected, show that line (+ total as context if it's a staff)
        const selected = evoState.selectedStaff;
        if (selected === '__TOTAL__' || (showTotal && !selected)) {
            const data = weeks.map(w => evoChartValue(totalBucketAtWeek(w), chartMetric));
            datasets = [{ label: 'Total', data, borderColor: colors[0], backgroundColor: colors[0] + '20', tension: 0.3, fill: true, pointRadius: 4 }];
        } else if (selected && staffWeekData[selected] && !showTotal) {
            const selData = weeks.map(w => evoChartValue(staffWeekData[selected]?.[w], chartMetric));
            const totalData = weeks.map(w => evoChartValue(totalBucketAtWeek(w), chartMetric));
            datasets = [
                { label: selected.split(' ').slice(0, 2).join(' '), data: selData, borderColor: colors[0], backgroundColor: colors[0] + '20', tension: 0.3, fill: true, pointRadius: 5, borderWidth: 3 },
                { label: 'Total tienda', data: totalData, borderColor: '#94a3b8', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, borderWidth: 1.5, borderDash: [4, 3] }
            ];
        } else if (showTotal) {
            const data = weeks.map(w => evoChartValue(totalBucketAtWeek(w), chartMetric));
            datasets = [{ label: 'Total', data, borderColor: colors[0], backgroundColor: colors[0] + '20', tension: 0.3, fill: true, pointRadius: 4 }];
        } else {
            const rankCol = evoState.sortCol || 'total';
            const ranked = allStaff
                .map(name => ({ name, val: evoSortValue(name, rankCol, chartMetric, weeks) }))
                .sort((a, b) => b.val - a.val)
                .slice(0, maxLines);

            datasets = ranked.map(({ name }, i) => ({
                label: (name.includes('\t') ? name.split('\t')[0] : name).split(' ').slice(0, 2).join(' '),
                data: weeks.map(w => evoChartValue(staffWeekData[name]?.[w], chartMetric)),
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '15',
                tension: 0.3,
                pointRadius: 3,
                borderWidth: 2
            }));
        }

        evoChartInstance = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: 0 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: datasets.length > 1 && datasets.length <= 10,
                        position: 'bottom',
                        labels: { font: { size: 10 }, boxWidth: 12, padding: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.parsed.y;
                                const suffix = isPct ? val + '%' : isCurrency ? formatCurrency(val) : val;
                                return `${ctx.dataset.label}: ${suffix}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 9 },
                            color: '#94a3b8',
                            callback: val => isPct ? val + '%' : isCurrency ? formatCurrency(val) : val,
                            mirror: true,
                            padding: 4,
                            align: 'end'
                        },
                        grid: { color: '#f1f5f9' },
                        afterFit: (axis) => { axis.width = Y_AXIS_WIDTH; }
                    },
                    x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                        offset: false
                    }
                }
            }
        });
    }

    function evoChartValue(cellData, metricKey) {
        if (!cellData) return 0;
        const def = METRICS[metricKey];
        if (!def) return 0;
        const v = def.value(cellData);
        return def.isPct ? Math.round(v) : (def.isCurrency ? Math.round(v) : v);
    }

    // ============================
    // CSV IMPORT
    // ============================
    async function handleFileSelected(file) {
        if (!file.name.match(/\.(csv|txt)$/i)) {
            UI.addLog('Error: Selecciona un archivo CSV', 'error');
            return;
        }

        UI.addLog(`Archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

        try {
            const preview = await CSVParser.parsePreview(file, 20, currentImportSource);
            currentPreviewData = { file, mapping: preview.detectedMapping };
            UI.showPreview(preview.headers, preview.rows, preview.detectedMapping);
            UI.addLog(`Vista previa: ${preview.headers.length} columnas, ${Object.keys(preview.detectedMapping).length} mapeadas`);
        } catch (err) {
            UI.addLog(`Error al leer CSV: ${err.message}`, 'error');
        }
    }

    async function confirmImport() {
        if (!currentPreviewData) return;

        const { file, mapping } = currentPreviewData;
        UI.hidePreview();
        UI.showProgress(0, 1, 'Leyendo archivo CSV...');
        UI.addLog(`Importando ${file.name}...`);

        try {
            const result = await CSVParser.parseFull(file, mapping, (count) => {
                UI.showProgress(count, count, `Parseando... ${count.toLocaleString()} filas`);
            }, currentImportSource);

            UI.addLog(`Parseado: ${result.records.length} validas de ${result.totalRows}`);

            // Ecom Sales: cross-reference, don't store
            if (currentImportSource === 'ecom') {
                await confirmEcomImport(result.records, file.name);
                return;
            }

            // Baby Banking (and other sources): normal import flow
            // Deduplicate: skip records that already exist from the SAME source
            UI.showProgress(0, 1, 'Comprobando duplicados...');
            const refs = [...new Set(result.records.map(r => r.reference).filter(Boolean))];
            const existingFps = await Database.getExistingFingerprints(refs, currentImportSource);

            let newRecords = result.records;
            let skippedDupes = 0;
            if (existingFps.size > 0) {
                newRecords = result.records.filter(r => {
                    const fp = `${r.reference}|${r.price}|${r.category}`;
                    if (existingFps.has(fp)) { skippedDupes++; return false; }
                    return true;
                });
                if (skippedDupes > 0) {
                    UI.addLog(`Duplicados detectados: ${skippedDupes} filas ya existian, se omiten`, 'success');
                }
            }

            if (newRecords.length === 0) {
                UI.hideProgress();
                UI.addLog('Todos los registros ya estaban importados. Nada que hacer.', 'success');
                currentPreviewData = null;
                return;
            }

            UI.showProgress(0, newRecords.length, 'Guardando...');
            const weekFn = KPIEngine.helpers.businessWeek;
            const added = await Database.bulkAddOperations(newRecords, (current, total) => {
                UI.showProgress(current, total);
            }, weekFn, currentImportSource);

            // Extract metadata from actually imported records
            const dates = newRecords.map(r => r.date).filter(Boolean).sort();
            const storeSet = new Set(newRecords.map(r => r.store).filter(Boolean));

            await Database.logImport({
                source: currentImportSource,
                filename: file.name,
                rowCount: added,
                dateFrom: dates[0] || null,
                dateTo: dates[dates.length - 1] || null,
                storeCount: storeSet.size,
                stores: [...storeSet]
            });

            UI.hideProgress();
            UI.addLog(`Importacion OK: ${added.toLocaleString()} registros`, 'success');

            currentPreviewData = null;
            await renderImportHistory();
            await renderEcomTimeline();
            await refreshHome();
        } catch (err) {
            UI.hideProgress();
            UI.addLog(`Error: ${err.message}`, 'error');
        }
    }

    // ============================
    // ECOM CROSS-REFERENCE
    // ============================
    async function confirmEcomImport(ecomRecords, filename) {
        UI.showProgress(0, 1, 'Cruzando con Baby Banking...');
        UI.addLog(`Cruzando ${ecomRecords.length.toLocaleString()} ordenes ecom...`);

        try {
            const result = await Database.crossReferenceEcom(ecomRecords, (current, total) => {
                UI.showProgress(current, total, `Cruzando referencias... ${current}/${total}`);
            });

            // Log the import for audit trail
            await Database.logImport({
                source: 'ecom',
                filename,
                rowCount: result.tagged,
                dateFrom: result.ecomDateFrom || null,
                dateTo: result.ecomDateTo || null,
                storeCount: 0,
                stores: []
            });

            UI.hideProgress();

            const parts = [];
            if (result.tagged > 0) parts.push(`${result.tagged} operaciones marcadas como ecom`);
            if (result.alreadyTagged > 0) parts.push(`${result.alreadyTagged} ya estaban marcadas`);
            if (result.notFound > 0) parts.push(`${result.notFound} referencias no encontradas en Baby Banking`);

            UI.addLog(`Cruce completado: ${parts.join(', ')}`, 'success');

            currentPreviewData = null;
            await renderImportHistory();
            await renderEcomTimeline();
            await refreshHome();
        } catch (err) {
            UI.hideProgress();
            UI.addLog(`Error en cruce ecom: ${err.message}`, 'error');
        }
    }

    // ============================
    // ECOM COVERAGE TIMELINE
    // ============================
    async function renderEcomTimeline() {
        const container = document.getElementById('ecom-timeline');
        if (!container) return;

        const coverage = await Database.getEcomCoverage();
        if (!coverage) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        const { bbFrom, bbTo, totalRecords, ecomCount, tiendaCount, coveredRanges } = coverage;

        // Calculate timeline dimensions
        const bbStart = new Date(bbFrom).getTime();
        const bbEnd = new Date(bbTo).getTime();
        const totalSpan = bbEnd - bbStart || 1;

        // Build covered segments with percentage positions and dates
        const segments = coveredRanges.map(r => {
            const from = Math.max(new Date(r.from).getTime(), bbStart);
            const to = Math.min(new Date(r.to).getTime(), bbEnd);
            return {
                left: ((from - bbStart) / totalSpan * 100).toFixed(2),
                width: (((to - from) / totalSpan) * 100).toFixed(2),
                fromDate: r.from,
                toDate: r.to
            };
        });

        // Build gap list (uncovered periods between BB range and ecom segments)
        const gaps = [];
        let cursor = bbFrom;
        for (const r of coveredRanges) {
            if (r.from > cursor) {
                gaps.push({ from: cursor, to: r.from });
            }
            cursor = r.to > cursor ? r.to : cursor;
        }
        if (cursor < bbTo) {
            gaps.push({ from: cursor, to: bbTo });
        }

        const pctEcom = totalRecords > 0 ? ((ecomCount / totalRecords) * 100).toFixed(1) : '0';

        // Segment date markers on the bar
        const markers = segments.map(s => {
            const leftEnd = (parseFloat(s.left) + parseFloat(s.width)).toFixed(2);
            return `<div class="ecom-timeline-covered" style="left:${s.left}%;width:${s.width}%"
                        title="${UI.formatDate(s.fromDate)} — ${UI.formatDate(s.toDate)}"></div>
                    <span class="ecom-marker ecom-marker-start" style="left:${s.left}%">${UI.formatDate(s.fromDate)}</span>
                    <span class="ecom-marker ecom-marker-end" style="left:${leftEnd}%">${UI.formatDate(s.toDate)}</span>`;
        }).join('');

        const gapInfo = gaps.length > 0
            ? `<div class="ecom-gaps">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px; opacity:0.5;flex-shrink:0;">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                </svg>
                ${gaps.map(g => `<span class="ecom-gap-label">Sin ecom: ${UI.formatDate(g.from)} — ${UI.formatDate(g.to)}</span>`).join('')}
              </div>`
            : '';

        container.innerHTML = `
            <h4 class="home-col-label" style="margin-top:2rem;">COBERTURA ECOM</h4>
            <div class="ecom-timeline-bar-wrap">
                <div class="ecom-timeline-labels">
                    <span>${UI.formatDate(bbFrom)}</span>
                    <span>${UI.formatDate(bbTo)}</span>
                </div>
                <div class="ecom-timeline-bar">
                    ${markers}
                </div>
                <div class="ecom-timeline-legend">
                    <span class="ecom-legend-item"><span class="ecom-legend-dot covered"></span> Cruzado con ecom</span>
                    <span class="ecom-legend-item"><span class="ecom-legend-dot uncovered"></span> Sin datos ecom</span>
                </div>
            </div>
            ${gapInfo}
            <div class="ecom-timeline-stats">
                <span>${ecomCount.toLocaleString()} ecom</span>
                <span>${tiendaCount.toLocaleString()} tienda</span>
                <span>${pctEcom}% ecom</span>
            </div>
        `;
    }

    // ============================
    // IMPORT HISTORY
    // ============================
    async function renderImportHistory() {
        const imports = await Database.getImportHistory();
        const tbody = document.getElementById('import-history-tbody');

        if (imports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Ningun archivo importado todavia.</td></tr>';
            return;
        }

        tbody.innerHTML = imports.map(imp => {
            const sourceLabel = SOURCE_LABELS[imp.source] || imp.source || '--';
            const storesText = imp.storeCount === 1 ? (imp.stores?.[0] || '1 tienda')
                : imp.storeCount > 1 ? `${imp.storeCount} tiendas`
                : '--';

            return `<tr>
                <td>${escapeHtml(imp.filename || '--')}</td>
                <td><span class="source-badge">${escapeHtml(sourceLabel)}</span></td>
                <td>${UI.formatDate(imp.date)}</td>
                <td>${imp.dateFrom ? UI.formatDate(imp.dateFrom) : '--'}</td>
                <td>${imp.dateTo ? UI.formatDate(imp.dateTo) : '--'}</td>
                <td>${storesText}</td>
                <td>${(imp.rowCount || 0).toLocaleString()}</td>
            </tr>`;
        }).join('');
    }

    // ============================
    // DATA EXPLORER (inline in import section)
    // ============================
    async function toggleDataExplorer() {
        const panel = document.getElementById('data-explorer-panel');
        const btn = document.getElementById('btn-toggle-explorer');
        const visible = !panel.classList.contains('hidden');
        if (visible) {
            panel.classList.add('hidden');
            btn.textContent = 'Mostrar';
        } else {
            panel.classList.remove('hidden');
            btn.textContent = 'Ocultar';
            await populateExplorerDropdowns();
            loadDataExplorer();
        }
    }

    async function populateExplorerDropdowns() {
        const storeSelect = document.getElementById('data-filter-store');
        const catSelect = document.getElementById('data-filter-category');
        const prevStore = storeSelect.value;
        const prevCat = catSelect.value;

        const stores = await Database.getDistinctValues('store');
        storeSelect.innerHTML = '<option value="all">Todas las tiendas</option>';
        stores.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            storeSelect.appendChild(opt);
        });
        if (stores.includes(prevStore)) storeSelect.value = prevStore;

        const cats = await Database.getDistinctValues('category');
        catSelect.innerHTML = '<option value="all">Todas las categorias</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSelect.appendChild(opt);
        });
        if (cats.includes(prevCat)) catSelect.value = prevCat;
    }

    async function loadDataExplorer(page) {
        const pageNum = typeof page === 'number' ? page : 1;
        const filters = {
            search: document.getElementById('data-search').value,
            type: document.getElementById('data-filter-type').value,
            store: document.getElementById('data-filter-store').value,
            category: document.getElementById('data-filter-category').value,
            channel: document.getElementById('data-filter-channel').value,
            dateFrom: UI.parseDateInput(document.getElementById('data-filter-date-from').value) || '',
            dateTo: UI.parseDateInput(document.getElementById('data-filter-date-to').value) || ''
        };

        const result = await Database.queryOperations(filters, pageNum);
        UI.renderDataTable(result);

        const countEl = document.getElementById('data-record-count');
        if (countEl) countEl.textContent = `${result.total.toLocaleString()} registros`;
    }

    // ============================
    // SETTINGS
    // ============================
    async function loadSettings() {
        const count = await Database.getRecordCount();
        const imports = await Database.getImportHistory();
        UI.updateSettingsInfo(
            `${count.toLocaleString()} registros. ${imports.length} importaciones.`
        );

        const saved = await Database.getSetting('courseStartDate');
        if (saved) document.getElementById('course-start-date').value = UI.formatDate(saved);
        updateCourseStartInfo();

        if (DriveSync.isConnected()) {
            const info = await DriveSync.getBackupInfo();
            UI.updateDriveStatus(info ? `Conectado. Ultimo backup: ${info.lastModified}` : 'Conectado.');
        }
    }

    async function saveCourseStart() {
        const rawValue = document.getElementById('course-start-date').value;
        const isoDate = UI.parseDateInput(rawValue);

        if (!isoDate) { alert('Formato invalido. Usa DD/MM/AAAA.'); return; }

        const d = new Date(isoDate + 'T00:00:00');
        if (d.getDay() !== 6) { alert('La fecha debe ser un sabado.'); return; }

        KPIEngine.setCourseStart(isoDate);
        await Database.setSetting('courseStartDate', isoDate);
        updateCourseStartInfo();
        updateTopbarWeek();
        UI.addLog(`Inicio de curso: ${rawValue}`, 'success');
    }

    function updateCourseStartInfo() {
        const el = document.getElementById('course-start-info');
        if (!el) return;
        const start = KPIEngine.getCourseStart();
        const today = new Date().toISOString().substring(0, 10);
        const wk = KPIEngine.helpers.businessWeek(today);
        el.textContent = `Curso desde ${UI.formatDate(start)}. Hoy es semana ${wk}.`;
    }

    // ============================
    // ACTIONS
    // ============================
    async function resetTool() {
        const step1 = confirm(
            'Vas a restablecer toda la herramienta.\n\n' +
            'Se eliminaran todos los datos importados, el historial y la configuracion.\n\n' +
            'Si quieres conservar los datos, primero exporta un backup JSON desde el Home. ' +
            'Podras restaurarlo despues con "Importar backup".\n\n' +
            'Continuar?'
        );
        if (!step1) return;

        const step2 = confirm(
            'ULTIMA OPORTUNIDAD\n\n' +
            'Esta accion no se puede deshacer. Se borrara todo.\n\n' +
            'Pulsa Aceptar para restablecer.'
        );
        if (!step2) return;

        await Database.clearAll();
        await Database.setSetting('courseStartDate', null);
        KPIEngine.setCourseStart('2025-12-27');
        document.getElementById('course-start-date').value = '27/12/2025';
        await refreshHome();
        navigateTo('home');
        UI.addLog('Herramienta restablecida', 'success');
    }

    async function handleJsonImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        if (!confirm(`Restaurar datos desde "${file.name}"?\n\nEsto reemplazara TODOS los datos actuales.`)) return;

        try {
            UI.addLog('Leyendo backup...');
            let text;
            if (file.name.endsWith('.gz')) {
                const buffer = await file.arrayBuffer();
                const decompressed = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
                text = decompressed;
            } else {
                text = await file.text();
            }
            const data = JSON.parse(text);

            if (!data.operations || !Array.isArray(data.operations)) {
                UI.addLog('Error: el archivo no tiene formato de backup valido', 'error');
                return;
            }

            const total = data.operations.length;
            UI.showProgress(0, total, `Restaurando... 0 de ${total.toLocaleString()}`);

            await Database.importAll(data, (done, tot) => {
                UI.showProgress(done, tot, `Restaurando... ${done.toLocaleString()} de ${tot.toLocaleString()}`);
            });

            UI.hideProgress();

            // Restore course start if present
            if (data.settings) {
                const cs = data.settings.find(s => s.key === 'courseStartDate');
                if (cs && cs.value) {
                    KPIEngine.setCourseStart(cs.value);
                    document.getElementById('course-start-date').value = UI.formatDate(cs.value);
                }
            }

            await refreshHome();
            UI.addLog(`Backup restaurado: ${data.operations.length.toLocaleString()} registros desde ${file.name}`, 'success');
        } catch (err) {
            UI.addLog(`Error al importar JSON: ${err.message}`, 'error');
        }
    }

    async function connectDrive() {
        try {
            await DriveSync.authenticate();
            document.getElementById('home-drive-status').textContent = 'Conectado';
            UI.updateDriveStatus('Conectado');
            UI.addLog('Google Drive conectado', 'success');
        } catch (err) {
            UI.addLog(`Error Drive: ${err.message}`, 'error');
        }
    }

    async function syncDrive() {
        if (!DriveSync.isConnected()) {
            UI.addLog('Conecta primero con Drive en Ajustes', 'error');
            return;
        }
        try {
            UI.addLog('Backup a Drive...');
            const data = await Database.exportAll();
            await DriveSync.backup(data);
            UI.addLog('Backup OK', 'success');
        } catch (err) {
            UI.addLog(`Error backup: ${err.message}`, 'error');
        }
    }

    async function exportData() {
        UI.addLog('Preparando backup comprimido...');
        const data = await Database.exportAll();
        const jsonStr = JSON.stringify(data);
        const compressed = pako.gzip(jsonStr);
        const blob = new Blob([compressed], { type: 'application/gzip' });

        const now = new Date();
        const datePart = now.toISOString().slice(0, 10);
        const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `capimetrics_export_${datePart}_${timePart}.json.gz`;
        a.click();
        URL.revokeObjectURL(url);

        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        UI.addLog(`Backup exportado (${sizeMB} MB comprimido)`, 'success');
    }

    // ============================
    // DASHBOARD: aggregation helpers
    // ============================

    // Aggregate records into per-store KPI buckets.
    // Net sales = sum(sale.total) - sum(|refund.total|).
    // Buys = sum(|cash buy.total|) + sum(|exchange.total|).
    function aggregateByStore(records, excludeEcom) {
        const byStore = {};
        for (const r of records) {
            if (excludeEcom && r.channel === 'ecom') continue;
            const store = r.store || '?';
            if (!byStore[store]) {
                byStore[store] = {
                    saleRevenue: 0, saleUnits: 0, saleTickets: new Set(),
                    refundAmount: 0, cashBuyAmount: 0, exchangeAmount: 0
                };
            }
            const agg = byStore[store];
            const total = r.total || 0;
            if (r.type === 'sale') {
                agg.saleRevenue += total;
                agg.saleUnits += (r.quantity || 0);
                if (r.reference) agg.saleTickets.add(r.reference);
            } else if (r.type === 'refund') {
                agg.refundAmount += Math.abs(total);
            } else if (r.type === 'cash buy') {
                agg.cashBuyAmount += Math.abs(total);
            } else if (r.type === 'exchange') {
                agg.exchangeAmount += Math.abs(total);
            }
        }
        const result = {};
        for (const [store, agg] of Object.entries(byStore)) {
            const buys = agg.cashBuyAmount + agg.exchangeAmount;
            result[store] = {
                netSales: agg.saleRevenue - agg.refundAmount,
                grossSales: agg.saleRevenue,
                refunds: agg.refundAmount,
                units: agg.saleUnits,
                tickets: agg.saleTickets.size,
                buys,
                cashBuys: agg.cashBuyAmount,
                exchanges: agg.exchangeAmount,
                pctVale: buys > 0 ? (agg.exchangeAmount / buys) * 100 : 0
            };
        }
        return result;
    }

    function emptyStoreAgg() {
        return {
            netSales: 0, grossSales: 0, refunds: 0,
            units: 0, tickets: 0,
            buys: 0, cashBuys: 0, exchanges: 0, pctVale: 0
        };
    }

    function weekDateRange(week) {
        const courseStart = KPIEngine.getCourseStart();
        const cs = courseStart.split('-');
        const startMs = Date.UTC(cs[0], cs[1] - 1, cs[2]);
        const fromMs = startMs + (week - 1) * 7 * 86400000;
        const toMs = startMs + week * 7 * 86400000 - 86400000;
        return {
            from: new Date(fromMs).toISOString().substring(0, 10),
            to: new Date(toMs).toISOString().substring(0, 10)
        };
    }

    function updateWeekRangeLabel(elId, weekFrom, weekTo) {
        const from = weekDateRange(weekFrom);
        const to = weekDateRange(weekTo);
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = weekFrom === weekTo
            ? `Semana ${weekFrom} (${UI.formatDate(from.from)} - ${UI.formatDate(from.to)})`
            : `Semanas ${weekFrom}-${weekTo} (${UI.formatDate(from.from)} - ${UI.formatDate(to.to)})`;
    }

    // ============================
    // DASHBOARD: GENERAL (Tiendas x KPIs)
    // ============================
    async function refreshDashGeneral() {
        const today = new Date().toISOString().substring(0, 10);
        const currentWeek = KPIEngine.helpers.businessWeek(today);
        const fromEl = document.getElementById('dg-week-from');
        const toEl = document.getElementById('dg-week-to');
        if (!parseInt(toEl.value) || parseInt(toEl.value) < 1) {
            fromEl.value = Math.max(1, currentWeek - 3);
            toEl.value = currentWeek;
        }
        const weekFrom = parseInt(fromEl.value) || 1;
        const weekTo = parseInt(toEl.value) || weekFrom;
        const excludeEcom = document.getElementById('dg-exclude-ecom').checked;

        updateWeekRangeLabel('dg-week-range', weekFrom, weekTo);

        if (weekTo < weekFrom || weekTo - weekFrom > 52) {
            document.getElementById('dg-tbody').innerHTML =
                '<tr><td colspan="11" class="empty-msg">Rango de semanas no valido.</td></tr>';
            return;
        }

        const allData = await Database.getOperationsForKPI({});
        const rangeRecords = allData.filter(r => r.week >= weekFrom && r.week <= weekTo);
        const agg = aggregateByStore(rangeRecords, excludeEcom);

        const stores = Object.keys(agg).sort((a, b) => a.localeCompare(b));

        const thead = document.getElementById('dg-thead');
        thead.innerHTML = `<tr>
            <th class="col-name">Tienda</th>
            <th>Ventas</th>
            <th>Compras</th>
            <th title="% de compras hechas con vale de tienda (exchange)">% Vale</th>
            <th>Socios</th>
            <th>Stock</th>
            <th>KPI 1</th>
            <th>KPI 2</th>
            <th>KPI 3</th>
            <th>KPI 4</th>
            <th>KPI 5</th>
        </tr>`;

        const tbody = document.getElementById('dg-tbody');
        if (!stores.length) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">Sin datos para esta semana.</td></tr>';
            document.getElementById('dg-tfoot').innerHTML = '';
            return;
        }

        let totNet = 0, totBuys = 0, totCashBuys = 0, totExch = 0;
        let html = '';
        for (const store of stores) {
            const a = agg[store];
            totNet += a.netSales;
            totBuys += a.buys;
            totCashBuys += a.cashBuys;
            totExch += a.exchanges;
            html += `<tr>
                <td class="col-name">${escapeHtml(store)}</td>
                <td>${formatCurrency(a.netSales)}</td>
                <td>${formatCurrency(a.buys)}</td>
                <td>${a.buys > 0 ? Math.round(a.pctVale) + '%' : '--'}</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
                <td class="cell-empty">--</td>
            </tr>`;
        }
        tbody.innerHTML = html;

        const totPct = totBuys > 0 ? Math.round((totExch / totBuys) * 100) : 0;
        document.getElementById('dg-tfoot').innerHTML = `<tr class="row-total">
            <td class="col-name"><strong>TOTAL</strong></td>
            <td><strong>${formatCurrency(totNet)}</strong></td>
            <td><strong>${formatCurrency(totBuys)}</strong></td>
            <td><strong>${totBuys > 0 ? totPct + '%' : '--'}</strong></td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
            <td class="cell-empty">--</td>
        </tr>`;
    }

    // ============================
    // DASHBOARD: DETAIL (Tiendas x Categoria)
    // ============================
    async function refreshDashDetail() {
        const today = new Date().toISOString().substring(0, 10);
        const currentWeek = KPIEngine.helpers.businessWeek(today);
        const weekEl = document.getElementById('dd-week');
        if (!parseInt(weekEl.value) || parseInt(weekEl.value) < 1) {
            weekEl.value = currentWeek;
        }
        const week = parseInt(weekEl.value) || 1;
        const metric = document.getElementById('dd-metric').value;
        const excludeEcom = document.getElementById('dd-exclude-ecom').checked;

        updateWeekRangeLabel('dd-week-range', week, week);

        const allData = await Database.getOperationsForKPI({});
        const weekRecords = allData.filter(r => r.week === week);

        // Aggregate by store x category
        const byStoreCat = {};
        const allCategories = new Set();
        const allStores = new Set();

        for (const r of weekRecords) {
            if (excludeEcom && r.channel === 'ecom') continue;
            const store = r.store || '?';
            const cat = r.category || 'Sin categoria';
            allStores.add(store);
            allCategories.add(cat);

            if (!byStoreCat[store]) byStoreCat[store] = {};
            if (!byStoreCat[store][cat]) {
                byStoreCat[store][cat] = { netSales: 0, units: 0, tickets: new Set(), buys: 0 };
            }
            const bucket = byStoreCat[store][cat];
            const total = r.total || 0;
            if (r.type === 'sale') {
                bucket.netSales += total;
                bucket.units += (r.quantity || 0);
                if (r.reference) bucket.tickets.add(r.reference);
            } else if (r.type === 'refund') {
                bucket.netSales -= Math.abs(total);
            } else if (r.type === 'cash buy' || r.type === 'exchange') {
                bucket.buys += Math.abs(total);
            }
        }

        const stores = [...allStores].sort((a, b) => a.localeCompare(b));
        const categories = [...allCategories].sort((a, b) => a.localeCompare(b));

        const thead = document.getElementById('dd-thead');
        const tbody = document.getElementById('dd-tbody');
        const tfoot = document.getElementById('dd-tfoot');

        if (!stores.length || !categories.length) {
            thead.innerHTML = '<tr><th>Tienda</th></tr>';
            tbody.innerHTML = '<tr><td class="empty-msg">Sin datos para esta semana.</td></tr>';
            tfoot.innerHTML = '';
            return;
        }

        const isCurrency = metric === 'netSales' || metric === 'buys';
        const extract = (bucket) => {
            if (!bucket) return 0;
            if (metric === 'tickets') return bucket.tickets.size;
            return bucket[metric] || 0;
        };
        const fmt = (v) => isCurrency ? formatCurrency(v) : (v || 0).toLocaleString('es-ES');

        // Header
        let head = '<tr><th class="col-name">Tienda</th>';
        for (const cat of categories) head += `<th>${escapeHtml(cat)}</th>`;
        head += '<th class="col-shaded">Total</th></tr>';
        thead.innerHTML = head;

        // Body
        let html = '';
        const colTotals = new Array(categories.length).fill(0);
        let grandTotal = 0;

        for (const store of stores) {
            let rowTotal = 0;
            let row = `<tr><td class="col-name">${escapeHtml(store)}</td>`;
            categories.forEach((cat, i) => {
                const v = extract(byStoreCat[store]?.[cat]);
                rowTotal += v;
                colTotals[i] += v;
                row += `<td>${v ? fmt(v) : '<span class="cell-zero">--</span>'}</td>`;
            });
            grandTotal += rowTotal;
            row += `<td class="col-shaded"><strong>${rowTotal ? fmt(rowTotal) : '--'}</strong></td></tr>`;
            html += row;
        }
        tbody.innerHTML = html;

        // Footer totals
        let foot = '<tr class="row-total"><td class="col-name"><strong>TOTAL</strong></td>';
        colTotals.forEach(v => {
            foot += `<td><strong>${v ? fmt(v) : '--'}</strong></td>`;
        });
        foot += `<td class="col-shaded"><strong>${grandTotal ? fmt(grandTotal) : '--'}</strong></td></tr>`;
        tfoot.innerHTML = foot;
    }

    // ============================
    // CHANGELOG
    // ============================
    function openChangelog() {
        const body = document.getElementById('changelog-body');
        body.innerHTML = Changelog.map(entry => `
            <div class="changelog-date">${entry.date}</div>
            ${entry.items.map(item => `
                <div class="changelog-item">
                    <span class="changelog-tag ${item.type}">${item.type}</span>
                    <span>${item.text}</span>
                </div>
            `).join('')}
        `).join('');
        document.getElementById('changelog-overlay').classList.remove('hidden');
    }

    function closeChangelog() {
        document.getElementById('changelog-overlay').classList.add('hidden');
    }

    // ============================
    // HELPERS
    // ============================
    function formatCurrency(val) {
        return (val || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    }

    function applyHeatmap(tableId, dataMap, weeks, metricExtractor) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0 || weeks.length === 0) return;

        // Find which column index the week data starts at
        const ths = table.querySelectorAll('thead th');
        let dataStart = -1;
        ths.forEach((th, i) => {
            const sort = th.dataset.evoSort || th.dataset.csSort || '';
            if (/^\d+$/.test(sort) && dataStart === -1) dataStart = i;
        });
        if (dataStart === -1) return;

        // Collect all numeric values from the data to find max
        let maxVal = 0;
        const keys = Object.keys(dataMap);
        for (const key of keys) {
            for (const w of weeks) {
                const v = metricExtractor(dataMap[key]?.[w]);
                if (v > maxVal) maxVal = v;
            }
        }
        if (maxVal === 0) return;

        // Apply to each row's week cells
        rows.forEach(row => {
            const rowKey = row.dataset.staff || row.dataset.csKey;
            if (!rowKey || rowKey === '__TOTAL__') return;
            const wd = dataMap[rowKey];
            if (!wd) return;
            weeks.forEach((w, wi) => {
                const td = row.children[dataStart + wi];
                if (!td) return;
                const v = metricExtractor(wd[w]);
                if (v <= 0) return;
                const alpha = (v / maxVal * 0.35).toFixed(2);
                td.style.backgroundColor = `rgba(37, 99, 235, ${alpha})`;
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    document.addEventListener('DOMContentLoaded', init);
    return { init };
})();
