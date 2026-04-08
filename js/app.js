/**
 * KPI Tool 2026 - Main Application Controller
 */
const App = (() => {
    let currentPreviewData = null;
    let currentImportSource = 'baby-banking';

    const SOURCE_LABELS = {
        'baby-banking': 'Baby Banking ES',
        'ecom': 'Ecom Sales',
        'attachment': 'Attachment',
        'captacion': 'Captacion'
    };

    async function init() {
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

        bindEvents();
        await refreshHome();
        updateGreeting();
        updateTopbarWeek();

        console.log('KPI Tool 2026 initialized');
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

        // CSV import
        const dropZone = document.getElementById('drop-zone');
        const csvInput = document.getElementById('csv-input');

        document.getElementById('btn-select-file').addEventListener('click', (e) => {
            e.stopPropagation();
            csvInput.click();
        });
        dropZone.addEventListener('click', () => csvInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
        });
        csvInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleFileSelected(e.target.files[0]);
        });

        document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);
        document.getElementById('btn-cancel-import').addEventListener('click', () => {
            currentPreviewData = null;
            UI.hidePreview();
        });

        // Import source buttons
        document.querySelectorAll('.import-source-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.import-source-btn').forEach(b => b.classList.remove('active-source'));
                btn.classList.add('active-source');
                currentImportSource = btn.dataset.source;
                document.getElementById('drop-zone-label').innerHTML =
                    `Arrastra un CSV de <strong>${SOURCE_LABELS[currentImportSource]}</strong> o haz clic para seleccionar`;
            });
        });

        // Data explorer
        document.getElementById('data-search').addEventListener('input', debounce(loadDataExplorer, 300));
        document.getElementById('data-filter-type').addEventListener('change', loadDataExplorer);
        document.getElementById('data-pagination').addEventListener('click', (e) => {
            if (e.target.dataset.page) loadDataExplorer(parseInt(e.target.dataset.page));
        });
        document.getElementById('btn-export').addEventListener('click', exportData);

        // Home summary filters
        document.getElementById('home-summary-period').addEventListener('change', refreshHomeSummary);
        document.getElementById('home-summary-store').addEventListener('change', refreshHomeSummary);

        // KPI Mobiles filters
        document.getElementById('kpi-panel-period').addEventListener('change', onKpiPeriodChange);
        document.getElementById('kpi-panel-store').addEventListener('change', refreshKPIMobiles);
        document.getElementById('kpi-panel-scope').addEventListener('change', refreshKPIMobiles);
        document.getElementById('kpi-panel-week-pick').addEventListener('change', refreshKPIMobiles);

        // KPI table sorting
        document.querySelectorAll('#kpi-panel-table th.sortable').forEach(th => {
            th.addEventListener('click', () => sortKPITable(th.dataset.col));
        });

        // Evolution controls
        document.getElementById('evo-week-from').addEventListener('change', refreshEvolution);
        document.getElementById('evo-week-to').addEventListener('change', refreshEvolution);
        document.getElementById('evo-metric').addEventListener('change', refreshEvolution);
        document.getElementById('evo-scope').addEventListener('change', refreshEvolution);

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
        document.getElementById('btn-drive-auth').addEventListener('click', connectDrive);
        document.getElementById('btn-save-course-start').addEventListener('click', saveCourseStart);
    }

    function handleAction(action) {
        switch (action) {
            case 'go-home': navigateTo('home'); break;
            case 'go-import': navigateTo('import'); break;
            case 'go-data': navigateTo('data'); break;
            case 'go-settings': navigateTo('settings'); break;
            case 'go-kpi-mobiles': navigateTo('kpi-mobiles'); break;
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
        if (sectionId === 'import') renderImportHistory();
        if (sectionId === 'data') loadDataExplorer();
        if (sectionId === 'settings') loadSettings();
        if (sectionId === 'kpi-mobiles') refreshKPIMobiles();
    }

    // ============================
    // GREETING & TOPBAR
    // ============================
    function updateGreeting() {
        const h = new Date().getHours();
        let greeting = 'Buenas noches';
        if (h >= 6 && h < 14) greeting = 'Buenos dias';
        else if (h >= 14 && h < 21) greeting = 'Buenas tardes';
        document.getElementById('home-greeting-text').textContent = greeting;
    }

    function updateTopbarWeek() {
        const today = new Date().toISOString().substring(0, 10);
        const wk = KPIEngine.helpers.businessWeek(today);
        document.getElementById('topbar-week').textContent = `Semana ${wk}`;
        document.getElementById('home-week-num').textContent = wk;
    }

    // ============================
    // HOME: Refresh all
    // ============================
    async function refreshHome() {
        const count = await Database.getRecordCount();
        document.getElementById('db-status-badge').textContent = `DB: ${count.toLocaleString()}`;
        document.getElementById('home-record-count').textContent = `${count.toLocaleString()} registros`;

        // Last import
        const imports = await Database.getImportHistory();
        document.getElementById('home-last-import').textContent =
            imports.length > 0 ? UI.formatDate(imports[0].date) : 'Ninguna';

        // Store name from data
        const stores = await Database.getDistinctValues('store');
        document.getElementById('home-store-name').textContent =
            stores.length === 1 ? stores[0] : (stores.length > 1 ? `${stores.length} tiendas` : '--');

        // Populate store filters
        populateStoreSelect('home-summary-store', stores);

        updateTopbarWeek();
        await refreshHomeSummary();
    }

    function populateStoreSelect(selectId, stores) {
        const sel = document.getElementById(selectId);
        const current = sel.value;
        sel.innerHTML = '<option value="all">Todas las tiendas</option>';
        for (const s of stores) {
            sel.innerHTML += `<option value="${s}">${s}</option>`;
        }
        sel.value = current || 'all';
    }

    // ============================
    // HOME: Summary panel
    // ============================
    /**
     * Compute date range for a period selector value.
     * Uses UTC arithmetic to avoid DST issues.
     */
    function getPeriodDateRange(periodValue) {
        const today = new Date().toISOString().substring(0, 10);
        const currentWeek = KPIEngine.helpers.businessWeek(today);
        const courseStart = KPIEngine.getCourseStart();
        const cs = courseStart.split('-');
        const startMs = Date.UTC(cs[0], cs[1] - 1, cs[2]);

        if (periodValue === 'all') return { dateFrom: null, dateTo: null, label: 'Todos los datos' };

        let fromWeek, toWeek;
        if (periodValue === 'current-week') {
            fromWeek = currentWeek;
            toWeek = currentWeek;
        } else if (periodValue === 'last-week') {
            fromWeek = currentWeek - 1;
            toWeek = currentWeek - 1;
        } else if (periodValue === 'last-4') {
            fromWeek = currentWeek - 3;
            toWeek = currentWeek;
        }

        const fromMs = startMs + (fromWeek - 1) * 7 * 86400000;
        const toMs = startMs + toWeek * 7 * 86400000 - 86400000;
        const fromDate = new Date(fromMs).toISOString().substring(0, 10);
        const toDate = new Date(toMs).toISOString().substring(0, 10);

        return {
            dateFrom: fromDate,
            dateTo: toDate,
            label: fromWeek === toWeek
                ? `Semana ${fromWeek} (${UI.formatDate(fromDate)} - ${UI.formatDate(toDate)})`
                : `Semanas ${fromWeek}-${toWeek} (${UI.formatDate(fromDate)} - ${UI.formatDate(toDate)})`
        };
    }

    async function refreshHomeSummary() {
        const periodValue = document.getElementById('home-summary-period').value;
        const store = document.getElementById('home-summary-store').value;
        const range = getPeriodDateRange(periodValue);

        const filters = { store: store };
        if (range.dateFrom) {
            filters.dateFrom = range.dateFrom;
            filters.dateTo = range.dateTo;
        }

        const data = await Database.getOperationsForKPI(filters);

        // Filter by date range if needed (getOperationsForKPI only uses one where clause)
        let filtered = data;
        if (range.dateFrom) {
            filtered = data.filter(r => r.date >= range.dateFrom && r.date <= range.dateTo);
        }
        if (store && store !== 'all') {
            filtered = filtered.filter(r => r.store === store);
        }

        const sales = filtered.filter(r => r.type === 'sale');
        const buys = filtered.filter(r => r.type === 'cash buy');
        const exchanges = filtered.filter(r => r.type === 'exchange');
        const rma = filtered.filter(r => r.type === 'rma');

        const salesTotal = sales.reduce((s, r) => s + (r.total || 0), 0);
        const buysTotal = buys.reduce((s, r) => s + (r.total || 0), 0);

        document.getElementById('summary-sales').textContent = sales.length.toLocaleString();
        document.getElementById('summary-sales-total').textContent = formatCurrency(salesTotal);
        document.getElementById('summary-buys').textContent = buys.length.toLocaleString();
        document.getElementById('summary-buys-total').textContent = formatCurrency(buysTotal);
        document.getElementById('summary-exchanges').textContent = exchanges.length.toLocaleString();
        document.getElementById('summary-rma').textContent = rma.length.toLocaleString();
        document.getElementById('summary-date-range').textContent = range.label;
    }

    // ============================
    // KPI PANEL (sortable, multi-KPI ready)
    // ============================
    let kpiPanelData = [];       // current rows for sorting
    let kpiSortCol = 'mobiles';  // default sort column
    let kpiSortDir = 'desc';     // 'asc' or 'desc'

    function onKpiPeriodChange() {
        const period = document.getElementById('kpi-panel-period').value;
        const weekPick = document.getElementById('kpi-panel-week-pick');

        if (period === 'week-pick') {
            // Populate week picker with available weeks
            const today = new Date().toISOString().substring(0, 10);
            const currentWeek = KPIEngine.helpers.businessWeek(today);
            weekPick.innerHTML = '';
            for (let w = currentWeek; w >= 1; w--) {
                weekPick.innerHTML += `<option value="${w}">W${w}</option>`;
            }
            weekPick.style.display = '';
        } else {
            weekPick.style.display = 'none';
        }
        refreshKPIMobiles();
    }

    async function refreshKPIMobiles() {
        // Populate store filter
        const stores = await Database.getDistinctValues('store');
        populateStoreSelect('kpi-panel-store', stores);

        // Set sensible week range defaults for evolution
        const today = new Date().toISOString().substring(0, 10);
        const currentWeek = KPIEngine.helpers.businessWeek(today);
        const fromEl = document.getElementById('evo-week-from');
        const toEl = document.getElementById('evo-week-to');
        if (parseInt(toEl.value) < 2) {
            fromEl.value = Math.max(1, currentWeek - 3);
            toEl.value = currentWeek;
        }

        const periodValue = document.getElementById('kpi-panel-period').value;
        const store = document.getElementById('kpi-panel-store').value;
        const scope = document.getElementById('kpi-panel-scope').value;

        // Handle week-pick: override period with specific week
        let range;
        if (periodValue === 'week-pick') {
            const wk = parseInt(document.getElementById('kpi-panel-week-pick').value) || currentWeek;
            const courseStart = KPIEngine.getCourseStart();
            const cs = courseStart.split('-');
            const startMs = Date.UTC(cs[0], cs[1] - 1, cs[2]);
            const fromMs = startMs + (wk - 1) * 7 * 86400000;
            const toMs = startMs + wk * 7 * 86400000 - 86400000;
            const fromDate = new Date(fromMs).toISOString().substring(0, 10);
            const toDate = new Date(toMs).toISOString().substring(0, 10);
            range = {
                dateFrom: fromDate,
                dateTo: toDate,
                label: `Semana ${wk} (${UI.formatDate(fromDate)} - ${UI.formatDate(toDate)})`
            };
        } else {
            range = getPeriodDateRange(periodValue);
        }

        // Update title and header based on scope
        const titleEl = document.getElementById('kpi-summary-title');
        const theadEl = document.getElementById('kpi-panel-thead');
        const firstCol = scope === 'total' ? 'Tienda' : 'Empleado';
        titleEl.textContent = scope === 'total' ? 'Resumen global' : 'Resumen por empleado';
        theadEl.innerHTML = `<tr>
            <th class="sortable" data-col="name">${firstCol}</th>
            <th class="sortable" data-col="mobiles">Moviles</th>
            <th class="sortable" data-col="mobilesTotal">Total</th>
            <th class="sortable" data-col="services">Services</th>
            <th class="sortable" data-col="pctServices">% Gel</th>
            <th class="sortable" data-col="basics">Basics</th>
            <th class="sortable" data-col="pctBasics">% Basics</th>
            <th class="sortable" data-col="pctCombo">% Combo</th>
        </tr>`;
        // Re-bind sort on new headers
        theadEl.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => sortKPITable(th.dataset.col));
        });

        // Week range label
        document.getElementById('kpi-panel-week-range').textContent = range.label;

        const allData = await Database.getOperationsForKPI({});

        // Base filter: date range + store
        let baseFiltered = allData;
        if (range.dateFrom) {
            baseFiltered = baseFiltered.filter(r => r.date >= range.dateFrom && r.date <= range.dateTo);
        }
        if (store && store !== 'all') {
            baseFiltered = baseFiltered.filter(r => r.store === store);
        }

        const sales = baseFiltered.filter(r => r.type === 'sale');

        // Group by key (staff or store name for global)
        const byKey = {};
        for (const r of sales) {
            const name = scope === 'total' ? (r.store || 'N/A') : (r.staff || 'N/A');
            if (!byKey[name]) byKey[name] = { name, mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };

            const catLower = (r.category || '').toLowerCase();
            const qty = r.quantity || 0;

            if (catLower.includes('moviles')) {
                byKey[name].mobiles += qty;
                byKey[name].mobilesTotal += (r.total || 0);
            }
            if (catLower.includes('services')) {
                byKey[name].services += qty;
            }
            if (catLower.includes('basics')) {
                byKey[name].basics += qty;
            }
        }

        kpiPanelData = Object.values(byKey)
            .filter(d => d.mobiles > 0 || d.services > 0 || d.basics > 0)
            .map(d => {
                const combo = d.services + d.basics;
                return {
                    ...d,
                    pctServices: d.mobiles > 0 ? Math.round((d.services / d.mobiles) * 100) : 0,
                    pctBasics: d.mobiles > 0 ? Math.round((d.basics / d.mobiles) * 100) : 0,
                    pctCombo: d.mobiles > 0 ? Math.round((combo / d.mobiles) * 100) : 0
                };
            });

        renderKPITable();
        refreshEvolution();
    }

    function sortKPITable(col) {
        if (kpiSortCol === col) {
            kpiSortDir = kpiSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            kpiSortCol = col;
            kpiSortDir = col === 'name' ? 'asc' : 'desc';
        }

        // Update header classes
        document.querySelectorAll('#kpi-panel-table th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.col === kpiSortCol) {
                th.classList.add(kpiSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        renderKPITable();
    }

    function formatPct(val) {
        const cls = val > 40 ? 'pct-good' : val >= 30 ? 'pct-ok' : 'pct-low';
        return `<span class="pct-cell ${cls}">${val}%</span>`;
    }

    /** Format percentage with unit breakdown: "33% <small>(4/12)</small>" */
    function formatPctDetail(numerator, denominator) {
        if (denominator <= 0) return '--';
        const pct = Math.round((numerator / denominator) * 100);
        const cls = pct > 40 ? 'pct-good' : pct >= 30 ? 'pct-ok' : 'pct-low';
        return `<span class="pct-cell ${cls}">${pct}%</span> <small class="pct-units">${numerator}/${denominator}</small>`;
    }

    function renderKPITable() {
        const tbody = document.getElementById('kpi-panel-tbody');
        const tfoot = document.getElementById('kpi-panel-tfoot');

        if (kpiPanelData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Sin datos para este periodo.</td></tr>';
            tfoot.innerHTML = '';
            return;
        }

        const sorted = [...kpiPanelData].sort((a, b) => {
            let va = a[kpiSortCol], vb = b[kpiSortCol];
            if (typeof va === 'string') {
                va = va.toLowerCase(); vb = vb.toLowerCase();
                return kpiSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            return kpiSortDir === 'asc' ? va - vb : vb - va;
        });

        const totals = { mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };
        for (const d of sorted) {
            totals.mobiles += d.mobiles;
            totals.mobilesTotal += d.mobilesTotal;
            totals.services += d.services;
            totals.basics += d.basics;
        }

        tbody.innerHTML = sorted.map(d => `
            <tr>
                <td>${escapeHtml(d.name)}</td>
                <td><strong>${d.mobiles}</strong></td>
                <td>${formatCurrency(d.mobilesTotal)}</td>
                <td>${d.services}</td>
                <td>${formatPctDetail(d.services, d.mobiles)}</td>
                <td>${d.basics}</td>
                <td>${formatPctDetail(d.basics, d.mobiles)}</td>
                <td>${formatPctDetail(d.services + d.basics, d.mobiles)}</td>
            </tr>
        `).join('');

        tfoot.innerHTML = `
            <tr>
                <td>TOTAL</td>
                <td><strong>${totals.mobiles}</strong></td>
                <td>${formatCurrency(totals.mobilesTotal)}</td>
                <td><strong>${totals.services}</strong></td>
                <td>${formatPctDetail(totals.services, totals.mobiles)}</td>
                <td><strong>${totals.basics}</strong></td>
                <td>${formatPctDetail(totals.basics, totals.mobiles)}</td>
                <td>${formatPctDetail(totals.services + totals.basics, totals.mobiles)}</td>
            </tr>
        `;
    }

    // ============================
    // EVOLUTION TABLE
    // ============================
    let evoState = {
        staffWeekData: {},
        weeks: [],
        scope: 'staff',
        metric: 'mobiles',
        sortCol: null,   // null = alphabetical, or week number, or 'total'
        sortDir: 'desc'  // first click always desc
    };

    async function refreshEvolution() {
        const weekFrom = parseInt(document.getElementById('evo-week-from').value) || 1;
        const weekTo = parseInt(document.getElementById('evo-week-to').value) || weekFrom;
        evoState.metric = document.getElementById('evo-metric').value;
        evoState.scope = document.getElementById('evo-scope').value;
        const store = document.getElementById('kpi-panel-store').value;

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
        let sales = allData.filter(r => r.type === 'sale');
        if (store && store !== 'all') {
            sales = sales.filter(r => r.store === store);
        }

        evoState.staffWeekData = {};
        for (const r of sales) {
            const wk = r.week;
            if (wk < weekFrom || wk > weekTo) continue;

            const name = evoState.scope === 'total' ? 'Total tienda' : (r.staff || 'N/A');
            const catLower = (r.category || '').toLowerCase();
            const qty = r.quantity || 0;

            if (!evoState.staffWeekData[name]) evoState.staffWeekData[name] = {};
            if (!evoState.staffWeekData[name][wk]) evoState.staffWeekData[name][wk] = { mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };

            const cell = evoState.staffWeekData[name][wk];
            if (catLower.includes('moviles')) { cell.mobiles += qty; cell.mobilesTotal += (r.total || 0); }
            if (catLower.includes('services')) { cell.services += qty; }
            if (catLower.includes('basics')) { cell.basics += qty; }
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
    }

    function evoSortValue(name, col, metric, weeks) {
        const wd = evoState.staffWeekData[name];
        if (col === 'name') return name.toLowerCase();
        // Get cell data for a specific week or total
        let cellData;
        if (col === 'total') {
            cellData = { mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };
            for (const wk of weeks) { const c = wd?.[wk]; if (c) { cellData.mobiles += c.mobiles; cellData.mobilesTotal += c.mobilesTotal; cellData.services += c.services; cellData.basics += c.basics; } }
        } else {
            cellData = wd?.[col] || { mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };
        }
        const m = cellData.mobiles, s = cellData.services, b = cellData.basics;
        if (metric === 'pctServices') return m > 0 ? s / m : -1;
        if (metric === 'pctBasics') return m > 0 ? b / m : -1;
        if (metric === 'pctCombo') return m > 0 ? (s + b) / m : -1;
        if (metric === 'mobilesTotal') return cellData.mobilesTotal;
        return cellData[metric] || 0;
    }

    function evoCellValue(cellData, metricKey) {
        if (!cellData) {
            if (metricKey.startsWith('pct')) return '--';
            if (metricKey === 'mobilesTotal') return formatCurrency(0);
            return '0';
        }
        const m = cellData.mobiles, s = cellData.services, b = cellData.basics;
        if (metricKey === 'pctServices') return formatPctDetail(s, m);
        if (metricKey === 'pctBasics') return formatPctDetail(b, m);
        if (metricKey === 'pctCombo') return formatPctDetail(s + b, m);
        if (metricKey === 'mobilesTotal') return formatCurrency(cellData.mobilesTotal);
        return cellData[metricKey] || 0;
    }

    function evoRowTotal(weekData, metricKey, weeks) {
        let sumM = 0, sumS = 0, sumB = 0, sumMT = 0;
        for (const wk of weeks) {
            const c = weekData[wk]; if (!c) continue;
            sumM += c.mobiles; sumS += c.services; sumB += c.basics; sumMT += c.mobilesTotal;
        }
        if (metricKey === 'pctServices') return formatPctDetail(sumS, sumM);
        if (metricKey === 'pctBasics') return formatPctDetail(sumB, sumM);
        if (metricKey === 'pctCombo') return formatPctDetail(sumS + sumB, sumM);
        if (metricKey === 'mobilesTotal') return formatCurrency(sumMT);
        if (metricKey === 'mobiles') return sumM;
        if (metricKey === 'services') return sumS;
        if (metricKey === 'basics') return sumB;
        return 0;
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

        thead.innerHTML = `<tr>
            <th class="sortable${sortCls('name')}" data-evo-sort="name">${scope === 'total' ? '' : 'Empleado'}</th>
            ${weeks.map(w => `<th class="sortable${sortCls(w)}" data-evo-sort="${w}">W${w}</th>`).join('')}
            <th class="sortable${sortCls('total')}" data-evo-sort="total"><strong>Total</strong></th>
        </tr>`;

        // Bind sort clicks
        thead.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.evoSort;
                sortEvolution(col === 'name' || col === 'total' ? col : parseInt(col));
            });
        });

        let staffNames = Object.keys(staffWeekData);

        if (staffNames.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${weeks.length + 2}" class="empty-msg">Sin datos para estas semanas.</td></tr>`;
            tfoot.innerHTML = '';
            return;
        }

        // Sort
        if (sortCol !== null) {
            staffNames.sort((a, b) => {
                const va = evoSortValue(a, sortCol, metric, weeks);
                const vb = evoSortValue(b, sortCol, metric, weeks);
                if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
                return sortDir === 'asc' ? va - vb : vb - va;
            });
        } else {
            staffNames.sort();
        }

        tbody.innerHTML = staffNames.map(name => {
            const wd = staffWeekData[name];
            return `<tr>
                <td>${escapeHtml(name)}</td>
                ${weeks.map(w => `<td>${evoCellValue(wd?.[w], metric)}</td>`).join('')}
                <td><strong>${evoRowTotal(wd || {}, metric, weeks)}</strong></td>
            </tr>`;
        }).join('');

        if (scope === 'staff' && staffNames.length > 1) {
            const colTotals = {};
            for (const w of weeks) {
                colTotals[w] = { mobiles: 0, mobilesTotal: 0, services: 0, basics: 0 };
                for (const name of staffNames) {
                    const c = staffWeekData[name]?.[w]; if (!c) continue;
                    colTotals[w].mobiles += c.mobiles; colTotals[w].mobilesTotal += c.mobilesTotal;
                    colTotals[w].services += c.services; colTotals[w].basics += c.basics;
                }
            }
            tfoot.innerHTML = `<tr>
                <td>TOTAL</td>
                ${weeks.map(w => `<td><strong>${evoCellValue(colTotals[w], metric)}</strong></td>`).join('')}
                <td><strong>${evoRowTotal(colTotals, metric, weeks)}</strong></td>
            </tr>`;
        } else {
            tfoot.innerHTML = '';
        }
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
            const preview = await CSVParser.parsePreview(file);
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
            });

            UI.addLog(`Parseado: ${result.records.length} validas de ${result.totalRows}`);

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
            await refreshHome();
        } catch (err) {
            UI.hideProgress();
            UI.addLog(`Error: ${err.message}`, 'error');
        }
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
    // DATA EXPLORER
    // ============================
    async function loadDataExplorer(page) {
        const pageNum = typeof page === 'number' ? page : 1;
        const search = document.getElementById('data-search').value;
        const type = document.getElementById('data-filter-type').value;

        const result = await Database.queryOperations({ type, search }, pageNum);
        UI.renderDataTable(result);
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

            await Database.importAll(data);

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
        a.download = `kpitool_export_${datePart}_${timePart}.json.gz`;
        a.click();
        URL.revokeObjectURL(url);

        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        UI.addLog(`Backup exportado (${sizeMB} MB comprimido)`, 'success');
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
        return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
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
