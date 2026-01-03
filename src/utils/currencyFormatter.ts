/**
 * 格式化台幣營收
 * compact: NT$ 31.0 萬
 * full: NT$ 310,000
 */
export function formatNTRevenue(amount: number, mode: 'compact' | 'full' = 'compact'): string {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return "NT$ --";
    }

    if (mode === 'compact') {
        if (amount >= 10000) {
            const val = amount / 10000;
            // toFixed(1) 會自動四捨五入: 30.95 -> 31.0
            return `NT$ ${val.toFixed(1)} 萬`;
        } else {
            return `NT$ ${amount.toLocaleString('en-US')}`;
        }
    } else {
        return `NT$ ${amount.toLocaleString('en-US')}`;
    }
}

/**
 * 格式化為軸座標使用的短格式 (Axis Tick)
 * 例如: 20000 -> "NT$ 2萬"
 * 2000 -> "NT$ 2k"
 */
export function formatCompactNT(amount: number): string {
    if (amount === 0) return "0";
    if (Math.abs(amount) >= 10000) {
        // 大於一萬，顯示 "NT$ X萬"
        // ex: 40000 -> 4, 45000 -> 4.5
        const val = amount / 10000;
        // 如果是整數就不要小數點，否則留一位
        const str = Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1);
        return `NT$ ${str}萬`;
    } else if (Math.abs(amount) >= 1000) {
        return `NT$ ${(amount / 1000).toFixed(1)}k`;
    }
    return `NT$ ${amount}`;
}
