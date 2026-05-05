import { describe, it, expect } from 'vitest';
import KPIEngine from '../js/modules/kpi-engine.js';

describe('businessWeek - calendario sabado a viernes', () => {
    const { businessWeek, businessWeekKey } = KPIEngine.helpers;

    it('27 dic 2025 (sabado, primer dia del curso) es semana 1', () => {
        expect(businessWeek('2025-12-27')).toBe(1);
    });

    it('2 ene 2026 (viernes, ultimo dia de W1) sigue siendo semana 1', () => {
        expect(businessWeek('2026-01-02')).toBe(1);
    });

    it('3 ene 2026 (sabado siguiente) ya es semana 2', () => {
        expect(businessWeek('2026-01-03')).toBe(2);
    });

    it('una semana mas adelante (10 ene 2026) es semana 3', () => {
        expect(businessWeek('2026-01-10')).toBe(3);
    });

    it('businessWeekKey devuelve formato Wxx con padding a 2 digitos', () => {
        expect(businessWeekKey('2025-12-27')).toBe('W01');
        expect(businessWeekKey('2026-01-03')).toBe('W02');
    });

    it('fecha vacia o null devuelve N/A', () => {
        expect(businessWeekKey(null)).toBe('N/A');
        expect(businessWeekKey('')).toBe('N/A');
    });
});

describe('groupBy', () => {
    const { groupBy } = KPIEngine.helpers;

    it('agrupa registros por un campo', () => {
        const data = [
            { type: 'sale', total: 10 },
            { type: 'sale', total: 20 },
            { type: 'refund', total: -5 }
        ];
        const groups = groupBy(data, 'type');
        expect(groups.sale).toHaveLength(2);
        expect(groups.refund).toHaveLength(1);
    });

    it('registros sin valor en el campo caen en N/A', () => {
        const data = [{ total: 10 }, { type: null, total: 20 }];
        const groups = groupBy(data, 'type');
        expect(groups['N/A']).toHaveLength(2);
    });
});

describe('KPIs registrados - filtros por tipo de transaccion', () => {
    const data = [
        { type: 'sale', total: 100, quantity: 1, category: 'Moviles - iPhone', staff: 'Ana', store: 'Madrid', date: '2026-01-17' },
        { type: 'sale', total: 200, quantity: 2, category: 'Moviles - iPhone', staff: 'Bea', store: 'Madrid', date: '2026-01-17' },
        { type: 'sale', total: 50, quantity: 1, category: 'Videojuegos', staff: 'Ana', store: 'Madrid', date: '2026-01-17' },
        { type: 'refund', total: -50, quantity: 1, staff: 'Ana', store: 'Madrid', date: '2026-01-17' },
        { type: 'cash buy', total: -80, quantity: 1, staff: 'Ana', store: 'Madrid', date: '2026-01-17' },
        { type: 'exchange', total: -120, quantity: 1, staff: 'Ana', store: 'Madrid', date: '2026-01-17' }
    ];

    it('total-sales solo cuenta filas type=sale', () => {
        const r = KPIEngine.calculate('total-sales', data);
        expect(r.value).toBe(3);
        expect(r.total).toBe(350);
    });

    it('refunds solo cuenta filas type=refund', () => {
        const r = KPIEngine.calculate('refunds', data);
        expect(r.value).toBe(1);
        expect(r.total).toBe(-50);
    });

    it('cash-buys solo cuenta filas type="cash buy"', () => {
        const r = KPIEngine.calculate('cash-buys', data);
        expect(r.value).toBe(1);
        expect(r.total).toBe(-80);
    });

    it('exchanges solo cuenta filas type=exchange', () => {
        const r = KPIEngine.calculate('exchanges', data);
        expect(r.value).toBe(1);
        expect(r.total).toBe(-120);
    });

    it('ventas netas se obtienen sumando sales + refunds (refunds son negativos)', () => {
        const sales = KPIEngine.calculate('total-sales', data);
        const refunds = KPIEngine.calculate('refunds', data);
        const netas = sales.total + refunds.total;
        expect(netas).toBe(300);
    });

    it('mobile-sales-by-staff-week solo cuenta categorias que empiezan por "Moviles"', () => {
        const r = KPIEngine.calculate('mobile-sales-by-staff-week', data);
        expect(r.Ana).toBeDefined();
        expect(r.Bea).toBeDefined();

        const wkAna = Object.keys(r.Ana)[0];
        const wkBea = Object.keys(r.Bea)[0];

        // Ana: 1 movil x 100€ (la venta de Videojuegos NO entra)
        expect(r.Ana[wkAna].count).toBe(1);
        expect(r.Ana[wkAna].total).toBe(100);

        // Bea: 2 moviles x 200€ (count usa quantity, no nº de filas)
        expect(r.Bea[wkBea].count).toBe(2);
        expect(r.Bea[wkBea].total).toBe(200);
    });
});

describe('configuracion del curso', () => {
    it('por defecto, courseStart es 2025-12-27', () => {
        expect(KPIEngine.getCourseStart()).toBe('2025-12-27');
    });

    it('setCourseStart actualiza el calculo de semanas', () => {
        const original = KPIEngine.getCourseStart();
        KPIEngine.setCourseStart('2026-01-03');
        expect(KPIEngine.helpers.businessWeek('2026-01-03')).toBe(1);
        expect(KPIEngine.helpers.businessWeek('2026-01-10')).toBe(2);
        KPIEngine.setCourseStart(original);
    });
});
